"""story16_30_auth_tokens_payload_column

Revision ID: 43027c80c200
Revises: 90ae9a657259
Create Date: 2026-08-18 00:00:02.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '43027c80c200'
down_revision: Union[str, Sequence[str], None] = '90ae9a657259'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("auth_tokens", sa.Column("payload", sa.String(length=255), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("auth_tokens", "payload")
