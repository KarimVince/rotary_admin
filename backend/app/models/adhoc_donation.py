import uuid

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, Numeric, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class AdhocDonation(Base):
    """Story 17.3 — one-off donations not tied to an NGO/Organisation (e.g.
    red box collections at dinners), manually entered on the Fund Raising
    Results page. Amount is HKD only (no currency column) — these are
    local cash collections, unlike the multi-currency Donation model."""

    __tablename__ = "adhoc_donations"
    __table_args__ = (Index("idx_adhoc_donations_year", "rotary_year"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    rotary_year: Mapped[int] = mapped_column(Integer, nullable=False)
    donation_date: Mapped["Date"] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    amount: Mapped["Numeric"] = mapped_column(Numeric(10, 2), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
