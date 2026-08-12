"""Phone number formatting — the one place the app's storage format and
Meta's wire format are reconciled.

The app stores bare local numbers (10 digits in India); Meta speaks E.164
without the '+' (919843000001). Neither side should have to know about the
other anywhere else."""
import re

from app.settings import settings

LOCAL_DIGITS = 10


def to_e164(phone: str) -> str:
    """Local → what Meta expects in a `to` field."""
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) == LOCAL_DIGITS:
        return settings.wa.default_country_code + digits
    return digits


def to_local(wa_id: str) -> str:
    """Meta's wa_id → the bare number the app matches and displays on."""
    digits = re.sub(r"\D", "", wa_id or "")
    return digits[-LOCAL_DIGITS:] if len(digits) >= LOCAL_DIGITS else digits
