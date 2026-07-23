"""Story 17.1: finance.summary app function (Finance Summary landing page)

Revision ID: d4f8b2e6c1a7
Revises: c3e7a1f4d9b5
Create Date: 2026-07-23 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd4f8b2e6c1a7'
down_revision: Union[str, Sequence[str], None] = 'c3e7a1f4d9b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KEY = "finance.summary"


def upgrade() -> None:
    bind = op.get_bind()
    finance_menu_id = bind.execute(
        sa.text("SELECT id FROM app_functions WHERE key = 'finance'")
    ).scalar_one()

    # Summary is the landing page — bump the existing Finance submenus
    # down a slot so it sorts first in the permission matrix editor.
    bind.execute(
        sa.text(
            "UPDATE app_functions SET display_order = display_order + 1 WHERE parent_id = :parent_id"
        ),
        {"parent_id": finance_menu_id},
    )

    bind.execute(
        sa.text(
            """
            INSERT INTO app_functions (id, key, label, module, parent_id, display_order, active)
            VALUES (gen_random_uuid(), :key, :label, :module, :parent_id, 0, true)
            """
        ),
        {
            "key": KEY,
            "label": "Finance Summary",
            "module": "Finance",
            "parent_id": finance_menu_id,
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

    finance_menu_id = bind.execute(
        sa.text("SELECT id FROM app_functions WHERE key = 'finance'")
    ).scalar_one()
    bind.execute(
        sa.text(
            "UPDATE app_functions SET display_order = display_order - 1 WHERE parent_id = :parent_id"
        ),
        {"parent_id": finance_menu_id},
    )
