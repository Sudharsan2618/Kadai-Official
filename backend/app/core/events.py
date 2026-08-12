"""Tiny in-process SSE broker: routes publish events, connected clients get
them live.

In-process is the important word — subscribers live in this worker's memory,
so a publish only reaches clients connected to the same instance. On Cloud Run
that means either one instance (min=max=1) or session affinity; see
backend/README.md."""
import asyncio
import json

from app.core import runtime

_subscribers: set[asyncio.Queue] = set()

KEEPALIVE_SECONDS = 15
QUEUE_MAXSIZE = 100


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_MAXSIZE)
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.discard(q)


def publish(event_type: str, data: dict | None = None) -> None:
    """Thread-safe: routes may publish from AnyIO worker threads, so hand the
    queue writes to the event loop instead of touching asyncio.Queue directly."""
    payload = {"type": event_type, **(data or {})}

    def _fanout():
        for q in list(_subscribers):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                pass

    runtime.call_soon(_fanout)


async def sse_stream(request):
    q = subscribe()
    try:
        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(q.get(), timeout=KEEPALIVE_SECONDS)
                yield f"data: {json.dumps(event, default=str)}\n\n"
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
    finally:
        unsubscribe(q)
