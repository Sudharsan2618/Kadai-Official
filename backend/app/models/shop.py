from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, now


class Shop(Base):
    """The tenant. Every other row in the schema is scoped to a shop id.

    The wa_* block is the WhatsApp Cloud API (Layer 2) side: per-tenant Meta
    credentials, all empty in mock mode."""
    __tablename__ = "shops"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    owner_name: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str] = mapped_column(String(20), default="")
    business_type: Mapped[str] = mapped_column(String(60), default="fruits")
    language: Mapped[str] = mapped_column(String(8), default="en")

    # ── WhatsApp connection ─────────────────────────────────────────────────
    wa_connected: Mapped[bool] = mapped_column(Boolean, default=False)
    # Local 10-digit form, used for matching and E.164 conversion.
    wa_number: Mapped[str] = mapped_column(String(20), default="")
    # Exactly what Meta returns in display_phone_number, country code included.
    # Kept separately because wa_number drops it — a 555 test number is +1, not
    # +91, and rendering a hardcoded prefix over the top of it is a lie.
    wa_display_number: Mapped[str] = mapped_column(String(32), default="")
    waba_id: Mapped[str] = mapped_column(String(40), default="")
    phone_number_id: Mapped[str] = mapped_column(String(40), default="", index=True)  # webhooks key off this
    wa_access_token: Mapped[str] = mapped_column(Text, default="")  # Fernet-encrypted at rest
    wa_token_expiry: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    wa_verified: Mapped[bool] = mapped_column(Boolean, default=False)  # number registered + 2FA PIN set
    wa_mm_terms_status: Mapped[str] = mapped_column(String(30), default="NOT_STARTED")
    wa_mm_terms_signed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Set once the seller sends the onboarding proof-of-life message. This is
    # what makes "you're live" a fact rather than a claim.
    wa_test_message_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # ── Send readiness ──────────────────────────────────────────────────────
    # Meta exposes no API for "is a payment method attached", so we infer it:
    # error 131042 on a send proves it is missing, a successful send proves it
    # is there. Unknown until one of those happens.
    wa_payment_ready: Mapped[bool] = mapped_column(Boolean, default=False)
    wa_last_error_code: Mapped[int] = mapped_column(Integer, default=0)
    # From the phone number node. A 555 number cannot send until name_status is
    # APPROVED (error 131037), and quality drives throttling.
    wa_name_status: Mapped[str] = mapped_column(String(30), default="")
    wa_quality_rating: Mapped[str] = mapped_column(String(20), default="")
    wa_verified_name: Mapped[str] = mapped_column(String(120), default="")

    # ── Coexistence (Embedded Signup "keep the WhatsApp Business app", K-02) ─
    wa_onboarding_path: Mapped[str] = mapped_column(String(20), default="fresh")  # fresh | coexist
    wa_is_on_biz_app: Mapped[bool] = mapped_column(Boolean, default=False)  # number also lives in the Business app
    wa_history_sync_status: Mapped[str] = mapped_column(String(20), default="none")  # none|pending|done|failed|skipped
    wa_history_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    wa_contacts_synced: Mapped[int] = mapped_column(Integer, default=0)
    wa_messages_synced: Mapped[int] = mapped_column(Integer, default=0)

    onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
