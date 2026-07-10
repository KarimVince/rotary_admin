"""Epic 12: Menu/Submenu hierarchy for App Functions

Revision ID: b6d1f4a892ce
Revises: a3d8f0b1c2e4
Create Date: 2026-07-10 16:00:00.000000

"""
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = 'b6d1f4a892ce'
down_revision: Union[str, Sequence[str], None] = 'a3d8f0b1c2e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# key -> (label, module, display_order)
MENUS = [
    ("members", "Members", "Members", 0),
    ("ngos", "NGOs & Donations", "NGOs & Donations", 10),
    ("fees", "Member Fees", "Member Fees", 20),
    ("friends", "Friends of Rotary", "Friends of Rotary", 30),
    ("board", "Board", "Board", 40),
    ("admin", "Admin", "Admin", 50),
]

# key -> (label, module, parent_menu_key, display_order, [old_keys_to_migrate_from])
SUBMENUS = [
    ("members.directory", "Members — Directory", "Members", "members", 0, []),
    ("members.statistics", "Members — Statistics", "Members", "members", 1, []),
    ("members.email", "Members — Email", "Members", "members", 2, []),
    ("ngos.organisations", "NGOs & Donations — Organisations", "NGOs & Donations", "ngos", 0, []),
    ("ngos.statistics", "NGOs & Donations — Statistics", "NGOs & Donations", "ngos", 1, []),
    ("fees.tracking", "Member Fees — Tracking", "Member Fees", "fees", 0, ["invoices.view"]),
    ("fees.run", "Member Fees — Run", "Member Fees", "fees", 1, ["invoices.manage"]),
    ("fees.settings", "Member Fees — Settings", "Member Fees", "fees", 2, ["invoices.manage"]),
    ("fees.statistics", "Member Fees — Statistics", "Member Fees", "fees", 3, ["invoices.view"]),
    ("friends.directory", "Friends of Rotary — Directory", "Friends of Rotary", "friends", 0, ["friends.view"]),
    ("friends.statistics", "Friends of Rotary — Statistics", "Friends of Rotary", "friends", 1, ["friends.view"]),
    (
        "friends.send_message",
        "Friends of Rotary — Send Message",
        "Friends of Rotary",
        "friends",
        2,
        ["friends.send_email"],
    ),
    (
        "board.members",
        "Board — Members",
        "Board",
        "board",
        0,
        ["board-view-assignments", "board-manage-assignments"],
    ),
    ("board.positions", "Board — Position Definitions", "Board", "board", 1, []),
    ("admin.member_titles", "Admin — Member Titles", "Admin", "admin", 0, []),
    ("admin.currencies", "Admin — Currencies", "Admin", "admin", 1, []),
]

OLD_KEYS = [
    "invoices.view",
    "invoices.manage",
    "friends.view",
    "friends.send_email",
    "board-view-assignments",
    "board-manage-assignments",
]

_LEVEL_ORDER = {"no_access": 0, "read": 1, "write": 2}


def upgrade() -> None:
    bind = op.get_bind()

    op.add_column(
        "app_functions",
        sa.Column(
            "parent_id",
            UUID(as_uuid=True),
            sa.ForeignKey("app_functions.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )

    # 1. Snapshot existing matrix values for the 6 old keys before they're
    #    retired, keyed by (old_key, column) where column is "default" or the
    #    board_position_id as a string.
    old_rows = bind.execute(
        sa.text(
            """
            SELECT af.key AS fn_key, pm.board_position_id, pm.is_default_user, pm.access_level
            FROM permission_matrix pm
            JOIN app_functions af ON af.id = pm.app_function_id
            WHERE af.key IN :keys
            """
        ).bindparams(sa.bindparam("keys", expanding=True)),
        {"keys": OLD_KEYS},
    ).fetchall()

    old_values: dict[tuple[str, str], str] = {}
    for row in old_rows:
        column = "default" if row.is_default_user else str(row.board_position_id)
        old_values[(row.fn_key, column)] = row.access_level

    columns = sorted({col for (_key, col) in old_values.keys()})

    # 2. Insert the 6 Menu rows.
    menu_ids: dict[str, str] = {}
    for key, label, module, order in MENUS:
        new_id = str(uuid.uuid4())
        menu_ids[key] = new_id
        bind.execute(
            sa.text(
                """
                INSERT INTO app_functions (id, key, label, module, parent_id, display_order, active)
                VALUES (:id, :key, :label, :module, NULL, :order, true)
                """
            ),
            {"id": new_id, "key": key, "label": label, "module": module, "order": order},
        )

    # 3. Insert the 16 Submenu rows, migrating best-effort values from their
    #    mapped old key(s) onto each column that had a value — the most
    #    permissive of the old keys a submenu absorbs wins, so consolidating
    #    two granular controls into one coarser one never reduces anyone's
    #    existing access.
    submenu_values: dict[str, dict[str, str]] = {}
    for key, label, module, parent_key, order, old_source_keys in SUBMENUS:
        new_id = str(uuid.uuid4())
        bind.execute(
            sa.text(
                """
                INSERT INTO app_functions (id, key, label, module, parent_id, display_order, active)
                VALUES (:id, :key, :label, :module, :parent_id, :order, true)
                """
            ),
            {
                "id": new_id,
                "key": key,
                "label": label,
                "module": module,
                "parent_id": menu_ids[parent_key],
                "order": order,
            },
        )

        col_values: dict[str, str] = {}
        for column in columns:
            levels = [
                old_values[(old_key, column)]
                for old_key in old_source_keys
                if (old_key, column) in old_values
            ]
            if levels:
                col_values[column] = max(levels, key=lambda lvl: _LEVEL_ORDER[lvl])
        submenu_values[key] = col_values

        for column, level in col_values.items():
            is_default = column == "default"
            bind.execute(
                sa.text(
                    """
                    INSERT INTO permission_matrix
                        (id, board_position_id, app_function_id, access_level, is_default_user)
                    VALUES (gen_random_uuid(), :board_position_id, :app_function_id, :access_level, :is_default_user)
                    """
                ),
                {
                    "board_position_id": None if is_default else uuid.UUID(column),
                    "app_function_id": new_id,
                    "access_level": level,
                    "is_default_user": is_default,
                },
            )

    # 4. Set each Menu's value to the max of its submenus' values per column,
    #    so the parent-child constraint holds by construction from the start.
    for menu_key, _label, _module, _order in MENUS:
        submenu_keys = [s[0] for s in SUBMENUS if s[3] == menu_key]
        menu_col_values: dict[str, str] = {}
        for skey in submenu_keys:
            for column, level in submenu_values.get(skey, {}).items():
                current = menu_col_values.get(column)
                if current is None or _LEVEL_ORDER[level] > _LEVEL_ORDER[current]:
                    menu_col_values[column] = level

        for column, level in menu_col_values.items():
            is_default = column == "default"
            bind.execute(
                sa.text(
                    """
                    INSERT INTO permission_matrix
                        (id, board_position_id, app_function_id, access_level, is_default_user)
                    VALUES (gen_random_uuid(), :board_position_id, :app_function_id, :access_level, :is_default_user)
                    """
                ),
                {
                    "board_position_id": None if is_default else uuid.UUID(column),
                    "app_function_id": menu_ids[menu_key],
                    "access_level": level,
                    "is_default_user": is_default,
                },
            )

    # 5. Retire the 6 old flat keys — deactivate rather than delete, so
    #    historical permission_matrix rows referencing them stay intact for
    #    audit/rollback, but no endpoint or nav item reads them anymore once
    #    Stories 12.3-12.9 re-point their call sites.
    bind.execute(
        sa.text("UPDATE app_functions SET active = false WHERE key IN :keys").bindparams(
            sa.bindparam("keys", expanding=True)
        ),
        {"keys": OLD_KEYS},
    )


def downgrade() -> None:
    bind = op.get_bind()
    new_keys = [key for key, *_ in MENUS] + [key for key, *_ in SUBMENUS]

    bind.execute(
        sa.text(
            "DELETE FROM permission_matrix WHERE app_function_id IN "
            "(SELECT id FROM app_functions WHERE key IN :keys)"
        ).bindparams(sa.bindparam("keys", expanding=True)),
        {"keys": new_keys},
    )
    bind.execute(
        sa.text("DELETE FROM app_functions WHERE key IN :keys").bindparams(
            sa.bindparam("keys", expanding=True)
        ),
        {"keys": new_keys},
    )
    bind.execute(
        sa.text("UPDATE app_functions SET active = true WHERE key IN :keys").bindparams(
            sa.bindparam("keys", expanding=True)
        ),
        {"keys": OLD_KEYS},
    )
    op.drop_column("app_functions", "parent_id")
