import uuid

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, String, func, text
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
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
