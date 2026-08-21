import uuid

from sqlalchemy import DateTime, ForeignKey, Integer, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class AttendanceAudit(Base):
    """2026-08-14: the completed, filled-in attendance sheet (the fillable
    PDF from Story 16.33/2026-08-14, marked up during or after the meeting)
    uploaded back as the event's permanent audit record — the paper trail
    proving who actually attended and paid, once the event is over.

    Multiple uploads per event are allowed (e.g. a corrected re-upload) and
    each is kept as its own row rather than overwriting the last, so the
    audit trail is never silently replaced — same convention as
    `EventMinutes`'s file mode."""

    __tablename__ = "attendance_audits"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendance_events.id", ondelete="CASCADE"), nullable=False
    )

    # File stored in the private `event-minutes` Supabase bucket (Story 16.6
    # pattern, reused rather than provisioning a brand-new bucket), under an
    # `audit/` path prefix so it never collides with EventMinutes' own
    # `{event_id}/{uuid}.{ext}` objects. Path only, never a public URL —
    # served back through an authenticated download endpoint.
    storage_path: Mapped[str] = mapped_column(String(255), nullable=False)
    file_original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)

    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    uploaded_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
