"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Megaphone, MessageCircle, ChevronRight, Check } from "lucide-react"
import { Shell } from "@/components/shell"
import { cn, Card, CardHeader, Chip, Button, Avatar, EmptyState, ErrorState, Dot, rupees, timeShort, windowLeft, ORDER_STATUS } from "@/components/ui"
import { TodaySkeleton } from "@/components/skeletons"
import { get, post, subscribeEvents } from "@/lib/api"
import { toast, toastError } from "@/components/toaster"

export default function TodayPage() {
  const router = useRouter()
  const [data, setData] = useState<any | null>(null)
  const [products, setProducts] = useState<any[]>([])
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(() => {
    setLoadError(false)
    get("/today").then(setData).catch(() => setLoadError(true))
    get("/products").then(setProducts).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const unsub = subscribeEvents(() => load())
    return unsub
  }, [load])

  const kpis = [
    { label: "Sales today", value: data ? rupees(data.sales_today) : "—" },
    { label: "Orders", value: data?.orders_today ?? "—" },
    { label: "To reply", value: data?.to_reply ?? "—", alert: (data?.to_reply ?? 0) > 0 },
    { label: "Customers reached", value: data?.reached_today ?? "—" },
  ]

  const b = data?.last_broadcast

  const actions = (
    <Button onClick={() => router.push("/broadcast?new=1")}>
      <Megaphone size={15} />
      <span className="hidden sm:inline">Send today's stock</span>
      <span className="sm:hidden">Broadcast</span>
    </Button>
  )

  if (!data) {
    return (
      <Shell title="Today" actions={actions}>
        {loadError ? <ErrorState onRetry={load} /> : <TodaySkeleton />}
      </Shell>
    )
  }

  const counts = data.counts || {}
  const firstRun = counts.customers === 0 || counts.products === 0 || counts.broadcasts === 0
  const checklist = [
    { done: counts.products > 0, label: "Add what you sell", href: "/catalog" },
    { done: counts.customers > 0, label: "Add your customers", href: "/customers" },
    { done: counts.broadcasts > 0, label: "Send your first broadcast", href: "/broadcast?new=1" },
  ]

  return (
    <Shell title="Today" actions={actions}>
      <div className="p-4 md:p-6 space-y-4 max-w-[1440px] mx-auto">
        {/* First-run getting-started checklist */}
        {firstRun && (
          <Card className="px-4 py-3">
            <p className="text-sm font-semibold mb-2">Get your shop selling</p>
            <div className="flex flex-col sm:flex-row gap-2">
              {checklist.map((step, i) => (
                <Link
                  key={step.label}
                  href={step.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm flex-1 transition-colors",
                    step.done
                      ? "border-border bg-secondary/50 text-muted-foreground"
                      : "border-border hover:bg-secondary",
                  )}
                >
                  <span className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0",
                    step.done ? "bg-success text-white" : "bg-secondary text-muted-foreground",
                  )}>
                    {step.done ? <Check size={11} /> : i + 1}
                  </span>
                  <span className={step.done ? "line-through" : "font-medium"}>{step.label}</span>
                  {!step.done && <ChevronRight size={14} className="ml-auto text-faint" />}
                </Link>
              ))}
            </div>
          </Card>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((k) => (
            <Card key={k.label} className="px-4 py-3 lg:px-5 lg:py-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-2xl lg:text-3xl font-normal mt-0.5 ${k.alert ? "text-destructive-text" : ""}`}>{k.value}</p>
            </Card>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 xl:grid-cols-[1.1fr_1.5fr_0.85fr] gap-3 items-start">
          {/* Needs reply */}
          <Card>
            <CardHeader
              title="Needs your reply"
              action={<Link href="/chats" className="text-xs text-primary hover:underline">Open chats</Link>}
            />
            {data && data.needs_reply.length === 0 ? (
              <EmptyState icon={<MessageCircle size={26} />} title="All caught up" hint="No customer is waiting on you right now." />
            ) : (
              <div>
                {(data?.needs_reply ?? []).map((c: any) => (
                  <Link
                    key={c.customer_id}
                    href={`/chats?c=${c.customer_id}`}
                    className="flex items-center gap-3 px-4 py-2.5 border-t border-border hover:bg-secondary/60 transition-colors"
                  >
                    <Avatar name={c.name} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.last_body}</p>
                    </div>
                    {c.window.open ? (
                      <Chip tone="green">{windowLeft(c.window.expires_at)}</Chip>
                    ) : (
                      <Chip tone="amber">Ready message</Chip>
                    )}
                    <ChevronRight size={15} className="text-faint shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Today's orders */}
          <Card>
            <CardHeader
              title="Today's orders"
              action={<Link href="/orders" className="text-xs text-primary hover:underline">View all</Link>}
            />
            {data && data.orders.length === 0 ? (
              <EmptyState
                title="No orders yet today"
                hint="Send a broadcast to bring orders in."
                action={<Button variant="secondary" onClick={() => router.push("/broadcast?new=1")}><Megaphone size={14} /> Send a broadcast</Button>}
              />
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {(data?.orders ?? []).map((o: any) => {
                    const st = ORDER_STATUS[o.status] || ORDER_STATUS.new
                    return (
                      <tr key={o.id} className="border-t border-border hover:bg-secondary/60 cursor-pointer" onClick={() => router.push("/orders")}>
                        <td className="px-4 py-2 font-medium whitespace-nowrap">{o.customer}</td>
                        <td className="px-2 py-2 text-muted-foreground text-xs hidden sm:table-cell">
                          {(o.items || []).map((i: any) => `${i.qty}${i.unit === "kg" ? "kg" : "×"} ${i.name}`).join(", ")}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">{rupees(o.total)}</td>
                        <td className="px-4 py-2 text-right"><Chip tone={st.tone}>{st.label}</Chip></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Card>

          {/* Stock today */}
          <Card className="lg:col-span-2 xl:col-span-1">
            <CardHeader
              title="Stock today"
              action={<Link href="/catalog" className="text-xs text-primary hover:underline">Edit catalog</Link>}
            />
            {products.length === 0 ? (
              <EmptyState title="No items yet" hint="Add what you sell in Catalog." />
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-1">
                {products.map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5 px-4 py-2 border-t border-border">
                    <Dot color={p.in_stock ? "var(--success)" : "var(--input)"} />
                    <span className={cn("text-sm flex-1 truncate", !p.in_stock && "text-faint line-through")}>{p.name}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{rupees(p.price)}/{p.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Last broadcast summary */}
        {b && (
          <Card className="px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Megaphone size={16} className="text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{b.title}</p>
              <p className="text-xs text-muted-foreground">
                Sent {timeShort(b.created_at)} to {b.recipients} customers
              </p>
            </div>
            <span className="flex-1" />
            <span className="text-xs text-muted-foreground">{b.delivered} delivered</span>
            <span className="text-xs text-muted-foreground">{b.read} read</span>
            <span className="text-xs font-semibold text-success-text">{b.replied} replied</span>
            {b.failed > 0 && <Chip tone="red">{b.failed} failed</Chip>}
            <Button variant="secondary" onClick={() => router.push("/broadcast?new=1")}>Send again</Button>
          </Card>
        )}
      </div>
    </Shell>
  )
}
