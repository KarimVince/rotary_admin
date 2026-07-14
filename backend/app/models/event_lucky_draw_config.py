import uuid

from sqlalchemy import ForeignKey, Integer, Numeric, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class EventLuckyDrawConfig(Base):
    """One row per event (Story 14.1/14.6)."""

    __tablename__ = "event_lucky_draw_config"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    tickets_sold: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    other_donation: Mapped["Numeric"] = mapped_column(
        Numeric(10, 2), nullable=False, server_default=text("0")
    )
