from datetime import date

import pytest

from app.core.dinner_forecast_report import _relevant_months, build_csv_report, build_pdf_report
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
    pdf_bytes = build_pdf_report([event], rotary_year(event.event_date))
    assert pdf_bytes[:4] == b"%PDF"


def test_pdf_report_renders_free_text_ngo_organisation(db_session):
    event = _make_event(db_session, ngo_organisation_name="Helping Hands")
    pdf_bytes = build_pdf_report([event], rotary_year(event.event_date))
    assert pdf_bytes[:4] == b"%PDF"


def test_pdf_report_falls_back_to_default_chip_for_malformed_type_color(db_session):
    # Regression: a hand-typed color value that isn't clean "#rrggbb" hex
    # (e.g. "FFD500." with no "#" and a stray trailing character) used to
    # crash the whole report — reportlab's HexColor() has zero tolerance
    # for malformed input. Must render using the default chip instead.
    event = _make_event(db_session, event_type="Gala")
    pdf_bytes = build_pdf_report(
        [event], rotary_year(event.event_date), type_colors={"Gala": ("FFD500.", "#000000")}
    )
    assert pdf_bytes[:4] == b"%PDF"


def test_pdf_report_renders_speaker_and_ngo_together(db_session):
    event = _make_event(
        db_session, speaker_name="Jane Speaker", ngo_organisation_name="Helping Hands"
    )
    pdf_bytes = build_pdf_report([event], rotary_year(event.event_date))
    assert pdf_bytes[:4] == b"%PDF"


def test_pdf_report_resolves_speaker_rotary_contact_member(db_session, make_member):
    contact = make_member(first_name="Contact", last_name="Person")
    event = _make_event(db_session, speaker_rotary_contact_member_id=contact.id)
    pdf_bytes = build_pdf_report([event], rotary_year(event.event_date))
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
    assert "MEMBER ONLY" in csv_text


def test_csv_report_member_only_column_blank_when_false(db_session):
    event = _make_event(db_session, member_only=False)
    csv_text = build_csv_report(db_session, [event])
    assert "MEMBER ONLY" not in csv_text


def test_pdf_report_renders_member_only_event(db_session):
    event = _make_event(db_session, member_only=True)
    pdf_bytes = build_pdf_report([event], rotary_year(event.event_date))
    assert pdf_bytes[:4] == b"%PDF"


def test_csv_report_omits_participation_column_when_not_provided(db_session):
    event = _make_event(db_session)
    csv_text = build_csv_report(db_session, [event])
    assert "Participation Rate" not in csv_text


def test_csv_report_includes_participation_rate(db_session):
    event = _make_event(db_session)
    csv_text = build_csv_report(db_session, [event], participation={event.id: (4, 3)})
    assert "Participation Rate" in csv_text
    assert "75.0% (3/4)" in csv_text


def test_csv_report_participation_rate_with_no_eligible_members(db_session):
    event = _make_event(db_session)
    csv_text = build_csv_report(db_session, [event], participation={event.id: (0, 0)})
    assert "No attendance recorded" in csv_text


def test_pdf_report_renders_with_participation_data(db_session):
    event = _make_event(db_session)
    pdf_bytes = build_pdf_report(
        [event], rotary_year(event.event_date), participation={event.id: (4, 3)}
    )
    assert pdf_bytes[:4] == b"%PDF"


def test_pdf_report_renders_forecast_view(db_session):
    event = _make_event(db_session)
    pdf_bytes = build_pdf_report([event], rotary_year(event.event_date), forecast=True)
    assert pdf_bytes[:4] == b"%PDF"


def test_relevant_months_non_forecast_always_returns_the_full_year():
    # Follow-up to Story 16.17: unchecked/default is "everything" — past
    # events (with participation) and upcoming ones together — so it always
    # renders the full 12-month grid, regardless of how far into the rotary
    # year "today" is.
    current_year = rotary_year(date.today())
    assert len(_relevant_months(current_year, forecast=False)) == 12
    assert len(_relevant_months(current_year + 5, forecast=False)) == 12
    assert len(_relevant_months(current_year - 5, forecast=False)) == 12


def test_relevant_months_forecast_excludes_past_months():
    current_year = rotary_year(date.today())
    months = _relevant_months(current_year, forecast=True)
    today_month = date(date.today().year, date.today().month, 1)
    assert all(m >= today_month for m in months)
    assert today_month in months


def test_relevant_months_forecast_falls_back_to_full_year_when_nothing_is_relevant():
    # A rotary year long finished has zero remaining months for the
    # forecast view — falls back to the full 12 rather than an empty list.
    past_year = rotary_year(date.today()) - 5
    months = _relevant_months(past_year, forecast=True)
    assert len(months) == 12


def test_pdf_report_renders_with_fewer_than_six_relevant_months(db_session):
    # Regression: a page with fewer than a full 6-month batch used to crash
    # Table() with a mismatched row/column count once _relevant_months (not
    # always the full 12-month grid) was introduced. Only the forecast view
    # can produce a short month list now — the default view always renders
    # all 12.
    event = _make_event(db_session, event_date=date.today())
    pdf_bytes = build_pdf_report([event], rotary_year(event.event_date), forecast=True)
    assert pdf_bytes[:4] == b"%PDF"


def test_pdf_report_renders_event_with_start_time(db_session):
    from datetime import time

    event = _make_event(db_session, start_time=time(19, 0), end_time=time(21, 30))
    pdf_bytes = build_pdf_report([event], rotary_year(event.event_date))
    assert pdf_bytes[:4] == b"%PDF"


def test_pdf_report_renders_event_with_no_time_set(db_session):
    event = _make_event(db_session)
    assert event.start_time is None
    pdf_bytes = build_pdf_report([event], rotary_year(event.event_date))
    assert pdf_bytes[:4] == b"%PDF"


def test_format_time_12h():
    from datetime import time

    from app.core.dinner_forecast_report import _format_time_12h

    assert _format_time_12h(time(19, 0)) == "7:00 PM"
    assert _format_time_12h(time(7, 5)) == "7:05 AM"
    assert _format_time_12h(time(0, 0)) == "12:00 AM"
    assert _format_time_12h(time(12, 0)) == "12:00 PM"
    assert _format_time_12h(time(23, 45)) == "11:45 PM"
