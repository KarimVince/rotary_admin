import pytest

from app.core.currency_conversion import convert_totals

pytestmark = pytest.mark.unit

RATES = {"HKD": (1.0, 0.128), "USD": (7.8, 1.0), "EUR": (8.5, 1.09)}


def test_converts_and_sums_across_currencies():
    rows = [("HKD", 100.0), ("USD", 10.0), ("EUR", 5.0)]

    result = convert_totals(rows, RATES)

    assert result["total_hkd"] == pytest.approx(100.0 * 1.0 + 10.0 * 7.8 + 5.0 * 8.5)
    assert result["total_usd"] == pytest.approx(100.0 * 0.128 + 10.0 * 1.0 + 5.0 * 1.09)
    assert result["unconverted_count"] == 0
    assert result["unconverted_currencies"] == []


def test_excludes_donations_with_no_rate_and_reports_them():
    rows = [("HKD", 100.0), ("SGD", 50.0), ("SGD", 20.0), ("JPY", 1000.0)]

    result = convert_totals(rows, RATES)

    assert result["total_hkd"] == pytest.approx(100.0)
    assert result["unconverted_count"] == 3
    assert result["unconverted_currencies"] == ["JPY", "SGD"]


def test_empty_rows_returns_zero_totals():
    result = convert_totals([], RATES)

    assert result["total_hkd"] == 0.0
    assert result["total_usd"] == 0.0
    assert result["unconverted_count"] == 0
    assert result["unconverted_currencies"] == []
