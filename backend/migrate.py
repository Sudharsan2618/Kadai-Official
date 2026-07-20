"""Tiny idempotent migrations for the kadai schema.

create_all() adds new *tables* (subscriptions, payments) but never ALTERs
existing ones, and the persisted demo shop predates auth (owner_user_id NULL,
no users row). This backfills both so old data stays reachable via the demo
login. Safe to run on every startup."""
from datetime import datetime, timedelta
from sqlalchemy import text
from db import engine, SessionLocal, Base
from models import User, Shop, Subscription
from auth import hash_password
from config import DB_SCHEMA, PLAN_ID, PLAN_PRICE_INR
from seed import DEMO_EMAIL, DEMO_PASSWORD


def _add_column_if_missing(conn, table: str, coldef: str, colname: str):
    exists = conn.execute(text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_schema = :s AND table_name = :t AND column_name = :c"
    ), {"s": DB_SCHEMA, "t": table, "c": colname}).first()
    if not exists:
        conn.execute(text(f'ALTER TABLE "{DB_SCHEMA}".{table} ADD COLUMN {coldef}'))


def run():
    # 1) new columns on pre-existing tables
    with engine.begin() as conn:
        _add_column_if_missing(conn, "users", "password_hash VARCHAR(255) DEFAULT ''", "password_hash")
        # Layer 2 — WhatsApp Cloud API credentials + message correlation
        _add_column_if_missing(conn, "shops", "waba_id VARCHAR(40) DEFAULT ''", "waba_id")
        _add_column_if_missing(conn, "shops", "phone_number_id VARCHAR(40) DEFAULT ''", "phone_number_id")
        _add_column_if_missing(conn, "shops", "wa_access_token TEXT DEFAULT ''", "wa_access_token")
        _add_column_if_missing(conn, "shops", "wa_token_expiry TIMESTAMP NULL", "wa_token_expiry")
        _add_column_if_missing(conn, "shops", "wa_verified BOOLEAN DEFAULT FALSE", "wa_verified")
        _add_column_if_missing(conn, "messages", "wamid VARCHAR(120) DEFAULT ''", "wamid")
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS ix_kadai_shops_phone_number_id ON "{DB_SCHEMA}".shops (phone_number_id)'))
        conn.execute(text(f'CREATE INDEX IF NOT EXISTS ix_kadai_messages_wamid ON "{DB_SCHEMA}".messages (wamid)'))

    # 2) adopt orphan shops (owner_user_id NULL) under the demo account + ensure
    #    every shop has a subscription
    with SessionLocal() as db:
        orphans = db.query(Shop).filter(Shop.owner_user_id.is_(None)).all()
        if orphans:
            demo = db.query(User).filter(User.email == DEMO_EMAIL).first()
            if not demo:
                demo = User(email=DEMO_EMAIL, name="Murugan", provider="email",
                            password_hash=hash_password(DEMO_PASSWORD))
                db.add(demo)
                db.flush()
            for shop in orphans:
                shop.owner_user_id = demo.id

        for shop in db.query(Shop).all():
            if not db.query(Subscription).filter(Subscription.shop_id == shop.id).first():
                db.add(Subscription(shop_id=shop.id, plan_id=PLAN_ID, status="active",
                                    price_inr=PLAN_PRICE_INR,
                                    current_period_end=datetime.now() + timedelta(days=22)))
        db.commit()
