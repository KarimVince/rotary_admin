"""Project Services Report — A4 portrait PDF.

Generates the "Annual Project Services Report" — one card per NGO active in the
selected year, grouped by NGO classification, with local/international scope,
format (donation/volunteer/both) and status (planned/completed/ongoing) pills
derived from the year's actual donation and service-hour records.

Local = country is "Hong Kong" (case-insensitive); all others are International.
Design mirrors the HTML artifact card layout as closely as reportlab allows.
"""

import math
import textwrap
from io import BytesIO
from pathlib import Path

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
_RI_LOGO   = _ASSETS / "club-logo-lockup.png"
_CLUB_LOGO = _ASSETS / "rotary-logo.png"

# ---------------------------------------------------------------------------
# Layout constants (points)
# ---------------------------------------------------------------------------
LOGO_COL_W     = 105
LOGO_MAX_H     = 45          # max logo height — logos live in the club-identity zone only
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
    row_h      = NAME_SIZE              # single combined row height
    gap        = 5 if n else 0
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

    # ── Club-identity zone (LOGO_ZONE_H tall): logos + club name + district ──
    # Logos are centred WITHIN this zone only → same vertical centre as the text.
    _draw_logo(c, _RI_LOGO,   MARGIN,                        LOGO_COL_W,
               top, LOGO_ZONE_H, LOGO_MAX_H)
    _draw_logo(c, _CLUB_LOGO, PAGE_W - MARGIN - LOGO_COL_W, LOGO_COL_W,
               top, LOGO_ZONE_H, LOGO_MAX_H)

    cx = PAGE_W / 2
    # Text baseline positions tuned so the visual text-block centre ≈ logo centre
    # (logo centre = top + LOGO_ZONE_H/2 = top+29; text block centre ≈ top+27)
    c.setFont(FONT_DISPLAY, 22); c.setFillColor(ROTARY_BLUE)
    c.drawCentredString(cx, _py(top + 35), CLUB_NAME.upper())

    c.setFont("Helvetica", 9); c.setFillColor(MUTED)
    c.drawCentredString(cx, _py(top + 49), "District 3450")

    # Gold separator between the two zones
    c.setFillColor(GOLD)
    c.rect(cx - 28, _py(top + LOGO_ZONE_H - 1), 56, 2, fill=1, stroke=0)

    # ── Report-title zone (below club-identity zone) ───────────────────────────
    ry = top + LOGO_ZONE_H + 7   # y_from_top for first report text line
    c.setFont(FONT_DISPLAY, 14); c.setFillColor(TEXT_DARK)
    c.drawCentredString(cx, _py(ry + 13), "ANNUAL PROJECT SERVICES REPORT")

    c.setFont("Helvetica", 8.5); c.setFillColor(MUTED)
    c.drawCentredString(cx, _py(ry + 25), f"Rotary Year {year_label}")

    # ── Bottom rule ───────────────────────────────────────────────────────────
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
        cy = _draw_card(c, row, cy, light_col)

    return y_from_top + total_h + SECTION_GAP


def _draw_card(
    c: rl_canvas.Canvas,
    row: dict,
    y_from_top: float,
    strip_color: HexColor,
) -> float:
    """Draw one compact project card matching the HTML template layout.

    Card layout:
      [strip] | Name (bold, left)   HK$X,XXX [Donation] [Planned] [Local]
              | Description text (optional, muted, below)
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
    row_y   = y_from_top + CARD_PAD_V     # y_from_top of the text baseline area
    # Vertical centre of the row (for pills alignment)
    row_mid = row_y + NAME_SIZE / 2       # mid-height of the name text block

    # ── Derive content ────────────────────────────────────────────────────────
    fmt_pill, status_pill, scope_label, scope_key = _derive_pills(row)
    amount_str = _display_amount(row)
    # pills as (display_label, style_key) pairs
    pill_items = [
        (fmt_pill,    fmt_pill),
        (status_pill, status_pill),
        (scope_label, scope_key),    # show country name, colour by local/intl
    ]

    # ── Calculate right-group width so we can truncate the name ──────────────
    rg_w = 0.0
    if amount_str:
        rg_w += c.stringWidth(amount_str, FONT_DISPLAY, AMOUNT_SIZE) + PILL_GAP
    for label, _ in pill_items:
        rg_w += c.stringWidth(label, "Helvetica-Bold", PILL_SIZE) + 2 * PILL_PAD_X + PILL_GAP
    if rg_w > 0:
        rg_w -= PILL_GAP

    name_max_w = iright - ix - (NAME_PILL_GAP + rg_w if rg_w else 0)

    name = row.get("name", "")
    c.setFont(FONT_DISPLAY, NAME_SIZE)
    while name and c.stringWidth(name, FONT_DISPLAY, NAME_SIZE) > name_max_w:
        name = name[:-1]
    if name != row.get("name", ""):
        name = name.rstrip() + "…"

    c.setFillColor(TEXT_DARK)
    c.drawString(ix, _py(row_y + NAME_SIZE), name)

    # ── Right group: amount chip then pills — right-aligned ───────────────────
    rx = iright - rg_w    # start of right group

    if amount_str:
        c.setFont(FONT_DISPLAY, AMOUNT_SIZE)
        c.setFillColor(GOLD)
        c.drawString(rx, _py(row_y + AMOUNT_SIZE), amount_str)
        rx += c.stringWidth(amount_str, FONT_DISPLAY, AMOUNT_SIZE) + PILL_GAP

    # Pills centred vertically in the name row height
    for label, sk in pill_items:
        rx = _pill(c, rx, row_mid, label, style_key=sk)

    # ── Description (if any) — below the top row ──────────────────────────────
    desc_lines = _wrap_desc(row.get("description"))
    if desc_lines:
        iy = row_y + NAME_SIZE + 5
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
