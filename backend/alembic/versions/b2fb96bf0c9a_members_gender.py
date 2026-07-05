"""members gender

Revision ID: b2fb96bf0c9a
Revises: b7f912f4d812
Create Date: 2026-07-05 14:28:50.690799

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2fb96bf0c9a'
down_revision: Union[str, Sequence[str], None] = 'b7f912f4d812'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    member_gender = sa.Enum('Male', 'Female', 'Other', name='member_gender')
    member_gender.create(op.get_bind(), checkfirst=True)
    op.add_column('members', sa.Column('gender', member_gender, nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('members', 'gender')
    sa.Enum(name='member_gender').drop(op.get_bind(), checkfirst=True)
