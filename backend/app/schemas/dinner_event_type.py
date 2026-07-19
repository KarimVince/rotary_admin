import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Story 16.10 follow-up: a hand-typed color value that isn't a plain
# "#rrggbb" hex string (e.g. "FFD500." with no "#" and a stray trailing
# character) crashes report PDF generation later — reportlab's HexColor()
# has no tolerance for malformed input. Validate at write time so bad data
# can no longer get into the table.
_HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _validate_hex_color(value: str | None) -> str | None:
    if value is not None and not _HEX_COLOR_RE.match(value):
        raise ValueError('must be a hex color like "#e3edfb"')
    return value


class DinnerEventTypeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    color_bg: str | None = Field(default=None, max_length=20)
    color_text: str | None = Field(default=None, max_length=20)

    _validate_color_bg = field_validator("color_bg")(_validate_hex_color)
    _validate_color_text = field_validator("color_text")(_validate_hex_color)


class DinnerEventTypeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    color_bg: str | None = Field(default=None, max_length=20)
    color_text: str | None = Field(default=None, max_length=20)

    _validate_color_bg = field_validator("color_bg")(_validate_hex_color)
    _validate_color_text = field_validator("color_text")(_validate_hex_color)


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
