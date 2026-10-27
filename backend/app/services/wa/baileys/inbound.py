"""Digesting Baileys gateway callbacks into our tables.

The gateway posts one inbound message at a time (plus link-status changes) to
the baileys webhook route. Everything here is idempotent (dedupe on wamid) so a
re-delivered callback is harmless. Adapted from the Meta inbound handlers, minus
delivery/read statuses, templates and coexistence — WhatsApp Web has none of
those."""
import logging
from datetime import datetime

from app.core.events import publish
from app.models import BroadcastRecipient, Customer, Message, Shop
from app.services.wa.phones import to_local

log = logging.getLogger(__name__)


def shop_by_id(db, shop_id) -> Shop | None:
    try:
        return db.get(Shop, int(shop_id))
    except (TypeError, ValueError):
        return None


def _message_timestamp(unix_seconds) -> datetime:
    """Baileys timestamps are unix seconds."""
    try:
        ts = int(unix_seconds or 0)
        return datetime.fromtimestamp(ts) if ts else datetime.now()
    except (TypeError, ValueError, OSError):
        return datetime.now()


def _find_or_create_customer(db, shop: Shop, phone: str, name: str = "") -> Customer:
    cust = (db.query(Customer)
            .filter(Customer.shop_id == shop.id, Customer.phone.like(f"%{phone}"))
            .first())
    if not cust:
        cust = Customer(shop_id=shop.id, phone=phone, name=name or phone)
        db.add(cust)
        db.flush()
    return cust


def _already_stored(db, wamid: str) -> bool:
    return bool(wamid) and bool(db.query(Message.id).filter(Message.wamid == wamid).first())


def handle_inbound(db, shop: Shop, payload: dict) -> None:
    """One customer message from the gateway. Stores it and nudges any pending
    broadcast recipient to 'replied'."""
    wamid = str(payload.get("wamid", ""))
    if _already_stored(db, wamid):
        return  # re-delivered callback — already stored
    phone = to_local(str(payload.get("from", "")))
    if not phone:
        return
    cust = _find_or_create_customer(db, shop, phone, str(payload.get("pushName", "")))
    body = str(payload.get("text", "")) or "[media message]"
    msg = Message(shop_id=shop.id, customer_id=cust.id, direction="in",
                  kind="text", body=body, status="read", wamid=wamid,
                  created_at=_message_timestamp(payload.get("timestamp")))
    db.add(msg)

    # A reply upgrades the newest broadcast recipient row → 'replied'.
    rec = (db.query(BroadcastRecipient)
           .filter(BroadcastRecipient.customer_id == cust.id,
                   BroadcastRecipient.status.in_(["sent", "delivered", "read"]))
           .order_by(BroadcastRecipient.id.desc()).first())
    if rec:
        rec.status = "replied"
    db.commit()
    publish("message_in", {"customer_id": cust.id, "body": msg.body})


def apply_status(db, shop: Shop, status: str, number: str = "") -> None:
    """Link-status change from the gateway: keep the shop row in sync so the
    connect screen reflects reality without polling the gateway on every read."""
    shop.wa_link_status = status
    if status == "linked":
        shop.wa_connected = True
        if number:
            shop.wa_number = to_local(number)
            shop.wa_display_number = number
        publish("wa_connected", {"shop_id": shop.id})
    elif status == "logged_out":
        shop.wa_connected = False
        publish("wa_disconnected", {"shop_id": shop.id})
    db.commit()
