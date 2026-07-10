"""epic11 ngo classifications table + seed + organisations FK

Revision ID: e5c2a9f4b7d1
Revises: d8b3f6c1a9e7
Create Date: 2026-07-13 09:00:00.000000

"""
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e5c2a9f4b7d1'
down_revision: Union[str, Sequence[str], None] = 'd8b3f6c1a9e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Story 11.1 seed list, in display order.
CLASSIFICATIONS = [
    "Health & Medical",
    "Education & Literacy",
    "Environment & Climate",
    "Human Rights & Justice",
    "Poverty Alleviation & Social Welfare",
    "Women & Gender Equality",
    "Youth Development",
    "Economic Development & Microfinance",
    "Humanitarian Relief & Disaster Response",
    "Arts, Culture & Heritage",
    "Animal Welfare",
    "Technology & Digital Rights",
]


def upgrade() -> None:
    op.create_table(
        'ngo_classifications',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    bind = op.get_bind()
    for position, name in enumerate(CLASSIFICATIONS):
        bind.execute(
            sa.text(
                """
                INSERT INTO ngo_classifications (id, name, position)
                VALUES (:id, :name, :position)
                """
            ),
            {"id": str(uuid.uuid4()), "name": name, "position": position},
        )

    op.add_column('organisations', sa.Column('classification_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_organisations_classification_id',
        'organisations',
        'ngo_classifications',
        ['classification_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index(
        'idx_organisations_classification_id', 'organisations', ['classification_id']
    )


def downgrade() -> None:
    op.drop_index('idx_organisations_classification_id', table_name='organisations')
    op.drop_constraint('fk_organisations_classification_id', 'organisations', type_='foreignkey')
    op.drop_column('organisations', 'classification_id')
    op.drop_table('ngo_classifications')
