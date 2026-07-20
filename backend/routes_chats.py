"""Conversations, thread, window-aware sending, ready messages. Shop-scoped."""
from fastapi import APIRouter, Depends, Body, HTTPException, Query
from sqlalchemy.orm import Session
from config import MAX_TEXT_LEN
from db import get_db
from deps import current_shop
from models import Message, Customer, ReadyMessage, Shop
from domain import conversation_rows, window_info
import wa

router = APIRouter()


def _own_customer(db: Session, shop: Shop, customer_id: int) -> Customer:
    cust = db.get(Customer, customer_id)
    if not cust or cust.shop_id != shop.id:
        raise HTTPException(404, "Customer not found")
    return cust


@router.get("/chats")
def chats(page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=200),
          db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    return conversation_rows(db, shop.id, page, page_size)


@router.get("/chats/{customer_id}")
def chat_thread(customer_id: int,
                before_id: int | None = Query(None),
                limit: int = Query(50, ge=1, le=200),
                db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    cust = _own_customer(db, shop, customer_id)
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
            "ready_label": m.ready_label, "status": m.status, "created_at": m.created_at.isoformat(),
        } for m in msgs],
    }


@router.post("/chats/{customer_id}/send")
def send_text(customer_id: int, payload: dict = Body(...),
              db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    """Free-text message — only allowed inside the 24h window (Meta rule)."""
    _own_customer(db, shop, customer_id)
    text = (payload.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Message is empty")
    if len(text) > MAX_TEXT_LEN:
        raise HTTPException(400, f"Message too long — WhatsApp allows {MAX_TEXT_LEN} characters")
    win = window_info(db, customer_id)
    if not win["open"]:
        raise HTTPException(409, "Window closed — send a ready message instead")
    msg = wa.send_message(db, customer_id, text, kind="text")
    if msg.status == "failed":
        raise HTTPException(502, "Couldn't send after retries — try again")
    return {"id": msg.id, "status": msg.status}


@router.post("/chats/{customer_id}/send-ready")
def send_ready(customer_id: int, payload: dict = Body(...),
               db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    """Ready message (approved template) — allowed anytime."""
    cust = _own_customer(db, shop, customer_id)
    rm = db.get(ReadyMessage, payload.get("ready_message_id"))
    if not rm or rm.shop_id != shop.id:
        raise HTTPException(404, "Ready message not found")
    body = rm.body.replace("{name}", cust.name).replace("{shop}", shop.name)
    try:
        msg = wa.send_message(db, customer_id, body, kind="ready", ready_label=rm.label)
    except Exception as e:
        # cloud mode: out-of-window send with no approved template → clear 409
        from wa_cloud import WaBlocked
        if isinstance(e, WaBlocked):
            raise HTTPException(409, str(e))
        raise
    if msg.status == "failed":
        raise HTTPException(502, "Couldn't send after retries — try again")
    return {"id": msg.id, "status": msg.status}


@router.get("/ready-messages")
def ready_messages(db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    rows = (db.query(ReadyMessage).filter(ReadyMessage.shop_id == shop.id)
            .order_by(ReadyMessage.sort_order).all())
    return [{"id": r.id, "label": r.label, "body": r.body, "approved": r.approved} for r in rows]


@router.post("/ready-messages")
def create_ready_message(payload: dict = Body(...),
                         db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    label = (payload.get("label") or "").strip()
    body = (payload.get("body") or "").strip()
    if not label or len(body) < 10:
        raise HTTPException(400, "Give the message a name and a proper body")
    rm = ReadyMessage(shop_id=shop.id, label=label, body=body,
                      sort_order=payload.get("sort_order", 99))
    db.add(rm)
    db.commit()
    return {"id": rm.id}


@router.patch("/ready-messages/{rm_id}")
def update_ready_message(rm_id: int, payload: dict = Body(...),
                         db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    rm = db.get(ReadyMessage, rm_id)
    if not rm or rm.shop_id != shop.id:
        raise HTTPException(404, "Not found")
    if "label" in payload and not (payload["label"] or "").strip():
        raise HTTPException(400, "Name can't be empty")
    if "body" in payload and len((payload["body"] or "").strip()) < 10:
        raise HTTPException(400, "Body is too short")
    for key in ("label", "body", "approved", "sort_order"):
        if key in payload:
            setattr(rm, key, payload[key])
    db.commit()
    return {"ok": True}


@router.delete("/ready-messages/{rm_id}")
def delete_ready_message(rm_id: int,
                         db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    rm = db.get(ReadyMessage, rm_id)
    if rm and rm.shop_id == shop.id:
        db.delete(rm)
        db.commit()
    return {"ok": True}
