from pydantic import BaseModel


class DashboardSummary(BaseModel):
    active_members: int
    honorary_members: int
    organisations_supported: int
    rotary_friends: int
    donations_this_year: float
    fees_collected_this_year: float
    # Story 16.14
    service_hours_this_year: float
