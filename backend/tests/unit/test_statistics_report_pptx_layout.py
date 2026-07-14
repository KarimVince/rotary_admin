from io import BytesIO
from pathlib import Path

import pytest
from pptx import Presentation
from pptx.util import Inches

from app.core.statistics_report import build_pptx_report
from app.schemas.member_statistics import MembersStatistics

pytestmark = pytest.mark.unit


def _empty_stats() -> MembersStatistics:
    return MembersStatistics(
        by_status=[],
        by_join_year=[],
        growth_by_rotary_year=[],
        by_nationality=[],
        age_distribution=[],
        tenure_distribution=[],
        by_gender=[],
        total_members=0,
        honorary_members=0,
        new_members_this_rotary_year=0,
        countries_represented=0,
        women_count=0,
        men_count=0,
        average_age=None,
        average_tenure_as_rotarian=None,
    )


def test_title_heading_does_not_overlap_the_logo():
    pptx_bytes = build_pptx_report(_empty_stats())
    prs = Presentation(BytesIO(pptx_bytes))
    slide = prs.slides[0]

    picture = next(shape for shape in slide.shapes if shape.shape_type == 13)  # PICTURE
    heading_box = next(
        shape
        for shape in slide.shapes
        if shape.has_text_frame and "Members Statistics Report" in shape.text_frame.text
    )

    logo_right_edge = picture.left + picture.width
    assert heading_box.left >= logo_right_edge, (
        "Heading textbox starts before the logo's right edge — they overlap"
    )


def test_simplified_report_has_a_single_slide():
    pptx_bytes = build_pptx_report(_empty_stats(), report_type="simplified")
    prs = Presentation(BytesIO(pptx_bytes))
    assert len(prs.slides) == 1


def test_integral_report_adds_one_detail_slide_per_chart_dataset():
    # 6 chart datasets (join year, growth, nationality, tenure, gender, age)
    # => 1 main slide + 6 detail slides, per _detail_tables in statistics_report.py.
    pptx_bytes = build_pptx_report(_empty_stats(), report_type="integral")
    prs = Presentation(BytesIO(pptx_bytes))
    assert len(prs.slides) == 7


def test_template_slide_size_is_respected_and_content_still_fits():
    # A non-default (non-13.333in-wide) template should have its own slide
    # size preserved, with the from-scratch content scaled to it rather than
    # overflowing past its right/bottom edge.
    template_prs = Presentation()
    template_prs.slide_width = Inches(10)
    template_prs.slide_height = Inches(5.625)
    template_buf = BytesIO()
    template_prs.save(template_buf)
    template_buf.seek(0)

    template_path = Path("/tmp/test-ppt-template-unit.pptx")
    template_path.write_bytes(template_buf.getvalue())
    try:
        pptx_bytes = build_pptx_report(_empty_stats(), template_path=template_path)
        prs = Presentation(BytesIO(pptx_bytes))
        assert prs.slide_width == Inches(10)

        for shape in prs.slides[0].shapes:
            assert shape.left + shape.width <= prs.slide_width
            assert shape.top + shape.height <= prs.slide_height
    finally:
        template_path.unlink()
