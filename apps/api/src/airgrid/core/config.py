import os
from typing import List, Optional, Union
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Core System
    AIRGRID_ENV: str = "development"
    AIRGRID_DEBUG: bool = True
    AIRGRID_SECRET_KEY: str = "airgrid-dev-secret-key-minimum-32-chars-long"
    AIRGRID_API_HOST: str = "127.0.0.1"
    AIRGRID_API_PORT: int = 8000
    AIRGRID_ALLOWED_ORIGINS: Union[str, List[str]] = "http://localhost:5173,http://127.0.0.1:5173"

    @field_validator("AIRGRID_ALLOWED_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
    # Authentication & Sessions
    AIRGRID_SESSION_COOKIE_NAME: str = "airgrid_session"
    AIRGRID_CSRF_COOKIE_NAME: str = "airgrid_csrf"
    AIRGRID_SESSION_MAX_AGE_SECONDS: int = 60 * 60 * 24 * 7  # 7 days
    AIRGRID_SESSION_IDLE_TIMEOUT_SECONDS: int = 60 * 60 * 24  # 24 hours
    AIRGRID_COOKIE_SECURE: Optional[bool] = None
    AIRGRID_COOKIE_SAMESITE: str = "lax"
    AIRGRID_RATE_LIMIT_LOGIN_ATTEMPTS: int = 5
    AIRGRID_RATE_LIMIT_WINDOW_SECONDS: int = 300  # 5 minutes

    def get_cookie_secure(self, request_is_https: bool = False) -> bool:
        """
        Determines whether the Secure cookie flag must be enforced:
        - If AIRGRID_COOKIE_SECURE is explicitly set, honor it.
        - If running in production or staging, enforce Secure=True.
        - If incoming request is HTTPS or forwarded as HTTPS, enforce Secure=True.
        - In plain HTTP development, returns False.
        """
        if self.AIRGRID_COOKIE_SECURE is not None:
            return self.AIRGRID_COOKIE_SECURE
        if self.AIRGRID_ENV.lower() in ("production", "prod", "staging"):
            return True
        return request_is_https

    # Database
    AIRGRID_DB_HOST: str = "127.0.0.1"
    AIRGRID_DB_PORT: int = 5432
    AIRGRID_DB_USER: str = "airgrid"
    AIRGRID_DB_PASSWORD: str = "airgrid_local_dev_secret"
    AIRGRID_DB_NAME: str = "airgrid_db"
    DATABASE_URL: str = "postgresql+asyncpg://airgrid:airgrid_local_dev_secret@127.0.0.1:5432/airgrid_db"
    DATABASE_URL_SYNC: str = "postgresql://airgrid:airgrid_local_dev_secret@127.0.0.1:5432/airgrid_db"

    # Database - Isolated Test Target
    AIRGRID_TEST_DB_NAME: str = "airgrid_test_db"
    TEST_DATABASE_URL: Optional[str] = None
    TEST_DATABASE_URL_SYNC: Optional[str] = None

    def get_test_database_url(self) -> str:
        if self.TEST_DATABASE_URL:
            return self.TEST_DATABASE_URL
        return f"postgresql+asyncpg://{self.AIRGRID_DB_USER}:{self.AIRGRID_DB_PASSWORD}@{self.AIRGRID_DB_HOST}:{self.AIRGRID_DB_PORT}/{self.AIRGRID_TEST_DB_NAME}"

    def get_test_database_url_sync(self) -> str:
        if self.TEST_DATABASE_URL_SYNC:
            return self.TEST_DATABASE_URL_SYNC
        return f"postgresql://{self.AIRGRID_DB_USER}:{self.AIRGRID_DB_PASSWORD}@{self.AIRGRID_DB_HOST}:{self.AIRGRID_DB_PORT}/{self.AIRGRID_TEST_DB_NAME}"


    # AI Gateway (Server-Side Only)
    AIRGRID_AI_ENABLED: bool = False
    AIRGRID_AI_PROVIDER: str = "openai_compatible"
    AIRGRID_AI_API_BASE_URL: str = ""
    AIRGRID_AI_API_KEY: str = ""
    AIRGRID_AI_DEFAULT_MODEL: str = ""
    AIRGRID_AI_TIMEOUT_SECONDS: int = Field(default=30, ge=1, le=60)
    AIRGRID_AI_TEMPERATURE: float = 0.2

    # n8n Automation & Webhook
    AIRGRID_N8N_PORT: int = 5680
    AIRGRID_N8N_WEBHOOK_URL: str = "http://127.0.0.1:5680/webhook/airgrid-events"
    AIRGRID_WEBHOOK_SECRET: str = "airgrid-webhook-hmac-secret-key-32chars"
    AIRGRID_WEBHOOK_TIMEOUT_SECONDS: int = 10

    # Network Measurement Safety Bounds
    AIRGRID_SPEEDTEST_DURATION_SECONDS: int = 10
    AIRGRID_SPEEDTEST_MAX_MB: int = 150
    AIRGRID_COLLECTOR_ENABLED: bool = False
    AIRGRID_AUTHORIZED_IPERF_TARGETS: Union[str, List[str]] = ""

    @field_validator("AIRGRID_AUTHORIZED_IPERF_TARGETS", mode="before")
    @classmethod
    def assemble_iperf_targets(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            return [t.strip() for t in v.split(",") if t.strip()]
        return v
    # Floor Plan Storage & Uploads
    AIRGRID_UPLOAD_DIR: str = "data/uploads/floor_plans"
    AIRGRID_MAX_UPLOAD_SIZE_BYTES: int = 15 * 1024 * 1024  # 15 MB
    AIRGRID_ALLOWED_IMAGE_FORMATS: List[str] = ["png", "jpeg", "webp"]

    # ML Model Artifact Storage
    AIRGRID_MODEL_STORAGE_DIR: str = "data/models"

    @field_validator("AIRGRID_ALLOWED_IMAGE_FORMATS", mode="before")
    @classmethod
    def assemble_allowed_formats(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            return [fmt.strip().lower() for fmt in v.split(",") if fmt.strip()]
        return [fmt.lower() for fmt in v]


settings = Settings()


def verify_test_database_isolation(db_url: str, env: str) -> None:
    """
    Strict safeguard ensuring tests execute strictly against an isolated test database.
    Prevents tests from mutating or deleting development (airgrid_db) or production databases.
    """
    clean_url = db_url.strip().lower()
    clean_env = env.strip().lower()

    if clean_env in ("production", "prod", "staging"):
        raise RuntimeError(
            f"FATAL SAFEGUARD: Automated test execution is strictly prohibited in '{env}' environment."
        )

    # Extract db name from URL (after last / and before ?)
    path_part = clean_url.split("?")[0]
    db_name = path_part.split("/")[-1]

    # Explicitly prohibit the development database airgrid_db
    if db_name == "airgrid_db":
        raise RuntimeError(
            f"FATAL SAFEGUARD: Automated tests attempted to connect to development database '{db_name}'. "
            "Tests must strictly run against an isolated test database (e.g. airgrid_test_db)."
        )

    # Must contain test in the database name
    if "test" not in db_name:
        raise RuntimeError(
            f"FATAL SAFEGUARD: Database name '{db_name}' is not recognized as a designated test database. "
            "Isolated test database names must include 'test' (e.g. 'airgrid_test_db')."
        )

