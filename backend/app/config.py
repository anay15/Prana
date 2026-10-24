"""Runtime configuration, read once from environment variables."""

import os
from dataclasses import dataclass, field
from pathlib import Path


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL", "sqlite:///./prana.db")
    # Render / Heroku style URLs -> SQLAlchemy psycopg3 driver
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url.removeprefix("postgres://")
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url.removeprefix("postgresql://")
    return url


def _origins() -> list[str]:
    raw = os.environ.get("ALLOWED_ORIGINS", "")
    origins = [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
    # Render injects the service's public URL automatically
    if render_url := os.environ.get("RENDER_EXTERNAL_URL"):
        origins.append(render_url.rstrip("/"))
    return origins or ["http://localhost:5173", "http://localhost:8000"]


@dataclass(frozen=True)
class Settings:
    env: str = field(default_factory=lambda: os.environ.get("APP_ENV", "development"))
    database_url: str = field(default_factory=_database_url)
    allowed_origins: list[str] = field(default_factory=_origins)
    # Number of reverse proxies in front of the app that append to X-Forwarded-For
    trusted_proxy_hops: int = field(default_factory=lambda: int(os.environ.get("TRUSTED_PROXY_HOPS", "0")))
    rate_limit_storage: str = field(default_factory=lambda: os.environ.get("RATE_LIMIT_STORAGE_URI", "memory://"))
    static_dir: Path = field(
        default_factory=lambda: Path(
            os.environ.get("STATIC_DIR", Path(__file__).resolve().parents[2] / "frontend" / "dist")
        )
    )

    @property
    def is_production(self) -> bool:
        return self.env == "production"


settings = Settings()
