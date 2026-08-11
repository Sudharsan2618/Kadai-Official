"use client"

import { useState, useEffect, useCallback, useMemo, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Megaphone, Check, ChevronLeft, ChevronRight, Users, FileText, CheckCheck, Pencil } from "lucide-react"
import { Shell } from "@/components/shell"
import { cn, Card, Chip, Button, Avatar, EmptyState, ErrorState, timeAgo } from "@/components/ui"
import { CardsGridSkeleton, WizardStepSkeleton } from "@/components/skeletons"
import { get, post, subscribeEvents } from "@/lib/api"
import { toast, toastError } from "@/components/toaster"
import posthog from "posthog-js"

const TAG_FILTERS = ["all", "regular", "weekly box", "new"]
const STEPS = ["Message", "Customers", "Send"]

function BroadcastInner() {
  const params = useSearchParams()
  const router = useRouter()
  const [creating, setCreating] = useState(params.get("new") === "1")
  const [broadcasts, setBroadcasts] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [refsLoading, setRefsLoading] = useState(true)
  const [shop, setShop] = useState<any | null>(null)

  // wizard state
  const [step, setStep] = useState(1)
  const [readyMessages, setReadyMessages] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [messageId, setMessageId] = useState<number | null>(null)
  const [tagFilter, setTagFilter] = useState("all")
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [sending, setSending] = useState(false)

  const [historyError, setHistoryError] = useState(false)
  const [resendingId, setResendingId] = useState<number | null>(null)

  const load = useCallback(() => {
    setHistoryError(false)
    get("/broadcasts")
      .then((r) => setBroadcasts(r.items ?? r))
      .catch(() => setHistoryError(true))
      .finally(() => setHistoryLoading(false))
  }, [])

  useEffect(() => {
    load()
    get("/shop").then(setShop).catch(() => {})
    get("/ready-messages").then(setReadyMessages).catch(() => {}).finally(() => setRefsLoading(false))
    get("/customers?page_size=200").then((r) => {
      const rows = r.items ?? r
      setCustomers(rows)
      setPicked(new Set(rows.map((x: any) => x.id)))
    }).catch(() => {})
    const unsub = subscribeEvents((e) => {
      if (e.type === "broadcast_progress") load()
    })
    return unsub
  }, [load])

  const chosenMessage = readyMessages.find((r) => r.id === messageId)
  const visibleCustomers = tagFilter === "all"
    ? customers
    : customers.filter((c) => (c.tags || []).includes(tagFilter))

  const previewName = useMemo(() => {
    const first = customers.find((c) => picked.has(c.id))
    return first?.name?.split(" ")[0] || "Ravi"
  }, [customers, picked])

  const previewBody = chosenMessage
    ? chosenMessage.body.replace(/\{name\}/g, previewName).replace(/\{shop\}/g, shop?.name || "your shop")
    : ""

  const togglePick = (id: number) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sendBroadcast = async () => {
    if (!messageId || picked.size === 0) return
    setSending(true)
    try {
      const r = await post("/broadcasts", { ready_message_id: messageId, customer_ids: [...picked] })
      posthog.capture("broadcast_sent", { recipient_count: r.recipients, audience_filter: tagFilter })
      toast(`Broadcast going out to ${r.recipients} customers`)
      setCreating(false)
      setStep(1)
      setMessageId(null)
      router.replace("/broadcast")
      load()
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Broadcast failed to start")
    } finally {
      setSending(false)
    }
  }

  const resendFailed = async (broadcastId: number) => {
    setResendingId(broadcastId)
    try {
      const r = await post(`/broadcasts/${broadcastId}/resend-failed`)
      posthog.capture("broadcast_resend_requested", { recipient_count: r.requeued })
      toast(r.requeued > 0 ? `Resending to ${r.requeued} customers` : "Nothing to resend")
      load()
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Resend failed")
    } finally {
      setResendingId(null)
    }
  }

  const exitWizard = () => {
    setCreating(false)
    setStep(1)
    router.replace("/broadcast")
  }

  const canNext = step === 1 ? !!messageId : step === 2 ? picked.size > 0 : true

  if (creating) {
    return (
      <Shell title="New broadcast">
        <div className="p-4 md:p-6 max-w-5xl mx-auto">
          {/* Stepper */}
          <div className="flex items-center mb-5">
            {STEPS.map((label, i) => {
              const n = i + 1
              const done = step > n
              const active = step === n
              return (
                <div key={label} className={cn("flex items-center", i > 0 && "flex-1")}>
                  {i > 0 && <div className={cn("h-px flex-1 mx-2", step > i ? "bg-success" : "bg-border")} />}
                  <button
                    onClick={() => done && setStep(n)}
                    disabled={!done}
                    className={cn("flex items-center gap-2", done && "cursor-pointer")}
                  >
                    <span className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors",
                      done ? "bg-success text-white" : active ? "bg-action text-white" : "bg-secondary text-muted-foreground",
                    )}>
                      {done ? <Check size={12} /> : n}
                    </span>
                    <span className={cn("text-sm hidden sm:block", active ? "font-semibold" : "text-muted-foreground")}>
                      {label}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
            {/* Left: step content */}
            <Card>
              {step === 1 && refsLoading && <WizardStepSkeleton />}
              {step === 1 && !refsLoading && (
                <div>
                  <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border">
                    <div>
                      <h2 className="text-sm font-semibold">What do you want to say?</h2>
                      <p className="text-xs text-muted-foreground">Pick one of your ready messages.</p>
                    </div>
                    <Link href="/settings" className="text-xs text-primary hover:underline shrink-0">
                      <Pencil size={11} className="inline mr-1" />Edit messages
                    </Link>
                  </div>
                  <div>
                    {readyMessages.map((rm) => {
                      const selected = messageId === rm.id
                      return (
                        <button
                          key={rm.id}
                          onClick={() => setMessageId(rm.id)}
                          className={cn(
                            "w-full flex items-start gap-3 text-left px-4 py-3 border-b border-border last:border-0 transition-colors",
                            selected ? "bg-info-soft/70" : "hover:bg-secondary/50",
                          )}
                        >
                          <span className={cn(
                            "mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                            selected ? "border-primary" : "border-input",
                          )}>
                            {selected && <span className="w-2 h-2 rounded-full bg-primary" />}
                          </span>
                          <span className="min-w-0">
                            <span className={cn("text-sm block", selected ? "font-semibold" : "font-medium")}>{rm.label}</span>
                            <span className="text-xs text-muted-foreground line-clamp-2">{rm.body}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <div className="px-4 pt-3 pb-2 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-semibold">Who should get it?</h2>
                        <p className="text-xs text-muted-foreground">{picked.size} of {customers.length} customers selected</p>
                      </div>
                      <button
                        className="text-xs text-primary hover:underline shrink-0"
                        onClick={() => setPicked(
                          visibleCustomers.every((c) => picked.has(c.id))
                            ? new Set([...picked].filter((id) => !visibleCustomers.some((c) => c.id === id)))
                            : new Set([...picked, ...visibleCustomers.map((c) => c.id)]),
                        )}
                      >
                        {visibleCustomers.every((c) => picked.has(c.id)) ? "Unselect all shown" : "Select all shown"}
                      </button>
                    </div>
                    <div className="flex gap-1.5 mt-2.5 flex-wrap">
                      {TAG_FILTERS.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => setTagFilter(tag)}
                          className={cn(
                            "text-xs px-2.5 py-1 rounded-full border transition-colors",
                            tagFilter === tag ? "bg-action text-white border-action" : "border-border text-muted-foreground hover:bg-secondary",
                          )}
                        >
                          {tag === "all" ? `Everyone (${customers.length})` : tag}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="max-h-[46vh] overflow-y-auto">
                    {visibleCustomers.map((c) => (
                      <label key={c.id} className="flex items-center gap-3 px-4 py-2 border-b border-border last:border-0 cursor-pointer hover:bg-secondary/40">
                        <input
                          type="checkbox"
                          checked={picked.has(c.id)}
                          onChange={() => togglePick(c.id)}
                          className="w-4 h-4 accent-[#0f62fe]"
                        />
                        <Avatar name={c.name} className="w-7 h-7" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground">{c.area}</p>
                        </div>
                        <div className="hidden sm:flex gap-1">
                          {(c.tags || []).map((t: string) => <Chip key={t} tone="gray">{t}</Chip>)}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {step === 3 && chosenMessage && (
                <div>
                  <div className="px-4 pt-3 pb-2 border-b border-border">
                    <h2 className="text-sm font-semibold">Ready to send</h2>
                    <p className="text-xs text-muted-foreground">Check the details — this goes out immediately.</p>
                  </div>
                  <div className="divide-y divide-border">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <FileText size={16} className="text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">Message</p>
                        <p className="text-sm font-medium">{chosenMessage.label}</p>
                      </div>
                      <button className="text-xs text-primary hover:underline" onClick={() => setStep(1)}>Change</button>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Users size={16} className="text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">Going to</p>
                        <p className="text-sm font-medium">{picked.size} customers</p>
                      </div>
                      <button className="text-xs text-primary hover:underline" onClick={() => setStep(2)}>Change</button>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-xs text-muted-foreground">
                        Each customer gets the message with their own name — like the preview.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Footer nav */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-secondary/30 rounded-b-lg">
                {step === 1 ? (
                  <Button variant="ghost" onClick={exitWizard}>Cancel</Button>
                ) : (
                  <Button variant="ghost" onClick={() => setStep(step - 1)}><ChevronLeft size={14} /> Back</Button>
                )}
                {step < 3 ? (
                  <Button disabled={!canNext} onClick={() => setStep(step + 1)}>
                    Next <ChevronRight size={14} />
                  </Button>
                ) : (
                  <Button disabled={sending || !canNext} onClick={sendBroadcast}>
                    <Megaphone size={14} /> {sending ? "Sending…" : `Send to ${picked.size} customers`}
                  </Button>
                )}
              </div>
            </Card>

            {/* Right: live preview */}
            <div className="lg:sticky lg:top-4 space-y-3">
              <Card className="overflow-hidden">
                <div className="px-4 pt-3 pb-2 border-b border-border">
                  <h3 className="text-sm font-semibold">Customer will see</h3>
                </div>
                <div className="bg-secondary/70 p-4 min-h-40">
                  {previewBody ? (
                    <div className="bg-white border border-border rounded-lg rounded-tl-none px-3 py-2 max-w-[260px] shadow-xs">
                      <p className="text-[11px] font-semibold text-success-text mb-0.5">{shop?.name || "Your shop"}</p>
                      <p className="text-sm whitespace-pre-wrap break-words">{previewBody}</p>
                      <p className="text-[10px] text-faint mt-1 flex items-center justify-end gap-1">
                        11:02 am <CheckCheck size={12} className="text-primary" />
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      Pick a message to see the preview
                    </p>
                  )}
                </div>
              </Card>
              <Card className="px-4 py-3 flex items-center gap-2.5">
                <Users size={15} className="text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Going to <span className="font-semibold text-foreground">{picked.size}</span> of {customers.length} customers
                  {tagFilter !== "all" && <> · filtered by <span className="font-medium">{tagFilter}</span></>}
                </p>
              </Card>
            </div>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell
      title="Broadcast"
      actions={<Button onClick={() => { setCreating(true); setStep(1) }}><Megaphone size={15} /> New broadcast</Button>}
    >
      <div className="p-4 md:p-6 max-w-[1440px] mx-auto">
        {historyLoading ? (
          <CardsGridSkeleton cards={6} gridClass="grid md:grid-cols-2 xl:grid-cols-3 gap-3" />
        ) : historyError ? (
          <ErrorState onRetry={load} />
        ) : broadcasts.length === 0 ? (
          <EmptyState
            icon={<Megaphone size={28} />}
            title="Send your first broadcast"
            hint="Tell all your customers today's stock and price in one go."
            action={<Button onClick={() => setCreating(true)}>New broadcast</Button>}
          />
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {broadcasts.map((b) => (
              <Card key={b.id} className="px-4 py-3 flex flex-col">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold flex-1 truncate">{b.title}</p>
                  {b.status === "sending" && <Chip tone="blue">Sending…</Chip>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(b.created_at)} · {b.recipients} customers</p>
                <p className="text-xs text-muted-foreground mt-2 line-clamp-2 flex-1">{b.body}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3 pt-2.5 border-t border-border flex-wrap">
                  <span>{b.delivered} delivered</span>
                  <span>{b.read} read</span>
                  <span className="font-semibold text-success-text">{b.replied} replied</span>
                  {b.failed > 0 && (
                    <span className="ml-auto flex items-center gap-2">
                      <Chip tone="red">{b.failed} failed</Chip>
                      <Button
                        variant="secondary"
                        className="h-6 px-2 text-xs"
                        disabled={resendingId === b.id}
                        onClick={() => resendFailed(b.id)}
                      >
                        {resendingId === b.id ? "Resending…" : "Resend"}
                      </Button>
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}

export default function BroadcastPage() {
  return (
    <Suspense>
      <BroadcastInner />
    </Suspense>
  )
}
