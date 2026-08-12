from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, now


class Subscription(Base):
    """One row per shop. status drives access gating across the app.

    trialing -> active (paid) -> past_due (period ended, unpaid) -> cancelled.
    current_period_end is when the paid/trial access runs out."""
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True, unique=True)
    plan_id: Mapped[str] = mapped_column(String(60), default="kadai_monthly")
    status: Mapped[str] = mapped_column(String(20), default="trialing")
    price_inr: Mapped[int] = mapped_column(Integer, default=1500)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Payment(Base):
    """A billing attempt / invoice line. Created when we open Razorpay checkout,
    marked paid on successful verification or webhook."""
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    plan_id: Mapped[str] = mapped_column(String(60), default="kadai_monthly")
    amount_inr: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    status: Mapped[str] = mapped_column(String(20), default="created")  # created|paid|failed
    razorpay_order_id: Mapped[str] = mapped_column(String(80), default="", index=True)
    razorpay_payment_id: Mapped[str] = mapped_column(String(80), default="")
    period_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
