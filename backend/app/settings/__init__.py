"""Application settings, grouped by concern.

    from app.settings import settings
    settings.wa.is_cloud        # transport mode
    settings.db.url             # SQLAlchemy URL
    settings.billing.plan_id    # product plan

One import site, five small modules instead of one flat file of constants.
Every group reads the same `.env`; environment variable names are unchanged,
so existing .env files and deploy configs keep working."""
from functools import lru_cache

from .app import AppSettings
from .auth import AuthSettings
from .billing import BillingSettings
from .database import DatabaseSettings
from .whatsapp import WhatsAppSettings


class Settings:
    """Composition root — the only place these groups are instantiated."""

    def __init__(self) -> None:
        self.app = AppSettings()
        self.db = DatabaseSettings()
        self.auth = AuthSettings()
        self.billing = BillingSettings()
        self.wa = WhatsAppSettings()

    def startup_summary(self) -> dict:
        """Non-secret snapshot, logged once at boot so a deployed instance can
        be told apart from a local one at a glance."""
        return {
            "env": self.app.env,
            "version": self.app.version,
            "wa_mode": self.wa.mode,
            "db_schema": self.db.schema_name,
            "db_target": "cloud-sql-socket" if self.db.uses_unix_socket else self.db.host or "url-override",
            "billing_configured": self.billing.configured,
            "google_auth": self.auth.google_enabled,
            "cors_origins": self.app.cors_origins,
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

__all__ = [
    "Settings", "settings", "get_settings",
    "AppSettings", "AuthSettings", "BillingSettings", "DatabaseSettings", "WhatsAppSettings",
]
