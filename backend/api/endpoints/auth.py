import hmac
import secrets

from auth import User, create_token, hash_password, verify_password
from core.config import settings
from fastapi import APIRouter, HTTPException
from schemas.auth import AuthRequest, AuthResponse, RegisterRequest, UserInfo
from sqlmodel import select

from api.deps import CurrentUserDep, SessionDep

router = APIRouter()


def user_info(user: User) -> UserInfo:
    return UserInfo(user_id=user.user_id, username=user.username)


@router.post("/auth/register", response_model=AuthResponse, status_code=201)
async def register(payload: RegisterRequest, session: SessionDep):
    expected_code = settings.REGISTRATION_INVITE_CODE
    if expected_code:
        # 用 compare_digest 防时序攻击
        if not hmac.compare_digest(payload.invite_code or "", expected_code):
            raise HTTPException(status_code=403, detail="邀请码无效")

    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required.")

    existing = session.exec(select(User).where(User.username == username)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists.")

    user = User(
        user_id=secrets.token_urlsafe(16),
        username=username,
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return AuthResponse(token=create_token(user), user=user_info(user))


@router.post("/auth/login", response_model=AuthResponse)
async def login(payload: AuthRequest, session: SessionDep):
    user = session.exec(select(User).where(User.username == payload.username.strip())).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    return AuthResponse(token=create_token(user), user=user_info(user))


@router.get("/auth/me", response_model=UserInfo)
async def me(current_user: CurrentUserDep):
    return user_info(current_user)
