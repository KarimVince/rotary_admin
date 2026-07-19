"""PDF/CSV export of the Dinner Forecast event list (Story 15.2).

PDF header renders the club logo top-left and the Rotary International logo
top-right. Only the club logo (`LOGO_PATH`) exists in this repo so far —
`INTL_LOGO_PATH` renders automatically the moment that file is added at
`backend/app/assets/rotary-international-logo.png`, no code change needed.

Story 16.9: the PDF is a two-page month-by-month calendar (matching the
"Dinner Calendar Report" design handoff) — 6 month cards per page, July-
December then January-June of the rotary year, each card listing its
events' date/type/name/location — deliberately no attendance data, per
that handoff's explicit instruction.
"""
import calendar
import csv
from datetime import date as date_type, datetime, timezone
from io import BytesIO, StringIO
from pathlib import Path
from xml.sax.saxutils import escape

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


def build_csv_report(db: Session, events: list[AttendanceEvent]) -> str:
    member_names = _member_names(db, events)
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    for event in events:
        writer.writerow(
            {
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
        )
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

# 3 columns x 2 rows = 6 month cards per page; 12 months of a rotary year
# (Jul-Jun) split into exactly 2 pages of 6.
MONTHS_PER_ROW = 3
ROWS_PER_PAGE = 2


def _rotary_year_months(rotary_year_value: int) -> list[date_type]:
    """The 12 (year, month) starts of a rotary year, Jul -> Jun, as the 1st
    of each month — used only as bucket keys/labels, never compared as a
    real event date."""
    months = [date_type(rotary_year_value, m, 1) for m in range(7, 13)]
    months += [date_type(rotary_year_value + 1, m, 1) for m in range(1, 7)]
    return months


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

    content: list = [title, Spacer(1, 8)]
    for index, event in enumerate(month_events):
        bg, fg = _safe_type_colors(type_colors.get(event.event_type, DEFAULT_TYPE_CHIP))
        chip_style_colored = chip_style.clone(f"chip-{month}-{index}")
        chip_style_colored.textColor = colors.HexColor(fg)
        # "3 Jul" — no leading zero, matching the design handoff exactly.
        date_label = f"{event.event_date.day} {event.event_date.strftime('%b')}"

        row_cells = [Paragraph(date_label, date_style), Paragraph(escape(event.event_type), chip_style_colored)]
        row_style_commands = [
            ("LEFTPADDING", (0, 0), (0, 0), 0),
            ("RIGHTPADDING", (0, 0), (0, 0), 8),
            ("LEFTPADDING", (1, 0), (1, 0), 6),
            ("RIGHTPADDING", (1, 0), (1, 0), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
            ("BACKGROUND", (1, 0), (1, 0), colors.HexColor(bg)),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]
        if event.member_only:
            member_only_style = chip_style.clone(f"member-only-{month}-{index}")
            member_only_style.textColor = colors.HexColor(MEMBER_ONLY_TEXT)
            row_cells.append(Paragraph("Members Only", member_only_style))
            row_style_commands += [
                ("LEFTPADDING", (2, 0), (2, 0), 6),
                ("RIGHTPADDING", (2, 0), (2, 0), 6),
                ("BACKGROUND", (2, 0), (2, 0), colors.HexColor(MEMBER_ONLY_BG)),
            ]
        date_row = Table([row_cells], colWidths=[None] * len(row_cells))
        date_row.setStyle(TableStyle(row_style_commands))
        content.append(date_row)
        # Name and location share a line (location right after the name,
        # not buried below the speaker) — speaker gets its own labelled
        # line underneath since it's a distinct fact, not part of "where".
        name_line = f'<font color="#0c2340"><b>{escape(event.name)}</b></font>'
        if event.location:
            name_line += f' — <font color="#6b7686">{escape(event.location)}</font>'
        content.append(Paragraph(name_line, name_style))
        if event.speaker_name:
            content.append(
                Paragraph(
                    f'<font color="#9aa7ba">Speaker:</font> {escape(event.speaker_name)}',
                    location_style,
                )
            )
        if index < len(month_events) - 1:
            content.append(Spacer(1, 7))

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
) -> Table:
    card_width = (usable_width - (MONTHS_PER_ROW - 1) * CARD_GAP) / MONTHS_PER_ROW
    rows: list[list] = []
    for row_index in range(ROWS_PER_PAGE):
        row_months = months[row_index * MONTHS_PER_ROW : (row_index + 1) * MONTHS_PER_ROW]
        row: list = []
        for i, month in enumerate(row_months):
            row.append(_month_card(month, buckets[month], styles, card_width, type_colors))
            if i < len(row_months) - 1:
                row.append("")
        rows.append(row)
        if row_index < ROWS_PER_PAGE - 1:
            rows.append(["" for _ in row])

    col_widths = [card_width, CARD_GAP, card_width, CARD_GAP, card_width]
    row_heights = [None, CARD_GAP, None]
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
    left_logo = _logo_image(LOGO_PATH, 0.75 * inch)
    right_logo = _logo_image(INTL_LOGO_PATH, 0.55 * inch)
    title_style = styles["BodyText"].clone("report-title")
    title_style.fontSize = 17
    title_style.fontName = "Helvetica-Bold"
    title_style.textColor = colors.HexColor("#0c2340")
    title_style.alignment = 1
    subtitle_style = styles["BodyText"].clone("report-subtitle")
    subtitle_style.fontSize = 11
    subtitle_style.textColor = colors.HexColor("#6b7686")
    subtitle_style.alignment = 1

    title_block = [
        Paragraph("Dinner &amp; Fellowship Calendar", title_style),
        Paragraph(f"Rotary Year {rotary_year_value}–{rotary_year_value + 1}", subtitle_style),
    ]
    header_row = Table(
        [[left_logo, title_block, right_logo]],
        colWidths=[usable_width * 0.15, usable_width * 0.7, usable_width * 0.15],
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
                ("LINEBELOW", (0, 0), (-1, -1), 1.5, colors.HexColor("#17458f")),
            ]
        )
    )
    story.append(header_row)
    story.append(Spacer(1, 0.2 * inch))

    months = _rotary_year_months(rotary_year_value)
    buckets = _group_by_month(events, months)

    story.append(_calendar_page(months[:6], buckets, styles, usable_width, type_colors))
    story.append(PageBreak())
    story.append(_calendar_page(months[6:], buckets, styles, usable_width, type_colors))

    doc.build(story, canvasmaker=_NumberedCanvas)
    return buffer.getvalue()
