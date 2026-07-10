"""member_fees amendable amount_paid

Revision ID: 9b1f4a6e2c3d
Revises: c7a2e9f14d68
Create Date: 2026-07-07 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9b1f4a6e2c3d'
down_revision: Union[str, Sequence[str], None] = 'c7a2e9f14d68'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # amount_due stays the original standard/invoiced amount (untouched).
    # amount_paid is the actual amount collected when it differs (e.g. a
    # prorated fee for a mid-year joiner), set at payment validation time.
    op.add_column(
        'member_fees', sa.Column('amount_paid', sa.Numeric(precision=10, scale=2), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('member_fees', 'amount_paid')
