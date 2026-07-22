import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class MemberTierAssignment(BaseModel):
    member_id: uuid.UUID
    price_type: Literal["early_bird", "full", "sponsored"]
    # Story 16.13: overrides the fee-settings-computed price for this member.
    # Required for "sponsored" (no scheduled price exists for that tier);
    # optional for early_bird/full, where it lets the admin amend the
    # standard due amount for one member without changing the schedule.
    amount_due: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_sponsored_has_amount(self) -> "MemberTierAssignment":
        if self.price_type == "sponsored" and self.amount_due is None:
            raise ValueError("amount_due is required for a Sponsored fee type")
        return self


class FeeRunCreate(BaseModel):
    rotary_year: int
    price_type: Literal["early_bird", "full"] | None = None
    target: Literal["all_unpaid", "all_members", "member_ids"] | None = None
    member_ids: list[uuid.UUID] | None = None
    # Per-member tier assignment (Fee Run tab's "assign tiers" step) — each
    # member in the run gets their own tier instead of one shared price_type
    # for the whole batch. Mutually exclusive with price_type/target.
    member_tiers: list[MemberTierAssignment] | None = None

    @model_validator(mode="after")
    def validate_target_shape(self) -> "FeeRunCreate":
        if self.member_tiers is not None:
            if self.price_type is not None or self.target is not None or self.member_ids is not None:
                raise ValueError("Provide either member_tiers or price_type+target, not both")
            if not self.member_tiers:
                raise ValueError("member_tiers must not be empty")
            return self

        if self.price_type is None or self.target is None:
            raise ValueError("Provide either member_tiers or both price_type and target")
        if self.target == "member_ids" and not self.member_ids:
            raise ValueError("member_ids is required when target is 'member_ids'")
        if self.target != "member_ids" and self.member_ids:
            raise ValueError("member_ids is only used when target is 'member_ids'")
        return self


class MemberFeeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    member_id: uuid.UUID
    rotary_year: int
    price_type: str
    is_couple_at_billing: bool
    amount_due: float
    amount_paid: float | None
    is_paid: bool
    paid_date: date | None
    paid_by: uuid.UUID | None
    invoice_sent_at: datetime | None
    invoice_send_count: int
    last_channel: str | None
    notes: str | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class FeeRunResult(BaseModel):
    rotary_year: int
    # None when the run used per-member member_tiers (spans multiple tiers,
    # no single value to report).
    price_type: str | None
    created_count: int
    updated_count: int
    skipped_paid_count: int
    member_fees: list[MemberFeeRead]


class FeeInvoiceSendRequest(BaseModel):
    # None => every unpaid member_fees row for the rotary year.
    member_ids: list[uuid.UUID] | None = None


class FeeInvoiceSendResult(BaseModel):
    rotary_year: int
    sent_count: int
    skipped_paid_count: int
    failed_count: int
    email_log_id: uuid.UUID | None
    member_fees: list[MemberFeeRead]


class MemberFeeUpdate(BaseModel):
    is_paid: bool | None = None
    paid_date: date | None = None
    # Story 16.13: lets the treasurer amend a member's tier/due amount
    # directly on the tracking screen, independent of a fee run — e.g. to
    # apply a one-off "Sponsored" price.
    price_type: Literal["early_bird", "full", "sponsored"] | None = None
    amount_due: float | None = Field(default=None, ge=0)
    # Amends the amount actually collected (e.g. a prorated fee for a
    # mid-year joiner) without overwriting amount_due, the standard/invoiced
    # reference amount used for reporting.
    # Story 8.29: 0 is a valid amount (fee-exempt members are still tracked
    # in the tracker at a zero amount) — ge=0, not gt=0.
    amount_paid: float | None = Field(default=None, ge=0)
    notes: str | None = None
    # Story 8.29: payment update sub-screen fields. "manual" (not sent by the
    # app's own automated send flow) marks external confirmation of any kind.
    # "whatsapp" is intentionally not offered here — the WhatsApp send effort
    # (Epic 8) is deferred with no provider chosen; the Postgres enum still
    # allows the value for any pre-existing historical rows, but the API no
    # longer accepts new writes of it.
    last_channel: Literal["email", "manual"] | None = None
    # Not a raw column — translated to invoice_sent_at (set/cleared) in the
    # endpoint, keeping invoice_sent_at/invoice_send_count as the automated
    # send flow's own audit trail rather than overloading them here.
    invoice_sent: bool | None = None


class PriceTypeBreakdown(BaseModel):
    price_type: str
    count: int
    total_amount: float


class MemberFeeStatistics(BaseModel):
    rotary_year: int
    currency: str | None
    total_members: int
    paid_count: int
    unpaid_count: int
    total_collected: float
    total_outstanding: float
    collection_rate: float
    breakdown_by_price_type: list[PriceTypeBreakdown]
    # Story 8.31: active non-honorary member count for the selected year
    # (same date-scoping rule as Story 8.29) and the resulting average fee.
    active_member_count: int
    average_fee_per_active_member: float


class FeeYearHistory(BaseModel):
    rotary_year: int
    total_collected: float
    paid_count: int
    zero_count: int
