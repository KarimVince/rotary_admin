"""add exchange rates table

Revision ID: 328895770c77
Revises: a570b177349c
Create Date: 2026-07-06 19:51:30.705644

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '328895770c77'
down_revision: Union[str, Sequence[str], None] = 'a570b177349c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'exchange_rates',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('currency_code', sa.String(length=3), nullable=False),
        sa.Column('rate_to_hkd', sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column('rate_to_usd', sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column('updated_by', sa.UUID(), nullable=True),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('currency_code'),
    )

    # Seed HKD and USD with a self-rate of 1.0 so conversion math is uniform
    # (a donation already in HKD or USD needs no lookup-miss handling).
    op.execute(
        "INSERT INTO exchange_rates (currency_code, rate_to_hkd, rate_to_usd) "
        "VALUES ('HKD', 1.0, 0.128), ('USD', 7.8, 1.0)"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('exchange_rates')
