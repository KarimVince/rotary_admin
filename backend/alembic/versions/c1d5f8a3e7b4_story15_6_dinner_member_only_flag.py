"""Story 15.6/15.7 (redone — flag belongs on Dinner Forecast events, not
Members; see ClickUp comments on both stories): add member_only boolean to
attendance_events, so a dinner event can be marked as restricted to members
only (vs. open to guests/friends).

Revision ID: c1d5f8a3e7b4
Revises: a3c7f9b2e5d1
Create Date: 2026-07-14 00:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = "c1d5f8a3e7b4"
down_revision = "a3c7f9b2e5d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "attendance_events",
        sa.Column("member_only", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("attendance_events", "member_only")
