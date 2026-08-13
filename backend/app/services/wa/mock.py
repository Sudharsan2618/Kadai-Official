"""Mock WhatsApp engine.

Simulates what the Meta Cloud API + webhook would do so the whole product can
be used end-to-end with zero Meta credentials:
- sends go through a retry wrapper (occasional simulated transient failures)
- outbound messages get delivered/read ticks a few seconds later
- some customers auto-reply (opens their 24h window, fires SSE)
- broadcasts send PACED (broadcast_msgs_per_sec), recipients progress
  queued -> sent -> delivered -> read, some reply, some fail (resendable)

Same public surface as the cloud engine, so app.services.wa can swap them."""
import asyncio
import random
import time

from app.core import runtime
from app.core.events import publish
from app.db.session import SessionLocal
from app.models import Broadcast, BroadcastRecipient, Customer, Message, Shop
from app.services.wa.errors import WaBlocked
from app.settings import settings

AUTO_REPLIES = [
    "Ok anna, send 2kg",
    "Price konjam kammi pannunga?",
    "Super! Delivery evening ok va?",
    "Same as last time pls",
    "Aduthu vaaram venum anna",
    "Payment done, check pannunga",
]

SEND_RETRIES = 2
RETRY_BACKOFF_SECONDS = 0.4


class TransientSendError(Exception):
    pass


def _shop_of(db, customer_id: int) -> int:
    cust = db.get(Customer, customer_id)
    return cust.shop_id if cust else 1


def _mock_transport_send() -> None:
    """Stand-in for the Meta API call. Raises occasionally so the retry and
    failed paths get exercised; the real cloud client raises on HTTP errors."""
    if random.random() < settings.wa.mock_fail_rate:
        raise TransientSendError("simulated network/API blip")


def send_with_retry() -> bool:
    """Attempt a send with bounded retries. Returns True on success."""
    for attempt in range(SEND_RETRIES + 1):
        try:
            _mock_transport_send()
            return True
        except TransientSendError:
            if attempt < SEND_RETRIES:
                time.sleep(RETRY_BACKOFF_SECONDS * (attempt + 1))
    return False


async def _tick_message(message_id: int, reply_from: int | None):
    await asyncio.sleep(random.uniform(1.5, 3.5))
    with SessionLocal() as db:
        msg = db.get(Message, message_id)
        if msg and msg.status != "failed":
            msg.status = "delivered"
            db.commit()
            publish("message_status", {"customer_id": msg.customer_id,
                                       "message_id": msg.id, "status": "delivered"})
    await asyncio.sleep(random.uniform(2.0, 6.0))
    with SessionLocal() as db:
        msg = db.get(Message, message_id)
        if msg and msg.status != "failed":
            msg.status = "read"
            db.commit()
            publish("message_status", {"customer_id": msg.customer_id,
                                       "message_id": msg.id, "status": "read"})
    # some customers reply, which opens their 24h window
    if reply_from is not None and random.random() < 0.45:
        await asyncio.sleep(random.uniform(3.0, 9.0))
        with SessionLocal() as db:
            reply = Message(shop_id=_shop_of(db, reply_from), customer_id=reply_from,
                            direction="in", kind="text",
                            body=random.choice(AUTO_REPLIES), status="read")
            db.add(reply)
            db.commit()
            publish("message_in", {"customer_id": reply_from, "body": reply.body})


def send_message(db, customer_id: int, body: str, kind: str = "text",
                 ready_label: str = "", broadcast_id: int | None = None,
                 tick: bool = True) -> Message:
    """Send one message through the retry wrapper. Persists 'sent' or 'failed'."""
    ok = send_with_retry()
    msg = Message(shop_id=_shop_of(db, customer_id), customer_id=customer_id,
                  direction="out", kind=kind, body=body,
                  ready_label=ready_label, status="sent" if ok else "failed",
                  broadcast_id=broadcast_id)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    publish("message_out", {"customer_id": customer_id, "message_id": msg.id,
                            "status": msg.status})
    if ok and tick:
        runtime.schedule(_tick_message(msg.id, customer_id))
    return msg


async def _run_broadcast(broadcast_id: int):
    """Paced send to all queued recipients, then delivery/read/reply ticks."""
    delay = 1.0 / max(settings.wa.broadcast_msgs_per_sec, 0.1)
    with SessionLocal() as db:
        b = db.get(Broadcast, broadcast_id)
        shop_name = ""
        if b:
            shop = db.get(Shop, b.shop_id)
            shop_name = shop.name if shop else ""
        recipient_ids = [r.id for r in db.query(BroadcastRecipient)
                         .filter_by(broadcast_id=broadcast_id, status="queued")]
        title = b.title if b else "Broadcast"
        body_template = b.body if b else ""

    for rid in recipient_ids:
        await asyncio.sleep(delay)
        with SessionLocal() as db:
            r = db.get(BroadcastRecipient, rid)
            if not r:
                continue
            cust = db.get(Customer, r.customer_id)
            if not cust:
                continue
            personal = body_template.replace("{name}", cust.name).replace("{shop}", shop_name)
            msg = send_message(db, r.customer_id, personal, kind="broadcast",
                               ready_label=title, broadcast_id=broadcast_id, tick=False)
            r.status = "sent" if msg.status == "sent" else "failed"
            db.commit()
        publish("broadcast_progress", {"broadcast_id": broadcast_id})

    # delivery/read/reply simulation for successfully sent recipients
    await asyncio.sleep(random.uniform(1.5, 3.0))
    with SessionLocal() as db:
        sent_ids = [r.id for r in db.query(BroadcastRecipient)
                    .filter_by(broadcast_id=broadcast_id, status="sent")]
    for rid in sent_ids:
        with SessionLocal() as db:
            r = db.get(BroadcastRecipient, rid)
            if not r:
                continue
            r.status = "delivered"
            if random.random() < 0.55:
                r.status = "read"
                if random.random() < 0.18:
                    r.status = "replied"
                    db.add(Message(shop_id=_shop_of(db, r.customer_id), customer_id=r.customer_id,
                                   direction="in", kind="text",
                                   body=random.choice(AUTO_REPLIES), status="read"))
            db.commit()

    with SessionLocal() as db:
        b = db.get(Broadcast, broadcast_id)
        if b:
            b.status = "done"
            db.commit()
    publish("broadcast_progress", {"broadcast_id": broadcast_id, "done": True})


def start_broadcast(broadcast_id: int) -> None:
    runtime.schedule(_run_broadcast(broadcast_id))


def send_test_message(db, shop: Shop, phone: str) -> dict:
    """Mock twin of the cloud onboarding test send. Validates the same way the
    real one does — so a seller hitting 'send it to my own shop number' gets the
    identical error in demo mode — then pretends it went out."""
    digits = "".join(c for c in (phone or "") if c.isdigit())
    if len(digits) < 10:
        raise WaBlocked("Enter the WhatsApp number you want the test sent to")
    if digits[-10:] == "".join(c for c in (shop.wa_number or "") if c.isdigit())[-10:]:
        raise WaBlocked(
            "That's the shop's own WhatsApp number — send the test to a different "
            "phone, like your personal number")
    return {"sent": True, "wamid": f"wamid.mock.{random.randint(10**6, 10**7)}",
            "to": digits[-10:], "template": "hello_world", "mock": True}
