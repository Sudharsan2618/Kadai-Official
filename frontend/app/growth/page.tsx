"use client"

/* /growth — getting more customers into the chat, and making the first
   message land well.
   Covers K-18/K-19 (catalog on WhatsApp, multi-product messages), K-24 (ice
   breakers and commands), K-25 (QR / wa.me links), K-26 (business profile),
   K-31/K-32/K-33 (Click-to-WhatsApp ads, welcome sequences, Conversions API)
   and K-38 (verified badge). See docs/PRODUCT-SCOPE-2026.md. */

import { useState } from "react"
import {
  QrCode, MessageSquarePlus, Megaphone, Store, BadgeCheck, Package,
  Download, Plus, X, Sparkles, ExternalLink,
} from "lucide-react"
import { Shell } from "@/components/shell"
import { Card, Chip, Button, Input, Field } from "@/components/ui"
import { PlatformPage, Section, Row, Stat, Toggle } from "@/components/platform"
import { toast } from "@/components/toaster"

const CATALOG = [
  { name: "Alphonso mangoes", price: 320, unit: "kg", synced: true, img: "🥭" },
  { name: "Nendran bananas", price: 60, unit: "dozen", synced: true, img: "🍌" },
  { name: "Country tomatoes", price: 40, unit: "kg", synced: true, img: "🍅" },
  { name: "Ooty carrots", price: 55, unit: "kg", synced: false, img: "🥕" },
  { name: "Coconut", price: 35, unit: "piece", synced: false, img: "🥥" },
]

export default function GrowthPage() {
  const [breakers, setBreakers] = useState([
    "What's fresh today?",
    "Place an order",
    "Delivery timings",
  ])
  const [draft, setDraft] = useState("")
  const [cartOn, setCartOn] = useState(true)

  const addBreaker = () => {
    const v = draft.trim()
    if (!v) return
    if (breakers.length >= 4) return toast("WhatsApp allows 4 at most")
    setBreakers([...breakers, v.slice(0, 80)])
    setDraft("")
  }

  return (
    <Shell title="Grow the shop">
      <PlatformPage
        issues="K-18, K-19, K-24 … K-26, K-31 … K-33, K-38"
        title="Turn visits into conversations"
        description="Make the shop easy to discover, give customers a one-tap start, and keep the catalog ready when they ask to order."
      >
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          <Stat label="New chats this week" value="27" sub="18 from the counter QR code" tone="good" />
          <Stat label="Catalog items live" value="3 of 5" sub="2 waiting to sync" tone="warn" />
          <Stat label="First-message replies" value="71%" sub="Since adding tap prompts" tone="good" />
        </div>

        {/* ── Shop profile ─────────────────────────────────────────────── */}
        <Section
          title="Shop profile"
          description="What a customer sees when they tap the shop name in WhatsApp. Worth ten minutes — it is the only shopfront most of them will see."
        >
          <Card className="px-4 py-4">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-2xl shrink-0">
                🍎
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">Murugan Fruits &amp; Vegetables</p>
                  <Chip tone="gray"><BadgeCheck size={11} /> Not verified</Chip>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Fresh fruits and vegetables, delivered across Gandhipuram every morning.
                  Open 6am–9pm.
                </p>
              </div>
              <Button variant="secondary">Edit</Button>
            </div>
          </Card>

          <Card className="mt-3 px-4 py-3.5 bg-secondary/40">
            <div className="flex items-start gap-2.5">
              <BadgeCheck size={16} className="text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">The green tick</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Sellers ask for this by name. It needs a verified business and enough
                  public presence for Meta to consider the shop notable — most single
                  shops will not qualify yet, and it is kinder to say so than to let them
                  wait on a rejection.
                </p>
              </div>
            </div>
          </Card>
        </Section>

        {/* ── Ice breakers ─────────────────────────────────────────────── */}
        <Section
          title="Tap-to-start prompts"
          description="Up to four buttons a customer sees the first time they open the chat. They tap instead of typing, which matters enormously for customers who type slowly."
        >
          <Card className="px-4 py-4">
            <div className="space-y-2">
              {breakers.map((b, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-sm">
                  <MessageSquarePlus size={14} className="text-muted-foreground shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{b}</span>
                  <button
                    onClick={() => setBreakers(breakers.filter((_, j) => j !== i))}
                    className="text-faint hover:text-destructive-text shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            {breakers.length < 4 && (
              <div className="flex gap-2 mt-3">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, 80))}
                  onKeyDown={(e) => e.key === "Enter" && addBreaker()}
                  placeholder="Add a prompt — up to 80 characters"
                />
                <Button variant="secondary" onClick={addBreaker}><Plus size={14} /> Add</Button>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground mt-2.5">
              {breakers.length} of 4 used · no emoji, Meta strips them
            </p>
          </Card>
        </Section>

        {/* ── QR / link ────────────────────────────────────────────────── */}
        <Section
          title="Counter QR code"
          description="Print it, stick it by the weighing scale. A customer scans and the chat opens with the first message already written."
        >
          <div className="grid sm:grid-cols-[160px_1fr] gap-4">
            <div className="rounded-xl border border-border bg-white p-4 flex flex-col items-center justify-center">
              <div className="w-24 h-24 rounded-lg bg-foreground/90 flex items-center justify-center">
                <QrCode size={56} className="text-white" />
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">Scan to order</p>
            </div>
            <div>
              <Field label="Message it pre-fills">
                <Input defaultValue="Hi! I'd like to order" />
              </Field>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Anyone who arrives this way has messaged first, which opens a free
                24-hour window — replies and order updates cost the seller nothing.
              </p>
              <div className="flex gap-2 mt-3 flex-wrap">
                <Button variant="secondary" className="gap-1.5" onClick={() => toast("Print sheet downloaded")}>
                  <Download size={13} /> Download print sheet
                </Button>
                <Button variant="ghost" className="gap-1.5" onClick={() => toast("Link copied")}>
                  <ExternalLink size={13} /> Copy link
                </Button>
              </div>
            </div>
          </div>
        </Section>

        {/* ── Catalog on WhatsApp ──────────────────────────────────────── */}
        <Section
          title="Catalog inside WhatsApp"
          description="Push Kadai's item list to Meta so customers can browse pictures and prices in the chat instead of reading a text list."
        >
          <Card>
            {CATALOG.map((p) => (
              <div key={p.name} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
                <span className="text-xl shrink-0">{p.img}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                    ₹{p.price} / {p.unit}
                  </p>
                </div>
                {p.synced
                  ? <Chip tone="green">On WhatsApp</Chip>
                  : <Button variant="secondary" onClick={() => toast(`${p.name} queued for sync`)}>Add</Button>}
              </div>
            ))}
          </Card>

          <Card className="mt-3 px-4 py-1">
            <Toggle
              on={cartOn}
              onChange={setCartOn}
              label="Let customers build a cart"
              hint="They pick several items and send one order. Up to 99 of each item, and no edits once sent."
            />
          </Card>

          <Card className="mt-3 px-4 py-3.5">
            <div className="flex items-start gap-2.5">
              <Package size={16} className="text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Send today&apos;s stock as a product list</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Instead of a text broadcast, send up to 30 items with photos and prices
                  that customers can tap straight into a cart. This is what the daily
                  stock message should become.
                </p>
                <Button variant="secondary" className="mt-2.5">Preview a stock list</Button>
              </div>
            </div>
          </Card>
        </Section>

        {/* ── Ads ──────────────────────────────────────────────────────── */}
        <Section
          title="Ads that open a chat"
          description="A Facebook or Instagram ad whose button opens WhatsApp instead of a website. The cheapest way to reach people beyond the seller's existing customers."
        >
          <Card className="px-4 py-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-2.5 min-w-0">
                <Megaphone size={17} className="text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Click-to-WhatsApp ads</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-lg">
                    Anyone who arrives from one of these and gets a reply within a day
                    opens a <span className="font-medium">72-hour free window</span> — the
                    seller can message them about anything, at no cost, for three days.
                  </p>
                </div>
              </div>
              <Chip tone="gray">Not running</Chip>
            </div>

            <div className="mt-4 pt-3.5 border-t border-border space-y-2.5">
              <div className="flex items-start gap-2.5">
                <Sparkles size={15} className="text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm">Welcome sequence</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    What someone sees the instant they arrive from the ad — a greeting, a
                    pre-written first message and a short list of common questions.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Store size={15} className="text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm">Sales tracking</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Reports orders back to Meta so the ad learns who actually buys, not
                    just who clicks. Needs the seller&apos;s permission during setup.
                  </p>
                </div>
              </div>
            </div>

            <Button className="mt-4">Set up a first ad</Button>
          </Card>
        </Section>

        {/* ── Slash commands ───────────────────────────────────────────── */}
        <Section
          title="Chat shortcuts"
          description="Typing a slash in the chat shows a menu of shortcuts. Useful for regulars who order the same thing every week."
        >
          <Card className="px-4 py-3">
            <Row label="/order" value={<span className="text-muted-foreground text-xs">Start a new order</span>} />
            <Row label="/stock" value={<span className="text-muted-foreground text-xs">See what is fresh today</span>} />
            <Row label="/bill" value={<span className="text-muted-foreground text-xs">Check what is pending</span>} />
          </Card>
          <Button variant="secondary" className="mt-3"><Plus size={13} /> Add a shortcut</Button>
        </Section>
      </PlatformPage>
    </Shell>
  )
}
