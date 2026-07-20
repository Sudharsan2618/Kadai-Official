from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db import ensure_schema, create_all_kadai
import routes_core
import routes_chats
import routes_commerce
import routes_auth
import routes_billing
import routes_webhook
import routes_wa
import seed as seeder

app = FastAPI(title="Kadai API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3010", "http://127.0.0.1:3010", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    import asyncio
    import wa_mock
    import events
    loop = asyncio.get_running_loop()
    wa_mock.set_loop(loop)   # lets sync routes schedule ticks thread-safely
    events.set_loop(loop)    # lets sync routes publish SSE thread-safely
    ensure_schema()
    create_all_kadai()
    seeder.seed()
    import migrate
    migrate.run()   # backfill auth columns + adopt pre-existing shops


@app.get("/health")
def health():
    return {"ok": True}


app.include_router(routes_auth.router)
app.include_router(routes_billing.router)
app.include_router(routes_core.router)
app.include_router(routes_chats.router)
app.include_router(routes_commerce.router)
app.include_router(routes_webhook.router)  # Meta-facing (signed, no JWT)
app.include_router(routes_wa.router)       # seller-facing WA management
