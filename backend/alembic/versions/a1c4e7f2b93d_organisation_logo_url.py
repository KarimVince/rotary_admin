"""organisations logo_url

Revision ID: a1c4e7f2b93d
Revises: 9b1f4a6e2c3d
Create Date: 2026-07-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c4e7f2b93d'
down_revision: Union[str, Sequence[str], None] = '9b1f4a6e2c3d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('organisations', sa.Column('logo_url', sa.String(length=500), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('organisations', 'logo_url')
