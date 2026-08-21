"""STORY 16.33 — Dinner/Event attendance & payment tracking PDF, downloadable
from the Attendance Sheet detail page for on-site use.

2026-08-13 redesign: replaces the earlier plain-table layout with the
"design_handoff_attendance_report" spec (a print-first, high-fidelity
handoff — see that bundle's README.md for the full token/measurement
reference). Faithfully ported to reportlab platypus:
- Masthead (club logo / title+subtitle / Rotary International lockup) over
  a 2px azure rule, then a tinted meeting-meta strip (date/venue pill +
  payment note).
- Member roster split into two side-by-side tables (`Math.ceil(n/2)` in the
  left column) — the design's key space-saving move over a single
  full-width name column. Continuously numbered 1..N, alphabetical by
  surname, active + honorary combined (no section split) — matches the
  club's real paper template, per Story 16.33's original brief.
- Blank Visiting Rotarians / Guests tables (Pay-only — no Attendance
  column: being listed already means present) — always empty rows, no data
  source for either in this app.
- A bottom tally + signature block. Attendance/Payment checkboxes and the
  Revenue/Cost/Result/Recorded-by/Signature lines are always blank for
  on-site hand-marking — this app has no field to pre-fill any of them
  (matches the pre-redesign behavior, which never pre-filled Payment
  either).

Design "px" values are at a 96dpi canvas; converted to points via `_px()`
(1px = 0.75pt) throughout, so every measurement below matches the handoff
spec's own numbers 1:1. No true flex "push footer to bottom" in reportlab's
flowing layout model — the footer simply follows the tables in document
flow, which lands it near the bottom at the spec's own default row counts
and lets it flow onto a new page (rather than clip) once the roster/visitor
lists grow, per the spec's own "must flow onto additional pages" note."""
import re
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

_TAG_RE = re.compile(r"<[^>]+>")
_ENTITIES = {"&mdash;": "—", "&middot;": "·", "&nbsp;": " ", "&amp;": "&"}

from app.core.dinner_forecast_report import INTL_LOGO_PATH, _logo_image
from app.core.statistics_report import LOGO_PATH
from app.models import AttendanceEvent
from app.schemas.attendance import AttendanceRecordRead

# ── Design tokens (design_handoff_attendance_report/README.md) ──
NAVY = "#0c2340"
AZURE = "#17458f"
SLATE = "#6b7686"
SLATE_2 = "#9aa7ba"
RULE = "#dde3ec"
HAIR = "#eef1f6"
ZEBRA = "#f6f9fd"
TINT = "#e3edfb"
GOLD = "#b87610"
GOLD_BG = "#fdf0da"
GOLD_RULE = "#e8d3ad"

# Confirmed with Karim (Story 16.33): always this exact FPS ID, on every
# generated sheet, regardless of event/rotary year — not a per-event or
# admin-configurable value.
FPS_ID = "108236613"

VISITING_ROTARIAN_BLANK_ROWS = 6
GUEST_BLANK_ROWS = 5

PAGE_MARGIN_V = 0.375 * inch  # 36px @96dpi
PAGE_MARGIN_H = 46 / 96 * inch  # 46px @96dpi


def _px(value: float) -> float:
    """Design canvas px (96dpi) -> points (1px = 0.75pt)."""
    return value * 0.75


# 2026-08-14: on-screen fillability — every hand-marked element (checkbox,
# name/club write-in, tally figure, signature line) is now a real AcroForm
# field, not just a printed box/rule, so the sheet can be filled directly in
# a PDF viewer without printing it first. `checkboxRelative`/
# `textfieldRelative` position the widget using the canvas's *current*
# coordinate transform, which is exactly the flowable's own local origin at
# draw time — the same trick that lets `Table`/`Paragraph` flowables not
# need to know their absolute page position either.
_FIELD_COUNTER = {"n": 0}


def _unique_name(prefix: str) -> str:
    """AcroForm field names must be unique across the whole document —
    appending a running counter guarantees that even if two call sites
    ever produce the same human-readable prefix (e.g. two events' worth of
    "Members" tally boxes were ever concatenated into one document)."""
    _FIELD_COUNTER["n"] += 1
    return f"{prefix}_{_FIELD_COUNTER['n']}"


class _CheckboxField(Flowable):
    """The design's 15x15px hand-tick box, as a real fillable checkbox.
    `checked` pre-fills it — used for Attendance when the app already has
    the member marked present, so the office doesn't have to re-tick
    what's already known."""

    def __init__(self, name: str, checked: bool = False):
        super().__init__()
        self.name = name
        self.checked = checked
        self.width = _px(15)
        self.height = _px(15)

    def wrap(self, availWidth, availHeight):
        return self.width, self.height

    def draw(self):
        self.canv.acroForm.checkboxRelative(
            name=self.name,
            checked=self.checked,
            buttonStyle="check",
            shape="square",
            x=0,
            y=0,
            size=self.width,
            borderColor=colors.HexColor(AZURE),
            fillColor=colors.white,
            textColor=colors.HexColor(AZURE),
            borderWidth=_px(1.5),
            borderStyle="solid",
            forceBorder=True,
        )


class _TextField(Flowable):
    """A blank write-in cell (member name, club, host rotarian, tally
    figure, signature line) as a real fillable text field, borderless so
    the table/rule it sits on shows through unchanged."""

    def __init__(self, name: str, width: float, height: float, *, font_size: float, align: str = "left", value: str = ""):
        super().__init__()
        self.name = name
        self.width = width
        self.height = height
        self.font_size = font_size
        self.align = align
        self.value = value

    def wrap(self, availWidth, availHeight):
        return self.width, self.height

    def draw(self):
        self.canv.acroForm.textfieldRelative(
            name=self.name,
            value=self.value,
            x=0,
            y=0,
            width=self.width,
            height=self.height,
            fontName="Helvetica",
            fontSize=self.font_size,
            textColor=colors.HexColor(NAVY),
            fillColor=None,
            borderColor=None,
            borderWidth=0,
            borderStyle="none",
            forceBorder=False,
        )


def _natural_width(flowable) -> float:
    """The width a flowable needs to render on a single line. Neither of
    reportlab's two obvious options works generically: `Table.wrap()` with
    `colWidths=None` claims however much width its outer cell offers
    (pills/labels rendering far wider than their text) rather than a
    minimal one, and `Paragraph.minWidth()` returns only the widest *word*
    (so multi-word text like "18 August 2026" wraps at every space). For a
    `Paragraph`, measure its own (tag-stripped) text directly instead;
    anything else (the checkbox/pill Tables passed through `_hrow`) already
    carries an explicit width, so `wrap()` reports it accurately."""
    if isinstance(flowable, Paragraph):
        text = _TAG_RE.sub("", flowable.text)
        for entity, replacement in _ENTITIES.items():
            text = text.replace(entity, replacement)
        return stringWidth(text, flowable.style.fontName, flowable.style.fontSize) + 3
    width, _ = flowable.wrap(2000, 2000)
    return width


def _pill(text: str, bg: str, fg: str, styles):
    """A rounded, uppercase, letter-spaced-in-spirit label chip — the
    design's MEETING/PAYMENT/GUEST CLUB/HOSTED pills. Reportlab has no
    letter-spacing primitive, so tracking is approximated with bold+caps
    alone, same concession every other PDF report in this codebase makes."""
    style = styles["BodyText"].clone(f"pill-{bg}-{fg}")
    style.fontName = "Helvetica-Bold"
    style.fontSize = _px(9.5)
    style.leading = _px(9.5) + 1
    style.textColor = colors.HexColor(fg)
    style.alignment = 1
    label = Paragraph(text.upper(), style)
    chip_width = _natural_width(label) + 2 * _px(9)
    chip = Table([[label]], colWidths=[chip_width], rowHeights=[_px(19)])
    chip.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(bg)),
                ("ROUNDEDCORNERS", [_px(10)] * 4),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), _px(9)),
                ("RIGHTPADDING", (0, 0), (-1, -1), _px(9)),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return chip


def _hrow(items: list, gap: float):
    """Lays `items` out left-to-right with a fixed `gap` (pt) between them,
    each sized to its own natural width — the design's repeated
    `display:flex; gap:Npx` cluster pattern (masthead text block asides,
    meta strip clusters, section-header label+pill, sign-off fields)."""
    if not items:
        return Table([[""]])
    row = []
    col_widths = []
    for index, item in enumerate(items):
        if index > 0:
            row.append("")
            col_widths.append(gap)
        row.append(item)
        col_widths.append(_natural_width(item))
    table = Table([row], colWidths=col_widths)
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return table


def _space_between(left, right, width: float):
    """Two flowables pinned to opposite ends of a `width`-pt row — the
    design's `justify-content:space-between` pattern (meta strip clusters,
    section headers, sign-off row)."""
    table = Table([[left, right]], colWidths=[width * 0.62, width * 0.38])
    table.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (0, 0), "LEFT"),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return table


def _combined_roster(
    active: list[AttendanceRecordRead], honorary: list[AttendanceRecordRead]
) -> list[AttendanceRecordRead]:
    """Merges active + honorary into one flat, (last_name, first_name)
    sorted list — matches the real template, which numbers every eligible
    attendee 1..N in a single list rather than splitting by member status."""
    combined = list(active) + list(honorary)
    return sorted(combined, key=lambda m: (m.last_name.lower(), m.first_name.lower()))


def _member_table(rows: list[tuple[int, AttendanceRecordRead]], header_style, index_style, name_style):
    """One half of the two-column member roster (`.tbl.mgrid`): #, Member,
    Att, Pay — 26/name/40/40px columns, 26px rows, azure header, zebra body.
    Both checkboxes are real fillable fields; Attendance starts pre-checked
    when the app already has that member marked present (Payment has no
    such source, so it always starts blank)."""
    col_widths = [_px(26), None, _px(40), _px(40)]
    # Table needs an explicit width for every column when others are fixed
    # and only one is auto (`None`) — width the auto column so the row sums
    # to the design's per-card width (half the content column, minus half
    # the 16px inter-card gap).
    card_width = (letter[0] - 2 * PAGE_MARGIN_H - _px(16)) / 2
    col_widths[1] = card_width - _px(26) - 2 * _px(40)

    header = ["", "MEMBER", "ATT", "PAY"]
    data = [[Paragraph(h, header_style) for h in header]]
    for index, member in rows:
        data.append(
            [
                Paragraph(str(index), index_style),
                Paragraph(escape(f"{member.last_name} {member.first_name}"), name_style),
                _CheckboxField(_unique_name(f"att_{index}"), checked=member.present),
                _CheckboxField(_unique_name(f"pay_{index}")),
            ]
        )

    row_heights = [_px(26)] * len(data)
    table = Table(data, colWidths=col_widths, rowHeights=row_heights, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(AZURE)),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor(RULE)),
        ("LINEBELOW", (0, 1), (-1, -2), 0.5, colors.HexColor(HAIR)),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (2, 0), (3, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (1, 0), (1, -1), _px(10)),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
        ("LEFTPADDING", (2, 0), (3, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        # Zebra striping starts on the first body row (odd design rows,
        # 1-indexed) — ROWBACKGROUNDS' own 0-indexed cycle already lands
        # there since row 0 is the (excluded-by-range) header.
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor(ZEBRA), colors.white]),
    ]
    table.setStyle(TableStyle(style))
    return table


def _wide_table(columns: tuple[str, str], blank_rows: int, header_style, cell_style, field_prefix: str):
    """Visiting Rotarians / Guests table (`.tbl.wide.lgrid`): Name / <col2>
    / Pay, 1.15fr:1fr:52px, 27px rows, Pay-only checkbox — no Attendance
    column (a listed visitor/guest was by definition present). Name/<col2>
    are fillable text fields and Pay a fillable checkbox, so the whole row
    can be typed in on-screen rather than handwritten."""
    content_width = letter[0] - 2 * PAGE_MARGIN_H
    pay_width = _px(52)
    remaining = content_width - pay_width
    name_width = remaining * 1.15 / 2.15
    col2_width = remaining * 1 / 2.15
    col_widths = [name_width, col2_width, pay_width]
    row_height = _px(27)
    field_font_size = cell_style.fontSize

    data = [
        [
            Paragraph(columns[0].upper(), header_style),
            Paragraph(columns[1].upper(), header_style),
            Paragraph("PAY", header_style),
        ]
    ]
    for row in range(blank_rows):
        data.append(
            [
                _TextField(_unique_name(f"{field_prefix}_{row}_name"), name_width, row_height, font_size=field_font_size),
                _TextField(_unique_name(f"{field_prefix}_{row}_col2"), col2_width, row_height, font_size=field_font_size),
                _CheckboxField(_unique_name(f"{field_prefix}_{row}_pay")),
            ]
        )

    row_heights = [_px(26)] + [row_height] * blank_rows
    table = Table(data, colWidths=col_widths, rowHeights=row_heights, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(AZURE)),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor(RULE)),
                ("LINEBELOW", (0, 1), (-1, -2), 0.5, colors.HexColor(HAIR)),
                ("ALIGN", (2, 0), (2, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (1, -1), _px(10)),
                ("LEFTPADDING", (2, 0), (2, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor(ZEBRA), colors.white]),
            ]
        )
    )
    return table


def _section_header(label: str, styles, pill=None, note: str | None = None):
    label_style = styles["BodyText"].clone("sec-label")
    label_style.fontName = "Helvetica-Bold"
    label_style.fontSize = _px(11)
    label_style.textColor = colors.HexColor(NAVY)

    note_style = styles["BodyText"].clone("sec-note")
    note_style.fontSize = _px(10.5)
    note_style.textColor = colors.HexColor(SLATE_2)
    note_style.alignment = 2  # right

    left = Paragraph(label.upper(), label_style)
    if pill is not None:
        left = _hrow([left, pill], _px(10))

    content_width = letter[0] - 2 * PAGE_MARGIN_H
    right = Paragraph(note or "", note_style)
    return _space_between(left, right, content_width)


class _TallyLine(Flowable):
    """A tally box's write-in rule as a fillable numeric text field —
    drawn with its own underline (and, for money boxes, the small "HK$"
    marker the field starts after) so the visual still matches the design
    exactly while being a real form field underneath."""

    def __init__(
        self,
        name: str,
        width: float,
        rule_color: str,
        *,
        currency: bool,
        height: float = _px(13),
        rule_width: float = _px(1.5),
    ):
        super().__init__()
        self.name = name
        self.width = width
        self.rule_color = rule_color
        self.currency = currency
        self.height = height
        self.rule_width = rule_width

    def wrap(self, availWidth, availHeight):
        return self.width, self.height

    def draw(self):
        canv = self.canv
        canv.saveState()
        canv.setStrokeColor(colors.HexColor(self.rule_color))
        canv.setLineWidth(self.rule_width)
        canv.line(0, 0, self.width, 0)
        canv.restoreState()

        field_x = 0.0
        field_width = self.width
        if self.currency:
            marker = "HK$"
            marker_size = _px(9)
            canv.saveState()
            canv.setFont("Helvetica", marker_size)
            canv.setFillColor(colors.HexColor(SLATE_2))
            canv.drawString(0, 1, marker)
            canv.restoreState()
            field_x = stringWidth(marker, "Helvetica", marker_size) + _px(4)
            field_width = self.width - field_x

        canv.acroForm.textfieldRelative(
            name=self.name,
            value="",
            x=field_x,
            y=0,
            width=field_width,
            height=self.height,
            fontName="Helvetica",
            fontSize=_px(11),
            textColor=colors.HexColor(NAVY),
            fillColor=None,
            borderColor=None,
            borderWidth=0,
            borderStyle="none",
            forceBorder=False,
        )


def _tally_box(label: str, styles, *, money: bool, currency: bool, width: float):
    label_style = styles["BodyText"].clone(f"tally-label-{label}")
    label_style.fontName = "Helvetica-Bold"
    label_style.fontSize = _px(8.5)
    label_style.textColor = colors.HexColor(GOLD if money else SLATE)

    rule_color = GOLD_RULE if money else RULE
    inner_width = width - 2 * _px(9)
    line = _TallyLine(_unique_name(f"tally_{label.lower()}"), inner_width, rule_color, currency=currency)
    box = Table([[Paragraph(label.upper(), label_style)], [line]], colWidths=[width])
    box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(GOLD_BG if money else ZEBRA)),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor(rule_color)),
                ("ROUNDEDCORNERS", [_px(6)] * 4),
                ("LEFTPADDING", (0, 0), (-1, -1), _px(9)),
                ("RIGHTPADDING", (0, 0), (-1, -1), _px(9)),
                ("TOPPADDING", (0, 0), (-1, -1), _px(4)),
                ("BOTTOMPADDING", (0, 0), (-1, -1), _px(4)),
                ("TOPPADDING", (0, 1), (-1, 1), _px(2)),
            ]
        )
    )
    return box


def _tally_group(labels: list[tuple[str, bool, bool]], styles, width: float):
    """`labels` = [(label, is_money, has_currency_marker), ...] — one of the
    two 4-box `repeat(4,1fr)` tally groups (Members/Visitors/Guests/Total,
    or Paid/Revenue/Cost/Result)."""
    gap = _px(8)
    box_width = (width - 3 * gap) / 4
    row = []
    col_widths = []
    for index, (label, money, currency) in enumerate(labels):
        if index > 0:
            row.append("")
            col_widths.append(gap)
        row.append(_tally_box(label, styles, money=money, currency=currency, width=box_width))
        col_widths.append(box_width)
    table = Table([row], colWidths=col_widths)
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return table


def build_attendance_sheet_pdf(
    event: AttendanceEvent,
    active: list[AttendanceRecordRead],
    honorary: list[AttendanceRecordRead],
) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        topMargin=PAGE_MARGIN_V,
        bottomMargin=PAGE_MARGIN_V,
        leftMargin=PAGE_MARGIN_H,
        rightMargin=PAGE_MARGIN_H,
    )
    styles = getSampleStyleSheet()
    content_width = letter[0] - 2 * PAGE_MARGIN_H
    story: list = []

    # ── Masthead ──
    title_style = styles["BodyText"].clone("att-title")
    title_style.fontName = "Helvetica-Bold"
    title_style.fontSize = _px(25)
    title_style.leading = _px(25) * 1.05
    title_style.textColor = colors.HexColor(NAVY)

    subtitle_style = styles["BodyText"].clone("att-subtitle")
    subtitle_style.fontSize = _px(13)
    subtitle_style.leading = _px(13) + 3
    subtitle_style.textColor = colors.HexColor(SLATE)
    subtitle_style.spaceBefore = _px(4)

    text_block = [
        Paragraph("Attendance Report", title_style),
        Paragraph(
            "Rotary Club of Discovery Bay &middot; District 3450, Hong Kong",
            subtitle_style,
        ),
    ]
    logo = _logo_image(LOGO_PATH, _px(60))
    lockup = _logo_image(INTL_LOGO_PATH, _px(40))
    masthead = Table(
        [[logo, text_block, lockup]],
        colWidths=[logo.drawWidth if logo else 0, None, lockup.drawWidth if lockup else 0],
    )
    masthead.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (0, 0), "LEFT"),
                ("ALIGN", (2, 0), (2, 0), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("LEFTPADDING", (1, 0), (1, 0), _px(22)),
                ("RIGHTPADDING", (1, 0), (1, 0), _px(22)),
            ]
        )
    )
    story.append(masthead)

    rule = Table([[""]], colWidths=[content_width], rowHeights=[_px(2)])
    rule.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(AZURE))]))
    story.append(Spacer(1, _px(11)))
    story.append(rule)

    # ── Meeting meta strip ──
    meeting_date = f"{event.event_date.day} {event.event_date.strftime('%B %Y')}"

    date_style = styles["BodyText"].clone("meta-date")
    date_style.fontName = "Helvetica-Bold"
    date_style.fontSize = _px(13)
    date_style.textColor = colors.HexColor(NAVY)

    venue_style = styles["BodyText"].clone("meta-venue")
    venue_style.fontSize = _px(11)
    venue_style.textColor = colors.HexColor(SLATE)

    right_style = styles["BodyText"].clone("meta-right")
    right_style.fontSize = _px(11)
    right_style.textColor = colors.HexColor(SLATE)

    right_bold_style = right_style.clone("meta-right-bold")
    right_bold_style.fontName = "Helvetica-Bold"
    right_bold_style.textColor = colors.HexColor(NAVY)

    left_items = [_pill("Meeting", "#ffffff", AZURE, styles), Paragraph(escape(meeting_date), date_style)]
    if event.location:
        left_items.append(Paragraph(escape(event.location), venue_style))
    left_cluster = _hrow(left_items, _px(12))

    right_cluster = _hrow(
        [
            _pill("Payment", GOLD_BG, GOLD, styles),
            Paragraph("Cash or FPS", right_bold_style),
            Paragraph(f'FPS ID <font name="Helvetica-Bold" color="{NAVY}">{FPS_ID}</font>', right_style),
        ],
        _px(12),
    )

    meta = Table([[left_cluster, right_cluster]], colWidths=[content_width * 0.5, content_width * 0.5])
    meta.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(TINT)),
                ("ROUNDEDCORNERS", [_px(4)] * 4),
                ("ALIGN", (0, 0), (0, 0), "LEFT"),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (0, 0), _px(14)),
                ("RIGHTPADDING", (1, 0), (1, 0), _px(14)),
                ("LEFTPADDING", (1, 0), (1, 0), 0),
                ("RIGHTPADDING", (0, 0), (0, 0), 0),
                ("TOPPADDING", (0, 0), (-1, -1), _px(9)),
                ("BOTTOMPADDING", (0, 0), (-1, -1), _px(9)),
            ]
        )
    )
    story.append(Spacer(1, _px(12)))
    story.append(meta)

    # ── Members (two-column roster) ──
    roster = _combined_roster(active, honorary)
    split_at = -(-len(roster) // 2)  # ceil(n/2)
    left_rows = list(enumerate(roster[:split_at], start=1))
    right_rows = list(enumerate(roster[split_at:], start=split_at + 1))

    member_header_style = styles["BodyText"].clone("member-th")
    member_header_style.fontName = "Helvetica-Bold"
    member_header_style.fontSize = _px(9)
    member_header_style.textColor = colors.white

    member_index_style = styles["BodyText"].clone("member-idx")
    member_index_style.fontSize = _px(10)
    member_index_style.textColor = colors.HexColor(SLATE_2)
    member_index_style.alignment = 1

    member_name_style = styles["BodyText"].clone("member-name")
    member_name_style.fontSize = _px(12)
    member_name_style.textColor = colors.HexColor(NAVY)

    story.append(Spacer(1, _px(18)))
    story.append(
        _section_header(
            "Members",
            styles,
            note=f"{len(roster)} on roll &middot; tick attendance and payment",
        )
    )
    story.append(Spacer(1, _px(4)))
    columns_row = Table(
        [
            [
                _member_table(left_rows, member_header_style, member_index_style, member_name_style),
                _member_table(right_rows, member_header_style, member_index_style, member_name_style)
                if right_rows
                else "",
            ]
        ],
        colWidths=[content_width / 2 - _px(8), content_width / 2 - _px(8)],
    )
    columns_row.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("LEFTPADDING", (1, 0), (1, 0), _px(16)),
            ]
        )
    )
    story.append(columns_row)

    # ── Visiting Rotarians / Guests ──
    wide_header_style = styles["BodyText"].clone("wide-th")
    wide_header_style.fontName = "Helvetica-Bold"
    wide_header_style.fontSize = _px(9)
    wide_header_style.textColor = colors.white

    wide_cell_style = styles["BodyText"].clone("wide-td")
    wide_cell_style.fontSize = _px(12)
    wide_cell_style.textColor = colors.HexColor(NAVY)

    story.append(Spacer(1, _px(18)))
    story.append(
        _section_header(
            "Visiting Rotarians",
            styles,
            note="Payment only",
        )
    )
    story.append(Spacer(1, _px(4)))
    story.append(
        _wide_table(("Name", "Club"), VISITING_ROTARIAN_BLANK_ROWS, wide_header_style, wide_cell_style, "visitor")
    )

    story.append(Spacer(1, _px(18)))
    story.append(
        _section_header(
            "Guests",
            styles,
            note="Payment only",
        )
    )
    story.append(Spacer(1, _px(4)))
    story.append(
        _wide_table(("Name", "Host Rotarian"), GUEST_BLANK_ROWS, wide_header_style, wide_cell_style, "guest")
    )

    # ── Tally + signature ──
    story.append(Spacer(1, _px(8)))
    tally_row = Table(
        [
            [
                _tally_group(
                    [("Members", False, False), ("Visitors", False, False), ("Guests", False, False), ("Total", False, False)],
                    styles,
                    content_width / 2 - _px(9),
                ),
                _tally_group(
                    [("Paid", True, False), ("Revenue", True, True), ("Cost", True, True), ("Result", True, True)],
                    styles,
                    content_width / 2 - _px(9),
                ),
            ]
        ],
        colWidths=[content_width / 2 - _px(9), content_width / 2 - _px(9)],
    )
    tally_row.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("LEFTPADDING", (1, 0), (1, 0), _px(18)),
            ]
        )
    )
    story.append(tally_row)

    sign_label_style = styles["BodyText"].clone("sign-label")
    sign_label_style.fontSize = _px(10)
    sign_label_style.textColor = colors.HexColor(SLATE)

    colophon_style = styles["BodyText"].clone("colophon")
    colophon_style.fontSize = _px(9)
    colophon_style.textColor = colors.HexColor(SLATE_2)
    colophon_style.alignment = 2

    sign_field_width = (content_width * 0.62 - _px(32)) / 2

    sign_fields = Table(
        [
            [Paragraph("Recorded by", sign_label_style), "", Paragraph("Signature", sign_label_style)],
            [
                _TallyLine(
                    _unique_name("recorded_by"), sign_field_width, SLATE_2, currency=False, height=_px(16), rule_width=1
                ),
                "",
                _TallyLine(
                    _unique_name("signature"), sign_field_width, SLATE_2, currency=False, height=_px(16), rule_width=1
                ),
            ],
        ],
        colWidths=[sign_field_width, _px(32), sign_field_width],
    )
    sign_fields.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, 0), _px(4)),
            ]
        )
    )
    sign_row = _space_between(sign_fields, Paragraph("Rotary Club of Discovery Bay &mdash; Attendance Report", colophon_style), content_width)
    sign_row_bordered = Table([[sign_row]], colWidths=[content_width])
    sign_row_bordered.setStyle(
        TableStyle(
            [
                ("LINEABOVE", (0, 0), (-1, -1), 1, colors.HexColor(RULE)),
                ("TOPPADDING", (0, 0), (-1, -1), _px(6)),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(Spacer(1, _px(8)))
    story.append(sign_row_bordered)

    doc.build(story)
    return buffer.getvalue()
