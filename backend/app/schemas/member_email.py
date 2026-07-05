import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

RecipientGroup = Literal["all", "active", "past"]


class EmailAttachment(BaseModel):
    filename: str
    url: str


class MemberEmailRequest(BaseModel):
    subject: str
    body: str
    recipient_group: RecipientGroup | None = None
    member_ids: list[uuid.UUID] | None = None
    attachments: list[EmailAttachment] | None = None

    @model_validator(mode="after")
    def validate_recipients(self) -> "MemberEmailRequest":
        if not self.recipient_group and not self.member_ids:
            raise ValueError("Provide either recipient_group or member_ids")
        if self.recipient_group and self.member_ids:
            raise ValueError("Provide only one of recipient_group or member_ids, not both")
        return self


class MemberEmailResult(BaseModel):
    email_log_id: uuid.UUID
    status: str
    recipient_count: int
    success_count: int
    failure_count: int


class EmailLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    subject: str
    recipient_group: str
    recipient_count: int
    status: str
    sent_at: datetime
    has_attachments: bool
