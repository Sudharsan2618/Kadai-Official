# Competitive Landscape — Indian WhatsApp Business Platform

> Scraped 2026-08-06 from live pricing and feature pages (`.firecrawl/comp/`,
> `.firecrawl/*.md`). Prices are list prices as published, excluding Meta's
> per-message charges unless stated.

---

## 1. The field

| Player | Partner type | Entry price | Positioning |
|---|---|---|---|
| **AiSensy** | Solution Partner | **₹0 free-forever**, then ₹1,500/mo | Volume SMB play, India-first, aggressive free tier |
| **Interakt** (Jio Haptik) | Solution Partner | ~$69/quarter (~₹1,900/mo) | D2C / Shopify e-commerce |
| **Wati** | Solution Partner | ~₹2,300+/mo | SMB shared-inbox, global |
| **DoubleTick** | Reseller | ~₹3,000+/mo | Sales-team-centric, mobile-first |
| **Gupshup** | Solution Partner (large) | Usage-based | Enterprise / CPaaS |
| **Zoko** | Solution Partner | ~$34.99+/mo | Shopify commerce |
| **LimeChat / BusinessOnBot** | Solution Partner | Enterprise | AI-led D2C growth |
| **360dialog** | Solution Partner | ~€49/mo | Pure API reseller, no UI |
| **Twilio / Infobip** | Solution Partner | Usage-based | Developer/CPaaS, not SMB |
| **Kadai (us)** | **Tech Provider** | ₹1,500/mo | **Tamil Nadu neighbourhood shops** |

Note the pattern in column two. **Almost every serious Indian competitor is a
Solution Partner.** That is not an accident — it is how they absorb billing and
avoid asking a shopkeeper for a credit card.

---

## 2. AiSensy — the closest and most dangerous comparison

Their ₹1,500/month "Basic" tier is *exactly* our price point, so this is the
comparison a seller will actually make.

| Tier | Price/mo | Headline |
|---|---|---|
| Free Forever | ₹0 | Free WABA, free Blue Tick application, 1,000 Meta ad credits, ₹50 conversation credits, unlimited contacts, live chat dashboard — **but no broadcasting** |
| **Basic** | **₹1,500** | 40 msg/sec, 1 owner + 5 agents, broadcasting + retargeting, segmentation, Shopify/WooCommerce, template APIs |
| Pro | ₹3,200 | + scheduler, click tracking, campaign budget analytics, 100 tags, 10 segments, auto-retry |
| Premium | ₹9,100 | + 250 msg/sec, number masking, downloadable reports, template TTL, webhook |
| Unlimited | ₹45,000 | + 200 agents, 1,000 msg/sec, dedicated AM |

**Add-ons (revealing):** AI Chat Agent ₹3,500/mo, Chatbot Flows ₹2,500/mo,
extra agent seat ₹750/mo.

**Their per-message markup** (India): Marketing **₹1.09**, Utility **₹0.145**,
Authentication ₹0.145, Service free.

Three things to take from this:

1. **The free tier is a customer-acquisition weapon, not a product.** Broadcasting
   — the only thing our seller actually wants — is deliberately withheld. It is a
   funnel to ₹1,500.
2. **They mark up messages.** Being a Solution Partner lets them resell messaging
   at a spread. As a Tech Provider we *cannot* — Meta bills the seller directly.
   We have no message-margin business. Our revenue is subscription only.
3. **Chatbot flows and AI are sold separately** at ₹2,500–₹3,500/mo. That is where
   their real ARPU expansion lives.

---

## 3. Feature matrix — them vs us

Legend: ✅ shipped · 🟡 partial/mock · ❌ absent · **bold** = our opportunity

| Capability | AiSensy | Interakt | Wati | **Kadai today** | Priority for us |
|---|---|---|---|---|---|
| Embedded Signup onboarding | ✅ | ✅ | ✅ | 🟡 stub | **P0** |
| **Coexistence (keep WA Business app)** | ❌ | ❌ | ❌ | ❌ | **P0 — nobody has this** |
| Shared team inbox | ✅ | ✅ | ✅ | 🟡 single-user | P2 |
| Broadcast / campaigns | ✅ | ✅ | ✅ | ✅ | done |
| Campaign scheduler | Pro tier | ✅ | ✅ | ❌ | **P1** |
| Click tracking | Pro tier | ✅ | ✅ | ❌ | **P1** |
| Segmentation / tags | ✅ | ✅ | ✅ | 🟡 basic tags | P1 |
| Template management | ✅ | ✅ | ✅ | ✅ | done |
| **Template Library (instant utility)** | ❌ | ❌ | ❌ | ❌ | **P0 — easy win** |
| **MM API for WhatsApp** | ❌ | ❌ | ❌ | ❌ | **P1 — real edge** |
| Chatbot / flow builder | ₹2,500 add-on | ✅ | ✅ | ❌ | P2 |
| AI agent | ₹3,500 add-on | ✅ | ✅ | ❌ | P3 |
| WhatsApp Catalog | ✅ | ✅ | ✅ | 🟡 internal only | **P1** |
| **WhatsApp Payments (UPI in chat)** | ✅ | ✅ | 🟡 | ❌ | **P1** |
| Cart order webhook | ✅ | ✅ | 🟡 | ❌ | **P1** |
| CTWA ads manager | ✅ | ✅ | 🟡 | ❌ | P2 |
| Conversions API | ❌ | 🟡 | ❌ | ❌ | **P2 — edge** |
| Analytics / cost reporting | Pro+ | ✅ | ✅ | ❌ | **P1** |
| Opt-out handling (`user_preferences`) | 🟡 | 🟡 | 🟡 | ❌ | **P0** |
| Blue tick (OBA) assistance | ✅ | ✅ | ✅ | ❌ | P2 |
| **Tamil-language product UI** | ❌ | ❌ | ❌ | 🟡 scaffold | **P1 — nobody has this** |
| Credit line / no card needed | ✅ | ✅ | ✅ | ❌ | **P1 via MPS** |

---

## 4. Where we can actually win

Being honest: we are outgunned on breadth. Every competitor has more features,
more agents, more integrations. We win only by being *unreasonably good* at one
specific customer that none of them are built for.

**1. Coexistence is an unclaimed moat.**
Not one competitor in this table advertises WhatsApp Business app coexistence
onboarding. Meanwhile our exact customer — a shop owner who has run their business
from the WhatsApp Business app for five years — is terrified of losing their
number and their chat history. Coexistence removes that fear entirely *and*
Meta disables their broadcast lists at the same moment, creating the need we fill.
This is the single highest-leverage thing on the roadmap.

**2. Vernacular, shop-shaped UI.**
Every competitor ships a generic "campaign manager" in English aimed at a D2C
growth marketer. Our seller thinks in *today's stock*, *who owes money*,
*who ordered*. Kadai's existing Today/Chats/Orders/Catalog model is already
closer to that than any of them. Tamil UI finishes the job.

**3. MM API for WhatsApp.**
None of them are on it. It is the same schema as Cloud API, so adoption cost is
low, and Meta's own India A/B test showed up to 9% more delivered marketing
messages plus benchmarks, GIF headers, TTL and conversion metrics. Cheap edge,
measurable, defensible for a while.

**4. Template Library.**
Competitors make sellers write templates and wait for review. Meta ships
pre-approved, pre-categorised utility templates. A seller could be live in
minutes instead of hours. Almost free to implement.

**5. Price honesty.**
We cannot mark up messages, which sounds like a weakness. Reframed: **Kadai
charges ₹1,500 and you pay Meta cost price for messages.** AiSensy charges ₹1,500
*and* ₹1.09 per marketing message where Meta's own rate is lower. At 3,000
marketing messages a month that spread is real money to a shopkeeper. Make the
per-message cost visible in our UI — transparency is a feature competitors
structurally cannot copy.

---

## 5. Where we are structurally weak

Stating these plainly so they get decided, not discovered.

| Weakness | Impact | Mitigation |
|---|---|---|
| **No credit line** — seller must add a card | Highest drop-off risk in the funnel | Multi-Partner Solution with a Solution Partner |
| **10 sellers / 7 days** onboarding cap | Cannot scale acquisition | Complete Access Verification → 200/week |
| No message margin | Subscription-only revenue | Higher tiers; payments take-rate later |
| Single-user, no team inbox | Loses any shop with 2+ staff | P2 |
| No chatbot builder | Loses "automation" comparisons | Ice breakers + interactive lists cover 80% of the real need at 5% of the cost |
| No AI agent | Loses demos | P3; not what a vegetable seller needs |

---

## 6. Positioning statement this research supports

> **Kadai is the only WhatsApp shop tool that lets a Tamil Nadu seller keep the
> WhatsApp Business app they already use — same number, same chats — and adds the
> broadcasting, order-taking and payment collection that Meta just took away from
> them. Priced flat at ₹1,500/month, with Meta's message rates passed through at
> cost.**

Every clause in that sentence is a capability decision in
`PRODUCT-SCOPE-2026.md`.
