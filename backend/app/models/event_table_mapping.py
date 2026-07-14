import uuid

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class EventTableMapping(Base):
    __tablename__ = "event_table_mapping"
    __table_args__ = (
        # Story 14.1: table numbers are only unique within a single event,
        # not globally.
        UniqueConstraint("event_id", "table_number", name="uq_event_table_mapping_event_table"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    table_number: Mapped[int] = mapped_column(Integer, nullable=False)
    theme_name: Mapped[str | None] = mapped_column(String(200))
    rotary_name: Mapped[str | None] = mapped_column(String(200))
