"""email_log.sent_at uses clock_timestamp instead of now

Revision ID: 8ee54c159ce3
Revises: 9e5155cc288c
Create Date: 2026-07-05 01:17:02.388039

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8ee54c159ce3'
down_revision: Union[str, Sequence[str], None] = '9e5155cc288c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "email_log",
        "sent_at",
        server_default=sa.text("clock_timestamp()"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "email_log",
        "sent_at",
        server_default=sa.text("now()"),
    )
