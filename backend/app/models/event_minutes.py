import uuid

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

# Story 16.29: a fixed, never-admin-configurable 2-value type (unlike
# AttendanceEvent.event_type) — a real Postgres enum, same convention as
# EventGuest.payment_status.
event_minutes_type_enum = Enum("text", "file", name="event_minutes_type")


class EventMinutes(Base):
    """One minutes record (pasted text OR an uploaded Word/PDF file) against
    a Dinner/Event (`AttendanceEvent`). Multiple records per event are
    allowed — this is a list, not a 1:1 with the event."""

    __tablename__ = "event_minutes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendance_events.id", ondelete="CASCADE"), nullable=False
    )
    minutes_type: Mapped[str] = mapped_column(event_minutes_type_enum, nullable=False)

    # Text mode.
    content_text: Mapped[str | None] = mapped_column(Text)

    # File mode — stored in the private `event-minutes` Supabase bucket
    # (Story 16.6 pattern), path only (never a public URL); served back
    # through an authenticated download endpoint since minutes are
    # members-only, not public like member photos/NGO logos.
    storage_path: Mapped[str | None] = mapped_column(String(255))
    file_original_filename: Mapped[str | None] = mapped_column(String(255))
    file_content_type: Mapped[str | None] = mapped_column(String(100))
    file_size_bytes: Mapped[int | None] = mapped_column(Integer)

    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    last_updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
