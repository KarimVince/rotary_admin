from io import BytesIO

import pytest

from app.core.board_members_report import (
    _category_label,
    _page_category_counts,
    _sorted_board_rows,
    build_pdf_report,
    build_pptx_report,
    resolve_member_photo_bytes,
)

pytestmark = pytest.mark.unit


def _row(name, at_the_board, role="Committee Member"):
    return {
        "name": name,
        "role": role,
        "at_the_board": at_the_board,
        "age": 40,
        "years_as_rotarian": 5,
        "photo_bytes": None,
    }


def test_sorted_board_rows_puts_board_seats_first_stable():
    rows = [
        _row("Alpha", False),
        _row("Beta", True),
        _row("Gamma", False),
        _row("Delta", True),
    ]
    sorted_rows = _sorted_board_rows(rows)
    assert [row["name"] for row in sorted_rows] == ["Beta", "Delta", "Alpha", "Gamma"]


def test_page_category_counts_board_before_non_board():
    page = [_row("A", True), _row("B", True), _row("C", False)]
    counts = _page_category_counts(page)
    assert counts == [(True, 2), (False, 1)]


def test_category_label():
    assert _category_label(True) == "Board"
    assert _category_label(False) == "Non-Board"


def test_resolve_member_photo_bytes_returns_none_for_missing_url():
    assert resolve_member_photo_bytes(None) is None
    assert resolve_member_photo_bytes("") is None


def test_build_pdf_report_empty_roster_does_not_crash():
    pdf_bytes = build_pdf_report(2026, [])
    assert pdf_bytes[:4] == b"%PDF"


def test_build_pptx_report_empty_roster_does_not_crash():
    pptx_bytes = build_pptx_report(2026, [], chrome="plain")
    assert pptx_bytes[:2] == b"PK"


def test_build_pptx_report_handles_missing_age_and_years():
    # A member with no date_of_birth/rotarian_since (age/years both None)
    # must render "—" rather than crash on str(None) formatting.
    row = {
        "name": "No DOB Member",
        "role": "Committee Member",
        "at_the_board": False,
        "age": None,
        "years_as_rotarian": None,
        "photo_bytes": None,
    }
    pptx_bytes = build_pptx_report(2026, [row], chrome="plain")
    assert pptx_bytes[:2] == b"PK"
    pdf_bytes = build_pdf_report(2026, [row])
    assert pdf_bytes[:4] == b"%PDF"


def test_build_pptx_report_paginates_at_fifteen_per_slide():
    # _BOARD_CARDS_PER_SLIDE = 15; 16 board-seat rows → 2 slides.
    # All rows have at_the_board=True so none are filtered out.
    rows = [_row(f"Member {i}", at_the_board=True) for i in range(16)]
    pptx_bytes = build_pptx_report(2026, rows, chrome="plain")
    from pptx import Presentation

    prs = Presentation(BytesIO(pptx_bytes))
    assert len(prs.slides) == 2
