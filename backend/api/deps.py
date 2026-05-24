"""
Defines dependencies used by the endpoints.
"""

from typing import Annotated, Any, Generator

import state
from auth import User, parse_token
from bot.conversation.chat_history import ChatHistory
from bot.memory.vector_database.chroma import Chroma
from chat_history import chat_history
from fastapi import Depends, Header, HTTPException, Query, status
from sqlmodel import Session


def get_llm_client() -> Generator[Any, None, None]:
    """
    Dependency to get the LLM client instance.
    """
    yield state.llm_client


def get_chat_history() -> Generator[ChatHistory, None, None]:
    """
    Dependency to get the chat history instance.
    """
    yield chat_history


def get_index() -> Generator[Chroma, None, None]:
    """
    Dependency to get the vector database index instance.
    """
    yield state.index


def get_db_session() -> Generator[Session, None, None]:
    """
    Create a new database session and close the session after the operation has ended.
    """
    with Session(state.engine) as session:
        yield session


def _token_from_header(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def get_current_user(
    session: Annotated[Session, Depends(get_db_session)],
    authorization: Annotated[str | None, Header()] = None,
    token: str | None = Query(default=None),
) -> User:
    auth_token = _token_from_header(authorization) or token
    payload = parse_token(auth_token or "")
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    user = session.get(User, payload["sub"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    return user


def get_current_user_from_ws(session: Session, token: str | None = None) -> User | None:
    payload = parse_token(token or "")
    if not payload:
        return None
    return session.get(User, payload["sub"])


LamaCppClientDep = Annotated[Any, Depends(get_llm_client)]
ChatHistoryDep = Annotated[ChatHistory, Depends(get_chat_history)]
VectorDatabaseDep = Annotated[Chroma, Depends(get_index)]
SessionDep = Annotated[Session, Depends(get_db_session)]
CurrentUserDep = Annotated[User, Depends(get_current_user)]
