from pydantic import BaseModel


class FinanceSummary(BaseModel):
    """Story 17.1 — Finance Summary landing page totals for the selected
    rotary year. Left column = Charity & Donation results
    (total_fundraising, total_donations, remaining_for_donation); right
    column = Club Operational results (fees_collected, total_revenue,
    total_expenses, net_balance). Every figure is computed live from
    17.2-17.5's own data — nothing is entered on this page.

    Fundraising (money raised, e.g. lucky draw/auction/ad hoc donations)
    and Donations (money the club has given out to NGOs/projects) are two
    unrelated flows in opposite directions — never summed together.
    remaining_for_donation = total_fundraising - total_donations, i.e. how
    much of what's been raised hasn't been given out yet."""

    rotary_year: int
    total_donations: float
    total_fundraising: float
    remaining_for_donation: float
    fees_collected: float
    total_revenue: float
    total_expenses: float
    net_balance: float
