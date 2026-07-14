import uuid

from sqlalchemy import ForeignKey, Numeric, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class EventSetup(Base):
    """One row per event — event-scoped config (Story 14.1/14.3)."""

    __tablename__ = "event_setup"
    __table_args__ = ()

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    ticket_price_normal: Mapped["Numeric | None"] = mapped_column(Numeric(10, 2))
    ticket_price_early_bird: Mapped["Numeric | None"] = mapped_column(Numeric(10, 2))
    lucky_draw_ticket_price: Mapped["Numeric | None"] = mapped_column(Numeric(10, 2))
