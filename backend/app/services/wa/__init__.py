"""WhatsApp transport dispatcher — one import site, two backends.

Routes import from here; WA_MODE picks the engine at call time:
  mock  → app.services.wa.mock   (offline simulation: fake ticks, auto-replies)
  cloud → app.services.wa.cloud  (real Meta Cloud API + webhook-driven ticks)

Keep the demo on mock and production on cloud with a single env var — no route
or frontend code knows the difference."""
from app.models import Broadcast, BroadcastRecipient, Message
from app.services.wa.errors import WaBlocked, WaError
from app.settings import settings


def _engine():
    if settings.wa.is_cloud:
        from app.services.wa import cloud  # lazy: mock installs skip the crypto import
        return cloud
    from app.services.wa import mock
    return mock


def send_message(db, customer_id: int, body: str, kind: str = "text",
                 ready_label: str = "", broadcast_id: int | None = None,
                 tick: bool = True) -> Message:
    return _engine().send_message(db, customer_id, body, kind=kind,
                                  ready_label=ready_label,
                                  broadcast_id=broadcast_id, tick=tick)


def start_broadcast(broadcast_id: int) -> None:
    return _engine().start_broadcast(broadcast_id)


def send_test_message(db, shop, phone: str) -> dict:
    """Onboarding's proof-of-life send. Both engines implement it so the last
    step of signup completes in demo mode as well as production."""
    return _engine().send_test_message(db, shop, phone)


def requeue_failed(db, broadcast_id: int) -> int:
    """Mark failed recipients queued again; the caller then start_broadcast()s.
    Pure DB work — identical for both engines, so it lives here."""
    failed = (db.query(BroadcastRecipient)
              .filter_by(broadcast_id=broadcast_id, status="failed").all())
    for r in failed:
        r.status = "queued"
    b = db.get(Broadcast, broadcast_id)
    if b and failed:
        b.status = "sending"
    db.commit()
    return len(failed)


__all__ = ["send_message", "start_broadcast", "send_test_message", "requeue_failed",
           "WaError", "WaBlocked"]
