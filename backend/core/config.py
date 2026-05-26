from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_PATH = Path(__file__).parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_PATH / ".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "Chatbot API"
    VERSION: str = "0.1.0"
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Logging Configuration
    LOG_LEVEL: str = "INFO"

    # CORS allowed origins. Override via .env when serving the frontend
    # from another machine (e.g. CORS_ORIGINS=["http://192.168.1.10:5173"]).
    # An entry of "*" disables the whitelist — only use that on a trusted
    # LAN since it forces allow_credentials=False at runtime.
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
    ]
    # When non-empty, allow any origin whose host matches one of these
    # regular expressions. Use to support a range of LAN IPs without
    # listing every port.
    # Example: ["http://192\\.168\\.1\\.[0-9]+(:[0-9]+)?$"]
    CORS_ORIGIN_REGEX: list[str] = []

    MODEL_FOLDER: Path = ROOT_PATH / "models"
    VECTOR_STORE_PATH: Path = ROOT_PATH / "vector_store" / "docs_index"
    DOCS_PATH: Path = ROOT_PATH / Path("docs")

    DATABASE_URL: str = f"sqlite:///{ROOT_PATH / 'vector_store' / 'registry.db'}"
    AUTH_SECRET_KEY: str = "change-me-docchat-local-secret"

    # 注册邀请码。留空时注册开放（任何人可注册）；非空时必须匹配。
    # 推荐内网/多人场景下设置一个随机字符串。
    REGISTRATION_INVITE_CODE: str = ""

    # DeepSeek API (set this to use API mode instead of local llama.cpp)
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"

    # LLM Model Configuration
    MODEL: str = "deepseek-v4-flash"
    MAX_NEW_TOKENS: int = 512

    # Retrieval Configuration
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    SYNTHESIS_STRATEGY: str = "tree-summarization"
    NUM_RETRIEVALS: int = 4
    INITIAL_RETRIEVAL_K: int = 20
    RERANK_TOP_K: int = 5
    KEYWORD_CANDIDATE_LIMIT: int = 1000
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 50

    # Chat History Configuration
    CHAT_HISTORY_LENGTH: int = 4

    # WebSocket Configuration
    WEBSOCKET_MAX_SIZE: int = 10 * 1024 * 1024  # 10 MB

    # File Upload Configuration
    ALLOWED_UPLOAD_EXTENSIONS: list[str] = [".md", ".pdf"]


settings = Settings()
