"""story16_22_rename_ngo_services_project

Data-only migration (no schema change): renames the "NGOs & Donations"
module to "NGO & Services Project" in app_functions.label/module, following
the pattern of d2e5c8b1f4a7's label tidy-up. The frontend nav/module-link
labels (AppLayout.jsx, Dashboard.jsx — not backend-driven) are updated in
the same story, separately.

Revision ID: 0535268abe4b
Revises: a7adb8aeea4a
Create Date: 2026-07-22 10:38:55.306377

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0535268abe4b'
down_revision: Union[str, Sequence[str], None] = 'a7adb8aeea4a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_NAME = "NGOs & Donations"
NEW_NAME = "NGO & Services Project"


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    bind.execute(
        sa.text("UPDATE app_functions SET label = :new WHERE key = 'ngos' AND label = :old"),
        {"new": NEW_NAME, "old": OLD_NAME},
    )
    bind.execute(sa.text("UPDATE app_functions SET module = :new WHERE module = :old"), {"new": NEW_NAME, "old": OLD_NAME})


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    bind.execute(
        sa.text("UPDATE app_functions SET label = :old WHERE key = 'ngos' AND label = :new"),
        {"new": NEW_NAME, "old": OLD_NAME},
    )
    bind.execute(sa.text("UPDATE app_functions SET module = :old WHERE module = :new"), {"new": NEW_NAME, "old": OLD_NAME})
