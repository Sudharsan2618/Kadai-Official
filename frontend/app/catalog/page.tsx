"use client"

import { useState, useEffect, useCallback } from "react"
import { Package, Plus, X } from "lucide-react"
import { Shell } from "@/components/shell"
import { cn, Card, Button, EmptyState, ErrorState, Input, Field, FieldError, rupees } from "@/components/ui"
import { CardsGridSkeleton } from "@/components/skeletons"
import { get, post, patch } from "@/lib/api"
import { toast, toastError } from "@/components/toaster"
import { requiredError, priceError } from "@/lib/validate"
import posthog from "posthog-js"

export default function CatalogPage() {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: "", price: "", unit: "kg" })
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoadError(false)
    get("/products").then(setProducts).catch(() => setLoadError(true)).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const toggleStock = async (p: any) => {
    setProducts((rows) => rows.map((r) => (r.id === p.id ? { ...r, in_stock: !r.in_stock } : r)))
    try {
      await patch(`/products/${p.id}`, { in_stock: !p.in_stock })
      posthog.capture("product_stock_toggled", { in_stock: !p.in_stock, unit: p.unit })
      toast(`${p.name} marked ${p.in_stock ? "out of stock" : "in stock"}`)
    } catch {
      toastError("Couldn't update stock")
      load()
    }
  }

  const updatePrice = async (p: any, price: number) => {
    try {
      await patch(`/products/${p.id}`, { price })
      posthog.capture("product_price_updated", { price, unit: p.unit })
      toast(`${p.name} price updated`)
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't update price")
    }
    load()
  }

  const addProduct = async () => {
    const errs = {
      name: requiredError(form.name, "Item name"),
      price: priceError(form.price),
    }
    setErrors(errs)
    if (errs.name || errs.price) return
    setSaving(true)
    try {
      await post("/products", { name: form.name.trim(), price: Number(form.price), unit: form.unit })
      posthog.capture("product_created", { price: Number(form.price), unit: form.unit })
      toast(`${form.name.trim()} added to catalog`)
      setAdding(false)
      setForm({ name: "", price: "", unit: "kg" })
      setErrors({})
      load()
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't add item")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Shell
      title="Catalog"
      actions={<Button onClick={() => setAdding(true)}><Plus size={15} /> New item</Button>}
    >
      <div className="p-4 md:p-6 max-w-[1440px] mx-auto">
        <p className="text-xs text-muted-foreground mb-3">
          Keep today's items and prices right — broadcasts and orders use this list.
        </p>
        {loading ? (
          <CardsGridSkeleton cards={6} gridClass="grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3" />
        ) : loadError ? (
          <ErrorState onRetry={load} />
        ) : products.length === 0 ? (
          <EmptyState
            icon={<Package size={28} />}
            title="No items yet"
            hint="Add what you sell — name and price is enough."
            action={<Button onClick={() => setAdding(true)}><Plus size={14} /> Add your first item</Button>}
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
            {products.map((p) => (
              <Card key={p.id} className={cn("px-4 py-3", !p.in_stock && "bg-secondary/40")}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className={cn("min-w-0", !p.in_stock && "opacity-60")}>
                    <p className="text-sm font-semibold truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">per {p.unit}</p>
                  </div>
                  <span className={cn(
                    "text-[11px] px-2 py-0.5 rounded-sm shrink-0",
                    p.in_stock ? "bg-success-soft text-success-text" : "bg-secondary text-faint",
                  )}>
                    {p.in_stock ? "In stock" : "Out of stock"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">₹</span>
                    <input
                      type="number"
                      defaultValue={p.price}
                      onBlur={(e) => Number(e.target.value) !== p.price && updatePrice(p, Number(e.target.value))}
                      className="w-24 bg-secondary text-sm rounded-sm px-2 h-8 outline-none border border-transparent focus:border-primary"
                    />
                    <span className="text-[11px] text-faint">/{p.unit}</span>
                  </div>
                  <button
                    onClick={() => toggleStock(p)}
                    className={cn(
                      "relative w-10 rounded-full transition-colors shrink-0",
                      p.in_stock ? "bg-success" : "bg-input",
                    )}
                    title={p.in_stock ? "In stock — tap to mark out" : "Out of stock — tap to mark in"}
                    style={{ height: 22 }}
                  >
                    <span
                      className="absolute top-0.5 bg-white rounded-full transition-all"
                      style={{ width: 18, height: 18, left: p.in_stock ? 20 : 2 }}
                    />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {adding && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setAdding(false)}>
          <div className="bg-white rounded-lg border border-border w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">New item</h2>
              <button className="p-1 text-muted-foreground" onClick={() => setAdding(false)}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <Field label="Item name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alphonso" />
                <FieldError error={errors.name} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price (₹)">
                  <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="280" />
                  <FieldError error={errors.price} />
                </Field>
                <Field label="Per">
                  <select
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className="w-full bg-secondary text-sm rounded-sm px-2 h-9 outline-none border border-transparent focus:border-primary"
                  >
                    <option value="kg">kg</option>
                    <option value="piece">piece</option>
                    <option value="box">box</option>
                    <option value="dozen">dozen</option>
                  </select>
                </Field>
              </div>
              <Button className="w-full" disabled={saving} onClick={addProduct}>{saving ? "Adding…" : "Add item"}</Button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}
