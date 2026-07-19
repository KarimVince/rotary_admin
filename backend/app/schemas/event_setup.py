import datetime
import uuid

from pydantic import BaseModel, ConfigDict


class EventSetupUpdate(BaseModel):
    ticket_price_normal: float | None = None
    ticket_price_early_bird: float | None = None
    lucky_draw_ticket_price: float | None = None
    payment_deadline: datetime.date | None = None
    bank_account: str | None = None
    fps_id: str | None = None


class EventSetupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: uuid.UUID
    ticket_price_normal: float | None
    ticket_price_early_bird: float | None
    lucky_draw_ticket_price: float | None
    payment_deadline: datetime.date | None = None
    bank_account: str | None = None
    fps_id: str | None = None


class EventTableMappingCreate(BaseModel):
    table_number: int
    theme_name: str | None = None
    rotary_name: str | None = None


class EventTableMappingUpdate(BaseModel):
    table_number: int | None = None
    theme_name: str | None = None
    rotary_name: str | None = None


class EventTableMappingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    table_number: int
    theme_name: str | None
    rotary_name: str | None


class EventCategoryCreate(BaseModel):
    name: str


class EventCategoryUpdate(BaseModel):
    name: str


class EventCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
