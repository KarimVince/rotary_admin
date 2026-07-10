"""invoices.view / invoices.manage app functions

Revision ID: f6a1e3c982d5
Revises: e2b7c4f981a3
Create Date: 2026-07-10 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f6a1e3c982d5'
down_revision: Union[str, Sequence[str], None] = 'e2b7c4f981a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        """
        INSERT INTO app_functions (id, key, label, module, display_order, active)
        VALUES
            (gen_random_uuid(), 'invoices.view', 'Invoices — view', 'Member Fees', 0, true),
            (gen_random_uuid(), 'invoices.manage', 'Invoices — manage', 'Member Fees', 1, true)
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(
        "DELETE FROM app_functions WHERE key IN ('invoices.view', 'invoices.manage')"
    )
