from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://user:password@localhost:5432/rotary_admin"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    sender_api_key: str = ""

    admin_email: str = "admin@rotaryadmin.app"
    admin_password: str = "change-me"
    admin_full_name: str = "Admin"


settings = Settings()
