"""Shared image-resolution helpers for report generation (PDF/PPTX).

Both the NGO Donations Statistics report (`donation_statistics_report.py`)
and the Board Members report (`board_members_report.py`) need the same two
things: fetch a stored image (Supabase Storage URL, with a pre-migration
local-disk fallback) tolerating a missing file, and make an arbitrary image
safe to hand to python-pptx's `add_picture` (which rejects some formats,
e.g. WEBP, outright — see `pptx_safe_image`'s own docstring). Lives in one
place rather than duplicated per report module.
"""

from io import BytesIO
from pathlib import Path

import httpx
from PIL import Image as PILImage

from app.core.config import settings


def resolve_stored_image_bytes(url: str | None, local_subdir: str) -> BytesIO | None:
    """`local_subdir` is the pre-migration local-disk fallback folder under
    `settings.upload_dir` (e.g. "organisations" for NGO logos, "members"
    for member photos — see `storage.py`'s own module docstring for that
    bucket/subdir convention). A full Supabase Storage URL (the normal case
    for anything uploaded after the relevant migration) is fetched
    directly instead."""
    if not url:
        return None
    if url.startswith("http://") or url.startswith("https://"):
        try:
            response = httpx.get(url, timeout=10.0)
        except httpx.HTTPError:
            return None
        return BytesIO(response.content) if response.status_code == 200 else None
    filename = url.rsplit("/", 1)[-1]
    path = Path(settings.upload_dir) / local_subdir / filename
    return BytesIO(path.read_bytes()) if path.exists() else None


def pptx_safe_image(image_bytes: BytesIO) -> BytesIO | None:
    """python-pptx's `add_picture` rejects WEBP outright (`ValueError:
    unsupported image format` — its own supported-format list is just
    BMP/GIF/JPEG/PNG/TIFF/WMF, no WEBP), which a real uploaded logo/photo
    can be (both org logos and member photos allow WEBP uploads).
    reportlab's `Image` flowable on the PDF side doesn't have this problem
    (decodes via PIL directly, no format allowlist). Re-encodes to PNG via
    Pillow first; returns None (image silently skipped) if the bytes can't
    be decoded as an image at all (e.g. a corrupt file)."""
    try:
        image_bytes.seek(0)
        with PILImage.open(image_bytes) as image:
            image.load()
            png_buf = BytesIO()
            image.convert("RGBA").save(png_buf, format="PNG")
        png_buf.seek(0)
        return png_buf
    except Exception:
        return None
