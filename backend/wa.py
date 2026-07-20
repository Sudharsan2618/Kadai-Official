"""WhatsApp transport dispatcher — one import site, two backends.

Routes import from here; WA_MODE picks the engine at call time:
  mock  → wa_mock.py  (offline simulation: fake ticks, auto-replies)
  cloud → wa_cloud.py (real Meta Cloud API + webhook-driven ticks)

Keep the demo on mock and production on cloud with a single env var —
no route or frontend code knows the difference."""
import config
import wa_mock


def _engine():
    if config.WA_MODE == "cloud":
        import wa_cloud  # lazy: mock/demo installs don't need cryptography
        return wa_cloud
    return wa_mock


def send_message(db, customer_id: int, body: str, kind: str = "text",
                 ready_label: str = "", broadcast_id: int | None = None,
                 tick: bool = True):
    return _engine().send_message(db, customer_id, body, kind=kind,
                                  ready_label=ready_label,
                                  broadcast_id=broadcast_id, tick=tick)


def start_broadcast(broadcast_id: int):
    return _engine().start_broadcast(broadcast_id)


def requeue_failed(db, broadcast_id: int) -> int:
    # pure DB operation, shared by both engines
    return wa_mock.requeue_failed(db, broadcast_id)


def set_loop(loop):
    wa_mock.set_loop(loop)  # both engines schedule through wa_mock's loop holder
