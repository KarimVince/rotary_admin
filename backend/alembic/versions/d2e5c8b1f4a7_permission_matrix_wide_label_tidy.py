"""Permission matrix: apply the Dinner label/order simplification app-wide

Every submenu label repeated its parent menu's name ("Members — Directory",
"Admin — PPT Template", ...) — same clutter fixed for Dinner in
c4a8f2d6b1e3, now applied to every module. Submenu labels are set to match
their nav item's own text (frontend/src/components/AppLayout.jsx), and
both menu- and submenu-level display_order are set to match that same nav
order top to bottom.

Revision ID: d2e5c8b1f4a7
Revises: c4a8f2d6b1e3
Create Date: 2026-07-13 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd2e5c8b1f4a7'
down_revision: Union[str, Sequence[str], None] = 'c4a8f2d6b1e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (key, new_label, new_display_order, old_label, old_display_order)
MENUS = [
    ("members", None, 0, None, 0),
    ("ngos", None, 10, None, 10),
    ("friends", None, 20, None, 30),
    ("fees", None, 30, None, 20),
    ("attendance", None, 40, None, 0),
    ("board", None, 50, None, 40),
    ("admin", None, 60, None, 50),
]

SUBMENUS = [
    ("members.directory", "Directory", 0, "Members — Directory", 0),
    ("members.statistics", "Statistics", 1, "Members — Statistics", 1),
    ("members.email", "Email Members", 2, "Members — Email", 2),
    ("ngos.organisations", "Organisations", 0, "NGOs & Donations — Organisations", 0),
    ("ngos.statistics", "Statistics", 1, "NGOs & Donations — Statistics", 1),
    ("friends.directory", "Directory", 0, "Friends of Rotary — Directory", 0),
    ("friends.statistics", "Statistics", 1, "Friends of Rotary — Statistics", 1),
    ("friends.send_message", "Send Message", 2, "Friends of Rotary — Send Message", 2),
    ("fees.tracking", "Fee tracking", 0, "Member Fees — Tracking", 0),
    ("fees.run", "Fee run", 1, "Member Fees — Run", 1),
    ("fees.settings", "Fee settings", 2, "Member Fees — Settings", 2),
    ("fees.statistics", "Fee statistics", 3, "Member Fees — Statistics", 3),
    ("board.members", "Board Members", 0, "Board — Members", 0),
    ("board.positions", "Position Definitions", 1, "Board — Position Definitions", 1),
    ("admin.member_titles", "Member Titles", 0, "Admin — Member Titles", 0),
    ("admin.honorifics", "Honorifics", 1, "Admin — Honorifics", 4),
    ("admin.currencies", "Currencies", 2, "Admin — Currencies", 1),
    ("admin.ngo_classifications", "NGO Classifications", 3, "Admin — NGO Classifications", 2),
    ("admin.ppt_template", "PPT Template", 4, "Admin — PPT Template", 3),
]


def _apply(bind, rows, label_index: int, order_index: int) -> None:
    for row in rows:
        key = row[0]
        label = row[label_index]
        order = row[order_index]
        if label is not None:
            bind.execute(
                sa.text("UPDATE app_functions SET label = :label WHERE key = :key"),
                {"label": label, "key": key},
            )
        bind.execute(
            sa.text("UPDATE app_functions SET display_order = :order WHERE key = :key"),
            {"order": order, "key": key},
        )


def upgrade() -> None:
    bind = op.get_bind()
    _apply(bind, MENUS, 1, 2)
    _apply(bind, SUBMENUS, 1, 2)


def downgrade() -> None:
    bind = op.get_bind()
    _apply(bind, MENUS, 3, 4)
    _apply(bind, SUBMENUS, 3, 4)
