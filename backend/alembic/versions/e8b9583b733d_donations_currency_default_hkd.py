"""donations currency default hkd

Revision ID: e8b9583b733d
Revises: 2d9f948c9362
Create Date: 2026-07-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8b9583b733d'
down_revision: Union[str, Sequence[str], None] = '2d9f948c9362'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('donations', 'currency', server_default='HKD')


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('donations', 'currency', server_default='EUR')
