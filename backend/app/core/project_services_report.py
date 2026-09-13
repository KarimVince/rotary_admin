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
from pptx.util import Inches as PptxIn, Pt as PptxPt
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
# Chrome (header band + logos) mirrors the NGO statistics PPTX design from
# donation_statistics_report.py so all PPTX reports look consistent.
#
# Geometry: 1920×1080 px canvas at 144 dpi ≡ 13.333"×7.5" (Widescreen 16:9).
# Pixel-to-EMU:  inches = px / 144  →  EMU = PptxIn(px / 144)
# Pixel-to-pt:   points = px / 2
# ---------------------------------------------------------------------------

# ── Colour tokens (matching donation_statistics_report.py NGO PPTX theme) ──
_PPTX_GREEN      = "#375E3A"   # chrome band background / card accent
_PPTX_BLUE       = "#17458F"   # stat figures / amount chip
_PPTX_BAND_GOLD  = "#D9BE86"   # kicker text in chrome band
_PPTX_AMT_GOLD   = "#F7A81B"   # HKD amount foreground
_PPTX_INK        = "#201E1D"   # primary body text
_PPTX_GREY       = "#5B5F5B"   # secondary / description text
_PPTX_CARD_BG    = "#FFFFFF"
_PPTX_CARD_BR    = "#E4E3E0"

# Section header dark-fill colour (left/dark end of the PDF gradient reused
# as a solid fill here — gradient fills in python-pptx require an EMU-level
# XML approach not worth the complexity).
_PPTX_SECTION_COLOR: dict[str, str] = {
    "Education & Literacy":                    "#1a3fa8",
    "Poverty Alleviation & Social Welfare":    "#7C2D12",
    "Health & Medical":                        "#065E7C",
    "Humanitarian Relief & Disaster Response": "#7F1D1D",
    "Youth Development":                       "#3730A3",
    "Others":                                  "#065E7C",
    "Unclassified":                            "#374151",
}

# ── Canvas constants (px) ──────────────────────────────────────────────────
_PCW      = 1920      # slide width
_PCH      = 1080      # slide height
_PMX      = 96        # margin x (left / right)
_PCWW     = 1728      # content width = _PCW - 2*_PMX
_PBAND_H  = 192       # chrome header band height

# ── Section-slide grid ─────────────────────────────────────────────────────
_PSECT_H       = 60   # section header bar height (px)
_PGRID_TOP     = _PBAND_H + 14 + _PSECT_H + 12   # = 278 px from slide top
_PGRID_BOT     = 1050
_PGRID_H       = _PGRID_BOT - _PGRID_TOP          # = 772 px
_PCOLS         = 3
_PCOL_GAP      = 20
_PROW_GAP      = 14
_PCARD_H       = 235    # px per card
_PCARD_W       = (_PCWW - (_PCOLS - 1) * _PCOL_GAP) // _PCOLS  # = 562
_PMAX_ROWS     = (_PGRID_H + _PROW_GAP) // (_PCARD_H + _PROW_GAP)  # = 3
_PCARDS_SLIDE  = _PCOLS * _PMAX_ROWS                               # = 9

# ── Pill approximate widths (px) ───────────────────────────────────────────
# Pre-measured so we can position subsequent pills without font metrics.
_PPILL_W: dict[str, int] = {
    "Local": 56, "International": 90,
    "Donation": 72, "Volunteer": 76, "Don. + Vol.": 92,
    "Planned": 64, "Completed": 80, "Ongoing": 68, "Done": 56,
}


# ── Helpers ────────────────────────────────────────────────────────────────

def _pin(px: float) -> int:
    """Pixels → EMU (1920px ≡ 13.333 in → 144px/in)."""
    return PptxIn(px / 144)


def _ppt(px: float) -> float:
    """Pixels → points (1920px ≡ 960pt → 0.5 pt/px)."""
    return px / 2


def _prgb(hex_color: str) -> PptxRGB:
    return PptxRGB.from_string(hex_color.lstrip("#").upper())


def _ppill_w(label: str) -> int:
    """Pixel width for a pill badge with the given label."""
    return _PPILL_W.get(label, max(len(label) * 6 + 24, 56))


def _psect_color(section_name: str) -> str:
    """Dark hex color for a section header / card strip."""
    return _PPTX_SECTION_COLOR.get(section_name, "#374151")


# ── Chrome (band + logos + kicker/title) ───────────────────────────────────

def _pdraw_chrome(slide, chrome: str, kicker: str, title: str) -> None:
    """Draw the header band + kicker + title on any slide.

    Two chrome variants (matching the NGO stats PPTX):
    - "template": render the District 3450 band PNG as a full-slide background.
    - "plain"   : draw a solid green rectangle + club lockup logo on the right.
    """
    dist_band = _ASSETS / "ngo-report-district-band.png"
    if chrome == "template" and dist_band.exists():
        slide.shapes.add_picture(
            str(dist_band), 0, 0,
            width=_pin(_PCW), height=_pin(_PCH),
        )
    else:
        band = slide.shapes.add_shape(
            PptxMSO.RECTANGLE, 0, 0, _pin(_PCW), _pin(_PBAND_H),
        )
        band.fill.solid()
        band.fill.fore_color.rgb = _prgb(_PPTX_GREEN)
        band.line.fill.background()
        band.shadow.inherit = False
        band.text_frame.clear()

        if _CLUB_LOGO.exists():
            with PILImage.open(_CLUB_LOGO) as im:
                aspect = im.width / im.height
            logo_h = _pin(120)
            logo_w = int(logo_h * aspect)
            slide.shapes.add_picture(
                str(_CLUB_LOGO),
                _pin(1824) - logo_w,
                _pin(96) - logo_h // 2,
                width=logo_w,
                height=logo_h,
            )

    if kicker:
        kb = slide.shapes.add_textbox(_pin(_PMX), _pin(52), _pin(1200), _pin(40))
        kt = kb.text_frame
        kt.text = kicker
        kt.paragraphs[0].font.size = PptxPt(_ppt(24))
        kt.paragraphs[0].font.bold = True
        kt.paragraphs[0].font.color.rgb = _prgb(_PPTX_BAND_GOLD)

    tb = slide.shapes.add_textbox(_pin(_PMX), _pin(80), _pin(1300), _pin(90))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.text = title
    tf.paragraphs[0].font.size = PptxPt(_ppt(46))
    tf.paragraphs[0].font.bold = True
    tf.paragraphs[0].font.color.rgb = _prgb("#FFFFFF")


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
    _pdraw_chrome(
        slide, chrome,
        kicker=f"Rotary Club of Discovery Bay · District 3450",
        title="Annual Project Services Report",
    )

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
    """One classification slide with up to _PCARDS_SLIDE org cards."""
    from app.core.report_images import pptx_safe_image

    slide = prs.slides.add_slide(blank)
    title_str = section_name
    if total_pages > 1:
        title_str += f" ({page_num} of {total_pages})"
    _pdraw_chrome(slide, chrome, kicker=f"Rotary Year {year_label}", title=title_str)

    # ── Section header bar ────────────────────────────────────────────────
    sect_hex  = _psect_color(section_name)
    sh_top    = _pin(_PBAND_H + 14)
    sh_bar    = slide.shapes.add_shape(
        PptxMSO.RECTANGLE, _pin(_PMX), sh_top, _pin(_PCWW), _pin(_PSECT_H),
    )
    sh_bar.fill.solid()
    sh_bar.fill.fore_color.rgb = _prgb(sect_hex)
    sh_bar.line.fill.background()
    sh_bar.shadow.inherit = False
    sh_bar.text_frame.clear()

    # Section icon inside header bar
    icon_file = _SECTION_ICON_FILES.get(section_name, "icon_others.png")
    icon_path = _ASSETS / icon_file
    icon_sz   = _pin(38)
    if icon_path.exists():
        try:
            slide.shapes.add_picture(
                str(icon_path),
                _pin(_PMX + 12),
                sh_top + (_pin(_PSECT_H) - icon_sz) // 2,
                width=icon_sz, height=icon_sz,
            )
        except Exception:
            pass

    # Section name label
    lbl    = slide.shapes.add_textbox(
        _pin(_PMX + 58), sh_top, _pin(_PCWW - 60), _pin(_PSECT_H),
    )
    lbl_tf = lbl.text_frame
    lbl_tf.word_wrap = False
    lbl_tf.vertical_anchor = PptxMSOAnchor.MIDDLE
    lbl_p  = lbl_tf.paragraphs[0]
    lbl_p.font.size  = PptxPt(_ppt(36))
    lbl_p.font.bold  = True
    lbl_p.font.color.rgb = _prgb("#FFFFFF")
    lbl_p.text = section_name

    # ── Card grid ─────────────────────────────────────────────────────────
    for idx, row in enumerate(page_rows):
        col  = idx % _PCOLS
        grow = idx // _PCOLS
        left = _pin(_PMX + col * (_PCARD_W + _PCOL_GAP))
        top  = _pin(_PGRID_TOP + grow * (_PCARD_H + _PROW_GAP))
        _padd_org_card(slide, row, section_name, left, top,
                       _pin(_PCARD_W), _pin(_PCARD_H), pptx_safe_image)


# ── NGO card ──────────────────────────────────────────────────────────────

def _padd_org_card(slide, row: dict, section_name: str,
                   left, top, width, height, pptx_safe_image) -> None:
    """Draw one NGO card: background, left strip, logo, name, amount, pills, description."""
    sect_hex = _psect_color(section_name)

    # Card background (rounded)
    bg = slide.shapes.add_shape(PptxMSO.ROUNDED_RECTANGLE, left, top, width, height)
    bg.fill.solid(); bg.fill.fore_color.rgb = _prgb(_PPTX_CARD_BG)
    bg.line.color.rgb = _prgb(_PPTX_CARD_BR); bg.line.width = PptxPt(1.5)
    bg.shadow.inherit = False; bg.text_frame.clear()

    # Left colour strip (section accent)
    strip = slide.shapes.add_shape(PptxMSO.RECTANGLE, left, top, _pin(8), height)
    strip.fill.solid(); strip.fill.fore_color.rgb = _prgb(sect_hex)
    strip.line.fill.background(); strip.shadow.inherit = False; strip.text_frame.clear()

    # Inner layout constants (all in px, relative to card top-left)
    INNER_L  = 18    # left pad after strip (strip=8px + gap=10px)
    INNER_T  = 12    # top pad
    INNER_R  = 12    # right pad
    LOGO_SZ  = 40    # logo bounding box in px

    content_w_px = _PCARD_W - INNER_L - INNER_R

    # ── Org logo (or fallback classification icon) ────────────────────────
    logo_src = None
    logo_bytes = row.get("logo_bytes")
    if logo_bytes is not None:
        safe = pptx_safe_image(logo_bytes)
        if safe is not None:
            logo_src = safe  # BytesIO → add_picture accepts it directly

    if logo_src is None:
        icon_fname = _SECTION_ICON_FILES.get(section_name, "icon_others.png")
        icon_fpath = _ASSETS / icon_fname
        if icon_fpath.exists():
            logo_src = str(icon_fpath)

    logo_offset_x = 0
    if logo_src is not None:
        logo_sz_emu = _pin(LOGO_SZ)
        try:
            slide.shapes.add_picture(
                logo_src,
                left + _pin(INNER_L),
                top  + _pin(INNER_T),
                width=logo_sz_emu, height=logo_sz_emu,
            )
            logo_offset_x = LOGO_SZ + 8
        except Exception:
            pass

    name_l_px = INNER_L + logo_offset_x
    name_w_px = content_w_px - logo_offset_x

    # ── Org name ─────────────────────────────────────────────────────────
    nb = slide.shapes.add_textbox(
        left + _pin(name_l_px), top + _pin(INNER_T),
        _pin(name_w_px), _pin(46),
    )
    nb.text_frame.word_wrap = True
    nb.text_frame.text = row.get("name", "")
    nb.text_frame.paragraphs[0].font.size = PptxPt(_ppt(26))
    nb.text_frame.paragraphs[0].font.bold = True
    nb.text_frame.paragraphs[0].font.color.rgb = _prgb(_PPTX_INK)

    # ── Amount ────────────────────────────────────────────────────────────
    amount = _display_amount(row)
    amt_y  = INNER_T + 52
    if amount:
        ab = slide.shapes.add_textbox(
            left + _pin(INNER_L), top + _pin(amt_y),
            _pin(content_w_px), _pin(32),
        )
        ab.text_frame.text = amount
        ab.text_frame.paragraphs[0].font.size = PptxPt(_ppt(24))
        ab.text_frame.paragraphs[0].font.bold = True
        ab.text_frame.paragraphs[0].font.color.rgb = _prgb(_PPTX_AMT_GOLD)
        amt_y += 34
    else:
        amt_y += 8

    # ── Pills ─────────────────────────────────────────────────────────────
    fmt_pill, status_pill, scope_label, scope_key = _derive_pills(row)
    pills = [(scope_label, scope_key), (fmt_pill, fmt_pill), (status_pill, status_pill)]
    PILL_H_PX = 22
    pill_y_px = amt_y
    pill_x_px = INNER_L

    for label, style_key in pills:
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
            pr.adjustments[0] = 50000   # maximum corner rounding → pill shape
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
        pt_p.text = label
        pt_p.alignment = PptxPP.CENTER
        pt_p.font.size = PptxPt(_ppt(16))
        pt_p.font.bold = True
        pt_p.font.color.rgb = _prgb(fg_hex)

        pill_x_px += pw + 6

    # ── Description ───────────────────────────────────────────────────────
    desc = (row.get("description") or "").strip()
    if desc:
        desc_y  = pill_y_px + PILL_H_PX + 8
        wrapped = textwrap.wrap(desc, width=80, max_lines=2)
        db = slide.shapes.add_textbox(
            left + _pin(INNER_L), top + _pin(desc_y),
            _pin(content_w_px), _pin(38),
        )
        db.text_frame.word_wrap = True
        db.text_frame.text      = " ".join(wrapped[:2])
        db.text_frame.paragraphs[0].font.size  = PptxPt(_ppt(17))
        db.text_frame.paragraphs[0].font.color.rgb = _prgb(_PPTX_GREY)


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
