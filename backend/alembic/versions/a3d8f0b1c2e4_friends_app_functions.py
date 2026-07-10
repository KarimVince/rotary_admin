"""friends.view / friends.send_email app functions

Revision ID: a3d8f0b1c2e4
Revises: f6a1e3c982d5
Create Date: 2026-07-11 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a3d8f0b1c2e4'
down_revision: Union[str, Sequence[str], None] = 'f6a1e3c982d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        """
        INSERT INTO app_functions (id, key, label, module, display_order, active)
        VALUES
            (gen_random_uuid(), 'friends.view', 'Friends of Rotary — view', 'Friends of Rotary', 0, true),
            (gen_random_uuid(), 'friends.send_email', 'Friends of Rotary — send email', 'Friends of Rotary', 1, true)
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(
        "DELETE FROM app_functions WHERE key IN ('friends.view', 'friends.send_email')"
    )
