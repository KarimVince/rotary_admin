"""PDF/CSV export of the Dinner Forecast event list (Story 15.2).

PDF header renders the club logo top-left and the Rotary International logo
top-right. Only the club logo (`LOGO_PATH`) exists in this repo so far —
`INTL_LOGO_PATH` renders automatically the moment that file is added at
`backend/app/assets/rotary-international-logo.png`, no code change needed.
"""
import csv
from datetime import datetime, timezone
from io import BytesIO, StringIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from app.core.pdf_style import PDF_BODY_FONT_SIZE, PDF_TABLE_HEADER_FONT_SIZE
from app.core.statistics_report import CLUB_NAME, LOGO_PATH, ROTARY_BLUE
from app.models import AttendanceEvent, Member

# See module docstring — not present in this repo yet, render it once it is.
INTL_LOGO_PATH = Path(__file__).resolve().parents[1] / "assets" / "rotary-international-logo.png"

EVENT_TYPE_LABEL = {"dinner": "Dinner", "fellowship": "Fellowship"}

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
                "Type": EVENT_TYPE_LABEL[event.event_type],
                "Event Name": event.name,
                "Location": event.location or "",
                "Speaker Name": event.speaker_name or "",
                "Speaker Rotary Contact": member_names.get(
                    str(event.speaker_rotary_contact_member_id), ""
                ),
                "NGO-Organisation": event.ngo_organisation_name or "",
                "Topics/Description": event.topics_description or "",
                "Member Only": "TRUE" if event.member_only else "FALSE",
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
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#5b6472"))
        self.drawString(
            0.6 * inch, 0.4 * inch, f"Page {self.getPageNumber()} of {total_pages}"
        )
        generated = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        self.drawRightString(page_width - 0.6 * inch, 0.4 * inch, f"Generated {generated}")


PAGE_MARGIN = 0.3 * inch

# Explicit widths — landscape letter minus PAGE_MARGIN*2 is ~10.4in of usable
# width; these sum to exactly that. Date widened so the ISO "YYYY-MM-DD"
# string never wraps (reportlab's Paragraph treats the hyphens as breakable,
# which is what caused the two-line wrap at the old 0.65in). Event Name and
# Location also widened; Speaker/Speaker Rotary Contact/NGO-Organisation
# narrowed to free up space for Topics/Description, the widest column.
COLUMN_WIDTHS = [
    1.1 * inch,  # Date
    0.6 * inch,  # Type
    1.35 * inch,  # Event Name
    1.5 * inch,  # Location
    1.0 * inch,  # Speaker
    1.05 * inch,  # Speaker Rotary Contact
    1.0 * inch,  # NGO-Organisation
    2.15 * inch,  # Topics/Description
    0.65 * inch,  # Member Only (Story 15.6/15.7)
]


def _cell_style(styles, *, bold: bool = False):
    style = styles["BodyText"].clone("cell")
    style.fontSize = PDF_TABLE_HEADER_FONT_SIZE if bold else PDF_BODY_FONT_SIZE
    style.leading = style.fontSize + 2.5
    style.fontName = "Helvetica-Bold" if bold else "Helvetica"
    return style


def build_pdf_report(db: Session, events: list[AttendanceEvent], rotary_year_value: int) -> bytes:
    member_names = _member_names(db, events)
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

    usable_width = sum(COLUMN_WIDTHS)
    left_logo = Image(str(LOGO_PATH), width=0.7 * inch, height=0.7 * inch) if LOGO_PATH.exists() else ""
    right_logo = (
        Image(str(INTL_LOGO_PATH), width=0.7 * inch, height=0.7 * inch)
        if INTL_LOGO_PATH.exists()
        else ""
    )
    if left_logo or right_logo:
        # Club logo top-left, Rotary International logo top-right — opposite
        # corners of the page, not stacked together.
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
        Paragraph(
            f"Dinner Events — Rotary Year {rotary_year_value}–{rotary_year_value + 1}",
            styles["Heading2"],
        )
    )
    story.append(Spacer(1, 0.15 * inch))

    header_style = _cell_style(styles, bold=True)
    header_style.textColor = colors.white
    body_style = _cell_style(styles)

    header = [
        "Date",
        "Type",
        "Event Name",
        "Location",
        "Speaker",
        "Speaker Rotary Contact",
        "NGO-Organisation",
        "Topics/Description",
        "Member Only",
    ]
    rows = [[Paragraph(text, header_style) for text in header]]
    for event in events:
        # "13 Jul 2026" with non-breaking spaces baked into the strftime
        # format itself — not the ISO "YYYY-MM-DD" form, whose hyphens
        # reportlab's Paragraph treats as breakable (that's what caused
        # the two-line wrap at the old column width). Non-breaking spaces
        # mean this can never wrap either way.
        date_display = event.event_date.strftime("%d %b %Y")
        rows.append(
            [
                Paragraph(date_display, body_style),
                Paragraph(escape(EVENT_TYPE_LABEL[event.event_type]), body_style),
                Paragraph(escape(event.name), body_style),
                Paragraph(escape(event.location or ""), body_style),
                Paragraph(escape(event.speaker_name or ""), body_style),
                Paragraph(
                    escape(member_names.get(str(event.speaker_rotary_contact_member_id), "")),
                    body_style,
                ),
                Paragraph(escape(event.ngo_organisation_name or ""), body_style),
                Paragraph(escape(event.topics_description or "").replace("\n", "<br/>"), body_style),
                Paragraph("Yes" if event.member_only else "No", body_style),
            ]
        )

    table = Table(rows, colWidths=COLUMN_WIDTHS, repeatRows=1)
    table.setStyle(
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
    story.append(table)

    doc.build(story, canvasmaker=_NumberedCanvas)
    return buffer.getvalue()
