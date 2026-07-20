"""Shop, onboarding, Today dashboard, SSE events."""
from datetime import datetime
from fastapi import APIRouter, Depends, Request, Body, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from db import get_db
from deps import current_shop
from models import Shop, Order, Customer, Product, Broadcast, BroadcastRecipient
from domain import conversation_rows
from events import sse_stream

router = APIRouter()


@router.get("/shop")
def get_shop(shop: Shop = Depends(current_shop)):
    return {c.name: getattr(shop, c.name) for c in Shop.__table__.columns}


@router.patch("/shop")
def update_shop(payload: dict = Body(...), shop: Shop = Depends(current_shop),
                db: Session = Depends(get_db)):
    for key in ("name", "owner_name", "phone", "business_type", "language", "onboarded"):
        if key in payload:
            setattr(shop, key, payload[key])
    db.commit()
    return {"ok": True}


@router.post("/onboarding/connect")
def onboarding_connect(payload: dict = Body(default={}), shop: Shop = Depends(current_shop),
                       db: Session = Depends(get_db)):
    """Connect the seller's WhatsApp number.

    cloud → real Meta Embedded Signup: the frontend popup returns a short-lived
    `code`; exchange it, discover WABA + phone_number_id, subscribe, register.
    mock  → just marks the number connected so the demo flow works end-to-end."""
    import config
    if config.WA_MODE == "cloud":
        import wa_cloud
        code = (payload.get("code") or "").strip()
        if not code:
            raise HTTPException(400, "Missing Meta authorization code — finish the WhatsApp popup")
        try:
            return wa_cloud.connect_embedded_signup(db, shop, code)
        except wa_cloud.WaError as e:
            raise HTTPException(502, str(e))
    shop.wa_connected = True
    shop.wa_number = payload.get("phone", shop.phone or "9843000001")
    db.commit()
    return {"connected": True, "wa_number": shop.wa_number}


@router.get("/today")
def today(db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    todays_orders = (db.query(Order)
                     .filter(Order.shop_id == shop.id, Order.created_at >= start)
                     .order_by(Order.created_at.desc()).all())
    sales_today = sum(o.total for o in todays_orders if o.status in ("paid", "delivered"))
    convos = conversation_rows(db, shop.id)["items"]
    needs_reply = [c for c in convos if c["needs_reply"]]

    last_b = (db.query(Broadcast).filter(Broadcast.shop_id == shop.id)
              .order_by(Broadcast.created_at.desc()).first())
    last_broadcast = None
    reached_today = 0
    if last_b:
        recs = db.query(BroadcastRecipient).filter_by(broadcast_id=last_b.id).all()
        if last_b.created_at >= start:
            reached_today = len(recs)
        last_broadcast = {
            "id": last_b.id, "title": last_b.title, "status": last_b.status,
            "created_at": last_b.created_at.isoformat(),
            "recipients": len(recs),
            "delivered": sum(1 for r in recs if r.status in ("delivered", "read", "replied")),
            "read": sum(1 for r in recs if r.status in ("read", "replied")),
            "replied": sum(1 for r in recs if r.status == "replied"),
            "failed": sum(1 for r in recs if r.status == "failed"),
        }

    # counts for the first-run getting-started checklist
    customers_count = db.query(Customer).filter(Customer.shop_id == shop.id).count()
    products_count = db.query(Product).filter(Product.shop_id == shop.id).count()
    broadcasts_count = db.query(Broadcast).filter(Broadcast.shop_id == shop.id).count()

    return {
        "sales_today": sales_today,
        "orders_today": len(todays_orders),
        "to_reply": len(needs_reply),
        "reached_today": reached_today,
        "needs_reply": needs_reply[:6],
        "orders": [{
            "id": o.id, "customer": o.customer.name if o.customer else "",
            "items": o.items, "total": o.total, "status": o.status,
            "created_at": o.created_at.isoformat(),
        } for o in todays_orders[:8]],
        "last_broadcast": last_broadcast,
        "counts": {
            "customers": customers_count,
            "products": products_count,
            "broadcasts": broadcasts_count,
        },
    }


@router.get("/events")
async def events(request: Request):
    return StreamingResponse(sse_stream(request), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
