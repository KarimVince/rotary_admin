import uuid

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Time, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    date: Mapped["Date"] = mapped_column(Date, nullable=False)
    hour: Mapped["Time | None"] = mapped_column(Time)
    venue: Mapped[str] = mapped_column(String(200), nullable=False)
    # Story 14.1: nullable — an Organising Committee chair may not be
    # assigned yet at event creation, and this app never hard-blocks on a
    # member-link FK (see AttendanceEvent.speaker_rotary_contact_member_id).
    oc_chair_member_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="SET NULL")
    )
    theme: Mapped[str | None] = mapped_column(String(200))
    # Story 14.1: deliberate deviation from the spec's literal
    # `varchar "2025-2026"` — every other rotary_year column in this app
    # (Donation, MemberFee, AttendanceEvent, BoardPositionAssignment) is an
    # Integer, computed server-side via app.core.rotary_year.rotary_year().
    # Display as "YYYY-YYYY" client-side, same as everywhere else.
    rotary_year: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
