"""epic5 fee settings & member fees

Revision ID: f3a8c1d92b4e
Revises: 328895770c77
Create Date: 2026-07-07 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3a8c1d92b4e'
down_revision: Union[str, Sequence[str], None] = '328895770c77'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Not created explicitly up front — each Enum is used in exactly one
    # column below (member_fees.price_type / last_channel), and op.create_table
    # emits the CREATE TYPE for it inline.
    fee_price_type = sa.Enum('early_bird', 'full', name='fee_price_type')
    fee_channel = sa.Enum('email', 'whatsapp', 'both', name='fee_channel')

    op.create_table(
        'fee_settings',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('rotary_year', sa.Integer(), nullable=False),
        sa.Column('early_bird_single_price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('early_bird_couple_price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('full_single_price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('full_couple_price', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False, server_default='HKD'),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.CheckConstraint('early_bird_single_price > 0', name='chk_fee_settings_ebs_positive'),
        sa.CheckConstraint('early_bird_couple_price > 0', name='chk_fee_settings_ebc_positive'),
        sa.CheckConstraint('full_single_price > 0', name='chk_fee_settings_fs_positive'),
        sa.CheckConstraint('full_couple_price > 0', name='chk_fee_settings_fc_positive'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('rotary_year'),
    )

    op.create_table(
        'member_fees',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('member_id', sa.UUID(), nullable=False),
        sa.Column('rotary_year', sa.Integer(), nullable=False),
        sa.Column('price_type', fee_price_type, nullable=False),
        sa.Column('is_couple_at_billing', sa.Boolean(), nullable=False),
        sa.Column('amount_due', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('is_paid', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('paid_date', sa.Date(), nullable=True),
        sa.Column('invoice_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('invoice_send_count', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('last_channel', fee_channel, nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('member_id', 'rotary_year'),
    )
    op.create_index('idx_member_fees_year', 'member_fees', ['rotary_year'])
    op.create_index('idx_member_fees_paid', 'member_fees', ['is_paid'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_member_fees_paid', table_name='member_fees')
    op.drop_index('idx_member_fees_year', table_name='member_fees')
    op.drop_table('member_fees')
    op.drop_table('fee_settings')
    sa.Enum(name='fee_channel').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='fee_price_type').drop(op.get_bind(), checkfirst=True)
