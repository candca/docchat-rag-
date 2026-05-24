import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any

from core.config import settings
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"

    user_id: str = Field(primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str
    created_at: int = Field(default_factory=lambda: int(time.time()))


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, salt, expected = stored_hash.split("$", 2)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000).hex()
    return hmac.compare_digest(digest, expected)


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_token(user: User) -> str:
    payload = {
        "sub": user.user_id,
        "username": user.username,
        "iat": int(time.time()),
    }
    payload_b64 = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(settings.AUTH_SECRET_KEY.encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256)
    return f"{payload_b64}.{_b64encode(signature.digest())}"


def parse_token(token: str) -> dict[str, Any] | None:
    try:
        payload_b64, signature_b64 = token.split(".", 1)
        expected = hmac.new(settings.AUTH_SECRET_KEY.encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256)
        if not hmac.compare_digest(_b64encode(expected.digest()), signature_b64):
            return None
        payload = json.loads(_b64decode(payload_b64).decode("utf-8"))
        if not isinstance(payload, dict) or not payload.get("sub"):
            return None
        return payload
    except Exception:
        return None
