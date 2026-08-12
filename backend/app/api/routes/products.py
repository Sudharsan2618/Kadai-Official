"""Catalog — what the shop sells today, at what price."""
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import current_shop
from app.db.session import get_db
from app.models import Product, Shop

router = APIRouter(tags=["products"])

EDITABLE_FIELDS = ("name", "unit", "price", "in_stock")


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
    for key in EDITABLE_FIELDS:
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
