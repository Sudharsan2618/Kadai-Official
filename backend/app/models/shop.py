from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, now


class Shop(Base):
    """The tenant. Every other row in the schema is scoped to a shop id.

    The wa_* block is the WhatsApp connection via the Baileys gateway: a seller
    links by scanning a QR, so there are no Meta credentials, tokens, templates
    or billing state to keep — just whether a number is linked and which one."""
    __tablename__ = "shops"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    owner_name: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str] = mapped_column(String(20), default="")
    business_type: Mapped[str] = mapped_column(String(60), default="fruits")
    language: Mapped[str] = mapped_column(String(8), default="en")

    # ── WhatsApp connection (Baileys) ────────────────────────────────────────
    wa_connected: Mapped[bool] = mapped_column(Boolean, default=False)
    # Local 10-digit form, used for matching and E.164 conversion.
    wa_number: Mapped[str] = mapped_column(String(20), default="")
    # The full number WhatsApp reports for the linked device, country code
    # included (wa_number drops it for local matching).
    wa_display_number: Mapped[str] = mapped_column(String(32), default="")
    # Gateway link lifecycle: '' | connecting | qr | linked | logged_out.
    wa_link_status: Mapped[str] = mapped_column(String(20), default="")

    onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
