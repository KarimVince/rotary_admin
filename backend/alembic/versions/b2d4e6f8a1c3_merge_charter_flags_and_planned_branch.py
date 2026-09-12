"""merge charter_flags and planned_donations branches

Revision ID: b2d4e6f8a1c3
Revises: a1c3e7f9b2d4, a9c3e6b1d4f7
Create Date: 2026-09-12 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "b2d4e6f8a1c3"
down_revision = ("a1c3e7f9b2d4", "a9c3e6b1d4f7")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
