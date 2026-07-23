import uuid

from sqlalchemy import Boolean, DateTime, Enum, Integer, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

finance_category_type_enum = Enum("revenue", "cost", name="finance_category_type")


class FinanceCategory(Base):
    """Story 17.5 — Admin-managed Revenue/Cost category catalogue for the
    Club Operational Tracking page. Same shape/soft-delete semantics as
    Honorific/MemberTitle."""

    __tablename__ = "finance_categories"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    type: Mapped[str] = mapped_column(finance_category_type_enum, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
