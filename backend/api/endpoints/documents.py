from pathlib import Path
from typing import Annotated

from bot.memory.document_registry import DocumentRegistry
from bot.memory.vector_database.id_generator import generate_id
from core.config import settings
from document_summary import generate_document_summary, normalize_document_summary
from document_loader.loader import DirectoryLoader, load_file_text
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from helpers.log import get_logger
from memory_builder import split_chunks
from schemas.documents import DocumentContentResponse, DocumentInfo, DocumentListResponse, DocumentUploadResponse

from api.deps import CurrentUserDep, LamaCppClientDep, SessionDep, VectorDatabaseDep

logger = get_logger(__name__)

router = APIRouter()


def get_document_record_by_filename(session: SessionDep, filename: str, user_id: str):
    registry = DocumentRegistry(session)
    record = registry.get_by_filename(filename, user_id=user_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Document '{filename}' not found.")
    return record


def get_source_file_path(record) -> Path:
    file_path = Path(record.source) if record.source else settings.DOCS_PATH / record.filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"Source file for '{record.filename}' not found.")
    return file_path


@router.post(
    "/documents",
    response_model=DocumentUploadResponse,
    status_code=201,
    responses={
        400: {"description": "Bad Request - Invalid file type."},
        409: {"description": "Conflict - Document with the same filename already exists."},
    },
)
async def upload_document(
    file: Annotated[UploadFile, File(...)],
    index: VectorDatabaseDep,
    session: SessionDep,
    current_user: CurrentUserDep,
    llm_client: LamaCppClientDep,
):
    """
    Upload a document to the knowledge base.

    Args:
        file: The file to upload. Must have an allowed extension.
        index: Vector database dependency for storing document chunks.
        session: Database session dependency for the document registry.

    Returns:
        DocumentUploadResponse containing the generated document_id and filename.

    Raises:
        HTTPException: 400 if file type is not supported.
        HTTPException: 409 if a document with the same filename already exists.
    """

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in settings.ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{suffix}' not supported. Allowed: {sorted(settings.ALLOWED_UPLOAD_EXTENSIONS)}",
        )

    registry = DocumentRegistry(session)
    existing = registry.get_by_filename(file.filename or "", user_id=current_user.user_id)
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Document '{file.filename}' already exists.",
        )

    dest_dir = settings.DOCS_PATH / current_user.user_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    file_path = dest_dir / file.filename
    document_id = generate_id(f"{current_user.user_id}:{file_path}")

    content = await file.read()
    file_path.write_bytes(content)

    # Use DirectoryLoader to load the file content (same as build_memory_index)
    # This ensures consistent content processing and version hashing
    # TODO: refactor to avoid writing to disk and re-reading, but this is simpler for now and leverages existing loader
    #  logic
    try:
        loader = DirectoryLoader(
            path=file_path.parent,
            glob=file_path.name,
            show_progress=False,
        )
        loaded_docs = loader.load()

        if not loaded_docs:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to load document '{file.filename}'. The file may be corrupted or in an"
                f" unsupported format.",
            )

        # Extract the loaded document (should be exactly one)
        document = loaded_docs[0]
        page_content = document.page_content
        if not page_content.strip():
            raise HTTPException(
                status_code=400,
                detail=f"No extractable text found in '{file.filename}'. The PDF may be scanned or image-only.",
            )

    except Exception as exc:
        logger.warning(
            f"Failed to load uploaded file '{file.filename}': {exc}",
        )
        # Clean up the saved file on error
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(
            status_code=400,
            detail=f"Failed to process document '{file.filename}': {str(exc)}",
        )

    version_hash = generate_id(page_content)

    # Update document metadata with our tracking fields
    document.metadata.update(
        {
            "source": str(file_path),
            "document_id": document_id,
            "user_id": current_user.user_id,
            "filename": file.filename,
            "content_type": file.content_type,
            "size": len(content),
            "version_hash": version_hash,
        }
    )

    # Split the document into chunks for vector indexing
    chunks = split_chunks([document], chunk_size=settings.CHUNK_SIZE, chunk_overlap=settings.CHUNK_OVERLAP)

    # Inject document_id + version_hash into every chunk's metadata
    for idx, chunk in enumerate(chunks):
        chunk.metadata["document_id"] = document_id
        chunk.metadata["user_id"] = current_user.user_id
        chunk.metadata["version_hash"] = version_hash
        chunk.metadata["chunk_index"] = idx

    num_chunks = len(chunks)
    logger.info(f"Number of generated chunks: {num_chunks}")
    logger.info("Adding document chunks to the vector database index...")

    chunk_ids = index.from_chunks(chunks)
    try:
        summary = await generate_document_summary(llm_client, page_content)
    except Exception as exc:
        logger.warning("Failed to generate summary for '%s': %s", file.filename, exc)
        summary = normalize_document_summary(None)

    registry.upsert(
        document_id,
        user_id=current_user.user_id,
        source=str(file_path),
        filename=file.filename or document_id,
        size=len(content),
        content_type=file.content_type or "application/octet-stream",
        version_hash=version_hash,
        summary=summary,
        chunk_ids=chunk_ids,
    )

    logger.info("Memory Index has been updated successfully!")

    return DocumentUploadResponse(
        document_id=document_id,
        filename=file.filename or document_id,
        summary=summary,
    )


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents(session: SessionDep, current_user: CurrentUserDep):
    """
    List all uploaded documents.

    Reads from the persistent DocumentRegistry (registry.db) so the list
    survives backend restarts and stays in sync with what's actually in
    the vector store.
    """
    registry = DocumentRegistry(session)
    documents = [
        DocumentInfo(
            document_id=record.document_id,
            filename=record.filename,
            size=record.size,
            content_type=record.content_type or "application/octet-stream",
            version_hash=record.version_hash,
            summary=record.summary,
        )
        for record in registry.get_all(user_id=current_user.user_id)
    ]
    return DocumentListResponse(documents=documents)


@router.get("/documents/content", response_model=DocumentContentResponse)
async def get_document_content(
    session: SessionDep,
    current_user: CurrentUserDep,
    filename: str = Query(..., min_length=1),
):
    """
    Return the stored source text for a document by filename.

    The filename is resolved through the document registry instead of trusting
    a client-provided path, so callers cannot read arbitrary files.
    """
    record = get_document_record_by_filename(session, filename, current_user.user_id)
    file_path = get_source_file_path(record)

    if file_path.suffix.lower() == ".pdf":
        content = load_file_text(file_path)
    else:
        try:
            content = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            content = file_path.read_text(encoding="utf-8", errors="replace")

    return DocumentContentResponse(
        document_id=record.document_id,
        filename=record.filename,
        content=content,
    )


@router.post("/documents/{document_id}/summary", response_model=DocumentInfo)
async def generate_summary_for_document(
    document_id: str,
    session: SessionDep,
    current_user: CurrentUserDep,
    llm_client: LamaCppClientDep,
):
    registry = DocumentRegistry(session)
    record = registry.get(document_id, user_id=current_user.user_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found.")

    file_path = get_source_file_path(record)
    if file_path.suffix.lower() == ".pdf":
        content = load_file_text(file_path)
    else:
        try:
            content = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            content = file_path.read_text(encoding="utf-8", errors="replace")

    summary = await generate_document_summary(llm_client, content)
    registry.upsert(
        record.document_id,
        user_id=record.user_id,
        source=record.source,
        filename=record.filename,
        size=record.size,
        content_type=record.content_type,
        version_hash=record.version_hash,
        summary=summary,
        chunk_ids=record.chunk_ids,
    )

    return DocumentInfo(
        document_id=record.document_id,
        filename=record.filename,
        size=record.size,
        content_type=record.content_type or "application/octet-stream",
        version_hash=record.version_hash,
        summary=summary,
    )


@router.get("/documents/file")
async def get_document_file(
    session: SessionDep,
    current_user: CurrentUserDep,
    filename: str = Query(..., min_length=1),
):
    """
    Return the original stored document as an inline file preview.
    """
    record = get_document_record_by_filename(session, filename, current_user.user_id)
    file_path = get_source_file_path(record)
    media_type = record.content_type or "application/octet-stream"
    if file_path.suffix.lower() == ".pdf":
        media_type = "application/pdf"
    elif file_path.suffix.lower() == ".md":
        media_type = "text/markdown; charset=utf-8"

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=record.filename,
        content_disposition_type="inline",
    )


@router.delete(
    "/documents/{document_id}",
    status_code=204,
    responses={404: {"description": "Not Found - Document with the given ID does not exist."}},
)
async def delete_document(
    document_id: str,
    index: VectorDatabaseDep,
    session: SessionDep,
    current_user: CurrentUserDep,
):
    """
    Delete the uploaded document from the knowledge base.

    Removes the document's metadata, associated file from disk, and its
    chunks from the vector database index.

    Args:
        document_id: The unique identifier of the document to delete.
        index: Vector database dependency for removing document chunks.
        session: Database session dependency for the document registry.

    Raises:
        HTTPException: 404 if the document with the given ID is not found.
    """
    registry = DocumentRegistry(session)
    entry = registry.get(document_id, user_id=current_user.user_id)

    if entry is None:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found.")

    index.delete_chunks_by_document_id(document_id, chunk_ids=entry.chunk_ids or None)
    registry.remove(document_id)

    file_path = Path(entry.source) if entry.source else settings.DOCS_PATH / current_user.user_id / entry.filename
    if file_path.exists():
        file_path.unlink()
