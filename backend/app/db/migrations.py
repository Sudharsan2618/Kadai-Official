"""Tiny idempotent migrations for the kadai schema.

`create_all()` adds new *tables* but never ALTERs existing ones, and the
persisted demo shop predates auth (owner_user_id NULL, no users row). This
backfills both so old data stays reachable. Safe to run on every startup.

On Cloud Run several instances can boot at once, so the whole run is wrapped
in a transaction-scoped advisory lock: the first instance migrates, the others
wait a moment and find nothing to do."""
import logging
from datetime import datetime, timedelta

from sqlalchemy import text

from app.core.security import hash_password
from app.db.session import SessionLocal, engine
from app.models import Shop, Subscription, User
from app.settings import settings

log = logging.getLogger(__name__)

# Arbitrary but fixed — identifies "the kadai schema migration" lock.
_MIGRATION_LOCK_ID = 4_2_0_0_1

# (table, column, DDL type + default). ADD COLUMN IF NOT EXISTS makes each
# line idempotent on its own, so re-running is free.
_COLUMNS: list[tuple[str, str, str]] = [
    ("users", "password_hash", "VARCHAR(255) DEFAULT ''"),
    # Layer 2 — WhatsApp Cloud API credentials + message correlation
    ("shops", "waba_id", "VARCHAR(40) DEFAULT ''"),
    ("shops", "phone_number_id", "VARCHAR(40) DEFAULT ''"),
    ("shops", "wa_access_token", "TEXT DEFAULT ''"),
    ("shops", "wa_token_expiry", "TIMESTAMP NULL"),
    ("shops", "wa_verified", "BOOLEAN DEFAULT FALSE"),
    ("shops", "wa_mm_terms_status", "VARCHAR(30) DEFAULT 'NOT_STARTED'"),
    ("shops", "wa_mm_terms_signed_at", "TIMESTAMP NULL"),
    ("shops", "wa_test_message_sent_at", "TIMESTAMP NULL"),
    # Send readiness + the number's own identity as Meta reports it
    ("shops", "wa_display_number", "VARCHAR(32) DEFAULT ''"),
    ("shops", "wa_payment_ready", "BOOLEAN DEFAULT FALSE"),
    ("shops", "wa_last_error_code", "INTEGER DEFAULT 0"),
    ("shops", "wa_name_status", "VARCHAR(30) DEFAULT ''"),
    ("shops", "wa_quality_rating", "VARCHAR(20) DEFAULT ''"),
    ("shops", "wa_verified_name", "VARCHAR(120) DEFAULT ''"),
    # Coexistence (K-02)
    ("shops", "wa_onboarding_path", "VARCHAR(20) DEFAULT 'fresh'"),
    ("shops", "wa_is_on_biz_app", "BOOLEAN DEFAULT FALSE"),
    ("shops", "wa_history_sync_status", "VARCHAR(20) DEFAULT 'none'"),
    ("shops", "wa_history_synced_at", "TIMESTAMP NULL"),
    ("shops", "wa_contacts_synced", "INTEGER DEFAULT 0"),
    ("shops", "wa_messages_synced", "INTEGER DEFAULT 0"),
    ("messages", "wamid", "VARCHAR(120) DEFAULT ''"),
]

_INDEXES: list[tuple[str, str, str]] = [
    ("ix_kadai_shops_phone_number_id", "shops", "phone_number_id"),
    ("ix_kadai_messages_wamid", "messages", "wamid"),
]


def _add_columns_and_indexes() -> None:
    schema = settings.db.schema_name
    with engine.begin() as conn:
        conn.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": _MIGRATION_LOCK_ID})
        for table, column, coldef in _COLUMNS:
            conn.execute(text(
                f'ALTER TABLE "{schema}".{table} ADD COLUMN IF NOT EXISTS {column} {coldef}'))
        for index, table, column in _INDEXES:
            conn.execute(text(
                f'CREATE INDEX IF NOT EXISTS {index} ON "{schema}".{table} ({column})'))


def _adopt_orphan_shops_and_backfill_subscriptions() -> None:
    """Shops created before auth have owner_user_id NULL and no users row; park
    them under the demo account so they stay reachable. Then make sure every
    shop has a subscription — access gating assumes one exists."""
    with SessionLocal() as db:
        orphans = db.query(Shop).filter(Shop.owner_user_id.is_(None)).all()
        if orphans:
            demo = db.query(User).filter(User.email == settings.app.demo_email).first()
            if not demo:
                demo = User(email=settings.app.demo_email, name="Murugan", provider="email",
                            password_hash=hash_password(settings.app.demo_password))
                db.add(demo)
                db.flush()
            for shop in orphans:
                shop.owner_user_id = demo.id
            log.info("adopted %d orphan shop(s) under the demo account", len(orphans))

        for shop in db.query(Shop).all():
            if not db.query(Subscription).filter(Subscription.shop_id == shop.id).first():
                db.add(Subscription(
                    shop_id=shop.id, plan_id=settings.billing.plan_id, status="active",
                    price_inr=settings.billing.plan_price_inr,
                    current_period_end=datetime.now() + timedelta(days=22)))
        db.commit()


def run() -> None:
    _add_columns_and_indexes()
    _adopt_orphan_shops_and_backfill_subscriptions()
    log.info("migrations up to date")
