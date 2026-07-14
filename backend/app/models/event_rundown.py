import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class EventRundown(Base):
    __tablename__ = "event_rundown"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    # Story 14.1: plain string, not Time — the spec's own examples
    # ("Before 7:30 PM") aren't parseable as a time value.
    time: Mapped[str] = mapped_column(String(50), nullable=False)
    activity: Mapped[str] = mapped_column(Text, nullable=False)
    highlight: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
