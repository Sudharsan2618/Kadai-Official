"""WhatsApp settings — transport mode, Meta credentials, send pacing.

WA_MODE picks the engine at call time:
  mock  → offline simulation, zero Meta credentials needed (demo/dev)
  cloud → the real Meta Cloud API + webhooks (production)
Everything below the mode line is only read in cloud mode."""
from pydantic import Field

from .base import SettingsGroup


class WhatsAppSettings(SettingsGroup):
    mode: str = Field(default="mock", validation_alias="WA_MODE")

    # 24-hour customer service window (Meta rule) + WhatsApp text body limit.
    window_hours: int = Field(default=24, validation_alias="WA_WINDOW_HOURS")
    max_text_len: int = Field(default=4096, validation_alias="WA_MAX_TEXT_LEN")

    # Broadcast pacing — mirrors Meta throughput limits so mock behaviour
    # carries straight over to cloud mode. Messages per second per run.
    broadcast_msgs_per_sec: float = Field(default=10, validation_alias="BROADCAST_MSGS_PER_SEC")
    # Mock-mode only: simulated transient send-failure rate, to exercise the
    # retry + failed + resend paths end-to-end.
    mock_fail_rate: float = Field(default=0.04, validation_alias="MOCK_FAIL_RATE")

    api_version: str = Field(default="v25.0", validation_alias="WA_API_VERSION")
    app_id: str = Field(default="", validation_alias="META_APP_ID")
    app_secret: str = Field(default="", validation_alias="META_APP_SECRET")   # webhook signature + token exchange
    verify_token: str = Field(default="", validation_alias="WA_VERIFY_TOKEN")  # GET /wa/webhook handshake
    token_enc_key: str = Field(default="", validation_alias="WA_TOKEN_ENC_KEY")  # Fernet: per-shop tokens at rest
    es_config_id: str = Field(default="", validation_alias="META_ES_CONFIG_ID")  # Embedded Signup configuration id
    graph_timeout: int = Field(default=20, validation_alias="WA_GRAPH_TIMEOUT")
    default_country_code: str = Field(default="91", validation_alias="WA_DEFAULT_COUNTRY_CODE")
    mm_message_activity_sharing: bool = Field(
        default=True, validation_alias="WA_MM_MESSAGE_ACTIVITY_SHARING")

    @property
    def is_cloud(self) -> bool:
        return self.mode == "cloud"

    @property
    def graph_base(self) -> str:
        return f"https://graph.facebook.com/{self.api_version}"

    def public(self) -> dict:
        """What the frontend needs to render the WhatsApp connect flow."""
        return {
            "mode": self.mode,
            "app_id": self.app_id,
            "config_id": self.es_config_id,
            "api_version": self.api_version,
        }
