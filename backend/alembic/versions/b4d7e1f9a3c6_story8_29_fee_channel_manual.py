"""Story 8.29: add 'manual' value to fee_channel enum

Revision ID: b4d7e1f9a3c6
Revises: a2f5c8d1e4b7
Create Date: 2026-07-12 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b4d7e1f9a3c6'
down_revision: Union[str, Sequence[str], None] = 'a2f5c8d1e4b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Manual payment recording (Story 8.29's fee tracking sub-screen) needs a
    # channel value distinct from an app-sent "email"/"whatsapp" invoice.
    # Postgres can add an enum value without recreating the type (unlike
    # removing one — see a2f5c8d1e4b7 for that harder case).
    op.execute("ALTER TYPE fee_channel ADD VALUE IF NOT EXISTS 'manual'")


def downgrade() -> None:
    # Removing an enum value requires recreating the type (rename -> create
    # -> cast -> drop, as in a2f5c8d1e4b7's downgrade). Not implemented here
    # since no column default depends on 'manual' and no other migration in
    # this repo's history has needed to roll one back either.
    pass
