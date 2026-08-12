"""Orders — created from chat, moved along a fixed status ladder."""
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import current_shop, owned_customer
from app.db.session import get_db
from app.models import ORDER_STATUSES, Order, Shop

router = APIRouter(tags=["orders"])


def _line_total(items: list) -> float:
    return sum(i.get("qty", 1) * i.get("price", 0) for i in items)


@router.get("/orders")
def orders(page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
           db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    base = db.query(Order).filter(Order.shop_id == shop.id)
    total = base.count()
    rows = (base.order_by(Order.created_at.desc())
            .offset((page - 1) * page_size).limit(page_size).all())
    return {
        "items": [{
            "id": o.id, "customer_id": o.customer_id,
            "customer": o.customer.name if o.customer else "",
            "phone": o.customer.phone if o.customer else "",
            "items": o.items, "total": o.total, "status": o.status,
            "created_at": o.created_at.isoformat(),
        } for o in rows],
        "total": total, "page": page,
        "has_more": page * page_size < total,
    }


@router.post("/orders")
def create_order(payload: dict = Body(...),
                 db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    owned_customer(db, shop, payload.get("customer_id"))
    items = payload.get("items", [])
    total = payload.get("total") or _line_total(items)
    o = Order(shop_id=shop.id, customer_id=payload["customer_id"],
              items=items, total=total, status=payload.get("status", "new"))
    db.add(o)
    db.commit()
    return {"id": o.id}


@router.patch("/orders/{order_id}")
def update_order(order_id: int, payload: dict = Body(...),
                 db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    o = db.get(Order, order_id)
    if not o or o.shop_id != shop.id:
        raise HTTPException(404, "Not found")
    if "status" in payload:
        if payload["status"] not in ORDER_STATUSES:
            raise HTTPException(400, "Bad status")
        o.status = payload["status"]
    if "items" in payload:
        o.items = payload["items"]
        o.total = payload.get("total") or _line_total(o.items)
    db.commit()
    return {"ok": True}
