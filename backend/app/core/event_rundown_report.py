"""PDF/CSV export of the Run Down page (Story 14.11)."""
import csv
from datetime import date as date_type
from io import BytesIO, StringIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.dinner_forecast_report import INTL_LOGO_PATH
from app.core.pdf_style import PDF_BODY_FONT_SIZE, PDF_TABLE_HEADER_FONT_SIZE
from app.core.statistics_report import CLUB_NAME, LOGO_PATH, ROTARY_BLUE

PAGE_MARGIN = 0.6 * inch
HIGHLIGHT_BG = "#fff3b0"  # yellow, matching the example's highlighted rows


def build_csv_report(rows: list[dict]) -> str:
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=["Sort Order", "Time", "Activity", "Highlight"])
    writer.writeheader()
    for row in rows:
        writer.writerow(
            {
                "Sort Order": row["sort_order"],
                "Time": row["time"],
                "Activity": row["activity"],
                "Highlight": "Y" if row["highlight"] else "N",
            }
        )
    return buffer.getvalue()


def _cell_style(styles, *, bold: bool = False):
    style = styles["BodyText"].clone("cell")
    style.fontSize = PDF_TABLE_HEADER_FONT_SIZE if bold else PDF_BODY_FONT_SIZE
    style.leading = style.fontSize + 2.5
    style.fontName = "Helvetica-Bold" if bold else "Helvetica"
    return style


def build_pdf_report(event_name: str, event_date: date_type, rows: list[dict]) -> bytes:
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
    story = []

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
                ]
            )
        )
        story.append(logo_row)

    # "MAIN STREAM" title banner (matching the example) with the event name
    # and date as a subtitle, per the story's own wording ("Title: 'MAIN
    # STREAM' (or event name)").
    banner_style = styles["Title"].clone("rundown-banner")
    banner_style.alignment = 1
    banner_style.textColor = colors.white
    banner = Table([[Paragraph("MAIN STREAM", banner_style)]], colWidths=[usable_width])
    banner.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(ROTARY_BLUE)),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story.append(banner)
    story.append(Spacer(1, 0.1 * inch))
    story.append(
        Paragraph(f"{escape(event_name)} — {event_date.strftime('%d %b %Y')}", styles["Heading2"])
    )
    story.append(Spacer(1, 0.2 * inch))

    header_style = _cell_style(styles, bold=True)
    header_style.textColor = colors.white
    body_style = _cell_style(styles)

    table_rows = [[Paragraph(text, header_style) for text in ["Time", "Activity"]]]
    highlight_row_indices = []
    for row in rows:
        table_rows.append(
            [Paragraph(escape(row["time"]), body_style), Paragraph(escape(row["activity"]), body_style)]
        )
        if row["highlight"]:
            highlight_row_indices.append(len(table_rows) - 1)

    table = Table(table_rows, colWidths=[1.5 * inch, usable_width - 1.5 * inch], repeatRows=1)
    style_commands = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(ROTARY_BLUE)),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d0d5dd")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for row_index in highlight_row_indices:
        style_commands.append(("BACKGROUND", (0, row_index), (-1, row_index), colors.HexColor(HIGHLIGHT_BG)))
    table.setStyle(TableStyle(style_commands))
    story.append(table)

    doc.build(story)
    return buffer.getvalue()
