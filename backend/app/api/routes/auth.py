"""Signup / login / me + Google OAuth.

Email+password works with zero external setup. Google OAuth activates the
moment GOOGLE_CLIENT_ID/SECRET are set — the same JWT comes out either way.
Every new account gets a shop shell + a trialing subscription."""
import json
import urllib.parse
import urllib.request

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import current_user
from app.core.security import create_token, hash_password, verify_password
from app.db.session import get_db
from app.models import Shop, User
from app.services.accounts import bootstrap_account, public_user
from app.settings import settings

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
MIN_PASSWORD_LEN = 6


@router.post("/signup")
def signup(payload: dict = Body(...), db: Session = Depends(get_db)):
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    name = (payload.get("name") or "").strip()
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Enter a valid email")
    if len(password) < MIN_PASSWORD_LEN:
        raise HTTPException(status_code=400,
                            detail=f"Password must be at least {MIN_PASSWORD_LEN} characters")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user = User(email=email, name=name, provider="email",
                password_hash=hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)
    bootstrap_account(db, user)
    return {"token": create_token(user.id), "user": public_user(user)}


@router.post("/login")
def login(payload: dict = Body(...), db: Session = Depends(get_db)):
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.password_hash or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Wrong email or password")
    bootstrap_account(db, user)
    return {"token": create_token(user.id), "user": public_user(user)}


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    shop = db.query(Shop).filter(Shop.owner_user_id == user.id).first()
    return {"user": public_user(user),
            "onboarded": bool(shop and shop.onboarded),
            "has_shop": shop is not None}


# ── Google OAuth ────────────────────────────────────────────────────────────
@router.get("/google/login")
def google_login():
    if not settings.auth.google_client_id:
        raise HTTPException(status_code=503, detail="Google sign-in isn't configured")
    params = urllib.parse.urlencode({
        "client_id": settings.auth.google_client_id,
        "redirect_uri": settings.auth.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    })
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{params}")


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
        return RedirectResponse(f"{settings.app.frontend_url}/login?error=google")
    try:
        tokens = _http_post(GOOGLE_TOKEN_URL, {
            "code": code,
            "client_id": settings.auth.google_client_id,
            "client_secret": settings.auth.google_client_secret,
            "redirect_uri": settings.auth.google_redirect_uri,
            "grant_type": "authorization_code",
        })
        info = _http_get(GOOGLE_USERINFO_URL, tokens["access_token"])
    except Exception:
        return RedirectResponse(f"{settings.app.frontend_url}/login?error=google")

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
    bootstrap_account(db, user)
    return RedirectResponse(
        f"{settings.app.frontend_url}/auth/callback#token={create_token(user.id)}")
