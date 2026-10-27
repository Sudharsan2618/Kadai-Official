"""Low-level HTTP client for the Baileys gateway sidecar.

stdlib urllib only, same convention as the Razorpay client. The gateway owns
the WhatsApp socket; this is the one place the API reaches it. Every call
carries the shared secret header in both directions."""
import json
import logging
import urllib.error
import urllib.request

from app.models import Shop
from app.services.wa.errors import WaBlocked, WaError
from app.settings import settings

log = logging.getLogger(__name__)


def gateway(method: str, path: str, payload: dict | None = None) -> dict:
    """Call the gateway. Raises WaBlocked for 409 (not linked), WaError otherwise."""
    url = f"{settings.wa.gateway_url.rstrip('/')}{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Content-Type": "application/json",
        "x-gateway-secret": settings.wa.gateway_secret,
    })
    try:
        with urllib.request.urlopen(req, timeout=settings.wa.gateway_timeout) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read()).get("error", "")
        except Exception:
            detail = ""
        if e.code == 409:
            raise WaBlocked(detail or "WhatsApp isn't connected — link your number in Settings")
        raise WaError(detail or f"WhatsApp gateway error (HTTP {e.code})", http_status=e.code)
    except Exception as e:
        # DNS/timeout/conn-reset — the gateway is unreachable; treat as transient.
        raise WaError(f"Couldn't reach the WhatsApp gateway: {e}", http_status=599)


def _shop_key(shop: Shop) -> str:
    return str(shop.id)


def start_link(shop: Shop, phone: str = "") -> dict:
    """Begin (or restart) linking. With a phone the gateway returns a pairing
    code; without one, a QR."""
    body = {"phone": phone} if phone else {}
    return gateway("POST", f"/sessions/{_shop_key(shop)}/link", body)


def link_status(shop: Shop) -> dict:
    """{status: connecting|qr|linked|logged_out, qr?, code?, number?}."""
    return gateway("GET", f"/sessions/{_shop_key(shop)}/status")


def logout(shop: Shop) -> dict:
    return gateway("POST", f"/sessions/{_shop_key(shop)}/logout")


def send(shop: Shop, to: str, text: str) -> str:
    """Send one text message. Returns the WhatsApp message id (wamid)."""
    resp = gateway("POST", f"/sessions/{_shop_key(shop)}/send", {"to": to, "text": text})
    return resp.get("wamid", "")
