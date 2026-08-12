"""Schema creation — the two operations that must run before anything queries."""
import logging

from sqlalchemy import text

from app.db.base import Base
from app.db.session import engine
from app.settings import settings

log = logging.getLogger(__name__)


def ensure_schema() -> None:
    with engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{settings.db.schema_name}"'))


def create_all() -> None:
    """Create our tables in the kadai schema.

    A shared instance may own tables in `public` with names we also use (e.g.
    `users`). With search_path=kadai,public, create_all's existence check finds
    public.users and skips creating kadai.users. Pinning search_path to kadai
    for this one operation makes the check schema-local, so every kadai table
    is created in kadai regardless of what public holds."""
    with engine.connect() as conn:
        conn.exec_driver_sql(f"SET search_path TO {settings.db.schema_name}")
        # Importing the package registers every model on Base.metadata.
        import app.models  # noqa: F401
        Base.metadata.create_all(conn)
        conn.commit()
    log.info("schema ready (%s)", settings.db.schema_name)
