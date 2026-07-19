import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DinnerEventTypeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    color_bg: str | None = Field(default=None, max_length=20)
    color_text: str | None = Field(default=None, max_length=20)


class DinnerEventTypeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    color_bg: str | None = Field(default=None, max_length=20)
    color_text: str | None = Field(default=None, max_length=20)


class DinnerEventTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    color_bg: str | None
    color_text: str | None
    sort_order: int
    created_at: datetime
    # Populated by the list endpoint only — how many dinner events currently
    # use this type (Story 16.10's delete-block/warning count).
    event_count: int = 0


class DinnerEventTypeReorderItem(BaseModel):
    id: uuid.UUID
    sort_order: int


class DinnerEventTypeReorder(BaseModel):
    items: list[DinnerEventTypeReorderItem]
