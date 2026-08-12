"""Account lifecycle — what has to exist before a new user can use the app."""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models import Shop, Subscription, User
from app.settings import settings


def bootstrap_account(db: Session, user: User) -> Shop:
    """Give a brand-new user an (empty) shop + a trial subscription so the rest
    of the app has something to scope to. Idempotent — safe on every login."""
    shop = db.query(Shop).filter(Shop.owner_user_id == user.id).first()
    if not shop:
        shop = Shop(owner_user_id=user.id, owner_name=user.name, onboarded=False)
        db.add(shop)
        db.flush()
    if not db.query(Subscription).filter(Subscription.shop_id == shop.id).first():
        db.add(Subscription(
            shop_id=shop.id, plan_id=settings.billing.plan_id, status="trialing",
            price_inr=settings.billing.plan_price_inr,
            current_period_end=datetime.now() + timedelta(days=settings.billing.trial_days),
        ))
    db.commit()
    return shop


def public_user(user: User) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name,
            "avatar_url": user.avatar_url, "provider": user.provider}
