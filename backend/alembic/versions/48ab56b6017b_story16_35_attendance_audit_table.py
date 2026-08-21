"""story16_35_attendance_audit_table

Revision ID: 48ab56b6017b
Revises: ec721acfb227
Create Date: 2026-08-21 20:05:27.867174

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '48ab56b6017b'
down_revision: Union[str, Sequence[str], None] = 'ec721acfb227'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "attendance_audits",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("attendance_events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("storage_path", sa.String(length=255), nullable=False),
        sa.Column("file_original_filename", sa.String(length=255), nullable=False),
        sa.Column("file_content_type", sa.String(length=100), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column(
            "uploaded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True
        ),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_attendance_audits_event_id", "attendance_audits", ["event_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_attendance_audits_event_id", table_name="attendance_audits")
    op.drop_table("attendance_audits")
