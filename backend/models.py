from datetime import datetime
from sqlalchemy import String, Integer, Float, Boolean, DateTime, Text, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from db import Base


def now():
    return datetime.now()


class User(Base):
    """Auth-ready from day one: Google/Facebook OAuth plugs in here later.

    provider: 'google' | 'facebook' | 'phone' (OTP) — provider_sub is the
    provider's stable subject id. Unique per (provider, provider_sub)."""
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


class Shop(Base):
    __tablename__ = "shops"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    owner_name: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str] = mapped_column(String(20), default="")
    business_type: Mapped[str] = mapped_column(String(60), default="fruits")
    language: Mapped[str] = mapped_column(String(8), default="en")
    wa_connected: Mapped[bool] = mapped_column(Boolean, default=False)
    wa_number: Mapped[str] = mapped_column(String(20), default="")
    # WhatsApp Cloud API (Layer 2) — per-tenant Meta credentials. Empty in mock mode.
    waba_id: Mapped[str] = mapped_column(String(40), default="")
    phone_number_id: Mapped[str] = mapped_column(String(40), default="", index=True)  # webhooks key off this
    wa_access_token: Mapped[str] = mapped_column(Text, default="")  # Fernet-encrypted at rest
    wa_token_expiry: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    wa_verified: Mapped[bool] = mapped_column(Boolean, default=False)  # number registered + 2FA PIN set
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


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


class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(20))
    area: Mapped[str] = mapped_column(String(120), default="")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    messages = relationship("Message", back_populates="customer")
    orders = relationship("Order", back_populates="customer")


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    unit: Mapped[str] = mapped_column(String(20), default="kg")
    price: Mapped[float] = mapped_column(Float, default=0)
    in_stock: Mapped[bool] = mapped_column(Boolean, default=True)


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    items: Mapped[list] = mapped_column(JSON, default=list)  # [{name, qty, unit, price}]
    total: Mapped[float] = mapped_column(Float, default=0)
    # new -> packed -> payment_due -> paid -> delivered  (cancelled anytime)
    status: Mapped[str] = mapped_column(String(20), default="new")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    customer = relationship("Customer", back_populates="orders")


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True)
    direction: Mapped[str] = mapped_column(String(10))  # in | out
    kind: Mapped[str] = mapped_column(String(20), default="text")  # text | ready | broadcast
    body: Mapped[str] = mapped_column(Text, default="")
    ready_label: Mapped[str] = mapped_column(String(120), default="")
    status: Mapped[str] = mapped_column(String(20), default="sent")  # sent|delivered|read|failed
    wamid: Mapped[str] = mapped_column(String(120), default="", index=True)  # Meta message id — maps webhook statuses back to us
    broadcast_id: Mapped[int | None] = mapped_column(ForeignKey("broadcasts.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)

    customer = relationship("Customer", back_populates="messages")


class ReadyMessage(Base):
    __tablename__ = "ready_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    label: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)  # {name} and {shop} placeholders allowed
    approved: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Template(Base):
    """A ready message submitted to Meta for WhatsApp template approval (cloud
    mode). Broadcasts / out-of-window sends must use an approved template.
    params is the ordered list of our placeholder names — {{1}} == params[0]."""
    __tablename__ = "templates"
    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    ready_message_id: Mapped[int | None] = mapped_column(ForeignKey("ready_messages.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(160))          # Meta template name (snake_case, unique per WABA)
    language: Mapped[str] = mapped_column(String(8), default="en")
    category: Mapped[str] = mapped_column(String(20), default="MARKETING")  # MARKETING|UTILITY|AUTHENTICATION
    body: Mapped[str] = mapped_column(Text, default="")     # Meta format with {{1}} positional params
    params: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|approved|rejected|paused
    meta_template_id: Mapped[str] = mapped_column(String(80), default="")
    rejected_reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Broadcast(Base):
    __tablename__ = "broadcasts"
    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    title: Mapped[str] = mapped_column(String(160), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="sending")  # sending|done
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    recipients = relationship("BroadcastRecipient", back_populates="broadcast")


class BroadcastRecipient(Base):
    __tablename__ = "broadcast_recipients"
    id: Mapped[int] = mapped_column(primary_key=True)
    broadcast_id: Mapped[int] = mapped_column(ForeignKey("broadcasts.id"), index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    status: Mapped[str] = mapped_column(String(20), default="sent")  # sent|delivered|read|replied

    broadcast = relationship("Broadcast", back_populates="recipients")
