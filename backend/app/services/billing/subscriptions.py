"""Subscription state — access gating and period arithmetic.

`has_access` is what stands between a lapsed shop and the rest of the app; the
active_shop dependency is its only enforcement point."""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models import Payment, Shop, Subscription
from app.settings import settings

# An open checkout older than this means the seller closed the Razorpay popup.
ABANDONED_AFTER = timedelta(hours=1)


def subscription_for(shop: Shop, db: Session) -> Subscription | None:
    return db.query(Subscription).filter(Subscription.shop_id == shop.id).first()


def has_access(sub: Subscription | None) -> bool:
    """Trialing or active with time left on the clock."""
    if not sub or sub.status == "cancelled":
        return False
    if sub.status in ("trialing", "active"):
        return sub.current_period_end is None or sub.current_period_end > datetime.now()
    return False


def extend_period(sub: Subscription) -> None:
    """Roll the subscription forward one period from whichever is later: now,
    or the current end (so early renewals stack)."""
    end = sub.current_period_end
    base = end if (end and end > datetime.now()) else datetime.now()
    sub.current_period_end = base + timedelta(days=settings.billing.plan_period_days)
    sub.status = "active"
    sub.updated_at = datetime.now()


def public_subscription(sub: Subscription | None) -> dict:
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


def display_payment_status(p: Payment) -> str:
    """'created' is an open checkout. Once it's been open past ABANDONED_AFTER
    the user closed the popup — surface that instead of leaving a forever-
    'created' row that looks like a stuck payment."""
    if p.status == "created" and p.created_at < datetime.now() - ABANDONED_AFTER:
        return "abandoned"
    return p.status
