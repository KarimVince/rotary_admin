import uuid
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

Role = Literal["admin", "treasurer", "user"]


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str
    role: Role = "user"
    member_id: uuid.UUID | None = None


class UserUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    role: Role | None = None
    member_id: uuid.UUID | None = None
    is_active: bool | None = None


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(min_length=8)
