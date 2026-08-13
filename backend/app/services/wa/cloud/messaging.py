"""Outbound sending over the Meta Cloud API.

Differences from the mock, by design:
- sends hit POST /{phone_number_id}/messages and store the returned wamid on
  the Message row; delivery/read ticks arrive via the webhook, never simulated
- outside a customer's 24h service window free text is refused by Meta, so
  ready/broadcast sends fall back to that ready message's APPROVED template
- marketing broadcasts go through MM API (/marketing_messages), which only
  ever accepts templates
- per-tenant auth: every call is signed with the shop's own token"""
import asyncio
import logging
import time

from app.core import runtime
from app.core.events import publish
from app.db.session import SessionLocal
from app.models import Broadcast, BroadcastRecipient, Customer, Message, Shop
from app.services.read_models import window_info
from app.services.wa.cloud.client import (graph, mark_token_expired, require_connected,
                                          shop_token, to_e164)
from app.services.wa.cloud.templates import approved_template, param_values
from app.services.wa.errors import PAYMENT_ISSUE_CODE, WaBlocked, WaError
from app.settings import settings

log = logging.getLogger(__name__)

SEND_RETRIES = 2
RETRY_BACKOFF_SECONDS = 1.0


def _send_payload(db, shop: Shop, cust: Customer, body: str, kind: str,
                  ready_label: str) -> dict:
    """Choose free text (window open) vs approved template (window closed)."""
    # Marketing broadcasts always use MM API. It only accepts templates, even
    # when the recipient's 24-hour service window happens to be open.
    if kind != "broadcast" and window_info(db, cust.id)["open"]:
        return {"messaging_product": "whatsapp", "to": to_e164(cust.phone),
                "type": "text", "text": {"preview_url": False, "body": body}}

    if kind == "text":
        raise WaBlocked("24h window closed — send a ready message (approved template) instead")

    tpl = approved_template(db, shop, ready_label)
    if not tpl:
        raise WaBlocked(
            f'"{ready_label}" has no approved WhatsApp template yet — submit it for '
            "approval in Settings before messaging outside the 24h window")
    values = param_values(tpl.params, cust, shop)
    components = []
    if values:
        components.append({"type": "body",
                           "parameters": [{"type": "text", "text": v} for v in values]})
    return {"messaging_product": "whatsapp", "recipient_type": "individual",
            "to": to_e164(cust.phone), "type": "template",
            "template": {"name": tpl.name, "language": {"code": tpl.language},
                         "components": components}}


def record_send_outcome(db, shop: Shop, ok: bool, err: WaError | None) -> None:
    """Update what we know about this account's ability to send.

    A success proves billing is in place; 131042 proves it is not. Anything else
    tells us nothing about billing, so we leave the flag alone rather than
    guessing — a wrong 'add a payment method' banner is worse than none."""
    changed = False
    if ok:
        if not shop.wa_payment_ready:
            shop.wa_payment_ready = True
            changed = True
        if shop.wa_last_error_code:
            shop.wa_last_error_code = 0
            changed = True
    elif err is not None:
        if shop.wa_last_error_code != err.code:
            shop.wa_last_error_code = err.code
            changed = True
        if err.code == PAYMENT_ISSUE_CODE and shop.wa_payment_ready:
            shop.wa_payment_ready = False
            changed = True
    if changed:
        db.commit()


def send_message(db, customer_id: int, body: str, kind: str = "text",
                 ready_label: str = "", broadcast_id: int | None = None,
                 tick: bool = True) -> Message:
    """Send via Graph API with bounded retries. Persists 'sent' (+ wamid) or
    'failed' — real delivery/read ticks arrive later via webhook, so `tick`
    is accepted for interface parity and ignored."""
    cust = db.get(Customer, customer_id)
    if not cust:
        raise WaBlocked("Customer not found")
    shop = db.get(Shop, cust.shop_id)
    require_connected(shop)
    token = shop_token(shop)
    payload = _send_payload(db, shop, cust, body, kind, ready_label)

    endpoint = "/marketing_messages" if kind == "broadcast" else "/messages"
    if kind == "broadcast":
        payload["message_activity_sharing"] = settings.wa.mm_message_activity_sharing

    wamid, ok, last_err = "", False, None
    for attempt in range(SEND_RETRIES + 1):
        try:
            resp = graph("POST", f"/{shop.phone_number_id}{endpoint}", token, payload)
            wamid = (resp.get("messages") or [{}])[0].get("id", "")
            ok = True
            break
        except WaError as e:
            last_err = e
            if e.auth_expired:
                mark_token_expired(db, shop)
                break
            if not e.transient or attempt >= SEND_RETRIES:
                break
            time.sleep(RETRY_BACKOFF_SECONDS * (attempt + 1))

    # Every send teaches us something about whether this account can actually
    # send. Meta exposes no endpoint for "is billing set up", so the send result
    # is the only source of truth we get — record it either way.
    record_send_outcome(db, shop, ok, last_err)

    if not ok:
        log.warning("shop %s: send to customer %s failed — %s", shop.id, customer_id, last_err)

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


# ── Broadcast fan-out (paced, template-aware, no fake ticks) ────────────────
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
