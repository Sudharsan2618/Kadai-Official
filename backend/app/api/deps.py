"""Request-scoped dependencies — THE auth seam.

Every route depends on current_shop; it resolves from the JWT user, so the
whole app is multi-tenant with no route changes. current_user decodes the
bearer token; current_shop returns that user's shop; active_shop adds the
subscription gate on top."""
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models import Customer, Shop, User
from app.services.billing import has_access, subscription_for
from app.settings import settings


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


def active_shop(shop: Shop = Depends(current_shop),
                db: Session = Depends(get_db)) -> Shop:
    """Same as current_shop but 402s when the subscription has lapsed. Attach
    this to routes that should be blocked once billing runs out."""
    if not has_access(subscription_for(shop, db)):
        raise HTTPException(status_code=402, detail="Your plan has ended — please renew to continue")
    return shop


def owned_customer(db: Session, shop: Shop, customer_id: int | None) -> Customer:
    """Tenant check for any customer id that arrives from the client."""
    cust = db.get(Customer, customer_id) if customer_id else None
    if not cust or cust.shop_id != shop.id:
        raise HTTPException(404, "Customer not found")
    return cust


def cloud_mode_only():
    """Guard for routes that only mean something against the real Meta API."""
    if not settings.wa.is_cloud:
        raise HTTPException(status_code=409, detail="Templates need cloud mode (real WhatsApp)")
    from app.services.wa import cloud
    return cloud
