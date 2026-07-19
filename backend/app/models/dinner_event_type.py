import uuid

from sqlalchemy import DateTime, Integer, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class DinnerEventType(Base):
    __tablename__ = "dinner_event_types"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    # Story 16.10: optional chip colors — a type without either falls back
    # to a neutral grey chip client-side rather than a broken/blank one.
    color_bg: Mapped[str | None] = mapped_column(String(20))
    color_text: Mapped[str | None] = mapped_column(String(20))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
