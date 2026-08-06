"""Story 8.3 (fillable AcroForm PDF), redesigned in Story 15.5 to match the
branded report header/typography (Story 15.2), and redesigned again per the
"Minimal" restyle handoff's Step 4 (design_handoff_minimal_restyle/STEP-4-
application-pdf.md + Membership Application Form.html): A4, six numbered
sections, accent-tinted field boxes, a club-rules panel with numbered
circles, and page footers. Content/wording (fields + the three club rules)
is transcribed verbatim from the club's Word template per that handoff.

Still built with reportlab's low-level Canvas + AcroForm API (not the
platypus flowables `dinner_forecast_report.py`/`statistics_report.py` use),
because AcroForm interactive text fields require the low-level API. The
signature box is the one deliberate exception — it must be a plain drawn
box, not an interactive AcroForm field (existing behavior, unchanged), but
is sized generously enough to fit a pasted/stamped digital signature.

Font: the reference design specifies Archivo (Google Fonts), but no TTF is
bundled in this repo and there's no network access at render time to fetch
one — falls back to Helvetica (reportlab's built-in standard font), which is
visually a close humanist-sans match. Colors/layout otherwise follow the
reference exactly.

Name split: the Application intake form (MembersList.jsx's Application
modal / MemberApplicationCreate schema) only ever collects a single
free-text `name` — there's no real first/last split to prefill from. To
still match the reference's separate First/Last name boxes, the prefill
value is split on the first space (`"Jane Doe"` → first="Jane",
last="Doe"); a name with no space prefills First only. It's a best-effort
split, not authoritative — same spirit as the app's existing "applicant
fills in/corrects everything else by hand" model.
"""

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from app.core.dinner_forecast_report import INTL_LOGO_PATH
from app.core.statistics_report import CLUB_NAME, LOGO_PATH


def _wrap_text(text: str, font: str, size: float, max_width: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if stringWidth(candidate, font, size) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines

# ── Palette (Step-1 tokens, same as the whole Minimal restyle) ─────────────
ACCENT = "#1a5fb4"
ACCENT_INK = "#124a90"
ACCENT_SOFT = "#e7f0fb"
ACCENT_SOFTER = "#f3f8fe"
GOLD_INK = "#a9700c"
INK = "#141b2b"
INK_2 = "#3a4557"
MUTED = "#727c8c"
FAINT = "#9aa3b2"
LINE = "#e9ecf2"
LINE_STRONG = "#c3cad6"
BOX_BOTTOM_BORDER = "#d4d9e3"

PAGE_W, PAGE_H = A4
MARGIN_X = 0.56 * inch
MARGIN_TOP = 0.5 * inch
MARGIN_BOTTOM = 0.45 * inch
CONTENT_RIGHT = PAGE_W - MARGIN_X

FIELD_H = 0.27 * inch
FIELD_H_TALL = 0.54 * inch
LABEL_SIZE = 7.5
FIELD_FONT_SIZE = 9
ROW_GAP = 0.09 * inch  # vertical gap between a field's label/box and the next row
COL_GAP = 0.22 * inch

# (internal AcroForm field name, visible label, prefill key or None)
Field = tuple[str, str, str | None]


def _hex(value: str) -> colors.Color:
    return colors.HexColor(value)


def _draw_masthead(c: canvas.Canvas) -> float:
    top = PAGE_H - MARGIN_TOP
    logo_h = 0.5 * inch

    if LOGO_PATH.exists():
        c.drawImage(
            str(LOGO_PATH), MARGIN_X, top - logo_h, height=logo_h, width=logo_h * 1.6,
            preserveAspectRatio=True, mask="auto", anchor="sw",
        )
    if INTL_LOGO_PATH.exists():
        word_w = logo_h * 2.6
        c.drawImage(
            str(INTL_LOGO_PATH), CONTENT_RIGHT - word_w, top - logo_h,
            width=word_w, height=logo_h, preserveAspectRatio=True, mask="auto", anchor="se",
        )

    c.setFont("Helvetica-Bold", 7.5)
    c.setFillColor(_hex(GOLD_INK))
    c.drawCentredString(PAGE_W / 2, top - 0.18 * inch, "ROTARY CLUB OF DISCOVERY BAY")
    c.setFont("Helvetica-Bold", 15)
    c.setFillColor(_hex(ACCENT_INK))
    c.drawCentredString(PAGE_W / 2, top - 0.38 * inch, "Membership Application Form")

    rule_y = top - logo_h - 0.12 * inch
    c.setStrokeColor(_hex(ACCENT))
    c.setLineWidth(2)
    c.line(MARGIN_X, rule_y, CONTENT_RIGHT, rule_y)
    return rule_y


def _draw_intro(c: canvas.Canvas, y: float) -> float:
    font, size = "Helvetica", 8.5
    c.setFont(font, size)
    c.setFillColor(_hex(MUTED))
    text = (
        "Please complete every field below in block capitals, sign at the end, and return "
        "the form to the Club Secretary. Your details will be reviewed by the Board ahead "
        "of your induction."
    )
    max_width = CONTENT_RIGHT - MARGIN_X
    lines = _wrap_text(text, font, size, max_width)
    y -= 0.22 * inch
    line_h = 0.14 * inch
    for line in lines:
        c.drawString(MARGIN_X, y, line)
        y -= line_h
    return y - 0.22 * inch


def _draw_section_header(c: canvas.Canvas, number: int, title: str, y: float) -> float:
    y -= 0.34 * inch
    chip_r = 0.09 * inch
    chip_cy = y + 0.03 * inch
    c.setFillColor(_hex(ACCENT_SOFT))
    c.circle(MARGIN_X + chip_r, chip_cy, chip_r, stroke=0, fill=1)
    c.setFillColor(_hex(ACCENT_INK))
    c.setFont("Helvetica-Bold", 7.5)
    c.drawCentredString(MARGIN_X + chip_r, chip_cy - 2.6, str(number))

    label_x = MARGIN_X + 2 * chip_r + 0.09 * inch
    c.setFont("Helvetica-Bold", 9.5)
    c.setFillColor(_hex(INK))
    c.drawString(label_x, y, title.upper())

    rule_x = label_x + c.stringWidth(title.upper(), "Helvetica-Bold", 9.5) + 0.14 * inch
    c.setStrokeColor(_hex(LINE))
    c.setLineWidth(1)
    c.line(rule_x, chip_cy, CONTENT_RIGHT, chip_cy)
    return y - 0.17 * inch


def _field_box(
    c: canvas.Canvas,
    x: float,
    y_top: float,
    width: float,
    field: Field,
    prefill: dict[str, str],
    tall: bool = False,
    note: bool = False,
    hint: str | None = None,
) -> None:
    name, label, prefill_key = field
    height = FIELD_H_TALL if tall else FIELD_H

    c.setFont("Helvetica-Bold", LABEL_SIZE)
    c.setFillColor(_hex(FAINT))
    c.drawString(x, y_top, label.upper())

    box_top = y_top - 0.06 * inch
    box_y = box_top - height
    fill_color = colors.white if note else _hex(ACCENT_SOFTER)
    c.acroForm.textfield(
        name=name,
        tooltip=label,
        x=x,
        y=box_y,
        width=width,
        height=height,
        value=prefill.get(prefill_key, "") if prefill_key else "",
        fillColor=fill_color,
        borderColor=_hex(LINE),
        borderWidth=1,
        borderStyle="solid",
        fontName="Helvetica",
        fontSize=FIELD_FONT_SIZE,
    )
    # AcroForm boxes are plain rectangles (no border-radius support) — the
    # slightly darker bottom edge from the reference is approximated with a
    # second, heavier bottom line so the box still reads as "grounded".
    c.setStrokeColor(_hex(BOX_BOTTOM_BORDER))
    c.setLineWidth(1.2)
    c.line(x, box_y, x + width, box_y)

    if hint:
        c.setFont("Helvetica", 6.5)
        c.setFillColor(_hex(FAINT))
        c.drawString(x, box_y - 0.11 * inch, hint)


def _grid_row(
    c: canvas.Canvas,
    fields: list[Field],
    prefill: dict[str, str],
    y: float,
    col_widths: list[float] | None = None,
    tall: bool = False,
) -> float:
    content_width = CONTENT_RIGHT - MARGIN_X
    n = len(fields)
    if col_widths is None:
        col_width = (content_width - COL_GAP * (n - 1)) / n
        col_widths = [col_width] * n

    x = MARGIN_X
    for field, width in zip(fields, col_widths):
        _field_box(c, x, y, width, field, prefill, tall=tall)
        x += width + COL_GAP

    height = FIELD_H_TALL if tall else FIELD_H
    return y - 0.06 * inch - height - ROW_GAP - 0.08 * inch


def _footer(c: canvas.Canvas, page_number: int, total_pages: int = 2) -> None:
    y = MARGIN_BOTTOM
    c.setStrokeColor(_hex(LINE))
    c.setLineWidth(1)
    c.line(MARGIN_X, y + 0.16 * inch, CONTENT_RIGHT, y + 0.16 * inch)
    c.setFont("Helvetica", 7)
    c.setFillColor(_hex(FAINT))
    c.drawString(MARGIN_X, y, f"{CLUB_NAME} · Membership Application")
    c.drawRightString(CONTENT_RIGHT, y, f"Page {page_number} of {total_pages}")


CLUB_RULES: list[str] = [
    "Pay the annual membership fees in a timely manner, before the start of the new Rotary "
    "year (1st of July), upon receipt of the invoice sent by the Club Treasurer.",
    "Support the club's main annual fundraising initiative by purchasing 2 Annual Ball "
    "tickets (or any other main annual event decided by the President) and attending. If "
    "unable to attend, the tickets will be re-allocated by the Club's Board to another "
    "person in the best interest of the club.",
    "Aim to join regular club dinners and meetings as often as possible, monthly. If a "
    "dinner participation is cancelled within 48 hours before the event, the full dinner "
    "fees will be due to the club.",
]


def _draw_rules_panel(c: canvas.Canvas, y: float) -> float:
    panel_x = MARGIN_X
    panel_w = CONTENT_RIGHT - MARGIN_X
    pad = 0.16 * inch

    # Pre-wrap each rule so the panel height (and therefore its top y) is
    # known before drawing the background rect.
    text_indent = 0.26 * inch
    text_width = panel_w - 2 * pad - text_indent
    wrapped_rules = [_wrap_text(rule, "Helvetica", 8.5, text_width) for rule in CLUB_RULES]

    heading_h = 0.2 * inch
    line_h = 0.145 * inch
    item_gap = 0.09 * inch
    body_h = sum(len(lines) * line_h + item_gap for lines in wrapped_rules) - item_gap
    panel_h = pad * 2 + heading_h + body_h

    panel_top = y
    panel_bottom = panel_top - panel_h
    c.setFillColor(_hex(ACCENT_SOFTER))
    c.setStrokeColor(_hex(LINE))
    c.setLineWidth(1)
    c.roundRect(panel_x, panel_bottom, panel_w, panel_h, 6, stroke=1, fill=1)

    text_y = panel_top - pad - 0.09 * inch
    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(_hex(ACCENT_INK))
    c.drawString(panel_x + pad, text_y, "ON JOINING, THE MEMBER COMMITS TO:")
    text_y -= heading_h

    for index, lines in enumerate(wrapped_rules, start=1):
        circle_r = 0.085 * inch
        circle_cy = text_y - 0.03 * inch
        c.setFillColor(_hex(ACCENT))
        c.circle(panel_x + pad + circle_r, circle_cy, circle_r, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(panel_x + pad + circle_r, circle_cy - 2.4, str(index))

        c.setFont("Helvetica", 8.5)
        c.setFillColor(_hex(INK_2))
        line_y = text_y
        for line in lines:
            c.drawString(panel_x + pad + text_indent, line_y, line)
            line_y -= line_h
        text_y -= len(lines) * line_h + item_gap

    return panel_bottom - 0.2 * inch


def _draw_declaration(c: canvas.Canvas, y: float) -> None:
    c.setFont("Helvetica", 8.5)
    c.setFillColor(_hex(MUTED))
    c.drawString(
        MARGIN_X, y,
        "I confirm the information provided is accurate and I agree to abide by the "
        "club rules set out above.",
    )
    # Extra clearance below the declaration line so the signature/date row
    # has real room — tall enough for a digital signature (drawn/pasted/
    # stamped by a PDF editor), not just a pen-and-paper underline.
    y -= 0.55 * inch

    sign_width = (CONTENT_RIGHT - MARGIN_X) - 1.8 * inch - COL_GAP
    date_x = MARGIN_X + sign_width + COL_GAP
    # Signature box is double the date field's height — plenty of room for a
    # digital signature — with both boxes sharing the same bottom edge so
    # the row still reads as one aligned line.
    date_h = 0.6 * inch
    sign_h = date_h * 2
    box_top = y
    row_bottom = box_top - sign_h

    # Signature stays a plain drawn box (not an AcroForm field) — it must
    # remain non-interactive (see test_signature_is_not_an_interactive_field)
    # — but sized generously so a scanned/typed/drawn digital signature has
    # room to sit inside it, not just a thin underline.
    c.setFillColor(_hex(ACCENT_SOFTER))
    c.setStrokeColor(_hex(LINE_STRONG))
    c.setLineWidth(1.2)
    c.roundRect(MARGIN_X, row_bottom, sign_width, sign_h, 5, stroke=1, fill=1)
    c.setFont("Helvetica-Bold", LABEL_SIZE)
    c.setFillColor(_hex(FAINT))
    c.drawString(MARGIN_X, row_bottom - 0.16 * inch, "SIGNATURE")

    c.acroForm.textfield(
        name="date",
        tooltip="Date",
        x=date_x,
        y=row_bottom,
        width=1.8 * inch,
        height=date_h,
        value="",
        fillColor=_hex(ACCENT_SOFTER),
        borderColor=_hex(LINE),
        borderWidth=1,
        borderStyle="solid",
        fontName="Helvetica",
        fontSize=FIELD_FONT_SIZE,
    )
    c.setFont("Helvetica-Bold", LABEL_SIZE)
    c.setFillColor(_hex(FAINT))
    c.drawString(date_x, row_bottom - 0.16 * inch, "DATE")


def build_member_application_pdf(name: str, email: str | None, phone: str | None) -> bytes:
    first_name, _, last_name = name.partition(" ")
    prefill = {
        "first_name": first_name,
        "last_name": last_name,
        "email": email or "",
        "phone": phone or "",
    }

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    # ── Page 1: sections 1-4 ───────────────────────────────────────────
    y = _draw_masthead(c)
    y = _draw_intro(c, y)

    y = _draw_section_header(c, 1, "Applicant details", y)
    honorific_w = 0.75 * inch
    name_w = ((CONTENT_RIGHT - MARGIN_X) - honorific_w - 2 * COL_GAP) / 2
    y = _grid_row(
        c,
        [
            ("honorific", "Mr., Ms., Dr., …", None),
            ("first_name", "First name", "first_name"),
            ("last_name", "Last name", "last_name"),
        ],
        prefill, y, col_widths=[honorific_w, name_w, name_w],
    )
    y = _grid_row(
        c,
        [("gender", "Gender", None), ("date_of_birth", "Date of birth", None), ("nationality", "Nationality", None)],
        prefill, y,
    )
    y = _grid_row(c, [("email", "Email", "email"), ("phone", "Mobile", "phone")], prefill, y)
    y = _grid_row(c, [("address", "Home address", None)], prefill, y, tall=True)

    y = _draw_section_header(c, 2, "Professional details", y)
    y = _grid_row(c, [("company_name", "Company name", None), ("profession", "Position", None)], prefill, y)

    y = _draw_section_header(c, 3, "Past Rotary data", y)
    c.setFont("Helvetica", 8)
    c.setFillColor(_hex(MUTED))
    c.drawString(MARGIN_X, y, "If you have previously been a Rotarian, please complete the fields below.")
    y -= 0.19 * inch
    y = _grid_row(
        c,
        [("rotarian_id", "Rotarian ID (RI number)", None), ("rotary_title", "Rotary title (RTN, PP, IPP, …)", None)],
        prefill, y,
    )

    y = _draw_section_header(c, 4, "Membership & classification", y)
    content_width = CONTENT_RIGHT - MARGIN_X
    col_w = (content_width - COL_GAP) / 2
    _field_box(
        c, MARGIN_X, y, col_w,
        ("classification", "Classification / occupational code", None), prefill,
        hint="e.g. Asset management",
    )
    _field_box(c, MARGIN_X + col_w + COL_GAP, y, col_w, ("proposer_name", "Proposer name", None), prefill)
    # Extra clearance below this row (vs. the other grid rows) because the
    # classification field's hint line hangs below its box.
    y = y - 0.06 * inch - FIELD_H - 0.24 * inch
    _field_box(
        c, MARGIN_X, y, content_width,
        ("additional_information", "Additional information (if any)", None), prefill,
        tall=True, note=True,
    )

    _footer(c, 1)
    c.showPage()

    # ── Page 2: sections 5-6 ────────────────────────────────────────────
    y = PAGE_H - MARGIN_TOP - 0.1 * inch
    y = _draw_section_header(c, 5, "Club rules the member agrees to abide by", y)
    y = _draw_rules_panel(c, y)

    y = _draw_section_header(c, 6, "Declaration", y)
    _draw_declaration(c, y)

    _footer(c, 2)
    c.showPage()
    c.save()
    return buf.getvalue()
