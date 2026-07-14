"""Drop "Forecast" wording from the Dinner Events nav label — the list holds
past events too, not just upcoming ones, so "Forecast" was misleading.

Revision ID: e6b3a9c2f5d8
Revises: d2e5c8b1f4a7
Create Date: 2026-07-13 13:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e6b3a9c2f5d8'
down_revision: Union[str, Sequence[str], None] = 'd2e5c8b1f4a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.get_bind().execute(
        sa.text(
            "UPDATE app_functions SET label = 'Dinner Events' WHERE key = 'attendance.forecast'"
        )
    )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text("UPDATE app_functions SET label = 'Forecast' WHERE key = 'attendance.forecast'")
    )
