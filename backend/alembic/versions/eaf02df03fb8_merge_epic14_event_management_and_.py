"""merge epic14 event management and epic15 dinner member_only heads

Revision ID: eaf02df03fb8
Revises: c1d5f8a3e7b4, d8e4a1c6f3b9
Create Date: 2026-07-14 11:16:52.396139

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'eaf02df03fb8'
down_revision: Union[str, Sequence[str], None] = ('c1d5f8a3e7b4', 'd8e4a1c6f3b9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
