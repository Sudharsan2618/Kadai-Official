# Kadai

WhatsApp shop tool for small sellers in Tamil Nadu. A seller links their
WhatsApp number, and Kadai gives them broadcasting, order taking, a customer
list and a catalog on top of it.

WhatsApp runs on **Baileys** (WhatsApp Web): a seller links by scanning a QR —
the same way you link WhatsApp on a laptop. No Meta Business account, no
templates, no 24-hour window, nothing to pay. The Baileys socket lives in a
small Node gateway sidecar (`backend/wa-gateway`) that the Python backend drives
over HTTP.

## Repo layout

```
backend/              FastAPI + SQLAlchemy + PostgreSQL   → backend/README.md
backend/wa-gateway/   Node Baileys gateway sidecar        → backend/wa-gateway/README.md
frontend/             Next.js App Router + Tailwind
docs/                 product scope and notes (Meta-era docs marked superseded)
scripts/              standalone smoke tests (no app dependencies)
```

## Run it locally

Two processes. Backend first:

```bash
cd backend && cp .env.example .env && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8010
```

Then the frontend:

```bash
cd frontend && npm install && npm run dev
```

The frontend expects the API on **port 8010** (`NEXT_PUBLIC_API_URL`), which is
also what the backend's CORS allowlist assumes. Starting uvicorn on the default
8000 will fail CORS.

`WA_MODE=mock` runs the whole product offline with a simulated WhatsApp — no
gateway needed. `WA_MODE=baileys` (the default) switches the same code to the
real WhatsApp via the gateway sidecar; run it too (`backend/wa-gateway`) sharing
one `WA_GATEWAY_SECRET`, or bring everything up with `docker compose up --build`
from the repo root.

## Where to read next

| If you want | Read |
|---|---|
| Backend layout, deploy, database | `backend/README.md` |
| The WhatsApp (Baileys) gateway | `backend/wa-gateway/README.md` |
| What we're building and in what order | `docs/PRODUCT-SCOPE-2026.md` |
| How we compare to AiSensy, Interakt, Wati | `docs/COMPETITIVE-LANDSCAPE.md` |

> The `docs/META-*`, `docs/MM-API-SETUP.md`, `docs/EMBEDDED-SIGNUP-V4-TODO.md`
> and `docs/LAYER2-WHATSAPP-CLOUD-PLAN.md` files describe the old Meta Cloud API
> integration, which Baileys replaced. They are kept for history only and no
> longer describe how Kadai connects to WhatsApp.
