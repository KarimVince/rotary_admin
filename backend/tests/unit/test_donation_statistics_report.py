import pytest

from app.core.donation_statistics_report import resolve_logo_path

pytestmark = pytest.mark.unit


def test_resolve_logo_path_returns_none_for_missing_url():
    assert resolve_logo_path(None) is None
    assert resolve_logo_path("") is None


def test_resolve_logo_path_returns_none_when_file_absent():
    # No file actually written to the upload dir for this fake filename.
    assert resolve_logo_path("/static/organisations/does-not-exist.png") is None
