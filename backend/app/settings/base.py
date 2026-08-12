"""Shared base for every settings group.

One `.env` file, one convention: each field declares the exact environment
variable it reads via `validation_alias`, so the env names stay the same as
they always were while the Python attributes get short, grouped names
(`settings.wa.mode` instead of a flat `WA_MODE`).

Unknown keys are ignored — the same `.env` feeds the backend, the frontend
(NEXT_PUBLIC_*) and the scripts/ helpers, and no group should choke on
variables that belong to another."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class SettingsGroup(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )
