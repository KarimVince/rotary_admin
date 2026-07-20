import httpx
import pytest

from app.core.donation_statistics_report import resolve_logo_bytes

pytestmark = pytest.mark.unit


def test_resolve_logo_bytes_returns_none_for_missing_url():
    assert resolve_logo_bytes(None) is None
    assert resolve_logo_bytes("") is None


def test_resolve_logo_bytes_returns_none_when_local_fallback_file_absent():
    # Pre-migration relative path, no file actually on disk for this fixture.
    assert resolve_logo_bytes("/static/organisations/does-not-exist.png") is None


def test_resolve_logo_bytes_fetches_absolute_supabase_url(monkeypatch):
    def fake_get(url, timeout=None):
        assert url == "https://proj.supabase.co/storage/v1/object/public/public-assets/organisations/abc.png"
        return httpx.Response(200, content=b"logo-bytes")

    monkeypatch.setattr(httpx, "get", fake_get)

    result = resolve_logo_bytes(
        "https://proj.supabase.co/storage/v1/object/public/public-assets/organisations/abc.png"
    )
    assert result is not None
    assert result.read() == b"logo-bytes"


def test_resolve_logo_bytes_returns_none_on_non_200_response(monkeypatch):
    monkeypatch.setattr(httpx, "get", lambda url, timeout=None: httpx.Response(404))

    assert resolve_logo_bytes("https://proj.supabase.co/storage/v1/object/public/x/y.png") is None


def test_resolve_logo_bytes_returns_none_on_request_error(monkeypatch):
    def fake_get(url, timeout=None):
        raise httpx.ConnectError("boom")

    monkeypatch.setattr(httpx, "get", fake_get)

    assert resolve_logo_bytes("https://proj.supabase.co/storage/v1/object/public/x/y.png") is None
