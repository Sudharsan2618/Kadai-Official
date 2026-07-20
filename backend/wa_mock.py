"""Mock WhatsApp engine.

Simulates what the Meta Cloud API + webhook would do so the whole product can be
used end-to-end with zero Meta credentials:
- sends go through a retry wrapper (occasional simulated transient failures)
- outbound messages get delivered/read ticks a few seconds later
- some customers auto-reply (opens their 24h window, fires SSE)
- broadcasts send PACED (BROADCAST_MSGS_PER_SEC), recipients progress
  queued -> sent -> delivered -> read, some reply, some fail (resendable)
Swap with a real cloud client later behind the same functions.
"""
import asyncio
import random
from config import BROADCAST_MSGS_PER_SEC, MOCK_FAIL_RATE
from db import SessionLocal
from models import Message, BroadcastRecipient, Broadcast, Customer
from events import publish

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

# The app's event loop, captured at startup. Sync routes run in AnyIO worker
# threads (no loop of their own — Python 3.13 removed the implicit one), so
# background ticks must be scheduled onto this loop thread-safely.
_loop: asyncio.AbstractEventLoop | None = None


def set_loop(loop: asyncio.AbstractEventLoop):
    global _loop
    _loop = loop


def _schedule(coro):
    """Schedule a coroutine from any thread. Silently drops if no loop yet
    (e.g. scripts/tests without the app running)."""
    try:
        asyncio.get_running_loop().create_task(coro)
        return
    except RuntimeError:
        pass
    if _loop and _loop.is_running():
        asyncio.run_coroutine_threadsafe(coro, _loop)
    else:
        coro.close()


def _shop_of(db, customer_id: int) -> int:
    cust = db.get(Customer, customer_id)
    return cust.shop_id if cust else 1


class TransientSendError(Exception):
    pass


def _mock_transport_send():
    """Stand-in for the Meta API call. Raises occasionally so the retry and
    failed paths get exercised; the real cloud client raises on HTTP errors."""
    if random.random() < MOCK_FAIL_RATE:
        raise TransientSendError("simulated network/API blip")


def send_with_retry() -> bool:
    """Attempt a send with bounded retries. Returns True on success."""
    import time
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
            publish("message_status", {"customer_id": msg.customer_id, "message_id": msg.id, "status": "delivered"})
    await asyncio.sleep(random.uniform(2.0, 6.0))
    with SessionLocal() as db:
        msg = db.get(Message, message_id)
        if msg and msg.status != "failed":
            msg.status = "read"
            db.commit()
            publish("message_status", {"customer_id": msg.customer_id, "message_id": msg.id, "status": "read"})
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
        _schedule(_tick_message(msg.id, customer_id))
    return msg


async def _run_broadcast(broadcast_id: int):
    """Paced send to all queued recipients, then delivery/read/reply ticks."""
    delay = 1.0 / max(BROADCAST_MSGS_PER_SEC, 0.1)
    with SessionLocal() as db:
        b = db.get(Broadcast, broadcast_id)
        shop_name = ""
        if b:
            from models import Shop
            shop = db.get(Shop, b.shop_id)
            shop_name = shop.name if shop else ""
        recipient_ids = [r.id for r in db.query(BroadcastRecipient)
                         .filter_by(broadcast_id=broadcast_id, status="queued")]
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
                               ready_label=(b.title if b else "Broadcast"),
                               broadcast_id=broadcast_id, tick=False)
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
                    reply = Message(shop_id=_shop_of(db, r.customer_id), customer_id=r.customer_id,
                                    direction="in", kind="text",
                                    body=random.choice(AUTO_REPLIES), status="read")
                    db.add(reply)
            db.commit()

    with SessionLocal() as db:
        b = db.get(Broadcast, broadcast_id)
        if b:
            b.status = "done"
            db.commit()
    publish("broadcast_progress", {"broadcast_id": broadcast_id, "done": True})


def start_broadcast(broadcast_id: int):
    _schedule(_run_broadcast(broadcast_id))


def requeue_failed(db, broadcast_id: int) -> int:
    """Mark failed recipients queued again; caller then start_broadcast()."""
    failed = (db.query(BroadcastRecipient)
              .filter_by(broadcast_id=broadcast_id, status="failed").all())
    for r in failed:
        r.status = "queued"
    b = db.get(Broadcast, broadcast_id)
    if b and failed:
        b.status = "sending"
    db.commit()
    return len(failed)
