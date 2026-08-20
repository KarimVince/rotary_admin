from datetime import date

import pytest

from app.core.attendance_sheet_report import build_attendance_sheet_pdf
from app.core.rotary_year import rotary_year
from app.models import AttendanceEvent
from app.schemas.attendance import AttendanceRecordRead

pytestmark = pytest.mark.unit


def _make_event(db_session, **overrides) -> AttendanceEvent:
    event_date = overrides.pop("event_date", date(2026, 8, 15))
    event = AttendanceEvent(
        name=overrides.pop("name", "Welcome Dinner"),
        event_date=event_date,
        event_type=overrides.pop("event_type", "dinner"),
        rotary_year=rotary_year(event_date),
        location=overrides.pop("location", "Club House"),
        **overrides,
    )
    db_session.add(event)
    db_session.commit()
    db_session.refresh(event)
    return event


def _record(first_name, last_name, status="active"):
    return AttendanceRecordRead(
        member_id="00000000-0000-0000-0000-000000000001",
        first_name=first_name,
        last_name=last_name,
        member_status_snapshot=status,
        present=False,
    )


def test_pdf_starts_with_pdf_header(db_session):
    event = _make_event(db_session)
    pdf_bytes = build_attendance_sheet_pdf(event, [_record("Jane", "Doe")], [])
    assert pdf_bytes[:4] == b"%PDF"


def test_pdf_handles_empty_rosters(db_session):
    event = _make_event(db_session)
    pdf_bytes = build_attendance_sheet_pdf(event, [], [])
    assert pdf_bytes[:4] == b"%PDF"


def test_pdf_handles_missing_location(db_session):
    event = _make_event(db_session, location=None)
    pdf_bytes = build_attendance_sheet_pdf(event, [_record("Jane", "Doe")], [_record("Sam", "Lee")])
    assert pdf_bytes[:4] == b"%PDF"
