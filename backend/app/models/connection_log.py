import uuid

from sqlalchemy import DateTime, ForeignKey, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ConnectionLog(Base):
    """STORY 16.34 — one row per successful login (confirmed with Karim:
    successful logins only, not failed attempts — a separate security-
    alerting concern). Retained indefinitely, no automatic purge, matching
    this app's existing convention of not building data-retention automation
    anywhere else."""

    __tablename__ = "connection_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # IPv6 max textual length is 45 chars (incl. a possible embedded IPv4
    # tail) — plenty of headroom either way.
    ip_address: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
