from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.15.118:3000",
    "http://192.168.15.117:3000",
    "http://primeflow.primexeu.com",
    "https://primeflow.primexeu.com",
    "https://www.primeflow.primexeu.com",
]
DEFAULT_CORS_ORIGINS_CSV = ",".join(DEFAULT_CORS_ORIGINS)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_ignore_empty=True,  extra="ignore")

    DATABASE_URL: str
    REDIS_ENABLED: bool = True
    REDIS_URL: str = "redis://localhost:6379/0"

     # Add these three lines:
    ADMIN_EMAIL: str | None = None
    ADMIN_USERNAME: str | None = None
    ADMIN_PASSWORD: str | None = None

    JWT_SECRET: str
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    CORS_ORIGINS: str = DEFAULT_CORS_ORIGINS_CSV

    # Microsoft Teams/Graph API Configuration
    MS_CLIENT_ID: str | None = None
    MS_CLIENT_SECRET: str | None = None
    MS_TENANT_ID: str | None = None
    MS_REDIRECT_URI: str | None = None

    FRONTEND_URL: str = "http://localhost:3000"

    GA_NOTES_UPLOAD_DIR: str = "uploads/ga-notes"
    GA_NOTES_MAX_FILES: int = 20
    GA_NOTES_MAX_FILE_MB: int = 25

    @property
    def cors_origin_list(self) -> list[str]:
        env_origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        merged: list[str] = []
        seen: set[str] = set()
        for origin in [*DEFAULT_CORS_ORIGINS, *env_origins]:
            if origin in seen:
                continue
            seen.add(origin)
            merged.append(origin)
        return merged


settings = Settings()


