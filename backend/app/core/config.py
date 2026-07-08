from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://user:password@localhost:5432/rotary_admin"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    resend_api_key: str = ""
    resend_from_email: str = "no-reply@rotaryadmin.app"
    resend_from_name: str = "Rotary Club of Discovery Bay"

    admin_email: str = "admin@rotaryadmin.app"
    admin_password: str = "change-me"
    admin_full_name: str = "Admin"

    # Static v1 template — club bank details etc. Shown verbatim in fee invoice
    # emails until fee_settings grows a per-year override (not needed yet).
    fee_payment_instructions: str = (
        "Please settle your membership fee by bank transfer to the club account. "
        "Contact the treasurer for the account details."
    )

    # Origin the frontend is reachable at, used to build password-reset links
    # sent by email (e.g. f"{frontend_base_url}/reset-password?token=...").
    frontend_base_url: str = "http://localhost:5173"

    upload_dir: str = "uploads"
    # Absolute origin the backend is reachable at, used to build fully-qualified
    # URLs for resources external services must fetch (e.g. email attachment
    # URLs passed to Resend via the attachment `path` field, which fetches the
    # file itself rather than accepting raw bytes).
    public_base_url: str = "http://localhost:8000"
    max_email_attachment_bytes: int = 10 * 1024 * 1024

    # CORS_ALLOWED_ORIGINS is comma-separated, e.g.
    # "http://localhost:5173,https://staging.example.com". Kept as a plain
    # string field (rather than list[str]) so pydantic-settings doesn't try
    # to JSON-parse the env var; split via cors_allowed_origins below.
    cors_allowed_origins_csv: str = Field(
        default="http://localhost:5173", alias="CORS_ALLOWED_ORIGINS"
    )

    @property
    def cors_allowed_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_allowed_origins_csv.split(",")
            if origin.strip()
        ]


settings = Settings()
