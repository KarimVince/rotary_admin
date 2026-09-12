"""members_past_president_flag

Revision ID: c3e5f7a9b1d2
Revises: b2d4e6f8a1c3
Create Date: 2026-09-12 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "c3e5f7a9b1d2"
down_revision = "b2d4e6f8a1c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "members",
        sa.Column(
            "is_past_president",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("members", "is_past_president")
