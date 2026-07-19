"""Story 14.17: add 'guest' value to event_guest_payment_status enum

Revision ID: a4e6c8f1b2d9
Revises: 9c4f1e8a2b7d
Create Date: 2026-07-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a4e6c8f1b2d9'
down_revision: Union[str, Sequence[str], None] = '9c4f1e8a2b7d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Invited guests aren't expected to pay and shouldn't skew payment
    # totals as "not_paid". No backfill needed — existing rows stay 'paid'
    # or 'not_paid'.
    op.execute("ALTER TYPE event_guest_payment_status ADD VALUE IF NOT EXISTS 'guest'")


def downgrade() -> None:
    # Removing an enum value requires recreating the type (see
    # b4d7e1f9a3c6's downgrade for the harder case). Not implemented since
    # no other migration in this repo's history has needed to roll one back.
    pass
