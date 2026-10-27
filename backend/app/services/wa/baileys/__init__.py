"""Real WhatsApp transport — Baileys (WhatsApp Web) via the gateway sidecar.

Split by concern:
  client.py    — HTTP to the Node gateway (shared-secret auth)
  messaging.py — outbound sends and broadcast fan-out
  inbound.py   — digest gateway callbacks (inbound messages, link status)
  link.py      — QR / pairing link lifecycle

Mirrors the mock engine's send_message / start_broadcast / send_test_message
surface so the dispatcher in app.services.wa can swap it in with WA_MODE=baileys
and no route changes. No Meta, no templates, no 24-hour window, no billing."""
from app.services.wa.baileys.inbound import apply_status, handle_inbound, shop_by_id
from app.services.wa.baileys.link import disconnect, get_status, start_link
from app.services.wa.baileys.messaging import (send_message, send_test_message,
                                               start_broadcast)
from app.services.wa.errors import WaBlocked, WaError
from app.services.wa.phones import to_e164, to_local

__all__ = [
    "send_message", "start_broadcast", "send_test_message",
    "start_link", "get_status", "disconnect",
    "handle_inbound", "apply_status", "shop_by_id",
    "to_e164", "to_local",
    "WaError", "WaBlocked",
]
