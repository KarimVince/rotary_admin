"""connection_logs table + admin.connection_log app function

Revision ID: ec721acfb227
Revises: 7c71ddab138e
Create Date: 2026-08-19 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'ec721acfb227'
down_revision: Union[str, Sequence[str], None] = '7c71ddab138e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KEY = "admin.connection_log"


def upgrade() -> None:
    op.create_table(
        "connection_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_connection_logs_user_id", "connection_logs", ["user_id"])
    op.create_index("ix_connection_logs_created_at", "connection_logs", ["created_at"])

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
            "label": "Login Audit Log",
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
    op.drop_index("ix_connection_logs_created_at", table_name="connection_logs")
    op.drop_index("ix_connection_logs_user_id", table_name="connection_logs")
    op.drop_table("connection_logs")
