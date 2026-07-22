"""Story 16.13: add 'sponsored' value to fee_price_type enum

Revision ID: e7c4a1f9b6d3
Revises: d4a8f2c6e9b3
Create Date: 2026-07-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e7c4a1f9b6d3'
down_revision: Union[str, Sequence[str], None] = 'd4a8f2c6e9b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Member Fees Tracking can now bill a member at a custom "Sponsored"
    # price outside the Early Bird / Full schedule (Story 16.13). Postgres
    # can add an enum value without recreating the type (unlike removing
    # one — see a2f5c8d1e4b7 for that harder case).
    op.execute("ALTER TYPE fee_price_type ADD VALUE IF NOT EXISTS 'sponsored'")


def downgrade() -> None:
    # Removing an enum value requires recreating the type (rename -> create
    # -> cast -> drop). Not implemented here — same precedent as
    # b4d7e1f9a3c6's downgrade for fee_channel's 'manual' value.
    pass
