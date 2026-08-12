"""Engine + session factory.

search_path is pinned to `<schema>,public` on every connection so the app
reads its own tables first while still seeing shared extensions in public."""
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.settings import settings

_connect_args: dict = {"options": f"-c search_path={settings.db.schema_name},public"}
if not settings.db.uses_unix_socket:
    # connect_timeout is a TCP-only libpq option.
    _connect_args["connect_timeout"] = settings.db.connect_timeout

engine = create_engine(
    settings.db.url,
    pool_pre_ping=True,                  # survive dropped connections to a remote PG
    pool_size=settings.db.pool_size,
    max_overflow=settings.db.max_overflow,
    pool_recycle=settings.db.pool_recycle_seconds,
    connect_args=_connect_args,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    """FastAPI dependency — one session per request, always closed."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
