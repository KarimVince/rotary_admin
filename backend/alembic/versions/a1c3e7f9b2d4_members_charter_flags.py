"""members_charter_flags

Revision ID: a1c3e7f9b2d4
Revises: fd6db30982d2
Create Date: 2026-09-12 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "a1c3e7f9b2d4"
down_revision = "fd6db30982d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "members",
        sa.Column(
            "is_charter_member",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "members",
        sa.Column(
            "is_charter_president",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("members", "is_charter_president")
    op.drop_column("members", "is_charter_member")
