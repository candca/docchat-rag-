from fastapi import APIRouter, Response, WebSocket, WebSocketDisconnect

from api.deps import CurrentUserDep, LamaCppClientDep, SessionDep, VectorDatabaseDep, get_current_user_from_ws
from api.services.chat_stream import stream_chat_response, stream_rag_response
from bot.conversation.chat_history import ChatHistory
from chat_history import chat_history_manager
from core.config import settings
from helpers.log import get_logger
from schemas.chat import ChatRequest

logger = get_logger(__name__)

router = APIRouter()


@router.delete(
    path="/chat/history",
    status_code=204,
)
async def clear_chat_history(current_user: CurrentUserDep):
    """Clear the server-side chat history for the current user only."""
    chat_history_manager.clear(current_user.user_id)
    return Response(status_code=204)


@router.websocket(
    path="/chat/stream",
)
async def chat_stream(
    websocket: WebSocket,
    llm_client: LamaCppClientDep,
    index: VectorDatabaseDep,
    session: SessionDep,
):
    """WebSocket endpoint for streaming chat responses token by token."""
    await websocket.accept()
    current_user = get_current_user_from_ws(session, websocket.query_params.get("token"))
    if current_user is None:
        await websocket.send_text("Authentication required.")
        await websocket.close(code=1008)
        return
    logger.info("WebSocket connection accepted for user_id=%s", current_user.user_id)
    user_chat_history = chat_history_manager.get(current_user.user_id)
    try:
        while True:
            data = await websocket.receive_json()
            logger.info(f"Received data: {data}")
            query = ChatRequest(**data)
            # Frontend may pass its own history; if so use an ephemeral
            # ChatHistory so we don't mutate the user's server-side one.
            if query.chat_history is not None:
                effective_chat_history = ChatHistory(
                    messages=query.chat_history[-settings.CHAT_HISTORY_LENGTH :],
                    total_length=settings.CHAT_HISTORY_LENGTH,
                )
            else:
                effective_chat_history = user_chat_history
            if query.rag:
                await stream_rag_response(websocket, llm_client, query, effective_chat_history, index, current_user)
            else:
                await stream_chat_response(websocket, llm_client, query, effective_chat_history)
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected (user_id=%s)", current_user.user_id)
    except Exception as e:
        logger.exception(f"Unexpected error in WebSocket handler: {e}")
        raise
