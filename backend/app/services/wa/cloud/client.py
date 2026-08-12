"""Low-level Meta Graph client + per-tenant auth.

stdlib urllib only, same convention as the Razorpay client. Meta's error
envelope is parsed into WaError with the code/subcode so callers can tell a
throttle from an expired token from a permanent rejection."""
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

from app.core.crypto import decrypt_token
from app.core.events import publish
from app.models import Shop
from app.services.wa.errors import WaBlocked, WaError
from app.services.wa.phones import to_e164, to_local  # noqa: F401 — re-exported
from app.settings import settings

log = logging.getLogger(__name__)


def graph(method: str, path: str, token: str, payload: dict | None = None,
          query: dict | None = None) -> dict:
    url = f"{settings.wa.graph_base}{path}"
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=settings.wa.graph_timeout) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            envelope = json.loads(e.read()).get("error", {})
        except Exception:
            envelope = {}
        raise WaError(
            envelope.get("message", f"Meta API error (HTTP {e.code})"),
            code=int(envelope.get("code", 0) or 0),
            subcode=int(envelope.get("error_subcode", 0) or 0),
            http_status=e.code,
        )
    except Exception as e:
        # DNS/timeout/conn-reset — treat as transient
        raise WaError(f"Couldn't reach Meta: {e}", http_status=599)


def app_token() -> str:
    """App-level token for /debug_token — never used for messaging."""
    return f"{settings.wa.app_id}|{settings.wa.app_secret}"


def shop_token(shop: Shop) -> str:
    token = decrypt_token(shop.wa_access_token)
    if not token:
        raise WaBlocked("WhatsApp isn't connected for this shop — connect it in Settings")
    return token


def require_connected(shop: Shop) -> None:
    if not (shop.wa_connected and shop.phone_number_id and shop.wa_access_token):
        raise WaBlocked("WhatsApp isn't connected — finish the Meta signup in Settings")
    if shop.wa_token_expiry and shop.wa_token_expiry < datetime.now():
        raise WaBlocked("WhatsApp session expired — reconnect your number in Settings")


def mark_token_expired(db, shop: Shop) -> None:
    """190 → the seller has to re-run Embedded Signup. Keep credentials so the
    UI can show 'reconnect' instead of 'never connected'."""
    shop.wa_token_expiry = datetime.now() - timedelta(seconds=1)
    db.commit()
    log.warning("shop %s: Meta token rejected, marking for reconnect", shop.id)
    publish("wa_disconnected", {"shop_id": shop.id})
