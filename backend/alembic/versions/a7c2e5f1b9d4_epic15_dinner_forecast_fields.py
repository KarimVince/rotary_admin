"""Epic 15: dinner forecast fields on attendance_events (location, speaker,
NGO, topics, soft-delete)

Revision ID: a7c2e5f1b9d4
Revises: d3f8b2a7c1e9
Create Date: 2026-07-13 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a7c2e5f1b9d4'
down_revision: Union[str, Sequence[str], None] = 'd3f8b2a7c1e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('attendance_events', sa.Column('location', sa.String(200), nullable=True))
    op.add_column(
        'attendance_events', sa.Column('speaker_name', sa.String(200), nullable=True)
    )
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
    op.add_column(
        'attendance_events', sa.Column('topics_description', sa.Text(), nullable=True)
    )
    op.add_column(
        'attendance_events',
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('attendance_events', 'deleted_at')
    op.drop_column('attendance_events', 'topics_description')
    op.drop_constraint(
        'fk_attendance_events_ngo_organisation_id', 'attendance_events', type_='foreignkey'
    )
    op.drop_column('attendance_events', 'ngo_organisation_id')
    op.drop_column('attendance_events', 'speaker_name')
    op.drop_column('attendance_events', 'location')
