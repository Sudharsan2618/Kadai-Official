"""Seller-facing WhatsApp management: connect config, templates, registration.

Separate from routes_webhook (which is Meta-facing and unauthenticated-but-
signed); everything here rides the normal JWT → current_shop chain."""
from fastapi import APIRouter, Depends, Body, HTTPException
from sqlalchemy.orm import Session

import config
from db import get_db
from deps import current_shop
from models import Shop, ReadyMessage, Template

router = APIRouter(tags=["whatsapp"])


def _cloud_only():
    if config.WA_MODE != "cloud":
        raise HTTPException(status_code=409, detail="Templates need cloud mode (real WhatsApp)")
    import wa_cloud
    return wa_cloud


@router.get("/wa/config")
def wa_config(shop: Shop = Depends(current_shop)):
    """Everything Settings needs to render the connect card + template UI."""
    from datetime import datetime
    token_expired = bool(shop.wa_token_expiry and shop.wa_token_expiry < datetime.now())
    return {
        **config.wa_public(),
        "connected": shop.wa_connected,
        "number": shop.wa_number,
        "verified": shop.wa_verified,
        "waba_id": shop.waba_id,
        "token_expired": token_expired,
    }


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
                    db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    """Submit a ready message to Meta for template approval (minutes–hours)."""
    wa_cloud = _cloud_only()
    rm = db.get(ReadyMessage, rm_id)
    if not rm or rm.shop_id != shop.id:
        raise HTTPException(404, "Ready message not found")
    category = payload.get("category", "MARKETING")
    if category not in ("MARKETING", "UTILITY", "AUTHENTICATION"):
        raise HTTPException(400, "Bad category")
    try:
        tpl = wa_cloud.submit_template(db, shop, rm, category=category,
                                       language=payload.get("language", "en"))
    except wa_cloud.WaError as e:
        raise HTTPException(502, str(e))
    return {"id": tpl.id, "name": tpl.name, "status": tpl.status}


@router.post("/templates/sync")
def sync_templates(db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    wa_cloud = _cloud_only()
    try:
        updated = wa_cloud.sync_template_status(db, shop)
    except wa_cloud.WaError as e:
        raise HTTPException(502, str(e))
    return {"updated": updated}


@router.post("/wa/register")
def register(payload: dict = Body(default={}),
             db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    """Retry number registration (2FA PIN) if it failed during signup."""
    wa_cloud = _cloud_only()
    try:
        pin = wa_cloud.register_number(db, shop, payload.get("pin"))
    except wa_cloud.WaError as e:
        raise HTTPException(502, str(e))
    return {"verified": True, "pin": pin}
