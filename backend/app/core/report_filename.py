"""Story 15.11: shared filename generator for every downloadable report.

Format: `[report-topic]_[rotary-year]_[generation-date].[ext]`, or
`[report-topic]_[generation-date].[ext]` when the report has no year
selection. Centralised here so no endpoint hand-rolls its own filename.

Deliberately hyphen-based (`2025-2026`), not the frontend's display-label
en-dash format (`rotaryYearLabel` → `2025–2026`) — the en dash isn't
filesystem/URL-safe.
"""

from datetime import date


def generate_report_filename(
    topic: str,
    extension: str,
    *,
    rotary_year: int | None = None,
    generation_date: date | None = None,
) -> str:
    generation_date = generation_date or date.today()
    date_part = generation_date.isoformat()
    ext = extension.lstrip(".")

    if rotary_year is not None:
        year_part = f"{rotary_year}-{rotary_year + 1}"
        return f"{topic}_{year_part}_{date_part}.{ext}"
    return f"{topic}_{date_part}.{ext}"
