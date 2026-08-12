"""WhatsApp message templates: submit for approval, sync status, look up.

A ready message is ours; a template is Meta's approved copy of it. Broadcasts
and any send outside the 24h window must go through an approved template."""
import re
from datetime import datetime

from app.models import Customer, ReadyMessage, Shop, Template
from app.services.wa.cloud.client import graph, shop_token
from app.services.wa.errors import WaBlocked

PLACEHOLDER_RE = re.compile(r"\{(name|shop)\}")


def to_meta_body(body: str) -> tuple[str, list[str]]:
    """Convert our {name}/{shop} placeholders to Meta's positional {{1}},{{2}}.
    Returns (meta_body, ordered param names). Repeated placeholders reuse the
    same position — Meta requires each {{n}} appear once in the example."""
    params: list[str] = []

    def sub(m):
        key = m.group(1)
        if key not in params:
            params.append(key)
        return "{{%d}}" % (params.index(key) + 1)

    return PLACEHOLDER_RE.sub(sub, body), params


def param_values(params: list[str], cust: Customer, shop: Shop) -> list[str]:
    lookup = {"name": cust.name or "customer", "shop": shop.name or "our shop"}
    return [lookup.get(p, p) for p in params]


def approved_template(db, shop: Shop, ready_label: str) -> Template | None:
    return (db.query(Template)
            .join(ReadyMessage, Template.ready_message_id == ReadyMessage.id)
            .filter(Template.shop_id == shop.id, Template.status == "approved",
                    ReadyMessage.label == ready_label)
            .order_by(Template.updated_at.desc())
            .first())


def submit_template(db, shop: Shop, rm: ReadyMessage, category: str = "MARKETING",
                    language: str = "en") -> Template:
    """Submit one ready message to Meta for template approval (minutes–hours)."""
    token = shop_token(shop)
    if not shop.waba_id:
        raise WaBlocked("Connect WhatsApp first — templates live under your business account")

    meta_body, params = to_meta_body(rm.body)
    slug = re.sub(r"[^a-z0-9]+", "_", rm.label.lower()).strip("_")[:40] or "message"
    name = f"kadai_{shop.id}_{rm.id}_{slug}"

    components = [{"type": "BODY", "text": meta_body}]
    if params:
        # Meta requires example values for every positional param
        examples = [{"name": "Murugan", "shop": shop.name or "Kadai"}.get(p, p) for p in params]
        components[0]["example"] = {"body_text": [examples]}

    resp = graph("POST", f"/{shop.waba_id}/message_templates", token, {
        "name": name, "language": language, "category": category,
        "allow_category_change": True, "components": components})

    tpl = (db.query(Template).filter_by(shop_id=shop.id, ready_message_id=rm.id).first()
           or Template(shop_id=shop.id, ready_message_id=rm.id))
    tpl.name = name
    tpl.language = language
    tpl.category = category
    tpl.body = meta_body
    tpl.params = params
    tpl.status = (resp.get("status") or "PENDING").lower()
    tpl.meta_template_id = str(resp.get("id", ""))
    tpl.rejected_reason = ""
    tpl.updated_at = datetime.now()
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return tpl


def sync_template_status(db, shop: Shop) -> int:
    """Pull current approval states from Meta; webhook updates also land via
    the webhook route, this is the manual 'refresh' path. Returns count updated."""
    token = shop_token(shop)
    if not shop.waba_id:
        return 0
    data = graph("GET", f"/{shop.waba_id}/message_templates", token,
                 query={"fields": "id,name,status,rejected_reason", "limit": "200"}).get("data", [])
    by_name = {t["name"]: t for t in data}
    updated = 0
    for tpl in db.query(Template).filter_by(shop_id=shop.id).all():
        m = by_name.get(tpl.name)
        if not m:
            continue
        new_status = (m.get("status") or "").lower()
        if new_status and new_status != tpl.status:
            tpl.status = new_status
            tpl.rejected_reason = m.get("rejected_reason") or ""
            tpl.updated_at = datetime.now()
            updated += 1
    db.commit()
    return updated
