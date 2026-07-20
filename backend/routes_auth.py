"""Signup / login / me / logout + Google OAuth.

Email+password works with zero external setup. Google OAuth activates the
moment GOOGLE_CLIENT_ID/SECRET are set in .env — same JWT comes out either
way. Every new account gets a shop shell + a trialing subscription."""
import json
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Body, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from db import get_db
from models import User, Shop, Subscription
from auth import hash_password, verify_password, create_token
from deps import current_user
import config

router = APIRouter(prefix="/auth", tags=["auth"])


def _bootstrap_account(db: Session, user: User) -> None:
    """Give a brand-new user an (empty) shop + a trial subscription so the
    rest of the app has something to scope to."""
    shop = db.query(Shop).filter(Shop.owner_user_id == user.id).first()
    if not shop:
        shop = Shop(owner_user_id=user.id, owner_name=user.name, onboarded=False)
        db.add(shop)
        db.flush()
    if not db.query(Subscription).filter(Subscription.shop_id == shop.id).first():
        db.add(Subscription(
            shop_id=shop.id, plan_id=config.PLAN_ID, status="trialing",
            price_inr=config.PLAN_PRICE_INR,
            current_period_end=datetime.now() + timedelta(days=config.TRIAL_DAYS),
        ))
    db.commit()


def _public_user(user: User) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name,
            "avatar_url": user.avatar_url, "provider": user.provider}


@router.post("/signup")
def signup(payload: dict = Body(...), db: Session = Depends(get_db)):
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    name = (payload.get("name") or "").strip()
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Enter a valid email")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user = User(email=email, name=name, provider="email",
                password_hash=hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)
    _bootstrap_account(db, user)
    return {"token": create_token(user.id), "user": _public_user(user)}


@router.post("/login")
def login(payload: dict = Body(...), db: Session = Depends(get_db)):
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.password_hash or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Wrong email or password")
    _bootstrap_account(db, user)
    return {"token": create_token(user.id), "user": _public_user(user)}


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    shop = db.query(Shop).filter(Shop.owner_user_id == user.id).first()
    return {"user": _public_user(user),
            "onboarded": bool(shop and shop.onboarded),
            "has_shop": shop is not None}


# ── Google OAuth ────────────────────────────────────────────────────────────
@router.get("/google/login")
def google_login():
    if not config.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google sign-in isn't configured")
    params = urllib.parse.urlencode({
        "client_id": config.GOOGLE_CLIENT_ID,
        "redirect_uri": config.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    })
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


def _http_post(url: str, data: dict) -> dict:
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def _http_get(url: str, token: str) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


@router.get("/google/callback")
def google_callback(code: str = "", db: Session = Depends(get_db)):
    if not code:
        return RedirectResponse(f"{config.FRONTEND_URL}/login?error=google")
    try:
        tokens = _http_post("https://oauth2.googleapis.com/token", {
            "code": code,
            "client_id": config.GOOGLE_CLIENT_ID,
            "client_secret": config.GOOGLE_CLIENT_SECRET,
            "redirect_uri": config.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        })
        info = _http_get("https://openidconnect.googleapis.com/v1/userinfo",
                         tokens["access_token"])
    except Exception:
        return RedirectResponse(f"{config.FRONTEND_URL}/login?error=google")

    sub = info.get("sub", "")
    email = (info.get("email") or "").lower()
    user = (db.query(User).filter(User.provider == "google", User.provider_sub == sub).first()
            or (db.query(User).filter(User.email == email).first() if email else None))
    if not user:
        user = User(email=email, name=info.get("name", ""),
                    avatar_url=info.get("picture", ""), provider="google", provider_sub=sub)
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        user.provider, user.provider_sub = "google", sub
        if info.get("picture"):
            user.avatar_url = info["picture"]
        db.commit()
    _bootstrap_account(db, user)
    return RedirectResponse(f"{config.FRONTEND_URL}/auth/callback#token={create_token(user.id)}")
