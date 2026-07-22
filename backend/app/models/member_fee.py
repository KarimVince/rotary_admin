import uuid

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

# Story 16.13: "sponsored" is a custom, admin-entered price outside the
# Early Bird / Full schedule — see migration e7c4a1f9b6d3.
fee_price_type_enum = Enum("early_bird", "full", "sponsored", name="fee_price_type")
# Story 8.29: "manual" added for payments recorded through the fee tracking
# sub-screen without going through the app's own send flow (e.g. cash/bank
# transfer handed to the treasurer directly) — see migration b4d7e1f9a3c6.
fee_channel_enum = Enum("email", "whatsapp", "both", "manual", name="fee_channel")


class MemberFee(Base):
    __tablename__ = "member_fees"
    __table_args__ = (
        UniqueConstraint("member_id", "rotary_year", name="uq_member_fees_member_year"),
        Index("idx_member_fees_year", "rotary_year"),
        Index("idx_member_fees_paid", "is_paid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="CASCADE"), nullable=False
    )
    rotary_year: Mapped[int] = mapped_column(Integer, nullable=False)
    price_type: Mapped[str] = mapped_column(fee_price_type_enum, nullable=False)
    is_couple_at_billing: Mapped[bool] = mapped_column(Boolean, nullable=False)
    amount_due: Mapped["Numeric"] = mapped_column(Numeric(10, 2), nullable=False)
    # The actual amount collected, when it differs from amount_due (e.g. a
    # prorated fee for a mid-year joiner). amount_due is never overwritten —
    # it stays the standard/invoiced reference for reporting.
    amount_paid: Mapped["Numeric | None"] = mapped_column(Numeric(10, 2))
    is_paid: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    paid_date: Mapped["Date | None"] = mapped_column(Date)
    # Set whenever is_paid is changed via PATCH — audit trail for who last
    # toggled paid status, and (with updated_at) when.
    paid_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    invoice_sent_at: Mapped["DateTime | None"] = mapped_column(DateTime(timezone=True))
    invoice_send_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    last_channel: Mapped[str | None] = mapped_column(fee_channel_enum)
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
