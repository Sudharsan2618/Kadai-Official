"""Application entrypoint: `uvicorn app.main:app`.

Startup order matters and is load-bearing:
  1. capture the event loop — sync routes need it to schedule background work
  2. ensure_schema + create_all — create_all only ADDS tables, never ALTERs
  3. migrations — a database created before the Layer 2 columns landed still
     lacks shops.waba_id et al., and step 4 selects every column in the model
  4. seed (opt-in) — demo data, skipped once any shop exists

On Cloud Run, keep this to ONE instance unless you move the SSE broker and
the paced-broadcast tasks out of process; see backend/README.md."""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.core import runtime
from app.core.logging import configure_logging
from app.settings import settings

log = logging.getLogger(__name__)


def _prepare_database() -> None:
    from app.db.bootstrap import create_all, ensure_schema

    ensure_schema()
    create_all()

    if settings.app.run_migrations:
        from app.db import migrations
        migrations.run()

    if settings.app.seed_demo_data:
        from app.db.seed import seed
        seed()


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    runtime.set_loop(asyncio.get_running_loop())
    log.info("starting kadai api %s", settings.startup_summary())
    # Blocking DB work — keep it off the loop so the health check can answer.
    await asyncio.to_thread(_prepare_database)
    yield
    log.info("shutting down")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app.name,
        version=settings.app.version,
        docs_url=settings.app.docs_url,
        redoc_url=None,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.app.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)
    return app


app = create_app()
