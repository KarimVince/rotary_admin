"""Story 8.3: new-member application — a fillable (AcroForm) PDF pre-populated
with whatever the prospect's name/email/phone were entered, leaving every
other membership field blank for them to complete and sign.

Built with reportlab's low-level Canvas + AcroForm API (reportlab is already
a dependency here for statistics_report.py's static PDFs, which use the
higher-level platypus flowables — those don't support form fields, hence the
different, lower-level API used here).
"""

from io import BytesIO
from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

CLUB_NAME = "Rotary Club of Discovery Bay"

# Kept in sync with statistics_report.py's own copy of this asset.
LOGO_PATH = Path(__file__).resolve().parents[1] / "assets" / "rotary-logo.png"

# (field name, label, prefill key or None) — prefill key looks up the
# create-request's name/email/phone; every other field is left blank for the
# applicant to fill in themselves. Spouse fields are deliberately omitted
# per this story's scope.
FORM_FIELDS: list[tuple[str, str, str | None]] = [
    ("honorific", "Honorific Title", None),
    ("name", "Name", "name"),
    ("date_of_birth", "Date of Birth", None),
    ("nationality", "Nationality", None),
    ("email", "Email", "email"),
    ("phone", "Phone", "phone"),
    ("address", "Home Address", None),
    ("company_name", "Company Name", None),
    ("position", "Position", None),
    ("classification", "Classification / Occupational Code", None),
    ("proposer_name", "Proposer Name", None),
    ("additional_information", "Additional Information", None),
    ("signature", "Signature", None),
    ("date", "Date", None),
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


def build_member_application_pdf(name: str, email: str | None, phone: str | None) -> bytes:
    prefill = {"name": name, "email": email or "", "phone": phone or ""}

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    page_width, page_height = letter

    if LOGO_PATH.exists():
        c.drawImage(
            str(LOGO_PATH), 0.6 * inch, page_height - 1.1 * inch, height=0.6 * inch,
            preserveAspectRatio=True, mask="auto",
        )
    c.setFont("Helvetica-Bold", 16)
    c.drawString(1.5 * inch, page_height - 0.8 * inch, f"{CLUB_NAME} — New Member Application")

    c.setFont("Helvetica", 9)
    c.drawString(
        0.6 * inch,
        page_height - 1.3 * inch,
        "Please complete the remaining fields, sign, and return to the club.",
    )

    field_height = 0.28 * inch
    label_width = 2.2 * inch
    field_width = page_width - label_width - 1.2 * inch
    top = page_height - 1.7 * inch
    row_gap = 0.42 * inch

    c.setFont("Helvetica", 10)
    for index, (field_name, label, prefill_key) in enumerate(FORM_FIELDS):
        y = top - index * row_gap
        c.drawString(0.6 * inch, y + 0.06 * inch, label)
        c.acroForm.textfield(
            name=field_name,
            tooltip=label,
            x=0.6 * inch + label_width,
            y=y - field_height + 0.15 * inch,
            width=field_width,
            height=field_height,
            value=prefill.get(prefill_key, "") if prefill_key else "",
            borderStyle="underlined",
            fontSize=10,
        )

    c.showPage()

    c.setFont("Helvetica-Bold", 13)
    c.drawString(0.6 * inch, page_height - 0.8 * inch, CLUB_NAME)
    c.setFont("Helvetica", 11)
    text_object = c.beginText(0.6 * inch, page_height - 1.3 * inch)
    text_object.setLeading(16)
    for line in CLUB_RULES_TEXT:
        text_object.textLine(line)
    c.drawText(text_object)

    c.showPage()
    c.save()
    return buf.getvalue()
