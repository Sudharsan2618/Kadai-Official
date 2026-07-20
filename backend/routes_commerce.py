"""Customers, catalog, orders, broadcasts. Shop-scoped + paginated."""
import re
from fastapi import APIRouter, Depends, Body, HTTPException, Query
from sqlalchemy.orm import Session
from db import get_db
from deps import current_shop
from models import Customer, Product, Order, Broadcast, BroadcastRecipient, ReadyMessage, Shop
from domain import customer_summary
import wa

router = APIRouter()


def _clean_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    return digits[-10:] if len(digits) >= 10 else digits


def _own_customer(db: Session, shop: Shop, customer_id: int) -> Customer:
    c = db.get(Customer, customer_id)
    if not c or c.shop_id != shop.id:
        raise HTTPException(404, "Customer not found")
    return c


# ── Customers ────────────────────────────────────────────────────────────────
@router.get("/customers")
def customers(page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=200),
              db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    base = db.query(Customer).filter(Customer.shop_id == shop.id)
    total = base.count()
    rows = (base.order_by(Customer.name)
            .offset((page - 1) * page_size).limit(page_size).all())
    return {
        "items": [customer_summary(db, c) for c in rows],
        "total": total, "page": page,
        "has_more": page * page_size < total,
    }


@router.post("/customers")
def create_customer(payload: dict = Body(...),
                    db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    name = (payload.get("name") or "").strip()
    phone = _clean_phone(payload.get("phone") or "")
    if not name:
        raise HTTPException(400, "Name is required")
    if len(phone) != 10:
        raise HTTPException(400, "Enter a valid 10-digit WhatsApp number")
    existing = db.query(Customer).filter(Customer.shop_id == shop.id).all()
    if any(_clean_phone(c.phone) == phone for c in existing):
        raise HTTPException(409, "A customer with this number already exists")
    c = Customer(shop_id=shop.id, name=name, phone=phone,
                 area=(payload.get("area") or "").strip(), tags=payload.get("tags", []))
    db.add(c)
    db.commit()
    return {"id": c.id}


@router.get("/customers/{customer_id}")
def customer_detail(customer_id: int,
                    db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    c = _own_customer(db, shop, customer_id)
    orders = (db.query(Order).filter(Order.customer_id == customer_id)
              .order_by(Order.created_at.desc()).limit(20).all())
    return {
        **customer_summary(db, c),
        "orders": [{"id": o.id, "items": o.items, "total": o.total, "status": o.status,
                    "created_at": o.created_at.isoformat()} for o in orders],
    }


@router.patch("/customers/{customer_id}")
def update_customer(customer_id: int, payload: dict = Body(...),
                    db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    c = _own_customer(db, shop, customer_id)
    if "phone" in payload:
        phone = _clean_phone(payload["phone"])
        if len(phone) != 10:
            raise HTTPException(400, "Enter a valid 10-digit WhatsApp number")
        payload["phone"] = phone
    for key in ("name", "phone", "area", "tags", "notes"):
        if key in payload:
            setattr(c, key, payload[key])
    db.commit()
    return {"ok": True}


# ── Catalog ──────────────────────────────────────────────────────────────────
@router.get("/products")
def products(db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    rows = (db.query(Product).filter(Product.shop_id == shop.id)
            .order_by(Product.id).all())
    return [{"id": p.id, "name": p.name, "unit": p.unit, "price": p.price,
             "in_stock": p.in_stock} for p in rows]


@router.post("/products")
def create_product(payload: dict = Body(...),
                   db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    name = (payload.get("name") or "").strip()
    price = payload.get("price") or 0
    if not name:
        raise HTTPException(400, "Item name is required")
    if price <= 0:
        raise HTTPException(400, "Price must be more than 0")
    p = Product(shop_id=shop.id, name=name, unit=payload.get("unit", "kg"),
                price=price, in_stock=payload.get("in_stock", True))
    db.add(p)
    db.commit()
    return {"id": p.id}


@router.patch("/products/{product_id}")
def update_product(product_id: int, payload: dict = Body(...),
                   db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    p = db.get(Product, product_id)
    if not p or p.shop_id != shop.id:
        raise HTTPException(404, "Not found")
    if "price" in payload and (payload["price"] or 0) <= 0:
        raise HTTPException(400, "Price must be more than 0")
    for key in ("name", "unit", "price", "in_stock"):
        if key in payload:
            setattr(p, key, payload[key])
    db.commit()
    return {"ok": True}


@router.delete("/products/{product_id}")
def delete_product(product_id: int,
                   db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    p = db.get(Product, product_id)
    if p and p.shop_id == shop.id:
        db.delete(p)
        db.commit()
    return {"ok": True}


# ── Orders ───────────────────────────────────────────────────────────────────
ORDER_STATUSES = ["new", "packed", "payment_due", "paid", "delivered", "cancelled"]


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
    _own_customer(db, shop, payload.get("customer_id"))
    items = payload.get("items", [])
    total = payload.get("total") or sum(i.get("qty", 1) * i.get("price", 0) for i in items)
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
        o.total = payload.get("total") or sum(i.get("qty", 1) * i.get("price", 0) for i in o.items)
    db.commit()
    return {"ok": True}


# ── Broadcasts ───────────────────────────────────────────────────────────────
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
