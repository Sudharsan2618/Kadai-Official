"""Session JWT + Google OAuth settings.

Email/password sign-in works with nothing configured. Google activates the
moment client id/secret are present."""
from pydantic import Field

from .base import SettingsGroup


class AuthSettings(SettingsGroup):
    jwt_secret: str = Field(default="kadai-dev-secret-change-me", validation_alias="JWT_SECRET")
    jwt_ttl_days: int = Field(default=30, validation_alias="JWT_TTL_DAYS")

    google_client_id: str = Field(default="", validation_alias="GOOGLE_CLIENT_ID")
    google_client_secret: str = Field(default="", validation_alias="GOOGLE_CLIENT_SECRET")
    google_redirect_uri: str = Field(
        default="http://localhost:8010/auth/google/callback",
        validation_alias="GOOGLE_REDIRECT_URI")

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)
