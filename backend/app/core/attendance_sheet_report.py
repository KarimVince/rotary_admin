"""STORY 16.33 — Dinner/Event attendance & payment tracking PDF, downloadable
from the Attendance Sheet detail page for on-site use.

Confirmed with Karim before building: the attendee table is pre-populated
from the event's existing eligible roster (active + honorary members, same
as the live Attendance Sheet page — NOT the past-members list, which isn't
part of the "expected attendees" set there either), but the Attendance and
Payment columns are always left blank — payment status is deliberately NOT
pre-filled from existing fee/payment records even when available, since
this sheet is for manual on-site marking. Single layout for every event
type (no per-type variation)."""
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.dinner_forecast_report import INTL_LOGO_PATH
from app.core.pdf_style import PDF_BODY_FONT_SIZE, PDF_TABLE_HEADER_FONT_SIZE
from app.core.statistics_report import LOGO_PATH
from app.models import AttendanceEvent
from app.schemas.attendance import AttendanceRecordRead

PAGE_MARGIN = 0.5 * inch
TABLE_HEADER_BG = "#e3edfb"
GRID_COLOR = "#dde3ec"


def _scaled_logo(path, target_height: float):
    """Same aspect-ratio-preserving scale as dinner_forecast_report.py's
    `_logo_image` — duplicated rather than imported since that one is
    module-private there; both silently render nothing when the file (e.g.
    the international logo) doesn't exist yet."""
    if not path.exists():
        return ""
    reader = ImageReader(str(path))
    native_width, native_height = reader.getSize()
    width = target_height * (native_width / native_height)
    return Image(str(path), width=width, height=target_height)


def _roster_table(
    section_title: str, members: list[AttendanceRecordRead], header_style, empty_style
) -> list:
    story: list = [Paragraph(f"{section_title} ({len(members)})", header_style), Spacer(1, 6)]
    if not members:
        story.append(Paragraph("None", empty_style))
        return story

    rows = [["Name", "Attendance", "Payment"]]
    # Members already arrive sorted by last_name/first_name (the query
    # behind _build_sheet_response orders that way) — no re-sort needed.
    for member in members:
        rows.append([escape(f"{member.first_name} {member.last_name}"), "", ""])

    table = Table(rows, colWidths=[3.4 * inch, 1.6 * inch, 1.6 * inch], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), PDF_BODY_FONT_SIZE),
                ("FONTSIZE", (0, 0), (-1, 0), PDF_TABLE_HEADER_FONT_SIZE),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(TABLE_HEADER_BG)),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor(GRID_COLOR)),
                ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(table)
    return story


def build_attendance_sheet_pdf(
    event: AttendanceEvent,
    active: list[AttendanceRecordRead],
    honorary: list[AttendanceRecordRead],
) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        topMargin=PAGE_MARGIN,
        bottomMargin=PAGE_MARGIN,
        leftMargin=PAGE_MARGIN,
        rightMargin=PAGE_MARGIN,
    )
    styles = getSampleStyleSheet()
    usable_width = letter[0] - 2 * PAGE_MARGIN

    left_logo = _scaled_logo(LOGO_PATH, 0.55 * inch)
    right_logo = _scaled_logo(INTL_LOGO_PATH, 0.4 * inch)

    title_style = styles["BodyText"].clone("attendance-pdf-title")
    title_style.fontSize = 16
    title_style.fontName = "Helvetica-Bold"
    title_style.textColor = colors.HexColor("#0c2340")
    title_style.alignment = 1

    event_name_style = styles["BodyText"].clone("attendance-pdf-event-name")
    event_name_style.fontSize = 12
    event_name_style.fontName = "Helvetica-Bold"
    event_name_style.textColor = colors.HexColor("#17458f")
    event_name_style.alignment = 1
    event_name_style.spaceBefore = 2

    detail_style = styles["BodyText"].clone("attendance-pdf-detail")
    detail_style.fontSize = 10
    detail_style.textColor = colors.HexColor("#6b7686")
    detail_style.alignment = 1
    detail_style.spaceBefore = 2

    title_block = [
        Paragraph("Attendance &amp; Payment Tracking", title_style),
        Paragraph(escape(event.name), event_name_style),
        Paragraph(
            f"{event.event_date.strftime('%d %b %Y')} · {escape(event.location or '—')}",
            detail_style,
        ),
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

    section_header_style = styles["BodyText"].clone("attendance-pdf-section")
    section_header_style.fontSize = 12
    section_header_style.fontName = "Helvetica-Bold"
    section_header_style.textColor = colors.HexColor("#0c2340")

    empty_style = styles["BodyText"].clone("attendance-pdf-empty")
    empty_style.fontSize = PDF_BODY_FONT_SIZE
    empty_style.textColor = colors.HexColor("#9aa7ba")

    story: list = [header_row, Spacer(1, 0.25 * inch)]
    story += _roster_table("Active members", active, section_header_style, empty_style)
    story.append(Spacer(1, 0.25 * inch))
    story += _roster_table("Honorary members", honorary, section_header_style, empty_style)

    doc.build(story)
    return buffer.getvalue()
