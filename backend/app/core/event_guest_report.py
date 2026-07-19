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
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.dinner_forecast_report import INTL_LOGO_PATH
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
COLUMN_WIDTHS = [1.2 * inch, 2.2 * inch, 2.2 * inch]  # Title, Surname, First Name


def _cell_style(styles, *, bold: bool = False):
    style = styles["BodyText"].clone("cell")
    style.fontSize = PDF_TABLE_HEADER_FONT_SIZE if bold else PDF_BODY_FONT_SIZE
    style.leading = style.fontSize + 2.5
    style.fontName = "Helvetica-Bold" if bold else "Helvetica"
    return style


def build_pdf_report(
    event_name: str, event_date: date_type, guests: list[dict], table_by_number: dict[int, dict]
) -> bytes:
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

    usable_width = sum(COLUMN_WIDTHS)
    left_logo = Image(str(LOGO_PATH), width=0.6 * inch, height=0.6 * inch) if LOGO_PATH.exists() else ""
    right_logo = (
        Image(str(INTL_LOGO_PATH), width=0.6 * inch, height=0.6 * inch)
        if INTL_LOGO_PATH.exists()
        else ""
    )
    if left_logo or right_logo:
        logo_row = Table([[left_logo, right_logo]], colWidths=[usable_width / 2, usable_width / 2])
        logo_row.setStyle(
            TableStyle(
                [
                    ("ALIGN", (0, 0), (0, 0), "LEFT"),
                    ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        story.append(logo_row)

    story.append(Paragraph(CLUB_NAME, styles["Title"]))
    story.append(
        Paragraph(f"{escape(event_name)} — {event_date.strftime('%d %b %Y')}", styles["Heading2"])
    )
    story.append(Spacer(1, 0.2 * inch))

    header_style = _cell_style(styles, bold=True)
    header_style.textColor = colors.white
    body_style = _cell_style(styles)

    for table, table_guests in _group_by_table(guests, table_by_number):
        section = []
        if table is None:
            heading = UNASSIGNED_LABEL
        else:
            heading = f"Table {table['table_number']} — {table['theme_name'] or ''}"
            if table["rotary_name"]:
                heading += f" ({table['rotary_name']})"
        section.append(Paragraph(escape(heading), styles["Heading3"]))

        rows = [[Paragraph(text, header_style) for text in ["Title", "Surname", "First Name"]]]
        for guest in table_guests:
            rows.append(
                [
                    Paragraph(escape(guest["title"] or ""), body_style),
                    Paragraph(escape(guest["surname"]), body_style),
                    Paragraph(escape(guest["first_name"]), body_style),
                ]
            )
        guest_table = Table(rows, colWidths=COLUMN_WIDTHS, repeatRows=1)
        guest_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(ROTARY_BLUE)),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d0d5dd")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f7fa")]),
                ]
            )
        )
        section.append(guest_table)
        section.append(Spacer(1, 0.25 * inch))
        # KeepTogether: a table's heading and its guest rows shouldn't be
        # split across a page break — each table section is a display/
        # seating list unit, not a continuous report table.
        story.append(KeepTogether(section))

    doc.build(story, canvasmaker=_NumberedCanvas)
    return buffer.getvalue()
