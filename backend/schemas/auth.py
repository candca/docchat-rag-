from pydantic import BaseModel, Field


class AuthRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=4, max_length=256)


class UserInfo(BaseModel):
    user_id: str
    username: str


class AuthResponse(BaseModel):
    token: str
    user: UserInfo
