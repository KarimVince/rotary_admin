"""normalize member nationality values

Data-only migration (no schema change): as of this revision, `nationality`
moves from free text to a fixed country list (see app/core/countries.py).
Existing rows may hold values entered before that list existed (adjective
forms, abbreviations, misspellings — e.g. "Chinese"/"USA"/"United State").

This migration rewrites known aliases to their canonical name and prints any
remaining out-of-list values for manual review. It intentionally does not
guess at unknown values — silently mangling data is worse than leaving it for
a human to fix.

Revision ID: d15d83a56300
Revises: 4a7cd0a31ae3
Create Date: 2026-07-05 18:09:31.721495

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd15d83a56300'
down_revision: Union[str, Sequence[str], None] = '4a7cd0a31ae3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Common variants seen in free-text nationality fields, mapped to the
# canonical name in app/core/countries.py. Not exhaustive by design.
NATIONALITY_ALIASES = {
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
}


def upgrade() -> None:
    """Normalize known nationality aliases; flag anything else for review."""
    from app.core.countries import COUNTRIES

    bind = op.get_bind()

    for alias, canonical in NATIONALITY_ALIASES.items():
        bind.execute(
            sa.text("UPDATE members SET nationality = :canonical WHERE nationality = :alias"),
            {"canonical": canonical, "alias": alias},
        )

    remaining = bind.execute(
        sa.text("SELECT DISTINCT nationality FROM members WHERE nationality IS NOT NULL")
    ).scalars().all()
    unmapped = sorted(value for value in remaining if value not in COUNTRIES)

    if unmapped:
        print(
            "\n[nationality normalization] The following nationality values do not "
            "match the fixed country list and were left as-is for manual review:\n  - "
            + "\n  - ".join(unmapped)
            + "\nUpdate these member records by hand (or extend NATIONALITY_ALIASES in "
            "this migration and re-run) — they will fail validation on next edit.\n"
        )


def downgrade() -> None:
    """Data-only cleanup — not reversible, no-op."""
    pass
