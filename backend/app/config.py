from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Nguyen Huu Hai Portfolio API"
    app_env: str = "development"
    database_url: str = "sqlite:///./portfolio.db"
    redis_url: str = "redis://localhost:6379/0"
    keycloak_internal_url: str = "http://localhost:8080/auth"
    keycloak_issuer: str = "http://localhost:3000/auth/realms/personal-web"
    keycloak_realm: str = "personal-web"
    cors_origins: str = "http://localhost:3000"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    # Để trống username/password khi dùng Mailpit (dev). Production: điền thông tin SMTP thật
    # (Gmail App Password, Brevo, Resend, Amazon SES...) và bật STARTTLS (cổng 587).
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = False
    smtp_from: str = "portfolio@local.test"
    contact_receiver_email: str = "hai@example.com"

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def keycloak_jwks_url(self) -> str:
        return (
            f"{self.keycloak_internal_url}/realms/"
            f"{self.keycloak_realm}/protocol/openid-connect/certs"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

