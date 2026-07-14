"""Story 15.1 follow-up: tidy Dinner menu/submenu labels + order

The "Dinner — " prefix on every submenu label (added in d8b3f6c1a9e7) made
the permission matrix table repeat the module name on every row — the menu
row already says it. Submenu labels now match their nav item's own name
instead, and Forecast is reordered ahead of Attendance to match the nav.

Revision ID: c4a8f2d6b1e3
Revises: b9f4d7a2c6e1
Create Date: 2026-07-13 11:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c4a8f2d6b1e3'
down_revision: Union[str, Sequence[str], None] = 'b9f4d7a2c6e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("UPDATE app_functions SET label = 'Dinner' WHERE key = 'attendance'"))
    bind.execute(
        sa.text(
            "UPDATE app_functions SET label = 'Attendance', display_order = 1 "
            "WHERE key = 'attendance.history'"
        )
    )
    bind.execute(
        sa.text(
            "UPDATE app_functions SET label = 'Attendance Sheet', display_order = 2 "
            "WHERE key = 'attendance.sheet'"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text("UPDATE app_functions SET label = 'Dinner — Attendance' WHERE key = 'attendance'")
    )
    bind.execute(
        sa.text(
            "UPDATE app_functions SET label = 'Dinner — Attendance History', display_order = 0 "
            "WHERE key = 'attendance.history'"
        )
    )
    bind.execute(
        sa.text(
            "UPDATE app_functions SET label = 'Dinner — Attendance Sheet', display_order = 1 "
            "WHERE key = 'attendance.sheet'"
        )
    )
