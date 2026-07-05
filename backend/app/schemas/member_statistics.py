from pydantic import BaseModel


class LabelValue(BaseModel):
    label: str
    value: int


class JoinsLeavesByYear(BaseModel):
    label: str
    joins: int
    leaves: int


class MembersStatistics(BaseModel):
    by_status: list[LabelValue]
    by_join_year: list[LabelValue]
    growth_by_rotary_year: list[JoinsLeavesByYear]
    by_nationality: list[LabelValue]
    age_distribution: list[LabelValue]
    tenure_distribution: list[LabelValue]
    by_gender: list[LabelValue]

    # Headline stat cards (Story 2b.11) — all scoped to Active + Honorary
    # members only; Past members are deliberately excluded from every one
    # of these, not just "not shown as their own card".
    total_members: int
    honorary_members: int
    new_members_this_rotary_year: int
    countries_represented: int
    women_count: int
    men_count: int
    average_age: float | None
    average_tenure_as_rotarian: float | None
