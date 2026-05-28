import time

from bot.conversation.chat_history import ChatHistory
from bot.conversation.conversation_handler import (
    answer,
    answer_with_context,
    extract_content_after_reasoning,
    refine_question,
)
from bot.conversation.ctx_strategy import get_ctx_synthesis_strategy
from core.config import settings
from fastapi import WebSocket
from helpers.log import get_logger
from helpers.prettier import prettify_source
from retrieval import hybrid_search_with_rerank
from schemas.chat import ChatRequest
from auth import User

from api.deps import LamaCppClientDep, VectorDatabaseDep

logger = get_logger(__name__)


OVERVIEW_QUERY_TERMS = (
    "这篇文章",
    "这篇论文",
    "讲了什么",
    "主要内容",
    "总结",
    "概述",
    "summary",
    "summarize",
    "overview",
    "what is this paper about",
    "what is the paper about",
)


def is_overview_query(text: str) -> bool:
    normalized = text.lower()
    return any(term in normalized for term in OVERVIEW_QUERY_TERMS)


def source_from_chunk(chunk, score: float = 1.0) -> dict:
    metadata = chunk.metadata or {}
    return {
        "score": score,
        "document": metadata.get("source"),
        "document_id": metadata.get("document_id"),
        "page": metadata.get("page"),
        "content_preview": chunk.page_content,
    }


# TODO: https://github.com/umbertogriffo/rag-chatbot/pull/10#discussion_r2936567672
async def stream_chat_response(
    websocket: WebSocket, llm_client: LamaCppClientDep, query: ChatRequest, chat_history: ChatHistory
):
    """
    Helper function to stream chat responses token by token.
     Args:
        websocket (WebSocket): The WebSocket connection to send responses through.
        llm_client (LamaCppClientDep): The LLM client dependency for generating responses.
        query (ChatRequest): The chat request containing the user's query.
        chat_history (ChatHistory): The user's chat history for maintaining conversation context.
    """
    try:
        start_time = time.time()

        full_response = ""
        stream = await answer(
            llm=llm_client,
            question=query.text,
            chat_history=chat_history,
            max_new_tokens=settings.MAX_NEW_TOKENS,
        )
        for output in stream:
            token = llm_client.parse_token(output)
            if token:
                full_response += token
                await websocket.send_text(token)

        if llm_client.model_settings.reasoning:
            final_answer = extract_content_after_reasoning(full_response, llm_client.model_settings.reasoning_stop_tag)
            if final_answer == "":
                final_answer = "I didn't provide the answer; perhaps I can try again."
        else:
            final_answer = full_response

        chat_history.append(f"question: {query.text}, answer: {final_answer}")
        logger.debug(f"Updated chat history: {chat_history}")

        took = time.time() - start_time
        logger.info(f"\n--- Took {took:.2f} seconds ---")
    except Exception as exc:
        logger.exception("Error during streaming: %s", exc)
        await websocket.send_text("Error during streaming.")


# TODO: https://github.com/umbertogriffo/rag-chatbot/pull/10#discussion_r2936567672
async def stream_rag_response(
    websocket: WebSocket,
    llm_client: LamaCppClientDep,
    query: ChatRequest,
    chat_history: ChatHistory,
    index: VectorDatabaseDep,
    current_user: User,
):
    """
    Helper function to stream RAG responses token by token.
     Args:
        websocket (WebSocket): The WebSocket connection to send responses through.
        llm_client (LamaCppClientDep): The LLM client dependency for generating responses.
        query (ChatRequest): The chat request containing the user's query.
        chat_history (ChatHistory): The user's chat history for maintaining conversation context.
        index (VectorDatabaseDep): The vector database dependency for retrieval.
    """
    try:
        start_time = time.time()
        ctx_synthesis_strategy = get_ctx_synthesis_strategy(settings.SYNTHESIS_STRATEGY, llm=llm_client)

        retrieval_response = ""
        full_response = ""

        refined_user_input = await refine_question(
            llm_client, query.text, chat_history=chat_history, max_new_tokens=settings.MAX_NEW_TOKENS
        )

        # 若前端勾选了文档，则用 document_id 过滤检索范围（None / 空列表 = 查全库）
        retrieval_filter: dict | None = {"user_id": current_user.user_id}
        if query.document_ids:
            ids = list(query.document_ids)
            retrieval_filter = (
                {"$and": [{"user_id": current_user.user_id}, {"document_id": ids[0]}]}
                if len(ids) == 1
                else {"$and": [{"user_id": current_user.user_id}, {"document_id": {"$in": ids}}]}
            )

        retrieved_contents, sources = hybrid_search_with_rerank(
            index=index,
            query=refined_user_input,
            where=retrieval_filter,
            initial_k=settings.INITIAL_RETRIEVAL_K,
            top_k=settings.RERANK_TOP_K,
            keyword_candidate_limit=settings.KEYWORD_CANDIDATE_LIMIT,
        )

        if retrieval_filter and query.document_ids and is_overview_query(query.text):
            pinned_chunks = []
            for document_id in query.document_ids:
                pinned_chunks.extend(
                    index.get_chunks_by_document_id(document_id, limit=3, user_id=current_user.user_id)
                )

            seen = {chunk.page_content for chunk in retrieved_contents}
            for chunk in pinned_chunks:
                if chunk.page_content in seen:
                    continue
                retrieved_contents.insert(0, chunk)
                sources.insert(0, source_from_chunk(chunk))
                seen.add(chunk.page_content)
            retrieved_contents = retrieved_contents[: settings.RERANK_TOP_K]
            sources = sources[: settings.RERANK_TOP_K]

        if retrieved_contents:
            retrieval_response += "Here are the retrieved text chunks with a content preview: \n\n"

            for source in sources:
                retrieval_response += prettify_source(source)
                retrieval_response += "\n\n"
        else:
            retrieval_response += "I did not detect any pertinent chunk of text from the documents. \n\n"

        await websocket.send_text(retrieval_response)
        await websocket.send_text("-" * 20 + "\n\n")
        await websocket.send_text("**Answer:** \n\n")

        streamer, _ = await answer_with_context(
            llm_client,
            ctx_synthesis_strategy,
            query.text,
            chat_history,
            retrieved_contents,
            settings.MAX_NEW_TOKENS,
        )

        for output in streamer:
            token = llm_client.parse_token(output)
            if token:
                full_response += token
                await websocket.send_text(token)

        if llm_client.model_settings.reasoning:
            final_answer = extract_content_after_reasoning(full_response, llm_client.model_settings.reasoning_stop_tag)
            if final_answer == "":
                final_answer = "I wasn't able to provide the answer; Do you want me to try again?"
        else:
            final_answer = full_response

        chat_history.append(f"question: {query.text}, answer: {final_answer}")

        took = time.time() - start_time
        logger.info(f"\n--- Took {took:.2f} seconds ---")

    except Exception as exc:
        logger.exception("Error during RAG streaming: %s", exc)
        await websocket.send_text("Error during RAG streaming.")
