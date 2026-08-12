"""Real WhatsApp transport — Meta Cloud API (Graph).

Split by concern:
  client.py    — Graph HTTP + per-tenant auth + phone formatting
  messaging.py — outbound sends and broadcast fan-out
  templates.py — template submission, status sync, placeholder mapping
  signup.py    — Embedded Signup, registration, coexistence, MM API status

Mirrors the mock engine's send_message / start_broadcast surface so the
dispatcher in app.services.wa can swap it in with WA_MODE=cloud and no route
changes."""
from app.services.wa.cloud.client import graph, require_connected, shop_token
from app.services.wa.cloud.messaging import send_message, start_broadcast
from app.services.wa.cloud.signup import (connect_embedded_signup, get_mm_status,
                                          register_number, start_coexistence_sync)
from app.services.wa.cloud.templates import (approved_template, submit_template,
                                             sync_template_status, to_meta_body)
from app.services.wa.errors import WaBlocked, WaError
from app.services.wa.phones import to_e164, to_local

__all__ = [
    "send_message", "start_broadcast",
    "connect_embedded_signup", "register_number", "start_coexistence_sync", "get_mm_status",
    "submit_template", "sync_template_status", "approved_template", "to_meta_body",
    "graph", "shop_token", "require_connected", "to_e164", "to_local",
    "WaError", "WaBlocked",
]
