import uuid

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class FeeSettings(Base):
    __tablename__ = "fee_settings"
    __table_args__ = (
        CheckConstraint("early_bird_single_price > 0", name="chk_fee_settings_ebs_positive"),
        CheckConstraint("early_bird_couple_price > 0", name="chk_fee_settings_ebc_positive"),
        CheckConstraint("full_single_price > 0", name="chk_fee_settings_fs_positive"),
        CheckConstraint("full_couple_price > 0", name="chk_fee_settings_fc_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    rotary_year: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    early_bird_single_price: Mapped["Numeric"] = mapped_column(Numeric(10, 2), nullable=False)
    early_bird_couple_price: Mapped["Numeric"] = mapped_column(Numeric(10, 2), nullable=False)
    full_single_price: Mapped["Numeric"] = mapped_column(Numeric(10, 2), nullable=False)
    full_couple_price: Mapped["Numeric"] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="HKD")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
