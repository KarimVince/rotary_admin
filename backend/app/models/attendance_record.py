import uuid

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

# Separate from app.models.member.member_status_enum (name clash otherwise) —
# this is a point-in-time snapshot taken when the event is created, not a
# live FK to the member's current status.
attendance_member_status_snapshot_enum = Enum(
    "active", "honorary", "past", name="attendance_member_status_snapshot"
)


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (
        UniqueConstraint("event_id", "member_id", name="uq_attendance_records_event_member"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("attendance_events.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="CASCADE"), nullable=False
    )
    present: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    member_status_snapshot: Mapped[str] = mapped_column(
        attendance_member_status_snapshot_enum, nullable=False
    )
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    recorded_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
