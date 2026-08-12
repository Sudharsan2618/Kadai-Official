"""The shop profile and WhatsApp onboarding."""
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import current_shop
from app.db.session import get_db
from app.models import Shop
from app.services.wa.errors import WaError
from app.settings import settings

router = APIRouter(tags=["shop"])

EDITABLE_FIELDS = ("name", "owner_name", "phone", "business_type", "language", "onboarded")


@router.get("/shop")
def get_shop(shop: Shop = Depends(current_shop)):
    return {c.name: getattr(shop, c.name) for c in Shop.__table__.columns}


@router.patch("/shop")
def update_shop(payload: dict = Body(...), shop: Shop = Depends(current_shop),
                db: Session = Depends(get_db)):
    for key in EDITABLE_FIELDS:
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
    `path` ("fresh" | "coexist") comes from the connect screen — coexist means
    the seller kept their WhatsApp Business app number (K-02).
    mock  → just marks the number connected so the demo flow works end-to-end."""
    if settings.wa.is_cloud:
        from app.services.wa import cloud
        code = (payload.get("code") or "").strip()
        if not code:
            raise HTTPException(400, "Missing Meta authorization code — finish the WhatsApp popup")
        try:
            return cloud.connect_embedded_signup(
                db, shop, code,
                waba_id_hint=(payload.get("waba_id") or "").strip(),
                phone_number_id_hint=(payload.get("phone_number_id") or "").strip(),
                path=(payload.get("path") or "fresh"),
            )
        except WaError as e:
            raise HTTPException(502, str(e))

    shop.wa_connected = True
    shop.wa_number = payload.get("phone", shop.phone or "9843000001")
    db.commit()
    return {"connected": True, "wa_number": shop.wa_number}
