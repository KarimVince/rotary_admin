"""organisations.is_club_project flag; replace the "Internal Club Project"
classification with it.

Revision ID: b8d2f4a6c1e3
Revises: a7c3e9f1d2b4
Create Date: 2026-11-07 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b8d2f4a6c1e3"
down_revision: Union[str, Sequence[str], None] = "a7c3e9f1d2b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organisations",
        sa.Column("is_club_project", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    # Carry over anything already classified "Internal Club Project", then
    # drop that classification (a project's cause is its own classification).
    op.execute(
        """
        UPDATE organisations SET is_club_project = true, classification_id = NULL
        WHERE classification_id IN (SELECT id FROM ngo_classifications WHERE name = 'Internal Club Project')
        """
    )
    op.execute("DELETE FROM ngo_classifications WHERE name = 'Internal Club Project'")


def downgrade() -> None:
    op.drop_column("organisations", "is_club_project")
