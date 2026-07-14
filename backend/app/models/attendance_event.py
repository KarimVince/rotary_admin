import uuid

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

attendance_event_type_enum = Enum("dinner", "fellowship", name="attendance_event_type")


class AttendanceEvent(Base):
    __tablename__ = "attendance_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    event_date: Mapped["Date"] = mapped_column(Date, nullable=False)
    event_type: Mapped[str] = mapped_column(attendance_event_type_enum, nullable=False)
    # Integer, like every other rotary_year column in this app (Donation,
    # MemberFee, BoardPositionAssignment) — computed server-side from
    # event_date via app.core.rotary_year.rotary_year(). Display as
    # "YYYY-YYYY" client-side (frontend/src/utils/rotaryYear.js), not stored
    # as a string.
    rotary_year: Mapped[int] = mapped_column(Integer, nullable=False)
    # Story 15.1 — Dinner Forecast planning fields. Nullable at the DB level
    # (pre-Epic-15 rows have none of these), required by the Dinner Forecast
    # create/edit schema instead.
    location: Mapped[str | None] = mapped_column(String(200))
    speaker_name: Mapped[str | None] = mapped_column(String(200))
    # Story 15.1 follow-up: free text, not a select-from-existing-NGO
    # dropdown — the club wants to name an NGO here even when it has no
    # record in the Organisations module yet.
    ngo_organisation_name: Mapped[str | None] = mapped_column(String(255))
    # Story 15.1 follow-up: the club member who is the point of contact for
    # the speaker, picked from the members list (distinct from
    # `speaker_name`, which is the speaker's own name).
    speaker_rotary_contact_member_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="SET NULL")
    )
    topics_description: Mapped[str | None] = mapped_column(Text)
    # Story 15.6/15.7 (redone on the Dinner Forecast event, not Member — see
    # the ClickUp comment on both stories): restricts this dinner event to
    # members only, vs. open to guests/friends.
    member_only: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    # Story 15.1 — soft delete so historical attendance data tied to a
    # deleted forecast event stays intact; excluded from forecast list/report
    # queries only.
    deleted_at: Mapped["DateTime | None"] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
