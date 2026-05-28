from pathlib import Path
from typing import Annotated

from bot.memory.document_registry import DocumentRegistry
from bot.memory.vector_database.id_generator import generate_id
from core.config import settings
from document_summary import generate_document_summary, normalize_document_summary
from document_loader.loader import DirectoryLoader, load_file_text
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from helpers.log import get_logger
from knowledge_base import KnowledgeBaseRegistry
from memory_builder import infer_chunk_page, split_chunks
from pdf_preview import get_pdf_page_preview, render_pdf_page_png
from schemas.documents import (
    DocumentContentResponse,
    DocumentInfo,
    DocumentListResponse,
    DocumentUploadResponse,
    KnowledgeBaseCreateRequest,
    KnowledgeBaseInfo,
    KnowledgeBaseListResponse,
    KnowledgeBaseUpdateRequest,
    PdfPagePreviewResponse,
)

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
    candidates = []
    if record.source:
        candidates.append(Path(record.source))
    candidates.extend(
        [
            settings.DOCS_PATH / record.filename,
            settings.DOCS_PATH / record.user_id / record.filename,
            settings.DOCS_PATH / record.user_id / record.knowledge_base_id / record.filename,
        ]
    )

    for file_path in candidates:
        if file_path.exists() and file_path.is_file():
            return file_path

    matches = [
        path
        for path in settings.DOCS_PATH.rglob(record.filename)
        if path.is_file() and path.name == record.filename
    ]
    if matches:
        return matches[0]

    raise HTTPException(status_code=404, detail=f"Source file for '{record.filename}' not found.")


def document_info_from_record(record) -> DocumentInfo:
    return DocumentInfo(
        document_id=record.document_id,
        knowledge_base_id=record.knowledge_base_id,
        filename=record.filename,
        size=record.size,
        content_type=record.content_type or "application/octet-stream",
        version_hash=record.version_hash,
        parse_status=record.parse_status,
        summary=normalize_document_summary(record.summary),
    )


def require_knowledge_base(session: SessionDep, knowledge_base_id: str, user_id: str):
    registry = KnowledgeBaseRegistry(session)
    record = registry.get(knowledge_base_id, user_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Knowledge base '{knowledge_base_id}' not found.")
    return record


def load_source_document(file_path: Path, filename: str):
    loader = DirectoryLoader(
        path=file_path.parent,
        glob=file_path.name,
        show_progress=False,
    )
    loaded_docs = loader.load()
    if not loaded_docs:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to load document '{filename}'. The file may be corrupted or in an unsupported format.",
        )
    document = loaded_docs[0]
    if not document.page_content.strip():
        raise HTTPException(
            status_code=400,
            detail=f"No extractable text found in '{filename}'. The PDF may be scanned or image-only.",
        )
    return document


async def index_document(record, index: VectorDatabaseDep, llm_client: LamaCppClientDep):
    file_path = get_source_file_path(record)
    document = load_source_document(file_path, record.filename)
    page_content = document.page_content
    version_hash = generate_id(page_content)
    document.metadata.update(
        {
            "source": str(file_path),
            "document_id": record.document_id,
            "knowledge_base_id": record.knowledge_base_id,
            "user_id": record.user_id,
            "filename": record.filename,
            "content_type": record.content_type,
            "size": record.size,
            "version_hash": version_hash,
        }
    )
    chunks = split_chunks([document], chunk_size=settings.CHUNK_SIZE, chunk_overlap=settings.CHUNK_OVERLAP)
    for idx, chunk in enumerate(chunks):
        chunk.metadata["document_id"] = record.document_id
        chunk.metadata["knowledge_base_id"] = record.knowledge_base_id
        chunk.metadata["user_id"] = record.user_id
        chunk.metadata["version_hash"] = version_hash
        chunk.metadata["chunk_index"] = idx
        if file_path.suffix.lower() == ".pdf":
            page = infer_chunk_page(chunk.page_content, page_content)
            if page is not None:
                chunk.metadata["page"] = page

    if record.chunk_ids:
        index.delete_chunks_by_document_id(record.document_id, chunk_ids=record.chunk_ids)
    chunk_ids = index.from_chunks(chunks)
    try:
        summary = await generate_document_summary(llm_client, page_content)
    except Exception as exc:
        logger.warning("Failed to generate summary for '%s': %s", record.filename, exc)
        summary = normalize_document_summary(None)
    return version_hash, chunk_ids, summary


@router.get("/knowledge-bases", response_model=KnowledgeBaseListResponse)
async def list_knowledge_bases(session: SessionDep, current_user: CurrentUserDep):
    kb_registry = KnowledgeBaseRegistry(session)
    document_registry = DocumentRegistry(session)
    default_kb = kb_registry.ensure_default(current_user.user_id)
    for legacy_record in document_registry.get_all(current_user.user_id, "default"):
        document_registry.upsert(
            legacy_record.document_id,
            user_id=legacy_record.user_id,
            knowledge_base_id=default_kb.knowledge_base_id,
            source=legacy_record.source,
            filename=legacy_record.filename,
            size=legacy_record.size,
            content_type=legacy_record.content_type,
            version_hash=legacy_record.version_hash,
            parse_status=legacy_record.parse_status,
            summary=legacy_record.summary,
            chunk_ids=legacy_record.chunk_ids,
        )
    knowledge_bases = []
    for record in kb_registry.list(current_user.user_id):
        knowledge_bases.append(
            KnowledgeBaseInfo(
                knowledge_base_id=record.knowledge_base_id,
                name=record.name,
                created_at=record.created_at,
                updated_at=record.updated_at,
                document_count=len(document_registry.get_all(current_user.user_id, record.knowledge_base_id)),
            )
        )
    return KnowledgeBaseListResponse(knowledge_bases=knowledge_bases)


@router.post("/knowledge-bases", response_model=KnowledgeBaseInfo, status_code=201)
async def create_knowledge_base(
    payload: KnowledgeBaseCreateRequest,
    session: SessionDep,
    current_user: CurrentUserDep,
):
    record = KnowledgeBaseRegistry(session).create(current_user.user_id, payload.name)
    return KnowledgeBaseInfo(
        knowledge_base_id=record.knowledge_base_id,
        name=record.name,
        created_at=record.created_at,
        updated_at=record.updated_at,
        document_count=0,
    )


@router.patch("/knowledge-bases/{knowledge_base_id}", response_model=KnowledgeBaseInfo)
async def rename_knowledge_base(
    knowledge_base_id: str,
    payload: KnowledgeBaseUpdateRequest,
    session: SessionDep,
    current_user: CurrentUserDep,
):
    record = KnowledgeBaseRegistry(session).rename(knowledge_base_id, current_user.user_id, payload.name)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Knowledge base '{knowledge_base_id}' not found.")
    count = len(DocumentRegistry(session).get_all(current_user.user_id, knowledge_base_id))
    return KnowledgeBaseInfo(
        knowledge_base_id=record.knowledge_base_id,
        name=record.name,
        created_at=record.created_at,
        updated_at=record.updated_at,
        document_count=count,
    )


@router.delete("/knowledge-bases/{knowledge_base_id}", status_code=204)
async def delete_knowledge_base(
    knowledge_base_id: str,
    index: VectorDatabaseDep,
    session: SessionDep,
    current_user: CurrentUserDep,
):
    require_knowledge_base(session, knowledge_base_id, current_user.user_id)
    document_registry = DocumentRegistry(session)
    for record in document_registry.get_all(current_user.user_id, knowledge_base_id):
        index.delete_chunks_by_document_id(record.document_id, chunk_ids=record.chunk_ids or None)
        file_path = (
            Path(record.source)
            if record.source
            else settings.DOCS_PATH / current_user.user_id / record.knowledge_base_id / record.filename
        )
        if file_path.exists():
            file_path.unlink()
        document_registry.remove(record.document_id)
    KnowledgeBaseRegistry(session).remove(knowledge_base_id, current_user.user_id)


@router.post("/knowledge-bases/{knowledge_base_id}/rebuild-index", response_model=DocumentListResponse)
async def rebuild_knowledge_base_index(
    knowledge_base_id: str,
    index: VectorDatabaseDep,
    session: SessionDep,
    current_user: CurrentUserDep,
    llm_client: LamaCppClientDep,
):
    require_knowledge_base(session, knowledge_base_id, current_user.user_id)
    registry = DocumentRegistry(session)
    rebuilt: list[DocumentInfo] = []
    for record in registry.get_all(current_user.user_id, knowledge_base_id):
        try:
            version_hash, chunk_ids, summary = await index_document(record, index, llm_client)
            registry.upsert(
                record.document_id,
                user_id=record.user_id,
                knowledge_base_id=record.knowledge_base_id,
                source=record.source,
                filename=record.filename,
                size=record.size,
                content_type=record.content_type,
                version_hash=version_hash,
                parse_status="ready",
                summary=summary,
                chunk_ids=chunk_ids,
            )
        except Exception as exc:
            logger.exception("Failed to rebuild index for '%s': %s", record.filename, exc)
            registry.upsert(
                record.document_id,
                user_id=record.user_id,
                knowledge_base_id=record.knowledge_base_id,
                source=record.source,
                filename=record.filename,
                size=record.size,
                content_type=record.content_type,
                version_hash=record.version_hash,
                parse_status="error",
                summary=record.summary,
                chunk_ids=record.chunk_ids,
            )
        updated = registry.get(record.document_id, user_id=current_user.user_id)
        if updated is not None:
            rebuilt.append(document_info_from_record(updated))
    return DocumentListResponse(documents=rebuilt)


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
    knowledge_base_id: str | None = Query(default=None),
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

    kb_registry = KnowledgeBaseRegistry(session)
    knowledge_base = (
        require_knowledge_base(session, knowledge_base_id, current_user.user_id)
        if knowledge_base_id
        else kb_registry.ensure_default(current_user.user_id)
    )

    registry = DocumentRegistry(session)
    existing = registry.get_by_filename(
        file.filename or "",
        user_id=current_user.user_id,
        knowledge_base_id=knowledge_base.knowledge_base_id,
    )
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Document '{file.filename}' already exists.",
        )

    dest_dir = settings.DOCS_PATH / current_user.user_id / knowledge_base.knowledge_base_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    file_path = dest_dir / file.filename
    document_id = generate_id(f"{current_user.user_id}:{knowledge_base.knowledge_base_id}:{file_path}")

    content = await file.read()
    file_path.write_bytes(content)

    # Use DirectoryLoader to load the file content (same as build_memory_index)
    # This ensures consistent content processing and version hashing
    # TODO: refactor to avoid writing to disk and re-reading, but this is simpler for now and leverages existing loader
    #  logic
    try:
        document = load_source_document(file_path, file.filename or document_id)
        page_content = document.page_content

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
            "knowledge_base_id": knowledge_base.knowledge_base_id,
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
        chunk.metadata["knowledge_base_id"] = knowledge_base.knowledge_base_id
        chunk.metadata["user_id"] = current_user.user_id
        chunk.metadata["version_hash"] = version_hash
        chunk.metadata["chunk_index"] = idx
        if file_path.suffix.lower() == ".pdf":
            page = infer_chunk_page(chunk.page_content, page_content)
            if page is not None:
                chunk.metadata["page"] = page

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
        knowledge_base_id=knowledge_base.knowledge_base_id,
        source=str(file_path),
        filename=file.filename or document_id,
        size=len(content),
        content_type=file.content_type or "application/octet-stream",
        version_hash=version_hash,
        parse_status="ready",
        summary=summary,
        chunk_ids=chunk_ids,
    )

    logger.info("Memory Index has been updated successfully!")

    return DocumentUploadResponse(
        document_id=document_id,
        knowledge_base_id=knowledge_base.knowledge_base_id,
        filename=file.filename or document_id,
        parse_status="ready",
        summary=summary,
    )


@router.get("/documents", response_model=DocumentListResponse)
async def list_documents(
    session: SessionDep,
    current_user: CurrentUserDep,
    knowledge_base_id: str | None = Query(default=None),
):
    """
    List all uploaded documents.

    Reads from the persistent DocumentRegistry (registry.db) so the list
    survives backend restarts and stays in sync with what's actually in
    the vector store.
    """
    registry = DocumentRegistry(session)
    if knowledge_base_id is not None:
        require_knowledge_base(session, knowledge_base_id, current_user.user_id)
    documents = [document_info_from_record(record) for record in registry.get_all(current_user.user_id, knowledge_base_id)]
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
        knowledge_base_id=record.knowledge_base_id,
        source=record.source,
        filename=record.filename,
        size=record.size,
        content_type=record.content_type,
        version_hash=record.version_hash,
        parse_status=record.parse_status,
        summary=summary,
        chunk_ids=record.chunk_ids,
    )

    record.summary = summary
    return document_info_from_record(record)


@router.post("/documents/{document_id}/rebuild-index", response_model=DocumentInfo)
async def rebuild_document_index(
    document_id: str,
    index: VectorDatabaseDep,
    session: SessionDep,
    current_user: CurrentUserDep,
    llm_client: LamaCppClientDep,
):
    registry = DocumentRegistry(session)
    record = registry.get(document_id, user_id=current_user.user_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found.")

    try:
        version_hash, chunk_ids, summary = await index_document(record, index, llm_client)
        registry.upsert(
            record.document_id,
            user_id=record.user_id,
            knowledge_base_id=record.knowledge_base_id,
            source=record.source,
            filename=record.filename,
            size=record.size,
            content_type=record.content_type,
            version_hash=version_hash,
            parse_status="ready",
            summary=summary,
            chunk_ids=chunk_ids,
        )
    except Exception as exc:
        logger.exception("Failed to rebuild index for '%s': %s", record.filename, exc)
        registry.upsert(
            record.document_id,
            user_id=record.user_id,
            knowledge_base_id=record.knowledge_base_id,
            source=record.source,
            filename=record.filename,
            size=record.size,
            content_type=record.content_type,
            version_hash=record.version_hash,
            parse_status="error",
            summary=record.summary,
            chunk_ids=record.chunk_ids,
        )
        raise HTTPException(status_code=400, detail=f"Failed to rebuild index: {exc}")

    updated = registry.get(document_id, user_id=current_user.user_id)
    return document_info_from_record(updated)


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


@router.get("/documents/pdf-page", response_model=PdfPagePreviewResponse)
async def get_pdf_page_preview_endpoint(
    session: SessionDep,
    current_user: CurrentUserDep,
    filename: str = Query(..., min_length=1),
    page: int | None = Query(default=None, ge=1),
    snippet: str | None = Query(default=None),
):
    record = get_document_record_by_filename(session, filename, current_user.user_id)
    file_path = get_source_file_path(record)
    if file_path.suffix.lower() != ".pdf":
        raise HTTPException(status_code=400, detail=f"Document '{record.filename}' is not a PDF.")

    try:
        preview = get_pdf_page_preview(file_path, page, snippet=snippet)
    except Exception as exc:
        logger.warning("Failed to build PDF page preview for '%s': %s", record.filename, exc)
        raise HTTPException(status_code=400, detail=f"Failed to build PDF page preview: {exc}") from exc

    return PdfPagePreviewResponse(
        document_id=record.document_id,
        filename=record.filename,
        **preview,
    )


@router.get("/documents/pdf-page-image")
async def get_pdf_page_image(
    session: SessionDep,
    current_user: CurrentUserDep,
    filename: str = Query(..., min_length=1),
    page: int = Query(..., ge=1),
    scale: float = Query(default=2.0, ge=0.5, le=4.0),
):
    record = get_document_record_by_filename(session, filename, current_user.user_id)
    file_path = get_source_file_path(record)
    if file_path.suffix.lower() != ".pdf":
        raise HTTPException(status_code=400, detail=f"Document '{record.filename}' is not a PDF.")

    try:
        image = render_pdf_page_png(file_path, page, scale=scale)
    except Exception as exc:
        logger.warning("Failed to render PDF page for '%s': %s", record.filename, exc)
        raise HTTPException(status_code=400, detail=f"Failed to render PDF page: {exc}") from exc

    return Response(content=image, media_type="image/png")


@router.get("/documents/{document_id}/file")
async def get_document_file_by_id(
    document_id: str,
    session: SessionDep,
    current_user: CurrentUserDep,
):
    record = DocumentRegistry(session).get(document_id, user_id=current_user.user_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found.")
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

    file_path = (
        Path(entry.source)
        if entry.source
        else settings.DOCS_PATH / current_user.user_id / entry.knowledge_base_id / entry.filename
    )
    if file_path.exists():
        file_path.unlink()
