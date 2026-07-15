"""Story 16.3 — one-off migration: copy the 2026/2027 (rotary_year=2026)
Dinner Forecast events (`attendance_events`) from dev to prod, WITHOUT any
attendance records.

Idempotent — safe to re-run. Before inserting, each dev row is checked
against prod both by id and by natural key (event_date, name, event_type);
if either matches, the row is skipped rather than duplicated.

`created_by` and `speaker_rotary_contact_member_id` are deliberately set to
NULL on the prod side (per Story 16.3's decision) — they reference dev-only
`users`/`members` rows that don't exist in prod under the same id, and
carrying them over would either violate the foreign key or silently point
at the wrong prod row.

`attendance_records` (actual attendance data) is never read or written by
this script — only `attendance_events` rows are touched.

Usage (run from `backend/`, with the venv active):

    # 1. Dry run first — reports exactly what would be inserted/skipped,
    #    makes no writes at all.
    PROD_DATABASE_URL="postgresql://..." python -m scripts.migrate_2026_dinners_to_prod

    # 2. Once the dry-run output looks right, actually write:
    PROD_DATABASE_URL="postgresql://..." python -m scripts.migrate_2026_dinners_to_prod --execute

PROD_DATABASE_URL is read from the environment only — never hardcoded or
committed. The dev side reuses this app's own `settings.database_url`
(same as every other script/test in this repo).
"""

import argparse
import os
import sys

from sqlalchemy import create_engine, text

from app.core.config import settings

ROTARY_YEAR = 2026

SELECT_DEV_EVENTS = text(
    """
    SELECT id, name, event_date, event_type, rotary_year, location, speaker_name,
           ngo_organisation_name, topics_description, member_only
    FROM attendance_events
    WHERE rotary_year = :rotary_year AND deleted_at IS NULL
    ORDER BY event_date
    """
)

FIND_EXISTING_PROD_EVENT = text(
    """
    SELECT id FROM attendance_events
    WHERE id = :id OR (event_date = :event_date AND name = :name AND event_type = :event_type)
    LIMIT 1
    """
)

INSERT_PROD_EVENT = text(
    """
    INSERT INTO attendance_events (
        id, name, event_date, event_type, rotary_year, location, speaker_name,
        ngo_organisation_name, speaker_rotary_contact_member_id, topics_description,
        member_only, deleted_at, created_by, created_at, updated_at
    ) VALUES (
        :id, :name, :event_date, :event_type, :rotary_year, :location, :speaker_name,
        :ngo_organisation_name, NULL, :topics_description,
        :member_only, NULL, NULL, now(), now()
    )
    """
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--execute", action="store_true", help="Actually write to prod (default: dry run only)"
    )
    args = parser.parse_args()

    prod_url = os.environ.get("PROD_DATABASE_URL")
    if not prod_url:
        print("PROD_DATABASE_URL is not set — refusing to run.", file=sys.stderr)
        return 1

    dev_engine = create_engine(settings.database_url)
    prod_engine = create_engine(prod_url)

    with dev_engine.connect() as dev_conn:
        dev_events = dev_conn.execute(SELECT_DEV_EVENTS, {"rotary_year": ROTARY_YEAR}).mappings().all()

    print(f"Found {len(dev_events)} dev attendance_events rows for rotary_year={ROTARY_YEAR}.")
    print(f"Mode: {'EXECUTE (will write to prod)' if args.execute else 'DRY RUN (no writes)'}\n")

    to_insert = []
    skipped = []

    with prod_engine.connect() as prod_conn:
        for row in dev_events:
            existing = prod_conn.execute(
                FIND_EXISTING_PROD_EVENT,
                {"id": row["id"], "event_date": row["event_date"], "name": row["name"], "event_type": row["event_type"]},
            ).first()
            if existing:
                skipped.append(row)
            else:
                to_insert.append(row)

    print(f"To insert: {len(to_insert)}")
    for row in to_insert:
        print(f"  + {row['event_date']}  {row['event_type']:<10}  {row['name']}  (id={row['id']})")

    print(f"\nAlready in prod, skipping: {len(skipped)}")
    for row in skipped:
        print(f"  = {row['event_date']}  {row['event_type']:<10}  {row['name']}  (id={row['id']})")

    if not args.execute:
        print("\nDry run only — no writes made. Re-run with --execute to apply.")
        return 0

    if not to_insert:
        print("\nNothing to insert.")
        return 0

    migrated_ids = []
    with prod_engine.begin() as prod_conn:
        for row in to_insert:
            prod_conn.execute(INSERT_PROD_EVENT, dict(row))
            migrated_ids.append(str(row["id"]))

    print(f"\nMigrated {len(migrated_ids)} rows to prod. IDs (for audit/rollback):")
    for migrated_id in migrated_ids:
        print(f"  {migrated_id}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
