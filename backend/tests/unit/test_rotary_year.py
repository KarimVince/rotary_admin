from datetime import date

import pytest

from app.core.rotary_year import rotary_year

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    ("input_date", "expected_year"),
    [
        (date(2024, 7, 1), 2024),
        (date(2025, 6, 30), 2024),
        (date(2024, 6, 30), 2023),
        (date(2024, 1, 1), 2023),
        (date(2024, 12, 31), 2024),
    ],
)
def test_rotary_year_boundaries(input_date, expected_year):
    assert rotary_year(input_date) == expected_year
