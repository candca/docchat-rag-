from pathlib import Path

from core.config import settings
from helpers.log import get_logger

logger = get_logger(__name__)


def create_llm_client(model_folder: Path):
    if settings.DEEPSEEK_API_KEY:
        from bot.client.deepseek_client import DeepSeekClient

        logger.info("Using DeepSeek API client with model=%s base_url=%s", settings.MODEL, settings.DEEPSEEK_BASE_URL)
        return DeepSeekClient(
            api_key=settings.DEEPSEEK_API_KEY,
            model=settings.MODEL,
            base_url=settings.DEEPSEEK_BASE_URL,
        )

    from bot.client.lama_cpp_client import LamaCppClient
    from bot.model.model_registry import get_model_settings

    settings.MODEL_FOLDER.mkdir(parents=True, exist_ok=True)
    model_settings = get_model_settings(settings.MODEL)
    logger.info("Using local llama.cpp client with model=%s", settings.MODEL)
    return LamaCppClient(model_folder=model_folder, model_settings=model_settings)
