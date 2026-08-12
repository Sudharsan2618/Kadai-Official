"""PostgreSQL connection settings.

Three ways to point at a database, checked in this order:
  1. DATABASE_URL              — full SQLAlchemy URL, wins over everything
  2. CLOUD_SQL_INSTANCE        — Cloud Run + Cloud SQL over the unix socket
                                 mounted at /cloudsql/<project:region:instance>
  3. DB_HOST/DB_PORT/...       — plain TCP (Render, Supabase, a local server)

All kadai tables live in their own schema (DB_SCHEMA), isolated from whatever
else shares the instance."""
from urllib.parse import quote_plus

from pydantic import Field

from .base import SettingsGroup


class DatabaseSettings(SettingsGroup):
    url_override: str = Field(default="", validation_alias="DATABASE_URL")
    cloud_sql_instance: str = Field(default="", validation_alias="CLOUD_SQL_INSTANCE")

    host: str = Field(default="", validation_alias="DB_HOST")
    port: str = Field(default="5432", validation_alias="DB_PORT")
    name: str = Field(default="", validation_alias="DB_NAME")
    user: str = Field(default="", validation_alias="DB_USER")
    password: str = Field(default="", validation_alias="DB_PASSWORD")
    schema_name: str = Field(default="kadai", validation_alias="DB_SCHEMA")
    sslmode: str = Field(default="require", validation_alias="DB_SSLMODE")

    pool_size: int = Field(default=5, validation_alias="DB_POOL_SIZE")
    max_overflow: int = Field(default=5, validation_alias="DB_MAX_OVERFLOW")
    # Cloud SQL closes idle connections; recycling below that keeps the pool warm.
    pool_recycle_seconds: int = Field(default=1800, validation_alias="DB_POOL_RECYCLE")
    connect_timeout: int = Field(default=30, validation_alias="DB_CONNECT_TIMEOUT")

    @property
    def url(self) -> str:
        if self.url_override:
            return self.url_override
        user = quote_plus(self.user)
        password = quote_plus(self.password)
        if self.cloud_sql_instance:
            # Unix socket — no host/port, no TLS (the proxy handles it).
            socket_dir = f"/cloudsql/{self.cloud_sql_instance}"
            return (f"postgresql+psycopg2://{user}:{password}@/{self.name}"
                    f"?host={socket_dir}")
        return (f"postgresql+psycopg2://{user}:{password}"
                f"@{self.host}:{self.port}/{self.name}?sslmode={self.sslmode}")

    @property
    def uses_unix_socket(self) -> bool:
        return bool(self.cloud_sql_instance) and not self.url_override
