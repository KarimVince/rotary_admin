import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator, model_validator

E164_PATTERN = re.compile(r"^\+[1-9]\d{1,14}$")


def _validate_whatsapp(value: str | None) -> str | None:
    if value is not None and not E164_PATTERN.match(value):
        raise ValueError("whatsapp must be in E.164 format, e.g. +33612345678")
    return value


class RotaryFriendBase(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr | None = None
    whatsapp: str | None = None
    tags: str | None = None
    source: str | None = None
    notes: str | None = None

    _validate_whatsapp = field_validator("whatsapp")(_validate_whatsapp)

    @model_validator(mode="after")
    def _require_contact_method(self) -> "RotaryFriendBase":
        if self.email is None and self.whatsapp is None:
            raise ValueError("Either email or whatsapp is required")
        return self


class RotaryFriendCreate(RotaryFriendBase):
    pass


class RotaryFriendUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = None
    whatsapp: str | None = None
    tags: str | None = None
    source: str | None = None
    notes: str | None = None

    _validate_whatsapp = field_validator("whatsapp")(_validate_whatsapp)


class RotaryFriendRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    first_name: str
    last_name: str
    email: str | None
    whatsapp: str | None
    tags: str | None
    source: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
