from pydantic import BaseModel


class LabelValueFloat(BaseModel):
    label: str
    value: float


class LabelCount(BaseModel):
    label: str
    value: int


class CurrencyStatistics(BaseModel):
    # One breakdown per currency actually used — totals are never summed
    # across currencies (see Story 3.7).
    currency: str
    total_by_rotary_year: list[LabelValueFloat]
    total_by_organisation: list[LabelValueFloat]
    organisations_by_rotary_year: list[LabelCount]
    grand_total: float
    # Story 11.6: totals for selected_rotary_year only, grouped by NGO
    # classification. "Unclassified" is its own label for organisations
    # with no classification_id.
    total_by_classification: list[LabelValueFloat]
    # Story 8.30: the "Selected Year" / "All Years" duplicated graph pair.
    # total_by_organisation (above) and total_by_classification (above) are
    # already each scoped one way (all-time / selected-year respectively) —
    # these two add the missing opposite scope, computed in the same request
    # rather than a second round-trip.
    total_by_organisation_selected_year: list[LabelValueFloat]
    total_by_classification_all_time: list[LabelValueFloat]


class ConvertedTotals(BaseModel):
    # Sum of donation amounts converted via the managed exchange_rates table
    # (Story 3.9). Donations in a currency with no rate on file are excluded
    # from these totals and counted below instead of being silently dropped.
    total_hkd: float
    total_usd: float
    unconverted_count: int
    unconverted_currencies: list[str]


class DonationStatistics(BaseModel):
    by_currency: list[CurrencyStatistics]

    # Story 3.11 additions — converted (HKD/USD) totals, all-time and for a
    # selected rotary year (defaults to the current one).
    selected_rotary_year: int
    selected_year_organisations_count: int
    selected_year: ConvertedTotals
    all_time_organisations_count: int
    all_time: ConvertedTotals

    # Story 16.14 — volunteer service hours, tracked alongside cash
    # donations. Not currency-scoped (hours have no currency), so these sit
    # at the top level rather than inside CurrencyStatistics.
    total_service_hours_all_time: float
    total_service_hours_selected_year: float
    service_hours_by_rotary_year: list[LabelValueFloat]
