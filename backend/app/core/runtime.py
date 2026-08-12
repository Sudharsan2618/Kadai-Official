"""The application event loop, captured once at startup.

Sync routes run in AnyIO worker threads (no loop of their own — Python 3.13
removed the implicit one), so anything that wants to touch the loop from a
route — background WhatsApp ticks, SSE fan-out — has to be handed here.

Previously wa_mock and events each kept their own copy of this; there is only
ever one loop, so there is only one holder."""
import asyncio
import logging
from typing import Callable, Coroutine

log = logging.getLogger(__name__)

_loop: asyncio.AbstractEventLoop | None = None


def set_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def get_loop() -> asyncio.AbstractEventLoop | None:
    return _loop


def schedule(coro: Coroutine) -> None:
    """Fire-and-forget a coroutine from any thread. Silently drops it when no
    loop is running (scripts and tests import these modules without the app)."""
    try:
        asyncio.get_running_loop().create_task(coro)
        return
    except RuntimeError:
        pass
    if _loop and _loop.is_running():
        asyncio.run_coroutine_threadsafe(coro, _loop)
    else:
        coro.close()


def call_soon(fn: Callable[[], None]) -> None:
    """Run `fn` on the loop thread. Executes inline when already on it."""
    try:
        asyncio.get_running_loop()
        fn()
        return
    except RuntimeError:
        pass
    if _loop and _loop.is_running():
        _loop.call_soon_threadsafe(fn)
