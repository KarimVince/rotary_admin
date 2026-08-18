import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MinutesType = Literal["text", "file"]


class EventMinutesTextCreate(BaseModel):
    content_text: str = Field(min_length=1)


class EventMinutesTextUpdate(BaseModel):
    content_text: str = Field(min_length=1)


class EventMinutesRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    minutes_type: MinutesType
    content_text: str | None
    file_original_filename: str | None
    file_content_type: str | None
    file_size_bytes: int | None
    created_by: uuid.UUID | None
    created_by_name: str | None
    created_at: datetime
    last_updated_by: uuid.UUID | None
    last_updated_by_name: str | None
    last_updated_at: datetime
