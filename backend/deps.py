"""Request-scoped dependencies — THE auth seam.

Every route depends on current_shop; it now resolves from the JWT user instead
of grabbing the first row, so the whole app is multi-tenant with no route
changes. current_user decodes the bearer token; current_shop returns that
user's shop. subscription gating hangs off the same chain."""
from datetime import datetime
from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session
from db import get_db
from models import User, Shop, Subscription
from auth import decode_token


def current_user(authorization: str = Header(default=""),
                 db: Session = Depends(get_db)) -> User:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not signed in")
    payload = decode_token(authorization[7:].strip())
    if not payload:
        raise HTTPException(status_code=401, detail="Session expired — sign in again")
    user = db.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(status_code=401, detail="Account not found")
    return user


def current_shop(user: User = Depends(current_user),
                 db: Session = Depends(get_db)) -> Shop:
    shop = db.query(Shop).filter(Shop.owner_user_id == user.id).first()
    if not shop:
        raise HTTPException(status_code=409, detail="Shop not set up yet — complete onboarding first")
    return shop


def subscription_for(shop: Shop, db: Session) -> Subscription | None:
    return db.query(Subscription).filter(Subscription.shop_id == shop.id).first()


def has_access(sub: Subscription | None) -> bool:
    """Trialing or active with time left on the clock."""
    if not sub or sub.status == "cancelled":
        return False
    if sub.status in ("trialing", "active"):
        return sub.current_period_end is None or sub.current_period_end > datetime.now()
    return False


def active_shop(shop: Shop = Depends(current_shop),
                db: Session = Depends(get_db)) -> Shop:
    """Same as current_shop but 402s when the subscription has lapsed. Attach
    this to routes that should be blocked once billing runs out."""
    if not has_access(subscription_for(shop, db)):
        raise HTTPException(status_code=402, detail="Your plan has ended — please renew to continue")
    return shop
