"""Monthly Calendar report (Dinner / Events) — PDF and PPTX.

One page / slide for the selected month: a Sun–Sat calendar grid with the
month's events highlighted on their day, plus an "Event Details" list on the
right (colour dot + date(s) + event name). Events with the same name share a
colour and one detail line ("Nov 3 & Nov 17 - Club Meetings").

PDF uses the app's normal report header (club logo, title, Rotary logo) — it
does not use the PPTX band. PPTX uses the same chrome options as the Year
Event Schedule deck: "plain" (green band + club lockup) or "template"
(district band image).
"""

import calendar
from collections import defaultdict
from datetime import date as date_type, datetime, time as time_type, timezone
from io import BytesIO

from PIL import Image as PILImage
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Pt
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfgen.canvas import Canvas

from app.core.dinner_forecast_report import INTL_LOGO_PATH
from app.core.donation_statistics_report import (
    CLUB_LOGO_LOCKUP_IMAGE,
    COLOR_BAND_KICKER_GOLD,
    COLOR_DISTRICT_GREEN,
    DISTRICT_BAND_IMAGE,
    _px_len,
    _rgb,
)
from app.core.statistics_report import CLUB_NAME, LOGO_PATH
from app.models import AttendanceEvent

# (cell fill, border/dot, text) — cycled per distinct event name.
PALETTE = [
    ("#E6EEFF", "#3B6FE0", "#1F4BB3"),  # blue
    ("#E3F7EC", "#17A673", "#0E7A52"),  # green
    ("#F3E9FD", "#9B51E0", "#7330B5"),  # purple
    ("#FDE7EB", "#E5334F", "#B31C36"),  # red
    ("#FEEEDD", "#F0822B", "#B85A12"),  # orange
    ("#FFF6D9", "#F2A81D", "#9C6A06"),  # amber
    ("#E8E8FD", "#5B5BE0", "#3A3AB0"),  # indigo
]

WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]


def calendar_month_start(rotary_year_value: int, month: int) -> date_type:
    """First day of calendar `month` (1-12) inside the rotary year that
    starts in July of `rotary_year_value`."""
    year = rotary_year_value if month >= 7 else rotary_year_value + 1
    return date_type(year, month, 1)


def default_month(rotary_year_value: int, today: date_type | None = None) -> int:
    """Current month if it falls inside the rotary year, otherwise July."""
    today = today or date_type.today()
    for month in range(1, 13):
        start = calendar_month_start(rotary_year_value, month)
        if (start.year, start.month) == (today.year, today.month):
            return month
    return 7


def _weeks(month_start: date_type) -> list[list[int]]:
    """Sunday-first weeks; 0 = day outside the month."""
    return calendar.Calendar(firstweekday=6).monthdayscalendar(month_start.year, month_start.month)


def _sort_key(event: AttendanceEvent):
    return (event.event_date, event.start_time or time_type.min)


def _colors_by_name(events: list[AttendanceEvent]) -> dict[str, tuple[str, str, str]]:
    mapping: dict[str, tuple[str, str, str]] = {}
    for event in sorted(events, key=_sort_key):
        if event.name not in mapping:
            mapping[event.name] = PALETTE[len(mapping) % len(PALETTE)]
    return mapping


def _by_day(events: list[AttendanceEvent]) -> dict[int, list[AttendanceEvent]]:
    days: dict[int, list[AttendanceEvent]] = defaultdict(list)
    for event in sorted(events, key=_sort_key):
        days[event.event_date.day].append(event)
    return days


def _detail_lines(events: list[AttendanceEvent]) -> list[tuple[str, str]]:
    """[(dates label, event name)] — same-name events merged, ordered by
    first occurrence."""
    grouped: dict[str, list[date_type]] = {}
    for event in sorted(events, key=_sort_key):
        grouped.setdefault(event.name, []).append(event.event_date)
    lines = []
    for name, dates in grouped.items():
        labels = [f"{d.strftime('%b')} {d.day}" for d in dates]
        lines.append((" & ".join(labels) if len(labels) <= 2 else ", ".join(labels), name))
    return lines


def _title(month_start: date_type) -> str:
    return f"{month_start.strftime('%B')} Event’s Calendar"


def _subtitle(month_start: date_type, forecast: bool) -> str:
    scope = "Upcoming Events" if forecast else "All Events"
    return f"{month_start.strftime('%B %Y')} · {scope}"


# ───────────────────────────── PDF ─────────────────────────────

def _fit_lines(text: str, font: str, size: float, width: float, max_lines: int) -> list[str]:
    lines = simpleSplit(text, font, size, width)
    if len(lines) <= max_lines:
        return lines
    lines = lines[:max_lines]
    last = lines[-1]
    while last and len(simpleSplit(last + "…", font, size, width)) > 1:
        last = last[:-1]
    lines[-1] = last.rstrip() + "…"
    return lines


def _draw_logo(canvas: Canvas, path, x: float, y: float, height: float, align_right: bool = False) -> None:
    if not path.exists():
        return
    native_w, native_h = ImageReader(str(path)).getSize()
    width = height * native_w / native_h
    canvas.drawImage(
        str(path), x - width if align_right else x, y, width=width, height=height, mask="auto"
    )


def build_pdf_report(
    events: list[AttendanceEvent],
    rotary_year_value: int,
    month: int,
    forecast: bool = False,
) -> bytes:
    month_start = calendar_month_start(rotary_year_value, month)
    page_w, page_h = landscape(letter)
    margin = 0.4 * inch
    buffer = BytesIO()
    c = Canvas(buffer, pagesize=landscape(letter))

    # Header — normal report style (no PPTX band).
    header_top = page_h - margin
    _draw_logo(c, LOGO_PATH, margin, header_top - 0.8 * inch, 0.8 * inch)
    _draw_logo(c, INTL_LOGO_PATH, page_w - margin, header_top - 0.7 * inch, 0.6 * inch, True)
    c.setFillColor(colors.HexColor("#0c2340"))
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(page_w / 2, header_top - 0.42 * inch, _title(month_start))
    c.setFillColor(colors.HexColor("#6b7686"))
    c.setFont("Helvetica", 10)
    c.drawCentredString(page_w / 2, header_top - 0.66 * inch, _subtitle(month_start, forecast))
    line_y = header_top - 0.95 * inch
    c.setStrokeColor(colors.HexColor("#17458f"))
    c.setLineWidth(2)
    c.line(margin, line_y, page_w - margin, line_y)

    # Layout: grid left (~69%), details right.
    gap = 6
    grid_left = margin
    grid_w = (page_w - 2 * margin) * 0.69
    details_left = grid_left + grid_w + 0.3 * inch
    details_w = page_w - margin - details_left
    cell_w = (grid_w - 6 * gap) / 7

    weeks = _weeks(month_start)
    day_header_y = line_y - 0.32 * inch
    grid_top = line_y - 0.45 * inch
    footer_y = 0.7 * inch
    row_h = min(1.0 * inch, (grid_top - footer_y - (len(weeks) - 1) * gap) / len(weeks))

    palette = _colors_by_name(events)
    by_day = _by_day(events)

    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.HexColor("#6b7686"))
    for i, name in enumerate(WEEKDAYS):
        c.drawCentredString(grid_left + i * (cell_w + gap) + cell_w / 2, day_header_y, name)

    for r, week in enumerate(weeks):
        top = grid_top - r * (row_h + gap)
        for i, day in enumerate(week):
            if day == 0:
                continue
            x = grid_left + i * (cell_w + gap)
            y = top - row_h
            day_events = by_day.get(day, [])
            if day_events:
                fill, border, _text = palette[day_events[0].name]
                c.setFillColor(colors.HexColor(fill))
                c.setStrokeColor(colors.HexColor(border))
                c.setLineWidth(1.5)
            else:
                c.setFillColor(colors.HexColor("#FAFBFC"))
                c.setStrokeColor(colors.HexColor("#dde3ec"))
                c.setLineWidth(0.6)
            c.roundRect(x, y, cell_w, row_h, 5, stroke=1, fill=1)
            c.setFillColor(colors.HexColor("#0c2340" if day_events else "#6b7686"))
            c.setFont("Helvetica-Bold", 10)
            c.drawString(x + 5, top - 13, str(day))

            # Event names, stacked under the day number.
            chip_top = top - 18
            avail = row_h - 22
            chip_h = max(11.0, min(26.0, avail / max(1, len(day_events)) - 2))
            lines_per_chip = 2 if chip_h >= 22 else 1
            for ev in day_events:
                chip_bottom = chip_top - chip_h
                if chip_bottom < y + 2:
                    break
                _fill, _border, etext = palette[ev.name]
                c.setFont("Helvetica-Bold", 7.5)
                c.setFillColor(colors.HexColor(etext))
                for li, line in enumerate(
                    _fit_lines(ev.name, "Helvetica-Bold", 7.5, cell_w - 10, lines_per_chip)
                ):
                    c.drawString(x + 5, chip_top - 8 - li * 9, line)
                chip_top = chip_bottom - 2

    # Event Details panel.
    c.setFillColor(colors.HexColor("#0c2340"))
    c.setFont("Helvetica-Bold", 13)
    c.drawString(details_left, grid_top - 4, "Event Details")
    y = grid_top - 26
    lines = _detail_lines(events)
    if not lines:
        c.setFont("Helvetica", 9.5)
        c.setFillColor(colors.HexColor("#6b7686"))
        c.drawString(details_left, y, "No events this month.")
    for dates, name in lines:
        _fill, border, _text = palette[name]
        wrapped = simpleSplit(f"{dates} - {name}", "Helvetica", 9.5, details_w - 14)
        if y - len(wrapped) * 12 < footer_y:
            break
        c.setFillColor(colors.HexColor(border))
        c.circle(details_left + 3, y + 3, 3, stroke=0, fill=1)
        for li, line in enumerate(wrapped):
            if li == 0 and line.startswith(dates):
                c.setFillColor(colors.HexColor("#0c2340"))
                c.setFont("Helvetica-Bold", 9.5)
                c.drawString(details_left + 12, y, dates)
                dates_w = c.stringWidth(dates, "Helvetica-Bold", 9.5)
                c.setFont("Helvetica", 9.5)
                c.setFillColor(colors.HexColor("#4a5568"))
                c.drawString(details_left + 12 + dates_w, y, line[len(dates):])
            else:
                c.setFont("Helvetica", 9.5)
                c.setFillColor(colors.HexColor("#4a5568"))
                c.drawString(details_left + 12, y, line)
            y -= 12
        y -= 6

    # Footer
    c.setStrokeColor(colors.HexColor("#dde3ec"))
    c.setLineWidth(0.5)
    c.line(0.6 * inch, 0.55 * inch, page_w - 0.6 * inch, 0.55 * inch)
    c.setFont("Helvetica", 8)
    c.setFillColor(colors.HexColor("#9aa7ba"))
    c.drawString(0.6 * inch, 0.4 * inch, f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d')}")
    c.drawRightString(page_w - 0.6 * inch, 0.4 * inch, f"{CLUB_NAME} — Monthly Calendar")

    c.showPage()
    c.save()
    return buffer.getvalue()


# ───────────────────────────── PPTX ─────────────────────────────

_W, _H = 1920, 1080
_BAND_H = 160
_SIDE = 72
_GAP = 10
_GRID_W = 1230 - _SIDE  # calendar grid width
_DETAILS_X = 1290
_DETAILS_W = _W - _SIDE - _DETAILS_X


def _tf0(tf) -> None:
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0


def _draw_chrome(slide, chrome: str, month_start: date_type, forecast: bool) -> None:
    if chrome == "template" and DISTRICT_BAND_IMAGE.exists():
        slide.shapes.add_picture(str(DISTRICT_BAND_IMAGE), 0, 0, width=_px_len(_W), height=_px_len(_H))
    else:
        band = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, _px_len(_W), _px_len(_BAND_H))
        band.fill.solid()
        band.fill.fore_color.rgb = _rgb(COLOR_DISTRICT_GREEN)
        band.line.fill.background()
        band.shadow.inherit = False
        if CLUB_LOGO_LOCKUP_IMAGE.exists():
            with PILImage.open(CLUB_LOGO_LOCKUP_IMAGE) as im:
                aspect = im.width / im.height
            lh = _px_len(110)
            lw = int(lh * aspect)
            slide.shapes.add_picture(
                str(CLUB_LOGO_LOCKUP_IMAGE), _px_len(1840) - lw, _px_len(80) - lh // 2, width=lw, height=lh
            )

    title_box = slide.shapes.add_textbox(_px_len(80), _px_len(36), _px_len(1500), _px_len(68))
    _tf0(title_box.text_frame)
    title_box.text_frame.word_wrap = False
    run = title_box.text_frame.paragraphs[0].add_run()
    run.text = _title(month_start)
    run.font.size = Pt(32)
    run.font.bold = True
    run.font.color.rgb = _rgb("#FFFFFF")

    sub_box = slide.shapes.add_textbox(_px_len(80), _px_len(112), _px_len(1500), _px_len(34))
    _tf0(sub_box.text_frame)
    sub = sub_box.text_frame.paragraphs[0].add_run()
    sub.text = _subtitle(month_start, forecast)
    sub.font.size = Pt(13)
    sub.font.color.rgb = _rgb(COLOR_BAND_KICKER_GOLD)


def _text(slide, x, y, w, h, text, size, bold=False, color="#0c2340", align=None, wrap=True, anchor=None):
    box = slide.shapes.add_textbox(_px_len(x), _px_len(y), _px_len(w), _px_len(h))
    tf = box.text_frame
    _tf0(tf)
    tf.word_wrap = wrap
    if anchor is not None:
        tf.vertical_anchor = anchor
    p = tf.paragraphs[0]
    if align is not None:
        p.alignment = align
    r = p.add_run()
    r.text = text
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.color.rgb = _rgb(color)
    return box


def _truncate(text: str, max_chars: int) -> str:
    return text if len(text) <= max_chars else text[: max_chars - 1].rstrip() + "…"


def build_pptx_report(
    events: list[AttendanceEvent],
    rotary_year_value: int,
    month: int,
    forecast: bool = False,
    chrome: str = "plain",
) -> bytes:
    month_start = calendar_month_start(rotary_year_value, month)
    prs = Presentation()
    prs.slide_width = _px_len(_W)
    prs.slide_height = _px_len(_H)
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _draw_chrome(slide, chrome, month_start, forecast)

    palette = _colors_by_name(events)
    by_day = _by_day(events)
    weeks = _weeks(month_start)
    cell_w = (_GRID_W - 6 * _GAP) // 7
    header_y = 200
    grid_top = 245
    row_h = min(150, (_H - 70 - grid_top - (len(weeks) - 1) * _GAP) // len(weeks))

    for i, name in enumerate(WEEKDAYS):
        _text(
            slide, _SIDE + i * (cell_w + _GAP), header_y, cell_w, 30, name, 13, True, "#6B7686",
            PP_ALIGN.CENTER,
        )

    for r, week in enumerate(weeks):
        top = grid_top + r * (row_h + _GAP)
        for i, day in enumerate(week):
            if day == 0:
                continue
            x = _SIDE + i * (cell_w + _GAP)
            day_events = by_day.get(day, [])
            cell = slide.shapes.add_shape(
                MSO_SHAPE.ROUNDED_RECTANGLE, _px_len(x), _px_len(top), _px_len(cell_w), _px_len(row_h)
            )
            cell.adjustments[0] = 0.07
            cell.shadow.inherit = False
            cell.fill.solid()
            if day_events:
                fill, border, _t = palette[day_events[0].name]
                cell.fill.fore_color.rgb = _rgb(fill)
                cell.line.color.rgb = _rgb(border)
                cell.line.width = Pt(2.25)
            else:
                cell.fill.fore_color.rgb = _rgb("#FAFBFC")
                cell.line.color.rgb = _rgb("#DDE3EC")
                cell.line.width = Pt(0.75)
            _text(slide, x + 12, top + 8, cell_w - 24, 26, str(day), 14, True,
                  "#0C2340" if day_events else "#6B7686")

            chip_y = top + 40
            avail = row_h - 46
            chip_h = max(26, min(54, avail // max(1, len(day_events)) - 4)) if day_events else 0
            for ev in day_events:
                if chip_y + chip_h > top + row_h - 4:
                    break
                _fill, _border, etext = palette[ev.name]
                two_lines = chip_h >= 44
                _text(
                    slide, x + 12, chip_y, cell_w - 24, chip_h,
                    _truncate(ev.name, 36 if two_lines else 20), 10.5, True, etext,
                    anchor=MSO_ANCHOR.TOP,
                )
                chip_y += chip_h + 4

    # Event Details panel
    _text(slide, _DETAILS_X, header_y, _DETAILS_W, 40, "Event Details", 18, True)
    y = grid_top
    lines = _detail_lines(events)
    if not lines:
        _text(slide, _DETAILS_X, y, _DETAILS_W, 30, "No events this month.", 13, False, "#6B7686")
    for dates, name in lines:
        if y > _H - 90:
            break
        _fill, border, _t = palette[name]
        dot = slide.shapes.add_shape(
            MSO_SHAPE.OVAL, _px_len(_DETAILS_X), _px_len(y + 8), _px_len(14), _px_len(14)
        )
        dot.fill.solid()
        dot.fill.fore_color.rgb = _rgb(border)
        dot.line.fill.background()
        dot.shadow.inherit = False
        box = slide.shapes.add_textbox(
            _px_len(_DETAILS_X + 28), _px_len(y), _px_len(_DETAILS_W - 28), _px_len(34)
        )
        _tf0(box.text_frame)
        box.text_frame.word_wrap = True
        p = box.text_frame.paragraphs[0]
        r1 = p.add_run()
        r1.text = dates
        r1.font.size = Pt(13)
        r1.font.bold = True
        r1.font.color.rgb = _rgb("#0C2340")
        r2 = p.add_run()
        r2.text = f" - {name}"
        r2.font.size = Pt(13)
        r2.font.color.rgb = _rgb("#4A5568")
        wrapped_lines = 1 + (len(dates) + len(name) + 3) // 38
        y += 12 + 24 * wrapped_lines

    _text(slide, _W - _SIDE - 700, _H - 50, 700, 26, CLUB_NAME, 12, False, "#17458F", PP_ALIGN.RIGHT)

    buf = BytesIO()
    prs.save(buf)
    return buf.getvalue()
