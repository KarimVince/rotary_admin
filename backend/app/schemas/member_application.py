import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MemberApplicationCreate(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None


class MemberApplicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str | None
    phone: str | None
    email_sent_at: datetime | None
    created_at: datetime
    pdf_url: str | None = None
    download_url: str | None = None
