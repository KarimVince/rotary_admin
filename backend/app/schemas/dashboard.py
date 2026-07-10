from pydantic import BaseModel


class DashboardSummary(BaseModel):
    active_members: int
    organisations_supported: int
    rotary_friends: int
    donations_this_year: float
    fees_collected_this_year: float
