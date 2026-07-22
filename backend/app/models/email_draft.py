import uuid

from sqlalchemy import DateTime, ForeignKey, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class EmailDraft(Base):
    """Story 16.19 — a saved-for-later message for the Member or Friend of
    Rotary email screens. Personal to whoever saved it (created_by), same as
    the compose form itself. `member_ids`/`friend_ids`/`attachments` are
    stored as JSONB (list of strings/dicts) rather than a relational table —
    a draft is a snapshot of the compose form, not a live join to those
    rows, so the ids stay valid even if a member/friend is later removed."""

    __tablename__ = "email_drafts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    # "members" | "rotary_friends" — mirrors EmailLog.source_module.
    source_module: Mapped[str] = mapped_column(String(20), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    subject: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    body: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    recipient_group: Mapped[str | None] = mapped_column(String(50))
    tag: Mapped[str | None] = mapped_column(String(100))
    member_ids: Mapped[list | None] = mapped_column(JSONB)
    friend_ids: Mapped[list | None] = mapped_column(JSONB)
    attachments: Mapped[list | None] = mapped_column(JSONB)
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
