from datetime import date


def rotary_year(d: date) -> int:
    return d.year if d.month >= 7 else d.year - 1
