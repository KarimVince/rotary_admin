import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ImportantInformationStatus = Literal["active", "archived"]


class ImportantInformationCreate(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    text: str = Field(min_length=1, max_length=2000)


class ImportantInformationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    text: str
    status: ImportantInformationStatus
    created_by: uuid.UUID | None
    created_by_name: str | None
    created_at: datetime
    archived_at: datetime | None
