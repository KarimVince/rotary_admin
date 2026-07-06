import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

from app.schemas.member_email import EmailAttachment

RecipientGroup = Literal["all"]


class RotaryFriendEmailRequest(BaseModel):
    subject: str
    body: str
    recipient_group: RecipientGroup | None = None
    tag: str | None = None
    friend_ids: list[uuid.UUID] | None = None
    attachments: list[EmailAttachment] | None = None

    @model_validator(mode="after")
    def validate_recipients(self) -> "RotaryFriendEmailRequest":
        selections = [self.recipient_group, self.tag, self.friend_ids]
        provided = [value for value in selections if value]
        if len(provided) == 0:
            raise ValueError("Provide one of recipient_group, tag, or friend_ids")
        if len(provided) > 1:
            raise ValueError(
                "Provide only one of recipient_group, tag, or friend_ids, not several"
            )
        return self


class RotaryFriendEmailResult(BaseModel):
    email_log_id: uuid.UUID
    status: str
    recipient_count: int
    success_count: int
    failure_count: int
    skipped_no_email_count: int


class RotaryFriendEmailLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    subject: str
    recipient_group: str
    recipient_count: int
    status: str
    sent_at: datetime
    has_attachments: bool
