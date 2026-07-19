"""Shared PDF/CSV report builder for Operational Cost (Story 14.8) and
Sponsor (Story 14.9) pages — identical shape (name/category/quantity/
unit_price/total), grouped by category with subtotals and a grand total.
"""
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

NO_CATEGORY_LABEL = "Uncategorised"

PAGE_MARGIN = 0.5 * inch


def _group_by_category(rows: list[dict]) -> list[tuple[str, list[dict]]]:
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row["category"] or NO_CATEGORY_LABEL, []).append(row)
    return [(category, grouped[category]) for category in sorted(grouped)]


def build_csv_report(rows: list[dict], total_column_label: str) -> str:
    columns = ["Category", "Name", "Quantity", "Unit Price", total_column_label]
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns)
    writer.writeheader()
    for category, category_rows in _group_by_category(rows):
        for row in category_rows:
            writer.writerow(
                {
                    "Category": category,
                    "Name": row["name"],
                    "Quantity": row["quantity"],
                    "Unit Price": row["unit_price"],
                    total_column_label: row["total"],
                }
            )
    return buffer.getvalue()


def _cell_style(styles, *, bold: bool = False):
    style = styles["BodyText"].clone("cell")
    style.fontSize = PDF_TABLE_HEADER_FONT_SIZE if bold else PDF_BODY_FONT_SIZE
    style.leading = style.fontSize + 2.5
    style.fontName = "Helvetica-Bold" if bold else "Helvetica"
    return style


def build_pdf_report(
    report_title: str,
    event_name: str,
    event_date: date_type,
    rows: list[dict],
    total_column_label: str,
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
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        story.append(logo_row)

    story.append(Paragraph(CLUB_NAME, styles["Title"]))
    story.append(
        Paragraph(f"{escape(report_title)} — {escape(event_name)} ({event_date.strftime('%d %b %Y')})", styles["Heading2"])
    )
    story.append(Spacer(1, 0.2 * inch))

    header_style = _cell_style(styles, bold=True)
    header_style.textColor = colors.white
    body_style = _cell_style(styles)
    subtotal_style = _cell_style(styles, bold=True)

    grand_total = 0.0
    col_widths = [2.5 * inch, 1.0 * inch, 1.2 * inch, 1.5 * inch]
    for category, category_rows in _group_by_category(rows):
        story.append(Paragraph(escape(category), styles["Heading3"]))
        header = ["Name", "Quantity", "Unit Price", total_column_label]
        table_rows = [[Paragraph(text, header_style) for text in header]]
        category_total = 0.0
        for row in category_rows:
            table_rows.append(
                [
                    Paragraph(escape(row["name"]), body_style),
                    Paragraph(str(row["quantity"]), body_style),
                    Paragraph(f"{row['unit_price']:.2f}", body_style),
                    Paragraph(f"{row['total']:.2f}", body_style),
                ]
            )
            category_total += row["total"]
        table_rows.append(
            [
                Paragraph("Subtotal", subtotal_style),
                "",
                "",
                Paragraph(f"{category_total:.2f}", subtotal_style),
            ]
        )
        grand_total += category_total

        table = Table(table_rows, colWidths=col_widths, repeatRows=1)
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
                    ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f5f7fa")]),
                    ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#e5e9f0")),
                ]
            )
        )
        story.append(table)
        story.append(Spacer(1, 0.2 * inch))

    grand_total_style = styles["Heading2"].clone("grand-total")
    grand_total_style.alignment = 2  # right
    story.append(Paragraph(f"Grand Total: {grand_total:.2f}", grand_total_style))

    doc.build(story)
    return buffer.getvalue()
