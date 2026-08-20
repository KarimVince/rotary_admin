import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class ConnectionLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    user_email: str
    user_full_name: str
    ip_address: str | None
    created_at: datetime


class LoginTrendPoint(BaseModel):
    date: date
    count: int


class MostActiveUser(BaseModel):
    user_id: uuid.UUID
    full_name: str
    email: str
    login_count: int


class LastLoginEntry(BaseModel):
    user_id: uuid.UUID
    full_name: str
    email: str
    last_login_at: datetime | None


class ConnectionLogStats(BaseModel):
    trend: list[LoginTrendPoint]
    most_active: list[MostActiveUser]
    last_login: list[LastLoginEntry]
