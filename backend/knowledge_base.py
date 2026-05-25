from __future__ import annotations

import uuid
from datetime import datetime

from sqlmodel import Field, Session, SQLModel, select


class KnowledgeBase(SQLModel, table=True):
    __tablename__ = "knowledge_bases"

    knowledge_base_id: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    name: str
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class KnowledgeBaseRegistry:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list(self, user_id: str) -> list[KnowledgeBase]:
        statement = (
            select(KnowledgeBase)
            .where(KnowledgeBase.user_id == user_id)
            .order_by(KnowledgeBase.updated_at.desc())
        )
        return list(self._session.exec(statement).all())

    def get(self, knowledge_base_id: str, user_id: str) -> KnowledgeBase | None:
        record = self._session.get(KnowledgeBase, knowledge_base_id)
        if record and record.user_id == user_id:
            return record
        return None

    def create(self, user_id: str, name: str) -> KnowledgeBase:
        now = datetime.utcnow().isoformat()
        record = KnowledgeBase(
            knowledge_base_id=str(uuid.uuid4()),
            user_id=user_id,
            name=name.strip() or "未命名知识库",
            created_at=now,
            updated_at=now,
        )
        self._session.add(record)
        self._session.commit()
        self._session.refresh(record)
        return record

    def ensure_default(self, user_id: str) -> KnowledgeBase:
        existing = self.list(user_id)
        if existing:
            return existing[0]
        return self.create(user_id, "我的知识库")

    def rename(self, knowledge_base_id: str, user_id: str, name: str) -> KnowledgeBase | None:
        record = self.get(knowledge_base_id, user_id)
        if record is None:
            return None
        record.name = name.strip() or record.name
        record.updated_at = datetime.utcnow().isoformat()
        self._session.add(record)
        self._session.commit()
        self._session.refresh(record)
        return record

    def remove(self, knowledge_base_id: str, user_id: str) -> bool:
        record = self.get(knowledge_base_id, user_id)
        if record is None:
            return False
        self._session.delete(record)
        self._session.commit()
        return True
