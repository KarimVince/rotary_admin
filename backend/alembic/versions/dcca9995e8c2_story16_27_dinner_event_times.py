"""story16_27_dinner_event_times

Revision ID: dcca9995e8c2
Revises: 0535268abe4b
Create Date: 2026-07-22 13:43:26.448092

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dcca9995e8c2'
down_revision: Union[str, Sequence[str], None] = '0535268abe4b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("attendance_events", sa.Column("start_time", sa.Time(), nullable=True))
    op.add_column("attendance_events", sa.Column("end_time", sa.Time(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("attendance_events", "end_time")
    op.drop_column("attendance_events", "start_time")
