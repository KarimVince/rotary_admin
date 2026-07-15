"""drop member_applications.whatsapp_sent_at (WhatsApp placeholders removed)

Revision ID: 9a35449ad456
Revises: eaf02df03fb8
Create Date: 2026-07-15

WhatsApp send is deferred (Epic 8, no provider chosen yet) — this column
backed a manual "mark sent via WhatsApp" placeholder checkbox that has been
removed from the app, since it never actually sent anything.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9a35449ad456"
down_revision: str | None = "eaf02df03fb8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("member_applications", "whatsapp_sent_at")


def downgrade() -> None:
    op.add_column(
        "member_applications",
        sa.Column("whatsapp_sent_at", sa.DateTime(timezone=True), nullable=True),
    )
