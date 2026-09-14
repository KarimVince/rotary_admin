"""Project Services Report — A4 portrait PDF + 16:9 landscape PPTX.

Generates the "Annual Project Services Report" — one card per NGO active in the
selected year, grouped by NGO classification, with local/international scope,
format (donation/volunteer/both) and status (planned/completed/ongoing) pills
derived from the year's actual donation and service-hour records.

Local = country is "Hong Kong" (case-insensitive); all others are International.
Design mirrors the HTML artifact card layout as closely as reportlab allows.

build_project_services_pptx() produces a landscape deck with the same data
using the same chrome as the NGO statistics PPTX (matching donation_statistics_report.py):
 - Slide 1: title / summary stats
 - Slides 2-N: one slide per classification (paginated at 9 cards)
"""

import math
import textwrap
from io import BytesIO
from pathlib import Path

from PIL import Image as PILImage
from pptx import Presentation as PptxPresentation
from pptx.dml.color import RGBColor as PptxRGB
from pptx.enum.shapes import MSO_SHAPE as PptxMSO
from pptx.enum.text import PP_ALIGN as PptxPP
from pptx.enum.text import MSO_ANCHOR as PptxMSOAnchor
from pptx.util import Cm as PptxCm, Inches as PptxIn, Pt as PptxPt
from reportlab.lib.colors import HexColor, white, Color
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as rl_canvas

# ---------------------------------------------------------------------------
# Font registration — Avenir Next Condensed (macOS built-in ≈ Barlow Condensed)
# ---------------------------------------------------------------------------

_FONT_DISPLAY = "AvenirCondBold"

def _register_fonts() -> bool:
    ttc = "/System/Library/Fonts/Avenir Next Condensed.ttc"
    try:
        pdfmetrics.registerFont(TTFont(_FONT_DISPLAY, ttc, subfontIndex=0))
        return True
    except Exception:
        return False

_HAS_COND = _register_fonts()
FONT_DISPLAY = _FONT_DISPLAY if _HAS_COND else "Helvetica-Bold"

# ---------------------------------------------------------------------------
# Page geometry
# ---------------------------------------------------------------------------
PAGE_W, PAGE_H = A4          # 595.276 × 841.89 pt
MARGIN     = 13 * mm         # ≈ 36.85 pt
CONTENT_W  = PAGE_W - 2 * MARGIN

# ---------------------------------------------------------------------------
# Colour palette
# ---------------------------------------------------------------------------
ROTARY_BLUE = HexColor("#17458F")
GOLD        = HexColor("#D4A017")
MUTED       = HexColor("#6B7280")
TEXT_DARK   = HexColor("#111827")
SECTION_BG  = HexColor("#F1F5F9")
CARD_WHITE  = white
CARD_BORDER = HexColor("#E5E7EB")
RULE_FOOTER = HexColor("#D1D5DB")

# Section gradients — (dark_start, light_end) exactly matching HTML CSS
_SECTION_GRADIENTS: dict[str, tuple[HexColor, HexColor]] = {
    "Education & Literacy":                    (HexColor("#1a3fa8"), HexColor("#2563EB")),
    "Poverty Alleviation & Social Welfare":    (HexColor("#7C2D12"), HexColor("#D97706")),
    "Health & Medical":                        (HexColor("#065E7C"), HexColor("#0891B2")),
    "Humanitarian Relief & Disaster Response": (HexColor("#7F1D1D"), HexColor("#DC2626")),
    "Youth Development":                       (HexColor("#3730A3"), HexColor("#4F46E5")),
    "Others":                                  (HexColor("#065E7C"), HexColor("#0891B2")),
    "Unclassified":                            (HexColor("#374151"), ROTARY_BLUE),
}

_SECTION_ORDER = [
    "Education & Literacy",
    "Poverty Alleviation & Social Welfare",
    "Health & Medical",
    "Humanitarian Relief & Disaster Response",
    "Youth Development",
    "Others",
    "Unclassified",
]

def _section_gradient(name: str) -> tuple[HexColor, HexColor]:
    return _SECTION_GRADIENTS.get(name, (HexColor("#374151"), ROTARY_BLUE))

# Pill styles — (bg_hex, fg_hex) matching HTML artifact pill classes
_PILL_STYLE: dict[str, tuple[str, str]] = {
    "Local":          ("#F3E8FF", "#6D28D9"),
    "International":  ("#DBEAFE", "#1E40AF"),
    "Donation":       ("#F0FDF4", "#166534"),
    "Volunteer":      ("#FCE7F3", "#9D174D"),
    "Don. + Vol.":    ("#E0E7FF", "#3730A3"),
    "Planned":        ("#FEF9C3", "#854D0E"),
    "Completed":      ("#D1FAE5", "#065F46"),
    "Done":           ("#D1FAE5", "#065F46"),
    "Ongoing":        ("#FEF3C7", "#92400E"),
}

# ---------------------------------------------------------------------------
# Asset paths
# ---------------------------------------------------------------------------
_ASSETS    = Path(__file__).resolve().parents[1] / "assets"
_RI_LOGO   = _ASSETS / "rotary-logo.png"           # left  — compact RI wheel
_CLUB_LOGO = _ASSETS / "club-logo-lockup.png"      # right — club identity lockup

# ---------------------------------------------------------------------------
# Layout constants (points)
# ---------------------------------------------------------------------------
LOGO_COL_W     = 120         # equal reserved column for each side logo
LOGO_MAX_H     = 30          # at col_w=120 all logos are height-constrained → equal 30pt height
LOGO_ZONE_H    = 58          # height of the club-identity zone (logos + club name + district)

MAIN_HEADER_H  = 93          # full header: LOGO_ZONE_H + report-title zone
SLIM_HEADER_H  = 30
FOOTER_H       = 20

SECTION_HDR_H  = 40     # gradient header band height
SECTION_BG_RAD = 10     # section container corner radius
CARD_RADIUS    = 6      # individual card corner radius
SECTION_GAP    = 12     # vertical gap between sections

CARD_PX        = 9      # cards area left/right inset inside section bg
CARD_PT        = 12     # top padding below header band (space before first card)
CARD_PB        = 9      # bottom padding inside section bg

# Icon drawn inside section header (white vector shape, no circle background)
ICON_AREA      = 22     # icon bounding box size
ICON_MARGIN_L  = 16     # icon left edge from section box
ICON_MARGIN_R  = 10     # gap between icon right edge and label

# Small classification icon shown before each card's org name
CARD_ICON_SIZE = 16     # icon rendered size (pt)
CARD_ICON_GAP  = 5      # gap between icon and name text

STRIP_W        = 5      # left colour strip on each card
CARD_INNER_L   = 12     # content left padding (after strip)
CARD_INNER_R   = 10     # content right padding
CARD_PAD_V     = 9      # top/bottom inner padding inside card
CARD_GAP       = 7      # vertical gap between consecutive cards (no line)

NAME_SIZE      = 13     # project name font size
AMOUNT_SIZE    = 13     # gold amount chip font size
PILL_SIZE      = 7
PILL_H         = 12
PILL_PAD_X     = 5
PILL_GAP       = 4
DESC_SIZE      = 8.5
DESC_LINE_H    = 11

NAME_PILL_GAP  = 8      # horizontal gap between name and the right-side group

CLUB_NAME = "Rotary Club of Discovery Bay"

# ---------------------------------------------------------------------------
# Coordinate helper
# ---------------------------------------------------------------------------

def _py(y_from_top: float) -> float:
    """Distance-from-top → reportlab bottom-left y."""
    return PAGE_H - y_from_top

# ---------------------------------------------------------------------------
# Gradient fill helper
# ---------------------------------------------------------------------------

def _fill_gradient_h(
    c: rl_canvas.Canvas,
    x: float, y: float, w: float, h: float,
    c1: HexColor, c2: HexColor,
    n: int = 60,
) -> None:
    """Fill a rect with a smooth left-to-right linear gradient using thin strips."""
    for i in range(n):
        t = i / n
        r = c1.red   + (c2.red   - c1.red)   * t
        g = c1.green + (c2.green - c1.green) * t
        b = c1.blue  + (c2.blue  - c1.blue)  * t
        c.setFillColor(Color(r, g, b))
        sx = x + w * i / n
        sw = w / n + 0.5    # slight overlap prevents hairline gaps
        c.rect(sx, y, sw, h, fill=1, stroke=0)

# ---------------------------------------------------------------------------
# Section icon drawing — Twemoji PNG images (72×72 square, transparent bg)
# ---------------------------------------------------------------------------

_SECTION_ICON_FILES: dict[str, str] = {
    "Education & Literacy":                    "icon_education.png",    # 📚
    "Poverty Alleviation & Social Welfare":    "icon_poverty.png",      # 🏠
    "Health & Medical":                        "icon_health.png",       # 🩹
    "Humanitarian Relief & Disaster Response": "icon_humanitarian.png", # 🤝
    "Youth Development":                       "icon_youth.png",        # 🌱
    "Others":                                  "icon_others.png",       # 📋
    "Unclassified":                            "icon_others.png",
}


def _draw_section_icon(c: rl_canvas.Canvas, section_name: str, cx: float, cy: float) -> None:
    """Draw the section emoji icon (Twemoji PNG) centred at (cx, cy)."""
    fname = _SECTION_ICON_FILES.get(section_name, "icon_others.png")
    path  = _ASSETS / fname
    if not path.exists():
        return
    sz    = ICON_AREA           # draw at ICON_AREA × ICON_AREA points
    draw_x = cx - sz / 2
    draw_y = cy - sz / 2       # bottom-left in RL coords (cy is already RL y)
    try:
        c.drawImage(ImageReader(str(path)), draw_x, draw_y, width=sz, height=sz, mask="auto")
    except Exception:
        pass

# ---------------------------------------------------------------------------
# Logo drawing
# ---------------------------------------------------------------------------

def _draw_logo(
    c: rl_canvas.Canvas,
    path: Path, col_x: float, col_w: float,
    hdr_top: float, hdr_h: float, max_img_h: float,
) -> None:
    if not path.exists():
        return
    try:
        from PIL import Image as PILImage
        with PILImage.open(path) as im:
            img_w, img_h = im.size
    except Exception:
        img_w, img_h = 1, 1

    aspect     = img_w / img_h
    max_draw_w = col_w - 8
    max_draw_h = min(max_img_h, hdr_h - 10)
    box_aspect = max_draw_w / max_draw_h

    if aspect >= box_aspect:
        w = max_draw_w; h = w / aspect
    else:
        h = max_draw_h; w = h * aspect

    draw_x = col_x + (col_w - w) / 2
    draw_y  = _py(hdr_top + (hdr_h - h) / 2 + h)
    c.drawImage(ImageReader(str(path)), draw_x, draw_y, width=w, height=h, mask="auto")

# ---------------------------------------------------------------------------
# Pill drawing
# ---------------------------------------------------------------------------

def _pill(c: rl_canvas.Canvas, x: float, y_center: float, label: str,
          style_key: str | None = None) -> float:
    """Draw one pill badge, vertically centred at y_center. Returns x after badge + gap.

    ``style_key`` lets you look up a colour different from the displayed ``label``
    (e.g. show "Hong Kong" but colour it with the "Local" palette entry).
    """
    key    = style_key if style_key is not None else label
    bg_hex, fg_hex = _PILL_STYLE.get(key, ("#E5E7EB", "#374151"))
    text_w = c.stringWidth(label, "Helvetica-Bold", PILL_SIZE)
    w      = text_w + 2 * PILL_PAD_X
    pdf_y  = _py(y_center + PILL_H / 2)
    c.setFillColor(HexColor(bg_hex))
    c.roundRect(x, pdf_y, w, PILL_H, 3, fill=1, stroke=0)
    c.setFillColor(HexColor(fg_hex))
    c.setFont("Helvetica-Bold", PILL_SIZE)
    c.drawString(x + PILL_PAD_X, pdf_y + 3.5, label)
    return x + w + PILL_GAP

# ---------------------------------------------------------------------------
# Measurement helpers
# ---------------------------------------------------------------------------

def _wrap_desc(text: str | None) -> list[str]:
    if not text:
        return []
    return textwrap.wrap(text.strip(), width=90, max_lines=3)


def _display_amount(row: dict) -> str | None:
    if row["actual_hkd"] > 0:
        return f"HK${row['actual_hkd']:,.0f}"
    if row["planned_hkd"] > 0:
        return f"HK${row['planned_hkd']:,.0f}"
    return None


def _right_group_width(c: rl_canvas.Canvas, amount_str: str | None, pills: tuple[str, str, str]) -> float:
    """Total pixel width of the right-side group: amount chip + pills."""
    w = 0.0
    if amount_str:
        w += c.stringWidth(amount_str, FONT_DISPLAY, AMOUNT_SIZE)
        w += PILL_GAP
    for label in pills:
        w += c.stringWidth(label, "Helvetica-Bold", PILL_SIZE) + 2 * PILL_PAD_X + PILL_GAP
    if w > 0:
        w -= PILL_GAP   # remove the trailing gap
    return w


def _card_height(row: dict) -> float:
    """Card height: one compact top row (name | amount+pills) + optional description."""
    desc_lines = _wrap_desc(row.get("description"))
    n          = len(desc_lines)
    # Row height must accommodate both the name text and the icon (whichever is taller)
    row_h      = max(NAME_SIZE, CARD_ICON_SIZE)
    gap        = 9 if n else 0
    h = CARD_PAD_V + row_h + gap + n * DESC_LINE_H + CARD_PAD_V
    return max(h, 34.0)


def _section_height(rows: list[dict]) -> float:
    cards_h = sum(_card_height(r) for r in rows)
    gaps_h  = max(len(rows) - 1, 0) * CARD_GAP
    return SECTION_HDR_H + CARD_PT + cards_h + gaps_h + CARD_PB


def _page_content_h(is_first: bool) -> float:
    top = MARGIN + (MAIN_HEADER_H + 16 if is_first else SLIM_HEADER_H + 10)
    bot = MARGIN + FOOTER_H + 6
    return PAGE_H - top - bot

# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

def _derive_pills(row: dict) -> tuple[str, str, str, str]:
    """Return (fmt_pill, status_pill, scope_label, scope_style_key).

    scope_label  — the display text shown in the pill (the actual country name)
    scope_style_key — "Local" or "International" used to look up the pill colour
    """
    has_don   = row["actual_hkd"] > 0 or row["planned_hkd"] > 0
    has_hours = row["actual_hours"] > 0 or row["planned_hours"] > 0

    fmt = "Don. + Vol." if (has_don and has_hours) else ("Volunteer" if has_hours else "Donation")

    if row["actual_hkd"] > 0 and row["actual_hours"] == 0:
        status = "Completed"
    elif row["actual_hours"] > 0:
        status = "Ongoing"
    else:
        status = "Planned"

    country       = (row.get("country") or "").strip()
    country_lower = country.lower()
    is_local      = country_lower in ("hong kong", "hk")
    scope_key     = "Local" if is_local else "International"
    scope_label   = country if country else scope_key   # display the actual country
    return fmt, status, scope_label, scope_key

# ---------------------------------------------------------------------------
# Page chrome
# ---------------------------------------------------------------------------

def _main_header(c: rl_canvas.Canvas, year_label: str) -> float:
    top = MARGIN
    cx  = PAGE_W / 2

    # ── 1. Center text block — defined first, anchored to page centre ─────────
    # The center zone sits between the two equal logo columns; text is always
    # page-centred regardless of logo sizes.  Dynamic font sizing ensures the
    # club name never overflows into the logo columns even on systems that fall
    # back to Helvetica-Bold (Linux / production servers without Avenir).
    avail_name_w = PAGE_W - 2 * MARGIN - 2 * LOGO_COL_W - 10
    name_str  = CLUB_NAME.upper()
    name_size = 22
    while name_size > 10 and c.stringWidth(name_str, FONT_DISPLAY, name_size) > avail_name_w:
        name_size -= 0.5

    # Vertical positions within the LOGO_ZONE_H band (club-identity zone)
    # Text block centre ≈ top+28 (≈ zone centre); name baseline at top+34,
    # district baseline at top+48.
    c.setFont(FONT_DISPLAY, name_size); c.setFillColor(ROTARY_BLUE)
    c.drawCentredString(cx, _py(top + 34), name_str)

    c.setFont("Helvetica", 9); c.setFillColor(MUTED)
    c.drawCentredString(cx, _py(top + 48), "District 3450")

    # Gold separator rule between club-identity zone and report-title zone
    c.setFillColor(GOLD)
    c.rect(cx - 28, _py(top + LOGO_ZONE_H - 1), 56, 2, fill=1, stroke=0)

    # ── 2. Logos — equal side columns, both constrained to LOGO_MAX_H ─────────
    # Both logos are drawn within identical LOGO_COL_W × LOGO_ZONE_H cells.
    # LOGO_MAX_H is chosen so the wide lockup (aspect ≈ 3.63) and the
    # squarish wheel (aspect ≈ 1.28) both end up at approximately the same
    # rendered height (~31–33 pt), making the header visually balanced.
    _draw_logo(c, _RI_LOGO,   MARGIN,                        LOGO_COL_W,
               top, LOGO_ZONE_H, LOGO_MAX_H)
    _draw_logo(c, _CLUB_LOGO, PAGE_W - MARGIN - LOGO_COL_W, LOGO_COL_W,
               top, LOGO_ZONE_H, LOGO_MAX_H)

    # ── 3. Report-title zone (below club-identity zone) ────────────────────────
    ry = top + LOGO_ZONE_H + 7
    c.setFont(FONT_DISPLAY, 14); c.setFillColor(TEXT_DARK)
    c.drawCentredString(cx, _py(ry + 13), "ANNUAL PROJECT SERVICES REPORT")

    c.setFont("Helvetica", 8.5); c.setFillColor(MUTED)
    c.drawCentredString(cx, _py(ry + 25), f"Rotary Year {year_label}")

    # ── 4. Bottom rule ─────────────────────────────────────────────────────────
    hdr_bottom = top + MAIN_HEADER_H
    c.setStrokeColor(ROTARY_BLUE); c.setLineWidth(2)
    c.line(MARGIN, _py(hdr_bottom + 5), PAGE_W - MARGIN, _py(hdr_bottom + 5))
    return hdr_bottom + 14


def _slim_header(c: rl_canvas.Canvas, year_label: str) -> float:
    top = MARGIN
    mid = top + SLIM_HEADER_H / 2 + 5
    c.setFont(FONT_DISPLAY, 15); c.setFillColor(ROTARY_BLUE)
    c.drawString(MARGIN, _py(mid), CLUB_NAME.upper())
    c.setFont("Helvetica", 8); c.setFillColor(MUTED)
    c.drawRightString(PAGE_W - MARGIN, _py(mid),
                      f"Annual Project Services Report · Rotary Year {year_label}")
    rule_y = top + SLIM_HEADER_H
    c.setStrokeColor(ROTARY_BLUE); c.setLineWidth(2)
    c.line(MARGIN, _py(rule_y), PAGE_W - MARGIN, _py(rule_y))
    return rule_y + 10


def _footer(c: rl_canvas.Canvas, page_num: int, total_pages: int, year_label: str) -> None:
    """All y values are native reportlab (from bottom) — do NOT use _py()."""
    rule_y = MARGIN + FOOTER_H
    c.setStrokeColor(RULE_FOOTER); c.setLineWidth(0.75)
    c.line(MARGIN, rule_y, PAGE_W - MARGIN, rule_y)
    text_y = MARGIN + 4
    c.setFont("Helvetica", 7.5); c.setFillColor(MUTED)
    c.drawString(MARGIN, text_y, f"{CLUB_NAME} · District 3450")
    c.drawCentredString(PAGE_W / 2, text_y,
                        f"Annual Project Services Report · Rotary Year {year_label}")
    c.drawRightString(PAGE_W - MARGIN, text_y, f"{page_num} / {total_pages}")

# ---------------------------------------------------------------------------
# Section & card drawing
# ---------------------------------------------------------------------------

def _draw_section(
    c: rl_canvas.Canvas,
    section_name: str,
    rows: list[dict],
    y_from_top: float,
) -> float:
    dark_col, light_col = _section_gradient(section_name)
    total_h = _section_height(rows)

    # ── Section background (light grey, all corners rounded) ─────────────────
    bg_pdf_y = _py(y_from_top + total_h)
    c.setFillColor(SECTION_BG)
    c.roundRect(MARGIN, bg_pdf_y, CONTENT_W, total_h, SECTION_BG_RAD, fill=1, stroke=0)

    # ── Gradient header band — top corners rounded (from section clip), bottom FLAT ──
    # Key technique: clip to the FULL section shape (roundRect), then fill only
    # SECTION_HDR_H from the top as a plain rectangle.  Since the gradient rect's
    # bottom edge sits in the middle of the section (not at a corner), it stays
    # perfectly flat.  The section clip's top-corner rounding naturally rounds the
    # gradient's top corners.  No bleed below the header band.
    hdr_pdf_y = _py(y_from_top + SECTION_HDR_H)   # bottom of header band in RL coords

    c.saveState()
    clip_p = c.beginPath()
    clip_p.roundRect(MARGIN, bg_pdf_y, CONTENT_W, total_h, SECTION_BG_RAD)
    c.clipPath(clip_p, fill=0, stroke=0)
    # Fill gradient as a plain rect — height exactly SECTION_HDR_H, no extension
    _fill_gradient_h(c, MARGIN, hdr_pdf_y, CONTENT_W, SECTION_HDR_H, dark_col, light_col)
    c.restoreState()

    # ── Section icon (white vector shape) ────────────────────────────────────
    icon_cx = MARGIN + ICON_MARGIN_L + ICON_AREA / 2
    icon_cy = hdr_pdf_y + SECTION_HDR_H / 2      # vertical centre of header
    _draw_section_icon(c, section_name, icon_cx, icon_cy)

    # ── Section label ─────────────────────────────────────────────────────────
    label   = section_name if section_name != "Unclassified" else "Other Projects"
    label_x = MARGIN + ICON_MARGIN_L + ICON_AREA + ICON_MARGIN_R
    label_y = icon_cy - 7   # baseline centred in header height
    c.setFont(FONT_DISPLAY, 20); c.setFillColor(white)
    c.drawString(label_x, label_y, label)

    # ── Subtle decorative circle (top-right, like HTML ::after) ───────────────
    c.saveState()
    clip_p2 = c.beginPath()
    clip_p2.roundRect(MARGIN, bg_pdf_y, CONTENT_W, total_h, SECTION_BG_RAD)
    c.clipPath(clip_p2, fill=0, stroke=0)
    c.setFillColor(Color(1, 1, 1, 0.07))
    c.circle(MARGIN + CONTENT_W - 28, hdr_pdf_y + SECTION_HDR_H + 28, 65, fill=1, stroke=0)
    c.restoreState()

    # ── Cards ─────────────────────────────────────────────────────────────────
    cy = y_from_top + SECTION_HDR_H + CARD_PT
    for i, row in enumerate(rows):
        if i > 0:
            cy += CARD_GAP
        cy = _draw_card(c, row, cy, light_col, section_name=section_name)

    return y_from_top + total_h + SECTION_GAP


def _draw_card(
    c: rl_canvas.Canvas,
    row: dict,
    y_from_top: float,
    strip_color: HexColor,
    *,
    section_name: str = "",
) -> float:
    """Draw one compact project card matching the HTML template layout.

    Card layout:
      [strip] | [icon] Name (bold, left)   HK$X,XXX [Donation] [Planned] [Local]
              |        Description text (optional, muted, below)
    """
    card_h  = _card_height(row)
    card_x  = MARGIN + CARD_PX
    card_w  = CONTENT_W - 2 * CARD_PX
    card_by = _py(y_from_top + card_h)

    # ── Rounded card with clipped left strip (clipPath approach) ──────────────
    c.saveState()
    p = c.beginPath()
    p.roundRect(card_x, card_by, card_w, card_h, CARD_RADIUS)
    c.clipPath(p, fill=0, stroke=0)
    c.setFillColor(strip_color)
    c.rect(card_x, card_by, STRIP_W, card_h, fill=1, stroke=0)
    c.setFillColor(CARD_WHITE)
    c.rect(card_x + STRIP_W, card_by, card_w - STRIP_W, card_h, fill=1, stroke=0)
    c.restoreState()

    # Content geometry
    ix     = card_x + STRIP_W + CARD_INNER_L
    iright = card_x + card_w - CARD_INNER_R

    # Top row y: baseline anchor for name and amount text
    row_y    = y_from_top + CARD_PAD_V          # y_from_top of the text baseline area
    row_h    = max(NAME_SIZE, CARD_ICON_SIZE)   # actual row height (icon may be taller)
    # Vertical centre of the full row (used for pill alignment)
    row_mid  = row_y + row_h / 2

    # ── Derive content ────────────────────────────────────────────────────────
    fmt_pill, status_pill, scope_label, scope_key = _derive_pills(row)
    amount_str = _display_amount(row)
    # pills as (display_label, style_key) pairs
    pill_items = [
        (fmt_pill,    fmt_pill),
        (status_pill, status_pill),
        (scope_label, scope_key),    # show country name, colour by local/intl
    ]

    # ── NGO logo (or fallback classification emoji) before the org name ──────
    # Prefer the organisation's own uploaded logo; fall back to the generic
    # Twemoji classification icon when no logo has been uploaded.
    icon_offset = 0.0
    logo_bytes = row.get("logo_bytes")  # BytesIO | None — from resolve_logo_bytes
    fname      = _SECTION_ICON_FILES.get(section_name, "")
    icon_src   = None  # will be an ImageReader-compatible source
    if logo_bytes is not None:
        logo_bytes.seek(0)
        icon_src = ImageReader(logo_bytes)
    elif fname:
        icon_path = _ASSETS / fname
        if icon_path.exists():
            icon_src = ImageReader(str(icon_path))

    if icon_src is not None:
        sz = CARD_ICON_SIZE
        # Vertically centre the icon within the name-row height
        icon_draw_y = _py(row_y + (NAME_SIZE + sz) / 2)
        try:
            c.drawImage(icon_src, ix, icon_draw_y, width=sz, height=sz, mask="auto")
            icon_offset = sz + CARD_ICON_GAP
        except Exception:
            pass

    # Name text starts after icon (if any)
    name_ix = ix + icon_offset

    # ── Calculate right-group width so we can truncate the name ──────────────
    rg_w = 0.0
    if amount_str:
        rg_w += c.stringWidth(amount_str, FONT_DISPLAY, AMOUNT_SIZE) + PILL_GAP
    for label, _ in pill_items:
        rg_w += c.stringWidth(label, "Helvetica-Bold", PILL_SIZE) + 2 * PILL_PAD_X + PILL_GAP
    if rg_w > 0:
        rg_w -= PILL_GAP

    name_max_w = iright - name_ix - (NAME_PILL_GAP + rg_w if rg_w else 0)

    name = row.get("name", "")
    c.setFont(FONT_DISPLAY, NAME_SIZE)
    while name and c.stringWidth(name, FONT_DISPLAY, NAME_SIZE) > name_max_w:
        name = name[:-1]
    if name != row.get("name", ""):
        name = name.rstrip() + "…"

    c.setFillColor(TEXT_DARK)
    # Baseline: vertically centre the name text within row_h
    c.drawString(name_ix, _py(row_y + (row_h + NAME_SIZE) / 2), name)

    # ── Right group: amount chip then pills — right-aligned ───────────────────
    rx = iright - rg_w    # start of right group

    if amount_str:
        c.setFont(FONT_DISPLAY, AMOUNT_SIZE)
        c.setFillColor(GOLD)
        c.drawString(rx, _py(row_y + (row_h + AMOUNT_SIZE) / 2), amount_str)
        rx += c.stringWidth(amount_str, FONT_DISPLAY, AMOUNT_SIZE) + PILL_GAP

    # Pills centred vertically in the full row height
    for label, sk in pill_items:
        rx = _pill(c, rx, row_mid, label, style_key=sk)

    # ── Description (if any) — below the top row ──────────────────────────────
    desc_lines = _wrap_desc(row.get("description"))
    if desc_lines:
        iy = row_y + row_h + 9
        c.setFont("Helvetica", DESC_SIZE)
        c.setFillColor(MUTED)
        for line in desc_lines:
            c.drawString(ix, _py(iy + DESC_SIZE), line)
            iy += DESC_LINE_H

    return y_from_top + card_h

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_project_services_pdf(
    rows: list[dict],
    year: int,
    currency: str = "HKD",
) -> bytes:
    """Build the A4 portrait project services PDF.

    ``rows`` is a list of dicts with keys:
        name, description, country, classification,
        actual_hkd, planned_hkd, actual_hours, planned_hours
    """
    year_label = f"{year}–{year + 1}"

    by_section: dict[str, list[dict]] = {}
    for row in rows:
        sec = row.get("classification") or "Unclassified"
        by_section.setdefault(sec, []).append(row)

    def _sec_key(name: str) -> int:
        try:
            return _SECTION_ORDER.index(name)
        except ValueError:
            return len(_SECTION_ORDER)

    ordered = sorted(by_section.items(), key=lambda kv: _sec_key(kv[0]))
    for _, sec_rows in ordered:
        sec_rows.sort(key=lambda r: (r.get("name") or "").lower())

    if not ordered:
        buf = BytesIO()
        c = rl_canvas.Canvas(buf, pagesize=A4)
        _main_header(c, year_label)
        _footer(c, 1, 1, year_label)
        c.save()
        return buf.getvalue()

    # ── Pass 1: count pages ──────────────────────────────────────────────────
    total_pages, avail = 1, _page_content_h(is_first=True)
    for _, sec_rows in ordered:
        sh = _section_height(sec_rows)
        if sh > avail:
            total_pages += 1
            avail = _page_content_h(is_first=False)
        avail -= sh + SECTION_GAP
        if avail < 0:
            total_pages += 1
            avail = _page_content_h(is_first=False)

    # ── Pass 2: render ───────────────────────────────────────────────────────
    buf = BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)

    page_num = 1
    y_cursor = _main_header(c, year_label)
    avail    = _page_content_h(is_first=True)

    for section_name, sec_rows in ordered:
        sh = _section_height(sec_rows)
        if sh > avail:
            _footer(c, page_num, total_pages, year_label)
            c.showPage()
            page_num += 1
            y_cursor  = _slim_header(c, year_label)
            avail     = _page_content_h(is_first=False)

        y_cursor = _draw_section(c, section_name, sec_rows, y_cursor)
        avail   -= sh + SECTION_GAP

    _footer(c, page_num, total_pages, year_label)
    c.save()
    return buf.getvalue()


# ---------------------------------------------------------------------------
# PPTX — 16:9 landscape (Annual Project Services Report)
# ---------------------------------------------------------------------------
# Slide deck with the same data as the PDF but formatted for presentation.
#
# Geometry: 1920×1080 px canvas at 144 dpi ≡ 13.333"×7.5" (Widescreen 16:9).
# Pixel-to-EMU:  inches = px / 144  →  EMU = PptxIn(px / 144)
# Pixel-to-pt:   points = px / 2
#
# Two chrome variants:
#   "plain"    — white background; header mirrors the PDF (both logos centred,
#                club name + District 3450 + gold rule + report title + blue rule).
#                No green band.
#   "template" — District 3450 band PNG as full-slide background (green band).
# ---------------------------------------------------------------------------

# ── Colour tokens ──────────────────────────────────────────────────────────
_PPTX_GREEN      = "#375E3A"   # template band / section-header / card strip
_PPTX_BLUE       = "#17458F"   # rotary blue (club name, stat figures, rule)
_PPTX_BAND_GOLD  = "#D9BE86"   # kicker text in template band
_PPTX_AMT_GOLD   = "#F7A81B"   # HKD amount foreground
_PPTX_GOLD_RULE  = "#D4A017"   # gold separator rule (matching PDF GOLD constant)
_PPTX_INK        = "#201E1D"   # primary body text
_PPTX_GREY       = "#5B5F5B"   # secondary / description text
_PPTX_MUTED      = "#6B7280"   # muted labels (District 3450, year label)
_PPTX_CARD_BG    = "#FFFFFF"
_PPTX_CARD_BR    = "#E4E3E0"

# Section header dark-fill colour (solid, matching the PDF gradient start).
_PPTX_SECTION_COLOR: dict[str, str] = {
    "Education & Literacy":                    "#1a3fa8",
    "Poverty Alleviation & Social Welfare":    "#7C2D12",
    "Health & Medical":                        "#065E7C",
    "Humanitarian Relief & Disaster Response": "#7F1D1D",
    "Youth Development":                       "#3730A3",
    "Others":                                  "#065E7C",
    "Unclassified":                            "#374151",
}

# Light accent colors for card left strip — lighter end of each section gradient
_PPTX_SECTION_LIGHT: dict[str, str] = {
    "Education & Literacy":                    "#2563EB",
    "Poverty Alleviation & Social Welfare":    "#D97706",
    "Health & Medical":                        "#0891B2",
    "Humanitarian Relief & Disaster Response": "#DC2626",
    "Youth Development":                       "#4F46E5",
    "Others":                                  "#0891B2",
    "Unclassified":                            "#17458F",
}

# ── Canvas constants (px) ──────────────────────────────────────────────────
_PCW      = 1920      # slide width
_PCH      = 1080      # slide height
_PMX      = 96        # margin x (left / right)
_PCWW     = 1728      # content width = _PCW - 2*_PMX

# Header heights (px) — both variants occupy the same zone so content
# positions are identical regardless of chrome.
_PBAND_H        = 192   # template: chrome band height
_PPLAIN_HDR_H   = 192   # plain: white header height (matches template)

# ── Section slide geometry ─────────────────────────────────────────────────
# Layout mirrors the PDF: grey section background box containing a dark
# gradient header (solid fill approximation) + a 3-column card grid.

_PCONTENT_TOP  = _PBAND_H + 12      # = 204 px — where content starts

# Section background box (inset from content margins, like PDF CARD_PX)
_PSECT_BOX_INS = 9                  # box inset from _PMX each side
_PSECT_BOX_X   = _PMX + _PSECT_BOX_INS   # = 105
_PSECT_BOX_W   = _PCWW - 2 * _PSECT_BOX_INS  # = 1710

# Section header band (inside the box)
_PSECT_H       = 48    # px

# Card grid (inside the section box, with an inner inset)
_PCARD_INS     = 9     # card-area inset from section box edge each side
_PCARD_AREA_W  = _PSECT_BOX_W - 2 * _PCARD_INS   # = 1692
_PCOLS         = 3
_PCOL_GAP      = 14
_PROW_GAP      = 12
_PCARD_H       = 190   # px — fills slide: (864-48-10-10-3×12)/4 = 190px per row
_PCARD_W       = (_PCARD_AREA_W - (_PCOLS - 1) * _PCOL_GAP) // _PCOLS   # = 554
_PMAX_ROWS     = 4
_PCARDS_SLIDE  = _PCOLS * _PMAX_ROWS   # = 12

# ── Pill approximate widths (px at 8pt font) ───────────────────────────────
_PPILL_W: dict[str, int] = {
    "Local": 52, "International": 88,
    "Donation": 68, "Volunteer": 72, "Don. + Vol.": 88,
    "Planned": 60, "Completed": 76, "Ongoing": 64, "Done": 52,
}


# ── Low-level helpers ──────────────────────────────────────────────────────

def _pin(px: float) -> int:
    """Pixels → EMU (1920px ≡ 13.333 in → 144px/in)."""
    return PptxIn(px / 144)


def _ppt(px: float) -> float:
    """Pixels → points (0.5 pt/px)."""
    return px / 2


def _prgb(hex_color: str) -> PptxRGB:
    return PptxRGB.from_string(hex_color.lstrip("#").upper())


def _ppill_w(label: str) -> int:
    return _PPILL_W.get(label, max(len(label) * 6 + 24, 56))


def _psect_color(section_name: str) -> str:
    return _PPTX_SECTION_COLOR.get(section_name, "#374151")


# ── Logo helper (landscape PPTX) ───────────────────────────────────────────

def _pdraw_logo(slide, path: Path, col_x_px: float, col_w_px: float,
                zone_top_px: float, zone_h_px: float, max_h_px: float) -> None:
    """Draw a logo centred within its column zone, height-constrained at max_h_px."""
    if not path.exists():
        return
    try:
        with PILImage.open(path) as im:
            aspect = im.width / im.height
    except Exception:
        return
    max_w_px = col_w_px - 8
    # height-constrain
    h = min(max_h_px, zone_h_px - 10)
    w = h * aspect
    if w > max_w_px:
        w = max_w_px; h = w / aspect
    draw_x = col_x_px + (col_w_px - w) / 2
    draw_y = zone_top_px + (zone_h_px - h) / 2
    try:
        slide.shapes.add_picture(
            str(path), _pin(draw_x), _pin(draw_y),
            width=_pin(w), height=_pin(h),
        )
    except Exception:
        pass


# ── Chrome: plain (white, PDF-style) ──────────────────────────────────────

def _pdraw_plain_header(slide, year_label: str, title_line: str) -> None:
    """White header matching the PDF _main_header layout (landscape scale).

    Zones (all px from slide top):
      0–140  logo zone: RI wheel left | club name + district + gold rule | lockup right
      140–175 report-title zone: title_line + year_label
      175–180 bottom blue rule
      180–192 gap before content
    """
    LOGO_COL_W  = 160    # px reserved for each side logo column
    LOGO_ZONE_H = 140    # px height of the club-identity zone
    LOGO_MAX_H  = 100    # max logo height in px (height-constrained so both equal)
    cx_px       = _PCW / 2
    center_l    = _PMX + LOGO_COL_W
    center_w    = _PCW - 2 * (_PMX + LOGO_COL_W)

    # ── 1. Logos ──────────────────────────────────────────────────────────
    _pdraw_logo(slide, _RI_LOGO,
                _PMX, LOGO_COL_W, 0, LOGO_ZONE_H, LOGO_MAX_H)
    _pdraw_logo(slide, _CLUB_LOGO,
                _PCW - _PMX - LOGO_COL_W, LOGO_COL_W, 0, LOGO_ZONE_H, LOGO_MAX_H)

    # ── 2. Club name (centered, rotary blue, bold) ────────────────────────
    nb = slide.shapes.add_textbox(
        _pin(center_l), _pin(28), _pin(center_w), _pin(50),
    )
    nb_tf = nb.text_frame
    nb_tf.word_wrap = False
    nb_p = nb_tf.paragraphs[0]
    nb_p.text      = CLUB_NAME.upper()
    nb_p.alignment = PptxPP.CENTER
    nb_p.font.size = PptxPt(_ppt(52))   # ≈ 26pt → visible but not huge
    nb_p.font.bold = True
    nb_p.font.color.rgb = _prgb(_PPTX_BLUE)

    # ── 3. "District 3450" (centered, muted) ─────────────────────────────
    db = slide.shapes.add_textbox(
        _pin(center_l), _pin(82), _pin(center_w), _pin(28),
    )
    db_p = db.text_frame.paragraphs[0]
    db_p.text      = "District 3450"
    db_p.alignment = PptxPP.CENTER
    db_p.font.size = PptxPt(_ppt(24))
    db_p.font.color.rgb = _prgb(_PPTX_MUTED)

    # ── 4. Gold separator rule ────────────────────────────────────────────
    gold_w_px = 240
    gb = slide.shapes.add_shape(
        PptxMSO.RECTANGLE,
        _pin(cx_px - gold_w_px / 2), _pin(113),
        _pin(gold_w_px), _pin(4),
    )
    gb.fill.solid(); gb.fill.fore_color.rgb = _prgb(_PPTX_GOLD_RULE)
    gb.line.fill.background(); gb.shadow.inherit = False; gb.text_frame.clear()

    # ── 5. Report title ───────────────────────────────────────────────────
    tb = slide.shapes.add_textbox(
        _pin(center_l), _pin(122), _pin(center_w), _pin(36),
    )
    tp = tb.text_frame.paragraphs[0]
    tp.text      = title_line
    tp.alignment = PptxPP.CENTER
    tp.font.size = PptxPt(_ppt(36))
    tp.font.bold = True
    tp.font.color.rgb = _prgb(_PPTX_INK)

    # ── 6. Rotary year ────────────────────────────────────────────────────
    yb = slide.shapes.add_textbox(
        _pin(center_l), _pin(160), _pin(center_w), _pin(26),
    )
    yp = yb.text_frame.paragraphs[0]
    yp.text      = f"Rotary Year {year_label}"
    yp.alignment = PptxPP.CENTER
    yp.font.size = PptxPt(_ppt(22))
    yp.font.color.rgb = _prgb(_PPTX_MUTED)

    # ── 7. Bottom blue rule (full content width) ──────────────────────────
    rule = slide.shapes.add_shape(
        PptxMSO.RECTANGLE,
        _pin(_PMX), _pin(182), _pin(_PCWW), _pin(3),
    )
    rule.fill.solid(); rule.fill.fore_color.rgb = _prgb(_PPTX_BLUE)
    rule.line.fill.background(); rule.shadow.inherit = False; rule.text_frame.clear()


def _pdraw_slim_plain_header(slide, year_label: str, section_label: str) -> None:
    """Slim white header for section slides (plain chrome) — mirrors PDF _slim_header.

    Zones (px): 0–48 text row | 48–54 blue rule | 54–66 gap → content at y=66px
    But we reuse _PBAND_H=192 as the chrome height so grid coordinates are
    identical to the template variant.  The extra space below the rule is left
    blank (white), keeping the section bar at the same y=206 as in template mode.
    """
    # RI logo (small, left)
    if _RI_LOGO.exists():
        _pdraw_logo(slide, _RI_LOGO, _PMX, 80, 8, 44, 36)

    # Club name left
    cl = slide.shapes.add_textbox(_pin(_PMX + 88), _pin(10), _pin(700), _pin(38))
    cl_p = cl.text_frame.paragraphs[0]
    cl_p.text = CLUB_NAME.upper()
    cl_p.font.size = PptxPt(_ppt(28))
    cl_p.font.bold = True
    cl_p.font.color.rgb = _prgb(_PPTX_BLUE)

    # Right label: section + year
    right_text = f"{section_label}  ·  Rotary Year {year_label}"
    rl = slide.shapes.add_textbox(_pin(800), _pin(10), _pin(_PCW - 800 - _PMX), _pin(38))
    rp = rl.text_frame.paragraphs[0]
    rp.text = right_text
    rp.alignment = PptxPP.RIGHT
    rp.font.size = PptxPt(_ppt(22))
    rp.font.color.rgb = _prgb(_PPTX_MUTED)

    # Blue rule
    rule = slide.shapes.add_shape(
        PptxMSO.RECTANGLE,
        _pin(_PMX), _pin(52), _pin(_PCWW), _pin(2),
    )
    rule.fill.solid(); rule.fill.fore_color.rgb = _prgb(_PPTX_BLUE)
    rule.line.fill.background(); rule.shadow.inherit = False; rule.text_frame.clear()


# ── Chrome dispatcher ─────────────────────────────────────────────────────

def _pdraw_chrome_title(slide, chrome: str, year_label: str) -> None:
    """Header for the title / summary slide."""
    dist_band = _ASSETS / "ngo-report-district-band.png"
    if chrome == "template" and dist_band.exists():
        slide.shapes.add_picture(str(dist_band), 0, 0,
                                 width=_pin(_PCW), height=_pin(_PCH))
        # Kicker + title over the band
        kb = slide.shapes.add_textbox(_pin(_PMX), _pin(52), _pin(1200), _pin(40))
        kb.text_frame.text = f"Rotary Club of Discovery Bay · District 3450"
        kb.text_frame.paragraphs[0].font.size = PptxPt(_ppt(24))
        kb.text_frame.paragraphs[0].font.bold = True
        kb.text_frame.paragraphs[0].font.color.rgb = _prgb(_PPTX_BAND_GOLD)
        tb = slide.shapes.add_textbox(_pin(_PMX), _pin(80), _pin(1300), _pin(90))
        tb.text_frame.word_wrap = True
        tb.text_frame.text = "Annual Project Services Report"
        tb.text_frame.paragraphs[0].font.size = PptxPt(_ppt(46))
        tb.text_frame.paragraphs[0].font.bold = True
        tb.text_frame.paragraphs[0].font.color.rgb = _prgb("#FFFFFF")
    else:
        _pdraw_plain_header(slide, year_label, "ANNUAL PROJECT SERVICES REPORT")


def _pdraw_chrome_section(slide, chrome: str, year_label: str, section_name: str) -> None:
    """Header for classification / section slides."""
    dist_band = _ASSETS / "ngo-report-district-band.png"
    if chrome == "template" and dist_band.exists():
        slide.shapes.add_picture(str(dist_band), 0, 0,
                                 width=_pin(_PCW), height=_pin(_PCH))
        kb = slide.shapes.add_textbox(_pin(_PMX), _pin(52), _pin(1200), _pin(40))
        kb.text_frame.text = f"Rotary Year {year_label}"
        kb.text_frame.paragraphs[0].font.size = PptxPt(_ppt(24))
        kb.text_frame.paragraphs[0].font.bold = True
        kb.text_frame.paragraphs[0].font.color.rgb = _prgb(_PPTX_BAND_GOLD)
        tb = slide.shapes.add_textbox(_pin(_PMX), _pin(80), _pin(1300), _pin(90))
        tb.text_frame.word_wrap = True
        tb.text_frame.text = section_name
        tb.text_frame.paragraphs[0].font.size = PptxPt(_ppt(46))
        tb.text_frame.paragraphs[0].font.bold = True
        tb.text_frame.paragraphs[0].font.color.rgb = _prgb("#FFFFFF")
    else:
        _pdraw_slim_plain_header(slide, year_label, section_name)


# ── Title / summary slide ─────────────────────────────────────────────────

def _padd_title_slide(
    prs: PptxPresentation,
    blank,
    rows: list[dict],
    ordered: list,
    year_label: str,
    chrome: str,
) -> None:
    """Slide 1: chrome + four summary stat cards + footnote."""
    slide = prs.slides.add_slide(blank)
    _pdraw_chrome_title(slide, chrome, year_label)

    total_actual   = sum(r.get("actual_hkd", 0.0)  for r in rows)
    total_planned  = sum(r.get("planned_hkd", 0.0) for r in rows)
    total_hours    = sum(r.get("actual_hours", 0.0) for r in rows)
    org_count      = len(rows)
    area_count     = len({r.get("classification") or "Unclassified" for r in rows})

    stat_cards = [
        {
            "kicker": "Donated",
            "figure": f"{total_actual:,.0f}",
            "unit": "HKD",
            "label": "Total donated to date",
            "show": total_actual > 0,
        },
        {
            "kicker": "Planned",
            "figure": f"{total_planned:,.0f}",
            "unit": "HKD",
            "label": "Planned donations",
            "show": total_planned > 0,
        },
        {
            "kicker": "Reach",
            "figure": str(org_count),
            "unit": "",
            "label": "Organisations supported",
            "show": True,
        },
        {
            "kicker": "Areas",
            "figure": str(area_count),
            "unit": "of focus",
            "label": "Areas of focus covered",
            "show": True,
        },
    ]
    cards = [c for c in stat_cards if c["show"]]
    cols  = len(cards) or 1

    row_left = _pin(_PMX)
    row_top  = _pin(352)
    row_w    = _pin(_PCWW)
    row_h    = _pin(392)
    gap      = _pin(28)
    card_w   = int((row_w - gap * (cols - 1)) / cols) if cols > 1 else row_w

    for i, card in enumerate(cards):
        left = row_left + i * (card_w + gap)

        bg = slide.shapes.add_shape(PptxMSO.ROUNDED_RECTANGLE, left, row_top, card_w, row_h)
        bg.fill.solid(); bg.fill.fore_color.rgb = _prgb("#FBFAF9")
        bg.line.color.rgb = _prgb(_PPTX_CARD_BR); bg.line.width = PptxPt(1.5)
        bg.shadow.inherit = False; bg.text_frame.clear()

        bar = slide.shapes.add_shape(PptxMSO.RECTANGLE, left, row_top, card_w, _pin(8))
        bar.fill.solid(); bar.fill.fore_color.rgb = _prgb(_PPTX_GREEN)
        bar.line.fill.background(); bar.shadow.inherit = False; bar.text_frame.clear()

        pad_x, pad_top = _pin(28), _pin(40)

        kb = slide.shapes.add_textbox(left + pad_x, row_top + pad_top, card_w - 2 * pad_x, _pin(40))
        kb.text_frame.text = card["kicker"]
        kb.text_frame.paragraphs[0].font.size = PptxPt(_ppt(24))
        kb.text_frame.paragraphs[0].font.bold = True
        kb.text_frame.paragraphs[0].font.color.rgb = _prgb(_PPTX_GREEN)

        fb = slide.shapes.add_textbox(
            left + pad_x, row_top + pad_top + _pin(56), card_w - 2 * pad_x, _pin(110)
        )
        fb.text_frame.word_wrap = True
        fb.text_frame.text = card["figure"]
        fb.text_frame.paragraphs[0].font.size = PptxPt(_ppt(84))
        fb.text_frame.paragraphs[0].font.bold = True
        fb.text_frame.paragraphs[0].font.color.rgb = _prgb(_PPTX_BLUE)
        if card["unit"]:
            ur = fb.text_frame.paragraphs[0].add_run()
            ur.text = f"  {card['unit']}"
            ur.font.size = PptxPt(_ppt(32))
            ur.font.bold = True
            ur.font.color.rgb = _prgb(_PPTX_GREEN)

        lb = slide.shapes.add_textbox(
            left + pad_x, row_top + row_h - _pin(70), card_w - 2 * pad_x, _pin(50)
        )
        lb.text_frame.word_wrap = True
        lb.text_frame.text = card["label"]
        lb.text_frame.paragraphs[0].font.size = PptxPt(_ppt(26))
        lb.text_frame.paragraphs[0].font.color.rgb = _prgb(_PPTX_GREY)

    fn_text = (
        f"{org_count} organisation{'s' if org_count != 1 else ''} supported "
        f"across {area_count} area{'s' if area_count != 1 else ''} of focus"
        f" · Rotary Year {year_label}"
    )
    fnb = slide.shapes.add_textbox(_pin(_PMX), _pin(944), _pin(_PCWW), _pin(90))
    fnb.text_frame.word_wrap = True
    fnb.text_frame.text = fn_text
    fnb.text_frame.paragraphs[0].font.size = PptxPt(_ppt(27))
    fnb.text_frame.paragraphs[0].font.color.rgb = _prgb("#3A3D3A")


# ── Classification section slide ──────────────────────────────────────────

def _padd_section_slide(
    prs: PptxPresentation,
    blank,
    section_name: str,
    page_rows: list[dict],
    page_num: int,
    total_pages: int,
    year_label: str,
    chrome: str,
) -> None:
    """One classification slide: grey section box + gradient header + 3-col card grid."""
    from app.core.report_images import pptx_safe_image

    slide = prs.slides.add_slide(blank)
    sect_label = section_name
    if total_pages > 1:
        sect_label += f" ({page_num}/{total_pages})"
    _pdraw_chrome_section(slide, chrome, year_label, sect_label)

    # ── Grey section background box (full content width, rounded) ─────────────
    BOX_H   = _PCH - _PCONTENT_TOP - 12   # = 864 px
    sect_bg = slide.shapes.add_shape(
        PptxMSO.ROUNDED_RECTANGLE,
        _pin(_PSECT_BOX_X), _pin(_PCONTENT_TOP),
        _pin(_PSECT_BOX_W), _pin(BOX_H),
    )
    sect_bg.fill.solid()
    sect_bg.fill.fore_color.rgb = _prgb("#F1F5F9")
    sect_bg.line.fill.background()
    sect_bg.shadow.inherit = False
    sect_bg.text_frame.clear()

    # ── Dark section header band (at top of box) ───────────────────────────────
    sect_hex = _psect_color(section_name)
    hdr_band = slide.shapes.add_shape(
        PptxMSO.ROUNDED_RECTANGLE,
        _pin(_PSECT_BOX_X), _pin(_PCONTENT_TOP),
        _pin(_PSECT_BOX_W), _pin(_PSECT_H + 10),   # extra height so only top corners round
    )
    hdr_band.fill.solid()
    hdr_band.fill.fore_color.rgb = _prgb(sect_hex)
    hdr_band.line.fill.background()
    hdr_band.shadow.inherit = False
    hdr_band.text_frame.clear()

    # Section icon inside header band
    ICON_SZ   = 30
    icon_file = _SECTION_ICON_FILES.get(section_name, "icon_others.png")
    icon_path = _ASSETS / icon_file
    icon_y    = _PCONTENT_TOP + (_PSECT_H - ICON_SZ) // 2
    if icon_path.exists():
        try:
            slide.shapes.add_picture(
                str(icon_path),
                _pin(_PSECT_BOX_X + 14), _pin(icon_y),
                width=_pin(ICON_SZ), height=_pin(ICON_SZ),
            )
        except Exception:
            pass

    # Section name (white bold, vertically centred in header band)
    lbl    = slide.shapes.add_textbox(
        _pin(_PSECT_BOX_X + 52), _pin(_PCONTENT_TOP),
        _pin(_PSECT_BOX_W - 56), _pin(_PSECT_H),
    )
    lbl_tf = lbl.text_frame
    lbl_tf.word_wrap = False
    lbl_tf.vertical_anchor = PptxMSOAnchor.MIDDLE
    lbl_p  = lbl_tf.paragraphs[0]
    lbl_p.font.size  = PptxPt(_ppt(30))
    lbl_p.font.bold  = True
    lbl_p.font.color.rgb = _prgb("#FFFFFF")
    lbl_p.text = section_name

    # ── Card grid (inside box, below header band) ──────────────────────────────
    CARDS_TOP = _PCONTENT_TOP + _PSECT_H + 10   # px from slide top

    for idx, row in enumerate(page_rows):
        col  = idx % _PCOLS
        grow = idx // _PCOLS
        left = _pin(_PSECT_BOX_X + _PCARD_INS + col * (_PCARD_W + _PCOL_GAP))
        top  = _pin(CARDS_TOP + grow * (_PCARD_H + _PROW_GAP))
        _padd_org_card(slide, row, section_name, left, top,
                       _pin(_PCARD_W), _pin(_PCARD_H), pptx_safe_image)


# ── NGO card ──────────────────────────────────────────────────────────────

def _padd_org_card(slide, row: dict, section_name: str,
                   left, top, width, height, pptx_safe_image) -> None:
    """Draw one NGO card: white rounded bg, light-colour strip, logo, name,
    amount right-aligned, pills, description — matching the PDF card layout."""
    light_hex = _PPTX_SECTION_LIGHT.get(section_name, "#17458F")

    # ── Card background (white rounded rect with border) ──────────────────
    bg = slide.shapes.add_shape(PptxMSO.ROUNDED_RECTANGLE, left, top, width, height)
    bg.fill.solid(); bg.fill.fore_color.rgb = _prgb(_PPTX_CARD_BG)
    bg.line.color.rgb = _prgb(_PPTX_CARD_BR); bg.line.width = PptxPt(1.0)
    bg.shadow.inherit = False; bg.text_frame.clear()

    # ── Left colour strip (light accent, 6 px wide) ───────────────────────
    STRIP_W = 6
    strip = slide.shapes.add_shape(PptxMSO.RECTANGLE, left, top, _pin(STRIP_W), height)
    strip.fill.solid(); strip.fill.fore_color.rgb = _prgb(light_hex)
    strip.line.fill.background(); strip.shadow.inherit = False; strip.text_frame.clear()

    # ── Inner layout constants (px, relative to card top-left) ────────────
    INNER_L  = STRIP_W + 10   # = 16 px  (after strip + gap)
    INNER_T  = 12              # top pad
    INNER_R  = 12              # right pad
    LOGO_SZ  = 40              # logo / section-icon bounding box
    # Right edge of card content area (px from card left)
    content_r = _PCARD_W - INNER_R

    # ── Org logo (or fallback classification icon) ────────────────────────
    logo_src   = None
    logo_bytes = row.get("logo_bytes")
    if logo_bytes is not None:
        safe = pptx_safe_image(logo_bytes)
        if safe is not None:
            logo_src = safe

    if logo_src is None:
        icon_fname = _SECTION_ICON_FILES.get(section_name, "icon_others.png")
        icon_fpath = _ASSETS / icon_fname
        if icon_fpath.exists():
            logo_src = str(icon_fpath)

    logo_placed = False
    if logo_src is not None:
        try:
            slide.shapes.add_picture(
                logo_src,
                left + _pin(INNER_L),
                top  + _pin(INNER_T),
                width=_pin(LOGO_SZ), height=_pin(LOGO_SZ),
            )
            logo_placed = True
        except Exception:
            pass

    name_l_px = INNER_L + (LOGO_SZ + 8 if logo_placed else 0)

    # Amount box width reserved on the right of the name row
    AMT_W = 190   # px — enough for "HK$999,999" at 12pt bold

    # Name occupies the space between logo and amount column
    name_w_px = max(content_r - name_l_px - AMT_W - 8, 60)

    # ── Org name (bold, 2-line wrap) ──────────────────────────────────────
    nb = slide.shapes.add_textbox(
        left + _pin(name_l_px), top + _pin(INNER_T),
        _pin(name_w_px), _pin(46),
    )
    nb.text_frame.word_wrap = True
    nb.text_frame.text = row.get("name", "")
    nb_p = nb.text_frame.paragraphs[0]
    nb_p.font.size  = PptxPt(_ppt(24))
    nb_p.font.bold  = True
    nb_p.font.color.rgb = _prgb(_PPTX_INK)

    # ── Amount (right-aligned, same top row as name) ───────────────────────
    amount = _display_amount(row)
    if amount:
        ab = slide.shapes.add_textbox(
            left + _pin(content_r - AMT_W), top + _pin(INNER_T),
            _pin(AMT_W), _pin(32),
        )
        ab_tf = ab.text_frame
        ab_tf.word_wrap = False
        ab_p = ab_tf.paragraphs[0]
        ab_p.text       = amount
        ab_p.alignment  = PptxPP.RIGHT
        ab_p.font.size  = PptxPt(_ppt(24))
        ab_p.font.bold  = True
        ab_p.font.color.rgb = _prgb(_PPTX_AMT_GOLD)

    # ── Pills row (below name/logo zone) ──────────────────────────────────
    PILL_H_PX = 22
    pill_y_px = INNER_T + 54
    pill_x_px = INNER_L

    fmt_pill, status_pill, scope_label, scope_key = _derive_pills(row)
    for label, style_key in [
        (scope_label, scope_key),
        (fmt_pill,    fmt_pill),
        (status_pill, status_pill),
    ]:
        bg_hex, fg_hex = _PILL_STYLE.get(style_key, ("#E5E7EB", "#374151"))
        pw = _ppill_w(label)

        pr = slide.shapes.add_shape(
            PptxMSO.ROUNDED_RECTANGLE,
            left + _pin(pill_x_px), top + _pin(pill_y_px),
            _pin(pw), _pin(PILL_H_PX),
        )
        pr.fill.solid(); pr.fill.fore_color.rgb = _prgb(bg_hex)
        pr.line.fill.background(); pr.shadow.inherit = False
        try:
            pr.adjustments[0] = 50000   # maximum corner radius → pill shape
        except Exception:
            pass

        pt_b = slide.shapes.add_textbox(
            left + _pin(pill_x_px), top + _pin(pill_y_px),
            _pin(pw), _pin(PILL_H_PX),
        )
        pt_tf = pt_b.text_frame
        pt_tf.word_wrap = False
        pt_tf.vertical_anchor = PptxMSOAnchor.MIDDLE
        pt_p = pt_tf.paragraphs[0]
        pt_p.text      = label
        pt_p.alignment = PptxPP.CENTER
        pt_p.font.size = PptxPt(_ppt(15))
        pt_p.font.bold = True
        pt_p.font.color.rgb = _prgb(fg_hex)

        pill_x_px += pw + 6

    # ── Description (muted, wraps to fill remaining card height) ──────────
    desc = (row.get("description") or "").strip()
    if desc:
        desc_y = pill_y_px + PILL_H_PX + 8
        db = slide.shapes.add_textbox(
            left + _pin(INNER_L), top + _pin(desc_y),
            _pin(content_r - INNER_L), _pin(_PCARD_H - desc_y - INNER_R),
        )
        db.text_frame.word_wrap = True
        db.text_frame.text      = desc
        db_p = db.text_frame.paragraphs[0]
        db_p.font.size  = PptxPt(_ppt(17))
        db_p.font.color.rgb = _prgb(_PPTX_GREY)


# ── Public API ────────────────────────────────────────────────────────────

def build_project_services_pptx(
    rows: list[dict],
    year: int,
    chrome: str = "plain",
) -> bytes:
    """Build the landscape 16:9 PPTX Project Services deck.

    ``rows`` — same list-of-dicts as build_project_services_pdf.
    ``chrome`` — "plain" (green band + club logo) or "template" (District band PNG).
    """
    year_label = f"{year}–{year + 1}"

    by_section: dict[str, list[dict]] = {}
    for row in rows:
        sec = row.get("classification") or "Unclassified"
        by_section.setdefault(sec, []).append(row)

    def _sec_key(name: str) -> int:
        try:
            return _SECTION_ORDER.index(name)
        except ValueError:
            return len(_SECTION_ORDER)

    ordered = sorted(by_section.items(), key=lambda kv: _sec_key(kv[0]))
    for _, sec_rows in ordered:
        sec_rows.sort(key=lambda r: (r.get("name") or "").lower())

    prs = PptxPresentation()
    prs.slide_width  = PptxIn(13.333)
    prs.slide_height = PptxIn(7.5)
    blank = prs.slide_layouts[6]

    _padd_title_slide(prs, blank, rows, ordered, year_label, chrome)

    for section_name, sec_rows in ordered:
        pages = [sec_rows[i : i + _PCARDS_SLIDE] for i in range(0, len(sec_rows), _PCARDS_SLIDE)]
        for pi, page_rows in enumerate(pages):
            _padd_section_slide(
                prs, blank,
                section_name, page_rows,
                pi + 1, len(pages),
                year_label, chrome,
            )

    buf = BytesIO()
    prs.save(buf)
    return buf.getvalue()
