import uuid

from sqlalchemy import DateTime, ForeignKey, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    purpose: Mapped[str] = mapped_column(String(50), nullable=False)
    # Story 16.30 — generic slot for a purpose-specific payload a token needs
    # to carry until it's confirmed. Only "email_change" uses it so far (the
    # pending new email address, since it can't be written to User.email
    # until the confirmation link is clicked); every other purpose
    # ("refresh", "password_reset") leaves it null.
    payload: Mapped[str | None] = mapped_column(String(255))
    expires_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped["DateTime | None"] = mapped_column(DateTime(timezone=True))
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
