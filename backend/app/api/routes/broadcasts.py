"""Broadcasts — one ready message to many customers, sent paced by the engine."""
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import current_shop
from app.db.session import get_db
from app.models import Broadcast, BroadcastRecipient, Customer, ReadyMessage, Shop
from app.services import wa

router = APIRouter(tags=["broadcasts"])


def _broadcast_row(b: Broadcast) -> dict:
    recs = b.recipients
    return {
        "id": b.id, "title": b.title, "body": b.body, "status": b.status,
        "created_at": b.created_at.isoformat(), "recipients": len(recs),
        "queued": sum(1 for r in recs if r.status == "queued"),
        "delivered": sum(1 for r in recs if r.status in ("delivered", "read", "replied")),
        "read": sum(1 for r in recs if r.status in ("read", "replied")),
        "replied": sum(1 for r in recs if r.status == "replied"),
        "failed": sum(1 for r in recs if r.status == "failed"),
    }


@router.get("/broadcasts")
def broadcasts(page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100),
               db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    base = db.query(Broadcast).filter(Broadcast.shop_id == shop.id)
    total = base.count()
    rows = (base.order_by(Broadcast.created_at.desc())
            .offset((page - 1) * page_size).limit(page_size).all())
    return {
        "items": [_broadcast_row(b) for b in rows],
        "total": total, "page": page,
        "has_more": page * page_size < total,
    }


@router.post("/broadcasts")
def create_broadcast(payload: dict = Body(...),
                     db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    """Queue a ready message to a set of customers; the engine sends paced."""
    rm = db.get(ReadyMessage, payload.get("ready_message_id")) if payload.get("ready_message_id") else None
    if rm and rm.shop_id != shop.id:
        raise HTTPException(404, "Ready message not found")
    body = payload.get("body") or (rm.body if rm else "")
    if not body:
        raise HTTPException(400, "Pick a ready message")
    customer_ids = payload.get("customer_ids") or []
    if not customer_ids:
        raise HTTPException(400, "Pick at least one customer")

    own_ids = {c.id for c in db.query(Customer).filter(Customer.shop_id == shop.id,
                                                       Customer.id.in_(customer_ids))}
    if not own_ids:
        raise HTTPException(400, "No valid customers selected")

    b = Broadcast(shop_id=shop.id,
                  title=payload.get("title") or (rm.label if rm else "Broadcast"),
                  body=body, status="sending")
    db.add(b)
    db.commit()
    db.refresh(b)

    for cid in own_ids:
        db.add(BroadcastRecipient(broadcast_id=b.id, customer_id=cid, status="queued"))
    db.commit()
    wa.start_broadcast(b.id)
    return {"id": b.id, "recipients": len(own_ids)}


@router.post("/broadcasts/{broadcast_id}/resend-failed")
def resend_failed(broadcast_id: int,
                  db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    b = db.get(Broadcast, broadcast_id)
    if not b or b.shop_id != shop.id:
        raise HTTPException(404, "Not found")
    count = wa.requeue_failed(db, broadcast_id)
    if count == 0:
        return {"requeued": 0}
    wa.start_broadcast(broadcast_id)
    return {"requeued": count}
