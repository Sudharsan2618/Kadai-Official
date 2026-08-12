"use client"

/* /templates — template management.
   Covers K-07 (Template Library — pre-approved utility templates, no review
   wait), K-08 (opt-out handling via the user_preferences webhook) and K-34
   (richer marketing formats). See docs/PRODUCT-SCOPE-2026.md. */

import { useState } from "react"
import {
  Plus, CheckCircle2, Clock3, AlertTriangle, Pause, Search,
  Zap, TrendingDown, BellOff,
} from "lucide-react"
import { Shell } from "@/components/shell"
import { cn, Card, Chip, Button, Input, Field, Textarea } from "@/components/ui"
import { PlatformPage, Section, Row, Stat } from "@/components/platform"
import { toast } from "@/components/toaster"

type Status = "approved" | "pending" | "rejected" | "paused"

const STATUS: Record<Status, { label: string; tone: "green" | "amber" | "red" | "gray"; icon: any }> = {
  approved: { label: "Approved", tone: "green", icon: CheckCircle2 },
  pending: { label: "In review", tone: "amber", icon: Clock3 },
  rejected: { label: "Rejected", tone: "red", icon: AlertTriangle },
  paused: { label: "Paused", tone: "gray", icon: Pause },
}

const LIBRARY = [
  {
    name: "order_confirmation",
    label: "Order confirmed",
    category: "UTILITY",
    body: "Hi {{1}}, we've got your order for {{2}}. Total ₹{{3}}. We'll message you when it's ready.",
    adopted: true,
  },
  {
    name: "delivery_update",
    label: "Out for delivery",
    category: "UTILITY",
    body: "{{1}}, your order is on the way and should reach you by {{2}}.",
    adopted: true,
  },
  {
    name: "payment_reminder",
    label: "Payment reminder",
    category: "UTILITY",
    body: "Hi {{1}}, a friendly reminder that ₹{{2}} is pending for your order on {{3}}.",
    adopted: false,
  },
  {
    name: "order_ready_pickup",
    label: "Ready for pickup",
    category: "UTILITY",
    body: "{{1}}, your order is packed and ready at {{2}}. See you soon!",
    adopted: false,
  },
  {
    name: "appointment_reminder",
    label: "Appointment reminder",
    category: "UTILITY",
    body: "Reminder: your appointment with {{1}} is on {{2}} at {{3}}.",
    adopted: false,
  },
  {
    name: "feedback_request",
    label: "Ask for feedback",
    category: "UTILITY",
    body: "Hi {{1}}, how was your order? Reply here — we read every message.",
    adopted: false,
  },
]

const MINE: { name: string; category: string; status: Status; lang: string; quality?: string; note?: string; sent?: number; read?: number }[] = [
  { name: "order_confirmation", category: "UTILITY", status: "approved", lang: "en", quality: "High", sent: 412, read: 388 },
  { name: "delivery_update", category: "UTILITY", status: "approved", lang: "en", quality: "High", sent: 297, read: 271 },
  { name: "daily_stock_ta", category: "MARKETING", status: "approved", lang: "ta", quality: "Medium", sent: 1840, read: 1102 },
  { name: "weekend_offer", category: "MARKETING", status: "pending", lang: "en", note: "Submitted 40 minutes ago" },
  { name: "festival_blast", category: "MARKETING", status: "rejected", lang: "ta", note: "Rejected: promotional content in a utility category. Resubmit as MARKETING." },
  { name: "old_reminder", category: "UTILITY", status: "paused", lang: "en", note: "Paused by Meta after low read rates. Edit the copy and resubmit." },
]

export default function TemplatesPage() {
  const [tab, setTab] = useState<"library" | "mine" | "compose">("library")
  const [q, setQ] = useState("")

  const filtered = LIBRARY.filter(
    (t) => !q || t.label.toLowerCase().includes(q.toLowerCase()) || t.name.includes(q.toLowerCase()),
  )

  return (
    <Shell title="Message templates">
      <PlatformPage
        issues="K-07, K-08, K-34"
        title="Send the right message"
        description="Start with a ready-to-send template, or create one only when the library does not fit the moment."
        action={<Button className="gap-1.5" onClick={() => setTab("compose")}><Plus size={14} /> New template</Button>}
      >
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          <Stat label="Approved and sendable" value="3" sub="Ready to use right now" tone="good" />
          <Stat label="Waiting on Meta" value="1" sub="Usually minutes to a few hours" tone="warn" />
          <Stat label="Opted out of marketing" value="14" sub="Suppressed automatically" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-5 border-b border-border">
          {([
            ["library", "Template library"],
            ["mine", "Our templates"],
            ["compose", "Write a new one"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
                tab === id
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Template Library ─────────────────────────────────────────── */}
        {tab === "library" && (
          <div className="pt-5">
            <Card className="px-4 py-3.5 mb-4 bg-success-soft/40 border-success/20">
              <div className="flex items-start gap-2.5">
                <Zap size={16} className="text-success-text shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">These skip the review queue</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Meta has already written and categorised these. Adopt one unchanged
                    and the seller can send it immediately — no waiting, no rejection
                    risk. Editing the wording sends it back through normal review, so
                    only do that when the default really does not fit.
                  </p>
                </div>
              </div>
            </Card>

            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search order updates, reminders, delivery…"
                className="pl-9"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {filtered.map((t) => (
                <Card key={t.name} className="px-4 py-3.5 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t.label}</p>
                      <p className="text-[11px] text-faint font-mono mt-0.5">{t.name}</p>
                    </div>
                    <Chip tone="blue">{t.category}</Chip>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed flex-1">
                    {t.body}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    {t.adopted ? (
                      <Chip tone="green">
                        <CheckCircle2 size={11} /> Added
                      </Chip>
                    ) : (
                      <Button variant="secondary" onClick={() => toast(`"${t.label}" added — ready to send`)}>
                        <Plus size={13} /> Add
                      </Button>
                    )}
                    <button className="text-xs text-primary hover:underline">Customise</button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ── Our templates ────────────────────────────────────────────── */}
        {tab === "mine" && (
          <div className="pt-5 space-y-2.5">
            {MINE.map((t) => {
              const s = STATUS[t.status]
              const Icon = s.icon
              return (
                <Card key={t.name} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium font-mono">{t.name}</p>
                        <Chip tone="gray">{t.category}</Chip>
                        <Chip tone="gray">{t.lang === "ta" ? "தமிழ்" : "English"}</Chip>
                      </div>
                      {t.note && (
                        <p className={cn(
                          "text-xs mt-1.5 leading-relaxed",
                          t.status === "rejected" ? "text-destructive-text" : "text-muted-foreground",
                        )}>
                          {t.note}
                        </p>
                      )}
                      {t.sent !== undefined && (
                        <p className="text-xs text-muted-foreground mt-1.5 tabular-nums">
                          {t.sent.toLocaleString("en-IN")} sent · {t.read?.toLocaleString("en-IN")} read
                          {" · "}
                          <span className={
                            (t.read! / t.sent) > 0.8 ? "text-success-text" : "text-warning-text"
                          }>
                            {Math.round((t.read! / t.sent) * 100)}% read
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {t.quality && (
                        <Chip tone={t.quality === "High" ? "green" : "amber"}>{t.quality} quality</Chip>
                      )}
                      <Chip tone={s.tone}>
                        <Icon size={11} /> {s.label}
                      </Chip>
                    </div>
                  </div>
                </Card>
              )
            })}

            <Card className="px-4 py-3.5 bg-secondary/40">
              <div className="flex items-start gap-2.5">
                <TrendingDown size={16} className="text-warning-text shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Why templates get paused</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Meta watches read rates and blocks. A template that people ignore gets
                    slowed down, then paused. The fix is almost always fewer sends to
                    better-chosen people, not different wording — which is why the
                    broadcast screen defaults to only the customers who actually engage.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ── Compose ──────────────────────────────────────────────────── */}
        {tab === "compose" && (
          <div className="pt-5">
            <Section
              title="Write a template"
              description="Only needed when nothing in the library fits. Meta reviews it, usually within a few hours."
            >
              <Card className="px-4 py-4 space-y-3.5">
                <Field label="Name">
                  <Input placeholder="weekend_offer" className="font-mono" />
                </Field>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Category">
                    <select className="w-full bg-secondary text-sm rounded-sm px-3 h-9 outline-none border border-transparent focus:border-primary">
                      <option>UTILITY — order and account updates</option>
                      <option>MARKETING — offers and announcements</option>
                      <option>AUTHENTICATION — one-time codes</option>
                    </select>
                  </Field>
                  <Field label="Language">
                    <select className="w-full bg-secondary text-sm rounded-sm px-3 h-9 outline-none border border-transparent focus:border-primary">
                      <option>English</option>
                      <option>தமிழ் (Tamil)</option>
                    </select>
                  </Field>
                </div>
                <Field label="Message">
                  <Textarea
                    rows={4}
                    defaultValue="Hi {{1}}, fresh stock arrived today at {{2}}. Reply ORDER to book yours."
                  />
                </Field>
                <div className="flex items-start gap-2 text-xs text-warning-text bg-warning-soft rounded-md px-3 py-2">
                  <AlertTriangle size={14} className="shrink-0 mt-px" />
                  <p className="leading-relaxed">
                    Pick the category honestly. Meta re-categorises promotional copy filed
                    as utility and the template gets rejected — that is what happened to{" "}
                    <span className="font-mono">festival_blast</span>.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={() => toast("Sent to Meta for review")}>Submit for review</Button>
                  <Button variant="ghost">Preview</Button>
                </div>
              </Card>
            </Section>
          </div>
        )}

        {/* ── Opt-outs ─────────────────────────────────────────────────── */}
        <Section
          title="Marketing opt-outs"
          description="When someone taps 'Stop offers' in WhatsApp, Meta tells us and we suppress marketing to them permanently. Order updates still go through."
        >
          <Card className="px-4 py-3">
            <Row
              label="Opted out of marketing"
              value={<span className="tabular-nums font-medium">14</span>}
              hint="Suppressed from every broadcast automatically"
            />
            <Row
              label="Resumed after opting out"
              value={<span className="tabular-nums">2</span>}
            />
            <Row
              label="Blocked us"
              value={<span className="tabular-nums text-destructive-text">3</span>}
              hint="Blocks pull down the quality rating — the strongest signal that broadcasts are too frequent"
            />
          </Card>
          <div className="mt-2.5 flex items-start gap-2 text-xs text-muted-foreground">
            <BellOff size={14} className="shrink-0 mt-px" />
            <p className="leading-relaxed">
              This is a legal obligation as well as a quality one. A seller cannot
              override it, and we do not expose a way to try.
            </p>
          </div>
        </Section>
      </PlatformPage>
    </Shell>
  )
}
