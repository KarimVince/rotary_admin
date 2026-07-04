import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator, model_validator

STATUSES = ("active", "past")


class MemberBase(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr | None = None
    phone: str | None = None
    status: str = "active"
    title_id: uuid.UUID | None = None
    join_date: date
    leave_date: date | None = None
    profession: str | None = None
    classification: str | None = None
    date_of_birth: date | None = None
    nationality: str | None = None
    address: str | None = None
    is_couple: bool = False
    notes: str | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in STATUSES:
            raise ValueError(f"status must be one of {STATUSES}")
        return value

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, value: date | None) -> date | None:
        if value is not None and value >= date.today():
            raise ValueError("date_of_birth must be in the past")
        return value

    @model_validator(mode="after")
    def validate_leave_after_join(self) -> "MemberBase":
        if self.leave_date is not None and self.leave_date < self.join_date:
            raise ValueError("leave_date must be on or after join_date")
        return self


class MemberCreate(MemberBase):
    pass


class MemberUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    status: str | None = None
    title_id: uuid.UUID | None = None
    join_date: date | None = None
    leave_date: date | None = None
    profession: str | None = None
    classification: str | None = None
    date_of_birth: date | None = None
    nationality: str | None = None
    address: str | None = None
    is_couple: bool | None = None
    notes: str | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is not None and value not in STATUSES:
            raise ValueError(f"status must be one of {STATUSES}")
        return value

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, value: date | None) -> date | None:
        if value is not None and value >= date.today():
            raise ValueError("date_of_birth must be in the past")
        return value


class MemberReadLimited(BaseModel):
    """Member shape for non-admin readers — omits PII (date_of_birth, address)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    first_name: str
    last_name: str
    email: str | None
    phone: str | None
    status: str
    title_id: uuid.UUID | None
    join_date: date
    leave_date: date | None
    profession: str | None
    classification: str | None
    nationality: str | None
    is_couple: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime


class MemberRead(MemberReadLimited):
    """Full member shape, admin only — adds date_of_birth and address."""

    date_of_birth: date | None
    address: str | None
