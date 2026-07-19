"""PDF reports for the Lucky Draw & Auction page (Story 14.7):
Programme List, Lucky Draw Results, and Auction Receipts.

Same two-logo header convention as event_guest_report.py — the example
source documents referenced in the story (the Gala 2026 programme/results/
receipt PDFs) aren't present in this repo, so layout below follows the
story's own written description rather than a pixel match to those files.
"""
from datetime import date as date_type
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.dinner_forecast_report import INTL_LOGO_PATH
from app.core.pdf_style import PDF_BODY_FONT_SIZE, PDF_TABLE_HEADER_FONT_SIZE
from app.core.statistics_report import CLUB_NAME, LOGO_PATH, ROTARY_BLUE

PAGE_MARGIN = 0.5 * inch


def _cell_style(styles, *, bold: bool = False, font_size: float | None = None):
    style = styles["BodyText"].clone("cell")
    style.fontSize = font_size or (PDF_TABLE_HEADER_FONT_SIZE if bold else PDF_BODY_FONT_SIZE)
    style.leading = style.fontSize + 2.5
    style.fontName = "Helvetica-Bold" if bold else "Helvetica"
    return style


def _logo_header(styles, usable_width: float) -> list:
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
    return story


def _items_table(items: list[dict], styles, *, extra_winner_column: bool = False) -> Table:
    header_style = _cell_style(styles, bold=True)
    header_style.textColor = colors.white
    body_style = _cell_style(styles)
    winner_style = _cell_style(styles, font_size=14)

    header = ["#", "Donated By", "Item"]
    widths = [0.7 * inch, 2.3 * inch, 4.0 * inch]
    if extra_winner_column:
        header.append("Winner #")
        widths.append(1.5 * inch)

    rows = [[Paragraph(text, header_style) for text in header]]
    for item in items:
        row = [
            Paragraph(escape(item["lot_ref"] or ""), body_style),
            Paragraph(escape(item["donor_sponsor"] or ""), body_style),
            Paragraph(escape(item["name"]), body_style),
        ]
        if extra_winner_column:
            row.append(Paragraph("&nbsp;", winner_style))
        rows.append(row)

    table = Table(rows, colWidths=widths, repeatRows=1)
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
    return table


def _title(event_name: str, event_date: date_type) -> str:
    return f"{event_date.strftime('%d %B %Y').upper()} - {CLUB_NAME.upper()} {event_name.upper()}"


def build_programme_pdf(event_name: str, event_date: date_type, items: list[dict]) -> bytes:
    auction_items = [i for i in items if i["item_type"] == "auction"]
    on_stage_items = [i for i in items if i["item_type"] == "lucky_draw_on_stage"]
    regular_items = [i for i in items if i["item_type"] == "lucky_draw"]

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
    story = _logo_header(styles, usable_width)

    title_style = styles["Title"].clone("programme-title")
    title_style.alignment = 1  # centre
    story.append(Paragraph(escape(_title(event_name, event_date)), title_style))
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("Auction Items", styles["Heading2"]))
    story.append(_items_table(auction_items, styles))
    story.append(Spacer(1, 0.25 * inch))

    story.append(Paragraph("Lucky Draw Top Prices (On Stage)", styles["Heading2"]))
    story.append(_items_table(on_stage_items, styles))

    if regular_items:
        story.append(PageBreak())
        story.extend(_logo_header(styles, usable_width))
        story.append(Paragraph("Lucky Draw", styles["Heading2"]))
        story.append(_items_table(regular_items, styles))

    doc.build(story)
    return buffer.getvalue()


def build_lucky_draw_results_pdf(event_name: str, event_date: date_type, items: list[dict]) -> bytes:
    regular_items = [i for i in items if i["item_type"] == "lucky_draw"]

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
    story = _logo_header(styles, usable_width)

    title_style = styles["Title"].clone("results-title")
    title_style.alignment = 1
    story.append(Paragraph(escape(_title(event_name, event_date)), title_style))
    story.append(Paragraph("Lucky Draw Result Sheet", styles["Heading2"]))
    story.append(Spacer(1, 0.2 * inch))
    story.append(_items_table(regular_items, styles, extra_winner_column=True))

    doc.build(story)
    return buffer.getvalue()


def build_auction_receipts_pdf(
    event_name: str,
    event_date: date_type,
    auction_items: list[dict],
    setup: dict,
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
    body_style = _cell_style(styles)

    deadline = setup.get("payment_deadline")
    deadline_text = deadline if deadline else "____________"
    bank_account = setup.get("bank_account") or "____________"
    fps_id = setup.get("fps_id") or "____________"

    story = []
    for index, item in enumerate(auction_items):
        if index > 0:
            story.append(PageBreak())

        header_row = Table(
            [
                [
                    Paragraph(f"<b>{escape(CLUB_NAME.upper())}</b>", body_style),
                    Image(str(LOGO_PATH), width=0.6 * inch, height=0.6 * inch)
                    if LOGO_PATH.exists()
                    else "",
                ]
            ],
            colWidths=[usable_width - 0.6 * inch, 0.6 * inch],
        )
        header_row.setStyle(
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
        story.append(header_row)
        story.append(Spacer(1, 0.2 * inch))

        title_style = styles["Title"].clone("receipt-title")
        title_style.alignment = 1
        story.append(Paragraph("Acknowledgement of auction bid", title_style))
        story.append(Spacer(1, 0.15 * inch))

        lot_ref_style = styles["Heading2"].clone("lot-ref")
        lot_ref_style.alignment = 2  # right
        story.append(Paragraph(escape(item["lot_ref"] or ""), lot_ref_style))

        description = f"{item['donor_sponsor'] or ''} — {item['name']}"
        story.append(Paragraph(escape(description), styles["Heading3"]))
        story.append(Spacer(1, 0.3 * inch))

        story.append(
            Paragraph(
                "I, ______________________________, acknowledge bid the amount of "
                f"______________ HKD for the auction lot: {escape(item['lot_ref'] or '')} - "
                f"{escape(item['name'])}.",
                body_style,
            )
        )
        story.append(Spacer(1, 0.2 * inch))
        story.append(
            Paragraph(
                f"I agree to pay the amount mentioned here before {escape(str(deadline_text))} "
                f"to the {escape(CLUB_NAME.upper())}.",
                body_style,
            )
        )
        story.append(Spacer(1, 0.3 * inch))
        story.append(Paragraph("Email: ______________________________", body_style))
        story.append(Paragraph("Tel: ______________________________", body_style))
        story.append(Paragraph("Table name: ______________________________", body_style))
        story.append(Spacer(1, 0.3 * inch))

        payment_box = Table(
            [
                [
                    Paragraph(
                        "<b>Payment instructions</b><br/>"
                        f"Cheque payable to: {escape(CLUB_NAME)}<br/>"
                        f"Bank account: {escape(bank_account)}<br/>"
                        f"FPS ID: {escape(fps_id)}",
                        body_style,
                    )
                ]
            ],
            colWidths=[usable_width],
        )
        payment_box.setStyle(
            TableStyle(
                [
                    ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor(ROTARY_BLUE)),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ]
            )
        )
        story.append(payment_box)

    doc.build(story)
    return buffer.getvalue()
