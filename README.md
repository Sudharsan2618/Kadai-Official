# Kadai

WhatsApp shop tool for small sellers in Tamil Nadu. A seller connects their
WhatsApp number, and Kadai gives them broadcasting, order taking, a customer
list and a catalog on top of it.

Kadai is an approved **Meta Tech Provider**, so sellers onboard through Meta's
Embedded Signup and own their own WhatsApp assets.

## Repo layout

```
backend/     FastAPI + SQLAlchemy + PostgreSQL   → backend/README.md
frontend/    Next.js App Router + Tailwind
docs/        product scope, Meta capability research, setup guides
scripts/     standalone smoke tests (no app dependencies)
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

`WA_MODE=mock` (the default) runs the whole product offline with a simulated
WhatsApp — no Meta credentials needed. `WA_MODE=cloud` switches the same code to
the real Meta Cloud API.

## Where to read next

| If you want | Read |
|---|---|
| What is actually built right now | `docs/STATE-OF-THE-CODEBASE.md` |
| Backend layout, deploy, database | `backend/README.md` |
| What we're building and in what order | `docs/PRODUCT-SCOPE-2026.md` |
| Everything Meta exposes to us | `docs/META-PLATFORM-CAPABILITIES.md` |
| How we compare to AiSensy, Interakt, Wati | `docs/COMPETITIVE-LANDSCAPE.md` |
| Getting Embedded Signup working | `docs/EMBEDDED-SIGNUP-V4-TODO.md` |
