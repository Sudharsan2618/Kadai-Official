"""Billing — plan info, checkout, payment verification, webhook, history.

The gateway calls and the subscription arithmetic live in app.services.billing;
this file is the HTTP shape around them."""
import json
from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import current_shop
from app.db.session import get_db
from app.models import Payment, Shop, Subscription
from app.services.billing import (RazorpayError, create_order, display_payment_status,
                                  extend_period, public_subscription, subscription_for,
                                  verify_payment_signature, verify_webhook_signature)
from app.settings import settings

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/plan")
def plan():
    """Public pricing — the billing page renders from this."""
    return settings.billing.plan_public()


@router.get("/status")
def status(shop: Shop = Depends(current_shop), db: Session = Depends(get_db)):
    return {"plan": settings.billing.plan_public(),
            "subscription": public_subscription(subscription_for(shop, db))}


@router.post("/checkout")
def checkout(shop: Shop = Depends(current_shop), db: Session = Depends(get_db)):
    """Create a Razorpay order for one period; frontend opens Checkout with it."""
    amount = settings.billing.plan_price_inr * 100
    try:
        order = create_order(amount, receipt=f"shop{shop.id}-{int(datetime.now().timestamp())}")
    except RazorpayError as e:
        raise HTTPException(status_code=503 if not e.configured else 502, detail=str(e))
    db.add(Payment(shop_id=shop.id, plan_id=settings.billing.plan_id,
                   amount_inr=settings.billing.plan_price_inr,
                   currency=settings.billing.plan_currency, status="created",
                   razorpay_order_id=order["id"]))
    db.commit()
    return {"order_id": order["id"], "amount": amount,
            "currency": settings.billing.plan_currency,
            "razorpay_key_id": settings.billing.razorpay_key_id,
            "plan_name": settings.billing.plan_name}


@router.post("/verify")
def verify(payload: dict = Body(...), shop: Shop = Depends(current_shop),
           db: Session = Depends(get_db)):
    """Called by the browser after Checkout succeeds. Verify the signature,
    mark the payment paid, extend the subscription."""
    order_id = payload.get("razorpay_order_id", "")
    payment_id = payload.get("razorpay_payment_id", "")
    signature = payload.get("razorpay_signature", "")
    if not verify_payment_signature(order_id, payment_id, signature):
        raise HTTPException(status_code=400, detail="Payment could not be verified")

    payment = db.query(Payment).filter(Payment.razorpay_order_id == order_id,
                                       Payment.shop_id == shop.id).first()
    if payment and payment.status == "paid":
        return {"ok": True, "subscription": public_subscription(subscription_for(shop, db))}

    sub = subscription_for(shop, db)
    if not sub:
        sub = Subscription(shop_id=shop.id, plan_id=settings.billing.plan_id,
                           price_inr=settings.billing.plan_price_inr)
        db.add(sub)
    period_start = datetime.now()
    extend_period(sub)
    if payment:
        payment.status = "paid"
        payment.razorpay_payment_id = payment_id
        payment.period_start = period_start
        payment.period_end = sub.current_period_end
    db.commit()
    return {"ok": True, "subscription": public_subscription(sub)}


@router.post("/cancel")
def cancel(payload: dict = Body(default={}), shop: Shop = Depends(current_shop),
           db: Session = Depends(get_db)):
    """Cancel at period end (keep access until the paid time runs out)."""
    sub = subscription_for(shop, db)
    if not sub:
        raise HTTPException(status_code=404, detail="No subscription")
    sub.cancel_at_period_end = True
    sub.updated_at = datetime.now()
    db.commit()
    return {"ok": True, "subscription": public_subscription(sub)}


@router.get("/invoices")
def invoices(page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100),
             only: str = Query("", pattern="^(paid)?$"),
             shop: Shop = Depends(current_shop), db: Session = Depends(get_db)):
    """Paginated payment history + lifetime summary (scales to 100s of rows)."""
    base = db.query(Payment).filter(Payment.shop_id == shop.id)
    if only == "paid":
        base = base.filter(Payment.status == "paid")
    total = base.count()
    rows = (base.order_by(Payment.created_at.desc())
            .offset((page - 1) * page_size).limit(page_size).all())
    paid_count, paid_total = (db.query(func.count(Payment.id),
                                       func.coalesce(func.sum(Payment.amount_inr), 0))
                              .filter(Payment.shop_id == shop.id,
                                      Payment.status == "paid").first())
    return {
        "items": [{
            "id": p.id, "amount_inr": p.amount_inr, "currency": p.currency,
            "status": display_payment_status(p), "razorpay_payment_id": p.razorpay_payment_id,
            "period_start": p.period_start.isoformat() if p.period_start else None,
            "period_end": p.period_end.isoformat() if p.period_end else None,
            "created_at": p.created_at.isoformat(),
        } for p in rows],
        "total": total, "page": page, "has_more": page * page_size < total,
        "paid_count": paid_count or 0, "paid_total_inr": int(paid_total or 0),
    }


@router.post("/webhook")
async def webhook(request: Request, db: Session = Depends(get_db)):
    """Razorpay server-to-server confirmation — the source of truth even if the
    browser closed before /verify ran. Signature is over the raw body."""
    raw = await request.body()
    if not verify_webhook_signature(raw, request.headers.get("x-razorpay-signature", "")):
        raise HTTPException(status_code=400, detail="Bad signature")
    try:
        event = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Bad payload")

    if event.get("event") == "payment.failed":
        entity = event.get("payload", {}).get("payment", {}).get("entity", {})
        payment = db.query(Payment).filter(
            Payment.razorpay_order_id == entity.get("order_id", "")).first()
        if payment and payment.status == "created":
            payment.status = "failed"
            payment.razorpay_payment_id = entity.get("id", "")
            db.commit()

    if event.get("event") in ("payment.captured", "order.paid"):
        entity = (event.get("payload", {}).get("payment", {}).get("entity", {})
                  or event.get("payload", {}).get("order", {}).get("entity", {}))
        order_id = entity.get("order_id") or entity.get("id", "")
        payment = db.query(Payment).filter(Payment.razorpay_order_id == order_id).first()
        if payment and payment.status != "paid":
            sub = db.query(Subscription).filter(Subscription.shop_id == payment.shop_id).first()
            if sub:
                extend_period(sub)
                payment.status = "paid"
                payment.razorpay_payment_id = entity.get("id", "")
                payment.period_start = datetime.now()
                payment.period_end = sub.current_period_end
                db.commit()
    return {"ok": True}
