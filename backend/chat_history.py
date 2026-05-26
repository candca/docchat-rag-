"""Per-user chat history container.

Multi-user safety: each authenticated user gets their own `ChatHistory`
instance, keyed by `user_id`. The manager evicts idle entries on a TTL
to avoid memory growth.

Single-process, in-memory. Adequate for the LAN / few-user deployment;
not safe across uvicorn workers > 1.
"""

from __future__ import annotations

import asyncio
import time
from threading import RLock

from bot.conversation.chat_history import ChatHistory
from core.config import settings
from helpers.log import get_logger

logger = get_logger(__name__)


class ChatHistoryManager:
    def __init__(
        self,
        total_length: int,
        ttl_seconds: int = 3600,
        cleanup_interval: int = 300,
    ) -> None:
        self._total_length = total_length
        self._ttl_seconds = ttl_seconds
        self._cleanup_interval = cleanup_interval
        self._histories: dict[str, ChatHistory] = {}
        self._last_active: dict[str, float] = {}
        self._lock = RLock()
        self._cleanup_task: asyncio.Task | None = None

    def get(self, user_id: str) -> ChatHistory:
        with self._lock:
            self._last_active[user_id] = time.time()
            history = self._histories.get(user_id)
            if history is None:
                history = ChatHistory(total_length=self._total_length)
                self._histories[user_id] = history
            return history

    def clear(self, user_id: str) -> None:
        with self._lock:
            self._histories.pop(user_id, None)
            self._last_active.pop(user_id, None)

    def cleanup(self) -> int:
        cutoff = time.time() - self._ttl_seconds
        with self._lock:
            stale = [uid for uid, ts in self._last_active.items() if ts < cutoff]
            for uid in stale:
                self._histories.pop(uid, None)
                self._last_active.pop(uid, None)
        if stale:
            logger.info(
                "ChatHistoryManager evicted %d idle entries (ttl=%ds)",
                len(stale),
                self._ttl_seconds,
            )
        return len(stale)

    async def _cleanup_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(self._cleanup_interval)
                try:
                    self.cleanup()
                except Exception as exc:
                    logger.exception("ChatHistoryManager cleanup failed: %s", exc)
        except asyncio.CancelledError:
            pass

    def start_cleanup_task(self) -> None:
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def stop_cleanup_task(self) -> None:
        if self._cleanup_task is None:
            return
        self._cleanup_task.cancel()
        try:
            await self._cleanup_task
        except asyncio.CancelledError:
            pass
        self._cleanup_task = None


chat_history_manager = ChatHistoryManager(total_length=settings.CHAT_HISTORY_LENGTH)
