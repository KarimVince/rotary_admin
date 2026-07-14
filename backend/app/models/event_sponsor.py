import uuid

from sqlalchemy import ForeignKey, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class EventSponsor(Base):
    """Story 14.1/14.9. `category` is a plain string matching a name from
    the global `event_sponsor_categories` catalogue — not a formal FK, same
    reasoning as EventCost.category."""

    __tablename__ = "event_sponsors"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100))
    quantity: Mapped["Numeric"] = mapped_column(Numeric(10, 2), nullable=False, server_default=text("1"))
    unit_price: Mapped["Numeric"] = mapped_column(Numeric(10, 2), nullable=False)
    # Story 14.1: computed application-side, same convention as EventCost.
    total_cost: Mapped["Numeric"] = mapped_column(Numeric(10, 2), nullable=False)
