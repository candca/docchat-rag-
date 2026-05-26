from contextlib import asynccontextmanager

import state
import uvicorn
from api.routes import api_router
from chat_history import chat_history_manager
from core.config import settings
from database import create_db_engine, ensure_database_schema
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from helpers.log import get_logger
from llm_client import create_llm_client
from vector_database import init_index

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize global state
    state.engine = create_db_engine()
    ensure_database_schema(state.engine)
    state.llm_client = create_llm_client(settings.MODEL_FOLDER)
    state.index = init_index(settings.VECTOR_STORE_PATH)
    chat_history_manager.start_cleanup_task()

    yield

    # Cleanup
    await chat_history_manager.stop_cleanup_task()
    if state.engine:
        state.engine.dispose()
        logger.info("Database engine disposed")
    if state.llm_client:
        state.llm_client.close()
        logger.info("LLM client closed")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

_allow_any_origin = "*" in settings.CORS_ORIGINS
_origin_regex = "|".join(f"(?:{p})" for p in settings.CORS_ORIGIN_REGEX) if settings.CORS_ORIGIN_REGEX else None
if _allow_any_origin:
    logger.warning("CORS_ORIGINS includes '*': credentialed requests will be rejected by the browser.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allow_any_origin else settings.CORS_ORIGINS,
    allow_origin_regex=_origin_regex,
    # The CORS spec forbids credentials with a wildcard origin; pass False
    # when "*" is in use so the browser doesn't strip the response header.
    allow_credentials=not _allow_any_origin,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

# Note: A single Uvicorn worker is probably what you would want to use when using a distributed container
# management system like Kubernetes.

if __name__ == "__main__":
    uvicorn.run(
        app="main:app",
        host=settings.HOST,
        port=settings.PORT,
        # log_config=None,
        # workers=max(1, os.cpu_count() - 1),
        workers=1,
    )
