from datetime import datetime
from unittest.mock import patch

import pytest

from app.core.report_filename import generate_report_filename

pytestmark = pytest.mark.unit


def test_includes_rotary_year_segment_when_given():
    filename = generate_report_filename(
        "dinner-forecast", "pdf",
        rotary_year=2025,
        generation_datetime=datetime(2026, 7, 14, 14, 30),
    )

    assert filename == "dinner-forecast_2025-2026_2026-07-14_14h30.pdf"


def test_omits_year_segment_when_no_rotary_year():
    filename = generate_report_filename(
        "member-application", "pdf",
        generation_datetime=datetime(2026, 7, 14, 9, 5),
    )

    assert filename == "member-application_2026-07-14_09h05.pdf"


def test_defaults_generation_datetime_to_now():
    fixed = datetime(2026, 1, 1, 8, 0)
    with patch("app.core.report_filename.datetime") as mock_dt:
        mock_dt.now.return_value = fixed
        filename = generate_report_filename("friends-directory", "csv")

    assert filename == "friends-directory_2026-01-01_08h00.csv"


def test_extension_leading_dot_is_stripped():
    filename = generate_report_filename(
        "members-statistics", ".pptx",
        generation_datetime=datetime(2026, 7, 14, 16, 45),
    )

    assert filename == "members-statistics_2026-07-14_16h45.pptx"
