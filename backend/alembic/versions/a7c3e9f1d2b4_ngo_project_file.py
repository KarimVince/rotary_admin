"""ngo_project_file: service_projects + service_project_documents tables,
seed the "Internal Club Project" NGO classification.

Revision ID: a7c3e9f1d2b4
Revises: c4e9a2f7b1d5
Create Date: 2026-11-07 00:00:00.000000

"""
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a7c3e9f1d2b4"
down_revision: Union[str, Sequence[str], None] = "c4e9a2f7b1d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INTERNAL_CLASSIFICATION = "Internal Club Project"


def upgrade() -> None:
    status_enum = postgresql.ENUM(
        "idea", "planning", "in_progress", "completed",
        name="service_project_status",
        create_type=False,
    )
    status_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "service_projects",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "organisation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organisations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rotary_year", sa.Integer(), nullable=False),
        sa.Column("status", status_enum, nullable=False, server_default="planning"),
        sa.Column(
            "lead_member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("members.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("objectives", sa.Text(), nullable=True),
        sa.Column("plan", sa.Text(), nullable=True),
        sa.Column("outcome", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "last_updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True
        ),
        sa.Column(
            "last_updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("organisation_id", "rotary_year", name="uq_service_projects_org_year"),
    )

    op.create_table(
        "service_project_documents",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "service_project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("service_projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("storage_path", sa.String(length=255), nullable=False),
        sa.Column("file_original_filename", sa.String(length=255), nullable=False),
        sa.Column("file_content_type", sa.String(length=150), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "idx_service_project_documents_project", "service_project_documents", ["service_project_id"]
    )

    # Seed the classification used to mark the club's own (internal) service
    # projects — idempotent, since an admin may already have created it by
    # hand in Reference Lists.
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            INSERT INTO ngo_classifications (id, name, position)
            SELECT :id, :name,
                   (SELECT COALESCE(MAX(position), -1) + 1 FROM ngo_classifications)
            WHERE NOT EXISTS (SELECT 1 FROM ngo_classifications WHERE name = :name)
            """
        ),
        {"id": str(uuid.uuid4()), "name": INTERNAL_CLASSIFICATION},
    )


def downgrade() -> None:
    # The seeded classification is left in place: organisations may already
    # be classified with it, and dropping it would silently un-classify them.
    op.drop_index("idx_service_project_documents_project", table_name="service_project_documents")
    op.drop_table("service_project_documents")
    op.drop_table("service_projects")
    postgresql.ENUM(name="service_project_status").drop(op.get_bind(), checkfirst=True)
