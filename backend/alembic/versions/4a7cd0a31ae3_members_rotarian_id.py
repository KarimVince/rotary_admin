"""members rotarian_id

Revision ID: 4a7cd0a31ae3
Revises: b2fb96bf0c9a
Create Date: 2026-07-05 14:46:10.228824

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4a7cd0a31ae3'
down_revision: Union[str, Sequence[str], None] = 'b2fb96bf0c9a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('members', sa.Column('rotarian_id', sa.String(length=50), nullable=True))
    op.create_unique_constraint('uq_members_rotarian_id', 'members', ['rotarian_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('uq_members_rotarian_id', 'members', type_='unique')
    op.drop_column('members', 'rotarian_id')
