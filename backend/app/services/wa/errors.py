"""WhatsApp transport errors.

Kept in their own tiny module so routes can catch WaBlocked without importing a
transport engine. Both engines (mock, baileys) raise these."""


class WaError(Exception):
    """A WhatsApp transport failure (the gateway was unreachable, or it refused
    the request). `http_status` carries the gateway's HTTP status when there was
    one, for logging."""

    def __init__(self, message: str, code: int = 0, http_status: int = 0):
        super().__init__(message)
        self.code = code
        self.http_status = http_status


class WaBlocked(WaError):
    """Send/link is not allowed right now (WhatsApp isn't connected, or a
    precondition like a self-send failed). Never retried."""
