"""Tiny SSE broker: routes publish events, connected clients receive them live."""
import asyncio
import json

_subscribers: set[asyncio.Queue] = set()
_loop: asyncio.AbstractEventLoop | None = None


def set_loop(loop: asyncio.AbstractEventLoop):
    global _loop
    _loop = loop


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue):
    _subscribers.discard(q)


def publish(event_type: str, data: dict | None = None):
    """Thread-safe: routes may publish from AnyIO worker threads, so hand the
    queue writes to the event loop instead of touching asyncio.Queue directly."""
    payload = {"type": event_type, **(data or {})}

    def _fanout():
        for q in list(_subscribers):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                pass

    try:
        asyncio.get_running_loop()
        _fanout()  # already on the loop thread
    except RuntimeError:
        if _loop and _loop.is_running():
            _loop.call_soon_threadsafe(_fanout)


async def sse_stream(request):
    q = subscribe()
    try:
        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(q.get(), timeout=15)
                yield f"data: {json.dumps(event, default=str)}\n\n"
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
    finally:
        unsubscribe(q)
