"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Users, X, MessageCircle, Plus, Search } from "lucide-react"
import { Shell } from "@/components/shell"
import { Card, Chip, Button, Avatar, EmptyState, ErrorState, Input, Field, FieldError, rupees, timeAgo, ORDER_STATUS } from "@/components/ui"
import { TableSkeleton } from "@/components/skeletons"
import { get, post } from "@/lib/api"
import { toast, toastError } from "@/components/toaster"
import { phoneError, requiredError } from "@/lib/validate"

const PAGE_SIZE = 50

export default function CustomersPage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState("")
  const [detail, setDetail] = useState<any | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: "", phone: "", area: "" })
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoadError(false)
    get(`/customers?page=1&page_size=${PAGE_SIZE}`)
      .then((r) => {
        setCustomers(r.items)
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
      const r = await get(`/customers?page=${page + 1}&page_size=${PAGE_SIZE}`)
      setCustomers((prev) => [...prev, ...r.items])
      setHasMore(r.has_more)
      setPage(page + 1)
    } catch {
      toastError("Couldn't load more customers")
    } finally {
      setLoadingMore(false)
    }
  }

  const openDetail = (id: number) => {
    get(`/customers/${id}`).then(setDetail).catch(() => toastError("Couldn't open customer"))
  }

  const addCustomer = async () => {
    const errs = {
      name: requiredError(form.name, "Name"),
      phone: phoneError(form.phone),
    }
    setErrors(errs)
    if (errs.name || errs.phone) return
    setSaving(true)
    try {
      await post("/customers", form)
      toast(`${form.name.trim()} added`)
      setAdding(false)
      setForm({ name: "", phone: "", area: "" })
      setErrors({})
      load()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't add customer"
      if (msg.toLowerCase().includes("already")) setErrors({ phone: msg })
      else toastError(msg)
    } finally {
      setSaving(false)
    }
  }

  const visible = customers.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search),
  )

  return (
    <Shell
      title="Customers"
      actions={<Button onClick={() => setAdding(true)}><Plus size={15} /> New customer</Button>}
    >
      <div className="p-4 md:p-6 max-w-[1440px] mx-auto">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="relative max-w-xs flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <Input placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          {!loading && !loadError && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {search ? `${visible.length} matching` : `${total} customers`}
            </span>
          )}
        </div>

        {loading ? (
          <TableSkeleton rows={8} />
        ) : loadError ? (
          <ErrorState onRetry={load} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Users size={28} />}
            title={search ? "No one matches that search" : "No customers yet"}
            hint={search ? "Try a different name or number." : "Add your first customer to start broadcasting."}
            action={!search ? <Button onClick={() => setAdding(true)}><Plus size={14} /> Add customer</Button> : undefined}
          />
        ) : (
          <>
            <Card>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left font-semibold px-4 py-2">Name</th>
                    <th className="text-left font-semibold px-2 py-2 hidden sm:table-cell">Area</th>
                    <th className="text-left font-semibold px-2 py-2 hidden md:table-cell">Tags</th>
                    <th className="text-left font-semibold px-2 py-2">Orders</th>
                    <th className="text-left font-semibold px-2 py-2 hidden sm:table-cell">Spent</th>
                    <th className="text-right font-semibold px-4 py-2">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr key={c.id} onClick={() => openDetail(c.id)} className="border-t border-border hover:bg-secondary/60 cursor-pointer">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={c.name} className="w-7 h-7" />
                          <div>
                            <p className="font-medium">{c.name}</p>
                            <p className="text-[11px] text-muted-foreground">{c.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-muted-foreground hidden sm:table-cell">{c.area}</td>
                      <td className="px-2 py-2.5 hidden md:table-cell">
                        <div className="flex gap-1 flex-wrap">
                          {(c.tags || []).map((t: string) => <Chip key={t} tone="gray">{t}</Chip>)}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">{c.orders_count}</td>
                      <td className="px-2 py-2.5 hidden sm:table-cell">{rupees(c.total_spent)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {c.due > 0 ? <Chip tone="amber">{rupees(c.due)}</Chip> : <span className="text-faint text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            {hasMore && !search && (
              <div className="flex justify-center mt-3">
                <Button variant="secondary" disabled={loadingMore} onClick={loadMore}>
                  {loadingMore ? "Loading…" : `Load more (${customers.length} of ${total})`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add customer modal */}
      {adding && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setAdding(false)}>
          <div className="bg-white rounded-lg border border-border w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">New customer</h2>
              <button className="p-1 text-muted-foreground" onClick={() => setAdding(false)}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <Field label="Name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ravi Kumar" />
                <FieldError error={errors.name} />
              </Field>
              <Field label="WhatsApp number">
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98430 12345" />
                <FieldError error={errors.phone} />
              </Field>
              <Field label="Area (optional)">
                <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="T. Nagar" />
              </Field>
              <Button className="w-full" disabled={saving} onClick={addCustomer}>
                {saving ? "Adding…" : "Add customer"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Customer drawer */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setDetail(null)}>
          <div className="absolute right-0 top-0 bottom-0 w-full sm:w-96 bg-white border-l border-border p-4 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Customer</h2>
              <button className="p-1 text-muted-foreground" onClick={() => setDetail(null)}><X size={18} /></button>
            </div>

            <div className="flex items-center gap-3 mb-1">
              <Avatar name={detail.name} className="w-10 h-10" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{detail.name}</p>
                <p className="text-xs text-muted-foreground">{detail.phone}{detail.area ? ` · ${detail.area}` : ""}</p>
              </div>
              <span className="flex-1" />
              <Button variant="secondary" onClick={() => router.push(`/chats?c=${detail.id}`)}>
                <MessageCircle size={14} /> Chat
              </Button>
            </div>
            <div className="flex gap-1 flex-wrap my-3">
              {(detail.tags || []).map((t: string) => <Chip key={t} tone="gray">{t}</Chip>)}
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <Card className="px-3 py-2"><p className="text-[11px] text-muted-foreground">Orders</p><p className="text-lg">{detail.orders_count}</p></Card>
              <Card className="px-3 py-2"><p className="text-[11px] text-muted-foreground">Spent</p><p className="text-lg">{rupees(detail.total_spent)}</p></Card>
              <Card className="px-3 py-2"><p className="text-[11px] text-muted-foreground">Due</p><p className={`text-lg ${detail.due > 0 ? "text-warning-text" : ""}`}>{detail.due > 0 ? rupees(detail.due) : "—"}</p></Card>
            </div>

            <p className="text-xs text-muted-foreground mb-2">Order history</p>
            <Card>
              {(detail.orders || []).length === 0 && <p className="text-xs text-muted-foreground p-3">No orders yet.</p>}
              {(detail.orders || []).map((o: any) => {
                const st = ORDER_STATUS[o.status] || ORDER_STATUS.new
                return (
                  <div key={o.id} className="flex items-center justify-between px-3 py-2 border-b border-border last:border-0 text-sm">
                    <div>
                      <p className="text-xs">{(o.items || []).map((i: any) => `${i.qty}${i.unit === "kg" ? "kg" : "×"} ${i.name}`).join(", ")}</p>
                      <p className="text-[11px] text-muted-foreground">{timeAgo(o.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{rupees(o.total)}</span>
                      <Chip tone={st.tone}>{st.label}</Chip>
                    </div>
                  </div>
                )
              })}
            </Card>
          </div>
        </div>
      )}
    </Shell>
  )
}
