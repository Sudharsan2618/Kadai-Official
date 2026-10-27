"""Baileys gateway callbacks (replaces the Meta webhook).

The gateway sidecar owns the WhatsApp socket and posts here:
  POST /wa/baileys/inbound  — one inbound customer message
  POST /wa/baileys/status   — a link going up (linked) or down (logged_out)

Both are authenticated with the shared secret header (constant-time compare),
resolve the shop by the id the gateway was keyed with, and always ACK 200 so a
transient DB hiccup never makes the gateway retry-storm. Idempotent on wamid."""
import hmac
import logging

from fastapi import APIRouter, Header, HTTPException, Request

from app.db.session import SessionLocal
from app.services.wa import baileys
from app.settings import settings

log = logging.getLogger(__name__)

router = APIRouter(prefix="/wa/baileys", tags=["whatsapp-gateway"])


def _check_secret(given: str) -> None:
    expected = settings.wa.gateway_secret
    if not expected:
        raise HTTPException(status_code=503, detail="WA_GATEWAY_SECRET not configured")
    if not hmac.compare_digest(given or "", expected):
        raise HTTPException(status_code=401, detail="bad gateway secret")


@router.post("/inbound")
async def inbound(request: Request, x_gateway_secret: str = Header(default="")):
    _check_secret(x_gateway_secret)
    payload = await request.json()
    shop_id = payload.get("shopId")
    with SessionLocal() as db:
        shop = baileys.shop_by_id(db, shop_id)
        if shop:
            try:
                baileys.handle_inbound(db, shop, payload)
            except Exception:
                db.rollback()
                log.exception("baileys inbound failed (shop=%s)", shop_id)
    return {"ok": True}


@router.post("/status")
async def status(request: Request, x_gateway_secret: str = Header(default="")):
    _check_secret(x_gateway_secret)
    payload = await request.json()
    shop_id = payload.get("shopId")
    with SessionLocal() as db:
        shop = baileys.shop_by_id(db, shop_id)
        if shop:
            try:
                baileys.apply_status(db, shop, str(payload.get("status", "")),
                                     str(payload.get("number", "")))
            except Exception:
                db.rollback()
                log.exception("baileys status failed (shop=%s)", shop_id)
    return {"ok": True}
