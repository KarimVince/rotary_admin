"""Story 8.3: honorifics lookup table, new member fields, member_applications

Revision ID: d3f8b2a7c1e9
Revises: c9e1a4f7d3b8
Create Date: 2026-07-12 11:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd3f8b2a7c1e9'
down_revision: Union[str, Sequence[str], None] = 'c9e1a4f7d3b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ADMIN_HONORIFICS_KEY = "admin.honorifics"

HONORIFICS = [
    ("MR", "Mr.", 0),
    ("MRS", "Mrs.", 1),
    ("MS", "Ms.", 2),
    ("MISS", "Miss", 3),
    ("DR", "Dr.", 4),
    ("PROF", "Prof.", 5),
]


def upgrade() -> None:
    op.create_table(
        'honorifics',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), primary_key=True),
        sa.Column('code', sa.String(length=10), nullable=False),
        sa.Column('label', sa.String(length=100), nullable=False),
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('code'),
    )

    bind = op.get_bind()
    for code, label, sort_order in HONORIFICS:
        bind.execute(
            sa.text(
                "INSERT INTO honorifics (id, code, label, sort_order, is_active) "
                "VALUES (gen_random_uuid(), :code, :label, :sort_order, true)"
            ),
            {"code": code, "label": label, "sort_order": sort_order},
        )

    op.add_column('members', sa.Column('honorific_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_members_honorific', 'members', 'honorifics', ['honorific_id'], ['id']
    )
    op.create_index('idx_members_honorific', 'members', ['honorific_id'])
    op.add_column('members', sa.Column('company_name', sa.String(length=200), nullable=True))
    op.add_column('members', sa.Column('position', sa.String(length=200), nullable=True))
    op.add_column('members', sa.Column('proposer_name', sa.String(length=200), nullable=True))

    op.create_table(
        'member_applications',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), primary_key=True),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('phone', sa.String(length=30), nullable=True),
        sa.Column('pdf_filename', sa.String(length=255), nullable=False),
        sa.Column('email_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('whatsapp_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', sa.UUID(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    admin_menu_id = bind.execute(
        sa.text("SELECT id FROM app_functions WHERE key = 'admin'")
    ).scalar_one()
    bind.execute(
        sa.text(
            """
            INSERT INTO app_functions (id, key, label, module, parent_id, display_order, active)
            VALUES (gen_random_uuid(), :key, :label, :module, :parent_id, :order, true)
            """
        ),
        {
            "key": ADMIN_HONORIFICS_KEY,
            "label": "Admin — Honorifics",
            "module": "Admin",
            "parent_id": admin_menu_id,
            "order": 4,
        },
    )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "DELETE FROM permission_matrix WHERE app_function_id IN "
            "(SELECT id FROM app_functions WHERE key = :key)"
        ),
        {"key": ADMIN_HONORIFICS_KEY},
    )
    bind.execute(sa.text("DELETE FROM app_functions WHERE key = :key"), {"key": ADMIN_HONORIFICS_KEY})

    op.drop_table('member_applications')

    op.drop_column('members', 'proposer_name')
    op.drop_column('members', 'position')
    op.drop_column('members', 'company_name')
    op.drop_index('idx_members_honorific', table_name='members')
    op.drop_constraint('fk_members_honorific', 'members', type_='foreignkey')
    op.drop_column('members', 'honorific_id')

    op.drop_table('honorifics')
