"""PDF/CSV/PPTX export of the Dinner Forecast event list (Story 15.2).

PDF header renders the club logo top-left and the Rotary International logo
top-right. Only the club logo (`LOGO_PATH`) exists in this repo so far —
`INTL_LOGO_PATH` renders automatically the moment that file is added at
`backend/app/assets/rotary-international-logo.png`, no code change needed.

Story 16.9: the PDF is a month-by-month calendar (matching the "Dinner
Calendar Report" design handoff) — 6 month cards per page, each card listing
its events' date/type/name/location.

Story 16.17: the report generation screen gained a Forecast toggle. Default
(unchecked) is "everything" — the full 12-month Jul-Jun grid with past *and*
upcoming events together, past ones carrying an optional `participation` map
(event_id -> (eligible_total, present_count)) rendered as one extra
line/column per event. Checking Forecast narrows the grid down to
`_relevant_months`' current-and-remaining months only (future events, no
participation data — nothing to show yet), with pages chunked dynamically
from that shorter list instead of a fixed 2-page split, so a forecast report
late in the rotary year doesn't render a string of empty "No events" cards
for months already behind it.

PPTX (added 2026-09-06): "Year Event Schedule" slide deck. 4 columns with
variable-height month cards; each event is its own colored mini-card with a
type chip (small colored box) and optional Members Only chip. Column-based
layout so months with fewer events aren't padded to match their neighbours.
Up to 8 months per slide, 2 slides for a full year.
"""
import calendar
import csv
import uuid
from datetime import date as date_type, datetime, time as time_type, timezone
from io import BytesIO, StringIO
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image as PILImage
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Pt
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy.orm import Session

from app.core.donation_statistics_report import (
    CLUB_LOGO_LOCKUP_IMAGE,
    COLOR_BAND_KICKER_GOLD,
    COLOR_DISTRICT_GREEN,
    DISTRICT_BAND_IMAGE,
    _px_len,
    _rgb,
)
from app.core.statistics_report import CLUB_NAME, LOGO_PATH
from app.models import AttendanceEvent, Member

# See module docstring — not present in this repo yet, render it once it is.
INTL_LOGO_PATH = Path(__file__).resolve().parents[1] / "assets" / "rotary-international-logo.png"

# Story 16.10: event types are admin-configurable now — event.event_type
# already holds the exact display name, and colors come from the live
# DinnerEventType table (passed in as type_colors). This is just the
# fallback for a type with no configured colors.
DEFAULT_TYPE_CHIP = ("#f0f2f6", "#6b7686")


def _safe_type_colors(pair: tuple[str, str]) -> tuple[str, str]:
    """A malformed color value already sitting in dinner_event_types (e.g.
    hand-typed without the write-time validation added later) must not take
    down the whole report — reportlab's HexColor() has zero tolerance for
    anything that isn't a clean "#rrggbb" string."""
    bg, fg = pair
    try:
        colors.HexColor(bg)
        colors.HexColor(fg)
    except ValueError:
        return DEFAULT_TYPE_CHIP
    return pair

# Matches the app's --tone-amber-bg / --color-tone-amber-text tokens — same
# "Members Only" chip on both the live Dinner Events page and this report.
MEMBER_ONLY_BG = "#fdf0da"
MEMBER_ONLY_TEXT = "#b8760f"

CSV_COLUMNS = [
    "Date",
    "Type",
    "Event Name",
    "Location",
    "Speaker Name",
    "Speaker Rotary Contact",
    "NGO-Organisation",
    "Topics/Description",
    "Member Only",
]


def _member_names(db: Session, events: list[AttendanceEvent]) -> dict[str, str]:
    member_ids = {
        event.speaker_rotary_contact_member_id
        for event in events
        if event.speaker_rotary_contact_member_id
    }
    if not member_ids:
        return {}
    rows = (
        db.query(Member.id, Member.first_name, Member.last_name)
        .filter(Member.id.in_(member_ids))
        .all()
    )
    return {str(row[0]): f"{row[1]} {row[2]}" for row in rows}


def _format_time_12h(value: time_type) -> str:
    """Story 16.27 — "7:00 PM" style, no leading zero on the hour, matching
    the date_label's own no-leading-zero convention."""
    hour_12 = value.hour % 12 or 12
    period = "AM" if value.hour < 12 else "PM"
    return f"{hour_12}:{value.minute:02d} {period}"


def _participation_label(eligible_total: int, present_count: int) -> str:
    if eligible_total == 0:
        return "No attendance recorded"
    rate = round(present_count / eligible_total * 100, 1)
    return f"{rate}% ({present_count}/{eligible_total})"


def build_csv_report(
    db: Session,
    events: list[AttendanceEvent],
    participation: dict[uuid.UUID, tuple[int, int]] | None = None,
) -> str:
    member_names = _member_names(db, events)
    columns = list(CSV_COLUMNS)
    if participation is not None:
        columns.append("Participation Rate")
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns)
    writer.writeheader()
    for event in events:
        row = {
            "Date": event.event_date.isoformat(),
            "Type": event.event_type,
            "Event Name": event.name,
            "Location": event.location or "",
            "Speaker Name": event.speaker_name or "",
            "Speaker Rotary Contact": member_names.get(
                str(event.speaker_rotary_contact_member_id), ""
            ),
            "NGO-Organisation": event.ngo_organisation_name or "",
            "Topics/Description": event.topics_description or "",
            "Member Only": "MEMBER ONLY" if event.member_only else "",
        }
        if participation is not None:
            eligible_total, present_count = participation.get(event.id, (0, 0))
            row["Participation Rate"] = _participation_label(eligible_total, present_count)
        writer.writerow(row)
    return buffer.getvalue()


class _NumberedCanvas(Canvas):
    """Standard reportlab two-pass recipe: buffers every page so the total
    count is known before the footer's "Page X of Y" is drawn."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states: list[dict] = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_footer(total_pages)
            super().showPage()
        super().save()

    def _draw_footer(self, total_pages: int) -> None:
        page_width = self._pagesize[0]
        self.setStrokeColor(colors.HexColor("#dde3ec"))
        self.setLineWidth(0.5)
        self.line(0.6 * inch, 0.55 * inch, page_width - 0.6 * inch, 0.55 * inch)
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#9aa7ba"))
        generated = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        self.drawString(0.6 * inch, 0.4 * inch, f"Generated {generated}")
        self.drawCentredString(
            page_width / 2, 0.4 * inch, f"Page {self.getPageNumber()} of {total_pages}"
        )
        self.drawRightString(
            page_width - 0.6 * inch, 0.4 * inch, f"{CLUB_NAME} — Dinner & Fellowship Calendar"
        )


PAGE_MARGIN = 0.4 * inch
CARD_GAP = 0.12 * inch

# 3 columns x 2 rows = 6 month cards per page. Story 16.17: pages are now
# chunked dynamically from however many months `_relevant_months` selects
# (no longer always the full 12-month/2-page grid), so this is a per-page
# cap, not a fixed total.
# 3 columns × 2 rows = 6 month cards per page.
MONTHS_PER_ROW = 3
ROWS_PER_PAGE = 2


def _rotary_year_months(rotary_year_value: int) -> list[date_type]:
    """The 12 (year, month) starts of a rotary year, Jul -> Jun, as the 1st
    of each month — used only as bucket keys/labels, never compared as a
    real event date."""
    months = [date_type(rotary_year_value, m, 1) for m in range(7, 13)]
    months += [date_type(rotary_year_value + 1, m, 1) for m in range(1, 7)]
    return months


def _month_start(d: date_type) -> date_type:
    return date_type(d.year, d.month, 1)


def _relevant_months(rotary_year_value: int, forecast: bool) -> list[date_type]:
    """Story 16.17 (follow-up): the default (unchecked) view shows the whole
    rotary year — past events with their participation rate *and* upcoming
    ones — so it always renders the full Jul-Jun grid. Only Forecast (future
    events only) narrows the grid down to the current month plus the
    remaining ones, so a forecast report late in the year doesn't render a
    string of mostly-empty "No events" cards for months already behind it."""
    all_months = _rotary_year_months(rotary_year_value)
    if not forecast:
        return all_months
    today_month = _month_start(date_type.today())
    months = [m for m in all_months if m >= today_month]
    # A rotary year entirely in the past has no remaining months for the
    # forecast view either — fall back to the full year rather than a
    # report with nothing in it.
    return months or all_months


def _group_by_month(
    events: list[AttendanceEvent], months: list[date_type]
) -> dict[date_type, list[AttendanceEvent]]:
    buckets: dict[date_type, list[AttendanceEvent]] = {m: [] for m in months}
    for event in sorted(events, key=lambda e: e.event_date):
        key = date_type(event.event_date.year, event.event_date.month, 1)
        if key in buckets:
            buckets[key].append(event)
    return buckets


def _month_card(
    month: date_type,
    month_events: list[AttendanceEvent],
    styles,
    width: float,
    type_colors: dict[str, tuple[str, str]],
    participation: dict[uuid.UUID, tuple[int, int]] | None = None,
) -> Table:
    title_style = styles["BodyText"].clone("month-title")
    title_style.fontSize = 15
    title_style.fontName = "Helvetica-Bold"
    title_style.textColor = colors.HexColor("#17458f")

    date_style = styles["BodyText"].clone("event-date")
    date_style.fontSize = 10.5
    date_style.fontName = "Helvetica-Bold"
    date_style.textColor = colors.HexColor("#0c2340")
    date_style.leading = 13

    chip_style = styles["BodyText"].clone("event-chip")
    chip_style.fontSize = 8
    chip_style.fontName = "Helvetica-Bold"
    chip_style.leading = 9

    name_style = styles["BodyText"].clone("event-name")
    name_style.fontSize = 10.5
    name_style.fontName = "Helvetica"
    name_style.textColor = colors.HexColor("#0c2340")
    name_style.leading = 13
    name_style.spaceBefore = 2

    location_style = styles["BodyText"].clone("event-location")
    location_style.fontSize = 10.5
    location_style.textColor = colors.HexColor("#6b7686")
    location_style.leading = 13

    title = Table([[Paragraph(month.strftime("%B %Y"), title_style)]], colWidths=[width - 28])
    title.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LINEBELOW", (0, 0), (-1, -1), 0.75, colors.HexColor("#eef1f5")),
            ]
        )
    )

    content: list = [title, Spacer(1, 6)]
    # Each event is wrapped in its own mini-card (subtle tint + border)
    # so events are visually separated from each other rather than running
    # together as flat text — "card instead of table" per Story 16.xx.
    card_inner_width = width - 28  # month card has 14px padding each side
    for index, event in enumerate(month_events):
        bg, fg = _safe_type_colors(type_colors.get(event.event_type, DEFAULT_TYPE_CHIP))
        chip_style_colored = chip_style.clone(f"chip-{month}-{index}")
        chip_style_colored.textColor = colors.HexColor(fg)
        # "3 Jul" — no leading zero, matching the design handoff exactly.
        # Story 16.27: start time (only) appended when set, e.g. "3 Jul, 7:00 PM".
        date_label = f"{event.event_date.day} {event.event_date.strftime('%b')}"
        if event.start_time:
            date_label += f", {_format_time_12h(event.start_time)}"

        row_cells = [Paragraph(date_label, date_style), Paragraph(escape(event.event_type), chip_style_colored)]
        row_style_commands = [
            ("LEFTPADDING", (0, 0), (0, 0), 0),
            ("RIGHTPADDING", (0, 0), (0, 0), 7),
            ("LEFTPADDING", (1, 0), (1, 0), 5),
            ("RIGHTPADDING", (1, 0), (1, 0), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("BACKGROUND", (1, 0), (1, 0), colors.HexColor(bg)),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]
        if event.member_only:
            member_only_style = chip_style.clone(f"member-only-{month}-{index}")
            member_only_style.textColor = colors.HexColor(MEMBER_ONLY_TEXT)
            row_cells.append(Paragraph("Members Only", member_only_style))
            row_style_commands += [
                ("LEFTPADDING", (2, 0), (2, 0), 5),
                ("RIGHTPADDING", (2, 0), (2, 0), 5),
                ("BACKGROUND", (2, 0), (2, 0), colors.HexColor(MEMBER_ONLY_BG)),
            ]
        date_row = Table([row_cells], colWidths=[None] * len(row_cells))
        date_row.setStyle(TableStyle(row_style_commands))

        # Name and location share a line; speaker/NGO/participation on their own.
        name_line = f'<font color="#0c2340"><b>{escape(event.name)}</b></font>'
        if event.location:
            name_line += f' — <font color="#6b7686">{escape(event.location)}</font>'

        ev_items: list = [date_row, Paragraph(name_line, name_style)]
        if event.speaker_name:
            ev_items.append(
                Paragraph(
                    f'<font color="#9aa7ba">Speaker:</font> {escape(event.speaker_name)}',
                    location_style,
                )
            )
        if event.ngo_organisation_name:
            ev_items.append(
                Paragraph(
                    f'<font color="#9aa7ba">NGO:</font> {escape(event.ngo_organisation_name)}',
                    location_style,
                )
            )
        if participation is not None:
            eligible_total, present_count = participation.get(event.id, (0, 0))
            ev_items.append(
                Paragraph(
                    f'<font color="#9aa7ba">Participation:</font> '
                    f"{escape(_participation_label(eligible_total, present_count))}",
                    location_style,
                )
            )

        # Wrap the event content in a mini-card (tinted background + light border)
        ev_card = Table([[ev_items]], colWidths=[card_inner_width])
        ev_card.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F2F6FC")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#DCE5F2")),
                    ("ROUNDEDCORNERS", [5, 5, 5, 5]),
                    ("LEFTPADDING", (0, 0), (-1, -1), 7),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        content.append(ev_card)
        if index < len(month_events) - 1:
            content.append(Spacer(1, 5))

    if not month_events:
        empty_style = location_style.clone("month-empty")
        empty_style.textColor = colors.HexColor("#9aa7ba")
        content.append(Paragraph("No events", empty_style))

    card = Table([[content]], colWidths=[width])
    card.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#dde3ec")),
                ("ROUNDEDCORNERS", [10, 10, 10, 10]),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return card


def _calendar_page(
    months: list[date_type],
    buckets: dict,
    styles,
    usable_width: float,
    type_colors: dict[str, tuple[str, str]],
    participation: dict[uuid.UUID, tuple[int, int]] | None = None,
) -> Table:
    card_width = (usable_width - (MONTHS_PER_ROW - 1) * CARD_GAP) / MONTHS_PER_ROW
    # Story 16.17: `months` is no longer always a full 6-per-page batch (a
    # historical/forecast page may only have 1-5 relevant months), so every
    # row is padded out to MONTHS_PER_ROW blank cells rather than assuming a
    # full page — an under-filled, unpadded row breaks the Table() below
    # (mismatched column count against col_widths).
    row_count = max(1, -(-len(months) // MONTHS_PER_ROW))  # ceil division
    rows: list[list] = []
    for row_index in range(row_count):
        row_months = months[row_index * MONTHS_PER_ROW : (row_index + 1) * MONTHS_PER_ROW]
        row: list = []
        for i in range(MONTHS_PER_ROW):
            if i < len(row_months):
                month = row_months[i]
                row.append(
                    _month_card(
                        month, buckets.get(month, []), styles, card_width, type_colors, participation
                    )
                )
            else:
                row.append("")
            if i < MONTHS_PER_ROW - 1:
                row.append("")
        rows.append(row)
        if row_index < row_count - 1:
            rows.append(["" for _ in row])

    col_widths = [card_width, CARD_GAP, card_width, CARD_GAP, card_width]
    row_heights: list[float | None] = []
    for row_index in range(row_count):
        row_heights.append(None)
        if row_index < row_count - 1:
            row_heights.append(CARD_GAP)
    grid = Table(rows, colWidths=col_widths, rowHeights=row_heights)
    grid.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return grid


def _logo_image(path: Path, target_height: float):
    """Scales to a target height while preserving the source image's own
    aspect ratio — a fixed width+height box (the old approach) squashed
    non-square logos out of shape."""
    if not path.exists():
        return ""
    reader = ImageReader(str(path))
    native_width, native_height = reader.getSize()
    width = target_height * (native_width / native_height)
    return Image(str(path), width=width, height=target_height)


def build_pdf_report(
    events: list[AttendanceEvent],
    rotary_year_value: int,
    type_colors: dict[str, tuple[str, str]] | None = None,
    participation: dict[uuid.UUID, tuple[int, int]] | None = None,
    forecast: bool = False,
) -> bytes:
    type_colors = type_colors or {}
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        topMargin=PAGE_MARGIN,
        bottomMargin=PAGE_MARGIN + 0.2 * inch,
        leftMargin=PAGE_MARGIN,
        rightMargin=PAGE_MARGIN,
    )
    styles = getSampleStyleSheet()
    story = []

    usable_width = landscape(letter)[0] - 2 * PAGE_MARGIN
    # Club logo (left) rendered larger and at its native aspect ratio —
    # the old fixed width==height box squashed it out of shape.
    left_logo = _logo_image(LOGO_PATH, 0.8 * inch)
    right_logo = _logo_image(INTL_LOGO_PATH, 0.6 * inch)

    # Header title block: "Year Event Schedule" as primary label with the
    # traditional "Dinner & Fellowship Calendar" as a secondary descriptor.
    report_title_style = styles["BodyText"].clone("report-title")
    report_title_style.fontSize = 20
    report_title_style.fontName = "Helvetica-Bold"
    report_title_style.textColor = colors.HexColor("#0c2340")
    report_title_style.alignment = 1
    report_title_style.leading = 24

    desc_style = styles["BodyText"].clone("report-desc")
    desc_style.fontSize = 12
    desc_style.fontName = "Helvetica"
    desc_style.textColor = colors.HexColor("#17458f")
    desc_style.alignment = 1
    desc_style.leading = 16
    desc_style.spaceBefore = 2

    subtitle_style = styles["BodyText"].clone("report-subtitle")
    subtitle_style.fontSize = 10
    subtitle_style.textColor = colors.HexColor("#6b7686")
    subtitle_style.alignment = 1
    subtitle_style.spaceBefore = 3

    view_label = "Forecast — Upcoming Events" if forecast else "Full Year Schedule"
    year_range = f"Rotary Year {rotary_year_value}–{rotary_year_value + 1}"
    title_block = [
        Paragraph("Year Event Schedule", report_title_style),
        Paragraph("Dinner &amp; Fellowship Calendar", desc_style),
        Paragraph(f"{year_range} · {view_label}", subtitle_style),
    ]
    header_row = Table(
        [[left_logo, title_block, right_logo]],
        colWidths=[usable_width * 0.14, usable_width * 0.72, usable_width * 0.14],
    )
    header_row.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (0, 0), "LEFT"),
                ("ALIGN", (1, 0), (1, 0), "CENTER"),
                ("ALIGN", (2, 0), (2, 0), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("LINEBELOW", (0, 0), (-1, -1), 2.0, colors.HexColor("#17458f")),
            ]
        )
    )
    story.append(header_row)
    story.append(Spacer(1, 0.18 * inch))

    months = _relevant_months(rotary_year_value, forecast)
    buckets = _group_by_month(events, months)

    months_per_page = MONTHS_PER_ROW * ROWS_PER_PAGE
    pages = [months[i : i + months_per_page] for i in range(0, len(months), months_per_page)]
    for index, page_months in enumerate(pages):
        story.append(
            _calendar_page(page_months, buckets, styles, usable_width, type_colors, participation)
        )
        if index < len(pages) - 1:
            story.append(PageBreak())

    doc.build(story, canvasmaker=_NumberedCanvas)
    return buffer.getvalue()


# ──────────────────────────────────────────────────────────────────────────────
# PPTX — "Year Event Schedule" slide deck (2026-09-06)
# ──────────────────────────────────────────────────────────────────────────────
# Slide canvas (1920×1080 at 144 dpi — same system as the Board Members report).
_PPTX_SLIDE_W        = 1920
_PPTX_SLIDE_H        = 1080
_PPTX_BAND_H         = 192
_PPTX_GRID_TOP       = 210   # px: card grid starts this far from slide top
_PPTX_SIDE_MARGIN    = 96    # px: left/right margin
_PPTX_COLS           = 3
_PPTX_COL_GAP        = 14   # px: horizontal gap between columns
_PPTX_CARD_COL_GAP   = 12   # px: vertical gap between month cards in a column
_PPTX_MONTHS_PER_SLIDE = 6  # 3 cols × 2 stacked months per slide

_PPTX_GRID_W = _PPTX_SLIDE_W - 2 * _PPTX_SIDE_MARGIN                            # 1728
_PPTX_CARD_W = (_PPTX_GRID_W - (_PPTX_COLS - 1) * _PPTX_COL_GAP) // _PPTX_COLS  # 421

# ── Height reference (144 dpi canvas: 1 pt = 2 px) ──────────────────────────
# All textframes have margins zeroed so box height == visible text height.
# Rule of thumb: box_h = pt × 2 × 1.2 (leading) + 4 px slack.
#   9 pt chip   → 22 px → box 26 px
#   11 pt date  → 26 px → box 30 px
#   12 pt name  → 29 px → box 34 px
#   10 pt detail→ 24 px → box 28 px
#   16 pt title → 38 px → box 44 px

# Month-card internal layout (px from card top-left)
_MC_TOP_PAD  = 14   # px: space above month title
_MC_TITLE_H  = 44   # px: 16 pt bold (38 px rendered, +6 slack)
_MC_SEP_Y    = _MC_TOP_PAD + _MC_TITLE_H + 8   # separator y = 66
_MC_EVENTS_Y = _MC_SEP_Y + 2 + 10              # first event y = 78
_MC_BOT_PAD  = 14   # px: space below last event card

# Event mini-card internal layout (px)
# Sizes chosen so 3 fully-loaded events (name + speaker/NGO + location) fit
# on one slide with 2 rows of month cards (available height ≈ 870 px).
#   8 pt chip   → 16 px → box 22 px
#  10 pt date   → 20 px → box 24 px
#  11 pt name   → 22 px → box 28 px
#   9 pt detail → 18 px → box 22 px
_EV_H_PAD     = 10   # px: horizontal padding inside event card
_EV_V_PAD     = 5    # px: vertical padding top & bottom
_EV_CHIP_H    = 22   # px: chip row height (8 pt chip text)
_EV_CHIP_HPAD = 6    # px: left margin inside chip textbox
_EV_DATE_W    = 170  # px: date+time ("15 Jul  7:00 PM" @ 10 pt bold ≈ 160 px)
_EV_NAME_H    = 28   # px: event name line (11 pt bold)
_EV_LOC_H     = 20   # px: location line (9 pt, wraps if long)
_EV_DETAIL_H  = 22   # px: speaker / NGO line (9 pt)
_EV_ROW_GAP   = 4    # px: gap between chip row and name row
_EV_INTER_GAP = 9    # px: gap between successive event mini-cards


def _tf0(tf) -> None:
    """Zero out all four default text-frame margins (avoids invisible overflow)."""
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0


def _pptx_ev_h(event: AttendanceEvent, participation) -> int:
    """Pixel height of one event mini-card (max 3 detail lines after chip row).

    Chip row (fixed height _EV_CHIP_H):
      [Date]  [Type chip]  [Members Only chip]  [attendance right-aligned]

    Detail lines below the chip row:
      1. Name (always, 11 pt bold)
      2. Speaker · NGO on one combined line (if either present, 9 pt)
      3. Location (9 pt, wraps if needed)
    """
    h = _EV_V_PAD + _EV_CHIP_H + _EV_ROW_GAP + _EV_NAME_H + _EV_V_PAD
    # line 2 – speaker + NGO share one line
    if event.speaker_name or event.ngo_organisation_name:
        h += _EV_DETAIL_H
    # line 3 – location (wraps)
    if event.location:
        h += _EV_LOC_H
    return h


def _pptx_mc_h(month_events: list, participation) -> int:
    """Pixel height of a full month card (title + all event mini-cards)."""
    if not month_events:
        return _MC_EVENTS_Y + 26 + _MC_BOT_PAD  # "No events" placeholder
    h = _MC_EVENTS_Y
    for i, ev in enumerate(month_events):
        if i > 0:
            h += _EV_INTER_GAP
        h += _pptx_ev_h(ev, participation)
    h += _MC_BOT_PAD
    return h


def _draw_year_schedule_chrome(slide, chrome: str, rotary_year_value: int, forecast: bool) -> None:
    """Chrome header for the PPTX — same patterns as the Board Members
    report but titled "Year Event Schedule" with a rotary-year subtitle."""
    if chrome == "template" and DISTRICT_BAND_IMAGE.exists():
        slide.shapes.add_picture(
            str(DISTRICT_BAND_IMAGE), 0, 0,
            width=_px_len(_PPTX_SLIDE_W), height=_px_len(_PPTX_SLIDE_H),
        )
    else:
        band = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE, 0, 0, _px_len(_PPTX_SLIDE_W), _px_len(_PPTX_BAND_H)
        )
        band.fill.solid()
        band.fill.fore_color.rgb = _rgb(COLOR_DISTRICT_GREEN)
        band.line.fill.background()
        band.shadow.inherit = False
        band.text_frame.clear()
        if CLUB_LOGO_LOCKUP_IMAGE.exists():
            with PILImage.open(CLUB_LOGO_LOCKUP_IMAGE) as logo_im:
                aspect = logo_im.width / logo_im.height
            logo_height = _px_len(120)
            logo_width = int(logo_height * aspect)
            slide.shapes.add_picture(
                str(CLUB_LOGO_LOCKUP_IMAGE),
                _px_len(1824) - logo_width,
                _px_len(96) - logo_height // 2,
                width=logo_width,
                height=logo_height,
            )

    # Primary title: "Year Event Schedule"
    # 36 pt = 72 px at 144 dpi; box height 80 px gives comfortable room.
    title_box = slide.shapes.add_textbox(
        _px_len(96), _px_len(44), _px_len(1500), _px_len(80)
    )
    title_tf = title_box.text_frame
    _tf0(title_tf)
    title_tf.word_wrap = False
    title_run = title_tf.paragraphs[0].add_run()
    title_run.text = "Year Event Schedule"
    title_run.font.size = Pt(36)
    title_run.font.bold = True
    title_run.font.color.rgb = _rgb("#FFFFFF")

    # Subtitle: rotary year + view label in kicker gold
    # 13 pt = 26 px; box height 34 px.
    view_label = "Upcoming Events" if forecast else "Full Year Schedule"
    year_str = f"Rotary Year {rotary_year_value}–{rotary_year_value + 1}  ·  {view_label}"
    sub_box = slide.shapes.add_textbox(
        _px_len(96), _px_len(132), _px_len(1500), _px_len(34)
    )
    sub_tf = sub_box.text_frame
    _tf0(sub_tf)
    sub_run = sub_tf.paragraphs[0].add_run()
    sub_run.text = year_str
    sub_run.font.size = Pt(13)
    sub_run.font.color.rgb = _rgb(COLOR_BAND_KICKER_GOLD)


def _draw_pptx_month_card(
    slide,
    month: date_type,
    month_events: list[AttendanceEvent],
    left_px: int,
    top_px: int,
    w_px: int,
    type_colors: dict[str, tuple[str, str]],
    participation: dict | None,
) -> int:
    """Draw one month card; returns actual height (px).

    Layout (all px coordinates from card top-left):
      [_MC_TOP_PAD] month title [_MC_SEP_Y] separator [_MC_EVENTS_Y] events…

    Each event mini-card:
      [_EV_V_PAD] date-box + type-chip + members-chip (row height _EV_CHIP_H)
      [_EV_ROW_GAP] name+location (_EV_NAME_H)
      optional: speaker / NGO / participation lines (_EV_DETAIL_H each)
      [_EV_V_PAD]

    All textframe margins are zeroed so box height == visible text height.
    """
    h_px = _pptx_mc_h(month_events, participation)

    # ── Month card outer body ──────────────────────────────────────────────
    card = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE,
        _px_len(left_px), _px_len(top_px),
        _px_len(w_px), _px_len(h_px),
    )
    card.fill.solid()
    card.fill.fore_color.rgb = _rgb("#FFFFFF")
    card.line.color.rgb = _rgb("#DDE3EC")
    card.line.width = Pt(0.75)
    card.adjustments[0] = 0.02
    card.shadow.inherit = False

    # ── Month title ────────────────────────────────────────────────────────
    title_box = slide.shapes.add_textbox(
        _px_len(left_px + 12), _px_len(top_px + _MC_TOP_PAD),
        _px_len(w_px - 24), _px_len(_MC_TITLE_H),
    )
    title_tf = title_box.text_frame
    _tf0(title_tf)
    title_tf.word_wrap = False
    title_r = title_tf.paragraphs[0].add_run()
    title_r.text = month.strftime("%B %Y")
    title_r.font.size = Pt(16)
    title_r.font.bold = True
    title_r.font.color.rgb = _rgb("#17458F")

    # ── Separator ──────────────────────────────────────────────────────────
    sep = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        _px_len(left_px + 12), _px_len(top_px + _MC_SEP_Y),
        _px_len(w_px - 24), _px_len(2),
    )
    sep.fill.solid()
    sep.fill.fore_color.rgb = _rgb("#EEF1F5")
    sep.line.fill.background()
    sep.shadow.inherit = False

    # ── "No events" placeholder ────────────────────────────────────────────
    if not month_events:
        eb = slide.shapes.add_textbox(
            _px_len(left_px + 12), _px_len(top_px + _MC_EVENTS_Y),
            _px_len(w_px - 24), _px_len(26),
        )
        _tf0(eb.text_frame)
        er = eb.text_frame.paragraphs[0].add_run()
        er.text = "No events"
        er.font.size = Pt(9)
        er.font.color.rgb = _rgb("#9AA7BA")
        return h_px

    # ── Event mini-cards ───────────────────────────────────────────────────
    ev_top = top_px + _MC_EVENTS_Y
    ev_x   = left_px + 8
    ev_w   = w_px - 16   # 8 px inner margin each side

    for idx, event in enumerate(month_events):
        if idx > 0:
            ev_top += _EV_INTER_GAP

        ev_h = _pptx_ev_h(event, participation)
        bg, fg = _safe_type_colors(type_colors.get(event.event_type, DEFAULT_TYPE_CHIP))

        # Event mini-card background (type's light color)
        ev_card = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE,
            _px_len(ev_x), _px_len(ev_top),
            _px_len(ev_w), _px_len(ev_h),
        )
        ev_card.fill.solid()
        ev_card.fill.fore_color.rgb = _rgb(bg)
        ev_card.line.fill.background()
        ev_card.adjustments[0] = 0.09
        ev_card.shadow.inherit = False

        chip_row_y = ev_top + _EV_V_PAD   # y of chip row (date + badges)

        # ── Date text ─────────────────────────────────────────────────────
        date_label = f"{event.event_date.day} {event.event_date.strftime('%b')}"
        if event.start_time:
            date_label += f"  {_format_time_12h(event.start_time)}"
        date_box = slide.shapes.add_textbox(
            _px_len(ev_x + _EV_H_PAD), _px_len(chip_row_y),
            _px_len(_EV_DATE_W), _px_len(_EV_CHIP_H),
        )
        _tf0(date_box.text_frame)
        date_box.text_frame.word_wrap = False
        date_r = date_box.text_frame.paragraphs[0].add_run()
        date_r.text = date_label
        date_r.font.size = Pt(10)
        date_r.font.bold = True
        date_r.font.color.rgb = _rgb("#0C2340")

        # ── Type chip (filled box, type's fg color, white text) ───────────
        # Width: 10 px/char is a safe estimate for 8 pt bold at 144 dpi.
        chip_text = event.event_type
        chip_text_w = max(36, len(chip_text) * 10)
        chip_box_w  = chip_text_w + 2 * _EV_CHIP_HPAD
        chip_x = ev_x + _EV_H_PAD + _EV_DATE_W + 4
        chip_box = slide.shapes.add_textbox(
            _px_len(chip_x), _px_len(chip_row_y),
            _px_len(chip_box_w), _px_len(_EV_CHIP_H),
        )
        chip_box.fill.solid()
        chip_box.fill.fore_color.rgb = _rgb(fg)
        chip_box.line.fill.background()
        chip_tf = chip_box.text_frame
        chip_tf.margin_left   = _px_len(_EV_CHIP_HPAD)
        chip_tf.margin_right  = 0
        chip_tf.margin_top    = 0
        chip_tf.margin_bottom = 0
        chip_r = chip_tf.paragraphs[0].add_run()
        chip_r.text = chip_text
        chip_r.font.size = Pt(8)
        chip_r.font.bold = True
        chip_r.font.color.rgb = _rgb("#FFFFFF")

        # Track right edge of last chip so Members Only and attendance can
        # be placed correctly.
        next_chip_x = chip_x + chip_box_w

        # ── Members Only chip (amber) ──────────────────────────────────────
        if event.member_only:
            mo_label = "Members Only"
            mo_text_w = len(mo_label) * 10
            mo_box_w  = mo_text_w + 2 * _EV_CHIP_HPAD
            mo_x = next_chip_x + 4
            mo_box = slide.shapes.add_textbox(
                _px_len(mo_x), _px_len(chip_row_y),
                _px_len(mo_box_w), _px_len(_EV_CHIP_H),
            )
            mo_box.fill.solid()
            mo_box.fill.fore_color.rgb = _rgb(MEMBER_ONLY_BG)
            mo_box.line.fill.background()
            mo_tf = mo_box.text_frame
            mo_tf.margin_left   = _px_len(_EV_CHIP_HPAD)
            mo_tf.margin_right  = 0
            mo_tf.margin_top    = 0
            mo_tf.margin_bottom = 0
            mo_r = mo_tf.paragraphs[0].add_run()
            mo_r.text = mo_label
            mo_r.font.size = Pt(8)
            mo_r.font.bold = True
            mo_r.font.color.rgb = _rgb(MEMBER_ONLY_TEXT)
            next_chip_x = mo_x + mo_box_w

        # ── Attendance — right-aligned on the chip row (no separate line) ──
        if participation is not None:
            eligible, present = participation.get(event.id, (0, 0))
            if eligible > 0:
                att_label = _participation_label(eligible, present)
                att_box = slide.shapes.add_textbox(
                    _px_len(ev_x + _EV_H_PAD), _px_len(chip_row_y),
                    _px_len(ev_w - 2 * _EV_H_PAD), _px_len(_EV_CHIP_H),
                )
                _tf0(att_box.text_frame)
                att_box.text_frame.word_wrap = False
                att_p = att_box.text_frame.paragraphs[0]
                att_p.alignment = PP_ALIGN.RIGHT
                att_r = att_p.add_run()
                att_r.text = att_label
                att_r.font.size = Pt(8)
                att_r.font.color.rgb = _rgb("#9AA7BA")

        # ── Line 1: Name ───────────────────────────────────────────────────
        name_y = chip_row_y + _EV_CHIP_H + _EV_ROW_GAP
        name_box = slide.shapes.add_textbox(
            _px_len(ev_x + _EV_H_PAD), _px_len(name_y),
            _px_len(ev_w - 2 * _EV_H_PAD), _px_len(_EV_NAME_H),
        )
        _tf0(name_box.text_frame)
        name_box.text_frame.word_wrap = False
        name_r = name_box.text_frame.paragraphs[0].add_run()
        name_r.text = event.name
        name_r.font.size = Pt(11)
        name_r.font.bold = True
        name_r.font.color.rgb = _rgb("#0C2340")

        detail_y = name_y + _EV_NAME_H

        # ── Line 2: Speaker · NGO on one combined line ─────────────────────
        spk = event.speaker_name or ""
        ngo = event.ngo_organisation_name or ""
        if spk or ngo:
            spk_ngo_text = (
                f"Speaker: {spk}  ·  NGO: {ngo}" if spk and ngo
                else f"Speaker: {spk}" if spk
                else f"NGO: {ngo}"
            )
            sn_box = slide.shapes.add_textbox(
                _px_len(ev_x + _EV_H_PAD), _px_len(detail_y),
                _px_len(ev_w - 2 * _EV_H_PAD), _px_len(_EV_DETAIL_H),
            )
            _tf0(sn_box.text_frame)
            sn_r = sn_box.text_frame.paragraphs[0].add_run()
            sn_r.text = spk_ngo_text
            sn_r.font.size = Pt(9)
            sn_r.font.color.rgb = _rgb("#9AA7BA")
            detail_y += _EV_DETAIL_H

        # ── Line 3: Location (wraps if needed) ─────────────────────────────
        if event.location:
            loc_box = slide.shapes.add_textbox(
                _px_len(ev_x + _EV_H_PAD), _px_len(detail_y),
                _px_len(ev_w - 2 * _EV_H_PAD), _px_len(_EV_LOC_H),
            )
            _tf0(loc_box.text_frame)
            loc_box.text_frame.word_wrap = True
            loc_r = loc_box.text_frame.paragraphs[0].add_run()
            loc_r.text = event.location
            loc_r.font.size = Pt(9)
            loc_r.font.bold = False
            loc_r.font.color.rgb = _rgb("#6B7686")

        ev_top += ev_h

    return h_px


def build_pptx_report(
    events: list[AttendanceEvent],
    rotary_year_value: int,
    type_colors: dict[str, tuple[str, str]] | None = None,
    participation: dict[uuid.UUID, tuple[int, int]] | None = None,
    forecast: bool = False,
    chrome: str = "plain",
) -> bytes:
    """PPTX export: "Year Event Schedule" deck.

    4 columns, variable-height month cards stacked in each column.
    Months distributed round-robin into columns so each column holds up to
    2 months (for _PPTX_MONTHS_PER_SLIDE = 8 months per slide). A full
    12-month year produces 2 slides.
    """
    type_colors = type_colors or {}

    months = _relevant_months(rotary_year_value, forecast)
    buckets = _group_by_month(events, months)

    pages = [
        months[i: i + _PPTX_MONTHS_PER_SLIDE]
        for i in range(0, len(months), _PPTX_MONTHS_PER_SLIDE)
    ]

    prs = Presentation()
    prs.slide_width = _px_len(_PPTX_SLIDE_W)
    prs.slide_height = _px_len(_PPTX_SLIDE_H)
    blank_layout = prs.slide_layouts[6]

    for page_months in pages:
        slide = prs.slides.add_slide(blank_layout)
        _draw_year_schedule_chrome(slide, chrome, rotary_year_value, forecast)

        # Distribute months round-robin into columns.
        # 6 months / 3 cols → col0=[0,3], col1=[1,4], col2=[2,5]
        col_months: list[list] = [[] for _ in range(_PPTX_COLS)]
        for i, month in enumerate(page_months):
            col_months[i % _PPTX_COLS].append(month)

        # Compute max card height per row so every column's row-N card
        # starts at the same Y — "second-row cards aligned across columns".
        # row r = the r-th month in each column (index r in col_months[c]).
        num_rows = max((len(col) for col in col_months), default=0)
        row_tops: list[int] = []
        y = _PPTX_GRID_TOP
        for r in range(num_rows):
            row_tops.append(y)
            # tallest card in this row across all columns
            row_max_h = max(
                _pptx_mc_h(buckets.get(col[r], []), participation)
                for col in col_months
                if r < len(col)
            )
            y += row_max_h + _PPTX_CARD_COL_GAP

        for col_idx, col in enumerate(col_months):
            col_x = _PPTX_SIDE_MARGIN + col_idx * (_PPTX_CARD_W + _PPTX_COL_GAP)
            for row_idx, month in enumerate(col):
                month_events = buckets.get(month, [])
                _draw_pptx_month_card(
                    slide, month, month_events,
                    col_x, row_tops[row_idx], _PPTX_CARD_W,
                    type_colors, participation,
                )

    buf = BytesIO()
    prs.save(buf)
    return buf.getvalue()
