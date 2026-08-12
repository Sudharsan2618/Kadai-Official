"""Ready messages — the seller's saved, reusable message bodies.

In cloud mode each one can be submitted to Meta as a template; that lives in
the whatsapp route since it only exists against the real API."""
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import current_shop
from app.db.session import get_db
from app.models import ReadyMessage, Shop

router = APIRouter(tags=["ready-messages"])

MIN_BODY_LEN = 10
EDITABLE_FIELDS = ("label", "body", "approved", "sort_order")


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
    if not label or len(body) < MIN_BODY_LEN:
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
    if "body" in payload and len((payload["body"] or "").strip()) < MIN_BODY_LEN:
        raise HTTPException(400, "Body is too short")
    for key in EDITABLE_FIELDS:
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
