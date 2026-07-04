from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://user:password@localhost:5432/rotary_admin"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    sender_api_key: str = ""
    sender_from_email: str = "no-reply@rotaryadmin.app"
    sender_from_name: str = "Rotary Club of Discovery Bay"

    admin_email: str = "admin@rotaryadmin.app"
    admin_password: str = "change-me"
    admin_full_name: str = "Admin"

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
