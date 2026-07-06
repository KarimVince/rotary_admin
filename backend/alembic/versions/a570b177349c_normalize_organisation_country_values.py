"""normalize organisation country values

Data-only migration (no schema change): as of this revision, `country` on
organisations moves from free text to the same fixed country list used by
Members.nationality (see app/core/countries.py, Story 2b.10). Existing rows
may hold values entered before that list existed.

Reuses the same alias map as d15d83a56300 (member nationality normalization)
and, like that migration, prints any remaining out-of-list values for manual
review rather than guessing.

Revision ID: a570b177349c
Revises: e8b9583b733d
Create Date: 2026-07-06 19:45:16.123681

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a570b177349c'
down_revision: Union[str, Sequence[str], None] = 'e8b9583b733d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COUNTRY_ALIASES = {
    "USA": "United States",
    "US": "United States",
    "U.S.": "United States",
    "U.S.A.": "United States",
    "United State": "United States",
    "American": "United States",
    "UK": "United Kingdom",
    "U.K.": "United Kingdom",
    "Britain": "United Kingdom",
    "British": "United Kingdom",
    "England": "United Kingdom",
    "Chinese": "China",
    "PRC": "China",
    "French": "France",
    "German": "Germany",
    "Spanish": "Spain",
    "Italian": "Italy",
    "Dutch": "Netherlands",
    "Holland": "Netherlands",
    "Swiss": "Switzerland",
    "Korean": "South Korea",
    "Korea": "South Korea",
    "Filipino": "Philippines",
    "Vietnamese": "Vietnam",
    "Emirati": "United Arab Emirates",
    "UAE": "United Arab Emirates",
    "Russian": "Russia",
    "Ivorian": "Ivory Coast",
    "Congolese": "Democratic Republic of the Congo",
    "Burmese": "Myanmar",
    "HK": "Hong Kong",
}


def upgrade() -> None:
    """Normalize known country aliases; flag anything else for review."""
    from app.core.countries import COUNTRIES

    bind = op.get_bind()

    for alias, canonical in COUNTRY_ALIASES.items():
        bind.execute(
            sa.text("UPDATE organisations SET country = :canonical WHERE country = :alias"),
            {"canonical": canonical, "alias": alias},
        )

    remaining = bind.execute(
        sa.text("SELECT DISTINCT country FROM organisations WHERE country IS NOT NULL")
    ).scalars().all()
    unmapped = sorted(value for value in remaining if value not in COUNTRIES)

    if unmapped:
        print(
            "\n[organisation country normalization] The following country values do "
            "not match the fixed country list and were left as-is for manual review:\n  - "
            + "\n  - ".join(unmapped)
            + "\nUpdate these organisation records by hand (or extend COUNTRY_ALIASES in "
            "this migration and re-run) — they will fail validation on next edit.\n"
        )


def downgrade() -> None:
    """Data-only cleanup — not reversible, no-op."""
    pass
