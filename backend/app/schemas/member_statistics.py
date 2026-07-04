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
    average_tenure_years: float | None
    growth_by_rotary_year: list[JoinsLeavesByYear]
    by_nationality: list[LabelValue]
    by_classification: list[LabelValue]
    age_distribution: list[LabelValue]
    average_age: float | None
