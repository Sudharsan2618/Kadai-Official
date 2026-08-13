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
# No usable payment method on the seller's WhatsApp Business account. Meta gives
# us no way to query this, so this error is the only reliable signal we get.
PAYMENT_ISSUE_CODE = 131042
# A 555 test number whose display name has not been approved yet — it cannot
# send anything until that clears.
DISPLAY_NAME_UNAPPROVED_CODE = 131037
# Public test numbers can only message recipients added to an allow list in the
# App Dashboard. Meta provides no API for that list — the recipient has to enter
# a verification code, which is the point of the restriction.
RECIPIENT_NOT_ALLOWED_CODE = 131030


def explain(err: "WaError") -> dict:
    """Turn a Meta error into something a shop owner can act on.

    Meta's own strings are written for developers ("Recipient phone number not
    in allowed list"). A seller needs to know what went wrong, whether it's
    their fault, and exactly what to do — so each entry carries an `action` the
    UI turns into the right button."""
    code = err.code
    if code == RECIPIENT_NOT_ALLOWED_CODE:
        return {
            "title": "This number isn't on your test list yet",
            "detail": "Your WhatsApp number is still a Meta test number, so it can only "
                      "message people you've added and verified in the Meta dashboard. "
                      "Add the number there, enter the code WhatsApp sends it, then try again.",
            "action": "allow_list",
        }
    if code == DISPLAY_NAME_UNAPPROVED_CODE:
        return {
            "title": "Your display name needs approving first",
            "detail": "Meta hasn't approved the name customers will see, and test numbers "
                      "can't send until it does.",
            "action": "display_name",
        }
    if code == PAYMENT_ISSUE_CODE:
        return {
            "title": "No working payment method",
            "detail": "Meta bills you directly for messages and couldn't charge this "
                      "account. Add or fix the payment method on your WhatsApp account.",
            "action": "billing",
        }
    if code in REENGAGEMENT_CODES:
        return {
            "title": "This person hasn't messaged you recently",
            "detail": "More than 24 hours have passed, so WhatsApp only allows an "
                      "approved template message to this number.",
            "action": "templates",
        }
    if code in AUTH_ERROR_CODES:
        return {
            "title": "Your WhatsApp connection expired",
            "detail": "Meta's permission for Kadai ran out. Reconnect to carry on — you "
                      "keep your number, chats and contacts.",
            "action": "reconnect",
        }
    return {"title": "WhatsApp couldn't send that message",
            "detail": str(err), "action": ""}


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
