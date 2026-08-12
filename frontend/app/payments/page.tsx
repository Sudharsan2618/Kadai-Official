"use client"

/* /payments — collecting money inside the chat.
   Covers K-21 (India Payments: order_details message + Razorpay deep
   integration), K-22 (order_status template) and K-23 (Business Compliance
   API, which is a legal requirement for Indian sellers).
   See docs/PRODUCT-SCOPE-2026.md. */

import { useState } from "react"
import {
  Wallet, RefreshCcw, Smartphone, CheckCircle2, Clock3, XCircle, Scale,
} from "lucide-react"
import { Shell } from "@/components/shell"
import { Card, Chip, Button } from "@/components/ui"
import { PlatformPage, Section, Row, Stat, Toggle } from "@/components/platform"
import { toast } from "@/components/toaster"

const RECENT = [
  { customer: "Lakshmi R.", amount: 480, status: "paid", method: "UPI · GPay", when: "12 min ago" },
  { customer: "Senthil K.", amount: 1250, status: "paid", method: "UPI · PhonePe", when: "1 hr ago" },
  { customer: "Anitha M.", amount: 320, status: "pending", method: "Awaiting payment", when: "2 hr ago" },
  { customer: "Ravi S.", amount: 890, status: "paid", method: "Card", when: "Yesterday" },
  { customer: "Priya V.", amount: 150, status: "failed", method: "UPI timed out", when: "Yesterday" },
]

const STATUS = {
  paid: { tone: "green" as const, icon: CheckCircle2, label: "Paid" },
  pending: { tone: "amber" as const, icon: Clock3, label: "Pending" },
  failed: { tone: "red" as const, icon: XCircle, label: "Failed" },
}

export default function PaymentsPage() {
  const [cart, setCart] = useState(true)
  const [autoInvoice, setAutoInvoice] = useState(true)
  const [statusUpdates, setStatusUpdates] = useState(true)

  return (
    <Shell title="Payments on WhatsApp">
      <PlatformPage
        issues="K-21, K-22, K-23"
        title="Collect payment in the chat"
        description="Let customers pay from the order conversation, then keep payment status and reconciliation in one place."
      >
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          <Stat label="Collected this week" value="₹18,420" sub="Across 34 orders" tone="good" />
          <Stat label="Waiting on payment" value="₹1,970" sub="6 invoices sent" tone="warn" />
          <Stat label="Paid inside the chat" value="79%" sub="Rest paid on delivery" />
        </div>

        {/* ── Gateway ──────────────────────────────────────────────────── */}
        <Section
          title="Payment gateway"
          description="WhatsApp supports Razorpay, PayU, Billdesk and Zaakpay as deep integrations. Kadai already runs Razorpay, so this is the natural fit."
        >
          <Card className="px-4 py-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-info-soft flex items-center justify-center shrink-0">
                  <Wallet size={19} className="text-info-text" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">Razorpay</p>
                    <Chip tone="green">Connected</Chip>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-lg">
                    Deep integration, so customers can pay by UPI, card, netbanking or
                    wallet without leaving the chat — and refunds and payment status come
                    back through WhatsApp instead of us polling for them.
                  </p>
                </div>
              </div>
              <Button variant="secondary">Change</Button>
            </div>

            <div className="grid sm:grid-cols-4 gap-3 mt-4 pt-3.5 border-t border-border">
              {[
                ["UPI intent", true], ["Cards & netbanking", true],
                ["Refunds from WhatsApp", true], ["Status via webhook", true],
              ].map(([label, on]) => (
                <div key={label as string} className="flex items-center gap-1.5 text-xs">
                  <CheckCircle2 size={13} className="text-success-text shrink-0" />
                  <span>{label as string}</span>
                </div>
              ))}
            </div>
          </Card>

          <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
            The lighter alternative is UPI Intent mode, which works with any UPI-capable
            gateway but cannot do cards, netbanking, refunds or status callbacks. Not
            worth it while Razorpay is already in place.
          </p>
        </Section>

        {/* ── In-chat invoice preview ──────────────────────────────────── */}
        <Section
          title="How the customer sees it"
          description="An order becomes an invoice card in the chat. They tap Pay, choose any UPI app, and the order updates itself."
        >
          <div className="grid md:grid-cols-[280px_1fr] gap-4">
            {/* Phone mock */}
            <div className="rounded-xl border border-border bg-[#ECE5DD] p-3">
              <div className="rounded-lg bg-white shadow-sm overflow-hidden">
                <div className="px-3 py-2.5 border-b border-border">
                  <p className="text-[11px] text-muted-foreground">Murugan Fruits &amp; Vegetables</p>
                  <p className="text-sm font-semibold mt-0.5">Order #1042</p>
                </div>
                <div className="px-3 py-2.5 space-y-1.5">
                  {[["Apples · 2 kg", 320], ["Bananas · 1 dozen", 60], ["Tomatoes · 1 kg", 40]].map(([n, p]) => (
                    <div key={n as string} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{n as string}</span>
                      <span className="tabular-nums">₹{p as number}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold pt-1.5 border-t border-border">
                    <span>Total</span>
                    <span className="tabular-nums">₹420</span>
                  </div>
                </div>
                <button className="w-full py-2.5 text-sm font-medium text-white" style={{ background: "#25D366" }}>
                  Pay ₹420
                </button>
              </div>
              <div className="flex items-center justify-center gap-1.5 mt-2 text-[10px] text-muted-foreground">
                <Smartphone size={11} /> GPay · PhonePe · Paytm · any UPI app
              </div>
            </div>

            {/* Controls */}
            <Card className="px-4 py-1">
              <Toggle
                on={autoInvoice}
                onChange={setAutoInvoice}
                label="Send the invoice automatically"
                hint="As soon as an order is marked packed, the customer gets a payable card."
              />
              <Toggle
                on={statusUpdates}
                onChange={setStatusUpdates}
                label="Confirm payment in the chat"
                hint="A short receipt message once money lands, so nobody has to ask 'did it go through?'"
              />
              <Toggle
                on={cart}
                onChange={setCart}
                label="Let customers build a cart"
                hint="They pick items from the catalog themselves and send one order. Arrives in Orders like any other."
              />
            </Card>
          </div>
        </Section>

        {/* ── Recent ───────────────────────────────────────────────────── */}
        <Section
          title="Recent payments"
          description="Everything here arrives from WhatsApp automatically. No reconciliation, no screenshots of UPI receipts."
        >
          <Card>
            {RECENT.map((p, i) => {
              const s = STATUS[p.status as keyof typeof STATUS]
              const Icon = s.icon
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm">{p.customer}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.method} · {p.when}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm tabular-nums font-medium">₹{p.amount}</span>
                    <Chip tone={s.tone}><Icon size={11} /> {s.label}</Chip>
                  </div>
                </div>
              )
            })}
          </Card>
          <div className="mt-2.5 flex items-center gap-2">
            <Button variant="secondary" className="gap-1.5" onClick={() => toast("Refund flow opens here")}>
              <RefreshCcw size={13} /> Refund an order
            </Button>
            <span className="text-xs text-muted-foreground">Refunds go through WhatsApp, no gateway login needed</span>
          </div>
        </Section>

        {/* ── Compliance ───────────────────────────────────────────────── */}
        <Section
          title="Seller details on file"
          description="Indian law requires anyone selling online to publish contact and address details. Meta checks this, and selling features get blocked without it."
        >
          <Card className="px-4 py-3">
            <Row label="Legal business name" value="Murugan Fruits & Vegetables" />
            <Row label="Customer care number" value="+91 98430 21188" />
            <Row label="Customer care email" value="murugan.shop@gmail.com" />
            <Row label="Registered address" value="Gandhipuram, Coimbatore 641012" />
            <Row
              label="Grievance officer"
              value={<Chip tone="amber">Not set</Chip>}
              hint="Required once monthly order volume grows. Worth filling in now."
            />
          </Card>
          <div className="mt-2.5 flex items-start gap-2 text-xs text-muted-foreground">
            <Scale size={14} className="shrink-0 mt-px" />
            <p className="leading-relaxed">
              We submit these to Meta&apos;s compliance API on the seller&apos;s behalf.
              Missing details are the most common reason a catalog gets rejected in India.
            </p>
          </div>
          <Button variant="secondary" className="mt-3">Update details</Button>
        </Section>

        {/* ── Not yet ──────────────────────────────────────────────────── */}
        <Section
          title="Coming later"
          description="Scoped but deliberately after the basics work."
        >
          <Card className="px-4 py-3">
            <Row label="Payment links over SMS" value={<Chip tone="gray">Later</Chip>} hint="For customers not on WhatsApp" />
            <Row label="Part payments and deposits" value={<Chip tone="gray">Later</Chip>} />
            <Row label="Automatic payment reminders" value={<Chip tone="gray">Later</Chip>} hint="Uses the payment_reminder template already in the library" />
          </Card>
        </Section>
      </PlatformPage>
    </Shell>
  )
}
