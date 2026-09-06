"""Board Members report (PDF + PPTX).

PPTX design (updated 2026-09-06 to match the horizontal-card reference):
  • Horizontal cards — circular photo (or initials avatar) on the left,
    member name (bold) + role(s) on the right.
  • 3 cards per row.  President is always first (guaranteed by
    BoardPosition.display_order ordering in the query).
  • Same person holding multiple positions → ONE card with roles joined
    by " · " (e.g. "President Elect · Secretary").
  • No coloured top-bar per card.  White fill, light-grey rounded border.
  • Chrome variants unchanged (District 3450 template band / plain green
    band + club logo).

PDF (unchanged) uses a simple table layout — same header/footer/title-block
pattern as the NGO report.

**Deliberate scope note**: unlike the NGO report, there is no Summary slide
here — there's no natural "four headline figures" equivalent for a board
roster (no donation totals to show), so this report is just the one
paginated card-grid view, in both formats.
"""

from datetime import date
from io import BytesIO

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Pt
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from PIL import Image as PILImage
from pptx.oxml.ns import qn

import math

from app.core.donation_statistics_report import (
    CLUB_LOGO_LOCKUP_IMAGE,
    COLOR_BAND_KICKER_GOLD,
    COLOR_BODY_GREY,
    COLOR_CARD_BORDER,
    COLOR_DISTRICT_GREEN,
    COLOR_INK,
    COLOR_META_GREY,
    COLOR_ORG_CARD_FILL,
    COLOR_ROTARY_BLUE,
    COLOR_ROTARY_GOLD,
    DISTRICT_BAND_IMAGE,
    _paginate,
    _px_len,
    _px_pt,
    _rgb,
    _rotary_year_label,
)
from app.core.report_images import pptx_safe_image, resolve_stored_image_bytes
from app.core.statistics_report import CLUB_NAME

REPORT_TITLE = "Board & Committee Members"
# Distinguishes a board seat from a non-board (committee) one — used in the
# PDF table and the PPTX legend.
BOARD_COLOR = COLOR_ROTARY_BLUE
NON_BOARD_COLOR = COLOR_DISTRICT_GREEN

# PPTX horizontal-card grid constants.
_BOARD_COLUMNS = 3
_BOARD_CARDS_PER_SLIDE = 15   # pagination ceiling

# Layout constants (design-canvas px — converted to EMU via _px_len).
_SLIDE_H_PX = 1080
_BAND_BOTTOM_PX = 192   # chrome header ends here
_BOT_MARGIN_PX = 20     # breathing room below last card row
_GRID_TOP_NORMAL_PX = 240   # comfortable gap below the band
_GRID_TOP_MIN_PX = 215      # president almost touching the band (large rosters)
_CARD_H_DEFAULT_PX = 168    # baseline card height (also used for text-offset ratios)
_GAP_DEFAULT_PX = 20
_GAP_MIN_PX = 12


def _grid_params(num_cards: int) -> tuple[int, int, int]:
    """Return ``(grid_top_px, card_height_px, gap_px)`` for a slide with
    *num_cards* cards.

    Algorithm:
    1. Try the normal grid_top with default card size/gap — fits most rosters.
    2. Push grid_top up so the president card nearly touches the band.
    3. If still tight, reduce the gap (in steps of 2 px).
    4. Last resort: shrink card height proportionally to fill the available space.
    """
    if num_cards <= 0:
        return _GRID_TOP_NORMAL_PX, _CARD_H_DEFAULT_PX, _GAP_DEFAULT_PX

    total_rows = 1 + math.ceil((num_cards - 1) / _BOARD_COLUMNS)

    def content_h(card_h: int, gap: int) -> int:
        return total_rows * card_h + (total_rows - 1) * gap

    # 1. Fits with normal defaults?
    if _GRID_TOP_NORMAL_PX + content_h(_CARD_H_DEFAULT_PX, _GAP_DEFAULT_PX) + _BOT_MARGIN_PX <= _SLIDE_H_PX:
        return _GRID_TOP_NORMAL_PX, _CARD_H_DEFAULT_PX, _GAP_DEFAULT_PX

    avail = _SLIDE_H_PX - _GRID_TOP_MIN_PX - _BOT_MARGIN_PX

    # 2. Fits at minimum grid_top with default card/gap?
    if content_h(_CARD_H_DEFAULT_PX, _GAP_DEFAULT_PX) <= avail:
        return _GRID_TOP_MIN_PX, _CARD_H_DEFAULT_PX, _GAP_DEFAULT_PX

    # 3. Reduce gap in steps of 2 until it fits.
    for gap in range(_GAP_DEFAULT_PX - 2, _GAP_MIN_PX - 1, -2):
        if content_h(_CARD_H_DEFAULT_PX, gap) <= avail:
            return _GRID_TOP_MIN_PX, _CARD_H_DEFAULT_PX, gap

    # 4. Scale card height down to fill the available space.
    card_h = (avail - _GAP_MIN_PX * (total_rows - 1)) // total_rows
    return _GRID_TOP_MIN_PX, max(card_h, 100), _GAP_MIN_PX

# Avatar colour palette — cycles when a member has no photo.  Chosen to be
# readable white-on-colour for the initials text.
_AVATAR_COLORS = [
    "#5B7DB1",  # blue
    "#4FAF8A",  # green
    "#8E72AD",  # purple
    "#C0714F",  # terracotta
    "#3A8BA8",  # teal
]


def resolve_member_photo_bytes(photo_url: str | None) -> BytesIO | None:
    return resolve_stored_image_bytes(photo_url, "members")


def _category_color(at_the_board: bool) -> str:
    return BOARD_COLOR if at_the_board else NON_BOARD_COLOR


def _category_label(at_the_board: bool) -> str:
    return "Board" if at_the_board else "Non-Board"


def _sorted_board_rows(rows: list[dict]) -> list[dict]:
    """Board seats first (preserving display_order within each group), then
    non-board — stable sort so the President ends up at position 0."""
    return sorted(rows, key=lambda row: not row["at_the_board"])


def _group_by_member(rows: list[dict]) -> list[dict]:
    """Collapse multiple rows for the same person into one card.

    The first occurrence of a member (in sorted order) determines their
    position in the result.  Subsequent roles are appended to a combined
    ``roles`` string separated by " · ".  An ``avatar_color`` is assigned
    per card by cycling through the palette.
    """
    seen: dict[str, int] = {}  # member name → index in result
    result: list[dict] = []
    for row in rows:
        key = row["name"]
        if key in seen:
            result[seen[key]]["roles"] += f" · {row['role']}"
        else:
            new_row = dict(row)
            new_row["roles"] = row["role"]
            seen[key] = len(result)
            result.append(new_row)
    # Assign avatar colours by position so the palette cycles predictably.
    for idx, row in enumerate(result):
        row["avatar_color"] = _AVATAR_COLORS[idx % len(_AVATAR_COLORS)]
    return result


def _page_category_counts(page_rows: list[dict]) -> list[tuple[bool, int]]:
    counts: dict[bool, int] = {}
    for row in page_rows:
        counts[row["at_the_board"]] = counts.get(row["at_the_board"], 0) + 1
    # Board (True) before Non-Board (False), matching _sorted_board_rows.
    return sorted(counts.items(), key=lambda pair: not pair[0])


# ---------------------------------------------------------------------------
# PDF — Letter portrait, same masthead/table pattern as the NGO report.
# ---------------------------------------------------------------------------

_pdf_kicker_style = ParagraphStyle(
    "BoardPdfKicker", fontName="Helvetica-Bold", fontSize=9, leading=11,
    textColor=colors.HexColor(COLOR_DISTRICT_GREEN),
)
_pdf_h1_style = ParagraphStyle(
    "BoardPdfH1", fontName="Helvetica-Bold", fontSize=34, leading=34,
    textColor=colors.HexColor(COLOR_ROTARY_BLUE),
)
_pdf_subtitle_style = ParagraphStyle(
    "BoardPdfSubtitle", fontName="Helvetica", fontSize=14, leading=17,
    textColor=colors.HexColor(COLOR_INK),
)
_pdf_table_header_style = ParagraphStyle(
    "BoardPdfTableHeader", fontName="Helvetica-Bold", fontSize=8.5, leading=10,
    textColor=colors.HexColor(COLOR_DISTRICT_GREEN),
)
_pdf_table_name_style = ParagraphStyle(
    "BoardPdfTableName", fontName="Helvetica-Bold", fontSize=10.5, leading=13,
    textColor=colors.HexColor(COLOR_INK),
)
_pdf_table_cell_style = ParagraphStyle(
    "BoardPdfTableCell", fontName="Helvetica", fontSize=10.5, leading=13,
    textColor=colors.HexColor("#4A4D4A"),
)
_pdf_table_role_style = ParagraphStyle(
    "BoardPdfTableRole", fontName="Helvetica-Bold", fontSize=10.5, leading=13,
    textColor=colors.HexColor(COLOR_ROTARY_BLUE),
)
_pdf_figure_label_style = ParagraphStyle(
    "BoardPdfFigureLabel", fontName="Helvetica", fontSize=9.5, leading=12,
    textColor=colors.HexColor(COLOR_BODY_GREY),
)


def _pdf_header_footer(canvas_obj, doc, *, year_label: str, generated_date: str) -> None:
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
    canvas_obj.drawString(left, footer_y, "Board & Committee roster")
    canvas_obj.drawRightString(right, footer_y, f"Generated {generated_date}")
    canvas_obj.restoreState()


def build_pdf_report(year: int, rows: list[dict], include_non_board: bool = False) -> bytes:
    year_label = _rotary_year_label(year)
    source_rows = rows if include_non_board else [r for r in rows if r.get("at_the_board")]
    sorted_rows = _sorted_board_rows(source_rows)

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=0.7 * inch, bottomMargin=0.7 * inch,
        leftMargin=0.7 * inch, rightMargin=0.7 * inch,
    )
    story: list = []

    kicker_row = Table(
        [["", Paragraph(REPORT_TITLE.upper(), _pdf_kicker_style)]],
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
    story.append(Paragraph("Board roster", _pdf_h1_style))
    story.append(Paragraph(f"Rotary year {year_label} · {CLUB_NAME}", _pdf_subtitle_style))
    story.append(Spacer(1, 0.15 * inch))

    rule = Table([[""]], colWidths=[7.1 * inch], rowHeights=[2])
    rule.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(COLOR_INK))]))
    story.append(rule)
    story.append(Spacer(1, 0.2 * inch))

    if not sorted_rows:
        story.append(Paragraph("No board or committee positions are filled this term.", _pdf_figure_label_style))
    else:
        header_row = [
            Paragraph("Name", _pdf_table_header_style),
            Paragraph("Role", _pdf_table_header_style),
            Paragraph("Category", _pdf_table_header_style),
            Paragraph("Age", _pdf_table_header_style),
            Paragraph("Years as Rotarian", _pdf_table_header_style),
        ]
        data_rows = [header_row]
        for row in sorted_rows:
            data_rows.append(
                [
                    Paragraph(row["name"], _pdf_table_name_style),
                    Paragraph(row["role"], _pdf_table_role_style),
                    Paragraph(_category_label(row["at_the_board"]), _pdf_table_cell_style),
                    Paragraph(str(row["age"]) if row["age"] is not None else "—", _pdf_table_cell_style),
                    Paragraph(
                        str(row["years_as_rotarian"]) if row["years_as_rotarian"] is not None else "—",
                        _pdf_table_cell_style,
                    ),
                ]
            )
        board_table = Table(
            data_rows,
            colWidths=[2.0 * inch, 2.0 * inch, 1.1 * inch, 0.9 * inch, 1.1 * inch],
            repeatRows=1,
        )
        board_table.setStyle(
            TableStyle(
                [
                    ("LINEABOVE", (0, 0), (-1, 0), 2, colors.HexColor(COLOR_INK)),
                    ("LINEBELOW", (0, 0), (-1, 0), 2, colors.HexColor(COLOR_INK)),
                    ("LINEBELOW", (0, 1), (-1, -1), 0.75, colors.HexColor("#DFDEDB")),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        story.append(board_table)

    generated_date = date.today().strftime("%-d %B %Y")

    def _draw(canvas_obj, doc_):
        _pdf_header_footer(canvas_obj, doc_, year_label=year_label, generated_date=generated_date)

    doc.build(story, onFirstPage=_draw, onLaterPages=_draw)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# PPTX — horizontal-card layout (photo left, name+roles right), 3 per row.
#
# Canvas: 1920×1080 "px"  (1 px = 1/144 inch, via _px_len/_px_pt).
# Card dimensions:
#   width  ≈ 562 px  [(1728 - 2×20 gap) / 3 columns]
#   height = 160 px  (horizontal card, taller to fit age/years meta row)
#   photo circle: 80 px diameter, vertically centred, 16 px from card left
#
# Slide grid:
#   Row 0  — President only, card horizontally centred on the slide.
#   Row 1+ — Remaining members, 3 per row, in display_order.
# ---------------------------------------------------------------------------

BOARD_SLIDE_TITLE = "Board of Directors"


def _draw_board_chrome(slide, chrome: str) -> None:
    """Board-specific chrome: same background as _draw_chrome but with a
    fixed title ("Board of Directors") at 36 pt and NO kicker/year line
    above it — the user's reference slide has the title only."""
    if chrome == "template" and DISTRICT_BAND_IMAGE.exists():
        slide.shapes.add_picture(
            str(DISTRICT_BAND_IMAGE), 0, 0,
            width=_px_len(1920), height=_px_len(1080),
        )
    else:
        band = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE, 0, 0, _px_len(1920), _px_len(192)
        )
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

    # Title only — 36 pt, no kicker above it.
    title_box = slide.shapes.add_textbox(
        _px_len(96), _px_len(76), _px_len(1500), _px_len(80)
    )
    title_tf = title_box.text_frame
    title_tf.word_wrap = False
    title_p = title_tf.paragraphs[0]
    title_run = title_p.add_run()
    title_run.text = BOARD_SLIDE_TITLE
    title_run.font.size = Pt(36)
    title_run.font.bold = True
    title_run.font.color.rgb = _rgb("#FFFFFF")


def _clip_picture_to_circle(pic_shape) -> None:
    """Change a picture shape's preset geometry to 'ellipse' so it is
    rendered as a circle (requires equal width & height)."""
    sp_pr = pic_shape._element.spPr
    for existing in sp_pr.findall(qn("a:prstGeom")):
        sp_pr.remove(existing)
    from lxml import etree as _et
    geom = _et.SubElement(sp_pr, qn("a:prstGeom"))
    geom.set("prst", "ellipse")
    _et.SubElement(geom, qn("a:avLst"))


def _add_initials_circle(slide, initials: str, color: str, left, top, size) -> None:
    """Add a coloured circle with white initials text (fallback when no photo)."""
    oval = slide.shapes.add_shape(MSO_SHAPE.OVAL, left, top, size, size)
    oval.fill.solid()
    oval.fill.fore_color.rgb = _rgb(color)
    oval.line.fill.background()
    oval.shadow.inherit = False
    tf = oval.text_frame
    tf.word_wrap = False
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = initials
    run.font.size = Pt(_px_pt(28))
    run.font.bold = True
    run.font.color.rgb = _rgb("#FFFFFF")


def _add_board_card(slide, row: dict, left, top, width, height) -> None:
    """Horizontal card: circle photo/avatar left, name + role(s) + meta right.

    All text offsets and box heights scale proportionally from the 168 px
    baseline so the layout stays correct when *height* is reduced by
    ``_grid_params`` for large rosters.

    Baseline (168 px card) text layout:
      name  : +10 px / h 42 px   — bold 30 pt, near the top
      roles : +52 px / h 64 px   — 21 pt grey, word-wrap (fits 3 lines)
      meta  : +120 px / h 30 px  — 19 pt meta-grey (age · years as Rotarian)
    Photo circle ≤ 80 px, vertically centred.
    """
    # Derive raw px height for proportional scaling (EMU → design-canvas px).
    h_px = round(height * 144 / 914400)
    ratio = h_px / _CARD_H_DEFAULT_PX

    def _off(base_px: int):
        """EMU offset from card top, scaled to actual card height."""
        return top + _px_len(round(base_px * ratio))

    def _h(base_px: int):
        """EMU box height, scaled to actual card height."""
        return _px_len(round(base_px * ratio))

    # ── card body ──────────────────────────────────────────────────────────
    card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    card.fill.solid()
    card.fill.fore_color.rgb = _rgb("#FFFFFF")
    card.line.color.rgb = _rgb("#DEDEDE")
    card.line.width = Pt(1.0)
    card.shadow.inherit = False
    card.text_frame.clear()

    # ── photo / initials circle ────────────────────────────────────────────
    pad_left = _px_len(18)
    circle_size_px = min(80, round(h_px * 0.52))   # shrinks on very short cards
    circle_size = _px_len(circle_size_px)
    circle_left = left + pad_left
    circle_top = top + (height - circle_size) // 2   # vertically centred

    photo_png = pptx_safe_image(row["photo_bytes"]) if row.get("photo_bytes") else None
    if photo_png:
        pic = slide.shapes.add_picture(
            photo_png, circle_left, circle_top, width=circle_size, height=circle_size
        )
        _clip_picture_to_circle(pic)
    else:
        initials = "".join(part[0].upper() for part in row["name"].split()[:2] if part)
        _add_initials_circle(
            slide, initials, row.get("avatar_color", _AVATAR_COLORS[0]),
            circle_left, circle_top, circle_size,
        )

    # ── text block (name / roles / meta) ───────────────────────────────────
    text_gap = _px_len(14)
    text_left = circle_left + circle_size + text_gap
    text_right_pad = _px_len(14)
    text_width = width - (pad_left + circle_size + text_gap + text_right_pad)

    # Name — sits near the top of the card, bold dark text
    name_box = slide.shapes.add_textbox(text_left, _off(10), text_width, _h(42))
    name_tf = name_box.text_frame
    name_tf.word_wrap = False
    name_p = name_tf.paragraphs[0]
    name_run = name_p.add_run()
    name_run.text = row["name"]
    name_run.font.size = Pt(_px_pt(30))
    name_run.font.bold = True
    name_run.font.color.rgb = _rgb(COLOR_INK)

    # Roles — generous height so even 3 joined roles wrap without colliding
    role_box = slide.shapes.add_textbox(text_left, _off(52), text_width, _h(64))
    role_tf = role_box.text_frame
    role_tf.word_wrap = True
    role_p = role_tf.paragraphs[0]
    role_run = role_p.add_run()
    role_run.text = row["roles"]
    role_run.font.size = Pt(_px_pt(21))
    role_run.font.color.rgb = _rgb(COLOR_BODY_GREY)

    # Age · Years as Rotarian — anchored at bottom of the text block
    age_text = str(row["age"]) if row.get("age") is not None else "—"
    years_text = (
        str(row["years_as_rotarian"]) if row.get("years_as_rotarian") is not None else "—"
    )
    meta_box = slide.shapes.add_textbox(text_left, _off(120), text_width, _h(30))
    meta_tf = meta_box.text_frame
    meta_p = meta_tf.paragraphs[0]
    meta_run = meta_p.add_run()
    meta_run.text = f"Age {age_text}  ·  {years_text} yrs as Rotarian"
    meta_run.font.size = Pt(_px_pt(19))
    meta_run.font.color.rgb = _rgb(COLOR_META_GREY)


def _add_board_slide(
    prs: Presentation, blank_layout, year: int, page_rows: list[dict],
    page_number: int, total_pages: int, chrome: str,
) -> None:
    slide = prs.slides.add_slide(blank_layout)
    _draw_board_chrome(slide, chrome)

    if not page_rows:
        return

    # Compute grid geometry dynamically so all cards fit within the slide.
    grid_top_px, card_height_px, gap_px = _grid_params(len(page_rows))
    grid_left = _px_len(96)
    grid_top = _px_len(grid_top_px)
    grid_width = _px_len(1728)
    gap = _px_len(gap_px)
    card_height = _px_len(card_height_px)
    columns = _BOARD_COLUMNS
    card_width = int((grid_width - gap * (columns - 1)) / columns)
    slide_width = _px_len(1920)

    # Row 0 — President card alone, horizontally centred on the slide.
    president_left = (slide_width - card_width) // 2
    _add_board_card(slide, page_rows[0], president_left, grid_top, card_width, card_height)

    # Rows 1+ — remaining members, 3 per row, left-aligned in display order.
    for i, row in enumerate(page_rows[1:]):
        col = i % columns
        row_idx = i // columns + 1   # +1 because row 0 is the president
        left = grid_left + col * (card_width + gap)
        top = grid_top + row_idx * (card_height + gap)
        _add_board_card(slide, row, left, top, card_width, card_height)


def build_pptx_report(
    year: int,
    rows: list[dict],
    chrome: str = "plain",
    include_non_board: bool = False,
) -> bytes:
    prs = Presentation()
    prs.slide_width = _px_len(1920)
    prs.slide_height = _px_len(1080)
    blank_layout = prs.slide_layouts[6]

    # Optionally include non-board committee members.  Rows arrive
    # pre-sorted by BoardPosition.display_order from the query — that order
    # is preserved here.  Same person across multiple rows → one card with
    # roles joined by " · ".
    source_rows = rows if include_non_board else [r for r in rows if r.get("at_the_board")]
    grouped_rows = _group_by_member(source_rows)
    pages = _paginate(grouped_rows, _BOARD_CARDS_PER_SLIDE) if grouped_rows else [[]]

    for page_number, page_rows in enumerate(pages, start=1):
        _add_board_slide(prs, blank_layout, year, page_rows, page_number, len(pages), chrome)

    buf = BytesIO()
    prs.save(buf)
    return buf.getvalue()
