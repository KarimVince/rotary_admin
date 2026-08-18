"""important_information table + admin.important_information app function

Revision ID: 7c71ddab138e
Revises: 43027c80c200
Create Date: 2026-08-18 00:00:03.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '7c71ddab138e'
down_revision: Union[str, Sequence[str], None] = '43027c80c200'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KEY = "admin.important_information"


def upgrade() -> None:
    important_information_status_enum = postgresql.ENUM(
        "active", "archived", name="important_information_status", create_type=False
    )
    important_information_status_enum.create(op.get_bind())

    op.create_table(
        "important_information_messages",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("title", sa.String(length=150), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("status", important_information_status_enum, nullable=False, server_default="active"),
        sa.Column(
            "created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Belt-and-suspenders: at most one row can have status='active' — a
    # partial unique index on the status column, scoped to rows where
    # status='active', so two simultaneously-active rows collide on the
    # index even though 'archived' rows (which repeat freely) never touch it.
    op.create_index(
        "uq_important_information_single_active",
        "important_information_messages",
        ["status"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )

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
            "label": "Important Information",
            "module": "Admin",
            "parent_id": admin_menu_id,
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
    op.drop_index("uq_important_information_single_active", table_name="important_information_messages")
    op.drop_table("important_information_messages")
    postgresql.ENUM(name="important_information_status").drop(op.get_bind(), checkfirst=True)
