"""WhatsApp settings — transport mode, Baileys gateway, send pacing.

WA_MODE picks the engine at call time:
  mock     → offline simulation, zero external dependencies (demo/dev)
  baileys  → the real transport via the Baileys gateway sidecar (production)

The Baileys gateway speaks WhatsApp Web (no Meta, no templates, no 24-hour
window, no billing). A seller links by scanning a QR; the gateway holds the
socket and calls back into this API with inbound messages and link status."""
from pydantic import Field

from .base import SettingsGroup


class WhatsAppSettings(SettingsGroup):
    mode: str = Field(default="baileys", validation_alias="WA_MODE")

    # WhatsApp text body limit.
    max_text_len: int = Field(default=4096, validation_alias="WA_MAX_TEXT_LEN")

    # Broadcast pacing — spread sends out to stay well under WhatsApp's rate
    # limits (the ban-avoidance seam). Messages per second per run.
    broadcast_msgs_per_sec: float = Field(default=4, validation_alias="BROADCAST_MSGS_PER_SEC")
    # Mock-mode only: simulated transient send-failure rate, to exercise the
    # retry + failed + resend paths end-to-end.
    mock_fail_rate: float = Field(default=0.04, validation_alias="MOCK_FAIL_RATE")

    # ── Baileys gateway (the Node sidecar that owns the socket) ──────────────
    gateway_url: str = Field(default="http://127.0.0.1:8788", validation_alias="WA_GATEWAY_URL")
    # Shared secret on every call in both directions (Kadai <-> gateway).
    gateway_secret: str = Field(default="", validation_alias="WA_GATEWAY_SECRET")
    gateway_timeout: int = Field(default=20, validation_alias="WA_GATEWAY_TIMEOUT")

    default_country_code: str = Field(default="91", validation_alias="WA_DEFAULT_COUNTRY_CODE")

    @property
    def is_baileys(self) -> bool:
        return self.mode == "baileys"

    def public(self) -> dict:
        """What the frontend needs to render the WhatsApp connect flow."""
        return {"mode": self.mode}
