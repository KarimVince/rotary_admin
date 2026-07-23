from pydantic import BaseModel


class DashboardSummary(BaseModel):
    active_members: int
    honorary_members: int
    organisations_supported: int
    rotary_friends: int
    donations_this_year: float
    # Story 16.26: replaces fees_collected_this_year — event fundraising
    # income + ad hoc donations for the current rotary year, sourced from
    # the Finance module's fundraising summary (Story 17.3).
    total_funds_raised_this_year: float
    # Story 16.14
    service_hours_this_year: float
