"""Currency conversion helper for donation statistics (Story 3.11).

Converts a set of (currency, amount) donation rows to HKD/USD using a
manually-maintained rate map (see app.models.exchange_rate). Donations in a
currency with no rate on file are excluded from the totals rather than
silently dropped — the caller gets back a count and the list of currencies
so it can surface a warning.
"""

from collections.abc import Iterable


def convert_totals(
    rows: Iterable[tuple[str, float]], rates: dict[str, tuple[float, float]]
) -> dict:
    total_hkd = 0.0
    total_usd = 0.0
    unconverted_count = 0
    unconverted_currencies: set[str] = set()

    for currency, amount in rows:
        rate = rates.get(currency)
        if rate is None:
            unconverted_count += 1
            unconverted_currencies.add(currency)
            continue
        rate_to_hkd, rate_to_usd = rate
        total_hkd += amount * rate_to_hkd
        total_usd += amount * rate_to_usd

    return {
        "total_hkd": total_hkd,
        "total_usd": total_usd,
        "unconverted_count": unconverted_count,
        "unconverted_currencies": sorted(unconverted_currencies),
    }
