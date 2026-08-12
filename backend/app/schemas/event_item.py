import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ItemType = Literal["auction", "lucky_draw_on_stage", "lucky_draw"]
ItemStatus = Literal["received", "not_received"]


class EventItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    value_hkd: float | None = None
    donor_sponsor: str | None = Field(default=None, max_length=200)
    contact_rotary_id: uuid.UUID | None = None
    item_type: ItemType
    ad_page: bool = False
    status: ItemStatus = "not_received"
    value_sold: float | None = None


class EventItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    value_hkd: float | None = None
    donor_sponsor: str | None = Field(default=None, max_length=200)
    contact_rotary_id: uuid.UUID | None = None
    item_type: ItemType | None = None
    ad_page: bool | None = None
    status: ItemStatus | None = None
    value_sold: float | None = None
    # 2026-08-08: manual lot_ref override — e.g. "A-3". Validated against
    # the item's own type-group prefix and parsed as a target position by
    # the API layer (app/api/event_item.py), not stored verbatim as free
    # text. Mutually exclusive in practice with value_hkd in the same
    # request (the UI only ever sends one or the other) — see
    # update_item's handling if both are somehow sent together.
    lot_ref: str | None = None


class EventItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    lot_ref: str | None
    lot_ref_overridden: bool
    name: str
    value_hkd: float | None
    donor_sponsor: str | None
    contact_rotary_id: uuid.UUID | None
    contact_rotary_name: str | None = None
    item_type: ItemType
    ad_page: bool
    status: ItemStatus
    value_sold: float | None


class EventLuckyDrawConfigUpdate(BaseModel):
    tickets_sold: int = 0
    other_donation: float = 0


class EventLuckyDrawConfigRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: uuid.UUID
    tickets_sold: int
    other_donation: float
