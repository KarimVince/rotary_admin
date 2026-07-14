"""Story 8.3 (fillable AcroForm PDF) redesigned in Story 15.5 to match the
branded report header/typography introduced in Story 15.2 (dinner forecast
report): dual logos, title, divider, grouped two-column sections.

Still built with reportlab's low-level Canvas + AcroForm API (not the
platypus flowables `dinner_forecast_report.py`/`statistics_report.py` use),
because AcroForm interactive text fields require the low-level API. The
signature line is the one deliberate exception — Story 15.5 requires it be a
static underline, not an interactive field.
"""

from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

from app.core.dinner_forecast_report import INTL_LOGO_PATH
from app.core.statistics_report import CLUB_NAME, LOGO_PATH, ROTARY_BLUE

# (field name, label, prefill key or None, full_width) — prefill key looks up
# the create-request's name/email/phone; every other field is left blank for
# the applicant to fill in themselves. Spouse and emergency-contact fields
# are deliberately omitted (no such columns exist on Member; see the story's
# own "developer to verify against the schema" note), and the applicant's
# full name stays a single field since MemberApplicationCreate.name is not
# split into first/last — flagged as a deviation in ClickUp rather than
# widening the create-application schema for this story.
SECTIONS: list[tuple[str, list[tuple[str, str, str | None, bool]]]] = [
    (
        "Personal Information",
        [
            ("honorific", "Honorific Title", None, False),
            ("name", "Name", "name", False),
            ("date_of_birth", "Date of Birth", None, False),
            ("gender", "Gender", None, False),
            ("nationality", "Nationality", None, False),
        ],
    ),
    (
        "Contact Details",
        [
            ("email", "Email", "email", False),
            ("phone", "Phone", "phone", False),
            ("address", "Home Address", None, True),
        ],
    ),
    (
        "Professional Details",
        [
            ("profession", "Occupation / Profession", None, False),
            ("company_name", "Company Name", None, False),
            ("classification", "Classification / Occupational Code", None, False),
        ],
    ),
    (
        "Membership Details",
        [
            ("proposer_name", "Sponsoring Member", None, False),
        ],
    ),
    (
        "Additional Notes",
        [
            ("additional_information", "Additional Information", None, True),
        ],
    ),
]

CLUB_RULES_TEXT = [
    "Club rules Member agrees to abide by:",
    "",
    "1. Timely payment of the annual membership fee before 1 July each year.",
    "2. Support of the club's main annual fundraiser, including the purchase of "
    "2 tickets to the Annual Ball.",
    "3. Commitment to attending regular monthly dinners. Cancellations made less "
    "than 48 hours before a dinner are subject to the club's cancellation fee.",
]

_LOGO_SIZE = 0.55 * inch
_FIELD_HEIGHT = 0.22 * inch
_ROW_GAP = 0.34 * inch
_LABEL_FONT_SIZE = 8
_FIELD_FONT_SIZE = 9


def _draw_header(c: canvas.Canvas, page_width: float, page_height: float, margin: float) -> float:
    top = page_height - margin

    if LOGO_PATH.exists():
        c.drawImage(
            str(LOGO_PATH), margin, top - _LOGO_SIZE, width=_LOGO_SIZE, height=_LOGO_SIZE,
            preserveAspectRatio=True, mask="auto",
        )
    if INTL_LOGO_PATH.exists():
        c.drawImage(
            str(INTL_LOGO_PATH), page_width - margin - _LOGO_SIZE, top - _LOGO_SIZE,
            width=_LOGO_SIZE, height=_LOGO_SIZE, preserveAspectRatio=True, mask="auto",
        )

    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(page_width / 2, top - 0.2 * inch, CLUB_NAME)
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(page_width / 2, top - 0.44 * inch, "Member Application Form")
    c.setFont("Helvetica-Oblique", 8.5)
    c.drawCentredString(
        page_width / 2,
        top - 0.62 * inch,
        "Please complete the remaining fields, sign, and return to the club.",
    )

    divider_y = top - max(_LOGO_SIZE, 0.75 * inch) - 0.1 * inch
    c.setStrokeColor(colors.HexColor(ROTARY_BLUE))
    c.setLineWidth(1)
    c.line(margin, divider_y, page_width - margin, divider_y)
    return divider_y - 0.28 * inch


def _draw_section(
    c: canvas.Canvas,
    title: str,
    fields: list[tuple[str, str, str | None, bool]],
    prefill: dict[str, str],
    x_left: float,
    x_right: float,
    col_width: float,
    y: float,
) -> float:
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.HexColor(ROTARY_BLUE))
    c.drawString(x_left, y, title)
    c.setFillColor(colors.black)
    y -= _ROW_GAP * 0.65

    on_left_column = True
    for field_name, label, prefill_key, full_width in fields:
        x = x_left if (full_width or on_left_column) else x_right
        width = (x_right - x_left + col_width) if full_width else col_width

        c.setFont("Helvetica", _LABEL_FONT_SIZE)
        c.drawString(x, y + 0.06 * inch, label)
        c.acroForm.textfield(
            name=field_name,
            tooltip=label,
            x=x,
            y=y - _FIELD_HEIGHT + 0.13 * inch,
            width=width,
            height=_FIELD_HEIGHT,
            value=prefill.get(prefill_key, "") if prefill_key else "",
            borderStyle="underlined",
            fontSize=_FIELD_FONT_SIZE,
        )

        if full_width or not on_left_column:
            y -= _ROW_GAP
            on_left_column = True
        else:
            on_left_column = False

    if not on_left_column:
        y -= _ROW_GAP
    return y - 0.06 * inch


def _draw_signature_line(c: canvas.Canvas, x_left: float, y: float) -> None:
    c.setFont("Helvetica", 10)
    sig_label = "Applicant Signature:"
    c.drawString(x_left, y, sig_label)
    sig_label_width = c.stringWidth(sig_label, "Helvetica", 10) + 8
    line_end = x_left + sig_label_width + 2.2 * inch
    c.setStrokeColor(colors.black)
    c.setLineWidth(0.75)
    c.line(x_left + sig_label_width, y - 2, line_end, y - 2)

    date_label = "Date:"
    date_x = line_end + 0.4 * inch
    c.drawString(date_x, y, date_label)
    date_label_width = c.stringWidth(date_label, "Helvetica", 10) + 8
    c.acroForm.textfield(
        name="date",
        tooltip="Date",
        x=date_x + date_label_width,
        y=y - _FIELD_HEIGHT + 0.13 * inch,
        width=1.3 * inch,
        height=_FIELD_HEIGHT,
        value="",
        borderStyle="underlined",
        fontSize=_FIELD_FONT_SIZE,
    )


def build_member_application_pdf(name: str, email: str | None, phone: str | None) -> bytes:
    prefill = {"name": name, "email": email or "", "phone": phone or ""}

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    page_width, page_height = letter
    margin = 0.5 * inch

    y = _draw_header(c, page_width, page_height, margin)

    col_gap = 0.3 * inch
    x_left = margin
    col_width = (page_width - 2 * margin - col_gap) / 2
    x_right = x_left + col_width + col_gap

    for title, fields in SECTIONS:
        y = _draw_section(c, title, fields, prefill, x_left, x_right, col_width, y)

    _draw_signature_line(c, x_left, y - 0.1 * inch)

    c.showPage()

    c.setFont("Helvetica-Bold", 13)
    c.drawString(margin, page_height - 0.8 * inch, CLUB_NAME)
    c.setFont("Helvetica", 11)
    text_object = c.beginText(margin, page_height - 1.3 * inch)
    text_object.setLeading(16)
    for line in CLUB_RULES_TEXT:
        text_object.textLine(line)
    c.drawText(text_object)

    c.showPage()
    c.save()
    return buf.getvalue()
