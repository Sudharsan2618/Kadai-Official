"""Meta WhatsApp webhook receiver (cloud mode).

GET  /wa/webhook  — Meta's one-time verification handshake (verify token).
POST /wa/webhook  — signed events: inbound messages (opens the real 24h
                    window), delivery/read statuses (keyed by wamid), template
                    approval updates, and the coexistence sync fields.

This file does three things only: check the signature, resolve the tenant,
hand the payload to app.services.wa.inbound. Meta re-delivers anything we
don't ACK, so one bad entry must never 500 the batch."""
import hashlib
import hmac
import json
import logging

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from app.db.session import SessionLocal
from app.services.wa import inbound
from app.settings import settings

log = logging.getLogger(__name__)

router = APIRouter(prefix="/wa", tags=["whatsapp-webhook"])


@router.get("/webhook")
def verify(hub_mode: str = Query("", alias="hub.mode"),
           hub_verify_token: str = Query("", alias="hub.verify_token"),
           hub_challenge: str = Query("", alias="hub.challenge")):
    if hub_mode == "subscribe" and settings.wa.verify_token and \
            hmac.compare_digest(hub_verify_token, settings.wa.verify_token):
        return PlainTextResponse(hub_challenge)
    raise HTTPException(status_code=403, detail="Verification failed")


def _check_signature(raw: bytes, header: str) -> None:
    """X-Hub-Signature-256 = sha256=HMAC(app_secret, raw_body)."""
    if not settings.wa.app_secret:
        raise HTTPException(status_code=503, detail="META_APP_SECRET not configured")
    expected = "sha256=" + hmac.new(settings.wa.app_secret.encode(), raw,
                                    hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, header or ""):
        raise HTTPException(status_code=403, detail="Bad signature")


def _dispatch(db, entry: dict, change: dict) -> None:
    field = change.get("field", "")
    value = change.get("value", {}) or {}
    entry_id = str(entry.get("id", ""))

    if field == "message_template_status_update":
        # template events carry the WABA id in entry.id
        shop = inbound.shop_by_waba_id(db, entry_id)
        if shop:
            inbound.handle_template_update(db, shop, value)
        return

    if field == "account_update":
        shop = inbound.shop_by_waba_id(db, entry_id)
        if shop:
            inbound.handle_account_update(db, shop, value)
        return

    phone_number_id = (value.get("metadata") or {}).get("phone_number_id", "")
    shop = inbound.shop_by_phone_id(db, phone_number_id)
    if not shop:
        return

    if field in inbound.COEXISTENCE_FIELDS:
        inbound.handle_coexistence(db, shop, field, value)
        return

    if value.get("messages"):
        inbound.handle_inbound(db, shop, value)
    if value.get("statuses"):
        inbound.handle_statuses(db, shop, value)


@router.post("/webhook")
async def receive(request: Request):
    raw = await request.body()
    _check_signature(raw, request.headers.get("x-hub-signature-256", ""))
    try:
        event = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Bad payload")

    with SessionLocal() as db:
        for entry in event.get("entry", []):
            for change in entry.get("changes", []):
                try:
                    _dispatch(db, entry, change)
                except Exception:
                    # ACK anyway; a poison message must not block the queue.
                    db.rollback()
                    log.exception("webhook entry failed (field=%s)", change.get("field"))
    return {"ok": True}
