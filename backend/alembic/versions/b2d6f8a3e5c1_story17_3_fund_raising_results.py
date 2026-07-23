"""Story 17.3: adhoc_donations table + finance.fundraising app function

Revision ID: b2d6f8a3e5c1
Revises: a1c5e9f2d7b3
Create Date: 2026-07-23 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b2d6f8a3e5c1'
down_revision: Union[str, Sequence[str], None] = 'a1c5e9f2d7b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KEY = "finance.fundraising"


def upgrade() -> None:
    op.create_table(
        "adhoc_donations",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("rotary_year", sa.Integer(), nullable=False),
        sa.Column("donation_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(length=300), nullable=False),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_adhoc_donations_year", "adhoc_donations", ["rotary_year"], unique=False
    )

    bind = op.get_bind()
    finance_menu_id = bind.execute(
        sa.text("SELECT id FROM app_functions WHERE key = 'finance'")
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
            "label": "Fund Raising Results",
            "module": "Finance",
            "parent_id": finance_menu_id,
            "order": 1,
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

    op.drop_index("idx_adhoc_donations_year", table_name="adhoc_donations")
    op.drop_table("adhoc_donations")
