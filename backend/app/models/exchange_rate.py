import uuid

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ExchangeRate(Base):
    """Manually-maintained conversion rate for a currency to HKD and USD
    (Story 3.9). No live FX API — the club enters/updates these by hand."""

    __tablename__ = "exchange_rates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False, unique=True)
    rate_to_hkd: Mapped["Numeric"] = mapped_column(Numeric(18, 6), nullable=False)
    rate_to_usd: Mapped["Numeric"] = mapped_column(Numeric(18, 6), nullable=False)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
