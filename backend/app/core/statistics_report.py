"""Server-side PDF/PPTX export of the members statistics page (Story 2b.14).

Charts are re-rendered from the same MembersStatistics data backing the
live page (via matplotlib) rather than screenshotting the frontend, so the
export stays accurate regardless of the caller's browser/device.
"""

from datetime import date
from io import BytesIO
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # headless — no display server available on a backend host
import matplotlib.pyplot as plt  # noqa: E402 (must follow matplotlib.use)
from pptx import Presentation  # noqa: E402
from pptx.dml.color import RGBColor  # noqa: E402
from pptx.util import Inches, Pt  # noqa: E402
from reportlab.lib import colors  # noqa: E402
from reportlab.lib.pagesizes import letter  # noqa: E402
from reportlab.lib.styles import getSampleStyleSheet  # noqa: E402
from reportlab.lib.units import inch  # noqa: E402
from reportlab.platypus import (  # noqa: E402
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.core.pdf_style import PDF_BODY_FONT_SIZE, PDF_TABLE_HEADER_FONT_SIZE
from app.schemas.member_statistics import MembersStatistics

ROTARY_BLUE = "#17458f"
ROTARY_GOLD = "#f7a81b"
PIE_COLORS = ["#17458f", "#f7a81b", "#5f55ee", "#0f9d9f", "#b3261e", "#9aa4b2"]
CLUB_NAME = "Rotary Club of Discovery Bay"

# Same light/pastel tone pairs as the live page's stat cards
# (frontend/src/index.css --tone-*-bg), so the report visually matches:
# Total/Honorary = blue, New/Countries = lavender, Women/Men = teal,
# Age/Tenure = amber. Two cards share each tone, in display order.
TONE_BLUE_BG = "#e3edfb"
TONE_LAVENDER_BG = "#ece7fb"
TONE_TEAL_BG = "#e0f4f1"
TONE_AMBER_BG = "#fdf0da"
TONE_GREEN_BG = "#e4f5e3"  # --tone-green-bg, same as live page

CARD_TONES = [
    TONE_BLUE_BG,
    TONE_BLUE_BG,
    TONE_LAVENDER_BG,
    TONE_LAVENDER_BG,
    TONE_TEAL_BG,
    TONE_TEAL_BG,
    TONE_AMBER_BG,
    TONE_AMBER_BG,
]

# 12 stat cards matching the live page's 3-row layout (used by build_pptx_report).
# Each tuple: (label, stats-attribute-name-or-None-for-CP-name, tone-hex)
_PPTX_STAT_CARDS = [
    # Row 1
    ("Charter President",               None,                              TONE_AMBER_BG),
    ("Total Members",                   "total_members",                   TONE_BLUE_BG),
    ("Honorary Members",                "honorary_members",                TONE_BLUE_BG),
    ("New Members (this Rotary year)",  "new_members_this_rotary_year",    TONE_LAVENDER_BG),
    # Row 2
    ("Charter Members",                 "charter_members_count",           TONE_AMBER_BG),
    ("Past Presidents in Club",         "past_presidents_in_club_count",   TONE_AMBER_BG),
    ("Members Under 35",                "members_under_35_count",          TONE_GREEN_BG),
    ("Countries Represented",           "countries_represented",           TONE_LAVENDER_BG),
    # Row 3
    ("Number of Women",                 "women_count",                     TONE_TEAL_BG),
    ("Number of Men",                   "men_count",                       TONE_TEAL_BG),
    ("Average Age",                     "average_age",                     TONE_AMBER_BG),
    ("Avg Tenure (Rotarian)",           "average_tenure_as_rotarian",      TONE_AMBER_BG),
]

# The 4 charts shown on the PPTX slide (2 × 2 grid below the 12 cards).
_PPTX_CHART_TITLES = [
    "Gender distribution",
    "Age distribution",
    "Nationality distribution",
    "Tenure distribution (years as Rotarian)",
]

# Kept in sync with frontend/src/assets/rotary-logo.png (see that file's own
# comment) — copied here so report generation doesn't depend on the frontend
# source tree being present on whatever host runs the backend.
LOGO_PATH = Path(__file__).resolve().parents[1] / "assets" / "rotary-logo.png"


def _bar_chart_png(
    labels: list[str], values: list[float], title: str, figsize: tuple = (5.0, 2.6)
) -> bytes:
    fig, ax = plt.subplots(figsize=figsize)
    ax.bar(labels, values, color=ROTARY_BLUE)
    ax.set_title(title, fontsize=10)
    ax.tick_params(axis="x", rotation=30, labelsize=7)
    ax.tick_params(axis="y", labelsize=7)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    fig.tight_layout()
    return _fig_to_png(fig)


def _grouped_bar_chart_png(
    labels: list[str], series: dict[str, list[float]], title: str
) -> bytes:
    fig, ax = plt.subplots(figsize=(5.0, 2.6))
    bar_width = 0.8 / max(len(series), 1)
    x_positions = range(len(labels))
    colors_cycle = [ROTARY_BLUE, "#b3261e", ROTARY_GOLD]
    for index, (name, values) in enumerate(series.items()):
        offsets = [x + index * bar_width for x in x_positions]
        ax.bar(offsets, values, width=bar_width, label=name, color=colors_cycle[index % 3])
    ax.set_xticks([x + bar_width * (len(series) - 1) / 2 for x in x_positions])
    ax.set_xticklabels(labels, rotation=30, fontsize=7)
    ax.tick_params(axis="y", labelsize=7)
    ax.set_title(title, fontsize=10)
    ax.legend(fontsize=7)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    fig.tight_layout()
    return _fig_to_png(fig)


def _horizontal_bar_chart_png(labels: list[str], values: list[float], title: str) -> bytes:
    """Story 8.32 — mirrors the live pages' `<BarChart layout="vertical">`
    (NGO's Top Organisations / By Classification charts)."""
    fig, ax = plt.subplots(figsize=(5.0, max(2.6, 0.3 * len(labels))))
    ax.barh(labels, values, color=ROTARY_BLUE)
    ax.invert_yaxis()
    ax.set_title(title, fontsize=10)
    ax.tick_params(axis="both", labelsize=7)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    fig.tight_layout()
    return _fig_to_png(fig)


def _line_chart_png(labels: list[str], values: list[float], title: str) -> bytes:
    """Story 8.32 — mirrors the live NGO Statistics page's year-over-year
    `<LineChart>`."""
    fig, ax = plt.subplots(figsize=(5.0, 2.6))
    ax.plot(labels, values, color=ROTARY_GOLD, marker="o", markersize=3)
    ax.set_title(title, fontsize=10)
    ax.tick_params(axis="x", rotation=30, labelsize=7)
    ax.tick_params(axis="y", labelsize=7)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    fig.tight_layout()
    return _fig_to_png(fig)


def _pie_chart_png(
    labels: list[str], values: list[float], title: str, figsize: tuple = (5.0, 2.8)
) -> bytes:
    fig, ax = plt.subplots(figsize=figsize)
    if sum(values) == 0:
        ax.text(0.5, 0.5, "No data", ha="center", va="center")
        ax.axis("off")
    else:
        ax.pie(
            values,
            labels=labels,
            autopct="%1.0f%%",
            colors=[PIE_COLORS[i % len(PIE_COLORS)] for i in range(len(labels))],
            textprops={"fontsize": 7},
        )
    ax.set_title(title, fontsize=10)
    fig.tight_layout()
    return _fig_to_png(fig)


def _fig_to_png(fig) -> bytes:
    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=150)
    plt.close(fig)
    return buf.getvalue()


def render_charts(stats: MembersStatistics) -> dict[str, bytes]:
    """Returns {chart title: PNG bytes} for every chart shown on the live page."""
    charts: dict[str, bytes] = {}

    charts["Members by join year"] = _bar_chart_png(
        [entry.label for entry in stats.by_join_year],
        [entry.value for entry in stats.by_join_year],
        "Members by join year",
    )

    charts["Growth by Rotary year (joins vs leaves)"] = _grouped_bar_chart_png(
        [entry.label for entry in stats.growth_by_rotary_year],
        {
            "Joins": [entry.joins for entry in stats.growth_by_rotary_year],
            "Leaves": [entry.leaves for entry in stats.growth_by_rotary_year],
        },
        "Growth by Rotary year (joins vs leaves)",
    )

    charts["Nationality distribution"] = _pie_chart_png(
        [entry.label for entry in stats.by_nationality],
        [entry.value for entry in stats.by_nationality],
        "Nationality distribution",
    )

    charts["Tenure distribution (years as Rotarian)"] = _bar_chart_png(
        [entry.label for entry in stats.tenure_distribution],
        [entry.value for entry in stats.tenure_distribution],
        "Tenure distribution (years as Rotarian)",
    )

    charts["Gender distribution"] = _pie_chart_png(
        [entry.label for entry in stats.by_gender],
        [entry.value for entry in stats.by_gender],
        "Gender distribution",
    )

    charts["Age distribution"] = _bar_chart_png(
        [entry.label for entry in stats.age_distribution],
        [entry.value for entry in stats.age_distribution],
        "Age distribution",
    )

    return charts


# Compact figsize for the PPTX 2-column chart grid.
# At ~6.35 in display width each chart auto-heights to ~1.59 in, so
# two rows + gap fit comfortably in the space below the 12 stat cards.
_PPTX_CHART_FIGSIZE = (6.0, 1.5)  # aspect 4:1, no distortion when placed width-only


def render_pptx_4charts(stats: MembersStatistics) -> dict[str, bytes]:
    """Renders the 4 PPTX charts at a compact aspect ratio (no height override needed)."""
    fs = _PPTX_CHART_FIGSIZE
    return {
        "Gender distribution": _pie_chart_png(
            [e.label for e in stats.by_gender],
            [e.value for e in stats.by_gender],
            "Gender distribution",
            figsize=fs,
        ),
        "Age distribution": _bar_chart_png(
            [e.label for e in stats.age_distribution],
            [e.value for e in stats.age_distribution],
            "Age distribution",
            figsize=fs,
        ),
        "Nationality distribution": _pie_chart_png(
            [e.label for e in stats.by_nationality],
            [e.value for e in stats.by_nationality],
            "Nationality distribution",
            figsize=fs,
        ),
        "Tenure distribution (years as Rotarian)": _bar_chart_png(
            [e.label for e in stats.tenure_distribution],
            [e.value for e in stats.tenure_distribution],
            "Tenure distribution (years as Rotarian)",
            figsize=fs,
        ),
    }


def _stat_cards() -> list[tuple[str, str]]:
    """(label, attribute) pairs, in the same order/grouping as the live page."""
    return [
        ("Total Members", "total_members"),
        ("Honorary Members", "honorary_members"),
        ("New Members (this Rotary year)", "new_members_this_rotary_year"),
        ("Countries Represented", "countries_represented"),
        ("Number of Women", "women_count"),
        ("Number of Men", "men_count"),
        ("Average Age", "average_age"),
        ("Average Tenure (as Rotarian)", "average_tenure_as_rotarian"),
    ]


def _detail_tables(stats: MembersStatistics) -> list[tuple[str, list[str], list[list[str]]]]:
    """Story 8.13: an "Integral" report adds a detail section restating every
    chart's underlying numbers as a table, on top of everything Simplified
    already shows — using data already on the MembersStatistics response, no
    new backend queries. (8.13 wasn't originally scoped for the Members page —
    this is this story's own reasonable interpretation of "stats + graph +
    detail section" for it, reusing the existing 6 chart datasets.)"""
    return [
        (
            "Members by join year",
            ["Year", "Members"],
            [[entry.label, str(entry.value)] for entry in stats.by_join_year],
        ),
        (
            "Growth by Rotary year",
            ["Rotary year", "Joins", "Leaves"],
            [
                [entry.label, str(entry.joins), str(entry.leaves)]
                for entry in stats.growth_by_rotary_year
            ],
        ),
        (
            "Nationality distribution",
            ["Nationality", "Members"],
            [[entry.label, str(entry.value)] for entry in stats.by_nationality],
        ),
        (
            "Tenure distribution (years as Rotarian)",
            ["Years as Rotarian", "Members"],
            [[entry.label, str(entry.value)] for entry in stats.tenure_distribution],
        ),
        (
            "Gender distribution",
            ["Gender", "Members"],
            [[entry.label, str(entry.value)] for entry in stats.by_gender],
        ),
        (
            "Age distribution",
            ["Age bracket", "Members"],
            [[entry.label, str(entry.value)] for entry in stats.age_distribution],
        ),
    ]


def build_pdf_report(stats: MembersStatistics, report_type: str = "simplified") -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter, topMargin=0.5 * inch, bottomMargin=0.5 * inch
    )
    styles = getSampleStyleSheet()
    chart_title_style = styles["Heading4"]
    chart_title_style.fontSize = 9
    chart_title_style.spaceAfter = 2
    story = []

    if LOGO_PATH.exists():
        story.append(Image(str(LOGO_PATH), width=0.6 * inch, height=0.6 * inch))
    story.append(Paragraph(CLUB_NAME, styles["Title"]))
    story.append(Paragraph("Members Statistics Report", styles["Heading2"]))
    story.append(Paragraph(f"Generated {date.today().isoformat()}", styles["Normal"]))
    story.append(Spacer(1, 0.15 * inch))

    card_rows = _stat_cards()
    table_data = []
    for i in range(0, len(card_rows), 4):
        row = card_rows[i : i + 4]
        table_data.append([label for label, _ in row])
        table_data.append([str(getattr(stats, attr) if getattr(stats, attr) is not None else "–") for _, attr in row])
    cards_table = Table(table_data, colWidths=[1.6 * inch] * 4)
    card_style_commands = [
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTSIZE", (0, 1), (-1, 1), 14),
        ("FONTSIZE", (0, 3), (-1, 3), 14),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("FONTNAME", (0, 3), (-1, 3), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 1), (-1, 1), colors.HexColor(ROTARY_BLUE)),
        ("TEXTCOLOR", (0, 3), (-1, 3), colors.HexColor(ROTARY_BLUE)),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dde3ec")),
    ]
    # Color each card's label+value cell pair with the same tone used on the
    # live page, so the report visually matches (Total/Honorary = blue,
    # New/Countries = lavender, Women/Men = teal, Age/Tenure = amber).
    for card_index in range(len(card_rows)):
        col = card_index % 4
        label_row = 0 if card_index < 4 else 2
        value_row = label_row + 1
        tone = colors.HexColor(CARD_TONES[card_index])
        card_style_commands.append(("BACKGROUND", (col, label_row), (col, value_row), tone))
    cards_table.setStyle(TableStyle(card_style_commands))
    story.append(cards_table)
    story.append(Spacer(1, 0.2 * inch))

    # 2-column chart grid (rather than one full-width chart per section) so
    # all 6 charts plus the header/cards above fit in a 2-page PDF.
    chart_items = list(render_charts(stats).items())
    chart_cell_width, chart_cell_height = 3.3 * inch, 1.9 * inch
    grid_rows = []
    for i in range(0, len(chart_items), 2):
        pair = chart_items[i : i + 2]
        cells = []
        for title, png_bytes in pair:
            cells.append(
                [
                    Paragraph(title, chart_title_style),
                    Image(BytesIO(png_bytes), width=chart_cell_width, height=chart_cell_height),
                ]
            )
        if len(cells) == 1:
            cells.append("")
        grid_rows.append(cells)

    charts_table = Table(grid_rows, colWidths=[3.6 * inch, 3.6 * inch])
    charts_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(charts_table)

    if report_type == "integral":
        story.append(PageBreak())
        story.append(Paragraph("Detail — underlying figures", styles["Heading2"]))
        story.append(Spacer(1, 0.1 * inch))
        for title, headers, rows in _detail_tables(stats):
            story.append(Paragraph(title, styles["Heading4"]))
            detail_table = Table([headers] + rows, hAlign="LEFT")
            detail_table.setStyle(
                TableStyle(
                    [
                        ("FONTSIZE", (0, 0), (-1, -1), PDF_BODY_FONT_SIZE),
                        ("FONTSIZE", (0, 0), (-1, 0), PDF_TABLE_HEADER_FONT_SIZE),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dde3ec")),
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(TONE_BLUE_BG)),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("TOPPADDING", (0, 0), (-1, -1), 3),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ]
                )
            )
            story.append(detail_table)
            story.append(Spacer(1, 0.15 * inch))

    doc.build(story)
    return buf.getvalue()


_LAYOUT_METADATA_PLACEHOLDER_TYPES = {"DATE", "FOOTER", "SLIDE_NUMBER"}


def _pick_blank_layout(prs: Presentation):
    """Story 8.23, revised in Story 8.33: a template's background, colour
    bands, and other master-level branding are inherited by any layout that
    doesn't explicitly override them — EXCEPT a layout literally
    named/designed "blank", which typically strips exactly that, silently
    defeating the whole point of the annual-template feature (this was
    8.33's root cause: every generated slide always picked the emptiest
    layout available, so the template's own visual identity never had a
    chance to render).

    Now prefer a layout that carries a title placeholder (idx 0) — so the
    heading inherits the template's real branding — with the FEWEST other
    content placeholders (body/object/picture), since this module draws
    stat cards/charts/tables itself and an unused content placeholder would
    just be empty dead space competing for the same area. A "Title Only"
    layout is the ideal candidate when one exists; a title+subtitle "Title
    Slide" layout is next-best; a content-heavy layout is used only if nothing
    leaner is available. Falls back to a name-matched/last "blank" layout only
    if the template has no title placeholder anywhere."""
    candidates = []
    for layout in prs.slide_layouts:
        has_title = False
        extra_content_count = 0
        for placeholder in layout.placeholders:
            if placeholder.placeholder_format.idx == 0:
                has_title = True
                continue
            type_name = str(placeholder.placeholder_format.type).split(" ")[0]
            if type_name not in _LAYOUT_METADATA_PLACEHOLDER_TYPES:
                extra_content_count += 1
        if has_title:
            candidates.append((extra_content_count, layout))

    if candidates:
        candidates.sort(key=lambda pair: pair[0])
        return candidates[0][1]

    for layout in prs.slide_layouts:
        if layout.name and "blank" in layout.name.lower():
            return layout
    return prs.slide_layouts[-1]


def _title_placeholder(slide):
    return next((ph for ph in slide.placeholders if ph.placeholder_format.idx == 0), None)


def add_heading(slide, using_template: bool, title_text: str, subtitle_text: str, fallback_box):
    """Story 8.33: when a template is active, populate its own title
    placeholder (inherits the template's own font/size/colour) instead of
    drawing a freehand textbox forced into the app's brand blue regardless
    of the template's actual palette. Falls back to the original freehand
    textbox — unchanged — when there's no template or no title placeholder
    on the chosen layout, so the default (non-template) path is untouched."""
    placeholder = _title_placeholder(slide) if using_template else None
    if placeholder is not None:
        tf = placeholder.text_frame
        tf.text = title_text
        subtitle_p = tf.add_paragraph()
        subtitle_p.text = subtitle_text
        return

    left, top, width, height = fallback_box
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.text = title_text
    tf.paragraphs[0].font.size = Pt(22)
    tf.paragraphs[0].font.bold = True
    if not using_template:
        tf.paragraphs[0].font.color.rgb = RGBColor.from_string("17458F")
    subtitle_p = tf.add_paragraph()
    subtitle_p.text = subtitle_text
    subtitle_p.font.size = Pt(11)


def style_card_fill(box, tone_hex: str, using_template: bool) -> None:
    """Story 8.33: the app's own pastel tone colours were being painted over
    every stat card regardless of the template, hiding its background/colour
    bands underneath. When a template is active, leave the card transparent
    (outline only) so the template's branding shows through; keep the solid
    tone fill for the app's own default deck, unchanged."""
    if using_template:
        box.fill.background()
    else:
        box.fill.solid()
        box.fill.fore_color.rgb = RGBColor.from_string(tone_hex.lstrip("#").upper())
    box.line.fill.background()


def style_card_text_color(paragraph, using_template: bool) -> None:
    if not using_template:
        paragraph.font.color.rgb = RGBColor.from_string("17458F")


def build_pptx_report(
    stats: MembersStatistics,
    report_type: str = "simplified",
    template_path: BytesIO | None = None,
) -> bytes:
    """One-slide PPTX: 12 stat cards (4×3) + 4 compact charts (2×2).

    Template mode leaves the district banner/master completely untouched —
    no logo, no heading, no placeholder population.  Content is placed in a
    fixed safe area (1.5 in from top, 0.4 in from bottom) that clears all
    typical district-template banners and footers without relying on
    placeholder geometry (which varies wildly across templates).
    """
    using_template = template_path is not None
    if using_template:
        prs = Presentation(template_path)
    else:
        prs = Presentation()
        prs.slide_width = Inches(13.333)
        prs.slide_height = Inches(7.5)

    # Scale every EMU so the layout fits regardless of the template's slide
    # dimensions (4:3, 10 in wide, etc.).  Exactly 1.0 for the default deck.
    scale = prs.slide_width / Inches(13.333)

    def sc(emu):
        return int(emu * scale)

    if using_template and len(prs.slides) > 0:
        # Write directly onto the template's first slide so its background,
        # banner, and master-level design are preserved exactly as designed.
        # Remove any content placeholders (title, body, subtitle) so they
        # don't clash with our statistics shapes, but keep all decorative
        # shapes (logos, colour bands, images) that live as regular shapes.
        slide = prs.slides[0]
        for ph in list(slide.placeholders):
            ph._element.getparent().remove(ph._element)
    else:
        blank_layout = (
            _pick_blank_layout(prs) if using_template else prs.slide_layouts[6]
        )
        slide = prs.slides.add_slide(blank_layout)

    # ── Content area ──────────────────────────────────────────────────────────
    if using_template:
        # Leave the district banner completely untouched — no logo, no heading,
        # no placeholder population.  A fixed 1.5 in top margin clears virtually
        # all district templates; 0.4 in bottom clears typical footers.
        content_top    = sc(Inches(1.5))
        content_bottom = prs.slide_height - sc(Inches(0.4))
    else:
        # Default deck: add Rotary logo + freehand heading.
        logo_right_edge = sc(Inches(0.3))
        if LOGO_PATH.exists():
            logo_pic = slide.shapes.add_picture(
                str(LOGO_PATH), sc(Inches(0.3)), sc(Inches(0.2)), height=sc(Inches(0.6))
            )
            logo_right_edge = logo_pic.left + logo_pic.width
        heading_left = logo_right_edge + sc(Inches(0.2))
        add_heading(
            slide,
            False,
            f"{CLUB_NAME} — Members Statistics",
            f"Generated {date.today().isoformat()}",
            (
                heading_left,
                sc(Inches(0.18)),
                prs.slide_width - heading_left - sc(Inches(0.3)),
                sc(Inches(0.65)),
            ),
        )
        content_top    = sc(Inches(0.95))
        content_bottom = prs.slide_height - sc(Inches(0.12))

    # ── Geometry ──────────────────────────────────────────────────────────────
    content_h   = content_bottom - content_top
    margin_x    = sc(Inches(0.25))
    content_w   = prs.slide_width - 2 * margin_x
    gap_x       = sc(Inches(0.10))
    gap_y       = sc(Inches(0.07))
    chart_gap_x = sc(Inches(0.12))
    chart_gap_y = sc(Inches(0.10))

    # 12 stat cards: 4 columns × 3 rows, using 38 % of available height
    card_cols = 4
    card_w    = (content_w - (card_cols - 1) * gap_x) // card_cols
    card_h    = max(sc(Inches(0.55)), (int(content_h * 0.38) - 2 * gap_y) // 3)

    # ── 12 stat cards ─────────────────────────────────────────────────────────
    for idx, (label, attr, tone) in enumerate(_PPTX_STAT_CARDS):
        col  = idx % card_cols
        row  = idx // card_cols
        left = margin_x + col * (card_w + gap_x)
        top  = content_top + row * (card_h + gap_y)

        if attr is None:
            value_str = stats.charter_president_name or "—"
        elif attr in ("women_count", "men_count") and stats.total_members:
            v         = getattr(stats, attr)
            pct       = round(v / stats.total_members * 100)
            value_str = f"{v}  ·  {pct}%"
        else:
            v         = getattr(stats, attr)
            value_str = str(v if v is not None else "–")

        box            = slide.shapes.add_textbox(left, top, card_w, card_h)
        style_card_fill(box, tone, using_template)
        tf             = box.text_frame
        tf.margin_left = Pt(5)
        tf.margin_top  = Pt(3)
        tf.text        = value_str
        tf.paragraphs[0].font.size = Pt(16)
        tf.paragraphs[0].font.bold = True
        style_card_text_color(tf.paragraphs[0], using_template)
        label_p           = tf.add_paragraph()
        label_p.text      = label
        label_p.font.size = Pt(7)

    # ── 4 charts in 2 × 2 grid ────────────────────────────────────────────────
    # Charts are generated at _PPTX_CHART_FIGSIZE so their natural aspect ratio
    # matches the intended cell shape; width-only placement preserves it exactly.
    cards_bottom  = content_top + 3 * (card_h + gap_y) - gap_y
    chart_start_y = cards_bottom + sc(Inches(0.15))
    chart_w       = (content_w - chart_gap_x) // 2
    _fw, _fh      = _PPTX_CHART_FIGSIZE
    chart_h_est   = int(chart_w * _fh / _fw)  # used only for row-2 offset

    pptx_charts = render_pptx_4charts(stats)
    for idx, title in enumerate(_PPTX_CHART_TITLES):
        png_bytes = pptx_charts[title]
        col  = idx % 2
        row  = idx // 2
        left = margin_x + col * (chart_w + chart_gap_x)
        top  = chart_start_y + row * (chart_h_est + chart_gap_y)
        slide.shapes.add_picture(BytesIO(png_bytes), left, top, width=chart_w)

    if report_type == "integral":
        _add_pptx_detail_slides(prs, blank_layout, stats, sc, using_template)

    buf = BytesIO()
    prs.save(buf)
    return buf.getvalue()


def _add_pptx_detail_slides(
    prs: Presentation, blank_layout, stats: MembersStatistics, sc, using_template: bool = False
) -> None:
    """Story 8.13: one detail slide per chart dataset, appended after the
    main Simplified slide, for Integral reports. Tables aren't paginated
    across slides if a dataset has many rows (e.g. many distinct join
    years) — a known simplification given this app's small member base."""
    for title, headers, rows in _detail_tables(stats):
        slide = prs.slides.add_slide(blank_layout)

        placeholder = _title_placeholder(slide) if using_template else None
        if placeholder is not None:
            placeholder.text_frame.text = title
        else:
            title_box = slide.shapes.add_textbox(
                sc(Inches(0.4)), sc(Inches(0.3)), sc(Inches(9)), sc(Inches(0.6))
            )
            title_tf = title_box.text_frame
            title_tf.text = title
            title_tf.paragraphs[0].font.size = Pt(20)
            title_tf.paragraphs[0].font.bold = True
            if not using_template:
                title_tf.paragraphs[0].font.color.rgb = RGBColor.from_string("17458F")

        table_rows = len(rows) + 1
        table_shape = slide.shapes.add_table(
            table_rows,
            len(headers),
            sc(Inches(0.4)),
            sc(Inches(1.1)),
            sc(Inches(9)),
            sc(Inches(min(0.4 * table_rows, 5.5))),
        )
        table = table_shape.table
        for col_index, header in enumerate(headers):
            cell = table.cell(0, col_index)
            cell.text = header
            cell.text_frame.paragraphs[0].font.bold = True
            cell.text_frame.paragraphs[0].font.size = Pt(11)
        for row_index, row_values in enumerate(rows, start=1):
            for col_index, value in enumerate(row_values):
                cell = table.cell(row_index, col_index)
                cell.text = value
                cell.text_frame.paragraphs[0].font.size = Pt(10)
