"""Customers — the seller's contact book. Shop-scoped + paginated."""
import re

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import current_shop, owned_customer
from app.db.session import get_db
from app.models import Customer, Order, Shop
from app.services.read_models import customer_summary

router = APIRouter(tags=["customers"])

PHONE_DIGITS = 10
EDITABLE_FIELDS = ("name", "phone", "area", "tags", "notes")


def clean_phone(phone: str) -> str:
    """Store bare local numbers; the WhatsApp layer adds the country code."""
    digits = re.sub(r"\D", "", phone or "")
    return digits[-PHONE_DIGITS:] if len(digits) >= PHONE_DIGITS else digits


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
    phone = clean_phone(payload.get("phone") or "")
    if not name:
        raise HTTPException(400, "Name is required")
    if len(phone) != PHONE_DIGITS:
        raise HTTPException(400, f"Enter a valid {PHONE_DIGITS}-digit WhatsApp number")
    existing = db.query(Customer).filter(Customer.shop_id == shop.id).all()
    if any(clean_phone(c.phone) == phone for c in existing):
        raise HTTPException(409, "A customer with this number already exists")
    c = Customer(shop_id=shop.id, name=name, phone=phone,
                 area=(payload.get("area") or "").strip(), tags=payload.get("tags", []))
    db.add(c)
    db.commit()
    return {"id": c.id}


@router.get("/customers/{customer_id}")
def customer_detail(customer_id: int,
                    db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    c = owned_customer(db, shop, customer_id)
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
    c = owned_customer(db, shop, customer_id)
    if "phone" in payload:
        phone = clean_phone(payload["phone"])
        if len(phone) != PHONE_DIGITS:
            raise HTTPException(400, f"Enter a valid {PHONE_DIGITS}-digit WhatsApp number")
        payload["phone"] = phone
    for key in EDITABLE_FIELDS:
        if key in payload:
            setattr(c, key, payload[key])
    db.commit()
    return {"ok": True}
