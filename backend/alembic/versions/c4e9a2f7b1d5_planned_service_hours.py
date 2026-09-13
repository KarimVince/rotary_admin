"""planned_service_hours: add planned flag, make member_id/service_date nullable,
merge three open branch heads.

Revision ID: c4e9a2f7b1d5
Revises: c3e5f7a9b1d2, d4a8f2c6e9b3, c1d5f8a3e7b4
Create Date: 2026-09-13 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "c4e9a2f7b1d5"
down_revision = ("c3e5f7a9b1d2", "d4a8f2c6e9b3", "c1d5f8a3e7b4")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Planned service-hours entries have no member or date yet — mark them as
    # a forecast for a rotary year rather than a completed service record.
    op.add_column(
        "service_hours",
        sa.Column(
            "planned",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # member_id and service_date are optional for planned entries (the member
    # and exact date are filled in when the entry is later converted to actual).
    op.alter_column("service_hours", "member_id", nullable=True)
    op.alter_column("service_hours", "service_date", nullable=True)


def downgrade() -> None:
    op.alter_column("service_hours", "service_date", nullable=False)
    op.alter_column("service_hours", "member_id", nullable=False)
    op.drop_column("service_hours", "planned")
