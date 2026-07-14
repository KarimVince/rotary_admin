"""One-off: seed the recurring "Regular Dinner" schedule into Dinner Forecast
— 1st and 3rd Tuesday of every month across a Rotary year (July -> June).

A standalone script (not a migration), same pattern as
`scripts/seed_permission_matrix.py` — deliberately kept out of the migration
chain so it never runs against the seed-free test database.

USAGE
-----
Dry run first (default) — prints the events it would create, does NOT touch
the DB:

    cd backend && python -m scripts.seed_dinner_forecast_events --rotary-year 2026

Once the preview looks correct, actually insert:

    cd backend && python -m scripts.seed_dinner_forecast_events --rotary-year 2026 --commit

ASSUMPTIONS / DECISIONS BAKED IN (confirm before running --commit)
--------------------------------------------------------------------
1. `LOCATION` below is a placeholder ("Club House") — the Dinner Forecast
   form treats location as required, but this script writes directly via
   the ORM (bypassing that schema check), so it needs *some* value. Edit
   the constant below, or fix it up per-event in the Dinner Forecast page
   after seeding, before it matters for the PDF/CSV report.
2. Event name format is literally "Regular Dinner 1st Tuesday of {Month}" /
   "Regular Dinner 3rd Tuesday of {Month}" (month name only, no year) — if
   the club runs this across multiple rotary years, re-running for a new
   year produces same-named events dated a year apart; that's expected.
3. Idempotent by (event_date, name): re-running the same rotary year is a
   no-op the second time (skips any date that already has an event on it),
   so it's safe to re-run after fixing an earlier mistake for a subset of
   months.
4. `event_type` is hardcoded to "dinner" for every generated row.
"""
import argparse
import calendar
from datetime import date

from app.core.rotary_year import rotary_year, rotary_year_bounds
from app.db.session import SessionLocal
from app.models import AttendanceEvent

LOCATION = "Club House"  # confirm/edit before --commit — see assumption #1


def _tuesdays_in_month(year: int, month: int) -> list[date]:
    cal = calendar.Calendar()
    return [
        d
        for d in cal.itermonthdates(year, month)
        if d.month == month and d.weekday() == calendar.TUESDAY
    ]


def _months_in_rotary_year(rotary_year_value: int) -> list[tuple[int, int]]:
    start, end = rotary_year_bounds(rotary_year_value)
    months = []
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        months.append((year, month))
        month += 1
        if month > 12:
            month = 1
            year += 1
    return months


def planned_events(rotary_year_value: int) -> list[tuple[date, str]]:
    events = []
    for year, month in _months_in_rotary_year(rotary_year_value):
        tuesdays = _tuesdays_in_month(year, month)
        month_name = calendar.month_name[month]
        if len(tuesdays) >= 1:
            events.append((tuesdays[0], f"Regular Dinner 1st Tuesday of {month_name}"))
        if len(tuesdays) >= 3:
            events.append((tuesdays[2], f"Regular Dinner 3rd Tuesday of {month_name}"))
    return sorted(events)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--rotary-year",
        type=int,
        required=True,
        help="Rotary year to seed, as the starting calendar year (e.g. 2026 for Jul 2026 - Jun 2027)",
    )
    parser.add_argument("--commit", action="store_true", help="Actually insert (default: dry run)")
    args = parser.parse_args()

    events = planned_events(args.rotary_year)

    print(f"Rotary year {args.rotary_year}-{args.rotary_year + 1}: {len(events)} events planned")
    print(f"Location for all rows: {LOCATION!r} — edit the LOCATION constant if wrong\n")

    db = SessionLocal()
    try:
        existing_dates = {
            row[0]
            for row in db.query(AttendanceEvent.event_date)
            .filter(AttendanceEvent.rotary_year == args.rotary_year)
            .all()
        }

        to_create = []
        for event_date, name in events:
            marker = "SKIP (event already exists on this date)" if event_date in existing_dates else "CREATE"
            print(f"  {event_date}  {name:45s} [{marker}]")
            if event_date not in existing_dates:
                to_create.append((event_date, name))

        if not args.commit:
            print(f"\nDry run — would create {len(to_create)} event(s). Re-run with --commit to insert.")
            return

        for event_date, name in to_create:
            db.add(
                AttendanceEvent(
                    name=name,
                    event_date=event_date,
                    event_type="dinner",
                    rotary_year=rotary_year(event_date),
                    location=LOCATION,
                )
            )
        db.commit()
        print(f"\nInserted {len(to_create)} event(s).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
