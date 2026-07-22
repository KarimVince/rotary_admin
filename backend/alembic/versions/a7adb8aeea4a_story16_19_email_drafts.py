"""story16_19_email_drafts

Revision ID: a7adb8aeea4a
Revises: 1a0833463db3
Create Date: 2026-07-22 10:23:03.221175

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a7adb8aeea4a'
down_revision: Union[str, Sequence[str], None] = '1a0833463db3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "email_drafts",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("source_module", sa.String(length=20), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=False),
        sa.Column("subject", sa.Text(), server_default="", nullable=False),
        sa.Column("body", sa.Text(), server_default="", nullable=False),
        sa.Column("recipient_group", sa.String(length=50), nullable=True),
        sa.Column("tag", sa.String(length=100), nullable=True),
        sa.Column("member_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("friend_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("attachments", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_email_drafts_module_user", "email_drafts", ["source_module", "created_by"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("idx_email_drafts_module_user", table_name="email_drafts")
    op.drop_table("email_drafts")
