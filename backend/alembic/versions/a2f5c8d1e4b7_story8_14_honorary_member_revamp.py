"""Story 8.14: honorary member revamp (is_honorary field, drop status value)

Revision ID: a2f5c8d1e4b7
Revises: f1a4d7c3e9b2
Create Date: 2026-07-11 09:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a2f5c8d1e4b7'
down_revision: Union[str, Sequence[str], None] = 'f1a4d7c3e9b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    op.add_column(
        'members',
        sa.Column('is_honorary', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )

    # Move existing honorary members: is_honorary=true, status='active'.
    bind.execute(
        sa.text("UPDATE members SET is_honorary = true, status = 'active' WHERE status = 'honorary'")
    )

    # Postgres can't drop a value from an existing enum type directly —
    # recreate it without 'honorary'. The column default has to be dropped
    # first: Postgres can't auto-cast an enum default across a type change.
    op.execute("ALTER TABLE members ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TYPE member_status RENAME TO member_status_old")
    op.execute("CREATE TYPE member_status AS ENUM ('active', 'past')")
    op.execute(
        "ALTER TABLE members ALTER COLUMN status TYPE member_status "
        "USING status::text::member_status"
    )
    op.execute("ALTER TABLE members ALTER COLUMN status SET DEFAULT 'active'")
    op.execute("DROP TYPE member_status_old")


def downgrade() -> None:
    op.execute("ALTER TABLE members ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TYPE member_status RENAME TO member_status_new")
    op.execute("CREATE TYPE member_status AS ENUM ('active', 'honorary', 'past')")
    op.execute(
        "ALTER TABLE members ALTER COLUMN status TYPE member_status "
        "USING status::text::member_status"
    )
    op.execute("ALTER TABLE members ALTER COLUMN status SET DEFAULT 'active'")
    op.execute("DROP TYPE member_status_new")

    bind = op.get_bind()
    bind.execute(sa.text("UPDATE members SET status = 'honorary' WHERE is_honorary = true"))

    op.drop_column('members', 'is_honorary')
