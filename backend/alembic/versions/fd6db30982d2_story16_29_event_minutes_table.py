"""story16_29_event_minutes_table

Revision ID: fd6db30982d2
Revises: f3a9c7d2b5e1
Create Date: 2026-08-18 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'fd6db30982d2'
down_revision: Union[str, Sequence[str], None] = 'f3a9c7d2b5e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    event_minutes_type_enum = postgresql.ENUM(
        "text", "file", name="event_minutes_type", create_type=False
    )
    event_minutes_type_enum.create(op.get_bind())

    op.create_table(
        "event_minutes",
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
        sa.Column("minutes_type", event_minutes_type_enum, nullable=False),
        sa.Column("content_text", sa.Text(), nullable=True),
        sa.Column("storage_path", sa.String(length=255), nullable=True),
        sa.Column("file_original_filename", sa.String(length=255), nullable=True),
        sa.Column("file_content_type", sa.String(length=100), nullable=True),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),
        sa.Column(
            "created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "last_updated_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column(
            "last_updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_event_minutes_event_id", "event_minutes", ["event_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_event_minutes_event_id", table_name="event_minutes")
    op.drop_table("event_minutes")
    postgresql.ENUM(name="event_minutes_type").drop(op.get_bind(), checkfirst=True)
