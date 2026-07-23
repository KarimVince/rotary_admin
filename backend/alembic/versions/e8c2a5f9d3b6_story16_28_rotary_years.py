"""Story 16.28: rotary_years table + admin.rotary_years app function

Revision ID: e8c2a5f9d3b6
Revises: d4f8b2e6c1a7
Create Date: 2026-07-24 00:00:00.000000

"""
from datetime import date
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e8c2a5f9d3b6'
down_revision: Union[str, Sequence[str], None] = 'd4f8b2e6c1a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ADMIN_ROTARY_YEARS_KEY = "admin.rotary_years"


def _current_rotary_year() -> int:
    today = date.today()
    return today.year if today.month >= 7 else today.year - 1


def upgrade() -> None:
    op.create_table(
        "rotary_years",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("is_current", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("year"),
    )

    bind = op.get_bind()

    # Seed a sensible default range so existing dev/prod DBs aren't left
    # with an empty picker on every page immediately after migrating.
    current_year = _current_rotary_year()
    for year in range(current_year - 2, current_year + 2):
        bind.execute(
            sa.text(
                "INSERT INTO rotary_years (id, year, is_current) "
                "VALUES (gen_random_uuid(), :year, :is_current)"
            ),
            {"year": year, "is_current": year == current_year},
        )

    admin_menu_id = bind.execute(
        sa.text("SELECT id FROM app_functions WHERE key = 'admin'")
    ).scalar_one()
    max_order = bind.execute(
        sa.text(
            "SELECT COALESCE(MAX(display_order), -1) FROM app_functions WHERE parent_id = :parent_id"
        ),
        {"parent_id": admin_menu_id},
    ).scalar_one()
    bind.execute(
        sa.text(
            """
            INSERT INTO app_functions (id, key, label, module, parent_id, display_order, active)
            VALUES (gen_random_uuid(), :key, :label, :module, :parent_id, :order, true)
            """
        ),
        {
            "key": ADMIN_ROTARY_YEARS_KEY,
            "label": "Rotary Years",
            "module": "Admin",
            "parent_id": admin_menu_id,
            "order": max_order + 1,
        },
    )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "DELETE FROM permission_matrix WHERE app_function_id IN "
            "(SELECT id FROM app_functions WHERE key = :key)"
        ),
        {"key": ADMIN_ROTARY_YEARS_KEY},
    )
    bind.execute(
        sa.text("DELETE FROM app_functions WHERE key = :key"), {"key": ADMIN_ROTARY_YEARS_KEY}
    )
    op.drop_table("rotary_years")
