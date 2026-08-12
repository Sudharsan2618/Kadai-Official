"""Seller-facing WhatsApp management: connect config, templates, registration.

Separate from the Meta webhook route (which is Meta-facing and unauthenticated-
but-signed); everything here rides the normal JWT → current_shop chain."""
from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import cloud_mode_only, current_shop
from app.db.session import get_db
from app.models import ReadyMessage, Shop, Template
from app.services.wa.errors import WaError
from app.settings import settings

router = APIRouter(tags=["whatsapp"])

TEMPLATE_CATEGORIES = ("MARKETING", "UTILITY", "AUTHENTICATION")


@router.get("/wa/config")
def wa_config(shop: Shop = Depends(current_shop)):
    """Everything Settings needs to render the connect card + template UI."""
    token_expired = bool(shop.wa_token_expiry and shop.wa_token_expiry < datetime.now())
    return {
        **settings.wa.public(),
        "connected": shop.wa_connected,
        "number": shop.wa_number,
        "verified": shop.wa_verified,
        "waba_id": shop.waba_id,
        "token_expired": token_expired,
        "mm_terms_status": shop.wa_mm_terms_status,
        "mm_terms_signed_at": shop.wa_mm_terms_signed_at.isoformat() if shop.wa_mm_terms_signed_at else None,
    }


@router.get("/wa/mm-status")
def mm_status(db: Session = Depends(get_db), shop: Shop = Depends(current_shop),
              cloud=Depends(cloud_mode_only)):
    """Refresh the seller's MM API eligibility and ToS status from Meta."""
    try:
        return cloud.get_mm_status(db, shop)
    except WaError as e:
        raise HTTPException(502, str(e))


@router.post("/wa/mm-test")
def mm_test(payload: dict = Body(default={}),
            db: Session = Depends(get_db), shop: Shop = Depends(current_shop),
            cloud=Depends(cloud_mode_only)):
    """Send one approved marketing template through MM API for verification."""
    customer_id = payload.get("customer_id")
    ready_label = (payload.get("ready_label") or "").strip()
    if not customer_id or not ready_label:
        raise HTTPException(400, "customer_id and ready_label are required")
    try:
        status = cloud.get_mm_status(db, shop)
        if not status["signed"]:
            raise HTTPException(409, f"MM API terms are not accepted (status: {status['status']})")
        msg = cloud.send_message(db, int(customer_id), "", kind="broadcast",
                                 ready_label=ready_label)
        return {"id": msg.id, "status": msg.status, "wamid": msg.wamid}
    except HTTPException:
        raise
    except WaError as e:
        raise HTTPException(502, str(e))


@router.post("/wa/register")
def register(payload: dict = Body(default={}),
             db: Session = Depends(get_db), shop: Shop = Depends(current_shop),
             cloud=Depends(cloud_mode_only)):
    """Retry number registration (2FA PIN) if it failed during signup."""
    try:
        pin = cloud.register_number(db, shop, payload.get("pin"))
    except WaError as e:
        raise HTTPException(502, str(e))
    return {"verified": True, "pin": pin}


@router.get("/templates")
def templates(db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    rows = db.query(Template).filter(Template.shop_id == shop.id).all()
    return [{
        "id": t.id, "ready_message_id": t.ready_message_id, "name": t.name,
        "language": t.language, "category": t.category, "status": t.status,
        "rejected_reason": t.rejected_reason,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    } for t in rows]


@router.post("/ready-messages/{rm_id}/submit-template")
def submit_template(rm_id: int, payload: dict = Body(default={}),
                    db: Session = Depends(get_db), shop: Shop = Depends(current_shop),
                    cloud=Depends(cloud_mode_only)):
    """Submit a ready message to Meta for template approval (minutes–hours)."""
    rm = db.get(ReadyMessage, rm_id)
    if not rm or rm.shop_id != shop.id:
        raise HTTPException(404, "Ready message not found")
    category = payload.get("category", "MARKETING")
    if category not in TEMPLATE_CATEGORIES:
        raise HTTPException(400, "Bad category")
    try:
        tpl = cloud.submit_template(db, shop, rm, category=category,
                                    language=payload.get("language", "en"))
    except WaError as e:
        raise HTTPException(502, str(e))
    return {"id": tpl.id, "name": tpl.name, "status": tpl.status}


@router.post("/templates/sync")
def sync_templates(db: Session = Depends(get_db), shop: Shop = Depends(current_shop),
                   cloud=Depends(cloud_mode_only)):
    try:
        updated = cloud.sync_template_status(db, shop)
    except WaError as e:
        raise HTTPException(502, str(e))
    return {"updated": updated}
