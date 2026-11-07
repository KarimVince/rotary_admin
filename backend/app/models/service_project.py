import uuid

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

# A fixed, never-admin-configurable lifecycle — a real Postgres enum, same
# convention as EventMinutes.minutes_type / EventGuest.payment_status.
SERVICE_PROJECT_STATUSES = ("idea", "planning", "in_progress", "completed")
service_project_status_enum = Enum(*SERVICE_PROJECT_STATUSES, name="service_project_status")


class ServiceProject(Base):
    """NGO Project File — one record per Organisation per rotary year holding
    the preparation work for that year (objectives, plan, outcome, lead
    member) plus its uploaded documents (`ServiceProjectDocument`).

    Deliberately separate from Donation/ServiceHour: money and time stay in
    their own tables (which feed the NGO Statistics and Project Services
    reports), this only adds the planning/documentation layer. Works the same
    for external NGOs and club service projects (an Organisation flagged
    `is_club_project`), including time-only projects with no donation.
    """

    __tablename__ = "service_projects"
    __table_args__ = (
        UniqueConstraint("organisation_id", "rotary_year", name="uq_service_projects_org_year"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False
    )
    rotary_year: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        service_project_status_enum, nullable=False, server_default="planning"
    )
    lead_member_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("members.id", ondelete="SET NULL")
    )
    objectives: Mapped[str | None] = mapped_column(Text)
    plan: Mapped[str | None] = mapped_column(Text)
    outcome: Mapped[str | None] = mapped_column(Text)

    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    last_updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class ServiceProjectDocument(Base):
    """One uploaded file (proposal, budget, MoU, photos, final report…)
    against a ServiceProject. Stored in the private `event-minutes` bucket
    under an `ngo-projects/` prefix (see app/core/storage.py) and served back
    through an authenticated download endpoint — never a public URL."""

    __tablename__ = "service_project_documents"
    __table_args__ = (
        Index("idx_service_project_documents_project", "service_project_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    service_project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_projects.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str | None] = mapped_column(String(255))
    storage_path: Mapped[str] = mapped_column(String(255), nullable=False)
    file_original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_content_type: Mapped[str] = mapped_column(String(150), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
