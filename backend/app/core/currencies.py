"""Fixed reference list of ISO 4217 currency codes for donations.currency.

Ordered as the club wants it presented: the most-used currencies pinned to
the top (HKD, SGD, USD, EUR, JPY, CNY), then the rest of the common codes
alphabetically. Store the ISO code (e.g. CNY, not "RMB") in the database.
Keep this in sync with frontend/src/data/currencies.js — there is no shared
package between the two apps, so the list is intentionally duplicated.
"""

PINNED_CURRENCIES: tuple[str, ...] = ("HKD", "SGD", "USD", "EUR", "JPY", "CNY")

OTHER_CURRENCIES: tuple[str, ...] = (
    "AED", "ARS", "AUD", "BHD", "BRL", "CAD", "CHF", "CZK",
    "DKK", "GBP", "HUF", "IDR", "ILS", "INR", "KRW", "KWD",
    "MOP", "MXN", "MYR", "NOK", "NZD", "PHP", "PLN", "QAR",
    "RON", "RUB", "SAR", "SEK", "THB", "TRY", "TWD", "VND",
    "ZAR",
)

CURRENCIES: tuple[str, ...] = PINNED_CURRENCIES + OTHER_CURRENCIES
