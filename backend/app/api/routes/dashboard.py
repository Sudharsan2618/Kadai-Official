"""The Today screen + the live event stream that keeps it fresh."""
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import current_shop
from app.core.events import sse_stream
from app.db.session import get_db
from app.models import Broadcast, BroadcastRecipient, Customer, Order, Product, Shop
from app.services.read_models import conversation_rows

router = APIRouter(tags=["dashboard"])

NEEDS_REPLY_PREVIEW = 6
RECENT_ORDERS_PREVIEW = 8


def _last_broadcast_summary(db: Session, shop_id: int, day_start: datetime) -> tuple[dict | None, int]:
    last_b = (db.query(Broadcast).filter(Broadcast.shop_id == shop_id)
              .order_by(Broadcast.created_at.desc()).first())
    if not last_b:
        return None, 0
    recs = db.query(BroadcastRecipient).filter_by(broadcast_id=last_b.id).all()
    reached_today = len(recs) if last_b.created_at >= day_start else 0
    return {
        "id": last_b.id, "title": last_b.title, "status": last_b.status,
        "created_at": last_b.created_at.isoformat(),
        "recipients": len(recs),
        "delivered": sum(1 for r in recs if r.status in ("delivered", "read", "replied")),
        "read": sum(1 for r in recs if r.status in ("read", "replied")),
        "replied": sum(1 for r in recs if r.status == "replied"),
        "failed": sum(1 for r in recs if r.status == "failed"),
    }, reached_today


@router.get("/today")
def today(db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    todays_orders = (db.query(Order)
                     .filter(Order.shop_id == shop.id, Order.created_at >= start)
                     .order_by(Order.created_at.desc()).all())
    sales_today = sum(o.total for o in todays_orders if o.status in ("paid", "delivered"))
    convos = conversation_rows(db, shop.id)["items"]
    needs_reply = [c for c in convos if c["needs_reply"]]
    last_broadcast, reached_today = _last_broadcast_summary(db, shop.id, start)

    return {
        "sales_today": sales_today,
        "orders_today": len(todays_orders),
        "to_reply": len(needs_reply),
        "reached_today": reached_today,
        "needs_reply": needs_reply[:NEEDS_REPLY_PREVIEW],
        "orders": [{
            "id": o.id, "customer": o.customer.name if o.customer else "",
            "items": o.items, "total": o.total, "status": o.status,
            "created_at": o.created_at.isoformat(),
        } for o in todays_orders[:RECENT_ORDERS_PREVIEW]],
        "last_broadcast": last_broadcast,
        # counts for the first-run getting-started checklist
        "counts": {
            "customers": db.query(Customer).filter(Customer.shop_id == shop.id).count(),
            "products": db.query(Product).filter(Product.shop_id == shop.id).count(),
            "broadcasts": db.query(Broadcast).filter(Broadcast.shop_id == shop.id).count(),
        },
    }


@router.get("/events")
async def events(request: Request):
    return StreamingResponse(sse_stream(request), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
