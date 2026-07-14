"""Story 14.1: Event Management module — all tables

Revision ID: d8e4a1c6f3b9
Revises: a3c7f9b2e5d1
Create Date: 2026-07-13 16:00:00.000000

"""
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd8e4a1c6f3b9'
down_revision: Union[str, Sequence[str], None] = 'a3c7f9b2e5d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Story 14.1 AC: "Seed script creates default cost categories and sponsor
# categories" — placeholder defaults (not specified by the story), reviewed
# by the club and edited via the future Setup page (Story 14.3) as needed.
COST_CATEGORIES = [
    "Venue",
    "Catering",
    "Decoration",
    "Entertainment",
    "Printing & Design",
    "Photography & Videography",
    "Audio Visual",
    "Miscellaneous",
]

SPONSOR_CATEGORIES = [
    "Title Sponsor",
    "Platinum",
    "Gold",
    "Silver",
    "Bronze",
    "In-Kind",
]


def upgrade() -> None:
    event_item_type = sa.Enum(
        "auction", "lucky_draw_on_stage", "lucky_draw", name="event_item_type"
    )
    event_item_status = sa.Enum("received", "not_received", name="event_item_status")
    event_guest_payment_status = sa.Enum(
        "paid", "not_paid", name="event_guest_payment_status"
    )

    op.create_table(
        "events",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("hour", sa.Time(), nullable=True),
        sa.Column("venue", sa.String(length=200), nullable=False),
        sa.Column("oc_chair_member_id", sa.UUID(), nullable=True),
        sa.Column("theme", sa.String(length=200), nullable=True),
        sa.Column("rotary_year", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["oc_chair_member_id"], ["members.id"], name="fk_events_oc_chair_member_id",
            ondelete="SET NULL",
        ),
    )

    op.create_table(
        "event_setup",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("ticket_price_normal", sa.Numeric(10, 2), nullable=True),
        sa.Column("ticket_price_early_bird", sa.Numeric(10, 2), nullable=True),
        sa.Column("lucky_draw_ticket_price", sa.Numeric(10, 2), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.id"], name="fk_event_setup_event_id", ondelete="CASCADE"
        ),
        sa.UniqueConstraint("event_id", name="uq_event_setup_event_id"),
    )

    op.create_table(
        "event_table_mapping",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("table_number", sa.Integer(), nullable=False),
        sa.Column("theme_name", sa.String(length=200), nullable=True),
        sa.Column("rotary_name", sa.String(length=200), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.id"], name="fk_event_table_mapping_event_id",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "event_id", "table_number", name="uq_event_table_mapping_event_table"
        ),
    )

    op.create_table(
        "event_guests",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=20), nullable=True),
        sa.Column("surname", sa.String(length=100), nullable=False),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("contact_rotarian_id", sa.UUID(), nullable=True),
        sa.Column(
            "payment_status", event_guest_payment_status, nullable=False,
            server_default="not_paid",
        ),
        sa.Column("early_bird", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("table_number", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.id"], name="fk_event_guests_event_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["contact_rotarian_id"], ["members.id"], name="fk_event_guests_contact_rotarian_id",
            ondelete="SET NULL",
        ),
    )

    op.create_table(
        "event_items",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("lot_ref", sa.String(length=20), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("value_hkd", sa.Numeric(10, 2), nullable=True),
        sa.Column("donor_sponsor", sa.String(length=200), nullable=True),
        sa.Column("contact_rotary_id", sa.UUID(), nullable=True),
        sa.Column("item_type", event_item_type, nullable=False),
        sa.Column("ad_page", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("status", event_item_status, nullable=False, server_default="not_received"),
        sa.Column("value_sold", sa.Numeric(10, 2), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.id"], name="fk_event_items_event_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["contact_rotary_id"], ["members.id"], name="fk_event_items_contact_rotary_id",
            ondelete="SET NULL",
        ),
    )

    op.create_table(
        "event_lucky_draw_config",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("tickets_sold", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("other_donation", sa.Numeric(10, 2), nullable=False, server_default=sa.text("0")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.id"], name="fk_event_lucky_draw_config_event_id",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("event_id", name="uq_event_lucky_draw_config_event_id"),
    )

    op.create_table(
        "event_costs",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False, server_default=sa.text("1")),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("total_cost", sa.Numeric(10, 2), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.id"], name="fk_event_costs_event_id", ondelete="CASCADE"
        ),
    )

    op.create_table(
        "event_sponsors",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=True),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False, server_default=sa.text("1")),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("total_cost", sa.Numeric(10, 2), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.id"], name="fk_event_sponsors_event_id", ondelete="CASCADE"
        ),
    )

    op.create_table(
        "event_rundown",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("time", sa.String(length=50), nullable=False),
        sa.Column("activity", sa.Text(), nullable=False),
        sa.Column("highlight", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.id"], name="fk_event_rundown_event_id", ondelete="CASCADE"
        ),
    )

    op.create_table(
        "event_cost_categories",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "event_sponsor_categories",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    bind = op.get_bind()
    for name in COST_CATEGORIES:
        bind.execute(
            sa.text("INSERT INTO event_cost_categories (id, name) VALUES (:id, :name)"),
            {"id": str(uuid.uuid4()), "name": name},
        )
    for name in SPONSOR_CATEGORIES:
        bind.execute(
            sa.text("INSERT INTO event_sponsor_categories (id, name) VALUES (:id, :name)"),
            {"id": str(uuid.uuid4()), "name": name},
        )


def downgrade() -> None:
    op.drop_table("event_sponsor_categories")
    op.drop_table("event_cost_categories")
    op.drop_table("event_rundown")
    op.drop_table("event_sponsors")
    op.drop_table("event_costs")
    op.drop_table("event_lucky_draw_config")
    op.drop_table("event_items")
    op.drop_table("event_guests")
    op.drop_table("event_table_mapping")
    op.drop_table("event_setup")
    op.drop_table("events")

    bind = op.get_bind()
    for enum_name in ("event_guest_payment_status", "event_item_status", "event_item_type"):
        bind.execute(sa.text(f"DROP TYPE IF EXISTS {enum_name}"))
