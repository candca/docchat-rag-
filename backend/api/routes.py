from fastapi import APIRouter

from api.endpoints import auth, chat, chat_stream, documents, health

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="", tags=["auth"])
api_router.include_router(chat.router, prefix="", tags=["chat"])
api_router.include_router(documents.router, prefix="", tags=["documents"])
api_router.include_router(chat_stream.router, prefix="", tags=["chat-stream"])
