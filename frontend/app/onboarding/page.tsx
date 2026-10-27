"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Check, MessageCircle, Store, Send, Loader2, QrCode } from "lucide-react"
import { cn, Button, Input, Field, FieldError } from "@/components/ui"
import { get, post, patch } from "@/lib/api"
import { toastError } from "@/components/toaster"
import { phoneError, requiredError } from "@/lib/validate"
import posthog from "posthog-js"

const STEPS = ["Your shop", "Connect WhatsApp", "Test message"]
const POLL_MS = 2000

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ name: "", owner_name: "", phone: "", business_type: "fruits" })
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(false)
  const [testSent, setTestSent] = useState(false)
  const [testPhone, setTestPhone] = useState("")
  const [testError, setTestError] = useState("")
  const [waCfg, setWaCfg] = useState<any | null>(null)
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({})

  // WhatsApp linking (QR / pairing code) state.
  const [linking, setLinking] = useState(false)
  const [link, setLink] = useState<{ status?: string; qr?: string; code?: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { get("/wa/config").then(setWaCfg).catch(() => {}) }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])
  useEffect(() => stopPolling, [stopPolling])

  const onLinked = useCallback(() => {
    stopPolling()
    setLinking(false)
    setConnected(true)
    posthog.capture("whatsapp_connected", { source: "onboarding" })
    setTestPhone((p) => p || form.phone)
    setTimeout(() => setStep(3), 700)
  }, [stopPolling, form.phone])

  const poll = useCallback(() => {
    get("/wa/link/status")
      .then((r: any) => {
        setLink(r)
        if (r?.status === "linked") onLinked()
      })
      .catch(() => {})
  }, [onLinked])

  const connect = async () => {
    setBusy(true)
    try {
      if (waCfg?.mode === "mock") {
        // Demo mode has no gateway — the connect endpoint just marks it linked.
        await post("/onboarding/connect", { phone: form.phone })
        onLinked()
        return
      }
      setLink(null)
      await post("/wa/link/start", form.phone ? { phone: form.phone } : {})
      setLinking(true)
      stopPolling()
      poll()
      pollRef.current = setInterval(poll, POLL_MS)
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't connect — try again")
    } finally {
      setBusy(false)
    }
  }

  const sendTest = async () => {
    setTestError("")
    setBusy(true)
    try {
      await post("/wa/test-message", { phone: testPhone })
      setTestSent(true)
      posthog.capture("onboarding_test_message_sent")
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Couldn't send the test message")
    } finally {
      setBusy(false)
    }
  }

  const saveShop = async () => {
    const errs = {
      name: requiredError(form.name, "Shop name"),
      phone: phoneError(form.phone),
    }
    setErrors(errs)
    if (errs.name || errs.phone) return
    setBusy(true)
    try {
      await patch("/shop", form)
      posthog.capture("onboarding_shop_saved", { business_type: form.business_type })
      setStep(2)
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't save — try again")
    } finally {
      setBusy(false)
    }
  }

  const finish = async () => {
    setBusy(true)
    try {
      await patch("/shop", { onboarded: true })
      posthog.capture("onboarding_completed")
      router.replace("/today")
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't finish setup — try again")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-secondary/50 p-4">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-9 h-9 rounded-lg bg-action text-white flex items-center justify-center text-sm font-semibold">K</div>
        <span className="text-lg font-semibold">Kadai</span>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-5 text-xs">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold",
              step > i + 1 ? "bg-success text-white" : step === i + 1 ? "bg-action text-white" : "bg-border text-muted-foreground",
            )}>
              {step > i + 1 ? <Check size={11} /> : i + 1}
            </span>
            <span className={step === i + 1 ? "font-semibold" : "text-muted-foreground"}>{label}</span>
            {i < STEPS.length - 1 && <span className="w-5 h-px bg-border" />}
          </div>
        ))}
      </div>

      <div className="card w-full max-w-sm p-5 bg-white">
        {step === 1 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Store size={17} className="text-muted-foreground" />
              <h1 className="text-base font-semibold">Tell us about your shop</h1>
            </div>
            <Field label="Shop name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mango Anna Fruits" />
              <FieldError error={errors.name} />
            </Field>
            <Field label="Your name">
              <Input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} placeholder="Murugan" />
            </Field>
            <Field label="WhatsApp number">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98430 00001" />
              <FieldError error={errors.phone} />
            </Field>
            <Button className="w-full" disabled={busy} onClick={saveShop}>
              {busy ? "Saving…" : "Next"}
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="text-center space-y-1.5">
              <MessageCircle size={30} className="mx-auto text-success" />
              <h1 className="text-base font-semibold">Connect your WhatsApp</h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Scan a QR with your shop phone — the same way you link WhatsApp on a laptop.
                No Meta account, no app creation, nothing to pay.
              </p>
            </div>

            {connected ? (
              <p className="text-sm text-success-text font-medium flex items-center justify-center gap-1.5">
                <Check size={15} /> Connected
              </p>
            ) : linking ? (
              <div className="flex flex-col items-center text-center pt-1">
                {link?.qr ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={link.qr} alt="WhatsApp QR code" width={200} height={200}
                      className="rounded-lg border border-border" />
                    <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                      WhatsApp → Settings → Linked devices → Link a device, then scan this.
                    </p>
                  </>
                ) : link?.code ? (
                  <>
                    <p className="text-xs font-medium">Enter this pairing code in WhatsApp</p>
                    <p className="text-2xl font-mono tracking-[0.25em] mt-2 tabular-nums">{link.code}</p>
                  </>
                ) : (
                  <div className="py-8 flex flex-col items-center gap-2">
                    <Loader2 size={20} className="animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Preparing your code…</p>
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-3 text-[11px] text-muted-foreground">
                  <Loader2 size={12} className="animate-spin" /> Waiting for you to scan…
                </div>
              </div>
            ) : (
              <Button className="w-full" disabled={busy} onClick={connect}>
                <QrCode size={15} /> {busy ? "Starting…" : "Connect WhatsApp"}
              </Button>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="text-center space-y-1.5">
              <Send size={28} className="mx-auto text-primary" />
              <h1 className="text-base font-semibold">Let&apos;s prove it works</h1>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We&apos;ll send one real WhatsApp message from your shop number. If it
                arrives, everything is set up correctly.
              </p>
            </div>

            {!testSent ? (
              <>
                <Field label="Send it to">
                  <Input
                    value={testPhone}
                    onChange={(e) => { setTestPhone(e.target.value); setTestError("") }}
                    placeholder="Your personal WhatsApp number"
                    inputMode="numeric"
                  />
                  <FieldError error={testError} />
                </Field>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Use a different phone from your shop number — WhatsApp won&apos;t let a
                  number message itself.
                </p>
                <Button variant="secondary" className="w-full" disabled={busy} onClick={sendTest}>
                  {busy ? "Sending…" : "Send test message"}
                </Button>
              </>
            ) : (
              <p className="text-sm text-success-text font-medium flex items-center justify-center gap-1.5">
                <Check size={15} /> Sent — check that phone
              </p>
            )}

            <Button className="w-full" disabled={busy} onClick={finish}>
              {testSent ? "Open my shop" : "Skip for now"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
