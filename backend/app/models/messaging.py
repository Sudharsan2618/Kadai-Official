from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
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
    wamid: Mapped[str] = mapped_column(String(120), default="", index=True)  # WhatsApp message id (dedupes inbound callbacks)
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
