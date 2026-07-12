import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator, model_validator

from app.core.countries import COUNTRIES

STATUSES = ("active", "past")
GENDERS = ("Male", "Female", "Other")


class MemberBase(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr | None = None
    phone: str | None = None
    status: str = "active"
    title_id: uuid.UUID | None = None
    join_date: date
    leave_date: date | None = None
    rotarian_since: date | None = None
    rotarian_id: str | None = None
    photo_url: str | None = None
    profession: str | None = None
    classification: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    nationality: str | None = None
    address: str | None = None
    is_couple: bool = False
    is_honorary: bool = False
    notes: str | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in STATUSES:
            raise ValueError(f"status must be one of {STATUSES}")
        return value

    @field_validator("gender")
    @classmethod
    def validate_gender(cls, value: str | None) -> str | None:
        if value is not None and value not in GENDERS:
            raise ValueError(f"gender must be one of {GENDERS}")
        return value

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, value: date | None) -> date | None:
        if value is not None and value >= date.today():
            raise ValueError("date_of_birth must be in the past")
        return value

    @field_validator("nationality")
    @classmethod
    def validate_nationality(cls, value: str | None) -> str | None:
        if value is not None and value not in COUNTRIES:
            raise ValueError("nationality must be a value from the fixed country list")
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
    rotarian_since: date | None = None
    rotarian_id: str | None = None
    photo_url: str | None = None
    profession: str | None = None
    classification: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    nationality: str | None = None
    address: str | None = None
    is_couple: bool | None = None
    is_honorary: bool | None = None
    notes: str | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is not None and value not in STATUSES:
            raise ValueError(f"status must be one of {STATUSES}")
        return value

    @field_validator("gender")
    @classmethod
    def validate_gender(cls, value: str | None) -> str | None:
        if value is not None and value not in GENDERS:
            raise ValueError(f"gender must be one of {GENDERS}")
        return value

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, value: date | None) -> date | None:
        if value is not None and value >= date.today():
            raise ValueError("date_of_birth must be in the past")
        return value

    @field_validator("nationality")
    @classmethod
    def validate_nationality(cls, value: str | None) -> str | None:
        if value is not None and value not in COUNTRIES:
            raise ValueError("nationality must be a value from the fixed country list")
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
    rotarian_since: date | None
    photo_url: str | None
    profession: str | None
    classification: str | None
    gender: str | None
    nationality: str | None
    is_couple: bool
    is_honorary: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime
    years_as_rotarian: float
    years_in_this_club: float


class MemberRead(MemberReadLimited):
    """Full member shape, admin only — adds date_of_birth, address, and rotarian_id."""

    date_of_birth: date | None
    address: str | None
    rotarian_id: str | None
