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
    summary_origin: str = ""


class DocumentInfo(BaseModel):
    document_id: str
    knowledge_base_id: str = "default"
    filename: str
    size: int
    content_type: str
    version_hash: str = ""
    parse_status: str = "ready"
    summary: DocumentSummary | None = None


class DocumentUploadResponse(BaseModel):
    document_id: str
    knowledge_base_id: str = "default"
    filename: str
    parse_status: str = "ready"
    summary: DocumentSummary | None = None


class DocumentListResponse(BaseModel):
    documents: list[DocumentInfo]


class DocumentContentResponse(BaseModel):
    document_id: str
    filename: str
    content: str


class KnowledgeBaseInfo(BaseModel):
    knowledge_base_id: str
    name: str
    created_at: str
    updated_at: str
    document_count: int = 0


class KnowledgeBaseListResponse(BaseModel):
    knowledge_bases: list[KnowledgeBaseInfo]


class KnowledgeBaseCreateRequest(BaseModel):
    name: str


class KnowledgeBaseUpdateRequest(BaseModel):
    name: str
