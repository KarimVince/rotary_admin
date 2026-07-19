"""Story 14.7: Event Setup — auction receipt payment config

Revision ID: 72f098b23d2f
Revises: 9a35449ad456
Create Date: 2026-07-15 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '72f098b23d2f'
down_revision: Union[str, Sequence[str], None] = '9a35449ad456'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Story 14.7 AC: "Payment instruction text (bank account, FPS)
    # configurable (not hardcoded)" for the Auction Receipt report, plus the
    # story's own suggestion of a per-event payment deadline field — added
    # to event_setup rather than a new table since it's event-scoped config,
    # same as the ticket prices already there.
    op.add_column("event_setup", sa.Column("payment_deadline", sa.Date(), nullable=True))
    op.add_column("event_setup", sa.Column("bank_account", sa.String(length=200), nullable=True))
    op.add_column("event_setup", sa.Column("fps_id", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("event_setup", "fps_id")
    op.drop_column("event_setup", "bank_account")
    op.drop_column("event_setup", "payment_deadline")
