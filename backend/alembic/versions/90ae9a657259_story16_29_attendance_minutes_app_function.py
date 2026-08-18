"""Story 16.29: attendance.minutes app function

Revision ID: 90ae9a657259
Revises: fd6db30982d2
Create Date: 2026-08-18 00:00:01.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '90ae9a657259'
down_revision: Union[str, Sequence[str], None] = 'fd6db30982d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KEY = "attendance.minutes"


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
            "key": KEY,
            "label": "Minutes",
            "module": "Dinner",
            "parent_id": attendance_menu_id,
            "order": 4,
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
