"""board assignment history support + board app functions

Revision ID: e2b7c4f981a3
Revises: d4e6b9a1f5c7
Create Date: 2026-07-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2b7c4f981a3'
down_revision: Union[str, Sequence[str], None] = 'd4e6b9a1f5c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Story 9.5 requires reassigning a position to end the prior holder's row
    # (end_date = today) rather than overwrite it, so multiple historical rows
    # per (board_position_id, rotary_year) must be allowed — only one *active*
    # (end_date IS NULL) row per position/year is enforced.
    op.drop_constraint(
        'uq_board_position_assignments_position_year',
        'board_position_assignments',
        type_='unique',
    )
    op.create_index(
        'uq_board_position_assignments_active_position_year',
        'board_position_assignments',
        ['board_position_id', 'rotary_year'],
        unique=True,
        postgresql_where=sa.text('end_date IS NULL'),
    )

    op.execute(
        """
        INSERT INTO app_functions (id, key, label, module, display_order, active)
        VALUES
            (gen_random_uuid(), 'board-view-assignments', 'Board — view assignments', 'Board', 0, true),
            (gen_random_uuid(), 'board-manage-assignments', 'Board — manage assignments', 'Board', 1, true)
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(
        "DELETE FROM app_functions WHERE key IN "
        "('board-view-assignments', 'board-manage-assignments')"
    )
    op.drop_index(
        'uq_board_position_assignments_active_position_year',
        table_name='board_position_assignments',
    )
    op.create_unique_constraint(
        'uq_board_position_assignments_position_year',
        'board_position_assignments',
        ['board_position_id', 'rotary_year'],
    )
