from pathlib import Path

from core.config import settings


def create_llm_client(model_folder: Path):
    if settings.DEEPSEEK_API_KEY:
        from bot.client.deepseek_client import DeepSeekClient

        return DeepSeekClient(api_key=settings.DEEPSEEK_API_KEY, model=settings.MODEL)

    from bot.client.lama_cpp_client import LamaCppClient
    from bot.model.model_registry import get_model_settings

    settings.MODEL_FOLDER.mkdir(parents=True, exist_ok=True)
    model_settings = get_model_settings(settings.MODEL)
    return LamaCppClient(model_folder=model_folder, model_settings=model_settings)
