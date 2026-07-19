"""Story 14.12: Event module app functions (menu + 8 submenus)

Revision ID: 9c4f1e8a2b7d
Revises: 72f098b23d2f
Create Date: 2026-07-15 00:00:00.000000

"""
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '9c4f1e8a2b7d'
down_revision: Union[str, Sequence[str], None] = '72f098b23d2f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MENU_KEY = "event"
SUBMENU_KEYS = [
    "event.list",
    "event.guests",
    "event.auction",
    "event.costs",
    "event.sponsors",
    "event.summary",
    "event.rundown",
    "event.setup",
]


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
        {"id": menu_id, "key": MENU_KEY, "label": "Event", "module": "Event", "order": 0},
    )

    submenus = [
        ("event.list", "Event List", 0),
        ("event.guests", "Guest List", 1),
        ("event.auction", "Lucky Draw & Auction", 2),
        ("event.costs", "Operational Cost", 3),
        ("event.sponsors", "Sponsors", 4),
        ("event.summary", "Summary", 5),
        ("event.rundown", "Run Down", 6),
        ("event.setup", "Setup", 7),
    ]
    for key, label, order in submenus:
        bind.execute(
            sa.text(
                """
                INSERT INTO app_functions (id, key, label, module, parent_id, display_order, active)
                VALUES (gen_random_uuid(), :key, :label, :module, :parent_id, :order, true)
                """
            ),
            {"key": key, "label": label, "module": "Event", "parent_id": menu_id, "order": order},
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
