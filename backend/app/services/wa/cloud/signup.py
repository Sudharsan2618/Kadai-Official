"""Embedded Signup, number registration, coexistence sync, MM API status.

Everything here is per-seller onboarding against Meta — the calls that turn a
shop row into a working WhatsApp tenant."""
import logging
import re
import secrets
from datetime import datetime, timedelta

from app.core.crypto import encrypt_token
from app.core.events import publish
from app.db.session import SessionLocal
from app.models import Shop
from app.services.wa.cloud.client import (app_token, graph, require_connected,
                                          shop_token)
from app.services.wa.errors import (ALREADY_REGISTERED_CODE, HISTORY_DECLINED_CODE,
                                    WaBlocked, WaError)
from app.settings import settings

log = logging.getLogger(__name__)

MM_SIGNED_STATUSES = {"ONBOARDED", "TERM_OF_SERVICE_SIGNED"}


# ── Number registration (2FA PIN) ───────────────────────────────────────────
def register_number(db, shop: Shop, pin: str | None = None) -> str:
    """POST /{phone_number_id}/register — required once before sending. The
    6-digit two-step PIN is generated if not supplied; we return it so the
    seller can note it down (Meta asks for it if the number moves)."""
    token = shop_token(shop)
    pin = pin or f"{secrets.randbelow(1_000_000):06d}"
    graph("POST", f"/{shop.phone_number_id}/register", token,
          {"messaging_product": "whatsapp", "pin": pin})
    shop.wa_verified = True
    db.commit()
    return pin


# ── Embedded Signup — the 5 real per-seller calls ───────────────────────────
def connect_embedded_signup(db, shop: Shop, code: str,
                            waba_id_hint: str = "",
                            phone_number_id_hint: str = "",
                            path: str = "fresh") -> dict:
    """Frontend ran Meta's Embedded Signup popup and got a short-lived `code`.
    Exchange it, discover the granted WABA + phone number, subscribe our app
    to that WABA's webhooks, register the number, persist encrypted creds.

    `path` is "coexist" when the seller kept their WhatsApp Business app number
    (K-02). In that case the number is already registered for both Cloud API and
    the Business app, so we MUST skip the /register call and instead kick off the
    24-hour contacts + history sync. See docs/embedded-signup__onboarding-business-app-users."""
    if not (settings.wa.app_id and settings.wa.app_secret):
        raise WaBlocked("Meta app credentials aren't configured on the server")

    # 1) code -> business token
    resp = graph("GET", "/oauth/access_token", "", query={
        "client_id": settings.wa.app_id, "client_secret": settings.wa.app_secret,
        "code": code})
    token = resp.get("access_token", "")
    if not token:
        raise WaError("Token exchange failed — try connecting again")
    expires_in = int(resp.get("expires_in") or 0)

    # 2) which WABA did the seller grant? (debug_token with app credentials)
    dbg = graph("GET", "/debug_token", app_token(), query={"input_token": token}).get("data", {})
    waba_id = ""
    for scope in dbg.get("granular_scopes", []):
        if scope.get("scope") in ("whatsapp_business_management", "whatsapp_business_messaging"):
            ids = scope.get("target_ids") or []
            if ids:
                waba_id = str(ids[0])
                break
    if waba_id_hint:
        # The browser event is useful for selecting the exact asset in a
        # multi-WABA flow, but the token scopes remain the source of truth.
        if waba_id and waba_id != waba_id_hint:
            raise WaError("Embedded Signup returned a WABA different from the granted token")
        waba_id = waba_id_hint
    if not waba_id:
        raise WaError("No WhatsApp Business Account was shared — redo the signup and select one")

    # 3) the phone number under that WABA
    nums = graph("GET", f"/{waba_id}/phone_numbers", token).get("data", [])
    if not nums:
        raise WaError("The WhatsApp Business Account has no phone number yet")
    selected = next((n for n in nums if str(n.get("id")) == phone_number_id_hint), None) if phone_number_id_hint else None
    if phone_number_id_hint and not selected:
        raise WaError("Embedded Signup returned a phone number that is not under the granted WABA")
    selected = selected or nums[0]
    phone_number_id = str(selected["id"])
    display_number = re.sub(r"\D", "", selected.get("display_phone_number", ""))[-10:]

    # 3b) Coexistence: confirm the number is actually registered for the
    # Business app. If not, fall back to the normal fresh flow (register it).
    if path == "coexist":
        try:
            det = graph("GET", f"/{phone_number_id}", token,
                        query={"fields": "is_on_biz_app,platform_type"})
            if det.get("is_on_biz_app"):
                shop.wa_is_on_biz_app = True
        except WaError:
            pass  # not a Business-app number → register normally

    # 4) subscribe our app to the WABA (webhooks start flowing)
    graph("POST", f"/{waba_id}/subscribed_apps", token)

    # persist before register so a register failure is retryable from Settings
    shop.waba_id = waba_id
    shop.phone_number_id = phone_number_id
    shop.wa_access_token = encrypt_token(token)
    shop.wa_token_expiry = (datetime.now() + timedelta(seconds=expires_in)) if expires_in else None
    shop.wa_number = display_number or shop.phone
    shop.wa_connected = True
    shop.wa_onboarding_path = "coexist" if shop.wa_is_on_biz_app else "fresh"
    db.commit()

    # 5) register the number with a 2FA PIN — SKIPPED for coexistence numbers
    #    (already registered for Cloud API + Business app). Idempotent-ish.
    pin = ""
    if not shop.wa_is_on_biz_app:
        try:
            pin = register_number(db, shop)
        except WaError as e:
            if e.code != ALREADY_REGISTERED_CODE:  # already registered → not a failure
                shop.wa_verified = False
                db.commit()
    else:
        shop.wa_verified = True
        db.commit()
        start_coexistence_sync(shop.id)  # 24h contacts + history sync (K-02)

    log.info("shop %s connected to WABA %s (%s)", shop.id, waba_id, shop.wa_onboarding_path)
    publish("wa_connected", {"shop_id": shop.id})
    return {"connected": True, "wa_number": shop.wa_number, "waba_id": waba_id,
            "phone_number_id": phone_number_id, "verified": shop.wa_verified,
            "coexist": shop.wa_is_on_biz_app, "pin": pin}


# ── Coexistence: pull contacts + history within 24h (K-02) ─────────────────
def start_coexistence_sync(shop_id: int) -> None:
    """Fire-and-forget the SMB App Data sync calls. Best-effort: a failure marks
    the shop's sync status 'failed' but never blocks onboarding."""
    try:
        _run_coexistence_sync(shop_id)
    except Exception:
        log.exception("shop %s: coexistence sync failed", shop_id)
        with SessionLocal() as db:
            shop = db.get(Shop, shop_id)
            if shop and shop.wa_history_sync_status == "pending":
                shop.wa_history_sync_status = "failed"
                db.commit()


def _run_coexistence_sync(shop_id: int) -> None:
    """POST /{phone_number_id}/smb_app_data twice (contacts, then history).
    Meta then streams smb_app_state_sync + history webhooks which the webhook
    route digests. The 24-hour deadline is Meta's; we trigger as early as we can.
    HISTORY_DECLINED_CODE = seller declined to share history (not a failure)."""
    with SessionLocal() as db:
        shop = db.get(Shop, shop_id)
        if not shop or not shop.wa_is_on_biz_app:
            return
        token = shop_token(shop)
        shop.wa_history_sync_status = "pending"
        db.commit()
        for sync_type in ("smb_app_state_sync", "history"):
            try:
                graph("POST", f"/{shop.phone_number_id}/smb_app_data", token,
                      {"messaging_product": "whatsapp", "sync_type": sync_type})
            except WaError as e:
                shop.wa_history_sync_status = (
                    "skipped" if e.code == HISTORY_DECLINED_CODE else "failed")
                db.commit()
                return
        shop.wa_history_sync_status = "pending"
        db.commit()


# ── Marketing Messages API onboarding / ToS ────────────────────────────────
def _mm_status_value(value) -> tuple[str, datetime | None]:
    """Normalize the Graph API's string/object status variants."""
    if isinstance(value, str):
        return value.upper(), None
    if isinstance(value, dict):
        status = str(value.get("status") or value.get("state") or "NOT_STARTED").upper()
        raw_time = value.get("time")
        signed_at = None
        if raw_time:
            try:
                signed_at = datetime.fromisoformat(str(raw_time).replace("Z", "+00:00")).replace(tzinfo=None)
            except (TypeError, ValueError):
                pass
        return status, signed_at
    return "NOT_STARTED", None


def get_mm_status(db, shop: Shop) -> dict:
    """Read MM API onboarding/ToS state from the WABA and persist the result."""
    require_connected(shop)
    if not shop.waba_id:
        raise WaBlocked("Connect WhatsApp first — MM API belongs to the seller's WABA")
    status_response = graph(
        "GET", f"/{shop.waba_id}", shop_token(shop),
        query={"fields": "marketing_messages_onboarding_status,owner_business_info"},
    )
    status, signed_at = _mm_status_value(status_response.get("marketing_messages_onboarding_status"))
    if status == "NOT_STARTED":
        owner_info = status_response.get("owner_business_info") or {}
        status, signed_at = _mm_status_value(owner_info.get("marketing_messages_onboarding_status"))
    shop.wa_mm_terms_status = status
    if signed_at:
        shop.wa_mm_terms_signed_at = signed_at
    db.commit()
    return {
        "status": status,
        "signed": status in MM_SIGNED_STATUSES,
        "signed_at": shop.wa_mm_terms_signed_at.isoformat() if shop.wa_mm_terms_signed_at else None,
        "waba_id": shop.waba_id,
    }
