import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

event_guest_payment_status_enum = Enum(
    "paid", "not_paid", "guest", name="event_guest_payment_status"
)


class EventGuest(Base):
    __tablename__ = "event_guests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str | None] = mapped_column(String(20))
    surname: Mapped[str] = mapped_column(String(100), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    contact_rotarian_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="SET NULL")
    )
    payment_status: Mapped[str] = mapped_column(
        event_guest_payment_status_enum, nullable=False, server_default="not_paid"
    )
    early_bird: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    # Story 14.1: intentionally NOT a formal FK to event_table_mapping — a
    # composite (event_id, table_number) FK with ON DELETE SET NULL would
    # null out event_id too (it's part of the composite key), which
    # conflicts with event_id's own NOT NULL + CASCADE FK to events. Kept
    # as a plain reference, matching the spec's own informal wording ("FK
    # ref to event_table_mapping", not "FK ->" like the real FK columns in
    # this same table). Referential integrity for this one is enforced at
    # the application level once the Guest List page (Story 14.4) is built.
    table_number: Mapped[int | None] = mapped_column(Integer)
