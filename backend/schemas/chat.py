from pydantic import BaseModel


class ChatRequest(BaseModel):
    text: str
    rag: bool = False
    reasoning: bool = False
    web_search: bool = False
    # 仅在 rag=True 时生效：限定检索的文档范围。空/缺省则检索全库。
    document_ids: list[str] | None = None
    # 前端持久化的当前会话历史；存在时优先用它作为本轮上下文。
    chat_history: list[str] | None = None
