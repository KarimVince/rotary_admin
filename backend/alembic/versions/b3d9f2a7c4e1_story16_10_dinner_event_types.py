"""Story 16.10: dinner_event_types table + seed + attendance_events.event_type enum->varchar

Revision ID: b3d9f2a7c4e1
Revises: a4e6c8f1b2d9
Create Date: 2026-07-18 00:00:00.000000

"""
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b3d9f2a7c4e1'
down_revision: Union[str, Sequence[str], None] = 'a4e6c8f1b2d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (name, color_bg, color_text) — matches the tokens the two types already
# rendered with before this story made them admin-configurable.
SEED_TYPES = [
    ("Dinner", "#e3edfb", "#17458f"),
    ("Fellowship", "#ece7fb", "#5b3fa0"),
]


def upgrade() -> None:
    op.create_table(
        'dinner_event_types',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('color_bg', sa.String(length=20), nullable=True),
        sa.Column('color_text', sa.String(length=20), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    bind = op.get_bind()
    for sort_order, (name, color_bg, color_text) in enumerate(SEED_TYPES):
        bind.execute(
            sa.text(
                """
                INSERT INTO dinner_event_types (id, name, color_bg, color_text, sort_order)
                VALUES (:id, :name, :color_bg, :color_text, :sort_order)
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "name": name,
                "color_bg": color_bg,
                "color_text": color_text,
                "sort_order": sort_order,
            },
        )

    # attendance_events.event_type was a fixed 2-value Postgres enum
    # ("dinner"/"fellowship") — now a plain varchar holding the exact name
    # of a dinner_event_types row, so admins can add types without a
    # migration. Convert the column, then rewrite existing lowercase enum
    # values to match the seeded display names above.
    op.execute("ALTER TABLE attendance_events ALTER COLUMN event_type TYPE VARCHAR(50) USING event_type::text")
    op.execute("UPDATE attendance_events SET event_type = 'Dinner' WHERE event_type = 'dinner'")
    op.execute("UPDATE attendance_events SET event_type = 'Fellowship' WHERE event_type = 'fellowship'")
    op.execute("DROP TYPE attendance_event_type")


def downgrade() -> None:
    op.execute("CREATE TYPE attendance_event_type AS ENUM ('dinner', 'fellowship')")
    op.execute("UPDATE attendance_events SET event_type = 'dinner' WHERE event_type = 'Dinner'")
    op.execute("UPDATE attendance_events SET event_type = 'fellowship' WHERE event_type = 'Fellowship'")
    # Any custom type name added after this migration ran has no lowercase
    # enum equivalent — fall back to 'dinner' rather than leaving a value
    # the enum type can't hold.
    op.execute(
        "UPDATE attendance_events SET event_type = 'dinner' "
        "WHERE event_type NOT IN ('dinner', 'fellowship')"
    )
    op.execute(
        "ALTER TABLE attendance_events ALTER COLUMN event_type TYPE attendance_event_type "
        "USING event_type::attendance_event_type"
    )
    op.drop_table('dinner_event_types')
