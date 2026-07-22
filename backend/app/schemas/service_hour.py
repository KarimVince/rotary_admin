import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ServiceHourCreate(BaseModel):
    member_id: uuid.UUID
    hours: float = Field(gt=0)
    service_date: date
    notes: str | None = None
    # Optional override; when omitted the rotary_year is derived from
    # service_date server-side (see app.core.rotary_year), same as Donation.
    rotary_year: int | None = None


class ServiceHourUpdate(BaseModel):
    member_id: uuid.UUID | None = None
    hours: float | None = Field(default=None, gt=0)
    service_date: date | None = None
    notes: str | None = None
    rotary_year: int | None = None


class ServiceHourRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organisation_id: uuid.UUID
    member_id: uuid.UUID
    member_name: str
    rotary_year: int
    hours: float
    service_date: date
    notes: str | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
