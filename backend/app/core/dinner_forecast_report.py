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
# PPTX — "Year Event Schedule" slide deck
# ──────────────────────────────────────────────────────────────────────────────
# Slide canvas (1920×1080 at 144 dpi — same system as the Board Members report).
# Layout: 4 columns × 3 rows = 12 months on ONE slide.
# Row assignment: sequential left→right, then top→bottom
#   row 0 = Jul–Oct   (months  0–3)
#   row 1 = Nov–Feb   (months  4–7)
#   row 2 = Mar–Jun   (months  8–11)
_PPTX_SLIDE_W        = 1920
_PPTX_SLIDE_H        = 1080
_PPTX_BAND_H         = 160   # compact header band (was 192)
_PPTX_GRID_TOP       = 199   # px: card grid starts 39 px below band bottom
_PPTX_SIDE_MARGIN    = 72    # px: left/right margin (matches reference)
_PPTX_COLS           = 4     # 4 columns (was 3)
_PPTX_COL_GAP        = 14    # px: horizontal gap between columns
_PPTX_ROW_GAP        = 10    # px: vertical gap between rows
_PPTX_MONTHS_PER_SLIDE = 12  # all 12 months on one slide

# Derived card width:
#   grid_w = 1920 - 2×72 = 1776
#   card_w = (1776 - 3×14) / 4 = 1734/4 = 433 px
_PPTX_GRID_W = _PPTX_SLIDE_W - 2 * _PPTX_SIDE_MARGIN                            # 1776
_PPTX_CARD_W = (_PPTX_GRID_W - (_PPTX_COLS - 1) * _PPTX_COL_GAP) // _PPTX_COLS  # 433

# ── Month-card internal layout (compact list style, matching reference) ───────
# All coordinates are px from the card's top-left corner.
_MC_LEFT_PAD  = 10   # px: card horizontal padding (left)
_MC_RIGHT_PAD = 10   # px: card horizontal padding (right)
_MC_BAR_X     = 10   # px: left edge of per-event timeline bar from card left
_MC_TEXT_X    = 19   # px: left edge of event text from card left (after bar)
_MC_TOP_PAD   = 8    # px: space above month title
_MC_TITLE_H   = 26   # px: 13 pt bold month name  (was 11 pt / 20 px)
_MC_SEP_Y     = _MC_TOP_PAD + _MC_TITLE_H + 4   # gold rule y = 38
_MC_EVENTS_Y  = _MC_SEP_Y + 2 + 5               # first event y = 45
_MC_BOT_PAD   = 8    # px: space below last event

# ── Compact event line heights (144 dpi canvas: 1 pt ≈ 2 px) ─────────────────
# Sizes raised so text is comfortably readable on a projected screen.
_EV_META_H    = 19   # px: date · time · type [· Members Only] (9 pt)
_EV_NAME_H    = 24   # px: event name line (11 pt bold)
_EV_SUB_H     = 18   # px: venue/attendance or speaker line (9 pt)
_EV_TOP_PAD   = 4    # px: internal top padding inside event bg card
_EV_BOT_PAD   = 4    # px: internal bottom padding inside event bg card
_EV_INTER_GAP = 10   # px: gap between successive event bg cards


def _tf0(tf) -> None:
    """Zero out all four default text-frame margins (avoids invisible overflow)."""
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0


def _pptx_ev_h(event: AttendanceEvent, participation) -> int:
    """Pixel height of one compact event entry (timeline bar = same height).

    Layout inside the coloured bg card:
      [_EV_TOP_PAD] meta · name · [venue] · [speaker] [_EV_BOT_PAD]
    """
    h = _EV_TOP_PAD + _EV_META_H + _EV_NAME_H + _EV_BOT_PAD
    if event.location or (participation is not None and participation.get(event.id)):
        h += _EV_SUB_H
    if event.speaker_name or event.ngo_organisation_name:
        h += _EV_SUB_H
    return h


def _pptx_mc_h(month_events: list, participation) -> int:
    """Pixel height of a full month card (title + separator + all events)."""
    if not month_events:
        return _MC_EVENTS_Y + 18 + _MC_BOT_PAD  # "No events" placeholder
    h = _MC_EVENTS_Y
    for i, ev in enumerate(month_events):
        if i > 0:
            h += _EV_INTER_GAP
        h += _pptx_ev_h(ev, participation)
    h += _MC_BOT_PAD
    return h


def _draw_year_schedule_chrome(slide, chrome: str, rotary_year_value: int, forecast: bool) -> None:
    """Chrome header for the PPTX — compact 160 px band so the 4x3 month
    grid has maximum room below it."""
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
            logo_height = _px_len(110)
            logo_width = int(logo_height * aspect)
            slide.shapes.add_picture(
                str(CLUB_LOGO_LOCKUP_IMAGE),
                _px_len(1840) - logo_width,
                _px_len(80) - logo_height // 2,
                width=logo_width,
                height=logo_height,
            )

    # Primary title — 32 pt, y=36, box height 68 px (within 160 px band).
    title_box = slide.shapes.add_textbox(
        _px_len(80), _px_len(36), _px_len(1500), _px_len(68)
    )
    title_tf = title_box.text_frame
    _tf0(title_tf)
    title_tf.word_wrap = False
    title_run = title_tf.paragraphs[0].add_run()
    title_run.text = "Year Event Schedule"
    title_run.font.size = Pt(32)
    title_run.font.bold = True
    title_run.font.color.rgb = _rgb("#FFFFFF")

    # Subtitle — 13 pt gold, y=112, bottom=146 < 160 px band.
    view_label = "Upcoming Events" if forecast else "Full Year Schedule"
    year_str = f"Rotary Year {rotary_year_value}–{rotary_year_value + 1}  ·  {view_label}"
    sub_box = slide.shapes.add_textbox(
        _px_len(80), _px_len(112), _px_len(1500), _px_len(34)
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
    """Draw one month card using the compact reference list style.

    Visual design (matches reference download.pptx):
      - White card with subtle border
      - Month name in Rotary Blue (11 pt bold)
      - Gold rule below month name
      - Per-event: left grey timeline bar (3 px wide) + stacked text lines:
          1. Meta line  : date · time · type [· Members Only]  (7.5 pt, grey)
          2. Name line  : event name (9.5 pt bold, dark)
          3. Venue line : location · attendance (7.5 pt, lighter grey)  -- if any
          4. Speaker    : "Speaker: " (amber bold) + name/NGO (blue bold)  -- if any

    Returns actual card height in pixels.
    """
    h_px = _pptx_mc_h(month_events, participation)
    txt_w = w_px - _MC_TEXT_X - _MC_RIGHT_PAD  # usable text width

    # ── Card body ──────────────────────────────────────────────────────────
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
        _px_len(left_px + _MC_LEFT_PAD), _px_len(top_px + _MC_TOP_PAD),
        _px_len(w_px - _MC_LEFT_PAD - _MC_RIGHT_PAD), _px_len(_MC_TITLE_H),
    )
    _tf0(title_box.text_frame)
    title_box.text_frame.word_wrap = False
    title_r = title_box.text_frame.paragraphs[0].add_run()
    title_r.text = month.strftime("%B %Y")
    title_r.font.size = Pt(13)
    title_r.font.bold = True
    title_r.font.color.rgb = _rgb("#17458F")

    # ── Gold rule ──────────────────────────────────────────────────────────
    sep = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        _px_len(left_px + _MC_LEFT_PAD), _px_len(top_px + _MC_SEP_Y),
        _px_len(w_px - _MC_LEFT_PAD - _MC_RIGHT_PAD), _px_len(2),
    )
    sep.fill.solid()
    sep.fill.fore_color.rgb = _rgb("#F8AC1D")   # amber gold (reference colour)
    sep.line.fill.background()
    sep.shadow.inherit = False

    # ── "No events" placeholder ────────────────────────────────────────────
    if not month_events:
        eb = slide.shapes.add_textbox(
            _px_len(left_px + _MC_TEXT_X), _px_len(top_px + _MC_EVENTS_Y),
            _px_len(txt_w), _px_len(18),
        )
        _tf0(eb.text_frame)
        er = eb.text_frame.paragraphs[0].add_run()
        er.text = "No events"
        er.font.size = Pt(8)
        er.font.color.rgb = _rgb("#9AA7BA")
        return h_px

    # ── Compact event list ─────────────────────────────────────────────────
    ev_y = top_px + _MC_EVENTS_Y

    for idx, event in enumerate(month_events):
        if idx > 0:
            ev_y += _EV_INTER_GAP

        ev_h = _pptx_ev_h(event, participation)
        type_bg, type_fg = _safe_type_colors(type_colors.get(event.event_type, DEFAULT_TYPE_CHIP))

        # ── Light bg card (type's pastel colour) — drawn first (lowest z) ─
        bg_rect = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE,
            _px_len(left_px + _MC_LEFT_PAD), _px_len(ev_y),
            _px_len(w_px - _MC_LEFT_PAD - _MC_RIGHT_PAD), _px_len(ev_h),
        )
        bg_rect.fill.solid()
        bg_rect.fill.fore_color.rgb = _rgb(type_bg)
        bg_rect.line.fill.background()
        bg_rect.adjustments[0] = 0.06   # slight rounding
        bg_rect.shadow.inherit = False

        # ── Left accent bar (type fg colour, 4 px) ────────────────────────
        bar = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE,
            _px_len(left_px + _MC_LEFT_PAD), _px_len(ev_y),
            _px_len(4), _px_len(ev_h),
        )
        bar.fill.solid()
        bar.fill.fore_color.rgb = _rgb(type_fg)
        bar.line.fill.background()
        bar.shadow.inherit = False

        line_y = ev_y + _EV_TOP_PAD   # text starts after top padding

        # ── Meta: "7 Jul · 7:30 PM · Dinner [· Members Only]" ────────────
        date_str = f"{event.event_date.day} {event.event_date.strftime('%b')}"
        if event.start_time:
            date_str += f" · {_format_time_12h(event.start_time)}"
        meta_text = date_str + f" · {event.event_type}"
        if event.member_only:
            meta_text += "  ·  Members Only"

        meta_box = slide.shapes.add_textbox(
            _px_len(left_px + _MC_TEXT_X), _px_len(line_y),
            _px_len(txt_w), _px_len(_EV_META_H),
        )
        _tf0(meta_box.text_frame)
        meta_box.text_frame.word_wrap = False
        meta_r = meta_box.text_frame.paragraphs[0].add_run()
        meta_r.text = meta_text
        meta_r.font.size = Pt(9)
        meta_r.font.color.rgb = _rgb("#6B6F6B")
        line_y += _EV_META_H

        # ── Name (bold, dark) ─────────────────────────────────────────────
        name_box = slide.shapes.add_textbox(
            _px_len(left_px + _MC_TEXT_X), _px_len(line_y),
            _px_len(txt_w), _px_len(_EV_NAME_H),
        )
        _tf0(name_box.text_frame)
        name_box.text_frame.word_wrap = False
        name_r = name_box.text_frame.paragraphs[0].add_run()
        name_r.text = event.name
        name_r.font.size = Pt(11)
        name_r.font.bold = True
        name_r.font.color.rgb = _rgb("#201E1D")
        line_y += _EV_NAME_H

        # ── Venue · attendance ────────────────────────────────────────────
        venue_parts: list[str] = []
        if event.location:
            venue_parts.append(event.location)
        if participation is not None:
            eligible, present = participation.get(event.id, (0, 0))
            if eligible > 0:
                venue_parts.append(_participation_label(eligible, present))
        if venue_parts:
            loc_box = slide.shapes.add_textbox(
                _px_len(left_px + _MC_TEXT_X), _px_len(line_y),
                _px_len(txt_w), _px_len(_EV_SUB_H),
            )
            _tf0(loc_box.text_frame)
            loc_box.text_frame.word_wrap = False
            loc_r = loc_box.text_frame.paragraphs[0].add_run()
            loc_r.text = "  ·  ".join(venue_parts)
            loc_r.font.size = Pt(9)
            loc_r.font.color.rgb = _rgb("#8A8886")
            line_y += _EV_SUB_H

        # ── Speaker / NGO — "Speaker: " amber bold + name blue bold ───────
        spk = event.speaker_name or ""
        ngo = event.ngo_organisation_name or ""
        if spk or ngo:
            spk_box = slide.shapes.add_textbox(
                _px_len(left_px + _MC_TEXT_X), _px_len(line_y),
                _px_len(txt_w), _px_len(_EV_SUB_H),
            )
            _tf0(spk_box.text_frame)
            spk_box.text_frame.word_wrap = False
            spk_p = spk_box.text_frame.paragraphs[0]

            label_r = spk_p.add_run()
            label_r.text = "Speaker: "
            label_r.font.size = Pt(9)
            label_r.font.bold = True
            label_r.font.color.rgb = _rgb("#B8860B")   # amber (reference)

            name_part = (
                f"{spk}  ·  {ngo}" if spk and ngo
                else spk if spk
                else ngo
            )
            name_r = spk_p.add_run()
            name_r.text = name_part
            name_r.font.size = Pt(9)
            name_r.font.bold = True
            name_r.font.color.rgb = _rgb("#17458F")    # Rotary Blue

        ev_y += ev_h

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

    Single-slide layout: 4 columns x 3 rows = all 12 Rotary-year months.
    Months are distributed sequentially (left->right, then top->bottom):
      row 0 -> months 0-3  (Jul-Oct)
      row 1 -> months 4-7  (Nov-Feb)
      row 2 -> months 8-11 (Mar-Jun)

    Each row's height is determined by the tallest card in that row so all
    four cards in a row share the same top Y -- clean grid alignment with no
    header overlap.
    """
    type_colors = type_colors or {}

    months = _relevant_months(rotary_year_value, forecast)
    buckets = _group_by_month(events, months)

    # Split into pages of _PPTX_MONTHS_PER_SLIDE (12) -- typically just 1 page.
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

        # Sequential rows: each row holds _PPTX_COLS months.
        rows: list[list] = [
            page_months[i: i + _PPTX_COLS]
            for i in range(0, len(page_months), _PPTX_COLS)
        ]

        y = _PPTX_GRID_TOP
        for row_months in rows:
            # Row height = tallest card in this row.
            row_h = max(
                _pptx_mc_h(buckets.get(m, []), participation)
                for m in row_months
            )

            for col_idx, month in enumerate(row_months):
                col_x = _PPTX_SIDE_MARGIN + col_idx * (_PPTX_CARD_W + _PPTX_COL_GAP)
                month_events = buckets.get(month, [])
                _draw_pptx_month_card(
                    slide, month, month_events,
                    col_x, y, _PPTX_CARD_W,
                    type_colors, participation,
                )

            y += row_h + _PPTX_ROW_GAP

    buf = BytesIO()
    prs.save(buf)
    return buf.getvalue()
