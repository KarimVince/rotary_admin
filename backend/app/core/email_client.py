import httpx

from app.core.config import settings

# Verified against https://resend.com/docs/api-reference/emails/send-email —
# `to` accepts an array of recipients in one call, but we still send one
# request per recipient (see app/api/member_email.py) so a single bad address
# can't sink the whole batch; each attempt is tracked independently.
RESEND_API_URL = "https://api.resend.com/emails"


class EmailSendError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def send_email(
    *,
    to_email: str,
    to_name: str,
    subject: str,
    html_body: str,
    attachments: dict[str, str] | None = None,
) -> None:
    if not settings.resend_api_key:
        raise EmailSendError("Resend API key is not configured")

    payload = {
        "from": f"{settings.resend_from_name} <{settings.resend_from_email}>",
        "to": [f"{to_name} <{to_email}>"],
        "subject": subject,
        "html": html_body,
    }
    # Resend's attachments are an array of {filename, path} objects — path is
    # a publicly-accessible URL that Resend fetches itself, same as our
    # existing {filename: url} attachment records, so we just reshape them.
    if attachments:
        payload["attachments"] = [
            {"filename": filename, "path": url} for filename, url in attachments.items()
        ]

    try:
        response = httpx.post(
            RESEND_API_URL,
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        raise EmailSendError(f"Resend API request failed: {exc}") from exc

    if response.status_code != 200:
        raise EmailSendError(
            f"Resend API returned {response.status_code}: {response.text}",
            status_code=response.status_code,
        )

    body = response.json()
    if not body.get("id"):
        raise EmailSendError(f"Resend API reported failure: {body}")
