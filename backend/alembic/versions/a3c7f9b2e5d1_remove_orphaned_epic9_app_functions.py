"""Remove 6 orphaned Epic 9 app_functions rows, superseded by Epic 12's
Permission Matrix Hierarchy Revamp (board-view-assignments,
board-manage-assignments, invoices.view, invoices.manage, friends.view,
friends.send_email).

Confirmed dead: none of these 6 keys appear as an argument to
require_access()/useAccess() anywhere in backend/app or frontend/src — the
only hits are stale test-description strings and comments predating Epic 12.
All 6 rows already have active=false, so `GET /app-functions` (which filters
to active=true) never returns them and they don't render in the Permission
Matrix admin page today; this migration just removes the dead data.

Revision ID: a3c7f9b2e5d1
Revises: f7d1e4a8c2b6
Create Date: 2026-07-13 15:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = 'a3c7f9b2e5d1'
down_revision = 'f7d1e4a8c2b6'
branch_labels = None
depends_on = None

# (key, label, module, display_order) — all had parent_id NULL, active=false
ORPHANED_ROWS = [
    ("board-view-assignments", "Board — view assignments", "Board", 0),
    ("board-manage-assignments", "Board — manage assignments", "Board", 1),
    ("invoices.view", "Invoices — view", "Member Fees", 0),
    ("invoices.manage", "Invoices — manage", "Member Fees", 1),
    ("friends.view", "Friends of Rotary — view", "Friends of Rotary", 0),
    ("friends.send_email", "Friends of Rotary — send email", "Friends of Rotary", 1),
]

KEYS = [row[0] for row in ORPHANED_ROWS]


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "DELETE FROM permission_matrix WHERE app_function_id IN "
            "(SELECT id FROM app_functions WHERE key IN :keys)"
        ).bindparams(sa.bindparam("keys", expanding=True)),
        {"keys": KEYS},
    )
    bind.execute(
        sa.text("DELETE FROM app_functions WHERE key IN :keys").bindparams(
            sa.bindparam("keys", expanding=True)
        ),
        {"keys": KEYS},
    )


def downgrade() -> None:
    bind = op.get_bind()
    for key, label, module, order in ORPHANED_ROWS:
        bind.execute(
            sa.text(
                """
                INSERT INTO app_functions (id, key, label, module, parent_id, display_order, active)
                VALUES (gen_random_uuid(), :key, :label, :module, NULL, :order, false)
                """
            ),
            {"key": key, "label": label, "module": module, "order": order},
        )
