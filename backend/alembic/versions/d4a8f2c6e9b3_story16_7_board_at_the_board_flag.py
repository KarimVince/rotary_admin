"""Story 16.7: add at_the_board boolean to board_positions, so a position can
be treated as a formal board seat (permissions/display) independent of
whether it happens to have an active assignment. Existing rows default to
false; President/Treasurer/Secretary are backfilled to true (and kept there,
locked, by the app layer / seed script going forward).

Revision ID: d4a8f2c6e9b3
Revises: c8e1a5f3d9b2
Create Date: 2026-07-19 00:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

revision = "d4a8f2c6e9b3"
down_revision = "c8e1a5f3d9b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "board_positions",
        sa.Column("at_the_board", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.execute(
        "UPDATE board_positions SET at_the_board = true "
        "WHERE name IN ('President', 'Treasurer', 'Secretary')"
    )


def downgrade() -> None:
    op.drop_column("board_positions", "at_the_board")
