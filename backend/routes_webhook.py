"""Meta WhatsApp webhook receiver (cloud mode).

GET  /wa/webhook  — Meta's one-time verification handshake (verify token).
POST /wa/webhook  — signed events: inbound messages (opens the real 24h
                    window), delivery/read statuses (keyed by wamid), and
                    template approval updates.

Rules Meta enforces that shape this code:
- must ACK 200 within seconds or Meta retries → handlers are cheap DB writes
  and every path is idempotent (dedupe on wamid) so retries are harmless
- payload authenticity: X-Hub-Signature-256 = sha256=HMAC(app_secret, raw_body)
- multi-tenant: every event carries metadata.phone_number_id — that is the
  tenant key (replaces current_shop, which needs a JWT we don't have here)
"""
import hashlib
import hmac
import json
import re
from datetime import datetime

from fastapi import APIRouter, Request, Query, HTTPException
from fastapi.responses import PlainTextResponse

import config
from db import SessionLocal
from models import Shop, Customer, Message, BroadcastRecipient, Template
from events import publish

router = APIRouter(prefix="/wa", tags=["whatsapp-webhook"])

STATUS_RANK = {"sent": 1, "delivered": 2, "read": 3}


@router.get("/webhook")
def verify(hub_mode: str = Query("", alias="hub.mode"),
           hub_verify_token: str = Query("", alias="hub.verify_token"),
           hub_challenge: str = Query("", alias="hub.challenge")):
    if hub_mode == "subscribe" and config.WA_VERIFY_TOKEN and \
            hmac.compare_digest(hub_verify_token, config.WA_VERIFY_TOKEN):
        return PlainTextResponse(hub_challenge)
    raise HTTPException(status_code=403, detail="Verification failed")


def _check_signature(raw: bytes, header: str):
    if not config.META_APP_SECRET:
        raise HTTPException(status_code=503, detail="META_APP_SECRET not configured")
    expected = "sha256=" + hmac.new(config.META_APP_SECRET.encode(), raw,
                                    hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, header or ""):
        raise HTTPException(status_code=403, detail="Bad signature")


def _shop_by_phone_id(db, phone_number_id: str) -> Shop | None:
    if not phone_number_id:
        return None
    return db.query(Shop).filter(Shop.phone_number_id == str(phone_number_id)).first()


def _local_phone(wa_id: str) -> str:
    """Meta sends E.164 without '+' (e.g. 919843000001); the app stores bare
    10-digit numbers, so keep the last 10 for matching + display."""
    digits = re.sub(r"\D", "", wa_id or "")
    return digits[-10:] if len(digits) >= 10 else digits


def _extract_text(m: dict) -> str:
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


def _handle_inbound(db, shop: Shop, value: dict):
    contacts = {c.get("wa_id"): (c.get("profile") or {}).get("name", "")
                for c in value.get("contacts", [])}
    for m in value.get("messages", []):
        wamid = m.get("id", "")
        if wamid and db.query(Message.id).filter(Message.wamid == wamid).first():
            continue  # Meta retry — already stored
        phone = _local_phone(m.get("from", ""))
        if not phone:
            continue
        cust = (db.query(Customer)
                .filter(Customer.shop_id == shop.id, Customer.phone.like(f"%{phone}"))
                .first())
        if not cust:
            cust = Customer(shop_id=shop.id, phone=phone,
                            name=contacts.get(m.get("from"), "") or phone)
            db.add(cust)
            db.flush()
        try:  # Meta timestamps are unix seconds — this is what makes the 24h window real
            created = datetime.fromtimestamp(int(m.get("timestamp", 0)))
        except (ValueError, OSError):
            created = datetime.now()
        msg = Message(shop_id=shop.id, customer_id=cust.id, direction="in",
                      kind="text", body=_extract_text(m), status="read",
                      wamid=wamid, created_at=created)
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


def _handle_statuses(db, shop: Shop, value: dict):
    for s in value.get("statuses", []):
        wamid = s.get("id", "")
        new_status = s.get("status", "")  # sent | delivered | read | failed
        msg = db.query(Message).filter(Message.wamid == wamid).first() if wamid else None
        if not msg:
            continue
        if new_status == "failed":
            msg.status = "failed"
            errs = s.get("errors") or []
            detail = errs[0].get("title", "") if errs else ""
            publish("message_status", {"customer_id": msg.customer_id,
                                       "message_id": msg.id, "status": "failed",
                                       "error": detail})
        elif STATUS_RANK.get(new_status, 0) > STATUS_RANK.get(msg.status, 0):
            msg.status = new_status  # never downgrade (retried webhooks arrive out of order)
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


def _handle_template_update(db, shop: Shop, value: dict):
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


@router.post("/webhook")
async def receive(request: Request):
    raw = await request.body()
    _check_signature(raw, request.headers.get("x-hub-signature-256", ""))
    try:
        event = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Bad payload")

    # Everything below is best-effort: one bad entry must not 500 the batch,
    # or Meta re-delivers the whole thing forever.
    with SessionLocal() as db:
        for entry in event.get("entry", []):
            for change in entry.get("changes", []):
                field = change.get("field", "")
                value = change.get("value", {}) or {}
                try:
                    if field == "message_template_status_update":
                        # template events carry the WABA id in entry.id
                        shop = db.query(Shop).filter(Shop.waba_id == str(entry.get("id", ""))).first()
                        if shop:
                            _handle_template_update(db, shop, value)
                        continue
                    shop = _shop_by_phone_id(db, (value.get("metadata") or {}).get("phone_number_id", ""))
                    if not shop:
                        continue
                    if value.get("messages"):
                        _handle_inbound(db, shop, value)
                    if value.get("statuses"):
                        _handle_statuses(db, shop, value)
                except Exception:
                    db.rollback()  # ack anyway; a poison message must not block the queue
    return {"ok": True}
