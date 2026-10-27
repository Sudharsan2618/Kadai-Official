"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  FileText, Plus, X, Pencil, Trash2, Store, MessageCircle, Globe2,
} from "lucide-react"
import { Shell } from "@/components/shell"
import { cn, Card, Chip, Button, Input, Textarea, Field, FieldError } from "@/components/ui"
import { SettingsSkeleton } from "@/components/skeletons"
import { get, post, patch, del } from "@/lib/api"
import { toast, toastError } from "@/components/toaster"
import { requiredError } from "@/lib/validate"

type WaConfig = {
  mode: "mock" | "baileys"
  connected: boolean
  number: string
  link_status?: string
}

const WA_GREEN = "#25D366"

/* Section — settled two-column settings row: label rail on the left, card on
   the right. This is what makes the page read as a product, not a form dump. */
function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="grid md:grid-cols-[230px_1fr] gap-4 md:gap-8 py-6 border-b border-border last:border-0">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const [shop, setShop] = useState<any | null>(null)
  const [readyMessages, setReadyMessages] = useState<any[]>([])
  const [waCfg, setWaCfg] = useState<WaConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [rmErrors, setRmErrors] = useState<{ label?: string; body?: string }>({})

  const load = useCallback(() => {
    get("/shop").then(setShop).catch(() => {})
    get("/ready-messages").then(setReadyMessages).catch(() => {})
    get<WaConfig>("/wa/config").then(setWaCfg).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const saveShop = async (fields: any) => {
    setSaving(true)
    try {
      await patch("/shop", fields)
      setShop((s: any) => ({ ...s, ...fields }))
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't save")
    } finally {
      setSaving(false)
    }
  }

  const saveReadyMessage = async () => {
    const errs = {
      label: requiredError(editing?.label || "", "Name"),
      body: (editing?.body || "").trim().length < 10 ? "Message is too short" : "",
    }
    setRmErrors(errs)
    if (errs.label || errs.body) return
    setSaving(true)
    try {
      if (editing.id) await patch(`/ready-messages/${editing.id}`, { label: editing.label, body: editing.body })
      else await post("/ready-messages", { label: editing.label, body: editing.body })
      toast(editing.id ? "Ready message updated" : "Ready message added")
      setEditing(null)
      setRmErrors({})
      load()
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't save the message")
    } finally {
      setSaving(false)
    }
  }

  const removeReadyMessage = async (id: number) => {
    try {
      await del(`/ready-messages/${id}`)
      toast("Ready message removed")
    } catch {
      toastError("Couldn't remove it")
    }
    load()
  }

  if (!shop) return <Shell title="Settings"><SettingsSkeleton /></Shell>

  const demo = waCfg?.mode === "mock"

  return (
    <Shell title="Settings" actions={savedFlash ? <Chip tone="green">Saved</Chip> : undefined}>
      <div className="px-4 md:px-8 py-2 max-w-[980px] mx-auto">

        <Section title="Shop profile" description="How your shop appears to customers on WhatsApp. Changes save automatically.">
          <Card>
            <div className="p-4 md:p-5 grid sm:grid-cols-2 gap-4">
              <Field label="Shop name">
                <Input defaultValue={shop.name} onBlur={(e) => e.target.value !== shop.name && saveShop({ name: e.target.value })} />
              </Field>
              <Field label="Your name">
                <Input defaultValue={shop.owner_name} onBlur={(e) => e.target.value !== shop.owner_name && saveShop({ owner_name: e.target.value })} />
              </Field>
              <Field label="Phone">
                <Input defaultValue={shop.phone} onBlur={(e) => e.target.value !== shop.phone && saveShop({ phone: e.target.value })} />
              </Field>
              <Field label="What you sell">
                <Input defaultValue={shop.business_type} onBlur={(e) => e.target.value !== shop.business_type && saveShop({ business_type: e.target.value })} />
              </Field>
            </div>
            <div className="px-4 md:px-5 py-2.5 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
              <Store size={13} /> These details fill {"{shop}"} in your messages.
            </div>
          </Card>
        </Section>

        <Section title="WhatsApp" description="Your shop's WhatsApp number, linked by scanning a QR. Customers message this number; everything lands in Chats.">
          <Card>
            <div className="p-4 md:p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                   style={{ background: "#defbe6" }}>
                <MessageCircle size={20} style={{ color: WA_GREEN }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">
                    {shop.wa_connected ? "Connected" : "Not connected"}
                  </p>
                  {shop.wa_connected && <Chip tone="green">Live</Chip>}
                </div>
                {shop.wa_connected ? (
                  <div className="mt-1.5 space-y-0.5">
                    <p className="text-sm font-mono tracking-wide">
                      {shop.wa_display_number || shop.wa_number}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {demo
                        ? "Demo mode — chats, broadcasts and replies are simulated."
                        : "Linked device · chats, broadcasts and replies flow through Kadai."}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    Scan a QR with your shop phone to link WhatsApp — no Meta account, nothing to pay.
                  </p>
                )}
              </div>
              <Link href="/connect">
                <Button variant={shop.wa_connected ? "secondary" : "primary"}>
                  {shop.wa_connected ? "Manage" : "Connect WhatsApp"}
                </Button>
              </Link>
            </div>
          </Card>
        </Section>

        <Section
          title="Ready messages"
          description="Pre-written messages you can send anytime — even when a chat is quiet. Use {name} and {shop}."
        >
          <Card>
            <div className="flex items-center justify-between px-4 md:px-5 pt-3.5 pb-2">
              <h3 className="text-sm font-semibold">{readyMessages.length} message{readyMessages.length === 1 ? "" : "s"}</h3>
              <Button variant="secondary" onClick={() => setEditing({ label: "", body: "" })}>
                <Plus size={14} /> New
              </Button>
            </div>
            {readyMessages.map((rm) => (
              <div key={rm.id} className="flex items-start gap-3 px-4 md:px-5 py-3 border-t border-border group">
                <FileText size={15} className="text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{rm.label}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{rm.body}</p>
                </div>
                <button className="p-1 text-muted-foreground hover:text-foreground" onClick={() => setEditing(rm)}><Pencil size={14} /></button>
                <button className="p-1 text-muted-foreground hover:text-destructive-text" onClick={() => removeReadyMessage(rm.id)}><Trash2 size={14} /></button>
              </div>
            ))}
            {readyMessages.length === 0 && (
              <p className="px-4 md:px-5 py-6 text-sm text-muted-foreground text-center border-t border-border">
                No ready messages yet — create your first one.
              </p>
            )}
          </Card>
        </Section>

        <Section title="Language" description="The language Kadai uses for you. Customer messages are always sent exactly as you write them.">
          <Card>
            <div className="p-4 md:p-5 flex gap-2">
              {[{ id: "en", label: "English" }, { id: "ta", label: "தமிழ்", soon: true }].map((l) => (
                <button
                  key={l.id}
                  disabled={l.soon}
                  onClick={() => saveShop({ language: l.id })}
                  className={cn(
                    "text-sm px-4 py-2 rounded-lg border transition-colors",
                    shop.language === l.id ? "border-primary text-primary font-semibold bg-info-soft" : "border-border text-muted-foreground hover:border-input",
                    l.soon && "opacity-50 cursor-not-allowed",
                  )}
                >
                  {l.label}{l.soon && <span className="text-[10px] ml-1.5 align-middle">(soon)</span>}
                </button>
              ))}
            </div>
          </Card>
        </Section>

        <div className="py-5 flex items-center gap-2 text-xs text-faint">
          <Globe2 size={13} /> Kadai · your shop on WhatsApp {demo ? "· demo mode" : "· powered by WhatsApp Web"}
        </div>
      </div>

      {/* Ready message editor */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-lg border border-border w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">{editing.id ? "Edit ready message" : "New ready message"}</h2>
              <button className="p-1 text-muted-foreground" onClick={() => setEditing(null)}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <Field label="Name (what you see)">
                <Input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="Today's stock" />
                <FieldError error={rmErrors.label} />
              </Field>
              <Field label="Message (what the customer gets)">
                <Textarea rows={4} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                          placeholder="Vanakkam {name}! Today at {shop}: …" />
                <FieldError error={rmErrors.body} />
              </Field>
              <Button className="w-full" disabled={saving} onClick={saveReadyMessage}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}
