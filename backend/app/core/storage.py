"""Story 16.6 — Supabase Storage-backed file storage for member photos, NGO
logos, and PPT templates, replacing local disk. Render's free-tier
filesystem is ephemeral (wiped on every restart/redeploy), so anything
written to `settings.upload_dir` for these three upload types was being lost
in production.

Talks to Supabase's Storage REST API directly via `httpx` (already a
dependency) rather than pulling in the `supabase`/`storage3` SDK — the app
only ever needs upload/download/delete/public-URL, a handful of small HTTP
calls, not a full client.

Two buckets (create both in the Supabase dashboard before using this):
- `PUBLIC_ASSETS_BUCKET` ("public-assets", public read) — member photos
  under `members/`, NGO logos under `organisations/`.
- `PPT_TEMPLATES_BUCKET` ("ppt-templates", private) — one `{rotary_year}.pptx`
  per year, read back only by the backend (service-role key) for report
  generation; never served to the browser.
"""
import httpx

from app.core.config import settings

PUBLIC_ASSETS_BUCKET = "public-assets"
PPT_TEMPLATES_BUCKET = "ppt-templates"

_TIMEOUT = 30.0


class StorageError(RuntimeError):
    """A Supabase Storage request failed."""


class StorageNotFoundError(StorageError):
    """The requested object doesn't exist in the bucket."""


def _base_url() -> str:
    if not settings.supabase_url:
        raise StorageError(
            "SUPABASE_URL is not configured — set it (and SUPABASE_SERVICE_ROLE_KEY) "
            "in the environment before uploading files. See .env.example."
        )
    return f"{settings.supabase_url}/storage/v1"


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "apikey": settings.supabase_service_role_key,
    }


def upload_object(bucket: str, path: str, content: bytes, content_type: str) -> str:
    """Uploads (or overwrites, via x-upsert) an object. Returns its public URL
    — meaningful only for a public bucket; harmless to call for a private one
    since the caller can just ignore the return value."""
    response = httpx.post(
        f"{_base_url()}/object/{bucket}/{path}",
        content=content,
        headers={**_headers(), "Content-Type": content_type, "x-upsert": "true"},
        timeout=_TIMEOUT,
    )
    if response.status_code >= 400:
        raise StorageError(f"Supabase upload failed ({response.status_code}): {response.text}")
    return public_url(bucket, path)


def delete_object(bucket: str, path: str) -> None:
    response = httpx.request(
        "DELETE",
        f"{_base_url()}/object/{bucket}",
        json={"prefixes": [path]},
        headers=_headers(),
        timeout=_TIMEOUT,
    )
    if response.status_code == 404:
        raise StorageNotFoundError(f"{bucket}/{path} not found")
    if response.status_code >= 400:
        raise StorageError(f"Supabase delete failed ({response.status_code}): {response.text}")


def download_object(bucket: str, path: str) -> bytes:
    response = httpx.get(f"{_base_url()}/object/{bucket}/{path}", headers=_headers(), timeout=_TIMEOUT)
    if response.status_code == 404:
        raise StorageNotFoundError(f"{bucket}/{path} not found")
    if response.status_code >= 400:
        raise StorageError(f"Supabase download failed ({response.status_code}): {response.text}")
    return response.content


def public_url(bucket: str, path: str) -> str:
    return f"{settings.supabase_url}/storage/v1/object/public/{bucket}/{path}"
