from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, now


class User(Base):
    """Auth-ready from day one: Google/Facebook OAuth plugs in here later.

    provider: 'google' | 'facebook' | 'email' | 'phone' (OTP) — provider_sub is
    the provider's stable subject id."""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), default="", index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    avatar_url: Mapped[str] = mapped_column(String(500), default="")
    provider: Mapped[str] = mapped_column(String(20), default="phone")
    provider_sub: Mapped[str] = mapped_column(String(255), default="", index=True)
    # pbkdf2 hash for email/password signups; empty for OAuth-only users.
    password_hash: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
