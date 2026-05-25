from core.config import settings
from helpers.log import get_logger
from sqlalchemy import Engine, event, text
from sqlmodel import SQLModel, create_engine

# Register SQLModel table classes before create_all.
from auth import User  # noqa: F401
from bot.memory.document_registry import DocumentRecord  # noqa: F401
from knowledge_base import KnowledgeBase  # noqa: F401

logger = get_logger(__name__)


def create_db_engine(verbose: bool = False, **kwargs):
    """
    Create the SQLAlchemy engine for database interactions.

    Args:
        verbose (bool): If True, enables SQL query logging.
        **kwargs: Additional keyword arguments for the engine.
    Returns:
        engine: The SQLAlchemy engine instance.
    """
    logger.info("Initialized a postgresql database engine.")

    # Using check_same_thread=False allows FastAPI to use the same SQLite database in different threads.
    # This is necessary only when using SQLite.
    connect_args = {"check_same_thread": False}

    engine = create_engine(
        settings.DATABASE_URL,
        connect_args=connect_args,
        **{
            "echo": verbose,
            "pool_use_lifo": True,  # Avoid many idle connections
            "pool_pre_ping": True,  # Gracefully handle connections closed by the server
            **kwargs,
        },
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.close()

    return engine


def ensure_database_schema(engine: Engine) -> None:
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(documents)").fetchall()}
        if "user_id" not in columns:
            conn.exec_driver_sql("ALTER TABLE documents ADD COLUMN user_id VARCHAR NOT NULL DEFAULT 'legacy'")
        if "summary_json" not in columns:
            conn.exec_driver_sql("ALTER TABLE documents ADD COLUMN summary_json VARCHAR NOT NULL DEFAULT '{}'")
        if "knowledge_base_id" not in columns:
            conn.exec_driver_sql("ALTER TABLE documents ADD COLUMN knowledge_base_id VARCHAR NOT NULL DEFAULT 'default'")
        if "parse_status" not in columns:
            conn.exec_driver_sql("ALTER TABLE documents ADD COLUMN parse_status VARCHAR NOT NULL DEFAULT 'ready'")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_documents_user_id ON documents (user_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_documents_knowledge_base_id ON documents (knowledge_base_id)")


def check_health(engine: Engine) -> None:
    """
    Perform a health check on the database by executing a simple query.

    Args:
        engine (Engine): The SQLAlchemy engine instance used to connect to the database.

    Raises:
        Exception: If the database health check fails, the exception is logged and re-raised.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        raise


def check_health_safe(engine: Engine) -> bool:
    """
    Safe version of check_health that returns a bool instead of raising for convenience.

    Returns:
        True if the database is healthy and permissions are valid, False otherwise.
    """
    try:
        check_health(engine)
        return True
    except Exception:
        return False
