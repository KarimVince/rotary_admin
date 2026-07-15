import uuid

from sqlalchemy import DateTime, ForeignKey, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class MemberApplication(Base):
    """Story 8.3: a generated new-member application PDF (fillable AcroForm),
    pre-populated with the prospect's name/email/phone, plus send tracking.
    Email is the only send channel — the WhatsApp block (Epic 8) is deferred
    with no provider chosen yet, so the placeholder "mark sent via WhatsApp"
    flow this used to have was removed rather than kept as dead UI."""

    __tablename__ = "member_applications"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(30))
    pdf_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    email_sent_at: Mapped["DateTime | None"] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
