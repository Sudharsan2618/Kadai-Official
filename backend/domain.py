"""Shared read-model helpers. All list helpers are shop-scoped."""
from datetime import datetime, timedelta
from sqlalchemy import func
from config import WINDOW_HOURS
from models import Message, Customer, Order


def window_info(db, customer_id: int) -> dict:
    last_in = (db.query(func.max(Message.created_at))
               .filter(Message.customer_id == customer_id, Message.direction == "in")
               .scalar())
    if not last_in:
        return {"open": False, "expires_at": None}
    expires = last_in + timedelta(hours=WINDOW_HOURS)
    return {"open": datetime.now() < expires, "expires_at": expires.isoformat()}


def conversation_rows(db, shop_id: int, page: int = 1, page_size: int = 100) -> dict:
    customer_ids = [cid for (cid,) in (db.query(Message.customer_id)
                                       .filter(Message.shop_id == shop_id)
                                       .distinct())]
    rows = []
    for cid in customer_ids:
        cust = db.get(Customer, cid)
        last = (db.query(Message).filter(Message.customer_id == cid)
                .order_by(Message.created_at.desc()).first())
        if not cust or cust.shop_id != shop_id or not last:
            continue
        rows.append({
            "customer_id": cid,
            "name": cust.name,
            "phone": cust.phone,
            "area": cust.area,
            "last_body": last.body[:80],
            "last_at": last.created_at.isoformat(),
            "needs_reply": last.direction == "in",
            "window": window_info(db, cid),
        })
    rows.sort(key=lambda r: r["last_at"], reverse=True)
    total = len(rows)
    start = (page - 1) * page_size
    items = rows[start:start + page_size]
    return {"items": items, "total": total, "page": page, "has_more": start + page_size < total}


def customer_summary(db, cust: Customer) -> dict:
    orders = db.query(Order).filter(Order.customer_id == cust.id).all()
    total_spent = sum(o.total for o in orders if o.status in ("paid", "delivered"))
    due = sum(o.total for o in orders if o.status == "payment_due")
    last_order = max((o.created_at for o in orders), default=None)
    return {
        "id": cust.id, "name": cust.name, "phone": cust.phone, "area": cust.area,
        "tags": cust.tags or [], "notes": cust.notes,
        "orders_count": len(orders), "total_spent": total_spent, "due": due,
        "last_order_at": last_order.isoformat() if last_order else None,
        "window": window_info(db, cust.id),
    }
