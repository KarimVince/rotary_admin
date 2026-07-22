import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas.member_email import EmailAttachment

SourceModule = Literal["members", "rotary_friends"]


class EmailDraftCreate(BaseModel):
    source_module: SourceModule
    subject: str = ""
    body: str = ""
    recipient_group: str | None = None
    tag: str | None = None
    member_ids: list[uuid.UUID] | None = None
    friend_ids: list[uuid.UUID] | None = None
    attachments: list[EmailAttachment] | None = None


class EmailDraftUpdate(BaseModel):
    subject: str | None = None
    body: str | None = None
    recipient_group: str | None = None
    tag: str | None = None
    member_ids: list[uuid.UUID] | None = None
    friend_ids: list[uuid.UUID] | None = None
    attachments: list[EmailAttachment] | None = None


class EmailDraftRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_module: SourceModule
    subject: str
    body: str
    recipient_group: str | None
    tag: str | None
    member_ids: list[uuid.UUID] | None
    friend_ids: list[uuid.UUID] | None
    attachments: list[EmailAttachment] | None
    created_at: datetime
    updated_at: datetime
