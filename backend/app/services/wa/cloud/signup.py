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
                                          shop_token, to_e164)
from app.services.wa.errors import (ALREADY_REGISTERED_CODE, HISTORY_DECLINED_CODE,
                                    WaBlocked, WaError)
from app.settings import settings

log = logging.getLogger(__name__)

MM_SIGNED_STATUSES = {"ONBOARDED", "TERM_OF_SERVICE_SIGNED"}

# Meta's sample template. It reliably exists on Meta-provided TEST numbers, but
# is NOT guaranteed on a WABA a seller created through Embedded Signup — their
# docs only ever show it in the get-started flow. So we prefer it and fall back
# to whatever the WABA actually has approved.
DEFAULT_TEST_TEMPLATE = "hello_world"
DEFAULT_TEST_LANGUAGE = "en_US"


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
    nums = graph("GET", f"/{waba_id}/phone_numbers", token, query={
        "fields": "id,display_phone_number,verified_name,name_status,quality_rating,platform_type",
    }).get("data", [])
    if not nums:
        raise WaError("The WhatsApp Business Account has no phone number yet")
    selected = next((n for n in nums if str(n.get("id")) == phone_number_id_hint), None) if phone_number_id_hint else None
    if phone_number_id_hint and not selected:
        raise WaError("Embedded Signup returned a phone number that is not under the granted WABA")
    selected = selected or nums[0]
    phone_number_id = str(selected["id"])
    # Keep both forms: the full one Meta gave us (country code included — a 555
    # test number is +1, not +91) and the bare local one used for matching.
    display_full = str(selected.get("display_phone_number") or "").strip()
    display_number = re.sub(r"\D", "", display_full)[-10:]

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
    shop.wa_display_number = display_full
    shop.wa_verified_name = str(selected.get("verified_name") or "")
    shop.wa_name_status = str(selected.get("name_status") or "")
    shop.wa_quality_rating = str(selected.get("quality_rating") or "")
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


# ── Number health: what Meta says about this number right now ───────────────
def refresh_number_health(db, shop: Shop) -> dict:
    """Pull the phone number's own state — display name approval and quality.

    `name_status` matters more than it looks: a 555 test number cannot send at
    all until it is APPROVED (error 131037), and that is invisible everywhere
    else in the product."""
    require_connected(shop)
    data = graph("GET", f"/{shop.phone_number_id}", shop_token(shop), query={
        "fields": "display_phone_number,verified_name,name_status,quality_rating,platform_type",
    })
    shop.wa_display_number = str(data.get("display_phone_number") or shop.wa_display_number)
    shop.wa_verified_name = str(data.get("verified_name") or "")
    shop.wa_name_status = str(data.get("name_status") or "")
    shop.wa_quality_rating = str(data.get("quality_rating") or "")
    db.commit()
    return {"display_number": shop.wa_display_number, "verified_name": shop.wa_verified_name,
            "name_status": shop.wa_name_status, "quality_rating": shop.wa_quality_rating}


# ── Disconnect: hand the number back ────────────────────────────────────────
def disconnect(db, shop: Shop) -> dict:
    """Unsubscribe our app from the seller's WABA and drop the stored token.

    Deliberately keeps customers, chats and orders — the seller is detaching a
    channel, not deleting their shop. Meta-side unsubscribe is best-effort: if
    it fails we still clear our credentials, because leaving a token we can no
    longer explain is worse than an orphaned subscription."""
    unsubscribed = False
    if shop.waba_id and shop.wa_access_token:
        try:
            graph("DELETE", f"/{shop.waba_id}/subscribed_apps", shop_token(shop))
            unsubscribed = True
        except WaError as e:
            log.warning("shop %s: WABA unsubscribe failed on disconnect — %s", shop.id, e)

    shop.wa_connected = False
    shop.wa_access_token = ""
    shop.wa_token_expiry = None
    shop.wa_verified = False
    shop.waba_id = ""
    shop.phone_number_id = ""
    shop.wa_number = ""
    shop.wa_display_number = ""
    shop.wa_verified_name = ""
    shop.wa_name_status = ""
    shop.wa_quality_rating = ""
    shop.wa_payment_ready = False
    shop.wa_last_error_code = 0
    shop.wa_test_message_sent_at = None
    shop.wa_is_on_biz_app = False
    shop.wa_onboarding_path = "fresh"
    shop.wa_history_sync_status = "none"
    db.commit()
    log.info("shop %s disconnected (meta unsubscribe: %s)", shop.id, unsubscribed)
    publish("wa_disconnected", {"shop_id": shop.id})
    return {"disconnected": True, "unsubscribed_from_meta": unsubscribed}


# ── Onboarding proof: send one real message to the seller's own phone ───────
def send_test_message(db, shop: Shop, phone: str) -> dict:
    """The last step of onboarding: prove the pipe works, end to end.

    Deliberately NOT routed through send_message(). That path needs a Customer
    row and an approved ready-message template, and at the end of onboarding the
    seller has neither. This sends Meta's built-in `hello_world` template — the
    one template that exists on every WABA from day one — straight to whichever
    phone the seller is holding.

    Nothing is persisted as a Message: this is a diagnostic, not a conversation,
    and inventing a Customer for it would pollute the seller's contact list."""
    require_connected(shop)
    to = to_e164(phone)
    if not to or len(to) < 10:
        raise WaBlocked("Enter the WhatsApp number you want the test sent to")
    # WhatsApp refuses a business number messaging itself, and the error Meta
    # returns for it is opaque — catch it here where we can explain it.
    if to == to_e164(shop.wa_number):
        raise WaBlocked(
            "That's the shop's own WhatsApp number — send the test to a different "
            "phone, like your personal number")

    token = shop_token(shop)
    name, language = _pick_test_template(shop, token)
    payload = {
        "messaging_product": "whatsapp", "recipient_type": "individual", "to": to,
        "type": "template",
        "template": {"name": name, "language": {"code": language}},
    }
    from app.services.wa.cloud.messaging import record_send_outcome
    try:
        resp = graph("POST", f"/{shop.phone_number_id}/messages", token, payload)
    except WaError as e:
        # The test send is usually the first real send an account makes, so it
        # is also where billing and display-name problems surface first.
        record_send_outcome(db, shop, False, e)
        raise
    record_send_outcome(db, shop, True, None)
    wamid = (resp.get("messages") or [{}])[0].get("id", "")
    log.info("shop %s: onboarding test message sent via %s (%s)",
             shop.id, name, wamid or "no wamid")
    return {"sent": True, "wamid": wamid, "to": to, "template": name}


def _pick_test_template(shop: Shop, token: str) -> tuple[str, str]:
    """Choose a template the seller's WABA can actually send.

    Prefers Meta's `hello_world` sample, but a WABA created through Embedded
    Signup does not necessarily have it — so fall back to any APPROVED template
    on the account rather than sending something Meta will reject with an
    error the seller cannot act on."""
    try:
        rows = graph("GET", f"/{shop.waba_id}/message_templates", token,
                     query={"fields": "name,language,status", "limit": "100"}).get("data", [])
    except WaError:
        return DEFAULT_TEST_TEMPLATE, DEFAULT_TEST_LANGUAGE  # let the send surface the real error

    approved = [t for t in rows if str(t.get("status", "")).upper() == "APPROVED"]
    for t in approved:
        if t.get("name") == DEFAULT_TEST_TEMPLATE:
            return DEFAULT_TEST_TEMPLATE, t.get("language") or DEFAULT_TEST_LANGUAGE
    if approved:
        return approved[0]["name"], approved[0].get("language") or "en"
    raise WaBlocked(
        "This WhatsApp account has no approved message template yet, so there's "
        "nothing we can send as a test. Add one from the template library first.")


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
