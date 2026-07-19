from pydantic import BaseModel


class LabelValue(BaseModel):
    label: str
    value: float


class EventSummary(BaseModel):
    # Section 1 — Fundraising Results
    total_raised: float
    auction_total: float
    lucky_draw_total: float
    other_donation: float

    # Section 2 — Revenue
    total_revenue: float
    ticket_revenue: float
    sponsor_revenue: float

    # Section 3 — Operational Cost
    total_cost: float
    cost_per_category: list[LabelValue]

    # Section 4 — Operational Result
    net_operational_result: float

    # Chart data
    revenue_breakdown: list[LabelValue]
    cost_breakdown: list[LabelValue]
    result_overview: list[LabelValue]
