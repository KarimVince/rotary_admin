"""Story 16.35 — NGO Module: Planned Donations (planned flag, nullable date)

Revision ID: a9c3e6b1d4f7
Revises: 48ab56b6017b
Create Date: 2026-09-05 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a9c3e6b1d4f7'
down_revision: Union[str, Sequence[str], None] = '48ab56b6017b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "donations",
        sa.Column("planned", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    # A planned donation has no donation_date yet (Rotary year only) — every
    # existing row is an actual donation so this is a pure widening, no data
    # migration needed.
    op.alter_column("donations", "donation_date", existing_type=sa.Date(), nullable=True)


def downgrade() -> None:
    op.alter_column("donations", "donation_date", existing_type=sa.Date(), nullable=False)
    op.drop_column("donations", "planned")
