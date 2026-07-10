"""epic10 attendance events & records

Revision ID: c3f7a1d8e2b6
Revises: b6d1f4a892ce
Create Date: 2026-07-10 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3f7a1d8e2b6'
down_revision: Union[str, Sequence[str], None] = 'b6d1f4a892ce'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    attendance_event_type = sa.Enum('dinner', 'fellowship', name='attendance_event_type')
    attendance_member_status_snapshot = sa.Enum(
        'active', 'honorary', 'past', name='attendance_member_status_snapshot'
    )

    op.create_table(
        'attendance_events',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('event_date', sa.Date(), nullable=False),
        sa.Column('event_type', attendance_event_type, nullable=False),
        sa.Column('rotary_year', sa.Integer(), nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_attendance_events_date', 'attendance_events', ['event_date'])
    op.create_index('idx_attendance_events_rotary_year', 'attendance_events', ['rotary_year'])

    op.create_table(
        'attendance_records',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('event_id', sa.UUID(), nullable=False),
        sa.Column('member_id', sa.UUID(), nullable=False),
        sa.Column('present', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('member_status_snapshot', attendance_member_status_snapshot, nullable=False),
        sa.Column('recorded_by', sa.UUID(), nullable=True),
        sa.Column(
            'recorded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.ForeignKeyConstraint(['event_id'], ['attendance_events.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['recorded_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('event_id', 'member_id', name='uq_attendance_records_event_member'),
    )
    op.create_index('idx_attendance_records_event', 'attendance_records', ['event_id'])
    op.create_index('idx_attendance_records_member', 'attendance_records', ['member_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_attendance_records_member', table_name='attendance_records')
    op.drop_index('idx_attendance_records_event', table_name='attendance_records')
    op.drop_table('attendance_records')
    op.drop_index('idx_attendance_events_rotary_year', table_name='attendance_events')
    op.drop_index('idx_attendance_events_date', table_name='attendance_events')
    op.drop_table('attendance_events')
    sa.Enum(name='attendance_member_status_snapshot').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='attendance_event_type').drop(op.get_bind(), checkfirst=True)
