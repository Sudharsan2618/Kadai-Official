import os
from dotenv import load_dotenv

load_dotenv()

# mock = full product works locally with simulated WhatsApp (delivery ticks,
# auto-replies, embedded-signup stub). cloud = real Meta Cloud API (later).
WA_MODE = os.getenv("WA_MODE", "mock")

# PostgreSQL (Render). All kadai tables live in their own schema, isolated
# from the CRM's public-schema tables and exportable to a dedicated instance later.
DB_SCHEMA = os.getenv("DB_SCHEMA", "kadai")
DATABASE_URL = (
    f"postgresql+psycopg2://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
    f"@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME')}"
    f"?sslmode=require"
)

# 24-hour customer service window (Meta rule)
WINDOW_HOURS = 24

# Broadcast pacing — mirrors Meta throughput limits so mock behaviour carries
# straight over to cloud mode. Messages per second across a broadcast run.
BROADCAST_MSGS_PER_SEC = float(os.getenv("BROADCAST_MSGS_PER_SEC", "10"))

# Mock-mode only: simulated transient send-failure rate, to exercise the
# retry + failed + resend paths end-to-end.
MOCK_FAIL_RATE = float(os.getenv("MOCK_FAIL_RATE", "0.04"))

# WhatsApp free-form text body hard limit (chars)
MAX_TEXT_LEN = 4096

# ── Auth ────────────────────────────────────────────────────────────────────
# HS256 secret for our own session JWTs. Override in .env for production.
JWT_SECRET = os.getenv("JWT_SECRET", "kadai-dev-secret-change-me")
JWT_TTL_DAYS = int(os.getenv("JWT_TTL_DAYS", "30"))
# Google OAuth (optional — email/password works without it).
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8010/auth/google/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3010")

# ── Billing (Razorpay) ──────────────────────────────────────────────────────
# One product plan today. Price is configurable — change PLAN_PRICE_INR (rupees)
# or set it in .env; everything downstream (checkout, invoices) reads from here.
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")

PLAN_ID = os.getenv("PLAN_ID", "kadai_monthly")
PLAN_NAME = os.getenv("PLAN_NAME", "Kadai Monthly")
PLAN_PRICE_INR = int(os.getenv("PLAN_PRICE_INR", "1500"))   # rupees / period
PLAN_CURRENCY = os.getenv("PLAN_CURRENCY", "INR")
PLAN_PERIOD_DAYS = int(os.getenv("PLAN_PERIOD_DAYS", "30"))
TRIAL_DAYS = int(os.getenv("TRIAL_DAYS", "14"))             # free trial on signup


# ── WhatsApp Cloud API (Layer 2) ────────────────────────────────────────────
# Real Meta transport. All empty/off in mock mode; required when WA_MODE=cloud.
WA_API_VERSION = os.getenv("WA_API_VERSION", "v21.0")
GRAPH_BASE = f"https://graph.facebook.com/{WA_API_VERSION}"
META_APP_ID = os.getenv("META_APP_ID", "")
META_APP_SECRET = os.getenv("META_APP_SECRET", "")          # webhook signature + token exchange
WA_VERIFY_TOKEN = os.getenv("WA_VERIFY_TOKEN", "")          # GET /wa/webhook handshake
WA_TOKEN_ENC_KEY = os.getenv("WA_TOKEN_ENC_KEY", "")        # Fernet key: per-shop tokens at rest
META_ES_CONFIG_ID = os.getenv("META_ES_CONFIG_ID", "")      # Embedded Signup configuration id
WA_GRAPH_TIMEOUT = int(os.getenv("WA_GRAPH_TIMEOUT", "20")) # seconds per Graph call
WA_DEFAULT_COUNTRY_CODE = os.getenv("WA_DEFAULT_COUNTRY_CODE", "91")  # E.164 prefix for 10-digit numbers


def wa_public() -> dict:
    """What the frontend needs to render the WhatsApp connect flow."""
    return {
        "mode": WA_MODE,
        "app_id": META_APP_ID,
        "config_id": META_ES_CONFIG_ID,
        "api_version": WA_API_VERSION,
    }


def plan_public() -> dict:
    """Everything the frontend needs to render pricing + open checkout."""
    return {
        "id": PLAN_ID,
        "name": PLAN_NAME,
        "price_inr": PLAN_PRICE_INR,
        "amount_paise": PLAN_PRICE_INR * 100,
        "currency": PLAN_CURRENCY,
        "period_days": PLAN_PERIOD_DAYS,
        "trial_days": TRIAL_DAYS,
        "razorpay_key_id": RAZORPAY_KEY_ID,
    }
