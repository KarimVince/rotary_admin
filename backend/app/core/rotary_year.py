from datetime import date


def rotary_year(d: date) -> int:
    return d.year if d.month >= 7 else d.year - 1


def rotary_year_bounds(year: int) -> tuple[date, date]:
    """Inclusive calendar-date bounds of rotary year `year` (1 Jul Y -> 30 Jun Y+1)."""
    return date(year, 7, 1), date(year + 1, 6, 30)
