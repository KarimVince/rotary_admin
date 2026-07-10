"""Story 10.10: attendance / attendance.history / attendance.sheet app functions

Revision ID: d8b3f6c1a9e7
Revises: c3f7a1d8e2b6
Create Date: 2026-07-10 18:30:00.000000

"""
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd8b3f6c1a9e7'
down_revision: Union[str, Sequence[str], None] = 'c3f7a1d8e2b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MENU_KEY = "attendance"
SUBMENU_KEYS = ["attendance.history", "attendance.sheet"]


def upgrade() -> None:
    bind = op.get_bind()

    menu_id = str(uuid.uuid4())
    bind.execute(
        sa.text(
            """
            INSERT INTO app_functions (id, key, label, module, parent_id, display_order, active)
            VALUES (:id, :key, :label, :module, NULL, :order, true)
            """
        ),
        {
            "id": menu_id,
            "key": MENU_KEY,
            "label": "Dinner — Attendance",
            "module": "Dinner",
            "order": 0,
        },
    )

    submenus = [
        ("attendance.history", "Dinner — Attendance History", 0),
        ("attendance.sheet", "Dinner — Attendance Sheet", 1),
    ]
    for key, label, order in submenus:
        bind.execute(
            sa.text(
                """
                INSERT INTO app_functions (id, key, label, module, parent_id, display_order, active)
                VALUES (gen_random_uuid(), :key, :label, :module, :parent_id, :order, true)
                """
            ),
            {"key": key, "label": label, "module": "Dinner", "parent_id": menu_id, "order": order},
        )


def downgrade() -> None:
    bind = op.get_bind()
    keys = [MENU_KEY, *SUBMENU_KEYS]
    bind.execute(
        sa.text(
            "DELETE FROM permission_matrix WHERE app_function_id IN "
            "(SELECT id FROM app_functions WHERE key IN :keys)"
        ).bindparams(sa.bindparam("keys", expanding=True)),
        {"keys": keys},
    )
    bind.execute(
        sa.text("DELETE FROM app_functions WHERE key IN :keys").bindparams(
            sa.bindparam("keys", expanding=True)
        ),
        {"keys": keys},
    )
