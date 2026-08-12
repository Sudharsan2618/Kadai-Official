"""WhatsApp transport errors.

Kept in their own module so routes can catch WaBlocked without importing the
cloud client (which pulls in cryptography and only makes sense in cloud mode)."""

# Graph error codes worth retrying (throttling / transient platform issues)
TRANSIENT_CODES = {1, 2, 4, 80007, 130429, 131048, 131056}
# Token invalid/expired — the seller must reconnect via Embedded Signup
AUTH_ERROR_CODES = {190}
# Re-engagement: >24h since the customer's message, template required
REENGAGEMENT_CODES = {131047, 131026, 470, 1013}
# The number is already registered for Cloud API — not a failure
ALREADY_REGISTERED_CODE = 131070
# The seller declined to share WhatsApp Business app history — not a failure
HISTORY_DECLINED_CODE = 2593109


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
    """Send is not allowed (window closed and no approved template, or the shop
    isn't connected). Never retried."""
