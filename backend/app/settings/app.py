"""Process-level settings: environment, HTTP surface, startup behaviour.

These are the knobs that differ between a laptop and Cloud Run."""
from pydantic import Field

from .base import SettingsGroup

DEV_ORIGINS = [
    "http://localhost:3010",
    "http://127.0.0.1:3010",
    "http://localhost:3000",
]


class AppSettings(SettingsGroup):
    name: str = Field(default="Kadai API", validation_alias="APP_NAME")
    version: str = Field(default="0.2.0", validation_alias="APP_VERSION")
    # local | staging | production — production turns off the docs and the seeder.
    env: str = Field(default="local", validation_alias="APP_ENV")
    # Cloud Run injects PORT; 8010 is what the frontend defaults to locally.
    port: int = Field(default=8010, validation_alias="PORT")
    log_level: str = Field(default="INFO", validation_alias="LOG_LEVEL")
    # Cloud Run collects stdout as structured entries when each line is JSON.
    json_logs: bool = Field(default=False, validation_alias="JSON_LOGS")

    # Comma-separated origins; the deployed frontend origin goes here.
    #
    # Kept as a plain `str` on purpose. pydantic-settings treats list/dict
    # fields as "complex" and runs json.loads() on the env value BEFORE any
    # validator, so a `list[str]` here would crash at import on a normal
    # comma-separated value ("https://app.example.com" is not JSON). Parsing
    # happens in the cors_origins property below instead.
    cors_origins_raw: str = Field(default=",".join(DEV_ORIGINS),
                                  validation_alias="CORS_ORIGINS")

    # Startup work. Migrations are idempotent and cheap, so they stay on by
    # default; seeding writes demo data and must be opted into.
    run_migrations: bool = Field(default=True, validation_alias="RUN_MIGRATIONS")
    seed_demo_data: bool = Field(default=False, validation_alias="SEED_DEMO_DATA")

    # Demo login the seeder creates and the migration adopts orphan shops under.
    demo_email: str = Field(default="demo@kadai.shop", validation_alias="DEMO_EMAIL")
    demo_password: str = Field(default="demo1234", validation_alias="DEMO_PASSWORD")

    frontend_url: str = Field(default="http://localhost:3010", validation_alias="FRONTEND_URL")

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.env.lower() in ("production", "prod")

    @property
    def docs_url(self) -> str | None:
        return None if self.is_production else "/docs"
