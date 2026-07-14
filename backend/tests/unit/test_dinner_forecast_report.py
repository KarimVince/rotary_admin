from datetime import date

import pytest

from app.core.dinner_forecast_report import build_csv_report, build_pdf_report
from app.core.rotary_year import rotary_year
from app.models import AttendanceEvent

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


def test_csv_report_contains_event_row(db_session):
    event = _make_event(db_session, speaker_name="Jane Speaker")
    csv_text = build_csv_report(db_session, [event])
    assert "Welcome Dinner" in csv_text
    assert "Jane Speaker" in csv_text
    assert "Club House" in csv_text


def test_csv_report_empty_events(db_session):
    csv_text = build_csv_report(db_session, [])
    assert "Date,Type,Event Name" in csv_text


def test_pdf_report_starts_with_pdf_header(db_session):
    event = _make_event(db_session)
    pdf_bytes = build_pdf_report(db_session, [event], rotary_year(event.event_date))
    assert pdf_bytes[:4] == b"%PDF"


def test_pdf_report_renders_free_text_ngo_organisation(db_session):
    event = _make_event(db_session, ngo_organisation_name="Helping Hands")
    pdf_bytes = build_pdf_report(db_session, [event], rotary_year(event.event_date))
    assert pdf_bytes[:4] == b"%PDF"


def test_pdf_report_resolves_speaker_rotary_contact_member(db_session, make_member):
    contact = make_member(first_name="Contact", last_name="Person")
    event = _make_event(db_session, speaker_rotary_contact_member_id=contact.id)
    pdf_bytes = build_pdf_report(db_session, [event], rotary_year(event.event_date))
    assert pdf_bytes[:4] == b"%PDF"


def test_csv_report_includes_speaker_rotary_contact_column(db_session, make_member):
    contact = make_member(first_name="Contact", last_name="Person")
    event = _make_event(db_session, speaker_rotary_contact_member_id=contact.id)
    csv_text = build_csv_report(db_session, [event])
    assert "Speaker Rotary Contact" in csv_text
    assert "Contact Person" in csv_text


def test_csv_report_includes_member_only_column(db_session):
    event = _make_event(db_session, member_only=True)
    csv_text = build_csv_report(db_session, [event])
    assert "Member Only" in csv_text
    assert "TRUE" in csv_text


def test_pdf_report_renders_member_only_event(db_session):
    event = _make_event(db_session, member_only=True)
    pdf_bytes = build_pdf_report(db_session, [event], rotary_year(event.event_date))
    assert pdf_bytes[:4] == b"%PDF"
