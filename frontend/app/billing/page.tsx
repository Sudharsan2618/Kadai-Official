"use client"

import { useState, useEffect, useCallback } from "react"
import { Check, Zap, Receipt, ShieldCheck, CalendarClock, HelpCircle, ChevronDown } from "lucide-react"
import { Shell } from "@/components/shell"
import { cn, Card, CardHeader, Chip, rupees } from "@/components/ui"
import { SettingsSkeleton } from "@/components/skeletons"
import { get, post } from "@/lib/api"
import { toast, toastError } from "@/components/toaster"
import { useAuth } from "@/lib/auth"

declare global {
  interface Window { Razorpay?: any }
}

type Plan = { id: string; name: string; price_inr: number; amount_paise: number; currency: string; period_days: number; trial_days: number; razorpay_key_id: string }
type Sub = { status: string; active: boolean; price_inr?: number; current_period_end?: string | null; days_left?: number | null; cancel_at_period_end?: boolean }
type InvoicePage = { items: any[]; total: number; page: number; has_more: boolean; paid_count: number; paid_total_inr: number }

/* Payment attempt lifecycle as the seller should read it:
   paid = money received · pending = checkout still open (<1h)
   abandoned = popup closed without paying (harmless) · failed = bank declined */
const INVOICE_STATUS: Record<string, { label: string; tone: "green" | "amber" | "red" | "gray" }> = {
  paid: { label: "Paid", tone: "green" },
  created: { label: "Pending", tone: "amber" },
  abandoned: { label: "Not completed", tone: "gray" },
  failed: { label: "Failed", tone: "red" },
}

const STATUS_LABEL: Record<string, { label: string; tone: "green" | "amber" | "red" | "gray" }> = {
  active: { label: "Active", tone: "green" },
  trialing: { label: "Free trial", tone: "amber" },
  past_due: { label: "Payment due", tone: "red" },
  cancelled: { label: "Cancelled", tone: "gray" },
  none: { label: "No plan", tone: "gray" },
}

const FEATURES = [
  "Unlimited WhatsApp chats & broadcasts",
  "Orders, customers & catalog",
  "Ready messages & delivery tracking",
  "One business number, fully managed",
  "Meta-approved message templates",
  "Priority WhatsApp support",
]

function fmtDate(iso?: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

export default function BillingPage() {
  const { user } = useAuth()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [sub, setSub] = useState<Sub | null>(null)
  const [invoices, setInvoices] = useState<InvoicePage | null>(null)
  const [invFilter, setInvFilter] = useState<"" | "paid">("")
  const [invLoading, setInvLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)

  const loadInvoices = useCallback(async (page: number, filter: "" | "paid", append: boolean) => {
    setInvLoading(true)
    try {
      const raw = await get<InvoicePage | any[]>(`/billing/invoices?page=${page}&page_size=10&only=${filter}`)
      // tolerate the pre-pagination array shape (older backend still running)
      const inv: InvoicePage = Array.isArray(raw)
        ? { items: raw, total: raw.length, page: 1, has_more: false,
            paid_count: raw.filter((p) => p.status === "paid").length,
            paid_total_inr: raw.filter((p) => p.status === "paid").reduce((s, p) => s + (p.amount_inr || 0), 0) }
        : { ...raw, items: raw.items || [] }
      setInvoices((prev) => append && prev
        ? { ...inv, items: [...prev.items, ...inv.items] }
        : inv)
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't load payment history")
    } finally {
      setInvLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const status = await get<{ plan: Plan; subscription: Sub }>("/billing/status")
      setPlan(status.plan)
      setSub(status.subscription)
      loadInvoices(1, invFilter, false)
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't load billing")
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadInvoices])

  useEffect(() => { load() }, [load])

  const switchFilter = (f: "" | "paid") => {
    setInvFilter(f)
    loadInvoices(1, f, false)
  }

  const pay = async () => {
    if (!plan) return
    if (!window.Razorpay) {
      toastError("Payment library still loading — try again in a moment")
      return
    }
    setPaying(true)
    try {
      const order = await post<{ order_id: string; amount: number; currency: string; razorpay_key_id: string; plan_name: string }>("/billing/checkout")
      const rzp = new window.Razorpay({
        key: order.razorpay_key_id,
        amount: order.amount,
        currency: order.currency,
        name: "Kadai",
        description: order.plan_name,
        order_id: order.order_id,
        prefill: { name: user?.name || "", email: user?.email || "" },
        theme: { color: "#161616" },
        handler: async (resp: any) => {
          try {
            await post("/billing/verify", {
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            })
            toast("Payment successful — your plan is active")
            load()
          } catch (e) {
            toastError(e instanceof Error ? e.message : "Payment verification failed")
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      })
      rzp.on("payment.failed", () => toastError("Payment failed — please try again"))
      rzp.open()
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't start payment")
    } finally {
      setPaying(false)
    }
  }

  const cancel = async () => {
    if (!window.confirm("Cancel your plan? You'll keep access until the end of the paid period.")) return
    try {
      await post("/billing/cancel")
      toast("Plan will end at the end of this period")
      load()
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't cancel")
    }
  }

  if (loading || !plan) return <Shell title="Billing"><SettingsSkeleton /></Shell>

  const st = STATUS_LABEL[sub?.status || "none"] || STATUS_LABEL.none
  const trialing = sub?.status === "trialing"
  const daysLeft = typeof sub?.days_left === "number" ? sub.days_left : null
  const periodDays = trialing ? plan.trial_days : plan.period_days
  const pct = daysLeft !== null ? Math.max(0, Math.min(100, Math.round((daysLeft / periodDays) * 100))) : null

  return (
    <Shell title="Billing">
      <div className="p-4 md:p-8 max-w-[1040px] mx-auto grid lg:grid-cols-[1.4fr_1fr] gap-5 items-start">

        {/* ── Left: plan hero + features ── */}
        <div className="space-y-5">
          {/* Dark hero — the one plan, stated with confidence */}
          <div className="rounded-xl overflow-hidden border border-border shadow-sm"
               style={{ background: "linear-gradient(135deg, #161616 0%, #2a2a2a 100%)" }}>
            <div className="p-5 md:p-6 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-lg font-semibold tracking-tight">{plan.name}</h2>
                    <Chip tone={st.tone}>{st.label}</Chip>
                  </div>
                  <p className="text-sm text-white/60 mt-1">
                    Everything you need to run your shop on WhatsApp.
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-3xl font-semibold tracking-tight">{rupees(plan.price_inr)}</div>
                  <div className="text-xs text-white/50 mt-0.5">per month · incl. all features</div>
                </div>
              </div>

              {/* period progress */}
              {daysLeft !== null && (
                <div className="mt-5">
                  <div className="flex items-center justify-between text-xs text-white/60 mb-1.5">
                    <span>{trialing ? "Trial ends" : sub?.cancel_at_period_end ? "Access until" : "Renews"} {fmtDate(sub?.current_period_end)}</span>
                    <span className="font-medium text-white/80">{daysLeft} days left</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                         style={{ width: `${pct}%`, background: daysLeft <= 5 ? "#f1c21b" : "#24a148" }} />
                  </div>
                </div>
              )}

              <div className="mt-5 flex items-center gap-3 flex-wrap">
                <button
                  onClick={pay}
                  disabled={paying}
                  className="inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold px-4 h-9 bg-white text-[#161616] hover:bg-white/90 transition-colors disabled:opacity-50"
                >
                  <Zap size={15} />
                  {paying ? "Opening…" : sub?.active ? "Renew / extend a month" : "Subscribe now"}
                </button>
                {sub?.active && !sub?.cancel_at_period_end && sub?.status === "active" && (
                  <button onClick={cancel} className="text-sm text-white/60 hover:text-white transition-colors px-2 h-9">
                    Cancel plan
                  </button>
                )}
                {sub?.cancel_at_period_end && (
                  <span className="text-xs text-warning">Plan ends {fmtDate(sub.current_period_end)} — renew anytime to continue</span>
                )}
              </div>
            </div>

            <div className="px-5 md:px-6 py-3 bg-white/5 border-t border-white/10 flex items-center gap-5 text-xs text-white/50">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={14} /> Secured by Razorpay
              </span>
              <span>UPI · Cards · Netbanking</span>
            </div>
          </div>

          {trialing && (
            <div className="card p-4 bg-info-soft border-info-text/20 flex items-start gap-2.5">
              <Zap size={16} className="text-info-text mt-0.5 shrink-0" />
              <p className="text-sm text-info-text">
                You're on a free trial — <span className="font-semibold">{daysLeft} days left</span>.
                Subscribe anytime; your customers, chats and catalog carry over exactly as they are.
              </p>
            </div>
          )}

          {/* Everything included */}
          <Card>
            <CardHeader title="Everything included" />
            <ul className="px-4 md:px-5 pb-5 pt-1 grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <span className="w-4 h-4 rounded-full bg-success-soft flex items-center justify-center mt-0.5 shrink-0">
                    <Check size={11} className="text-success-text" />
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* ── Right: renewal summary + history + help ── */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Next payment" />
            <div className="px-4 md:px-5 pb-4 pt-0.5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <CalendarClock size={17} className="text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {rupees(plan.price_inr)} <span className="font-normal text-muted-foreground">on {fmtDate(sub?.current_period_end)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sub?.cancel_at_period_end
                      ? "No further payments — plan is set to end"
                      : "You pay manually — no auto-debit, no surprises"}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between px-4 md:px-5 pt-3 pb-2">
              <h3 className="text-sm font-semibold">Payment history</h3>
              <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
                {([["", "All"], ["paid", "Paid"]] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => switchFilter(val)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-md transition-colors",
                      invFilter === val ? "bg-white shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* lifetime summary — stays meaningful at 5 or 500 rows */}
            {invoices && invoices.paid_count > 0 && (
              <div className="mx-4 md:mx-5 mb-2 px-3 py-2 rounded-lg bg-success-soft flex items-center justify-between">
                <span className="text-xs text-success-text font-medium">Total paid</span>
                <span className="text-sm text-success-text font-semibold">
                  {rupees(invoices.paid_total_inr)} · {invoices.paid_count} payment{invoices.paid_count === 1 ? "" : "s"}
                </span>
              </div>
            )}

            {!invoices || invoices.items.length === 0 ? (
              <div className="px-4 md:px-5 pb-5 pt-1 text-sm text-muted-foreground flex items-center gap-2">
                <Receipt size={15} /> {invFilter === "paid" ? "No successful payments yet." : "No payments yet."}
              </div>
            ) : (
              <div>
                {invoices.items.map((p) => {
                  const st = INVOICE_STATUS[p.status] || INVOICE_STATUS.abandoned
                  const muted = p.status === "abandoned"
                  return (
                    <div key={p.id} className={cn("flex items-center gap-3 px-4 md:px-5 py-2.5 border-t border-border", muted && "opacity-60")}>
                      <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center shrink-0">
                        <Receipt size={14} className="text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{rupees(p.amount_inr)}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDate(p.created_at)}
                          {p.period_end && p.status === "paid" && ` · covers till ${fmtDate(p.period_end)}`}
                          {muted && " · checkout closed without paying"}
                        </p>
                      </div>
                      <Chip tone={st.tone}>{st.label}</Chip>
                    </div>
                  )
                })}
                {invoices.has_more && (
                  <button
                    onClick={() => loadInvoices(invoices.page + 1, invFilter, true)}
                    disabled={invLoading}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-border text-xs font-medium text-primary hover:bg-secondary/50 transition-colors disabled:opacity-50"
                  >
                    <ChevronDown size={13} />
                    {invLoading ? "Loading…" : `Show more (${invoices.total - invoices.items.length} older)`}
                  </button>
                )}
              </div>
            )}
          </Card>

          <div className="card p-4 flex items-start gap-2.5">
            <HelpCircle size={15} className="text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Questions about billing or GST invoices? Message us on WhatsApp at{" "}
              <span className="font-medium text-foreground">98430 00000</span> — we reply the same day.
            </p>
          </div>
        </div>
      </div>
    </Shell>
  )
}
