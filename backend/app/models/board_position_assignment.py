import uuid

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class BoardPositionAssignment(Base):
    __tablename__ = "board_position_assignments"
    __table_args__ = (
        # Multiple historical rows per (position, year) are allowed — a
        # reassignment ends the prior holder's row (end_date = today) rather
        # than overwriting it. Only one *active* (end_date IS NULL) row per
        # position/year is enforced.
        Index(
            "uq_board_position_assignments_active_position_year",
            "board_position_id",
            "rotary_year",
            unique=True,
            postgresql_where=text("end_date IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    board_position_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("board_positions.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="CASCADE"), nullable=False
    )
    rotary_year: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped["Date | None"] = mapped_column(Date)
    end_date: Mapped["Date | None"] = mapped_column(Date)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
