from pydantic import BaseModel, Field


class SectionSummary(BaseModel):
    title: str = ""
    summary: str = ""


class DocumentSummary(BaseModel):
    one_sentence: str = ""
    detailed: str = ""
    section_summaries: list[SectionSummary] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    outline: list[str] = Field(default_factory=list)


class DocumentInfo(BaseModel):
    document_id: str
    filename: str
    size: int
    content_type: str
    version_hash: str = ""
    summary: DocumentSummary | None = None


class DocumentUploadResponse(BaseModel):
    document_id: str
    filename: str
    summary: DocumentSummary | None = None


class DocumentListResponse(BaseModel):
    documents: list[DocumentInfo]


class DocumentContentResponse(BaseModel):
    document_id: str
    filename: str
    content: str
