from pathlib import Path

import api.endpoints.chat_stream as chat_stream_endpoint
import pytest
from alembic import command
from alembic.config import Config
from api.deps import get_current_user, get_db_session, get_index, get_llm_client
from auth import User
from entities.document import Document
from main import app
from sqlmodel import Session, create_engine
from starlette.testclient import TestClient


class MockModelSettings:
    reasoning = False
    reasoning_stop_tag = None
    system_template = "You are a test assistant."
    config_answer = {}


class MockLamaCppClient:
    """Small deterministic LLM stand-in for tests.

    It mirrors the LamaCppClient surface used by API and client tests without
    downloading or loading a real GGUF model.
    """

    model_settings = MockModelSettings()

    def generate_answer(self, prompt: str, max_new_tokens: int = 512) -> str:
        return "Rome is the capital city of Italy. This is a deterministic test answer."

    async def async_generate_answer(self, prompt: str, max_new_tokens: int = 512) -> str:
        return self.generate_answer(prompt, max_new_tokens=max_new_tokens)

    def start_answer_iterator_streamer(self, prompt: str, max_new_tokens: int = 512):
        tokens = ["Rome", " is", " the", " capital", " city", " of", " Italy", ".", " Test", " answer", "."]
        for token in tokens:
            yield {"choices": [{"delta": {"content": token}}]}

    async def async_start_answer_iterator_streamer(self, prompt: str, max_new_tokens: int = 512):
        return self.start_answer_iterator_streamer(prompt, max_new_tokens=max_new_tokens)

    def stream_answer(self, prompt: str, max_new_tokens: int = 512) -> str:
        return "".join(
            self.parse_token(output)
            for output in self.start_answer_iterator_streamer(prompt, max_new_tokens)
        )

    def generate_qa_prompt(self, question: str) -> str:
        return question

    def generate_refined_answer_conversation_awareness_prompt(self, question: str, chat_history: str) -> str:
        return f"{chat_history}\n{question}"

    def generate_refined_question_conversation_awareness_prompt(self, question: str, chat_history: str) -> str:
        return question

    def generate_ctx_prompt(self, question: str, context: str) -> str:
        return f"{context}\n{question}"

    def generate_refined_ctx_prompt(self, question: str, context: str, chat_history: str) -> str:
        return f"{chat_history}\n{context}\n{question}"

    @staticmethod
    def parse_token(output) -> str:
        return output["choices"][0]["delta"].get("content", "")

    def close(self):
        return None


class MockVectorIndex:
    def __init__(self):
        self.chunks: list[Document] = [
            Document(
                page_content="DocChat is a RAG chatbot test document about retrieval and answering.",
                metadata={"source": "test.md", "document_id": "doc-test", "chunk_index": 0, "user_id": "test-user"},
            )
        ]

    def similarity_search_with_relevance_scores(self, query: str, k: int = 20, filter=None):
        return [(chunk, 0.9) for chunk in self._filtered_chunks(filter)[:k]]

    def get_chunks(self, where=None, limit: int = 1000):
        return self._filtered_chunks(where)[:limit]

    def get_chunks_by_document_id(self, document_id: str, limit: int = 3, user_id: str | None = None):
        return [
            chunk
            for chunk in self.chunks
            if chunk.metadata.get("document_id") == document_id
            and (user_id is None or chunk.metadata.get("user_id") == user_id)
        ][:limit]

    def from_chunks(self, chunks: list[Document]):
        start = len(self.chunks)
        self.chunks.extend(chunks)
        return [f"chunk-{index}" for index in range(start, start + len(chunks))]

    def delete_chunks_by_document_id(self, document_id: str, chunk_ids=None):
        self.chunks = [chunk for chunk in self.chunks if chunk.metadata.get("document_id") != document_id]

    def _filtered_chunks(self, where=None):
        if not where:
            return list(self.chunks)
        user_id = where.get("user_id") if isinstance(where, dict) else None
        if user_id is None:
            return list(self.chunks)
        return [chunk for chunk in self.chunks if chunk.metadata.get("user_id") == user_id]


@pytest.fixture(scope="session")
def mock_models_folder(tmp_path_factory):
    models_folder = tmp_path_factory.mktemp("models")
    return models_folder


@pytest.fixture(scope="session")
def cpu_config():
    config = {
        "n_ctx": 512,
        "n_threads": 2,
        "n_gpu_layers": 0,
    }
    return config


@pytest.fixture(scope="session")
def model_settings(cpu_config):
    return MockModelSettings()


@pytest.fixture(scope="session")
def lamacpp_client(mock_models_folder, model_settings):
    return MockLamaCppClient()


@pytest.fixture
def chroma_instance(tmp_path):
    return MockVectorIndex()


@pytest.fixture(scope="session")
def db_engine(tmp_path_factory, session_mocker):
    """
    Create a session-scoped database engine.
    Database is created once and migrations run once for all tests.
    """

    # Create a temporary database file for SQLite
    temp_dir = tmp_path_factory.mktemp("db")
    db_path = temp_dir / "test.db"
    db_url = f"sqlite:///{db_path}"

    # Use monkeypatch to set DATABASE_URL environment variable
    session_mocker.patch("core.config.settings.DATABASE_URL", db_url)

    # Get path to alembic.ini
    src_dir = Path(__file__).parents[1] / "backend"
    alembic_ini_path = src_dir / "alembic.ini"

    # Create Alembic config and run migrations
    config = Config(str(alembic_ini_path))
    config.set_main_option("sqlalchemy.url", db_url)
    command.upgrade(config, "head")

    engine = create_engine(db_url, connect_args={"check_same_thread": False})

    yield engine

    # Clean up at the end of the test session
    engine.dispose()


@pytest.fixture(name="session")
def session_fixture(db_engine) -> Session:
    """
    Create a new database session for a test, wrapped in a transaction that is rolled back after the test.
    """

    connection = db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)

    yield session

    # Rollback the transaction (this undoes all changes made during the test)
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(name="client_with_overridden_deps")
def client_fixture(
    session: Session,
    lamacpp_client: MockLamaCppClient,
    chroma_instance: MockVectorIndex,
    monkeypatch: pytest.MonkeyPatch,
):
    test_user = User(user_id="test-user", username="testuser", password_hash="unused")

    def get_db_session_override():
        return session

    def get_llm_client_override():
        return lamacpp_client

    def get_index_client_override():
        return chroma_instance

    def get_current_user_override():
        return test_user

    def get_current_user_from_ws_override(session: Session, token: str | None = None):
        return test_user

    app.dependency_overrides[get_db_session] = get_db_session_override
    app.dependency_overrides[get_llm_client] = get_llm_client_override
    app.dependency_overrides[get_index] = get_index_client_override
    app.dependency_overrides[get_current_user] = get_current_user_override
    monkeypatch.setattr(chat_stream_endpoint, "get_current_user_from_ws", get_current_user_from_ws_override)

    client = TestClient(app)

    yield client

    app.dependency_overrides.clear()
