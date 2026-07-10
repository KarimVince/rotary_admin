"""member_fees paid_by audit field

Revision ID: c7a2e9f14d68
Revises: f3a8c1d92b4e
Create Date: 2026-07-07 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7a2e9f14d68'
down_revision: Union[str, Sequence[str], None] = 'f3a8c1d92b4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('member_fees', sa.Column('paid_by', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_member_fees_paid_by_users', 'member_fees', 'users', ['paid_by'], ['id']
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_member_fees_paid_by_users', 'member_fees', type_='foreignkey')
    op.drop_column('member_fees', 'paid_by')
