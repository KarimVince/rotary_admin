"""Story 15.1 follow-up: NGO/Organisation becomes free text (was a select
from existing Organisations); add Speaker Rotary Contact (member picker)

Revision ID: f7d1e4a8c2b6
Revises: e6b3a9c2f5d8
Create Date: 2026-07-13 14:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = 'f7d1e4a8c2b6'
down_revision = 'e6b3a9c2f5d8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        'fk_attendance_events_ngo_organisation_id', 'attendance_events', type_='foreignkey'
    )
    op.drop_column('attendance_events', 'ngo_organisation_id')
    op.add_column(
        'attendance_events', sa.Column('ngo_organisation_name', sa.String(255), nullable=True)
    )
    op.add_column(
        'attendance_events',
        sa.Column('speaker_rotary_contact_member_id', sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        'fk_attendance_events_speaker_rotary_contact_member_id',
        'attendance_events',
        'members',
        ['speaker_rotary_contact_member_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint(
        'fk_attendance_events_speaker_rotary_contact_member_id',
        'attendance_events',
        type_='foreignkey',
    )
    op.drop_column('attendance_events', 'speaker_rotary_contact_member_id')
    op.drop_column('attendance_events', 'ngo_organisation_name')
    op.add_column(
        'attendance_events', sa.Column('ngo_organisation_id', sa.UUID(), nullable=True)
    )
    op.create_foreign_key(
        'fk_attendance_events_ngo_organisation_id',
        'attendance_events',
        'organisations',
        ['ngo_organisation_id'],
        ['id'],
        ondelete='SET NULL',
    )
