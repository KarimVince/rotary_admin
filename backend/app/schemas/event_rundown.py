import uuid

from pydantic import BaseModel, ConfigDict, Field


class EventRundownCreate(BaseModel):
    time: str = Field(min_length=1, max_length=50)
    activity: str = Field(min_length=1)
    highlight: bool = False


class EventRundownUpdate(BaseModel):
    time: str | None = Field(default=None, min_length=1, max_length=50)
    activity: str | None = Field(default=None, min_length=1)
    highlight: bool | None = None


class EventRundownRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    time: str
    activity: str
    highlight: bool
    sort_order: int


class EventRundownReorderItem(BaseModel):
    id: uuid.UUID
    sort_order: int


class EventRundownReorder(BaseModel):
    items: list[EventRundownReorderItem]
