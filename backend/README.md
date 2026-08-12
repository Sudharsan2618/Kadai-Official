# Kadai API

FastAPI + SQLAlchemy + PostgreSQL. WhatsApp runs in one of two modes behind a
single dispatcher, so the same code serves the offline demo and production.

## Layout

```
app/
  main.py              entrypoint — create_app(), startup order, CORS
  settings/            configuration, split by concern
    app.py             env, port, CORS, logging, startup flags
    database.py        DATABASE_URL / Cloud SQL socket / DB_* parts
    auth.py            JWT + Google OAuth
    billing.py         Razorpay + the product plan
    whatsapp.py        WA_MODE, Meta credentials, send pacing
  core/                cross-cutting, no domain knowledge
    runtime.py         the event loop holder (one, shared)
    events.py          in-process SSE broker
    security.py        JWT mint/verify, PBKDF2 passwords
    crypto.py          Fernet encryption for per-shop Meta tokens
    logging.py         plain lines locally, JSON on Cloud Run
  db/
    session.py         engine + SessionLocal + get_db
    base.py            declarative Base
    bootstrap.py       ensure_schema + create_all
    migrations.py      idempotent ALTERs, advisory-locked
    seed.py            demo shop (opt-in)
  models/              one module per concern, all re-exported from __init__
    user, shop, billing, commerce, messaging
  services/            business logic — what routes call but shouldn't contain
    read_models.py     the shapes routes hand to the frontend
    accounts.py        new-account bootstrap
    billing/           razorpay client + subscription rules
    wa/                __init__ = the mode dispatcher
      mock.py          offline simulation
      inbound.py       webhook payload → our tables
      phones.py        local ⇄ E.164
      errors.py        WaError / WaBlocked (importable without cloud deps)
      cloud/           client · messaging · templates · signup
  api/
    deps.py            current_user → current_shop → active_shop
    router.py          every router, mounted at the root
    routes/            one module per resource
```

The rule of thumb: **routes** validate input and shape responses, **services**
decide, **models** store. A route that reaches for `urllib` or does arithmetic
on subscription dates belongs in a service.

## Run locally

```bash
cp .env.example .env   # fill in DB_* at minimum; WA_MODE=mock needs nothing else
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8010
```

Docs at `http://localhost:8010/docs` (off when `APP_ENV=production`).
Set `SEED_DEMO_DATA=true` once to get the demo shop, then sign in with
`DEMO_EMAIL` / `DEMO_PASSWORD`.

Run it in Docker the same way it runs in production:

```bash
docker build -t kadai-api . && docker run --rm -p 8080:8080 --env-file .env -e PORT=8080 kadai-api
```

## Deploy to Cloud Run

One-time setup:

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
gcloud artifacts repositories create kadai --repository-format=docker --location=asia-south1
```

Create the secrets the service reads (one per line, no trailing newline):

```bash
printf '%s' "$JWT_SECRET" | gcloud secrets create kadai-jwt-secret --data-file=-
```

…and likewise for `kadai-db-password`, `kadai-meta-app-secret`,
`kadai-wa-verify-token`, `kadai-wa-token-enc-key`,
`kadai-razorpay-key-secret`, `kadai-razorpay-webhook-secret`. Grant the
service account `roles/secretmanager.secretAccessor`.

Then, from `backend/`:

```bash
PROJECT_ID=my-project CORS_ORIGINS=https://app.example.com FRONTEND_URL=https://app.example.com DB_HOST=... ./deploy/deploy.sh
```

`deploy/cloudbuild.yaml` does the same thing from a GitHub trigger.

### Why the deploy flags are what they are

| Flag | Reason |
| --- | --- |
| `--no-cpu-throttling` | Broadcasts send **paced** over seconds-to-minutes and SSE sends keepalives — both run between requests. With default throttling Cloud Run freezes the container after each response and a broadcast stalls mid-send. |
| `--min-instances=1 --max-instances=1` | The SSE broker (`core/events.py`) and in-flight broadcast tasks are in-process. A second instance can't see the first one's subscribers. |
| `--session-affinity` | Keeps a browser's `/events` stream pinned to the instance that will publish to it, for when you do scale past one. |
| `--timeout=3600` | `/events` is a long-lived stream; the 5-minute default would cut it every few minutes. |
| `--workers 1` (Dockerfile) | Same in-process-state reason as max-instances. |

**To scale past one instance** the two pieces of in-process state have to move
out: publish SSE events through Pub/Sub or Redis, and run broadcasts from a
Cloud Tasks queue instead of `asyncio.create_task`. Until then, one instance is
a correctness requirement, not a cost decision.

### Database

Three ways to point at Postgres, checked in order:

1. `DATABASE_URL` — a full SQLAlchemy URL, wins over everything
2. `CLOUD_SQL_INSTANCE=project:region:instance` — Cloud Run's unix socket;
   pass `--add-cloudsql-instances` too (deploy.sh does)
3. `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` — plain TCP, which is
   what the current Render instance uses

All tables live in `DB_SCHEMA` (default `kadai`), isolated from anything else
on the instance.

### Startup

`RUN_MIGRATIONS=true` (default) runs the idempotent column/index migrations on
boot under a Postgres advisory lock, so concurrent boots don't race.
`SEED_DEMO_DATA` defaults to **false** — never turn it on against a database
with real tenants.

### After deploying

Point the Meta app's webhook at `https://<service-url>/wa/webhook` with
`WA_VERIFY_TOKEN` as the verify token, set the Razorpay webhook to
`https://<service-url>/billing/webhook`, and set the frontend's
`NEXT_PUBLIC_API_URL` to the service URL.
