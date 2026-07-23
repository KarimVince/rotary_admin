import uuid

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

operational_entry_type_enum = Enum("revenue", "cost", name="operational_entry_type")
# Story 17.5 — only "manual" rows are ever persisted; the Member Fees total
# and per-event cost lump sums are computed on the fly from their own
# modules (never duplicated into this table), same reasoning as Story
# 17.3's event fundraising recap. The column still exists per the story's
# own schema note, for forward documentation of where a row came from.
operational_entry_source_enum = Enum(
    "manual", "member_fees", "event", name="operational_entry_source"
)


class OperationalEntry(Base):
    """Story 17.5 — Club Operational Tracking manual revenue/cost entry."""

    __tablename__ = "operational_entries"
    __table_args__ = (Index("idx_operational_entries_year", "rotary_year"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    rotary_year: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[str] = mapped_column(operational_entry_type_enum, nullable=False)
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("finance_categories.id", ondelete="SET NULL")
    )
    amount: Mapped["Numeric"] = mapped_column(Numeric(10, 2), nullable=False)
    entry_date: Mapped["Date"] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(
        operational_entry_source_enum, nullable=False, server_default="manual"
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
