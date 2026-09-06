import uuid

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Donation(Base):
    __tablename__ = "donations"
    __table_args__ = (
        UniqueConstraint(
            "organisation_id",
            "rotary_year",
            "donation_date",
            "amount",
            name="uq_donations_org_year_date_amount",
        ),
        Index("idx_donations_org_year", "organisation_id", "rotary_year"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False
    )
    rotary_year: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped["Numeric"] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="HKD")
    # Story 16.35: nullable now that a donation can be `planned` (not yet
    # made) — a planned donation is scoped by rotary_year only, no date.
    # An actual donation (planned=False) always has one; enforced in the
    # Pydantic schema, not a DB CHECK constraint (matches this app's existing
    # convention of validating conditional-required fields at the API layer).
    donation_date: Mapped["Date | None"] = mapped_column(Date, nullable=True)
    # Story 16.35: NGO Module Planned Donations. True = target/forecast for
    # the rotary year, not yet made. Converting to an actual donation is an
    # in-place edit of this same row (planned=False + donation_date set) —
    # no separate table/history.
    planned: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
