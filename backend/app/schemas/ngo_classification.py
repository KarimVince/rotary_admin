import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class NgoClassificationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None


class NgoClassificationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None


class NgoClassificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    position: int
    created_at: datetime
    updated_at: datetime
    # Populated by the list endpoint only — how many organisations currently
    # use this classification (Story 11.2's delete-warning count).
    organisation_count: int = 0


class NgoClassificationReorderItem(BaseModel):
    id: uuid.UUID
    position: int


class NgoClassificationReorder(BaseModel):
    items: list[NgoClassificationReorderItem]
