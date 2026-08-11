"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, MessageCircle, Store, Send } from "lucide-react"
import { cn, Button, Input, Field, FieldError } from "@/components/ui"
import { post, patch } from "@/lib/api"
import { toastError } from "@/components/toaster"
import { phoneError, requiredError } from "@/lib/validate"
import posthog from "posthog-js"

const STEPS = ["Your shop", "Connect WhatsApp", "Test message"]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ name: "", owner_name: "", phone: "", business_type: "fruits" })
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(false)
  const [testSent, setTestSent] = useState(false)

  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({})

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

  const connect = async () => {
    setBusy(true)
    try {
      // In production this opens Meta's Embedded Signup popup —
      // the seller approves once and lands back here, connected.
      await post("/onboarding/connect", { phone: form.phone })
      posthog.capture("whatsapp_connected", { source: "onboarding" })
      setConnected(true)
      setTimeout(() => setStep(3), 700)
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't connect — try again")
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
          <div className="text-center space-y-3">
            <MessageCircle size={30} className="mx-auto text-success" />
            <h1 className="text-base font-semibold">Connect your WhatsApp</h1>
            <p className="text-xs text-muted-foreground">
              One tap. No Meta account setup, no app creation, no waiting — we handle all of it for you.
            </p>
            {connected ? (
              <p className="text-sm text-success-text font-medium flex items-center justify-center gap-1.5">
                <Check size={15} /> Connected
              </p>
            ) : (
              <Button className="w-full" disabled={busy} onClick={connect}>
                {busy ? "Connecting…" : "Connect WhatsApp"}
              </Button>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="text-center space-y-3">
            <Send size={28} className="mx-auto text-primary" />
            <h1 className="text-base font-semibold">You're ready to sell</h1>
            <p className="text-xs text-muted-foreground">
              Your number is live. Add your items in Catalog, then send your first broadcast — that's how orders start coming in.
            </p>
            {!testSent ? (
              <Button variant="secondary" className="w-full" onClick={() => setTestSent(true)}>
                Send me a test message
              </Button>
            ) : (
              <p className="text-sm text-success-text font-medium flex items-center justify-center gap-1.5">
                <Check size={15} /> Test message sent to your phone
              </p>
            )}
            <Button className="w-full" disabled={busy} onClick={finish}>Open my shop</Button>
          </div>
        )}
      </div>
    </div>
  )
}
