import httpx

from app.core.config import settings

# Verified against https://api.sender.net/transactional-campaigns/send-transactional/ —
# the `to` field is a single recipient object, not an array, so bulk sends
# require one request per recipient (see app/api/member_email.py).
SENDER_API_URL = "https://api.sender.net/v2/message/send"


class SenderAPIError(Exception):
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
    if not settings.sender_api_key:
        raise SenderAPIError("Sender API key is not configured")

    payload = {
        "from": {"email": settings.sender_from_email, "name": settings.sender_from_name},
        "to": {"email": to_email, "name": to_name},
        "subject": subject,
        "html": html_body,
    }
    # Sender's API takes attachments as {filename: publicly_accessible_url} —
    # it fetches the file itself rather than accepting raw bytes/base64.
    if attachments:
        payload["attachments"] = attachments

    try:
        response = httpx.post(
            SENDER_API_URL,
            headers={
                "Authorization": f"Bearer {settings.sender_api_key}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        raise SenderAPIError(f"Sender API request failed: {exc}") from exc

    if response.status_code != 200:
        raise SenderAPIError(
            f"Sender API returned {response.status_code}: {response.text}",
            status_code=response.status_code,
        )

    body = response.json()
    if not body.get("success"):
        raise SenderAPIError(f"Sender API reported failure: {body}")
