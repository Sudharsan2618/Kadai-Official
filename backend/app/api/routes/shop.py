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

    baileys → start the gateway link (QR / pairing code); the socket completes
    the link when the seller scans, and /wa/link/status reports when it is up.
    mock    → just marks the number connected so the demo flow works end-to-end."""
    if settings.wa.is_baileys:
        from app.services.wa import baileys
        phone = "".join(c for c in str(payload.get("phone") or "") if c.isdigit())
        try:
            baileys.start_link(db, shop, phone)
        except WaError as e:
            raise HTTPException(502, str(e))
        return {"linking": True}

    # Mock mode: stand in for what linking would have produced so the demo's
    # onboarding step list reports a finished setup.
    shop.wa_connected = True
    shop.wa_number = payload.get("phone", shop.phone or "9843000001")
    shop.wa_display_number = shop.wa_number
    shop.wa_link_status = "linked"
    db.commit()
    return {"connected": True, "wa_number": shop.wa_number}
