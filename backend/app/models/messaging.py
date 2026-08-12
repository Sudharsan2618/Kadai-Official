from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, now


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
    wamid: Mapped[str] = mapped_column(String(120), default="", index=True)  # Meta id — maps webhook statuses back to us
    broadcast_id: Mapped[int | None] = mapped_column(ForeignKey("broadcasts.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)

    customer = relationship("Customer", back_populates="messages")


class ReadyMessage(Base):
    """A seller's saved message. {name} and {shop} placeholders allowed."""
    __tablename__ = "ready_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    label: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(Text)
    approved: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Template(Base):
    """A ready message submitted to Meta for WhatsApp template approval (cloud
    mode). Broadcasts / out-of-window sends must use an approved template.
    params is the ordered list of our placeholder names — {{1}} == params[0]."""
    __tablename__ = "templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    ready_message_id: Mapped[int | None] = mapped_column(
        ForeignKey("ready_messages.id"), nullable=True, index=True)
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
    status: Mapped[str] = mapped_column(String(20), default="sent")  # queued|sent|delivered|read|replied|failed

    broadcast = relationship("Broadcast", back_populates="recipients")
