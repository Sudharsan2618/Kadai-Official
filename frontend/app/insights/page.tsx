"use client"

/* /insights — delivery, cost and account health.
   Covers K-10 (messaging limits), K-11 (health webhooks), K-12 (per-user
   marketing limits / error 131049), K-14 (Marketing Messages API), K-15
   (template + pricing analytics), K-28 (free entry point) and K-35 (volume
   tiers). See docs/PRODUCT-SCOPE-2026.md. */

import { useState } from "react"
import {
  IndianRupee, ShieldCheck, AlertTriangle, Gauge, Sparkles, Info, Gift,
} from "lucide-react"
import { Shell } from "@/components/shell"
import { cn, Card, Chip, Button } from "@/components/ui"
import { PlatformPage, Section, Stat, Meter, Row, Bars } from "@/components/platform"

const DAYS = [
  { label: "Fri", value: 210 }, { label: "Sat", value: 340 }, { label: "Sun", value: 180 },
  { label: "Mon", value: 265 }, { label: "Tue", value: 298 }, { label: "Wed", value: 320 },
  { label: "Thu", value: 244 },
]

const TEMPLATE_PERF = [
  { name: "daily_stock_ta", cat: "Marketing", sent: 1840, delivered: 1792, read: 1102, clicked: 214, cost: 1953 },
  { name: "order_confirmation", cat: "Utility", sent: 412, delivered: 409, read: 388, clicked: 0, cost: 0 },
  { name: "delivery_update", cat: "Utility", sent: 297, delivered: 295, read: 271, clicked: 0, cost: 43 },
  { name: "weekend_offer", cat: "Marketing", sent: 620, delivered: 588, read: 301, clicked: 88, cost: 641 },
]

export default function InsightsPage() {
  const [range, setRange] = useState<"7d" | "30d">("7d")

  const totalCost = TEMPLATE_PERF.reduce((s, t) => s + t.cost, 0)

  return (
    <Shell title="Insights">
      <PlatformPage
        issues="K-10 … K-12, K-14, K-15, K-28, K-35"
        title="Know what to do next"
        description="A practical read on delivery, account health, and message cost. Fix the amber items before sending another broadcast."
      >
        {/* Range toggle */}
        <div className="flex items-center gap-1 mt-4">
          {(["7d", "30d"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-md transition-colors",
                range === r ? "bg-action text-white" : "text-muted-foreground hover:bg-secondary",
              )}
            >
              Last {r === "7d" ? "7 days" : "30 days"}
            </button>
          ))}
        </div>

        <div className="grid sm:grid-cols-4 gap-3 mt-3">
          <Stat label="Messages delivered" value="3,084" sub="98.4% of sent" tone="good" />
          <Stat label="Read" value="2,062" sub="66.9% read rate" />
          <Stat label="Meta charges" value={`₹${totalCost.toLocaleString("en-IN")}`} sub="Paid by the seller, at cost" />
          <Stat label="Free messages" value="1,140" sub="Inside the 24-hour window" tone="good" />
        </div>

        {/* ── Account health ───────────────────────────────────────────── */}
        <Section
          title="Account health"
          description="The numbers that decide whether Meta keeps delivering. Anything amber here needs attention before the next broadcast."
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <Card className="px-4 py-3.5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Quality rating</p>
                <Chip tone="green"><ShieldCheck size={11} /> Green</Chip>
              </div>
              <p className="text-sm mt-2 leading-relaxed text-muted-foreground">
                Healthy. Drops to yellow after a run of blocks or ignored messages,
                and red throttles sending.
              </p>
            </Card>

            <Card className="px-4 py-3.5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Daily send limit</p>
                <Chip tone="amber">182 / 250</Chip>
              </div>
              <div className="mt-2.5"><Meter value={182} max={250} tone="amber" /></div>
              <p className="text-xs mt-2 leading-relaxed text-muted-foreground">
                Unique people we can message outside an open chat, per 24 hours.
                <span className="text-warning-text"> Verify this seller&apos;s business to jump to 2,000.</span>
              </p>
            </Card>

            <Card className="px-4 py-3.5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Sending speed</p>
                <Chip tone="blue"><Gauge size={11} /> 20 / second</Chip>
              </div>
              <p className="text-sm mt-2 leading-relaxed text-muted-foreground">
                Capped because this number also runs the WhatsApp Business app.
                A 300-person broadcast takes about 15 seconds.
              </p>
            </Card>

            <Card className="px-4 py-3.5">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Not delivered — recipient limit</p>
                <Chip tone="amber">48</Chip>
              </div>
              <p className="text-sm mt-2 leading-relaxed text-muted-foreground">
                WhatsApp caps marketing messages per person based on how much they
                read. We hold these back for 24 hours rather than retrying — retrying
                sooner makes it worse.
              </p>
            </Card>
          </div>

          <Card className="mt-3 px-4 py-3 bg-warning-soft/50 border-warning/20">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-warning-text shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">One alert from Meta</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  <span className="font-mono">old_reminder</span> was paused for low read
                  rates. Nothing else is at risk.
                </p>
              </div>
            </div>
          </Card>
        </Section>

        {/* ── Delivery ─────────────────────────────────────────────────── */}
        <Section
          title="Delivery"
          description="Messages delivered per day. Saturdays spike because that is when the daily-stock broadcast goes out to everyone."
        >
          <Card className="px-4 py-4">
            <Bars data={DAYS} />
          </Card>
        </Section>

        {/* ── Template performance ─────────────────────────────────────── */}
        <Section
          title="What each message earned"
          description="Read and click data only exists for 7 days after sending, so we snapshot it daily. Utility messages inside an open chat cost nothing."
        >
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left font-normal px-4 py-2.5">Template</th>
                  <th className="text-right font-normal px-3 py-2.5">Sent</th>
                  <th className="text-right font-normal px-3 py-2.5">Read</th>
                  <th className="text-right font-normal px-3 py-2.5">Clicked</th>
                  <th className="text-right font-normal px-4 py-2.5">Cost</th>
                </tr>
              </thead>
              <tbody>
                {TEMPLATE_PERF.map((t) => (
                  <tr key={t.name} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="font-mono text-xs">{t.name}</p>
                      <Chip tone={t.cat === "Marketing" ? "blue" : "gray"} className="mt-1">{t.cat}</Chip>
                    </td>
                    <td className="text-right px-3 py-2.5 tabular-nums">{t.sent.toLocaleString("en-IN")}</td>
                    <td className="text-right px-3 py-2.5 tabular-nums">
                      {Math.round((t.read / t.sent) * 100)}%
                    </td>
                    <td className="text-right px-3 py-2.5 tabular-nums text-muted-foreground">
                      {t.clicked ? t.clicked : "—"}
                    </td>
                    <td className="text-right px-4 py-2.5 tabular-nums">
                      {t.cost ? `₹${t.cost.toLocaleString("en-IN")}` : <span className="text-success-text">Free</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
            <span className="font-mono">order_confirmation</span> costs nothing because it
            goes out while the customer&apos;s chat is still open. Shifting more utility
            messages inside that window is the cheapest saving available to any seller.
          </p>
        </Section>

        {/* ── Marketing Messages API ───────────────────────────────────── */}
        <Section
          title="Optimised marketing delivery"
          description="Meta's Marketing Messages API routes broadcasts through delivery optimisation instead of plain Cloud API."
        >
          <Card className="px-4 py-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-2.5 min-w-0">
                <Sparkles size={17} className="text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Marketing Messages API</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-lg">
                    In Meta&apos;s own test on Indian advertisers, this delivered up to 9%
                    more marketing messages than standard sending. It also unlocks
                    animated headers, a delivery expiry so stale offers stop chasing
                    people, and click-through numbers we cannot otherwise see.
                  </p>
                </div>
              </div>
              <Chip tone="amber">Not enabled</Chip>
            </div>

            <div className="grid sm:grid-cols-3 gap-3 mt-4 pt-3.5 border-t border-border">
              <div>
                <p className="text-[11px] text-muted-foreground">Estimated extra delivered</p>
                <p className="text-sm font-medium mt-0.5 tabular-nums text-success-text">+166 / week</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Delivery expiry</p>
                <p className="text-sm font-medium mt-0.5">12 hours – 30 days</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Max price per message</p>
                <p className="text-sm font-medium mt-0.5">Available 2026</p>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <Button>Turn on optimised delivery</Button>
              <span className="text-xs text-muted-foreground">
                Needs the Marketing Messages terms accepted once, in the Meta dashboard
              </span>
            </div>
          </Card>
        </Section>

        {/* ── Cost ─────────────────────────────────────────────────────── */}
        <Section
          title="What the seller pays Meta"
          description="Kadai never marks these up. This is Meta's rate, billed to the seller's own card, shown here so nothing is a surprise."
        >
          <Card className="px-4 py-3">
            <Row
              label="Marketing messages"
              hint="Charged on every delivery, outside or inside an open chat"
              value={<span className="tabular-nums">2,380 · ₹2,594</span>}
            />
            <Row
              label="Utility messages"
              hint="Free while the customer's chat is open"
              value={<span className="tabular-nums">709 · ₹43</span>}
            />
            <Row
              label="Replies and conversations"
              hint="Always free"
              value={<span className="text-success-text">₹0</span>}
            />
            <Row
              label="Volume tier progress"
              hint="Utility rates drop as monthly volume rises. Resets on the 1st."
              value={<span className="tabular-nums text-muted-foreground">709 / 10,000</span>}
            />
          </Card>

          <Card className="mt-3 px-4 py-3.5 bg-secondary/40">
            <div className="flex items-start gap-2.5">
              <IndianRupee size={16} className="text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Why this page shows raw cost</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Most WhatsApp tools resell messages at a markup — around ₹1.09 per
                  marketing message against Meta&apos;s lower list rate. We are a Tech
                  Provider, so Meta bills the seller directly and we cannot mark up even
                  if we wanted to. Showing the real number is the honest version of a
                  constraint, and worth saying out loud in sales.
                </p>
              </div>
            </div>
          </Card>
        </Section>

        {/* ── Free entry point ─────────────────────────────────────────── */}
        <Section
          title="Free messaging windows"
          description="When someone reaches the shop through a Click-to-WhatsApp ad and the seller replies within a day, everything is free for the next 72 hours."
        >
          <Card className="px-4 py-3.5">
            <div className="flex items-start gap-2.5">
              <Gift size={17} className="text-success-text shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium">No free windows open yet</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  These only start from Click-to-WhatsApp ads, which this seller is not
                  running. It is the cheapest messaging on the platform — three days of
                  anything at all, at no cost — and a strong reason to try one small ad.
                </p>
                <Button variant="secondary" className="mt-2.5">See how ads work</Button>
              </div>
            </div>
          </Card>
        </Section>

        <div className="flex items-start gap-2 text-xs text-muted-foreground py-4">
          <Info size={14} className="shrink-0 mt-px" />
          <p className="leading-relaxed">
            Meta&apos;s figures are approximate and can differ slightly from the final
            invoice. Read and click counts are only kept by Meta for 7 days, so anything
            older here comes from our own daily snapshot.
          </p>
        </div>
      </PlatformPage>
    </Shell>
  )
}
