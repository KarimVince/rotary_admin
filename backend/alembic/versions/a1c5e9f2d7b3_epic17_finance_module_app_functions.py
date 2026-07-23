"""Story 17.2: Finance module app functions (menu + Donations submenu)

Revision ID: a1c5e9f2d7b3
Revises: dcca9995e8c2
Create Date: 2026-07-22 00:00:00.000000

"""
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1c5e9f2d7b3'
down_revision: Union[str, Sequence[str], None] = 'dcca9995e8c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MENU_KEY = "finance"
# Only "finance.donations" exists yet (Story 17.2) — 17.3/17.4/17.5 each add
# their own submenu in their own migration, same incremental pattern as the
# Dinner module's attendance.forecast (Story 15.1).
SUBMENU_KEYS = ["finance.donations"]


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
        {"id": menu_id, "key": MENU_KEY, "label": "Finance", "module": "Finance", "order": 0},
    )

    bind.execute(
        sa.text(
            """
            INSERT INTO app_functions (id, key, label, module, parent_id, display_order, active)
            VALUES (gen_random_uuid(), :key, :label, :module, :parent_id, :order, true)
            """
        ),
        {
            "key": "finance.donations",
            "label": "Donation Results",
            "module": "Finance",
            "parent_id": menu_id,
            "order": 0,
        },
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
