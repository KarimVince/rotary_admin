// Fixed reference list of ISO 4217 currency codes for the donation currency
// dropdown. Pinned currencies (most-used by the club) come first, then the
// rest alphabetically. Mirrors backend/app/core/currencies.py — there is no
// shared package between the two apps, so the list is intentionally
// duplicated. "RMB" is the common name for CNY; we store/display the ISO
// code but label it "CNY (RMB)" for clarity.
export const PINNED_CURRENCIES = ["HKD", "SGD", "USD", "EUR", "JPY", "CNY"];

export const OTHER_CURRENCIES = [
  "AED", "ARS", "AUD", "BHD", "BRL", "CAD", "CHF", "CZK",
  "DKK", "GBP", "HUF", "IDR", "ILS", "INR", "KRW", "KWD",
  "MOP", "MXN", "MYR", "NOK", "NZD", "PHP", "PLN", "QAR",
  "RON", "RUB", "SAR", "SEK", "THB", "TRY", "TWD", "VND",
  "ZAR",
];

export const CURRENCIES = [...PINNED_CURRENCIES, ...OTHER_CURRENCIES];

const LABEL_OVERRIDES = { CNY: "CNY (RMB)" };

export function currencyLabel(code) {
  return LABEL_OVERRIDES[code] ?? code;
}
