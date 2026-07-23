from pydantic import BaseModel


class FinanceSummary(BaseModel):
    """Story 17.1 — Finance Summary landing page totals for the selected
    rotary year. Left column = Charity & Donation results
    (total_donations, total_fundraising, total_charity); right column =
    Club Operational results (fees_collected, total_revenue,
    total_expenses, net_balance). Every figure is computed live from
    17.2-17.5's own data — nothing is entered on this page."""

    rotary_year: int
    total_donations: float
    total_fundraising: float
    total_charity: float
    fees_collected: float
    total_revenue: float
    total_expenses: float
    net_balance: float
