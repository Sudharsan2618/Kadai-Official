"""ORM models, grouped by concern.

Importing this package registers every table on Base.metadata, so
`create_all()` sees all of them. Callers can keep using a single import site:

    from app.models import Shop, Customer, Message
"""
from app.db.base import Base, now
from app.models.billing import Payment, Subscription
from app.models.commerce import ORDER_STATUSES, Customer, Order, Product
from app.models.messaging import (Broadcast, BroadcastRecipient, Message,
                                  ReadyMessage, Template)
from app.models.shop import Shop
from app.models.user import User

__all__ = [
    "Base", "now",
    "User", "Shop",
    "Subscription", "Payment",
    "Customer", "Product", "Order", "ORDER_STATUSES",
    "Message", "ReadyMessage", "Template", "Broadcast", "BroadcastRecipient",
]
