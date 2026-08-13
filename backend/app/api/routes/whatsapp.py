"""Seller-facing WhatsApp management: connect config, templates, registration.

Separate from the Meta webhook route (which is Meta-facing and unauthenticated-
but-signed); everything here rides the normal JWT → current_shop chain."""
from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import cloud_mode_only, current_shop
from app.db.session import get_db
from app.models import ReadyMessage, Shop, Template
from app.services import wa
from app.services.wa.errors import PAYMENT_ISSUE_CODE, WaBlocked, WaError
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


def _blockers(shop: Shop, token_expired: bool) -> list[dict]:
    """Everything standing between this seller and a delivered message.

    Only genuinely-blocking, genuinely-known problems belong here. The screen
    renders this list verbatim, so a false entry becomes a false instruction —
    when we don't know, we say nothing."""
    out: list[dict] = []
    if token_expired:
        out.append({
            "key": "token_expired", "severity": "blocking",
            "title": "Reconnect your WhatsApp",
            "detail": "Meta's permission for Kadai expired. Reconnecting takes a minute "
                      "and keeps your number, chats and contacts.",
            "action": "reconnect",
        })
    if not shop.wa_verified and not shop.wa_is_on_biz_app:
        out.append({
            "key": "not_registered", "severity": "blocking",
            "title": "Finish registering your number",
            "detail": "Your number reached Kadai but Meta hasn't finished registering it "
                      "for sending.",
            "action": "register",
        })
    # A 555 test number cannot send until its display name clears review (131037).
    if shop.wa_name_status and shop.wa_name_status.upper() not in (
            "APPROVED", "AVAILABLE_WITHOUT_REVIEW"):
        out.append({
            "key": "display_name", "severity": "blocking",
            "title": "Get your display name approved",
            "detail": "Meta hasn't approved the name customers will see, so messages "
                      "won't send. Test numbers starting 555 always need this.",
            "action": "display_name",
            "meta": {"name_status": shop.wa_name_status},
        })
    # Meta has no endpoint for billing state, so this is inferred from sends:
    # 131042 proves it's missing, a success proves it's there. Before either
    # happens we say "unknown" rather than accusing the seller of a missing card.
    if shop.wa_last_error_code == PAYMENT_ISSUE_CODE:
        out.append({
            "key": "payment_method", "severity": "blocking",
            "title": "Add a payment method",
            "detail": "Meta bills you directly for messages, and a send just failed "
                      "because no working payment method is attached.",
            "action": "billing",
        })
    elif not shop.wa_payment_ready:
        out.append({
            "key": "payment_method", "severity": "unknown",
            "title": "Payment method not confirmed yet",
            "detail": "Meta bills you directly for messages. We can only confirm it's "
                      "set up by sending — the test message below will tell us.",
            "action": "billing",
        })
    return out


@router.get("/wa/onboarding-status")
def onboarding_status(shop: Shop = Depends(current_shop)):
    """The real state of this seller's Meta setup.

    The connect screen renders straight from this — no hardcoded numbers. Each
    step is independently retryable, which is why they're reported separately
    rather than as a single percentage."""
    token_expired = bool(shop.wa_token_expiry and shop.wa_token_expiry < datetime.now())
    coexisting = bool(shop.wa_is_on_biz_app)
    steps = [
        {"key": "signup", "done": bool(shop.waba_id and shop.phone_number_id)},
        {"key": "token", "done": bool(shop.wa_access_token) and not token_expired},
        {"key": "webhooks", "done": bool(shop.waba_id)},
        # Coexistence numbers are already registered by the Business app, so the
        # register call is skipped by design — report it as satisfied, not missing.
        {"key": "registered", "done": bool(shop.wa_verified) or coexisting},
        {"key": "test_message", "done": bool(shop.wa_test_message_sent_at)},
    ]
    blockers = _blockers(shop, token_expired) if shop.wa_connected else []
    return {
        "connected": shop.wa_connected,
        "number": shop.wa_number,
        # Full number as Meta reports it, country code included. Older rows have
        # no value here, so fall back rather than render an empty header.
        "display_number": shop.wa_display_number or shop.wa_number,
        "verified_name": shop.wa_verified_name,
        "waba_id": shop.waba_id,
        "phone_number_id": shop.phone_number_id,
        "verified": shop.wa_verified,
        "token_expired": token_expired,
        "path": shop.wa_onboarding_path,
        "coexisting": coexisting,
        "name_status": shop.wa_name_status,
        "quality_rating": shop.wa_quality_rating,
        "payment_ready": shop.wa_payment_ready,
        "last_error_code": shop.wa_last_error_code,
        "history_sync_status": shop.wa_history_sync_status,
        "contacts_synced": shop.wa_contacts_synced,
        "messages_synced": shop.wa_messages_synced,
        "history_synced_at": shop.wa_history_synced_at.isoformat() if shop.wa_history_synced_at else None,
        "test_message_sent_at": shop.wa_test_message_sent_at.isoformat() if shop.wa_test_message_sent_at else None,
        "mm_terms_status": shop.wa_mm_terms_status,
        "steps": steps,
        "blockers": blockers,
        "can_send": shop.wa_connected and not any(
            b["severity"] == "blocking" for b in blockers),
    }


@router.post("/wa/refresh-health")
def refresh_health(db: Session = Depends(get_db), shop: Shop = Depends(current_shop),
                   cloud=Depends(cloud_mode_only)):
    """Re-read the number's display-name approval and quality from Meta."""
    try:
        return cloud.refresh_number_health(db, shop)
    except WaError as e:
        raise HTTPException(502, str(e))


@router.post("/wa/disconnect")
def wa_disconnect(db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    """Detach the WhatsApp number. Keeps customers, chats and orders."""
    if not shop.wa_connected:
        raise HTTPException(409, "No WhatsApp number is connected")
    if settings.wa.is_cloud:
        from app.services.wa import cloud
        try:
            return cloud.disconnect(db, shop)
        except WaError as e:
            raise HTTPException(502, str(e))
    shop.wa_connected = False
    shop.wa_number = shop.wa_display_number = shop.waba_id = shop.phone_number_id = ""
    shop.wa_access_token = ""
    shop.wa_verified = shop.wa_is_on_biz_app = shop.wa_payment_ready = False
    shop.wa_test_message_sent_at = None
    shop.wa_history_sync_status = "none"
    db.commit()
    return {"disconnected": True, "unsubscribed_from_meta": False}


@router.post("/wa/sync-history")
def sync_history(db: Session = Depends(get_db), shop: Shop = Depends(current_shop),
                 cloud=Depends(cloud_mode_only)):
    """Retry the coexistence contacts + history pull.

    Meta only honours this within 24 hours of onboarding; after that the seller
    has to reconnect, which is why the screen shows the deadline."""
    if not shop.wa_is_on_biz_app:
        raise HTTPException(409, "This number didn't come from the WhatsApp Business app")
    cloud.start_coexistence_sync(shop.id)
    db.refresh(shop)
    return {"status": shop.wa_history_sync_status}


@router.post("/wa/test-message")
def test_message(payload: dict = Body(default={}),
                 db: Session = Depends(get_db), shop: Shop = Depends(current_shop)):
    """Send one real message to a phone the seller is holding.

    Works in both modes on purpose: this is the final step of onboarding, and a
    demo has to be able to finish it too. Defaults to the shop's contact phone,
    which for a fresh (non-coexistence) signup differs from the WhatsApp number."""
    phone = (payload.get("phone") or shop.phone or "").strip()
    try:
        result = wa.send_test_message(db, shop, phone)
    except WaBlocked as e:
        raise HTTPException(400, str(e))
    except WaError as e:
        raise HTTPException(502, str(e))
    shop.wa_test_message_sent_at = datetime.now()
    db.commit()
    return result


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
