"""Story 17.5: finance_categories/operational_entries tables + app functions

Revision ID: c3e7a1f4d9b5
Revises: b2d6f8a3e5c1
Create Date: 2026-07-23 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c3e7a1f4d9b5'
down_revision: Union[str, Sequence[str], None] = 'b2d6f8a3e5c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FINANCE_KEY = "finance.operational"
ADMIN_KEY = "admin.finance_categories"


def upgrade() -> None:
    op.create_table(
        "finance_categories",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column(
            "type",
            sa.Enum("revenue", "cost", name="finance_category_type"),
            nullable=False,
        ),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "operational_entries",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("rotary_year", sa.Integer(), nullable=False),
        sa.Column(
            "type", sa.Enum("revenue", "cost", name="operational_entry_type"), nullable=False
        ),
        sa.Column("category_id", sa.UUID(), nullable=True),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "source",
            sa.Enum("manual", "member_fees", "event", name="operational_entry_source"),
            server_default="manual",
            nullable=False,
        ),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["category_id"], ["finance_categories.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_operational_entries_year", "operational_entries", ["rotary_year"], unique=False
    )

    bind = op.get_bind()
    finance_menu_id = bind.execute(
        sa.text("SELECT id FROM app_functions WHERE key = 'finance'")
    ).scalar_one()
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
            "key": FINANCE_KEY,
            "label": "Club Operational Tracking",
            "module": "Finance",
            "parent_id": finance_menu_id,
            "order": 2,
        },
    )
    bind.execute(
        sa.text(
            """
            INSERT INTO app_functions (id, key, label, module, parent_id, display_order, active)
            VALUES (gen_random_uuid(), :key, :label, :module, :parent_id, :order, true)
            """
        ),
        {
            "key": ADMIN_KEY,
            "label": "Finance Categories",
            "module": "Admin",
            "parent_id": admin_menu_id,
            "order": 5,
        },
    )


def downgrade() -> None:
    bind = op.get_bind()
    for key in (FINANCE_KEY, ADMIN_KEY):
        bind.execute(
            sa.text(
                "DELETE FROM permission_matrix WHERE app_function_id IN "
                "(SELECT id FROM app_functions WHERE key = :key)"
            ),
            {"key": key},
        )
        bind.execute(sa.text("DELETE FROM app_functions WHERE key = :key"), {"key": key})

    op.drop_index("idx_operational_entries_year", table_name="operational_entries")
    op.drop_table("operational_entries")
    op.drop_table("finance_categories")
    op.execute("DROP TYPE IF EXISTS operational_entry_source")
    op.execute("DROP TYPE IF EXISTS operational_entry_type")
    op.execute("DROP TYPE IF EXISTS finance_category_type")
