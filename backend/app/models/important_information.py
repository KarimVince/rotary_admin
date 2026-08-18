import uuid

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

# A fixed, never-admin-configurable 2-value lifecycle (unlike e.g.
# DinnerEventType) — a real Postgres enum, same convention as
# EventGuest.payment_status / EventMinutes.minutes_type.
important_information_status_enum = Enum("active", "archived", name="important_information_status")


class ImportantInformationMessage(Base):
    """Dashboard-wide announcement banner. At most one row has
    status='active' at a time — enforced both here (application logic
    archives whatever's active before activating another) and at the DB
    level via a partial unique index on status='active' (see this table's
    migration) as a belt-and-suspenders guard against a race."""

    __tablename__ = "important_information_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        important_information_status_enum, nullable=False, server_default="active"
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    archived_at: Mapped["DateTime | None"] = mapped_column(DateTime(timezone=True))
