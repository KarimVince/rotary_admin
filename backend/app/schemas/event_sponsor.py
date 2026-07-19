import uuid

from pydantic import BaseModel, ConfigDict, Field


class EventSponsorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=100)
    quantity: float = 1
    unit_price: float


class EventSponsorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=100)
    quantity: float | None = None
    unit_price: float | None = None


class EventSponsorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    category: str | None
    quantity: float
    unit_price: float
    total_cost: float
