"""PDF/CSV export of an event's Guest List, grouped by table (Story 14.5).

Same two-logo header convention as app/core/dinner_forecast_report.py:
LOGO_PATH (club logo) exists in this repo, INTL_LOGO_PATH (Rotary
International logo) doesn't yet — it renders automatically the moment that
asset is added, no code change needed.
"""
import csv
from datetime import date as date_type, datetime, timezone
from io import BytesIO, StringIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.dinner_forecast_report import INTL_LOGO_PATH, _logo_image
from app.core.pdf_style import PDF_BODY_FONT_SIZE, PDF_TABLE_HEADER_FONT_SIZE
from app.core.statistics_report import CLUB_NAME, LOGO_PATH, ROTARY_BLUE

UNASSIGNED_LABEL = "Unassigned"

PAYMENT_STATUS_LABELS = {"paid": "Paid", "not_paid": "Not Paid", "guest": "Guest"}

CSV_COLUMNS = [
    "Table Number",
    "Theme Name",
    "Rotary Name",
    "Title",
    "Surname",
    "First Name",
    "Contact Rotarian",
    "Payment Status",
    "Early Bird",
]


def _group_by_table(guests: list[dict], table_by_number: dict[int, dict]) -> list[tuple[dict | None, list[dict]]]:
    """Returns [(table_or_None, guests)], tables ascending by number, then
    the unassigned bucket (if any) last."""
    grouped: dict[int | None, list[dict]] = {}
    for guest in guests:
        grouped.setdefault(guest["table_number"], []).append(guest)

    assigned_numbers = sorted(n for n in grouped if n is not None)
    result = [(table_by_number.get(n), grouped[n]) for n in assigned_numbers]
    if None in grouped:
        result.append((None, grouped[None]))
    return result


def build_csv_report(guests: list[dict], table_by_number: dict[int, dict]) -> str:
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    for table, table_guests in _group_by_table(guests, table_by_number):
        for guest in table_guests:
            writer.writerow(
                {
                    "Table Number": guest["table_number"] if guest["table_number"] is not None else "",
                    "Theme Name": table["theme_name"] if table else "",
                    "Rotary Name": table["rotary_name"] if table else "",
                    "Title": guest["title"] or "",
                    "Surname": guest["surname"],
                    "First Name": guest["first_name"],
                    "Contact Rotarian": guest["contact_rotarian_name"] or "",
                    "Payment Status": PAYMENT_STATUS_LABELS[guest["payment_status"]],
                    "Early Bird": "TRUE" if guest["early_bird"] else "FALSE",
                }
            )
    return buffer.getvalue()


def _ordinal_date(value: date_type) -> str:
    day = value.day
    suffix = "th" if 11 <= day % 100 <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    return f"{day}{suffix} {value.strftime('%B %Y')}"


class _NumberedCanvas(Canvas):
    """Standard reportlab two-pass recipe — same as dinner_forecast_report.py."""

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
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#5b6472"))
        self.drawString(
            0.6 * inch, 0.4 * inch, f"Page {self.getPageNumber()} of {total_pages}"
        )
        generated = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        self.drawRightString(page_width - 0.6 * inch, 0.4 * inch, f"Generated {generated}")


PAGE_MARGIN = 0.5 * inch

# Minimal-theme accent tokens (theme-minimal.css) reused here so the printed
# entry-display seating plan matches the app's on-screen design language.
ACCENT_SOFT = "#e7f0fb"
ACCENT_INK = "#124a90"
FAINT = "#9aa3b2"
LINE = "#e9ecf2"

CARD_COLUMNS = 3
CARD_GUTTER = 0.14 * inch


def _cell_style(styles, *, bold: bool = False):
    style = styles["BodyText"].clone("cell")
    style.fontSize = PDF_TABLE_HEADER_FONT_SIZE if bold else PDF_BODY_FONT_SIZE
    style.leading = style.fontSize + 2.5
    style.fontName = "Helvetica-Bold" if bold else "Helvetica"
    return style


def _table_card(heading: str, table_guests: list[dict], *, card_width: float, header_style, body_style) -> Table:
    """One seating-plan card: theme name on an accent-soft band, guests
    below it sorted by surname (Section D — entry-display report, not the
    old per-table data table). Returned as a plain Table (not wrapped in
    KeepTogether — nesting KeepTogether inside another Table's cell breaks
    reportlab's row-height calculation); `repeatRows=1` keeps the header
    with its guests if a card ever has to split across a page."""
    rows = [[Paragraph(escape(heading), header_style)]]
    for guest in sorted(table_guests, key=lambda g: g["surname"].lower()):
        title = escape(guest["title"] or "")
        surname = escape(guest["surname"])
        first_name = escape(guest["first_name"])
        title_chip = f'<font size="6.5" color="{FAINT}">{title}</font>&nbsp;&nbsp;' if title else ""
        rows.append([Paragraph(f"{title_chip}<b>{surname}</b>, {first_name}", body_style)])

    card = Table(rows, colWidths=[card_width], repeatRows=1)
    card.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), colors.HexColor(ACCENT_SOFT)),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor(LINE)),
                ("LINEBELOW", (0, 0), (0, 0), 0.75, colors.HexColor(LINE)),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (0, 0), 3),
                ("BOTTOMPADDING", (0, 0), (0, 0), 3),
                ("TOPPADDING", (0, 1), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 1),
            ]
        )
    )
    return card


def build_pdf_report(
    event_name: str,
    event_date: date_type,
    event_theme: str | None,
    guests: list[dict],
    table_by_number: dict[int, dict],
) -> bytes:
    """Entry-display seating plan (Section D of the Minimal-restyle handoff)
    — printed at the door for guest check-in, grouped by table, guests
    listed by surname under each table's theme name only."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        topMargin=PAGE_MARGIN,
        bottomMargin=PAGE_MARGIN + 0.2 * inch,
        leftMargin=PAGE_MARGIN,
        rightMargin=PAGE_MARGIN,
    )
    styles = getSampleStyleSheet()
    story = []
    usable_width = doc.width

    # ── Header band: club logo (left) / rotary-international logo (right,
    # renders automatically once that asset exists), club name + event theme
    # title + event name/date centered between them — same 3-column,
    # aspect-preserving-logo convention as dinner_forecast_report.py's
    # header_row, with the rule below via LINEBELOW instead of a separate
    # rule Table. ──
    club_style = styles["Normal"].clone("club-name")
    club_style.alignment = 1  # center
    club_style.fontSize = 10
    club_style.fontName = "Helvetica-Bold"
    club_style.textColor = colors.HexColor(FAINT)

    title_style = styles["Heading1"].clone("event-theme")
    title_style.alignment = 1
    title_style.fontSize = 16
    title_style.spaceBefore = 1
    title_style.spaceAfter = 1

    subline_style = styles["Normal"].clone("event-subline")
    subline_style.alignment = 1
    subline_style.fontSize = 9
    subline_style.textColor = colors.HexColor(ACCENT_INK)

    text_block = [
        Paragraph(escape(CLUB_NAME), club_style),
        Paragraph(escape(event_theme or event_name), title_style),
        Paragraph(f"{escape(event_name)} &middot; {escape(_ordinal_date(event_date))}", subline_style),
    ]

    left_logo = _logo_image(LOGO_PATH, 0.75 * inch)
    right_logo = _logo_image(INTL_LOGO_PATH, 0.55 * inch)
    header_table = Table(
        [[left_logo, text_block, right_logo]],
        colWidths=[usable_width * 0.16, usable_width * 0.68, usable_width * 0.16],
    )
    header_table.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (0, 0), "LEFT"),
                ("ALIGN", (1, 0), (1, 0), "CENTER"),
                ("ALIGN", (2, 0), (2, 0), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LINEBELOW", (0, 0), (-1, -1), 1.5, colors.HexColor(ROTARY_BLUE)),
            ]
        )
    )
    story.append(header_table)
    story.append(Spacer(1, 0.12 * inch))

    # ── Table grid: 3 columns of table cards, theme name only in the header ──
    header_style = _cell_style(styles, bold=True)
    header_style.alignment = 1
    header_style.textColor = colors.HexColor(ACCENT_INK)
    header_style.fontSize = 8
    header_style.leading = 9.5
    body_style = _cell_style(styles)
    body_style.fontSize = 8.5
    body_style.leading = 10.2

    card_width = (usable_width - CARD_GUTTER * (CARD_COLUMNS - 1)) / CARD_COLUMNS
    cards = []
    for table, table_guests in _group_by_table(guests, table_by_number):
        heading = (table["theme_name"] or f"Table {table['table_number']}") if table else UNASSIGNED_LABEL
        cards.append(_table_card(heading, table_guests, card_width=card_width, header_style=header_style, body_style=body_style))

    for row_start in range(0, len(cards), CARD_COLUMNS):
        row_cards = cards[row_start : row_start + CARD_COLUMNS]
        row_cards += [""] * (CARD_COLUMNS - len(row_cards))
        col_widths = []
        for i in range(CARD_COLUMNS):
            col_widths.append(card_width)
            if i < CARD_COLUMNS - 1:
                col_widths.append(CARD_GUTTER)
        padded_row = []
        for i, card in enumerate(row_cards):
            padded_row.append(card)
            if i < CARD_COLUMNS - 1:
                padded_row.append("")
        grid_row = Table([padded_row], colWidths=col_widths)
        grid_row.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(grid_row)

    doc.build(story, canvasmaker=_NumberedCanvas)
    return buffer.getvalue()
