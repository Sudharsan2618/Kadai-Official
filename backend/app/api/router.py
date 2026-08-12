"""The API surface: every router, in one place.

Order matters only for readability — paths don't overlap. All of these mount
at the root to keep the URLs the frontend already calls unchanged."""
from fastapi import APIRouter

from app.api.routes import (auth, billing, broadcasts, chats, customers, dashboard,
                            health, meta_webhook, orders, products, ready_messages,
                            shop, whatsapp)

api_router = APIRouter()

# Public / unauthenticated
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(meta_webhook.router)   # Meta-facing (signature-checked, no JWT)

# Seller-facing (JWT → current_shop)
api_router.include_router(shop.router)
api_router.include_router(dashboard.router)
api_router.include_router(chats.router)
api_router.include_router(ready_messages.router)
api_router.include_router(customers.router)
api_router.include_router(products.router)
api_router.include_router(orders.router)
api_router.include_router(broadcasts.router)
api_router.include_router(billing.router)
api_router.include_router(whatsapp.router)
