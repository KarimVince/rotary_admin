"""Story: lot_ref rework — value-based numbering with manual override tracking

Revision ID: f3a9c7d2b5e1
Revises: e8c2a5f9d3b6
Create Date: 2026-08-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f3a9c7d2b5e1'
down_revision: Union[str, Sequence[str], None] = 'e8c2a5f9d3b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "event_items",
        sa.Column("lot_ref_overridden", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("event_items", "lot_ref_overridden")
