"""epic9 board roles & access control

Revision ID: d4e6b9a1f5c7
Revises: a1c4e7f2b93d
Create Date: 2026-07-10 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e6b9a1f5c7'
down_revision: Union[str, Sequence[str], None] = 'a1c4e7f2b93d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    access_level = sa.Enum('no_access', 'read', 'write', name='access_level')

    op.create_table(
        'board_positions',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    op.create_table(
        'app_functions',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('key', sa.String(length=100), nullable=False),
        sa.Column('label', sa.String(length=150), nullable=False),
        sa.Column('module', sa.String(length=100), nullable=False),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key'),
    )

    op.create_table(
        'board_position_assignments',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('board_position_id', sa.UUID(), nullable=False),
        sa.Column('member_id', sa.UUID(), nullable=False),
        sa.Column('rotary_year', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False
        ),
        sa.ForeignKeyConstraint(['board_position_id'], ['board_positions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['member_id'], ['members.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'board_position_id', 'rotary_year', name='uq_board_position_assignments_position_year'
        ),
    )

    op.create_table(
        'permission_matrix',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('board_position_id', sa.UUID(), nullable=True),
        sa.Column('app_function_id', sa.UUID(), nullable=False),
        sa.Column('access_level', access_level, nullable=False),
        sa.Column('is_default_user', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.ForeignKeyConstraint(['board_position_id'], ['board_positions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['app_function_id'], ['app_functions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'board_position_id', 'app_function_id', name='uq_permission_matrix_position_function'
        ),
        sa.CheckConstraint(
            '(is_default_user = true AND board_position_id IS NULL) '
            'OR (is_default_user = false AND board_position_id IS NOT NULL)',
            name='chk_permission_matrix_default_user_no_position',
        ),
    )
    op.create_index(
        'uq_permission_matrix_default_user_function',
        'permission_matrix',
        ['app_function_id'],
        unique=True,
        postgresql_where=sa.text('is_default_user = true'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('uq_permission_matrix_default_user_function', table_name='permission_matrix')
    op.drop_table('permission_matrix')
    op.drop_table('board_position_assignments')
    op.drop_table('app_functions')
    op.drop_table('board_positions')
    sa.Enum(name='access_level').drop(op.get_bind(), checkfirst=True)
