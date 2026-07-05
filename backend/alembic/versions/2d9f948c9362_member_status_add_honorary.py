"""member_status add honorary

Revision ID: 2d9f948c9362
Revises: d15d83a56300
Create Date: 2026-07-05 18:23:44.812235

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2d9f948c9362'
down_revision: Union[str, Sequence[str], None] = 'd15d83a56300'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add 'honorary' to the member_status enum.

    Existing rows are untouched — 'active'/'past' remain valid, no data loss.
    ADD VALUE can't run inside the same transaction it's used in on some PG
    versions, so it's run in its own autocommit block per Alembic convention.
    """
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE member_status ADD VALUE IF NOT EXISTS 'honorary'")


def downgrade() -> None:
    """Remove 'honorary' from member_status (Postgres has no DROP VALUE).

    Any honorary members are reassigned to 'active' first — lossy, but the
    alternative (blocking downgrade entirely) is worse for a dev rollback.
    """
    op.execute("UPDATE members SET status = 'active' WHERE status = 'honorary'")
    op.execute("ALTER TABLE members ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TYPE member_status RENAME TO member_status_old")
    op.execute("CREATE TYPE member_status AS ENUM ('active', 'past')")
    op.execute(
        "ALTER TABLE members ALTER COLUMN status TYPE member_status "
        "USING status::text::member_status"
    )
    op.execute(
        "ALTER TABLE members ALTER COLUMN status SET DEFAULT 'active'"
    )
    op.execute("DROP TYPE member_status_old")
