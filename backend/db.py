from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from config import DATABASE_URL, DB_SCHEMA

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,           # survive dropped connections to remote PG
    pool_size=5,
    max_overflow=5,
    connect_args={"options": f"-c search_path={DB_SCHEMA},public", "connect_timeout": 30},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def ensure_schema():
    with engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{DB_SCHEMA}"'))


def create_all_kadai():
    """Create our tables in the kadai schema.

    The CRM owns tables in `public` with names we also use (e.g. `users`). With
    search_path=kadai,public, create_all's existence check finds public.users
    and skips creating kadai.users. Pinning search_path to kadai for this one
    operation makes the check schema-local, so every kadai table is created in
    kadai regardless of what public holds."""
    with engine.connect() as conn:
        conn.exec_driver_sql(f"SET search_path TO {DB_SCHEMA}")
        Base.metadata.create_all(conn)
        conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
