"""Conversations, thread, window-aware sending. Shop-scoped."""
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import current_shop, owned_customer
from app.db.session import get_db
from app.models import Message, ReadyMessage, Shop
from app.services import wa
from app.services.read_models import conversation_rows, window_info
from app.services.wa.errors import WaBlocked
from app.settings import settings

router = APIRouter(tags=["chats"])


@router.get("/chats")
def chats(page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=200),
          db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    return conversation_rows(db, shop.id, page, page_size)


@router.get("/chats/{customer_id}")
def chat_thread(customer_id: int,
                before_id: int | None = Query(None),
                limit: int = Query(50, ge=1, le=200),
                db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    cust = owned_customer(db, shop, customer_id)
    q = db.query(Message).filter(Message.customer_id == customer_id)
    if before_id:
        q = q.filter(Message.id < before_id)
    msgs = q.order_by(Message.id.desc()).limit(limit + 1).all()
    has_more = len(msgs) > limit
    msgs = list(reversed(msgs[:limit]))
    return {
        "customer": {"id": cust.id, "name": cust.name, "phone": cust.phone, "area": cust.area},
        "window": window_info(db, customer_id),
        "has_more": has_more,
        "oldest_id": msgs[0].id if msgs else None,
        "messages": [{
            "id": m.id, "direction": m.direction, "kind": m.kind, "body": m.body,
            "ready_label": m.ready_label, "status": m.status,
            "created_at": m.created_at.isoformat(),
        } for m in msgs],
    }


@router.post("/chats/{customer_id}/send")
def send_text(customer_id: int, payload: dict = Body(...),
              db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    """Free-text message — only allowed inside the 24h window (Meta rule)."""
    owned_customer(db, shop, customer_id)
    text = (payload.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Message is empty")
    if len(text) > settings.wa.max_text_len:
        raise HTTPException(
            400, f"Message too long — WhatsApp allows {settings.wa.max_text_len} characters")
    if not window_info(db, customer_id)["open"]:
        raise HTTPException(409, "Window closed — send a ready message instead")

    msg = wa.send_message(db, customer_id, text, kind="text")
    if msg.status == "failed":
        raise HTTPException(502, "Couldn't send after retries — try again")
    return {"id": msg.id, "status": msg.status}


@router.post("/chats/{customer_id}/send-ready")
def send_ready(customer_id: int, payload: dict = Body(...),
               db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    """Ready message (approved template) — allowed anytime."""
    cust = owned_customer(db, shop, customer_id)
    rm = db.get(ReadyMessage, payload.get("ready_message_id"))
    if not rm or rm.shop_id != shop.id:
        raise HTTPException(404, "Ready message not found")
    body = rm.body.replace("{name}", cust.name).replace("{shop}", shop.name)
    try:
        msg = wa.send_message(db, customer_id, body, kind="ready", ready_label=rm.label)
    except WaBlocked as e:
        # cloud mode: out-of-window send with no approved template
        raise HTTPException(409, str(e))
    if msg.status == "failed":
        raise HTTPException(502, "Couldn't send after retries — try again")
    return {"id": msg.id, "status": msg.status}
