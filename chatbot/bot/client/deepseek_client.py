import asyncio
from pathlib import Path

from openai import OpenAI

from bot.client.prompt import (
    CTX_PROMPT_TEMPLATE,
    QA_PROMPT_TEMPLATE,
    REFINED_CTX_PROMPT_TEMPLATE,
    REFINED_ANSWER_CONVERSATION_AWARENESS_PROMPT_TEMPLATE,
    REFINED_QUESTION_CONVERSATION_AWARENESS_PROMPT_TEMPLATE,
    SYSTEM_TEMPLATE,
    generate_conversation_awareness_prompt,
    generate_ctx_prompt,
    generate_qa_prompt,
    generate_refined_ctx_prompt,
)


class _DeepSeekModelSettings:
    system_template: str = SYSTEM_TEMPLATE
    reasoning: bool = False
    reasoning_start_tag: str | None = None
    reasoning_stop_tag: str | None = None


class DeepSeekClient:
    """LLM client that calls the DeepSeek API (OpenAI-compatible interface)."""

    def __init__(self, api_key: str, model: str = "deepseek-chat"):
        self.model = model
        self.model_settings = _DeepSeekModelSettings()
        self._client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")

    def close(self):
        pass

    # ------------------------------------------------------------------
    # Non-streaming generation
    # ------------------------------------------------------------------

    def generate_answer(self, prompt: str, max_new_tokens: int = 512) -> str:
        response = self._client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": self.model_settings.system_template},
                {"role": "user", "content": prompt},
            ],
            max_tokens=max_new_tokens,
        )
        return response.choices[0].message.content or ""

    async def async_generate_answer(self, prompt: str, max_new_tokens: int = 512) -> str:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.generate_answer, prompt, max_new_tokens)

    # ------------------------------------------------------------------
    # Streaming generation
    # ------------------------------------------------------------------

    def start_answer_iterator_streamer(self, prompt: str, max_new_tokens: int = 512):
        stream = self._client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": self.model_settings.system_template},
                {"role": "user", "content": prompt},
            ],
            max_tokens=max_new_tokens,
            stream=True,
        )
        return stream

    async def async_start_answer_iterator_streamer(self, prompt: str, max_new_tokens: int = 512):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.start_answer_iterator_streamer, prompt, max_new_tokens)

    @staticmethod
    def parse_token(chunk) -> str:
        return chunk.choices[0].delta.content or ""

    # ------------------------------------------------------------------
    # Prompt generation (same templates as LamaCppClient)
    # ------------------------------------------------------------------

    @staticmethod
    def generate_qa_prompt(question: str) -> str:
        return generate_qa_prompt(template=QA_PROMPT_TEMPLATE, question=question)

    @staticmethod
    def generate_ctx_prompt(question: str, context: str) -> str:
        return generate_ctx_prompt(template=CTX_PROMPT_TEMPLATE, question=question, context=context)

    @staticmethod
    def generate_refined_ctx_prompt(question: str, context: str, existing_answer: str) -> str:
        return generate_refined_ctx_prompt(
            template=REFINED_CTX_PROMPT_TEMPLATE,
            question=question,
            context=context,
            existing_answer=existing_answer,
        )

    @staticmethod
    def generate_refined_question_conversation_awareness_prompt(question: str, chat_history: str) -> str:
        return generate_conversation_awareness_prompt(
            template=REFINED_QUESTION_CONVERSATION_AWARENESS_PROMPT_TEMPLATE,
            question=question,
            chat_history=chat_history,
        )

    @staticmethod
    def generate_refined_answer_conversation_awareness_prompt(question: str, chat_history: str) -> str:
        return generate_conversation_awareness_prompt(
            template=REFINED_ANSWER_CONVERSATION_AWARENESS_PROMPT_TEMPLATE,
            question=question,
            chat_history=chat_history,
        )

    # Unused but kept for interface compatibility
    @staticmethod
    def _unused_model_folder() -> Path:
        return Path(".")
