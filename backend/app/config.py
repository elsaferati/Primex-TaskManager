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
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800
    REDIS_ENABLED: bool = True
    REDIS_URL: str = "redis://localhost:6379/0"
    APP_TIMEZONE: str = "Europe/Budapest"
    SYSTEM_TASK_SCHEDULER_ENABLED: bool = True
    SYSTEM_TASK_SCHEDULER_HOUR: int = 6
    SYSTEM_TASK_SCHEDULER_MINUTE: int = 0
    SYSTEM_TASK_SCHEDULER_DAY_OF_WEEK: str = "fri"
    SYSTEM_TASK_GENERATE_AHEAD_DAYS: int = 7

     # Add these three lines:
    ADMIN_EMAIL: str | None = None
    ADMIN_USERNAME: str | None = None
    ADMIN_PASSWORD: str | None = None

    JWT_SECRET: str
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    AUTH_COOKIE_SECURE: bool | None = None
    AUTH_COOKIE_SAMESITE: str | None = None
    AUTH_COOKIE_DOMAIN: str | None = None

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

    OPENAI_API_KEY: str | None = None
    SPEECH_TRANSCRIBE_MODEL: str = "whisper-1"
    SPEECH_MAX_FILE_MB: int = 20
    SPEECH_ALLOWED_MIME: str | None = None

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

    @property
    def auth_cookie_secure(self) -> bool:
        if self.AUTH_COOKIE_SECURE is not None:
            return self.AUTH_COOKIE_SECURE
        return self.FRONTEND_URL.startswith("https://") or any(
            origin.startswith("https://") for origin in self.cors_origin_list
        )

    @property
    def auth_cookie_samesite(self) -> str:
        value = (self.AUTH_COOKIE_SAMESITE or "").strip().lower()
        if value not in {"lax", "strict", "none"}:
            return "none" if self.auth_cookie_secure else "lax"
        if value == "none" and not self.auth_cookie_secure:
            return "lax"
        return value


settings = Settings()


