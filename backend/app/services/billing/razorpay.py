"""Razorpay client — plain HTTPS with Basic auth, HMAC-SHA256 signatures.

No SDK, nothing to install: same stdlib-urllib convention as the Meta client.
Raises RazorpayError; the route maps that onto HTTP status codes."""
import base64
import hashlib
import hmac
import json
import urllib.error
import urllib.request

from app.settings import settings

ORDERS_URL = "https://api.razorpay.com/v1/orders"


class RazorpayError(Exception):
    """A gateway failure. `configured` False means we never even called out."""

    def __init__(self, message: str, configured: bool = True):
        super().__init__(message)
        self.configured = configured


def create_order(amount_paise: int, receipt: str) -> dict:
    if not settings.billing.configured:
        raise RazorpayError("Billing isn't configured yet", configured=False)
    creds = f"{settings.billing.razorpay_key_id}:{settings.billing.razorpay_key_secret}".encode()
    auth = base64.b64encode(creds).decode()
    body = json.dumps({
        "amount": amount_paise, "currency": settings.billing.plan_currency,
        "receipt": receipt, "payment_capture": 1,
    }).encode()
    req = urllib.request.Request(
        ORDERS_URL, data=body, method="POST",
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=settings.billing.razorpay_timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RazorpayError(f"Razorpay error: {e.read().decode()[:200]}")
    except Exception:
        raise RazorpayError("Couldn't reach the payment gateway")


def verify_payment_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """Checkout callback signature — HMAC over "order_id|payment_id"."""
    expected = hmac.new(settings.billing.razorpay_key_secret.encode(),
                        f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    """Server-to-server webhook signature — HMAC over the raw request body.
    Returns True when no webhook secret is configured (nothing to check against)."""
    if not settings.billing.razorpay_webhook_secret:
        return True
    expected = hmac.new(settings.billing.razorpay_webhook_secret.encode(),
                        raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
