"""Story 16.35 — NGO & Services Project Statistics report (PDF + PPTX).

Redesigned 2026-09-05 per a district-template design handoff (an HTML/asset
bundle the user supplied — "design_handoff_ngo_export"), which fully
replaces the older chart-heavy report this module used to build. Two PPTX
slide types — Summary (four year-figure cards) and paginated Organisations
(12 NGO cards/slide, area-of-focus colour bar + a key) — each in two chrome
variants (District 3450 template band, or a plain green band + club logo),
plus a matching Letter-portrait PDF with the same data as one flowing table.

**Deliberate scope note**: the handoff has no Simplified/Integral
distinction — one fixed design covers both. `report_type` is still accepted
by the API for backward compatibility but no longer changes this module's
output (see `app/api/donations.py`'s endpoint docstring/comment).

**Chrome no longer depends on an admin-uploaded PPT template file.** The
old `build_pptx_report(..., template_path=...)` mechanism (Story 8.23, an
uploaded .pptx used as the base `Presentation`) is NOT used here — the
handoff's "template" chrome is a fixed backing image
(`app/assets/ngo-report-district-band.png`, extracted from the district's
own template) drawn behind our own from-scratch slide, not a live upload.
That decoupling is what let this redesign sidestep whatever was going wrong
with the old uploaded-template code path.
"""

from datetime import date
from io import BytesIO
from pathlib import Path

from PIL import Image as PILImage
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.core.report_images import pptx_safe_image, resolve_stored_image_bytes
from app.core.statistics_report import CLUB_NAME
from app.schemas.donation_statistics import DonationStatistics

REPORT_TITLE = "NGO & Services Projects"
ASSETS_DIR = Path(__file__).resolve().parents[1] / "assets"
DISTRICT_BAND_IMAGE = ASSETS_DIR / "ngo-report-district-band.png"
CLUB_LOGO_LOCKUP_IMAGE = ASSETS_DIR / "club-logo-lockup.png"

# Design tokens, taken verbatim from the handoff's colour table.
COLOR_DISTRICT_GREEN = "#375E3A"
COLOR_ROTARY_BLUE = "#17458F"
COLOR_BAND_KICKER_GOLD = "#D9BE86"
COLOR_ROTARY_GOLD = "#F7A81B"
COLOR_INK = "#201E1D"
COLOR_BODY_GREY = "#5B5F5B"
COLOR_META_GREY = "#6B6F6B"
COLOR_CARD_BORDER = "#E4E3E0"
COLOR_STAT_CARD_FILL = "#FBFAF9"
COLOR_ORG_CARD_FILL = "#FFFFFF"

# Area-of-focus colours, mapped by exact NGO Classification name. Anything
# unmapped (including "Unclassified" — no classification set at all) falls
# back to district green. `AREA_ORDER` is the canonical sort/legend order
# ("sort by area of focus in the key's order").
AREA_COLORS: dict[str, str] = {
    "Education & Literacy": "#16803C",
    "Health & Medical": "#7E22CE",
    "Poverty Alleviation & Social Welfare": "#BE123C",
    "Youth Development": "#4338CA",
    "Humanitarian Relief & Disaster Response": "#A16207",
    "Others": "#1D4ED8",
}
AREA_ORDER: list[str] = [*AREA_COLORS.keys(), "Unclassified"]
ORGS_PER_SLIDE = 12
ORG_GRID_COLUMNS = 4


def _area_color(area: str) -> str:
    return AREA_COLORS.get(area, COLOR_DISTRICT_GREEN)


def _area_sort_key(area: str) -> tuple[int, str]:
    try:
        return (AREA_ORDER.index(area), "")
    except ValueError:
        # An area name outside the known table (shouldn't normally happen —
        # classifications are managed centrally) sorts after every known
        # one, alphabetically among themselves, rather than crashing.
        return (len(AREA_ORDER), area)


def _sorted_ngo_rows(ngo_rows: list[dict]) -> list[dict]:
    """"Sort by area of focus in the key's order, then by organisation
    name" — the handoff's own rule, so colour bars group across the grid."""
    return sorted(ngo_rows, key=lambda row: (_area_sort_key(row["area"]), row["name"]))


def _format_amount(value: float) -> str:
    return f"{value:,.0f}"


def _rotary_year_label(year: int) -> str:
    return f"{year}–{year + 1}"


def _paginate(rows: list[dict], page_size: int) -> list[list[dict]]:
    if not rows:
        return []
    return [rows[i : i + page_size] for i in range(0, len(rows), page_size)]


def _page_area_counts(page_rows: list[dict]) -> list[tuple[str, int]]:
    """Areas present on one page, with that page's own counts, in the
    canonical key order — "the key lists only the areas present on that
    page, with that page's counts.\""""
    counts: dict[str, int] = {}
    for row in page_rows:
        counts[row["area"]] = counts.get(row["area"], 0) + 1
    return sorted(counts.items(), key=lambda pair: _area_sort_key(pair[0]))


def _summary_cards(stats: DonationStatistics) -> list[dict]:
    """The four Summary-slide cards. "If a currency has no activity in the
    selected year, drop that card" / "Never render a zero card" — applied
    to the three money/reach cards that can legitimately be zero-and-absent
    (Donated HKD, Planned HKD, Donated USD); the Reach card always shows,
    since "0 organisations supported" is still meaningful information."""
    all_cards = [
        {
            "kicker": "Donated",
            "value": stats.selected_year.total_hkd,
            "figure": _format_amount(stats.selected_year.total_hkd),
            "unit": "HKD",
            "label": "Total donated to date",
            "droppable": True,
        },
        {
            "kicker": "Planned",
            "value": stats.selected_year_planned.total_hkd,
            "figure": _format_amount(stats.selected_year_planned.total_hkd),
            "unit": "HKD",
            "label": "Planned donations",
            "droppable": True,
        },
        {
            "kicker": "Donated",
            "value": stats.selected_year.total_usd,
            "figure": _format_amount(stats.selected_year.total_usd),
            "unit": "USD",
            "label": "Total donated to date",
            "droppable": True,
        },
        {
            "kicker": "Reach",
            "value": stats.selected_year_organisations_count,
            "figure": str(stats.selected_year_organisations_count),
            "unit": "",
            "label": "Organisations supported",
            "droppable": False,
        },
    ]
    return [card for card in all_cards if not (card["droppable"] and card["value"] == 0)]


def _footnote_text(stats: DonationStatistics, ngo_rows: list[dict], org_pages: list[list[dict]]) -> str:
    org_count = len(ngo_rows)
    area_count = len({row["area"] for row in ngo_rows})
    text = f"{org_count} organisation{'s' if org_count != 1 else ''} " \
        f"{'are' if org_count != 1 else 'is'} listed for the year across " \
        f"{area_count} area{'s' if area_count != 1 else ''} of focus."
    # The approved deck's own example always names the next slide once
    # there's at least one Organisations page — not only past 12 orgs (the
    # handoff's prose reads as a stricter >12 gate, but its own rendered
    # example contradicts that at just 5 orgs). Following the example: any
    # non-empty Organisations section gets named, pluralised by page count.
    if org_pages:
        pages = len(org_pages)
        text += f" Detail follows on the next {pages if pages > 1 else ''} slide{'s' if pages > 1 else ''}.".replace(
            "next  slide", "next slide"
        )
    return text


def resolve_logo_bytes(logo_url: str | None) -> BytesIO | None:
    """Story 16.6 — logo_url is now a full Supabase Storage public URL for
    any logo uploaded after the migration; fetch it directly. A
    pre-migration relative path is tried against local disk as a
    best-effort fallback. Thin wrapper over the shared
    `report_images.resolve_stored_image_bytes` (also used by the Board
    Members report for member photos) — kept as its own named function
    since existing callers/tests import it from here."""
    return resolve_stored_image_bytes(logo_url, "organisations")


# `_pptx_safe_image` — kept as a module-level alias (existing tests import
# it by this name) over the shared `report_images.pptx_safe_image`.
_pptx_safe_image = pptx_safe_image


# ---------------------------------------------------------------------------
# PDF — Letter portrait, per the handoff's "NGO Services Report PDF.html".
# No organisation logos here — the approved PDF table has no logo column
# (Organisation, Country, Area of focus, Contact, Amount only).
# ---------------------------------------------------------------------------

_pdf_kicker_style = ParagraphStyle(
    "NgoPdfKicker", fontName="Helvetica-Bold", fontSize=9, leading=11,
    textColor=colors.HexColor(COLOR_DISTRICT_GREEN),
)
_pdf_h1_style = ParagraphStyle(
    "NgoPdfH1", fontName="Helvetica-Bold", fontSize=34, leading=34,
    textColor=colors.HexColor(COLOR_ROTARY_BLUE),
)
_pdf_subtitle_style = ParagraphStyle(
    "NgoPdfSubtitle", fontName="Helvetica", fontSize=14, leading=17,
    textColor=colors.HexColor(COLOR_INK),
)
_pdf_section_style = ParagraphStyle(
    "NgoPdfSection", fontName="Helvetica-Bold", fontSize=11, leading=13,
    textColor=colors.HexColor(COLOR_DISTRICT_GREEN),
)
_pdf_figure_label_style = ParagraphStyle(
    "NgoPdfFigureLabel", fontName="Helvetica", fontSize=9.5, leading=12,
    textColor=colors.HexColor(COLOR_BODY_GREY),
)
_pdf_footnote_style = ParagraphStyle(
    "NgoPdfFootnote", fontName="Helvetica", fontSize=11, leading=16,
    textColor=colors.HexColor("#3A3D3A"),
)
_pdf_orgs_heading_style = ParagraphStyle(
    "NgoPdfOrgsHeading", fontName="Helvetica-Bold", fontSize=16, leading=19,
    textColor=colors.HexColor(COLOR_INK),
)
_pdf_table_header_style = ParagraphStyle(
    "NgoPdfTableHeader", fontName="Helvetica-Bold", fontSize=8.5, leading=10,
    textColor=colors.HexColor(COLOR_DISTRICT_GREEN),
)
_pdf_table_name_style = ParagraphStyle(
    "NgoPdfTableName", fontName="Helvetica-Bold", fontSize=10.5, leading=13,
    textColor=colors.HexColor(COLOR_INK),
)
_pdf_table_cell_style = ParagraphStyle(
    "NgoPdfTableCell", fontName="Helvetica", fontSize=10.5, leading=13,
    textColor=colors.HexColor("#4A4D4A"),
)
_pdf_table_amount_style = ParagraphStyle(
    "NgoPdfTableAmount", fontName="Helvetica-Bold", fontSize=10.5, leading=13,
    textColor=colors.HexColor(COLOR_ROTARY_BLUE), alignment=2,  # right
)
_pdf_table_footer_style = ParagraphStyle(
    "NgoPdfTableFooter", fontName="Helvetica", fontSize=9.5, leading=12,
    textColor=colors.HexColor(COLOR_META_GREY),
)
_pdf_table_footer_amount_style = ParagraphStyle(
    "NgoPdfTableFooterAmount", fontName="Helvetica-Bold", fontSize=9.5, leading=12,
    textColor=colors.HexColor(COLOR_INK), alignment=2,
)


def _pdf_header_footer(canvas_obj, doc, *, year_label: str, generated_date: str) -> None:
    """Repeating header/footer, drawn on every page — same
    canvasmaker-callback pattern as this app's other multi-page PDF reports
    (see e.g. `dinner_forecast_report.py`'s `_NumberedCanvas`), just via
    `onFirstPage`/`onLaterPages` since neither line here needs a page
    number (the handoff's footer is static text only)."""
    canvas_obj.saveState()
    page_width, page_height = letter
    left = doc.leftMargin
    right = page_width - doc.rightMargin

    header_y = page_height - doc.topMargin + 0.2 * inch
    canvas_obj.setStrokeColor(colors.HexColor(COLOR_DISTRICT_GREEN))
    canvas_obj.setLineWidth(1.5)
    canvas_obj.line(left, header_y, right, header_y)
    canvas_obj.setFont("Helvetica-Bold", 8)
    canvas_obj.setFillColor(colors.HexColor(COLOR_DISTRICT_GREEN))
    canvas_obj.drawString(left, header_y + 4, f"{CLUB_NAME} · District 3450")
    canvas_obj.setFont("Helvetica", 8)
    canvas_obj.setFillColor(colors.HexColor(COLOR_META_GREY))
    canvas_obj.drawRightString(right, header_y + 4, f"{REPORT_TITLE} · {year_label}")

    footer_y = doc.bottomMargin - 0.2 * inch
    canvas_obj.setStrokeColor(colors.HexColor("#D8D7D4"))
    canvas_obj.setLineWidth(0.75)
    canvas_obj.line(left, footer_y + 12, right, footer_y + 12)
    canvas_obj.setFont("Helvetica", 8)
    canvas_obj.setFillColor(colors.HexColor(COLOR_META_GREY))
    canvas_obj.drawString(left, footer_y, "Statistics report")
    canvas_obj.drawRightString(right, footer_y, f"Generated {generated_date}")
    canvas_obj.restoreState()


def build_pdf_report(
    stats: DonationStatistics,
    currency: str | None,
    ngo_rows: list[dict],
) -> bytes:
    year_label = _rotary_year_label(stats.selected_rotary_year)
    sorted_rows = _sorted_ngo_rows(ngo_rows)
    org_pages = _paginate(sorted_rows, ORGS_PER_SLIDE) if sorted_rows else []

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=0.7 * inch, bottomMargin=0.7 * inch,
        leftMargin=0.7 * inch, rightMargin=0.7 * inch,
    )
    story: list = []

    kicker_row = Table(
        [[
            "",
            Paragraph(REPORT_TITLE.upper(), _pdf_kicker_style),
        ]],
        colWidths=[0.35 * inch, 5 * inch],
    )
    kicker_row.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), colors.HexColor(COLOR_ROTARY_GOLD)),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("LINEBELOW", (0, 0), (0, 0), 3, colors.HexColor(COLOR_ROTARY_GOLD)),
            ]
        )
    )
    story.append(kicker_row)
    story.append(Spacer(1, 0.1 * inch))
    story.append(Paragraph("Giving on record", _pdf_h1_style))
    story.append(Paragraph(f"Rotary year {year_label} · {CLUB_NAME}", _pdf_subtitle_style))
    story.append(Spacer(1, 0.15 * inch))

    rule = Table([[""]], colWidths=[7.1 * inch], rowHeights=[2])
    rule.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(COLOR_INK))]))
    story.append(rule)

    story.append(Spacer(1, 0.15 * inch))
    story.append(Paragraph(f"Rotary year {year_label}".upper(), _pdf_section_style))
    story.append(Spacer(1, 0.05 * inch))

    figure_cards = _summary_cards(stats)
    figure_cells = []
    for card in figure_cards:
        unit_suffix = f" {card['unit']}" if card["unit"] else ""
        figure_cells.append(
            [
                Paragraph(
                    f"<font color='{COLOR_ROTARY_BLUE}'><b>{card['figure']}</b></font>"
                    f"<font color='{COLOR_DISTRICT_GREEN}' size='11'>{unit_suffix}</font>",
                    ParagraphStyle(
                        "NgoPdfFigure", fontName="Helvetica-Bold", fontSize=20, leading=22,
                    ),
                ),
                Paragraph(card["label"], _pdf_figure_label_style),
            ]
        )
    figure_table = Table(
        [[cell for cell in col] for col in zip(*figure_cells)] if figure_cells else [[]],
        colWidths=[7.1 * inch / max(len(figure_cells), 1)] * max(len(figure_cells), 1),
    )
    figure_table.setStyle(
        TableStyle(
            [
                ("LINEABOVE", (0, 0), (-1, 0), 2, colors.HexColor(COLOR_INK)),
                ("LINEAFTER", (0, 0), (-2, -1), 0.75, colors.HexColor("#DFDEDB")),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(figure_table)

    footnote_table = Table(
        [[
            "",
            Paragraph(_footnote_text(stats, sorted_rows, org_pages), _pdf_footnote_style),
        ]],
        colWidths=[0.15 * inch, 6.95 * inch],
    )
    footnote_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), colors.HexColor(COLOR_ROTARY_GOLD)),
                ("LINEABOVE", (0, 0), (-1, 0), 2, colors.HexColor(COLOR_INK)),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story.append(Spacer(1, 0.05 * inch))
    story.append(footnote_table)

    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph("NGOs supported by area", _pdf_orgs_heading_style))
    story.append(Spacer(1, 0.08 * inch))

    if not sorted_rows:
        story.append(Paragraph("No organisations funded (actual or planned) this year.", _pdf_figure_label_style))
    else:
        header_row = [
            Paragraph("Organisation", _pdf_table_header_style),
            Paragraph("Country", _pdf_table_header_style),
            Paragraph("Area of focus", _pdf_table_header_style),
            Paragraph("Contact", _pdf_table_header_style),
            Paragraph("Amount", _pdf_table_header_style),
        ]
        data_rows = [header_row]
        for row in sorted_rows:
            amount_text = f"{_format_amount(row['total'])} {currency}" if currency else _format_amount(row["total"])
            data_rows.append(
                [
                    Paragraph(row["name"], _pdf_table_name_style),
                    Paragraph(row["country"] or "—", _pdf_table_cell_style),
                    Paragraph(row["area"], _pdf_table_cell_style),
                    Paragraph(row["contact_name"] or "—", _pdf_table_cell_style),
                    Paragraph(amount_text, _pdf_table_amount_style),
                ]
            )
        org_count = len(sorted_rows)
        area_count = len({row["area"] for row in sorted_rows})
        total_actual = sum(row["total"] for row in sorted_rows)
        footer_summary = f"{org_count} organisation{'s' if org_count != 1 else ''} listed · " \
            f"{area_count} area{'s' if area_count != 1 else ''} of focus"
        footer_amount = f"{_format_amount(total_actual)} {currency}" if currency else _format_amount(total_actual)
        data_rows.append(
            [
                Paragraph(footer_summary, _pdf_table_footer_style),
                "", "", "",
                Paragraph(footer_amount, _pdf_table_footer_amount_style),
            ]
        )
        org_table = Table(
            data_rows,
            colWidths=[2.1 * inch, 1.0 * inch, 1.7 * inch, 1.3 * inch, 1.0 * inch],
            repeatRows=1,
        )
        org_table.setStyle(
            TableStyle(
                [
                    ("LINEABOVE", (0, 0), (-1, 0), 2, colors.HexColor(COLOR_INK)),
                    ("LINEBELOW", (0, 0), (-1, 0), 2, colors.HexColor(COLOR_INK)),
                    ("LINEBELOW", (0, 1), (-1, -2), 0.75, colors.HexColor("#DFDEDB")),
                    ("LINEABOVE", (0, -1), (-1, -1), 2, colors.HexColor(COLOR_INK)),
                    ("TOPPADDING", (0, 0), (-1, 0), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                    ("TOPPADDING", (0, 1), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 1), (-1, -1), 8),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        story.append(org_table)

    generated_date = date.today().strftime("%-d %B %Y") if hasattr(date, "strftime") else date.today().isoformat()

    def _draw(canvas_obj, doc_):
        _pdf_header_footer(canvas_obj, doc_, year_label=year_label, generated_date=generated_date)

    doc.build(story, onFirstPage=_draw, onLaterPages=_draw)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# PPTX — 13.333×7.5in (16:9), matching the handoff's 1920×1080 design canvas
# exactly (1920/1080 == 13.333/7.5), so every geometry value below converts
# with the handoff's own two formulas: inches = px/144, points = px/2.
# ---------------------------------------------------------------------------


def _px_len(value_px: float) -> int:
    return Inches(value_px / 144)


def _px_pt(value_px: float) -> float:
    return value_px / 2


def _rgb(hex_color: str) -> RGBColor:
    return RGBColor.from_string(hex_color.lstrip("#").upper())


def _draw_chrome(slide, chrome: str, year_label: str, kicker: str, title: str) -> None:
    """Backgrounds/kicker/title — "identical in both variants" except the
    background layer and the logo, per the handoff. `chrome` is "template"
    (District 3450 band asset) or "plain" (drawn green band + club logo)."""
    if chrome == "template" and DISTRICT_BAND_IMAGE.exists():
        slide.shapes.add_picture(
            str(DISTRICT_BAND_IMAGE), 0, 0, width=_px_len(1920), height=_px_len(1080)
        )
    else:
        band = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, _px_len(1920), _px_len(192))
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

    if kicker:
        kicker_box = slide.shapes.add_textbox(_px_len(96), _px_len(52), _px_len(1200), _px_len(40))
        kicker_tf = kicker_box.text_frame
        kicker_tf.text = kicker
        kicker_tf.paragraphs[0].font.size = Pt(_px_pt(24))
        kicker_tf.paragraphs[0].font.bold = True
        kicker_tf.paragraphs[0].font.color.rgb = _rgb(COLOR_BAND_KICKER_GOLD)

    title_box = slide.shapes.add_textbox(_px_len(96), _px_len(80), _px_len(1300), _px_len(90))
    title_tf = title_box.text_frame
    title_tf.word_wrap = True
    title_tf.text = title
    title_tf.paragraphs[0].font.size = Pt(_px_pt(46))
    title_tf.paragraphs[0].font.bold = True
    title_tf.paragraphs[0].font.color.rgb = _rgb("#FFFFFF")


def _add_summary_slide(prs: Presentation, blank_layout, stats: DonationStatistics, ngo_rows: list[dict], org_pages: list[list[dict]], chrome: str) -> None:
    slide = prs.slides.add_slide(blank_layout)
    year_label = _rotary_year_label(stats.selected_rotary_year)
    _draw_chrome(slide, chrome, year_label, REPORT_TITLE, f"Summary — Rotary year {year_label}")

    cards = _summary_cards(stats)
    columns = len(cards) or 1
    row_left, row_top, row_width, row_height = _px_len(96), _px_len(352), _px_len(1728), _px_len(392)
    gap = _px_len(28)
    card_width = int((row_width - gap * (columns - 1)) / columns) if columns > 1 else row_width

    for index, card in enumerate(cards):
        left = row_left + index * (card_width + gap)
        card_shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, row_top, card_width, row_height)
        card_shape.fill.solid()
        card_shape.fill.fore_color.rgb = _rgb(COLOR_STAT_CARD_FILL)
        card_shape.line.color.rgb = _rgb(COLOR_CARD_BORDER)
        card_shape.line.width = Pt(1.5)
        card_shape.shadow.inherit = False
        card_shape.text_frame.clear()

        top_bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, row_top, card_width, _px_len(8))
        top_bar.fill.solid()
        top_bar.fill.fore_color.rgb = _rgb(COLOR_DISTRICT_GREEN)
        top_bar.line.fill.background()
        top_bar.shadow.inherit = False
        top_bar.text_frame.clear()

        pad_x, pad_top = _px_len(28), _px_len(40)
        kicker_box = slide.shapes.add_textbox(left + pad_x, row_top + pad_top, card_width - 2 * pad_x, _px_len(40))
        kicker_tf = kicker_box.text_frame
        kicker_tf.text = card["kicker"]
        kicker_tf.paragraphs[0].font.size = Pt(_px_pt(24))
        kicker_tf.paragraphs[0].font.bold = True
        kicker_tf.paragraphs[0].font.color.rgb = _rgb(COLOR_DISTRICT_GREEN)

        figure_box = slide.shapes.add_textbox(
            left + pad_x, row_top + pad_top + _px_len(56), card_width - 2 * pad_x, _px_len(110)
        )
        figure_tf = figure_box.text_frame
        figure_tf.word_wrap = True
        figure_run_text = card["figure"]
        figure_tf.text = figure_run_text
        figure_tf.paragraphs[0].font.size = Pt(_px_pt(84))
        figure_tf.paragraphs[0].font.bold = True
        figure_tf.paragraphs[0].font.color.rgb = _rgb(COLOR_ROTARY_BLUE)
        if card["unit"]:
            unit_run = figure_tf.paragraphs[0].add_run()
            unit_run.text = f"  {card['unit']}"
            unit_run.font.size = Pt(_px_pt(32))
            unit_run.font.bold = True
            unit_run.font.color.rgb = _rgb(COLOR_DISTRICT_GREEN)

        label_box = slide.shapes.add_textbox(
            left + pad_x, row_top + row_height - _px_len(70), card_width - 2 * pad_x, _px_len(50)
        )
        label_tf = label_box.text_frame
        label_tf.word_wrap = True
        label_tf.text = card["label"]
        label_tf.paragraphs[0].font.size = Pt(_px_pt(26))
        label_tf.paragraphs[0].font.color.rgb = _rgb(COLOR_BODY_GREY)

    footnote_box = slide.shapes.add_textbox(_px_len(96), _px_len(944), _px_len(1728), _px_len(90))
    footnote_tf = footnote_box.text_frame
    footnote_tf.word_wrap = True
    footnote_tf.text = _footnote_text(stats, ngo_rows, org_pages)
    footnote_tf.paragraphs[0].font.size = Pt(_px_pt(27))
    footnote_tf.paragraphs[0].font.color.rgb = _rgb("#3A3D3A")


def _add_organisations_slide(
    prs: Presentation, blank_layout, stats: DonationStatistics, page_rows: list[dict],
    page_number: int, total_pages: int, chrome: str, currency: str | None,
) -> None:
    slide = prs.slides.add_slide(blank_layout)
    year_label = _rotary_year_label(stats.selected_rotary_year)
    title = "Organisations supported"
    if total_pages > 1:
        title += f" ({page_number} of {total_pages})"
    _draw_chrome(slide, chrome, year_label, f"Rotary year {year_label}", title)

    grid_left, grid_top = _px_len(96), _px_len(214)
    grid_width = _px_len(1728)
    gap = _px_len(20)
    card_height = _px_len(238.664)
    columns = ORG_GRID_COLUMNS
    card_width = int((grid_width - gap * (columns - 1)) / columns)

    for index, row in enumerate(page_rows):
        col, grid_row = index % columns, index // columns
        left = grid_left + col * (card_width + gap)
        top = grid_top + grid_row * (card_height + gap)
        _add_org_card(slide, row, left, top, card_width, card_height, currency)

    key_top = _px_len(1080) - _px_len(38) - _px_len(30)
    rule = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, _px_len(96), key_top, _px_len(1728), _px_len(2))
    rule.fill.solid()
    rule.fill.fore_color.rgb = _rgb(COLOR_INK)
    rule.line.fill.background()
    rule.shadow.inherit = False
    rule.text_frame.clear()

    key_box = slide.shapes.add_textbox(_px_len(96), key_top + _px_len(10), _px_len(1728), _px_len(30))
    key_tf = key_box.text_frame
    key_tf.word_wrap = True
    key_p = key_tf.paragraphs[0]
    key_p.font.size = Pt(_px_pt(24))
    lead_run = key_p.add_run()
    lead_run.text = "Country · Contact    "
    lead_run.font.size = Pt(_px_pt(24))
    lead_run.font.color.rgb = _rgb(COLOR_INK)
    for area, count in _page_area_counts(page_rows):
        area_run = key_p.add_run()
        area_run.text = f"■ {area} ({count:02d})    "
        area_run.font.size = Pt(_px_pt(24))
        area_run.font.color.rgb = _rgb(_area_color(area))


def _add_org_card(slide, row: dict, left, top, width, height, currency: str | None) -> None:
    card_shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    card_shape.fill.solid()
    card_shape.fill.fore_color.rgb = _rgb(COLOR_ORG_CARD_FILL)
    card_shape.line.color.rgb = _rgb(COLOR_CARD_BORDER)
    card_shape.line.width = Pt(1.5)
    card_shape.shadow.inherit = False
    card_shape.text_frame.clear()

    top_bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, _px_len(8))
    top_bar.fill.solid()
    top_bar.fill.fore_color.rgb = _rgb(_area_color(row["area"]))
    top_bar.line.fill.background()
    top_bar.shadow.inherit = False
    top_bar.text_frame.clear()

    pad_x = _px_len(18)
    # Follow-up: logo bigger again (44px -> 64px -> 90px) and the name box
    # now fills whatever space is actually left between the logo and the
    # amount (vertically centered in it) instead of a fixed-height box with
    # a gap above/below — so a bigger logo automatically leaves less dead
    # space rather than more. Same card shape/border/colours otherwise.
    logo_top = top + _px_len(14)
    logo_size = _px_len(90)
    logo_png = _pptx_safe_image(row["logo_bytes"]) if row.get("logo_bytes") else None
    if logo_png:
        slide.shapes.add_picture(
            logo_png, left + (width - logo_size) // 2, logo_top, width=logo_size, height=logo_size
        )

    amount_top = top + height - _px_len(66)
    name_top = logo_top + logo_size + _px_len(4)
    name_box = slide.shapes.add_textbox(
        left + pad_x, name_top, width - 2 * pad_x, amount_top - name_top - _px_len(4)
    )
    name_tf = name_box.text_frame
    name_tf.word_wrap = True
    name_tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    name_tf.text = row["name"]
    name_p = name_tf.paragraphs[0]
    name_p.alignment = PP_ALIGN.CENTER
    name_p.font.size = Pt(_px_pt(26))
    name_p.font.bold = True
    name_p.font.color.rgb = _rgb(COLOR_INK)

    amount_box = slide.shapes.add_textbox(left + pad_x, amount_top, width - 2 * pad_x, _px_len(34))
    amount_tf = amount_box.text_frame
    amount_p = amount_tf.paragraphs[0]
    amount_p.alignment = PP_ALIGN.CENTER
    amount_text = f"{_format_amount(row['total'])} {currency}" if currency else _format_amount(row["total"])
    amount_p.text = amount_text
    amount_p.font.size = Pt(_px_pt(28))
    amount_p.font.bold = True
    amount_p.font.color.rgb = _rgb(COLOR_ROTARY_BLUE)

    meta_parts = [part for part in (row.get("country"), row.get("contact_name")) if part]
    meta_box = slide.shapes.add_textbox(left + pad_x, amount_top + _px_len(30), width - 2 * pad_x, _px_len(30))
    meta_tf = meta_box.text_frame
    meta_p = meta_tf.paragraphs[0]
    meta_p.alignment = PP_ALIGN.CENTER
    meta_p.text = " · ".join(meta_parts)
    meta_p.font.size = Pt(_px_pt(24))
    meta_p.font.color.rgb = _rgb(COLOR_META_GREY)


# ---------------------------------------------------------------------------
# Year-over-year comparison PPTX.
#
# SINGLE-SLIDE mode (≤ _CMP_FULL_THRESHOLD orgs in both years):
#   One slide, year-A section top / year-B section bottom.
#   Layout (1920×1080px, band=192px, body=888px):
#     [top 12][A hdr 40][gap 6][A rows 140+14+140=294][between 16]
#     [B hdr 40][gap 6][B rows 294][stat-gap 10][stat strip 90]
#     [legend-gap 8][legend 36]
#     Total body = 12+40+6+294+16+40+6+294+10+90+8+36 = 852px ✓
#
# TWO-SLIDE mode (> _CMP_FULL_THRESHOLD orgs in either year):
#   Slide 1 = year A full slide, Slide 2 = year B full slide + stat strip.
#   Full-slide cards are 220px tall (3 rows × 4 cols = 12 orgs max).
# ---------------------------------------------------------------------------

_CMP_SIDE_MARGIN         = 96    # same as regular slides (px)
_CMP_GRID_W              = 1728  # same as regular slides (px)
_CMP_COLS                = 4     # columns per row
_CMP_COL_GAP             = 20    # gap between columns (px)
_CMP_CARD_W              = (_CMP_GRID_W - (_CMP_COLS - 1) * _CMP_COL_GAP) // _CMP_COLS  # 417px
_CMP_CARD_H              = 140   # compact card height for single-slide mode (px)
_CMP_ROW_GAP             = 14    # gap between card rows (px)
_CMP_ROWS_PER_SEC        = 2     # max card rows per year section in single-slide mode
_CMP_ORGS_PER_SEC        = _CMP_COLS * _CMP_ROWS_PER_SEC  # 8 max in single-slide mode

_CMP_TOP_PAD             = 12    # below band, above year-A label (px)
_CMP_SEC_LABEL_H         = 40    # section label strip height (px)
_CMP_INNER_GAP           = 6     # between label and first card row (px)
_CMP_BETWEEN             = 16    # between year-A cards and year-B label (px)
_CMP_STAT_W              = (_CMP_GRID_W - 2 * _CMP_COL_GAP) // 3  # 562px — 3 equal stat cards
_CMP_STAT_H              = 90    # stat strip card height (px)
_CMP_STAT_GAP            = 10    # between org grid and stat strip (px)
_CMP_LEGEND_GAP          = 8     # between stat strip and legend rule (px)
_CMP_LEGEND_H            = 36    # legend strip height (px)

# Full-slide (two-slide mode) geometry
_FY_TOP_PAD              = 10    # below band, above section label (px)
_FY_SEC_H                = 40    # section label height (px)
_FY_INNER_GAP            = 6     # between label and first card row (px)
_FY_CARD_H               = 220   # card height for full-slide mode (px)
_FY_ROW_GAP              = 14    # gap between card rows (px)
_FY_ROWS_MAX             = 3     # max rows (12 orgs) on a full slide
_FY_ORGS_MAX             = _CMP_COLS * _FY_ROWS_MAX  # 12
_FY_STAT_GAP             = 8     # between org grid and stat strip on full slide (px)
_FY_LEGEND_GAP           = 8     # between stat strip / org grid and legend (px)
_FY_LEGEND_H             = 30    # legend height on full slide (px)

_CMP_FULL_THRESHOLD      = 10    # orgs-per-year above which 2 slides are used


def _total_from_rows(rows: list[dict]) -> float:
    return sum(row["total"] for row in rows)


# ---- Shared helpers used by both comparison slide modes --------------------

def _draw_cmp_section_label(
    slide, y: int, year: int, rows: list[dict], total: float, currency: str | None,
) -> None:
    """Section header: accent bar · label · rule · total chip."""
    year_label = _rotary_year_label(year)
    org_count = len(rows)
    label_text = (
        f"Rotary year {year_label}   ·   "
        f"{org_count} organisation{'s' if org_count != 1 else ''}"
    )

    accent = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        _px_len(_CMP_SIDE_MARGIN), _px_len(y),
        _px_len(6), _px_len(_CMP_SEC_LABEL_H),
    )
    accent.fill.solid()
    accent.fill.fore_color.rgb = _rgb(COLOR_DISTRICT_GREEN)
    accent.line.fill.background()
    accent.shadow.inherit = False
    accent.text_frame.clear()

    lbl = slide.shapes.add_textbox(
        _px_len(_CMP_SIDE_MARGIN + 16), _px_len(y),
        _px_len(900), _px_len(_CMP_SEC_LABEL_H),
    )
    lbl.text_frame.word_wrap = False
    lbl_p = lbl.text_frame.paragraphs[0]
    lbl_p.font.size = Pt(_px_pt(26))
    lbl_p.font.color.rgb = _rgb(COLOR_BODY_GREY)
    lbl_p.text = label_text

    chip_w = 220
    rule_x = _CMP_SIDE_MARGIN + 16 + 840
    rule_w = _CMP_GRID_W - 16 - 840 - chip_w - 20
    rule_shape = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        _px_len(rule_x), _px_len(y + _CMP_SEC_LABEL_H // 2),
        _px_len(rule_w), _px_len(2),
    )
    rule_shape.fill.solid()
    rule_shape.fill.fore_color.rgb = _rgb("#D4D3D0")
    rule_shape.line.fill.background()
    rule_shape.shadow.inherit = False
    rule_shape.text_frame.clear()

    if total > 0 and currency:
        chip_x = _CMP_SIDE_MARGIN + _CMP_GRID_W - chip_w
        chip_y = y + (_CMP_SEC_LABEL_H - 28) // 2
        chip = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE,
            _px_len(chip_x), _px_len(chip_y),
            _px_len(chip_w), _px_len(28),
        )
        chip.fill.solid()
        chip.fill.fore_color.rgb = _rgb("#FFD600")
        chip.line.fill.background()
        chip.shadow.inherit = False
        chip.adjustments[0] = 0.5
        chip_p = chip.text_frame.paragraphs[0]
        chip_p.alignment = PP_ALIGN.CENTER
        chip_r = chip_p.add_run()
        chip_r.text = f"{_format_amount(total)} {currency}"
        chip_r.font.size = Pt(_px_pt(22))
        chip_r.font.bold = True
        chip_r.font.color.rgb = _rgb(COLOR_ROTARY_BLUE)


def _draw_stat_strip(
    slide,
    y: int,
    total_donated: float,
    total_planned: float,
    org_count: int,
    currency: str | None,
    card_h: int = _CMP_STAT_H,
) -> None:
    """Three summary stat cards spanning the full grid width (year B figures)."""
    stat_cards = [
        {
            "kicker": "DONATED",
            "figure": _format_amount(total_donated),
            "unit": currency or "",
            "label": "Total donated — to date",
        },
        {
            "kicker": "PLANNED",
            "figure": _format_amount(total_planned),
            "unit": currency or "",
            "label": "Planned donations — to date",
        },
        {
            "kicker": "REACH",
            "figure": str(org_count),
            "unit": "",
            "label": "Organisations supported",
        },
    ]
    card_w = _CMP_STAT_W
    for i, card in enumerate(stat_cards):
        left = _px_len(_CMP_SIDE_MARGIN + i * (card_w + _CMP_COL_GAP))
        top = _px_len(y)
        w = _px_len(card_w)
        h = _px_len(card_h)

        cshape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, w, h)
        cshape.fill.solid()
        cshape.fill.fore_color.rgb = _rgb(COLOR_STAT_CARD_FILL)
        cshape.line.color.rgb = _rgb(COLOR_CARD_BORDER)
        cshape.line.width = Pt(1.5)
        cshape.shadow.inherit = False
        cshape.text_frame.clear()

        bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, w, _px_len(6))
        bar.fill.solid()
        bar.fill.fore_color.rgb = _rgb(COLOR_DISTRICT_GREEN)
        bar.line.fill.background()
        bar.shadow.inherit = False
        bar.text_frame.clear()

        pad_x = _px_len(18)

        kicker_box = slide.shapes.add_textbox(left + pad_x, top + _px_len(12), w - 2 * pad_x, _px_len(20))
        kicker_p = kicker_box.text_frame.paragraphs[0]
        kicker_p.text = card["kicker"]
        kicker_p.font.size = Pt(_px_pt(20))
        kicker_p.font.bold = True
        kicker_p.font.color.rgb = _rgb(COLOR_DISTRICT_GREEN)

        fig_box = slide.shapes.add_textbox(left + pad_x, top + _px_len(32), w - 2 * pad_x, _px_len(36))
        fig_tf = fig_box.text_frame
        fig_p = fig_tf.paragraphs[0]
        fig_r = fig_p.add_run()
        fig_r.text = card["figure"]
        fig_r.font.size = Pt(_px_pt(34))
        fig_r.font.bold = True
        fig_r.font.color.rgb = _rgb(COLOR_ROTARY_BLUE)
        if card["unit"]:
            unit_r = fig_p.add_run()
            unit_r.text = f"  {card['unit']}"
            unit_r.font.size = Pt(_px_pt(20))
            unit_r.font.bold = True
            unit_r.font.color.rgb = _rgb(COLOR_DISTRICT_GREEN)

        lbl_box = slide.shapes.add_textbox(left + pad_x, top + _px_len(68), w - 2 * pad_x, _px_len(18))
        lbl_p = lbl_box.text_frame.paragraphs[0]
        lbl_p.text = card["label"]
        lbl_p.font.size = Pt(_px_pt(18))
        lbl_p.font.color.rgb = _rgb(COLOR_BODY_GREY)


def _draw_cmp_legend(slide, y: int, rows: list[dict]) -> None:
    """Area-of-focus legend — coloured squares only, no 'Country · Contact' prefix."""
    rule = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        _px_len(_CMP_SIDE_MARGIN), _px_len(y),
        _px_len(_CMP_GRID_W), _px_len(2),
    )
    rule.fill.solid()
    rule.fill.fore_color.rgb = _rgb(COLOR_INK)
    rule.line.fill.background()
    rule.shadow.inherit = False
    rule.text_frame.clear()

    key_box = slide.shapes.add_textbox(
        _px_len(_CMP_SIDE_MARGIN), _px_len(y + 8),
        _px_len(_CMP_GRID_W), _px_len(28),
    )
    key_tf = key_box.text_frame
    key_tf.word_wrap = True
    key_p = key_tf.paragraphs[0]
    for area, _ in _page_area_counts(rows):
        area_run = key_p.add_run()
        area_run.text = f"■ {area}    "
        area_run.font.size = Pt(_px_pt(22))
        area_run.font.color.rgb = _rgb(_area_color(area))




def _add_cmp_org_card_compact(slide, row: dict, left, top, currency: str | None) -> None:
    """Compact org card for single-slide mode (_CMP_CARD_H = 140px, _CMP_CARD_W = 417px)."""
    w, h = _px_len(_CMP_CARD_W), _px_len(_CMP_CARD_H)

    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, w, h)
    card.fill.solid()
    card.fill.fore_color.rgb = _rgb(COLOR_ORG_CARD_FILL)
    card.line.color.rgb = _rgb(COLOR_CARD_BORDER)
    card.line.width = Pt(1.5)
    card.shadow.inherit = False
    card.text_frame.clear()

    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, w, _px_len(6))
    bar.fill.solid()
    bar.fill.fore_color.rgb = _rgb(_area_color(row["area"]))
    bar.line.fill.background()
    bar.shadow.inherit = False
    bar.text_frame.clear()

    pad_x = _px_len(12)
    logo_size = 34

    logo_png = _pptx_safe_image(row["logo_bytes"]) if row.get("logo_bytes") else None
    if logo_png:
        logo_top = top + _px_len(10)
        slide.shapes.add_picture(
            logo_png,
            left + (w - _px_len(logo_size)) // 2, logo_top,
            width=_px_len(logo_size), height=_px_len(logo_size),
        )
        name_top = logo_top + _px_len(logo_size + 4)
    else:
        name_top = top + _px_len(16)

    amount_top = top + _px_len(_CMP_CARD_H - 52)

    name_box = slide.shapes.add_textbox(left + pad_x, name_top, w - 2 * pad_x, amount_top - name_top - _px_len(2))
    name_tf = name_box.text_frame
    name_tf.word_wrap = True
    name_tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    name_p = name_tf.paragraphs[0]
    name_p.alignment = PP_ALIGN.CENTER
    name_p.text = row["name"]
    name_p.font.size = Pt(_px_pt(22))
    name_p.font.bold = True
    name_p.font.color.rgb = _rgb(COLOR_INK)

    amount_box = slide.shapes.add_textbox(left + pad_x, amount_top, w - 2 * pad_x, _px_len(26))
    amount_p = amount_box.text_frame.paragraphs[0]
    amount_p.alignment = PP_ALIGN.CENTER
    amount_p.text = f"{_format_amount(row['total'])} {currency}" if currency else _format_amount(row["total"])
    amount_p.font.size = Pt(_px_pt(22))
    amount_p.font.bold = True
    amount_p.font.color.rgb = _rgb(COLOR_ROTARY_BLUE)

    meta_parts = [p for p in (row.get("country"), row.get("contact_name")) if p]
    meta_box = slide.shapes.add_textbox(left + pad_x, amount_top + _px_len(24), w - 2 * pad_x, _px_len(20))
    meta_p = meta_box.text_frame.paragraphs[0]
    meta_p.alignment = PP_ALIGN.CENTER
    meta_p.text = " · ".join(meta_parts)
    meta_p.font.size = Pt(_px_pt(20))
    meta_p.font.color.rgb = _rgb(COLOR_META_GREY)


def _add_cmp_stat_card(
    slide,
    label: str,
    amount: float,
    currency: str | None,
    left,
    top,
    card_w_px: int = _CMP_CARD_W,
    card_h_px: int = _CMP_CARD_H,
) -> None:
    """Stat summary card (Donated / Planned) styled identically to a compact org card."""
    w, h = _px_len(card_w_px), _px_len(card_h_px)

    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, w, h)
    card.fill.solid()
    card.fill.fore_color.rgb = _rgb(COLOR_ROTARY_BLUE)
    card.line.fill.background()
    card.shadow.inherit = False
    card.text_frame.clear()

    pad_x = _px_len(12)
    name_top = top + _px_len(16)
    amount_top = top + _px_len(card_h_px - 52)

    name_box = slide.shapes.add_textbox(
        left + pad_x, name_top, w - 2 * pad_x, amount_top - name_top - _px_len(2)
    )
    name_tf = name_box.text_frame
    name_tf.word_wrap = True
    name_tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    name_p = name_tf.paragraphs[0]
    name_p.alignment = PP_ALIGN.CENTER
    name_p.text = label
    name_p.font.size = Pt(_px_pt(22))
    name_p.font.bold = True
    name_p.font.color.rgb = _rgb("#FFFFFF")

    amount_box = slide.shapes.add_textbox(left + pad_x, amount_top, w - 2 * pad_x, _px_len(26))
    amount_p = amount_box.text_frame.paragraphs[0]
    amount_p.alignment = PP_ALIGN.CENTER
    amount_p.text = f"{_format_amount(amount)} {currency}" if currency else _format_amount(amount)
    amount_p.font.size = Pt(_px_pt(22))
    amount_p.font.bold = True
    amount_p.font.color.rgb = _rgb("#FFFFFF")


def _draw_cmp_org_grid(slide, rows: list[dict], grid_top: int, currency: str | None, max_orgs: int = _CMP_ORGS_PER_SEC) -> None:
    """Compact org grid (single-slide mode)."""
    for index, row in enumerate(rows[:max_orgs]):
        col = index % _CMP_COLS
        grid_row = index // _CMP_COLS
        left = _px_len(_CMP_SIDE_MARGIN + col * (_CMP_CARD_W + _CMP_COL_GAP))
        top = _px_len(grid_top + grid_row * (_CMP_CARD_H + _CMP_ROW_GAP))
        _add_cmp_org_card_compact(slide, row, left, top, currency)


def _cmp_grid_height(n_rows: int, card_h: int = _CMP_CARD_H, row_gap: int = _CMP_ROW_GAP) -> int:
    """Total height in px of an org grid with n_rows rows."""
    return n_rows * card_h + max(n_rows - 1, 0) * row_gap


def _add_single_comparison_slide(
    prs,
    blank_layout,
    year_a: int,
    rows_a: list[dict],
    year_b: int,
    rows_b: list[dict],
    chrome: str,
    currency: str | None,
    stat_b: dict | None,
) -> None:
    """One combined slide: year A top half, year B bottom half.
    Donated and Planned summary cards appear as the last two slots in year B's
    grid — no separate stat strip row.
    """
    slide = prs.slides.add_slide(blank_layout)
    _draw_chrome(slide, chrome, "", "", "NGO & Service Projects Supported")

    # ---- Year A ----
    sec_a_y = 192 + _CMP_TOP_PAD
    _draw_cmp_section_label(slide, sec_a_y, year_a, rows_a, _total_from_rows(rows_a), currency)
    cards_a_top = sec_a_y + _CMP_SEC_LABEL_H + _CMP_INNER_GAP
    _draw_cmp_org_grid(slide, rows_a, cards_a_top, currency)
    n_rows_a = max((min(len(rows_a), _CMP_ORGS_PER_SEC) + _CMP_COLS - 1) // _CMP_COLS, 1)
    cards_a_bottom = cards_a_top + _cmp_grid_height(n_rows_a)

    # ---- Year B ----
    sec_b_y = cards_a_bottom + _CMP_BETWEEN
    _draw_cmp_section_label(slide, sec_b_y, year_b, rows_b, _total_from_rows(rows_b), currency)
    cards_b_top = sec_b_y + _CMP_SEC_LABEL_H + _CMP_INNER_GAP
    _draw_cmp_org_grid(slide, rows_b, cards_b_top, currency)

    # ---- Donated / Planned cards inline in year B grid ----
    n_orgs_b = min(len(rows_b), _CMP_ORGS_PER_SEC)
    if stat_b and currency:
        for i_stat, (lbl, amt) in enumerate([
            ("Donated", stat_b["total"]),
            ("Planned", stat_b["planned"]),
        ]):
            idx = n_orgs_b + i_stat
            col = idx % _CMP_COLS
            grid_row = idx // _CMP_COLS
            left = _px_len(_CMP_SIDE_MARGIN + col * (_CMP_CARD_W + _CMP_COL_GAP))
            top = _px_len(cards_b_top + grid_row * (_CMP_CARD_H + _CMP_ROW_GAP))
            _add_cmp_stat_card(slide, lbl, amt, currency, left, top)
        n_items_b = n_orgs_b + 2
    else:
        n_items_b = max(n_orgs_b, 1)

    n_rows_b = (n_items_b + _CMP_COLS - 1) // _CMP_COLS
    cards_b_bottom = cards_b_top + _cmp_grid_height(n_rows_b)

    # ---- Legend (categories only) ----
    _draw_cmp_legend(slide, cards_b_bottom + _CMP_LEGEND_GAP, rows_a + rows_b)


def _add_full_year_slide(
    prs,
    blank_layout,
    year: int,
    rows: list[dict],
    chrome: str,
    currency: str | None,
    stat_figures: dict | None = None,
) -> None:
    """Full-height single-year slide for two-slide comparison mode.

    Uses the regular _add_org_card() (220px tall) with up to 3 rows (12 orgs).
    stat_figures: {"total", "planned", "orgs"} → draws stat strip above legend
    (only passed for year B).
    """
    slide = prs.slides.add_slide(blank_layout)
    _draw_chrome(slide, chrome, "", "", "NGO & Service Projects Supported")

    sec_y = 192 + _FY_TOP_PAD
    _draw_cmp_section_label(slide, sec_y, year, rows, _total_from_rows(rows), currency)

    grid_top = sec_y + _FY_SEC_H + _FY_INNER_GAP
    page_rows = rows[:_FY_ORGS_MAX]
    for index, row in enumerate(page_rows):
        col = index % _CMP_COLS
        grid_row = index // _CMP_COLS
        left = _px_len(_CMP_SIDE_MARGIN + col * (_CMP_CARD_W + _CMP_COL_GAP))
        top = _px_len(grid_top + grid_row * (_FY_CARD_H + _FY_ROW_GAP))
        _add_org_card(slide, row, left, top, _px_len(_CMP_CARD_W), _px_len(_FY_CARD_H), currency)

    n_orgs = min(len(rows), _FY_ORGS_MAX)

    # ---- Donated / Planned cards inline in the same grid (year B only) ----
    if stat_figures and currency:
        for i_stat, (lbl, amt) in enumerate([
            ("Donated", stat_figures["total"]),
            ("Planned", stat_figures["planned"]),
        ]):
            idx = n_orgs + i_stat
            col = idx % _CMP_COLS
            grid_row = idx // _CMP_COLS
            left = _px_len(_CMP_SIDE_MARGIN + col * (_CMP_CARD_W + _CMP_COL_GAP))
            top = _px_len(grid_top + grid_row * (_FY_CARD_H + _FY_ROW_GAP))
            _add_cmp_stat_card(slide, lbl, amt, currency, left, top, card_h_px=_FY_CARD_H)
        n_items = n_orgs + 2
    else:
        n_items = max(n_orgs, 1)

    n_rows = (n_items + _CMP_COLS - 1) // _CMP_COLS
    grid_bottom = grid_top + n_rows * _FY_CARD_H + max(n_rows - 1, 0) * _FY_ROW_GAP

    _draw_cmp_legend(slide, grid_bottom + _FY_LEGEND_GAP, rows)


def build_pptx_comparison_report(
    year_a: int,
    rows_a: list[dict],
    year_b: int,
    rows_b: list[dict],
    currency: str | None,
    *,
    stat_b: dict | None = None,
    chrome: str = "plain",
) -> bytes:
    """Year-over-year comparison PPTX.

    Single-slide mode: both years stacked on one slide (≤ _CMP_FULL_THRESHOLD
    orgs in each year). stat_b = {"total", "planned", "orgs"} for year B
    summary cards.

    Two-slide mode (> threshold): slide 1 = year A, slide 2 = year B + stats.
    """
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    if max(len(rows_a), len(rows_b)) > _CMP_FULL_THRESHOLD:
        _add_full_year_slide(prs, blank_layout, year_a, rows_a, chrome, currency, stat_figures=None)
        _add_full_year_slide(prs, blank_layout, year_b, rows_b, chrome, currency, stat_figures=stat_b)
    else:
        _add_single_comparison_slide(prs, blank_layout, year_a, rows_a, year_b, rows_b, chrome, currency, stat_b)

    buf = BytesIO()
    prs.save(buf)
    return buf.getvalue()


def build_pptx_report(
    stats: DonationStatistics,
    currency: str | None,
    ngo_rows: list[dict],
    chrome: str = "plain",
) -> bytes:
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    sorted_rows = _sorted_ngo_rows(ngo_rows)
    org_pages = _paginate(sorted_rows, ORGS_PER_SLIDE) if sorted_rows else []

    _add_summary_slide(prs, blank_layout, stats, sorted_rows, org_pages, chrome)
    for page_number, page_rows in enumerate(org_pages, start=1):
        _add_organisations_slide(
            prs, blank_layout, stats, page_rows, page_number, len(org_pages), chrome, currency
        )

    buf = BytesIO()
    prs.save(buf)
    return buf.getvalue()
