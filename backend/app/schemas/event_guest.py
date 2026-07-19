import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PaymentStatus = Literal["paid", "not_paid", "guest"]


class EventGuestCreate(BaseModel):
    title: str | None = Field(default=None, max_length=20)
    surname: str = Field(min_length=1, max_length=100)
    first_name: str = Field(min_length=1, max_length=100)
    contact_rotarian_id: uuid.UUID | None = None
    payment_status: PaymentStatus = "not_paid"
    early_bird: bool = False
    table_number: int | None = None


class EventGuestUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=20)
    surname: str | None = Field(default=None, min_length=1, max_length=100)
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    contact_rotarian_id: uuid.UUID | None = None
    payment_status: PaymentStatus | None = None
    early_bird: bool | None = None
    table_number: int | None = None


class EventGuestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    title: str | None
    surname: str
    first_name: str
    contact_rotarian_id: uuid.UUID | None
    contact_rotarian_name: str | None = None
    payment_status: PaymentStatus
    early_bird: bool
    table_number: int | None
