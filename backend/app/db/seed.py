"""Demo data: a fruit shop one morning in week 2 of using the product.

Opt-in only (SEED_DEMO_DATA=true) and a no-op once any shop exists, so it can
never overwrite a real tenant. Sign in with settings.app.demo_email /
demo_password to explore it."""
import logging
from datetime import datetime, timedelta

from app.core.security import hash_password
from app.db.bootstrap import create_all, ensure_schema
from app.db.session import SessionLocal
from app.models import (Broadcast, BroadcastRecipient, Customer, Message, Order,
                        Product, ReadyMessage, Shop, Subscription, User)
from app.settings import settings

log = logging.getLogger(__name__)


def _today_at(h: int, m: int = 0) -> datetime:
    return datetime.now().replace(hour=h, minute=m, second=0, microsecond=0)


def seed() -> None:
    ensure_schema()
    create_all()
    with SessionLocal() as db:
        if db.query(Shop).first():
            return  # already seeded (or a real tenant is live)

        demo_user = User(email=settings.app.demo_email, name="Murugan", provider="email",
                         password_hash=hash_password(settings.app.demo_password))
        db.add(demo_user)
        db.flush()

        shop = Shop(owner_user_id=demo_user.id, name="Mango Anna Fruits",
                    owner_name="Murugan", phone="9843000001",
                    business_type="fruits", language="en", wa_connected=True,
                    wa_number="9843000001", onboarded=True)
        db.add(shop)
        db.flush()
        sid = shop.id

        db.add(Subscription(shop_id=sid, plan_id=settings.billing.plan_id, status="active",
                            price_inr=settings.billing.plan_price_inr,
                            current_period_end=datetime.now() + timedelta(days=22)))

        names = [
            ("Ravi Kumar", "T. Nagar", ["regular"]),
            ("Selvi Akka", "Anna Nagar", ["regular", "weekly box"]),
            ("Prakash", "Velachery", []),
            ("Meena", "Anna Nagar", ["regular"]),
            ("Arun", "Guindy", []),
            ("Lakshmi", "T. Nagar", ["weekly box"]),
            ("Suresh Anna", "Mylapore", ["regular"]),
            ("Divya", "Adyar", []),
            ("Karthik", "Velachery", ["new"]),
            ("Fatima", "Royapettah", ["regular"]),
            ("Ganesh", "Guindy", []),
            ("Priya", "Adyar", ["new"]),
        ]
        customers = []
        for i, (name, area, tags) in enumerate(names):
            c = Customer(shop_id=sid, name=name, phone=f"98430{10000 + i}", area=area, tags=tags,
                         created_at=datetime.now() - timedelta(days=30 - i))
            db.add(c)
            customers.append(c)
        db.flush()

        db.add_all([
            Product(shop_id=sid, name="Alphonso", unit="kg", price=280, in_stock=True),
            Product(shop_id=sid, name="Banganapalli", unit="kg", price=120, in_stock=True),
            Product(shop_id=sid, name="Imam Pasand", unit="kg", price=280, in_stock=True),
            Product(shop_id=sid, name="Neelam", unit="kg", price=90, in_stock=False),
            Product(shop_id=sid, name="Mixed box (5kg)", unit="box", price=700, in_stock=True),
            Product(shop_id=sid, name="Tender coconut", unit="piece", price=45, in_stock=True),
        ])

        db.add_all([
            ReadyMessage(shop_id=sid, label="Today's stock", sort_order=1,
                         body="Vanakkam {name}! Today at {shop}: Alphonso ₹280/kg, Banganapalli ₹120/kg, Mixed box ₹700. Fresh from farm — reply with your order before 11am for morning delivery."),
            ReadyMessage(shop_id=sid, label="Order confirmed", sort_order=2,
                         body="Thanks {name}! Your order is confirmed. We will message you when it is out for delivery."),
            ReadyMessage(shop_id=sid, label="Payment reminder", sort_order=3,
                         body="Hi {name}, gentle reminder — payment pending for your last order from {shop}. GPay/PhonePe: 9843000001."),
            ReadyMessage(shop_id=sid, label="Welcome", sort_order=4,
                         body="Vanakkam {name}! This is {shop}. Save this number for daily fresh fruit updates and orders."),
        ])

        # This morning's broadcast (sent 8:02 am)
        b = Broadcast(shop_id=sid, title="Morning stock update", status="done", created_at=_today_at(8, 2),
                      body="Vanakkam! Today: Alphonso ₹280/kg, Banganapalli ₹120/kg, Mixed box ₹700. Reply to order.")
        db.add(b)
        db.flush()
        for i, c in enumerate(customers):
            status = "read" if i % 2 == 0 else ("replied" if i % 5 == 0 else "delivered")
            db.add(BroadcastRecipient(broadcast_id=b.id, customer_id=c.id, status=status))
            db.add(Message(shop_id=sid, customer_id=c.id, direction="out", kind="broadcast", body=b.body,
                           ready_label="Today's stock", status="read", broadcast_id=b.id,
                           created_at=_today_at(8, 2)))

        # Conversations — 2 inside the 24h window, 1 outside
        convo = [
            (customers[0], [("in", "Anna 2kg alphonso irukka?", _today_at(9, 40))]),
            (customers[1], [("in", "Same as last week pls", _today_at(7, 55)),
                            ("out", "Sure akka! 3kg banganapalli confirm.", _today_at(8, 10)),
                            ("in", "Add 1 mixed box also", _today_at(10, 5))]),
            (customers[2], [("in", "Delivery to Anna Nagar possible?", datetime.now() - timedelta(hours=30))]),
            (customers[3], [("in", "Mixed box order pannunga", _today_at(8, 30)),
                            ("out", "Confirmed Meena! ₹700, evening delivery.", _today_at(8, 35))]),
        ]
        for cust, msgs in convo:
            for direction, body, at in msgs:
                db.add(Message(shop_id=sid, customer_id=cust.id, direction=direction, body=body,
                               status="read", created_at=at))

        # Today's orders
        orders = [
            (customers[1], [{"name": "Banganapalli", "qty": 3, "unit": "kg", "price": 120}], 360, "paid", _today_at(8, 12)),
            (customers[0], [{"name": "Alphonso", "qty": 2, "unit": "kg", "price": 280}], 560, "payment_due", _today_at(9, 50)),
            (customers[3], [{"name": "Mixed box (5kg)", "qty": 1, "unit": "box", "price": 700}], 700, "new", _today_at(8, 36)),
            (customers[4], [{"name": "Imam Pasand", "qty": 1, "unit": "kg", "price": 280}], 280, "packed", _today_at(9, 5)),
            (customers[5], [{"name": "Mixed box (5kg)", "qty": 1, "unit": "box", "price": 700},
                            {"name": "Tender coconut", "qty": 4, "unit": "piece", "price": 45}], 880, "paid", _today_at(10, 20)),
            (customers[6], [{"name": "Banganapalli", "qty": 5, "unit": "kg", "price": 120}], 600, "delivered", _today_at(7, 45)),
            (customers[9], [{"name": "Alphonso", "qty": 1, "unit": "kg", "price": 280}], 280, "new", _today_at(10, 48)),
        ]
        for cust, items, total, status, at in orders:
            db.add(Order(shop_id=sid, customer_id=cust.id, items=items, total=total, status=status, created_at=at))

        # A few older orders for customer history
        for cust, days, total in [(customers[1], 7, 360), (customers[1], 14, 480), (customers[0], 9, 560),
                                  (customers[6], 6, 600), (customers[5], 8, 700)]:
            db.add(Order(shop_id=sid, customer_id=cust.id, total=total, status="delivered",
                         items=[{"name": "Banganapalli", "qty": 3, "unit": "kg", "price": 120}],
                         created_at=datetime.now() - timedelta(days=days)))

        db.commit()
        log.info("seeded demo shop (%s)", settings.app.demo_email)


if __name__ == "__main__":
    seed()
    print(f"Seeded {settings.db.schema_name} schema")
