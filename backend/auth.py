"""Auth primitives — zero third-party deps (stdlib hmac/hashlib/base64 only).

We mint our own HS256 session JWTs and hash passwords with PBKDF2. Google
OAuth (routes_auth) issues the same JWTs, so the rest of the app never has to
care how a user signed in — it just reads current_user from the token."""
import base64
import hashlib
import hmac
import json
import os
import time

from config import JWT_SECRET, JWT_TTL_DAYS


# ── Passwords (PBKDF2-HMAC-SHA256) ──────────────────────────────────────────
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return f"pbkdf2$120000${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(),
                                 bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, AttributeError):
        return False


# ── JWT (HS256) ─────────────────────────────────────────────────────────────
def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(seg: str) -> bytes:
    return base64.urlsafe_b64decode(seg + "=" * (-len(seg) % 4))


def create_token(user_id: int, extra: dict | None = None) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {"sub": str(user_id), "iat": now,
               "exp": now + JWT_TTL_DAYS * 86400, **(extra or {})}
    segments = [_b64url(json.dumps(header, separators=(",", ":")).encode()),
                _b64url(json.dumps(payload, separators=(",", ":")).encode())]
    signing_input = ".".join(segments).encode()
    sig = hmac.new(JWT_SECRET.encode(), signing_input, hashlib.sha256).digest()
    segments.append(_b64url(sig))
    return ".".join(segments)


def decode_token(token: str) -> dict | None:
    """Return the payload if the signature is valid and not expired, else None."""
    try:
        header_seg, payload_seg, sig_seg = token.split(".")
        signing_input = f"{header_seg}.{payload_seg}".encode()
        expected = hmac.new(JWT_SECRET.encode(), signing_input, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64url_decode(sig_seg)):
            return None
        payload = json.loads(_b64url_decode(payload_seg))
        if payload.get("exp", 0) < int(time.time()):
            return None
        return payload
    except (ValueError, KeyError, json.JSONDecodeError):
        return None
