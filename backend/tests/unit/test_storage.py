import httpx
import pytest

from app.core import storage
from app.core.config import settings

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _fake_supabase_settings(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "https://proj.supabase.co")
    monkeypatch.setattr(settings, "supabase_service_role_key", "test-service-role-key")


def test_upload_object_raises_clear_error_when_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "supabase_url", "")

    with pytest.raises(storage.StorageError, match="SUPABASE_URL is not configured"):
        storage.upload_object("public-assets", "members/abc.png", b"bytes", "image/png")


def test_public_url_builds_expected_shape():
    url = storage.public_url("public-assets", "members/abc.png")
    assert url == "https://proj.supabase.co/storage/v1/object/public/public-assets/members/abc.png"


def test_upload_object_posts_content_and_returns_public_url(monkeypatch):
    captured = {}

    def fake_post(url, content=None, headers=None, timeout=None):
        captured["url"] = url
        captured["content"] = content
        captured["headers"] = headers
        return httpx.Response(200)

    monkeypatch.setattr(httpx, "post", fake_post)

    result = storage.upload_object("public-assets", "members/abc.png", b"bytes", "image/png")

    assert captured["url"] == "https://proj.supabase.co/storage/v1/object/public-assets/members/abc.png"
    assert captured["content"] == b"bytes"
    assert captured["headers"]["Authorization"] == "Bearer test-service-role-key"
    assert captured["headers"]["Content-Type"] == "image/png"
    assert captured["headers"]["x-upsert"] == "true"
    assert result == "https://proj.supabase.co/storage/v1/object/public/public-assets/members/abc.png"


def test_upload_object_raises_storage_error_on_failure(monkeypatch):
    monkeypatch.setattr(httpx, "post", lambda *a, **k: httpx.Response(500, text="boom"))

    with pytest.raises(storage.StorageError):
        storage.upload_object("public-assets", "members/abc.png", b"bytes", "image/png")


def test_download_object_returns_bytes(monkeypatch):
    monkeypatch.setattr(httpx, "get", lambda *a, **k: httpx.Response(200, content=b"hello"))

    assert storage.download_object("ppt-templates", "2026.pptx") == b"hello"


def test_download_object_raises_not_found_on_404(monkeypatch):
    monkeypatch.setattr(httpx, "get", lambda *a, **k: httpx.Response(404))

    with pytest.raises(storage.StorageNotFoundError):
        storage.download_object("ppt-templates", "2026.pptx")


def test_delete_object_sends_prefixes_body(monkeypatch):
    captured = {}

    def fake_request(method, url, json=None, headers=None, timeout=None):
        captured["method"] = method
        captured["url"] = url
        captured["json"] = json
        return httpx.Response(200)

    monkeypatch.setattr(httpx, "request", fake_request)

    storage.delete_object("ppt-templates", "2026.pptx")

    assert captured["method"] == "DELETE"
    assert captured["url"] == "https://proj.supabase.co/storage/v1/object/ppt-templates"
    assert captured["json"] == {"prefixes": ["2026.pptx"]}


def test_delete_object_raises_not_found_on_404(monkeypatch):
    monkeypatch.setattr(httpx, "request", lambda *a, **k: httpx.Response(404))

    with pytest.raises(storage.StorageNotFoundError):
        storage.delete_object("ppt-templates", "2026.pptx")
