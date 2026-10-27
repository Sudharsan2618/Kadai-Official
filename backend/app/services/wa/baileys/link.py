"""Linking a shop's WhatsApp number through the Baileys gateway.

This is the Baileys replacement for Meta Embedded Signup: instead of an OAuth
popup and a WABA, the seller scans a QR (or enters a pairing code) and the
number is linked. The gateway holds the socket; these helpers drive it and keep
the shop row in sync."""
import logging

from app.models import Shop
from app.services.wa.baileys import client
from app.services.wa.phones import to_local

log = logging.getLogger(__name__)


def start_link(db, shop: Shop, phone: str = "") -> dict:
    """Kick off pairing. Returns {ok} — the QR/code is then polled via status."""
    shop.wa_link_status = "connecting"
    db.commit()
    return client.start_link(shop, phone)


def get_status(db, shop: Shop) -> dict:
    """Current link state from the gateway. On 'linked' persist the number so
    the rest of the app can send without touching the gateway."""
    state = client.link_status(shop)
    status = state.get("status", "logged_out")
    if status != shop.wa_link_status:
        shop.wa_link_status = status
    if status == "linked":
        shop.wa_connected = True
        number = state.get("number") or ""
        if number:
            shop.wa_number = to_local(number)
            shop.wa_display_number = number
    db.commit()
    return {
        "status": status,
        "qr": state.get("qr"),
        "code": state.get("code"),
        "number": state.get("number") or shop.wa_number,
    }


def disconnect(db, shop: Shop) -> dict:
    """Log the number out of WhatsApp and clear the shop's connection fields."""
    try:
        client.logout(shop)
    except Exception as e:  # the socket may already be gone — detach anyway
        log.warning("shop %s: gateway logout failed — %s", shop.id, e)
    shop.wa_connected = False
    shop.wa_link_status = "logged_out"
    shop.wa_number = ""
    shop.wa_display_number = ""
    db.commit()
    return {"disconnected": True}
