"""Real WhatsApp transport — Meta Cloud API (Graph) client.

Mirrors wa_mock's public surface (send_message / start_broadcast /
requeue_failed) so the dispatcher in wa.py can swap it in with WA_MODE=cloud
and no route changes. Differences from the mock, by design:

- outbound sends hit POST /{phone_number_id}/messages and store the returned
  wamid on the Message row; delivery/read ticks arrive via the webhook
  (routes_webhook.py), never simulated
- outside a customer's 24h service window, free text is refused by Meta, so
  ready/broadcast sends fall back to that ready message's APPROVED template
- per-tenant auth: every call is signed with the shop's own (encrypted-at-rest)
  access token
- stdlib urllib only, same convention as the Razorpay client

Meta error handling: the Graph error envelope is parsed into WaError with the
code/subcode; 190 (expired/invalid token) flips the shop to needs-reconnect,
transient codes are retried with backoff, permanent ones fail the message so
the existing resend UI picks it up.
"""
import asyncio
import json
import re
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

import config
from db import SessionLocal
from models import Message, Broadcast, BroadcastRecipient, Customer, Shop, ReadyMessage, Template
from domain import window_info
from events import publish
from secure import encrypt_token, decrypt_token
from wa_mock import _schedule, requeue_failed  # loop scheduler + pure-DB requeue are transport-agnostic

SEND_RETRIES = 2
RETRY_BACKOFF_SECONDS = 1.0

# Graph error codes that are worth retrying (throttling / transient platform)
TRANSIENT_CODES = {1, 2, 4, 80007, 130429, 131048, 131056}
# Token invalid/expired — seller must reconnect via Embedded Signup
AUTH_ERROR_CODES = {190}
# Re-engagement: >24h since customer message, template required (we surface a clear error)
REENGAGEMENT_CODES = {131047, 131026, 470, 1013}


class WaError(Exception):
    """A Graph API failure with Meta's error envelope attached."""

    def __init__(self, message: str, code: int = 0, subcode: int = 0, http_status: int = 0):
        super().__init__(message)
        self.code = code
        self.subcode = subcode
        self.http_status = http_status

    @property
    def transient(self) -> bool:
        return self.code in TRANSIENT_CODES or self.http_status >= 500

    @property
    def auth_expired(self) -> bool:
        return self.code in AUTH_ERROR_CODES


class WaBlocked(WaError):
    """Send is not allowed (window closed and no approved template). Not retryable."""


# ── Low-level Graph client ──────────────────────────────────────────────────
def _graph(method: str, path: str, token: str, payload: dict | None = None,
           query: dict | None = None) -> dict:
    url = f"{config.GRAPH_BASE}{path}"
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=config.WA_GRAPH_TIMEOUT) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            envelope = json.loads(e.read()).get("error", {})
        except Exception:
            envelope = {}
        raise WaError(
            envelope.get("message", f"Meta API error (HTTP {e.code})"),
            code=int(envelope.get("code", 0) or 0),
            subcode=int(envelope.get("error_subcode", 0) or 0),
            http_status=e.code,
        )
    except Exception as e:
        # DNS/timeout/conn-reset — treat as transient
        raise WaError(f"Couldn't reach Meta: {e}", http_status=599)


def _shop_token(shop: Shop) -> str:
    token = decrypt_token(shop.wa_access_token)
    if not token:
        raise WaBlocked("WhatsApp isn't connected for this shop — connect it in Settings")
    return token


def _require_connected(shop: Shop):
    if not (shop.wa_connected and shop.phone_number_id and shop.wa_access_token):
        raise WaBlocked("WhatsApp isn't connected — finish the Meta signup in Settings")
    if shop.wa_token_expiry and shop.wa_token_expiry < datetime.now():
        raise WaBlocked("WhatsApp session expired — reconnect your number in Settings")


def _e164(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) == 10:  # app stores bare 10-digit Indian numbers
        return config.WA_DEFAULT_COUNTRY_CODE + digits
    return digits


def _mark_token_expired(db, shop: Shop):
    """190 → the seller has to re-run Embedded Signup. Keep credentials so the
    UI can show 'reconnect' instead of 'never connected'."""
    shop.wa_token_expiry = datetime.now() - timedelta(seconds=1)
    db.commit()
    publish("wa_disconnected", {"shop_id": shop.id})


# ── Template helpers ────────────────────────────────────────────────────────
PLACEHOLDER_RE = re.compile(r"\{(name|shop)\}")


def to_meta_body(body: str) -> tuple[str, list[str]]:
    """Convert our {name}/{shop} placeholders to Meta's positional {{1}},{{2}}.
    Returns (meta_body, ordered param names). Repeated placeholders reuse the
    same position — Meta requires each {{n}} appear once in the example."""
    params: list[str] = []

    def sub(m):
        key = m.group(1)
        if key not in params:
            params.append(key)
        return "{{%d}}" % (params.index(key) + 1)

    return PLACEHOLDER_RE.sub(sub, body), params


def _param_values(params: list[str], cust: Customer, shop: Shop) -> list[str]:
    lookup = {"name": cust.name or "customer", "shop": shop.name or "our shop"}
    return [lookup.get(p, p) for p in params]


def _approved_template(db, shop: Shop, ready_label: str) -> Template | None:
    return (db.query(Template)
            .join(ReadyMessage, Template.ready_message_id == ReadyMessage.id)
            .filter(Template.shop_id == shop.id, Template.status == "approved",
                    ReadyMessage.label == ready_label)
            .order_by(Template.updated_at.desc())
            .first())


# ── Outbound send (THE seam — signature identical to wa_mock.send_message) ──
def _send_payload(db, shop: Shop, cust: Customer, body: str, kind: str,
                  ready_label: str) -> dict:
    """Choose free text (window open) vs approved template (window closed)."""
    if window_info(db, cust.id)["open"]:
        return {"messaging_product": "whatsapp", "to": _e164(cust.phone),
                "type": "text", "text": {"preview_url": False, "body": body}}

    if kind == "text":
        raise WaBlocked("24h window closed — send a ready message (approved template) instead")

    tpl = _approved_template(db, shop, ready_label)
    if not tpl:
        raise WaBlocked(
            f'"{ready_label}" has no approved WhatsApp template yet — submit it for '
            "approval in Settings before messaging outside the 24h window")
    values = _param_values(tpl.params, cust, shop)
    components = []
    if values:
        components.append({"type": "body",
                           "parameters": [{"type": "text", "text": v} for v in values]})
    return {"messaging_product": "whatsapp", "to": _e164(cust.phone), "type": "template",
            "template": {"name": tpl.name, "language": {"code": tpl.language},
                         "components": components}}


def send_message(db, customer_id: int, body: str, kind: str = "text",
                 ready_label: str = "", broadcast_id: int | None = None,
                 tick: bool = True) -> Message:
    """Send via Graph API with bounded retries. Persists 'sent' (+ wamid) or
    'failed' — real delivery/read ticks arrive later via webhook, so `tick`
    is accepted for interface parity and ignored."""
    cust = db.get(Customer, customer_id)
    if not cust:
        raise WaBlocked("Customer not found")
    shop = db.get(Shop, cust.shop_id)
    _require_connected(shop)
    token = _shop_token(shop)
    payload = _send_payload(db, shop, cust, body, kind, ready_label)

    wamid, ok, last_err = "", False, None
    for attempt in range(SEND_RETRIES + 1):
        try:
            resp = _graph("POST", f"/{shop.phone_number_id}/messages", token, payload)
            wamid = (resp.get("messages") or [{}])[0].get("id", "")
            ok = True
            break
        except WaError as e:
            last_err = e
            if e.auth_expired:
                _mark_token_expired(db, shop)
                break
            if not e.transient or attempt >= SEND_RETRIES:
                break
            time.sleep(RETRY_BACKOFF_SECONDS * (attempt + 1))

    msg = Message(shop_id=shop.id, customer_id=customer_id, direction="out",
                  kind=kind, body=body, ready_label=ready_label,
                  status="sent" if ok else "failed", wamid=wamid,
                  broadcast_id=broadcast_id)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    publish("message_out", {"customer_id": customer_id, "message_id": msg.id,
                            "status": msg.status,
                            "error": str(last_err) if last_err else None})
    return msg


# ── Broadcast fan-out (paced, template-aware, no fake ticks) ────────────────
async def _run_broadcast(broadcast_id: int):
    delay = 1.0 / max(config.BROADCAST_MSGS_PER_SEC, 0.1)
    with SessionLocal() as db:
        b = db.get(Broadcast, broadcast_id)
        if not b:
            return
        title, body_template = b.title, b.body
        recipient_ids = [r.id for r in db.query(BroadcastRecipient)
                         .filter_by(broadcast_id=broadcast_id, status="queued")]

    for rid in recipient_ids:
        await asyncio.sleep(delay)

        def _send_one(rid=rid):
            with SessionLocal() as db:
                r = db.get(BroadcastRecipient, rid)
                if not r:
                    return
                cust = db.get(Customer, r.customer_id)
                if not cust:
                    r.status = "failed"
                    db.commit()
                    return
                shop = db.get(Shop, cust.shop_id)
                personal = (body_template.replace("{name}", cust.name)
                            .replace("{shop}", shop.name if shop else ""))
                try:
                    msg = send_message(db, r.customer_id, personal, kind="broadcast",
                                       ready_label=title, broadcast_id=broadcast_id,
                                       tick=False)
                    r.status = "sent" if msg.status == "sent" else "failed"
                except WaError:
                    r.status = "failed"
                db.commit()

        await asyncio.to_thread(_send_one)  # urllib is blocking — keep the loop free
        publish("broadcast_progress", {"broadcast_id": broadcast_id})

    with SessionLocal() as db:
        b = db.get(Broadcast, broadcast_id)
        if b:
            b.status = "done"
            db.commit()
    publish("broadcast_progress", {"broadcast_id": broadcast_id, "done": True})


def start_broadcast(broadcast_id: int):
    _schedule(_run_broadcast(broadcast_id))


# ── Number registration (2FA PIN) ───────────────────────────────────────────
def register_number(db, shop: Shop, pin: str | None = None) -> str:
    """POST /{phone_number_id}/register — required once before sending. The
    6-digit two-step PIN is generated if not supplied; we return it so the
    seller can note it down (Meta asks for it if the number moves)."""
    token = _shop_token(shop)
    pin = pin or f"{secrets.randbelow(1_000_000):06d}"
    _graph("POST", f"/{shop.phone_number_id}/register", token,
           {"messaging_product": "whatsapp", "pin": pin})
    shop.wa_verified = True
    db.commit()
    return pin


# ── Embedded Signup — the 5 real per-seller calls ───────────────────────────
def connect_embedded_signup(db, shop: Shop, code: str) -> dict:
    """Frontend ran Meta's Embedded Signup popup and got a short-lived `code`.
    Exchange it, discover the granted WABA + phone number, subscribe our app
    to that WABA's webhooks, register the number, persist encrypted creds."""
    if not (config.META_APP_ID and config.META_APP_SECRET):
        raise WaBlocked("Meta app credentials aren't configured on the server")

    # 1) code -> business token
    resp = _graph("GET", "/oauth/access_token", "", query={
        "client_id": config.META_APP_ID, "client_secret": config.META_APP_SECRET,
        "code": code})
    token = resp.get("access_token", "")
    if not token:
        raise WaError("Token exchange failed — try connecting again")
    expires_in = int(resp.get("expires_in") or 0)

    # 2) which WABA did the seller grant? (debug_token with app credentials)
    app_token = f"{config.META_APP_ID}|{config.META_APP_SECRET}"
    dbg = _graph("GET", "/debug_token", app_token, query={"input_token": token}).get("data", {})
    waba_id = ""
    for scope in dbg.get("granular_scopes", []):
        if scope.get("scope") in ("whatsapp_business_management", "whatsapp_business_messaging"):
            ids = scope.get("target_ids") or []
            if ids:
                waba_id = str(ids[0])
                break
    if not waba_id:
        raise WaError("No WhatsApp Business Account was shared — redo the signup and select one")

    # 3) the phone number under that WABA
    nums = _graph("GET", f"/{waba_id}/phone_numbers", token).get("data", [])
    if not nums:
        raise WaError("The WhatsApp Business Account has no phone number yet")
    phone_number_id = str(nums[0]["id"])
    display_number = re.sub(r"\D", "", nums[0].get("display_phone_number", ""))[-10:]

    # 4) subscribe our app to the WABA (webhooks start flowing)
    _graph("POST", f"/{waba_id}/subscribed_apps", token)

    # persist before register so a register failure is retryable from Settings
    shop.waba_id = waba_id
    shop.phone_number_id = phone_number_id
    shop.wa_access_token = encrypt_token(token)
    shop.wa_token_expiry = (datetime.now() + timedelta(seconds=expires_in)) if expires_in else None
    shop.wa_number = display_number or shop.phone
    shop.wa_connected = True
    db.commit()

    # 5) register the number with a 2FA PIN (idempotent-ish; already-registered is fine)
    pin = ""
    try:
        pin = register_number(db, shop)
    except WaError as e:
        if e.code not in (131070,):  # already registered → not a failure
            shop.wa_verified = False
            db.commit()

    publish("wa_connected", {"shop_id": shop.id})
    return {"connected": True, "wa_number": shop.wa_number, "waba_id": waba_id,
            "phone_number_id": phone_number_id, "verified": shop.wa_verified, "pin": pin}


# ── Templates: submit + status sync ─────────────────────────────────────────
def submit_template(db, shop: Shop, rm: ReadyMessage, category: str = "MARKETING",
                    language: str = "en") -> Template:
    """Submit one ready message to Meta for template approval."""
    token = _shop_token(shop)
    if not shop.waba_id:
        raise WaBlocked("Connect WhatsApp first — templates live under your business account")

    meta_body, params = to_meta_body(rm.body)
    slug = re.sub(r"[^a-z0-9]+", "_", rm.label.lower()).strip("_")[:40] or "message"
    name = f"kadai_{shop.id}_{rm.id}_{slug}"

    components = [{"type": "BODY", "text": meta_body}]
    if params:
        # Meta requires example values for every positional param
        examples = [{"name": "Murugan", "shop": shop.name or "Kadai"}.get(p, p) for p in params]
        components[0]["example"] = {"body_text": [examples]}

    resp = _graph("POST", f"/{shop.waba_id}/message_templates", token, {
        "name": name, "language": language, "category": category,
        "allow_category_change": True, "components": components})

    tpl = (db.query(Template).filter_by(shop_id=shop.id, ready_message_id=rm.id).first()
           or Template(shop_id=shop.id, ready_message_id=rm.id))
    tpl.name = name
    tpl.language = language
    tpl.category = category
    tpl.body = meta_body
    tpl.params = params
    tpl.status = (resp.get("status") or "PENDING").lower()
    tpl.meta_template_id = str(resp.get("id", ""))
    tpl.rejected_reason = ""
    tpl.updated_at = datetime.now()
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return tpl


def sync_template_status(db, shop: Shop) -> int:
    """Pull current approval states from Meta; webhook updates also land via
    routes_webhook, this is the manual 'refresh' path. Returns count updated."""
    token = _shop_token(shop)
    if not shop.waba_id:
        return 0
    data = _graph("GET", f"/{shop.waba_id}/message_templates", token,
                  query={"fields": "id,name,status,rejected_reason", "limit": "200"}).get("data", [])
    by_name = {t["name"]: t for t in data}
    updated = 0
    for tpl in db.query(Template).filter_by(shop_id=shop.id).all():
        m = by_name.get(tpl.name)
        if not m:
            continue
        new_status = (m.get("status") or "").lower()
        if new_status and new_status != tpl.status:
            tpl.status = new_status
            tpl.rejected_reason = m.get("rejected_reason") or ""
            tpl.updated_at = datetime.now()
            updated += 1
    db.commit()
    return updated
