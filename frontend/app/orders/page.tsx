"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ShoppingCart, X, MessageCircle } from "lucide-react"
import { Shell } from "@/components/shell"
import { cn, Card, Chip, Button, Avatar, EmptyState, ErrorState, rupees, timeAgo, ORDER_STATUS } from "@/components/ui"
import { TableSkeleton } from "@/components/skeletons"
import { get, patch } from "@/lib/api"
import { toast, toastError } from "@/components/toaster"
import posthog from "posthog-js"

const PAGE_SIZE = 50
const FILTERS = ["all", "new", "packed", "payment_due", "paid", "delivered"]
const NEXT_STEP: Record<string, { to: string; label: string }> = {
  new: { to: "packed", label: "Mark packed" },
  packed: { to: "payment_due", label: "Ask payment" },
  payment_due: { to: "paid", label: "Mark paid" },
  paid: { to: "delivered", label: "Mark delivered" },
}

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter, setFilter] = useState("all")
  const [selected, setSelected] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoadError(false)
    get(`/orders?page=1&page_size=${PAGE_SIZE}`)
      .then((r) => {
        setOrders(r.items)
        setTotal(r.total)
        setHasMore(r.has_more)
        setPage(1)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const r = await get(`/orders?page=${page + 1}&page_size=${PAGE_SIZE}`)
      setOrders((prev) => [...prev, ...r.items])
      setHasMore(r.has_more)
      setPage(page + 1)
    } catch {
      toastError("Couldn't load more orders")
    } finally {
      setLoadingMore(false)
    }
  }

  const setStatus = async (order: any, status: string) => {
    setSaving(true)
    try {
      await patch(`/orders/${order.id}`, { status })
      posthog.capture("order_status_updated", { previous_status: order.status, status })
      toast(`Order #${order.id} → ${(ORDER_STATUS[status] || { label: status }).label}`)
      await load()
      setSelected((s: any) => (s && s.id === order.id ? { ...s, status } : s))
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't update the order")
    } finally {
      setSaving(false)
    }
  }

  const visible = filter === "all" ? orders : orders.filter((o) => o.status === filter)

  return (
    <Shell title="Orders">
      <div className="p-4 md:p-6 max-w-[1440px] mx-auto">
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full border transition-colors capitalize",
                filter === f ? "bg-action text-white border-action" : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              {f === "all" ? `All (${total})` : ORDER_STATUS[f]?.label || f}
            </button>
          ))}
        </div>

        {loading ? (
          <TableSkeleton rows={7} />
        ) : loadError ? (
          <ErrorState onRetry={load} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart size={28} />}
            title="No orders here"
            hint="Orders start in your chats — confirm what a customer asks for."
            action={<Button variant="secondary" onClick={() => router.push("/chats")}><MessageCircle size={14} /> Open chats</Button>}
          />
        ) : (
          <>
            <Card>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left font-semibold px-4 py-2">Customer</th>
                    <th className="text-left font-semibold px-2 py-2 hidden sm:table-cell">Items</th>
                    <th className="text-left font-semibold px-2 py-2">Amount</th>
                    <th className="text-left font-semibold px-2 py-2 hidden md:table-cell">When</th>
                    <th className="text-right font-semibold px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((o) => {
                    const st = ORDER_STATUS[o.status] || ORDER_STATUS.new
                    return (
                      <tr
                        key={o.id}
                        onClick={() => setSelected(o)}
                        className="border-t border-border hover:bg-secondary/60 cursor-pointer"
                      >
                        <td className="px-4 py-2.5 font-medium whitespace-nowrap">{o.customer}</td>
                        <td className="px-2 py-2.5 text-xs text-muted-foreground hidden sm:table-cell">
                          {(o.items || []).map((i: any) => `${i.qty}${i.unit === "kg" ? "kg" : "×"} ${i.name}`).join(", ")}
                        </td>
                        <td className="px-2 py-2.5 whitespace-nowrap">{rupees(o.total)}</td>
                        <td className="px-2 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{timeAgo(o.created_at)}</td>
                        <td className="px-4 py-2.5 text-right"><Chip tone={st.tone}>{st.label}</Chip></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
            {hasMore && filter === "all" && (
              <div className="flex justify-center mt-3">
                <Button variant="secondary" disabled={loadingMore} onClick={loadMore}>
                  {loadingMore ? "Loading…" : `Load more (${orders.length} of ${total})`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Order drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setSelected(null)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-full sm:w-96 bg-white border-l border-border p-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Order #{selected.id}</h2>
              <button className="p-1 text-muted-foreground" onClick={() => setSelected(null)}><X size={18} /></button>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <Avatar name={selected.customer} />
              <div>
                <p className="text-sm font-medium">{selected.customer}</p>
                <p className="text-xs text-muted-foreground">{selected.phone}</p>
              </div>
              <span className="flex-1" />
              <Button variant="secondary" onClick={() => router.push(`/chats?c=${selected.customer_id}`)}>
                <MessageCircle size={14} /> Chat
              </Button>
            </div>

            <Card className="mb-4">
              {(selected.items || []).map((i: any, idx: number) => (
                <div key={idx} className="flex justify-between px-3 py-2 border-b border-border last:border-0 text-sm">
                  <span>{i.qty}{i.unit === "kg" ? "kg" : "×"} {i.name}</span>
                  <span>{rupees(i.qty * i.price)}</span>
                </div>
              ))}
              <div className="flex justify-between px-3 py-2 text-sm font-semibold">
                <span>Total</span>
                <span>{rupees(selected.total)}</span>
              </div>
            </Card>

            <p className="text-xs text-muted-foreground mb-2">Status</p>
            <div className="flex items-center gap-2 mb-4">
              <Chip tone={(ORDER_STATUS[selected.status] || ORDER_STATUS.new).tone}>
                {(ORDER_STATUS[selected.status] || ORDER_STATUS.new).label}
              </Chip>
            </div>

            <div className="space-y-2">
              {NEXT_STEP[selected.status] && (
                <Button
                  className="w-full"
                  disabled={saving}
                  onClick={() => setStatus(selected, NEXT_STEP[selected.status].to)}
                >
                  {NEXT_STEP[selected.status].label}
                </Button>
              )}
              {selected.status !== "cancelled" && selected.status !== "delivered" && (
                <Button variant="ghost" className="w-full text-destructive-text" disabled={saving}
                        onClick={() => setStatus(selected, "cancelled")}>
                  Cancel order
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}
