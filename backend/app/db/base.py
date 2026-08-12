"""The declarative base every model inherits from.

Lives on its own so `app.db.session` (which creates the engine) and the model
modules don't have to import each other."""
from datetime import datetime

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def now() -> datetime:
    """Default for created_at/updated_at columns. Naive local time, matching
    what every existing row in the kadai schema already stores."""
    return datetime.now()
