"""Seller-facing WhatsApp management (Baileys).

The seller links their WhatsApp number by scanning a QR (or entering a pairing
code) — no Meta, no templates, no 24-hour window, no billing. This route drives
that link lifecycle through the gateway; everything rides the normal
JWT → current_shop chain.

The inbound-message + link-status callbacks from the gateway are Meta-facing's
replacement and live in baileys_webhook.py (shared-secret, no JWT)."""
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import baileys_mode_only, current_shop
from app.db.session import get_db
from app.models import Shop
from app.services import wa
from app.services.wa.errors import WaBlocked, WaError
from app.settings import settings

router = APIRouter(tags=["whatsapp"])


@router.get("/wa/config")
def wa_config(shop: Shop = Depends(current_shop)):
    """Everything Settings needs to render the connect card."""
    return {
        **settings.wa.public(),
        "connected": shop.wa_connected,
        "number": shop.wa_number,
        "link_status": shop.wa_link_status,
    }


@router.get("/wa/onboarding-status")
def onboarding_status(shop: Shop = Depends(current_shop)):
    """The real state of this seller's WhatsApp setup.

    The connect screen renders straight from this. Linking is a single step —
    scan the QR — so there are no Meta blockers to report."""
    steps = [
        {"key": "link", "done": bool(shop.wa_connected)},
    ]
    return {
        "connected": shop.wa_connected,
        "number": shop.wa_number,
        "display_number": shop.wa_display_number or shop.wa_number,
        "link_status": shop.wa_link_status,
        "steps": steps,
        "blockers": [],
        "can_send": bool(shop.wa_connected),
    }


@router.post("/wa/link/start")
def link_start(payload: dict = Body(default={}),
               db: Session = Depends(get_db), shop: Shop = Depends(current_shop),
               baileys=Depends(baileys_mode_only)):
    """Begin linking. With a phone the gateway returns a pairing code; without
    one, a QR. Either is then polled via /wa/link/status."""
    phone = "".join(c for c in str(payload.get("phone") or "") if c.isdigit())
    try:
        baileys.start_link(db, shop, phone)
    except WaError as e:
        raise HTTPException(502, str(e))
    return {"linking": True}


@router.get("/wa/link/status")
def link_status(db: Session = Depends(get_db), shop: Shop = Depends(current_shop),
                baileys=Depends(baileys_mode_only)):
    """QR / pairing code and current link state, proxied from the gateway."""
    try:
        return baileys.get_status(db, shop)
    except WaError as e:
        raise HTTPException(502, str(e))


@router.post("/wa/disconnect")
def wa_disconnect(db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    """Detach the WhatsApp number. Keeps customers, chats and orders."""
    if not shop.wa_connected and not shop.wa_link_status:
        raise HTTPException(409, "No WhatsApp number is connected")
    if settings.wa.is_baileys:
        from app.services.wa import baileys
        try:
            return baileys.disconnect(db, shop)
        except WaError as e:
            raise HTTPException(502, str(e))
    # Mock mode: just clear the flags.
    shop.wa_connected = False
    shop.wa_number = shop.wa_display_number = ""
    shop.wa_link_status = "logged_out"
    db.commit()
    return {"disconnected": True}


@router.post("/wa/test-message")
def test_message(payload: dict = Body(default={}),
                 db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    """Send one real message to a phone the seller is holding — the proof-of-life
    step of onboarding. Works in both modes so the demo can finish it too."""
    phone = (payload.get("phone") or shop.phone or "").strip()
    try:
        result = wa.send_test_message(db, shop, phone)
    except WaBlocked as e:
        raise HTTPException(400, str(e))
    except WaError as e:
        raise HTTPException(502, str(e))
    return result
