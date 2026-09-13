"""Story 15.11: shared filename generator for every downloadable report.

Format: `[report-topic]_[rotary-year]_[date]_[HH]h[MM].[ext]`, or
`[report-topic]_[date]_[HH]h[MM].[ext]` when the report has no year
selection. Centralised here so no endpoint hand-rolls its own filename.

Deliberately hyphen-based (`2025-2026`), not the frontend's display-label
en-dash format (`rotaryYearLabel` → `2025–2026`) — the en dash isn't
filesystem/URL-safe.
"""

from datetime import datetime


def generate_report_filename(
    topic: str,
    extension: str,
    *,
    rotary_year: int | None = None,
    generation_datetime: datetime | None = None,
) -> str:
    dt = generation_datetime or datetime.now()
    date_part = dt.strftime("%Y-%m-%d")
    time_part = dt.strftime("%Hh%M")
    ext = extension.lstrip(".")

    if rotary_year is not None:
        year_part = f"{rotary_year}-{rotary_year + 1}"
        return f"{topic}_{year_part}_{date_part}_{time_part}.{ext}"
    return f"{topic}_{date_part}_{time_part}.{ext}"
