import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class FeeRunCreate(BaseModel):
    rotary_year: int
    price_type: Literal["early_bird", "full"]
    target: Literal["all_unpaid", "all_members", "member_ids"]
    member_ids: list[uuid.UUID] | None = None

    @model_validator(mode="after")
    def validate_member_ids(self) -> "FeeRunCreate":
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
    price_type: str
    created_count: int
    updated_count: int
    skipped_paid_count: int
    member_fees: list[MemberFeeRead]


class FeeInvoiceSendRequest(BaseModel):
    # None => every unpaid member_fees row for the rotary year.
    member_ids: list[uuid.UUID] | None = None
    channel: Literal["email", "whatsapp"] = "email"


class FeeInvoiceSendResult(BaseModel):
    rotary_year: int
    channel: str
    sent_count: int
    skipped_paid_count: int
    failed_count: int
    email_log_id: uuid.UUID | None
    member_fees: list[MemberFeeRead]


class MemberFeeUpdate(BaseModel):
    is_paid: bool | None = None
    paid_date: date | None = None
    # Amends the amount actually collected (e.g. a prorated fee for a
    # mid-year joiner) without overwriting amount_due, the standard/invoiced
    # reference amount used for reporting.
    amount_paid: float | None = Field(default=None, gt=0)
    notes: str | None = None


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
