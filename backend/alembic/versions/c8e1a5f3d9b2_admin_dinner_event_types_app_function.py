"""Story 16.10: admin.dinner_event_types app function

Revision ID: c8e1a5f3d9b2
Revises: b3d9f2a7c4e1
Create Date: 2026-07-18 00:15:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c8e1a5f3d9b2'
down_revision: Union[str, Sequence[str], None] = 'b3d9f2a7c4e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KEY = "admin.dinner_event_types"


def upgrade() -> None:
    bind = op.get_bind()
    admin_menu_id = bind.execute(
        sa.text("SELECT id FROM app_functions WHERE key = 'admin'")
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
            "label": "Admin — Dinner Event Types",
            "module": "Admin",
            "parent_id": admin_menu_id,
            "order": 5,
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
