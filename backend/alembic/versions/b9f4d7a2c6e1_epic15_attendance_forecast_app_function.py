"""Story 15.1: attendance.forecast app function

Revision ID: b9f4d7a2c6e1
Revises: a7c2e5f1b9d4
Create Date: 2026-07-13 10:05:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b9f4d7a2c6e1'
down_revision: Union[str, Sequence[str], None] = 'a7c2e5f1b9d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KEY = "attendance.forecast"


def upgrade() -> None:
    bind = op.get_bind()
    attendance_menu_id = bind.execute(
        sa.text("SELECT id FROM app_functions WHERE key = 'attendance'")
    ).scalar_one()

    bind.execute(
        sa.text(
            """
            INSERT INTO app_functions (id, key, label, module, parent_id, display_order, active)
            VALUES (gen_random_uuid(), :key, :label, :module, :parent_id, :order, true)
            """
        ),
        {
            # Story 15.1 follow-up: label matches the nav item's own name
            # ("Forecast"), not prefixed with the module name — the parent
            # menu row already says "Dinner", repeating it on every submenu
            # row made the permission matrix table needlessly long.
            "key": KEY,
            "label": "Forecast",
            "module": "Dinner",
            "parent_id": attendance_menu_id,
            "order": 0,
        },
    )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "DELETE FROM permission_matrix WHERE app_function_id IN "
            "(SELECT id FROM app_functions WHERE key = :key)"
        ),
        {"key": KEY},
    )
    bind.execute(sa.text("DELETE FROM app_functions WHERE key = :key"), {"key": KEY})
