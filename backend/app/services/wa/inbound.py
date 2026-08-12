"""Digesting Meta webhook payloads into our tables.

Rules Meta enforces that shape this code:
- must ACK 200 within seconds or Meta retries → every handler is a cheap DB
  write and every path is idempotent (dedupe on wamid), so retries are harmless
- multi-tenant: events carry metadata.phone_number_id (or entry.id for
  WABA-level events) — that is the tenant key, since there is no JWT here"""
import logging
from datetime import datetime

from app.core.events import publish
from app.models import BroadcastRecipient, Customer, Message, Shop, Template
from app.services.wa.phones import to_local

log = logging.getLogger(__name__)

# Delivery states only ever move forward; retried webhooks arrive out of order.
STATUS_RANK = {"sent": 1, "delivered": 2, "read": 3}

# Coexistence webhook fields (K-02). Pulled in once, then streamed by Meta.
COEXISTENCE_FIELDS = ("history", "smb_app_state_sync", "smb_message_echoes")


# ── Tenant lookup ───────────────────────────────────────────────────────────
def shop_by_phone_id(db, phone_number_id: str) -> Shop | None:
    if not phone_number_id:
        return None
    return db.query(Shop).filter(Shop.phone_number_id == str(phone_number_id)).first()


def shop_by_waba_id(db, waba_id: str) -> Shop | None:
    if not waba_id:
        return None
    return db.query(Shop).filter(Shop.waba_id == str(waba_id)).first()


def extract_text(m: dict) -> str:
    t = m.get("type", "")
    if t == "text":
        return (m.get("text") or {}).get("body", "")
    if t == "button":
        return (m.get("button") or {}).get("text", "")
    if t == "interactive":
        i = m.get("interactive") or {}
        return ((i.get("button_reply") or {}).get("title")
                or (i.get("list_reply") or {}).get("title") or "")
    if t == "reaction":
        return (m.get("reaction") or {}).get("emoji", "")
    return f"[{t or 'unsupported'} message]"  # media etc. — keep the thread coherent


def _message_timestamp(m: dict) -> datetime:
    """Meta timestamps are unix seconds — this is what makes the 24h window real."""
    try:
        return datetime.fromtimestamp(int(m.get("timestamp", 0)))
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


# ── Handlers ────────────────────────────────────────────────────────────────
def handle_inbound(db, shop: Shop, value: dict) -> None:
    """Customer messages — each one (re)opens that customer's 24h window."""
    contacts = {c.get("wa_id"): (c.get("profile") or {}).get("name", "")
                for c in value.get("contacts", [])}
    for m in value.get("messages", []):
        wamid = m.get("id", "")
        if _already_stored(db, wamid):
            continue  # Meta retry — already stored
        phone = to_local(m.get("from", ""))
        if not phone:
            continue
        cust = _find_or_create_customer(db, shop, phone, contacts.get(m.get("from"), ""))
        msg = Message(shop_id=shop.id, customer_id=cust.id, direction="in",
                      kind="text", body=extract_text(m), status="read",
                      wamid=wamid, created_at=_message_timestamp(m))
        db.add(msg)

        # a reply upgrades the newest broadcast recipient row → 'replied'
        rec = (db.query(BroadcastRecipient)
               .filter(BroadcastRecipient.customer_id == cust.id,
                       BroadcastRecipient.status.in_(["sent", "delivered", "read"]))
               .order_by(BroadcastRecipient.id.desc()).first())
        if rec:
            rec.status = "replied"
        db.commit()
        publish("message_in", {"customer_id": cust.id, "body": msg.body})


def handle_statuses(db, shop: Shop, value: dict) -> None:
    """Delivery receipts, keyed by the wamid we stored when sending."""
    for s in value.get("statuses", []):
        wamid = s.get("id", "")
        new_status = s.get("status", "")  # sent | delivered | read | failed
        msg = db.query(Message).filter(Message.wamid == wamid).first() if wamid else None
        if not msg:
            continue
        if new_status == "failed":
            msg.status = "failed"
            errs = s.get("errors") or []
            publish("message_status", {"customer_id": msg.customer_id,
                                       "message_id": msg.id, "status": "failed",
                                       "error": errs[0].get("title", "") if errs else ""})
        elif STATUS_RANK.get(new_status, 0) > STATUS_RANK.get(msg.status, 0):
            msg.status = new_status  # never downgrade
            publish("message_status", {"customer_id": msg.customer_id,
                                       "message_id": msg.id, "status": new_status})
        else:
            continue

        if msg.broadcast_id:
            rec = (db.query(BroadcastRecipient)
                   .filter_by(broadcast_id=msg.broadcast_id, customer_id=msg.customer_id)
                   .first())
            if rec and rec.status != "replied":
                rec.status = msg.status
            publish("broadcast_progress", {"broadcast_id": msg.broadcast_id})
        db.commit()


def handle_template_update(db, shop: Shop, value: dict) -> None:
    name = value.get("message_template_name", "")
    event = (value.get("event") or "").lower()  # APPROVED | REJECTED | PAUSED | ...
    if not name or not event:
        return
    tpl = db.query(Template).filter_by(shop_id=shop.id, name=name).first()
    if tpl:
        tpl.status = event
        tpl.rejected_reason = value.get("reason") or ""
        tpl.updated_at = datetime.now()
        db.commit()
        publish("template_status", {"shop_id": shop.id, "name": name, "status": event})


def handle_account_update(db, shop: Shop, value: dict) -> None:
    event = value.get("event")
    if event == "MM_LITE_TERMS_SIGNED":
        shop.wa_mm_terms_status = "TERM_OF_SERVICE_SIGNED"
        signed_at = value.get("time")
        if signed_at:
            try:
                shop.wa_mm_terms_signed_at = datetime.fromtimestamp(int(signed_at))
            except (TypeError, ValueError, OSError):
                pass
        db.commit()
        publish("mm_terms_signed", {"shop_id": shop.id, "waba_id": shop.waba_id})
        return

    # PARTNER_REMOVED / ACCOUNT_OFFBOARDED — seller disconnected from Cloud API
    # (e.g. uninstalled the Business Platform). Mark them so the UI can prompt.
    if event in ("PARTNER_REMOVED", "ACCOUNT_OFFBOARDED", "ACCOUNT_RECONNECTED"):
        reconnected = event == "ACCOUNT_RECONNECTED"
        shop.wa_connected = reconnected
        if event == "PARTNER_REMOVED":
            shop.wa_is_on_biz_app = False
        db.commit()
        publish("wa_connected" if reconnected else "wa_disconnected", {"shop_id": shop.id})


def handle_coexistence(db, shop: Shop, field: str, value: dict) -> None:
    """Digest the 3 coexistence webhook fields (K-02):
    - smb_app_state_sync  → contacts list (upsert into Customers)
    - history             → past 1:1 messages (upsert into Messages)
    - smb_message_echoes  → new messages the seller sent from the Business app
                            after onboarding (mirror into the thread)
    Best-effort and idempotent (deduped on wamid)."""
    if not shop.wa_is_on_biz_app:
        return

    if field == "smb_app_state_sync":
        for c in value.get("contacts") or []:
            if not isinstance(c, dict):
                continue
            wa_id = c.get("wa_id") or c.get("input") or ""
            phone = to_local(str(wa_id))
            if not phone:
                continue
            if not db.query(Customer).filter(Customer.shop_id == shop.id,
                                             Customer.phone.like(f"%{phone}")).first():
                name = (c.get("profile") or {}).get("name", "")
                db.add(Customer(shop_id=shop.id, phone=phone, name=name or phone))
                shop.wa_contacts_synced += 1
        shop.wa_history_sync_status = "pending"
        db.commit()
        return

    if field in ("history", "smb_message_echoes"):
        cust = None
        for m in value.get("messages", []):
            wamid = m.get("id", "")
            if _already_stored(db, wamid):
                continue
            phone = to_local(m.get("from", ""))
            if not phone:
                continue
            cust = _find_or_create_customer(db, shop, phone,
                                            (m.get("profile") or {}).get("name", ""))
            db.add(Message(shop_id=shop.id, customer_id=cust.id, direction="in",
                           kind="text", body=extract_text(m), status="read",
                           wamid=wamid, created_at=_message_timestamp(m)))
            db.flush()  # make wamid visible to the dedup query on the next iteration
            shop.wa_messages_synced += 1
        if field == "history":
            shop.wa_history_sync_status = "done"
        shop.wa_history_synced_at = datetime.now()
        db.commit()
        last = (value.get("messages") or [])[-1] if value.get("messages") else None
        publish("message_in", {
            "customer_id": cust.id if (last and cust) else 0,
            "body": extract_text(last) if last else "",
        })
