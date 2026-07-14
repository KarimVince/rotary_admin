import uuid

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class PptTemplate(Base):
    """Story 8.23: one uploaded annual-club .pptx template per rotary year,
    used as the slide master for generated PPT reports."""

    __tablename__ = "ppt_templates"
    __table_args__ = (UniqueConstraint("rotary_year", name="uq_ppt_templates_rotary_year"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    rotary_year: Mapped[int] = mapped_column(Integer, nullable=False)
    # Stored server-side filename (deterministic, "{rotary_year}.pptx") —
    # not the uploader's original filename, which is kept separately below
    # purely for display.
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    # Bumped on replace too (onupdate), so this always reflects the most
    # recent upload for the year, not just the first one.
    uploaded_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
