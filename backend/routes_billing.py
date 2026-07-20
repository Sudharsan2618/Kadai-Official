"""Billing — plan info, checkout, payment verification, webhook, history.

Razorpay is called over plain HTTPS (stdlib urllib) with Basic auth; payment
signatures are verified with HMAC-SHA256 — no SDK, nothing to install. A
successful payment extends the shop's subscription by one period. INR 1500/mo
by default, fully configurable via config.PLAN_* / .env."""
import base64
import hashlib
import hmac
import json
import urllib.request
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Body, Request, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from db import get_db
from models import Shop, Subscription, Payment
from deps import current_shop, subscription_for, has_access
import config

router = APIRouter(prefix="/billing", tags=["billing"])


# ── Razorpay helpers ────────────────────────────────────────────────────────
def _rzp_order(amount_paise: int, receipt: str) -> dict:
    if not config.RAZORPAY_KEY_ID or not config.RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=503, detail="Billing isn't configured yet")
    creds = f"{config.RAZORPAY_KEY_ID}:{config.RAZORPAY_KEY_SECRET}".encode()
    auth = base64.b64encode(creds).decode()
    body = json.dumps({
        "amount": amount_paise, "currency": config.PLAN_CURRENCY,
        "receipt": receipt, "payment_capture": 1,
    }).encode()
    req = urllib.request.Request(
        "https://api.razorpay.com/v1/orders", data=body, method="POST",
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Razorpay error: {e.read().decode()[:200]}")
    except Exception:
        raise HTTPException(status_code=502, detail="Couldn't reach the payment gateway")


def _verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    expected = hmac.new(config.RAZORPAY_KEY_SECRET.encode(),
                        f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _sub_public(sub: Subscription | None) -> dict:
    if not sub:
        return {"status": "none", "active": False}
    end = sub.current_period_end
    days_left = max(0, (end - datetime.now()).days) if end else None
    return {
        "status": sub.status,
        "active": has_access(sub),
        "plan_id": sub.plan_id,
        "price_inr": sub.price_inr,
        "current_period_end": end.isoformat() if end else None,
        "days_left": days_left,
        "cancel_at_period_end": sub.cancel_at_period_end,
    }


def _extend(sub: Subscription) -> None:
    """Roll the subscription forward one period from whichever is later:
    now, or the current end (so early renewals stack)."""
    base = sub.current_period_end if (sub.current_period_end and sub.current_period_end > datetime.now()) else datetime.now()
    sub.current_period_end = base + timedelta(days=config.PLAN_PERIOD_DAYS)
    sub.status = "active"
    sub.updated_at = datetime.now()


# ── Routes ──────────────────────────────────────────────────────────────────
@router.get("/plan")
def plan():
    """Public pricing — the billing page renders from this."""
    return config.plan_public()


@router.get("/status")
def status(shop: Shop = Depends(current_shop), db: Session = Depends(get_db)):
    return {"plan": config.plan_public(), "subscription": _sub_public(subscription_for(shop, db))}


@router.post("/checkout")
def checkout(shop: Shop = Depends(current_shop), db: Session = Depends(get_db)):
    """Create a Razorpay order for one period; frontend opens Checkout with it."""
    amount = config.PLAN_PRICE_INR * 100
    order = _rzp_order(amount, receipt=f"shop{shop.id}-{int(datetime.now().timestamp())}")
    db.add(Payment(shop_id=shop.id, plan_id=config.PLAN_ID, amount_inr=config.PLAN_PRICE_INR,
                   currency=config.PLAN_CURRENCY, status="created",
                   razorpay_order_id=order["id"]))
    db.commit()
    return {"order_id": order["id"], "amount": amount, "currency": config.PLAN_CURRENCY,
            "razorpay_key_id": config.RAZORPAY_KEY_ID, "plan_name": config.PLAN_NAME}


@router.post("/verify")
def verify(payload: dict = Body(...), shop: Shop = Depends(current_shop),
           db: Session = Depends(get_db)):
    """Called by the browser after Checkout succeeds. Verify the signature,
    mark the payment paid, extend the subscription."""
    order_id = payload.get("razorpay_order_id", "")
    payment_id = payload.get("razorpay_payment_id", "")
    signature = payload.get("razorpay_signature", "")
    if not _verify_signature(order_id, payment_id, signature):
        raise HTTPException(status_code=400, detail="Payment could not be verified")

    payment = db.query(Payment).filter(Payment.razorpay_order_id == order_id,
                                       Payment.shop_id == shop.id).first()
    if payment and payment.status == "paid":
        return {"ok": True, "subscription": _sub_public(subscription_for(shop, db))}

    sub = subscription_for(shop, db)
    if not sub:
        sub = Subscription(shop_id=shop.id, plan_id=config.PLAN_ID, price_inr=config.PLAN_PRICE_INR)
        db.add(sub)
    period_start = datetime.now()
    _extend(sub)
    if payment:
        payment.status = "paid"
        payment.razorpay_payment_id = payment_id
        payment.period_start = period_start
        payment.period_end = sub.current_period_end
    db.commit()
    return {"ok": True, "subscription": _sub_public(sub)}


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
    return {"ok": True, "subscription": _sub_public(sub)}


def _display_status(p: Payment) -> str:
    """'created' is an open checkout. If it's been open for over an hour the
    user closed the Razorpay popup — surface that as 'abandoned' instead of
    leaving a forever-'created' row that looks like a stuck payment."""
    if p.status == "created" and p.created_at < datetime.now() - timedelta(hours=1):
        return "abandoned"
    return p.status


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
    paid_count, paid_total = (db.query(func.count(Payment.id), func.coalesce(func.sum(Payment.amount_inr), 0))
                              .filter(Payment.shop_id == shop.id, Payment.status == "paid").first())
    return {
        "items": [{
            "id": p.id, "amount_inr": p.amount_inr, "currency": p.currency,
            "status": _display_status(p), "razorpay_payment_id": p.razorpay_payment_id,
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
    signature = request.headers.get("x-razorpay-signature", "")
    if config.RAZORPAY_WEBHOOK_SECRET:
        expected = hmac.new(config.RAZORPAY_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(status_code=400, detail="Bad signature")
    try:
        event = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Bad payload")

    if event.get("event") == "payment.failed":
        entity = event.get("payload", {}).get("payment", {}).get("entity", {})
        payment = db.query(Payment).filter(Payment.razorpay_order_id == entity.get("order_id", "")).first()
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
                _extend(sub)
                payment.status = "paid"
                payment.razorpay_payment_id = entity.get("id", "")
                payment.period_start = datetime.now()
                payment.period_end = sub.current_period_end
                db.commit()
    return {"ok": True}
