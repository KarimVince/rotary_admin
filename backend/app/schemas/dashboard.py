from pydantic import BaseModel


class DashboardSummary(BaseModel):
    active_members: int
    organisations_supported: int
    rotary_friends: int
