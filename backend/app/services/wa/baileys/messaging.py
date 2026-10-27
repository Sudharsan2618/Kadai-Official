"""Outbound sending over the Baileys gateway.

Differences from the Meta Cloud API this replaces, by design:
- there is no 24-hour window and no templates: every kind (text, ready,
  broadcast) sends as plain WhatsApp text, so nothing is ever refused for being
  "out of window"
- there is no Meta billing and no payment state to track
- sends go through the gateway's socket; the returned message id is stored as
  the Message.wamid for parity with the rest of the app

Mirrors the mock engine's send_message / start_broadcast surface so the
dispatcher in app.services.wa can swap it in with WA_MODE=baileys."""
import asyncio
import logging

from app.core import runtime
from app.core.events import publish
from app.db.session import SessionLocal
from app.models import Broadcast, BroadcastRecipient, Customer, Message, Shop
from app.services.wa.baileys.client import send as gateway_send
from app.services.wa.errors import WaBlocked, WaError
from app.services.wa.phones import to_e164
from app.settings import settings

log = logging.getLogger(__name__)


def send_message(db, customer_id: int, body: str, kind: str = "text",
                 ready_label: str = "", broadcast_id: int | None = None,
                 tick: bool = True) -> Message:
    """Send via the gateway. Persists 'sent' (+ wamid) or 'failed'. WhatsApp
    Web has no delivery/read receipts we surface, so `tick` is accepted for
    interface parity and ignored."""
    cust = db.get(Customer, customer_id)
    if not cust:
        raise WaBlocked("Customer not found")
    shop = db.get(Shop, cust.shop_id)
    if not shop or not shop.wa_connected:
        raise WaBlocked("WhatsApp isn't connected — link your number in Settings")

    wamid, ok, last_err = "", False, None
    try:
        wamid = gateway_send(shop, to_e164(cust.phone), body)
        ok = True
    except WaError as e:
        last_err = e
        log.warning("shop %s: send to customer %s failed — %s", shop.id, customer_id, e)

    msg = Message(shop_id=shop.id, customer_id=customer_id, direction="out",
                  kind=kind, body=body, ready_label=ready_label,
                  status="sent" if ok else "failed", wamid=wamid,
                  broadcast_id=broadcast_id)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    publish("message_out", {"customer_id": customer_id, "message_id": msg.id,
                            "status": msg.status,
                            "error": str(last_err) if last_err else None})
    return msg


# ── Broadcast fan-out (paced — the ban-avoidance seam) ──────────────────────
async def _run_broadcast(broadcast_id: int):
    delay = 1.0 / max(settings.wa.broadcast_msgs_per_sec, 0.1)
    with SessionLocal() as db:
        b = db.get(Broadcast, broadcast_id)
        if not b:
            return
        title, body_template = b.title, b.body
        recipient_ids = [r.id for r in db.query(BroadcastRecipient)
                         .filter_by(broadcast_id=broadcast_id, status="queued")]

    for rid in recipient_ids:
        await asyncio.sleep(delay)

        def _send_one(rid=rid):
            with SessionLocal() as db:
                r = db.get(BroadcastRecipient, rid)
                if not r:
                    return
                cust = db.get(Customer, r.customer_id)
                if not cust:
                    r.status = "failed"
                    db.commit()
                    return
                shop = db.get(Shop, cust.shop_id)
                personal = (body_template.replace("{name}", cust.name)
                            .replace("{shop}", shop.name if shop else ""))
                try:
                    msg = send_message(db, r.customer_id, personal, kind="broadcast",
                                       ready_label=title, broadcast_id=broadcast_id,
                                       tick=False)
                    r.status = "sent" if msg.status == "sent" else "failed"
                except WaError:
                    r.status = "failed"
                db.commit()

        await asyncio.to_thread(_send_one)  # urllib is blocking — keep the loop free
        publish("broadcast_progress", {"broadcast_id": broadcast_id})

    with SessionLocal() as db:
        b = db.get(Broadcast, broadcast_id)
        if b:
            b.status = "done"
            db.commit()
    publish("broadcast_progress", {"broadcast_id": broadcast_id, "done": True})


def start_broadcast(broadcast_id: int) -> None:
    runtime.schedule(_run_broadcast(broadcast_id))


def send_test_message(db, shop: Shop, phone: str) -> dict:
    """Onboarding's proof-of-life send: one real message to a phone the seller
    is holding. Validates the input and that WhatsApp is linked, then sends."""
    digits = "".join(c for c in (phone or "") if c.isdigit())
    if len(digits) < 10:
        raise WaBlocked("Enter the WhatsApp number you want the test sent to")
    if not shop.wa_connected:
        raise WaBlocked("WhatsApp isn't connected — link your number in Settings")
    own = "".join(c for c in (shop.wa_number or "") if c.isdigit())
    if own and digits[-10:] == own[-10:]:
        raise WaBlocked(
            "That's the shop's own WhatsApp number — send the test to a different "
            "phone, like your personal number")
    wamid = gateway_send(shop, to_e164(digits), "Hello from Kadai 👋 Your WhatsApp is connected.")
    return {"sent": True, "wamid": wamid, "to": digits[-10:]}
