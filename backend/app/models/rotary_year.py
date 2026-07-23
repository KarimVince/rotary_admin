import uuid

from sqlalchemy import Boolean, DateTime, Integer, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class RotaryYear(Base):
    """Story 16.28 — central Admin-managed catalogue of selectable rotary
    years, replacing every page's own hardcoded/derived year list. Only
    `year` and `is_current` are stored — label/start_date/end_date are
    always computed from `year` via app.core.rotary_year.rotary_year_bounds
    (never independent columns), so every row stays locked to the app's
    fixed Jul 1 -> Jun 30 convention. No FK anywhere points at this table
    (every other table stores its own plain rotary_year int), so deleting
    a row here never touches historical data."""

    __tablename__ = "rotary_years"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    year: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
