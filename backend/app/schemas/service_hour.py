import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ServiceHourCreate(BaseModel):
    hours: float = Field(gt=0)
    notes: str | None = None
    # Optional override; when omitted the rotary_year is derived from
    # service_date server-side (see app.core.rotary_year), same as Donation.
    rotary_year: int | None = None

    # Planned service-hours entries (parallel to Donation.planned):
    # member_id and service_date are not required yet — they are filled in
    # when the planned entry is converted to an actual one.
    planned: bool = False
    member_id: uuid.UUID | None = None
    service_date: date | None = None


class ServiceHourUpdate(BaseModel):
    member_id: uuid.UUID | None = None
    hours: float | None = Field(default=None, gt=0)
    service_date: date | None = None
    notes: str | None = None
    rotary_year: int | None = None
    planned: bool | None = None


class ServiceHourRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organisation_id: uuid.UUID
    member_id: uuid.UUID | None
    member_name: str | None
    rotary_year: int
    hours: float
    service_date: date | None
    planned: bool
    notes: str | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
