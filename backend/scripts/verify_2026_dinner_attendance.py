"""Story 16.4 — verify the Attendance module correctly reflects the
2026/2027 dinners migrated to prod by Story 16.3.

Read-only checks, plus a single insert -> verify -> delete smoke test
against ONE migrated event to prove the attendance_records <->
attendance_events foreign key and write path work end-to-end in prod,
without leaving any trace behind afterward.

Usage (run from `backend/`, with the venv active):

    PROD_DATABASE_URL="postgresql://..." python -m scripts.verify_2026_dinner_attendance

PROD_DATABASE_URL is read from the environment only — never hardcoded or
committed.
"""

import os
import sys
import uuid

from sqlalchemy import create_engine, text

ROTARY_YEAR = 2026


def main() -> int:
    prod_url = os.environ.get("PROD_DATABASE_URL")
    if not prod_url:
        print("PROD_DATABASE_URL is not set — refusing to run.", file=sys.stderr)
        return 1

    engine = create_engine(prod_url)

    with engine.connect() as conn:
        events = conn.execute(
            text(
                "SELECT id, name, event_date, event_type FROM attendance_events "
                "WHERE rotary_year = :year AND deleted_at IS NULL ORDER BY event_date"
            ),
            {"year": ROTARY_YEAR},
        ).mappings().all()
        print(f"1. Migrated events present: {len(events)} rows for rotary_year={ROTARY_YEAR}")
        if not events:
            print("   FAIL — no migrated events found. Nothing to verify.", file=sys.stderr)
            return 1

        event_ids = [e["id"] for e in events]
        counts = conn.execute(
            text(
                "SELECT event_id, count(*) FROM attendance_records "
                "WHERE event_id = ANY(:ids) GROUP BY event_id"
            ),
            {"ids": event_ids},
        ).all()
        non_empty = {str(event_id): count for event_id, count in counts}
        if non_empty:
            print(f"   FAIL — {len(non_empty)} migrated events already have attendance records: {non_empty}")
            return 1
        print("   OK — every migrated event has 0 attendance records (none carried over).")

        baseline_other_count = conn.execute(
            text("SELECT count(*) FROM attendance_records WHERE event_id != ALL(:ids)"),
            {"ids": event_ids},
        ).scalar()
        print(f"2. Baseline: {baseline_other_count} pre-existing attendance_records on OTHER events.")

        test_member = conn.execute(
            text("SELECT id, status FROM members WHERE status = 'active' LIMIT 1")
        ).mappings().first()
        if test_member is None:
            print("   FAIL — no active member found in prod to smoke-test with.", file=sys.stderr)
            return 1

        test_event = events[0]
        test_record_id = uuid.uuid4()
        print(
            f"3. Smoke test: inserting one attendance_records row against "
            f"'{test_event['name']}' ({test_event['event_date']}) for member {test_member['id']}."
        )

    # Separate transaction for the write/verify/cleanup, committed explicitly
    # step by step so failures are visible rather than silently rolled back.
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO attendance_records "
                "(id, event_id, member_id, present, member_status_snapshot, recorded_at) "
                "VALUES (:id, :event_id, :member_id, false, :status, now())"
            ),
            {
                "id": test_record_id,
                "event_id": test_event["id"],
                "member_id": test_member["id"],
                "status": test_member["status"],
            },
        )

    with engine.connect() as conn:
        saved = conn.execute(
            text(
                "SELECT ar.id, ar.event_id, ar.member_id, ar.present, ae.name "
                "FROM attendance_records ar JOIN attendance_events ae ON ar.event_id = ae.id "
                "WHERE ar.id = :id"
            ),
            {"id": test_record_id},
        ).mappings().first()

    if saved is None or saved["event_id"] != test_event["id"]:
        print("   FAIL — test record did not save/round-trip correctly.", file=sys.stderr)
        return 1
    print(
        f"   OK — record saved and joins correctly to '{saved['name']}' "
        f"(event_id/member_id FK relationship holds)."
    )

    with engine.begin() as conn:
        conn.execute(text("DELETE FROM attendance_records WHERE id = :id"), {"id": test_record_id})
    print("4. Cleanup: test record deleted — prod left exactly as found.")

    with engine.connect() as conn:
        still_gone = conn.execute(
            text("SELECT count(*) FROM attendance_records WHERE event_id = :id"),
            {"id": test_event["id"]},
        ).scalar()
        after_other_count = conn.execute(
            text("SELECT count(*) FROM attendance_records WHERE event_id != ALL(:ids)"),
            {"ids": event_ids},
        ).scalar()

    if still_gone != 0:
        print("   FAIL — cleanup did not remove the test record.", file=sys.stderr)
        return 1
    if after_other_count != baseline_other_count:
        print(
            f"   FAIL — pre-existing attendance data changed: {baseline_other_count} -> {after_other_count}",
            file=sys.stderr,
        )
        return 1
    print(
        f"   OK — 0 attendance records remain on the test event, "
        f"and other events' attendance data is unchanged ({after_other_count})."
    )

    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
