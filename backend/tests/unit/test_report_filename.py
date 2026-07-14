from datetime import date

import pytest

from app.core.report_filename import generate_report_filename

pytestmark = pytest.mark.unit


def test_includes_rotary_year_segment_when_given():
    filename = generate_report_filename(
        "dinner-forecast", "pdf", rotary_year=2025, generation_date=date(2026, 7, 14)
    )

    assert filename == "dinner-forecast_2025-2026_2026-07-14.pdf"


def test_omits_year_segment_when_no_rotary_year():
    filename = generate_report_filename(
        "member-application", "pdf", generation_date=date(2026, 7, 14)
    )

    assert filename == "member-application_2026-07-14.pdf"


def test_defaults_generation_date_to_today(monkeypatch):
    class _FixedDate(date):
        @classmethod
        def today(cls):
            return date(2026, 1, 1)

    monkeypatch.setattr("app.core.report_filename.date", _FixedDate)

    assert generate_report_filename("friends-directory", "csv") == "friends-directory_2026-01-01.csv"


def test_extension_leading_dot_is_stripped():
    filename = generate_report_filename(
        "members-statistics", ".pptx", generation_date=date(2026, 7, 14)
    )

    assert filename == "members-statistics_2026-07-14.pptx"
