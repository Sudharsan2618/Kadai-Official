"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Check, MessageCircle, Store, Send } from "lucide-react"
import { cn, Button, Input, Field, FieldError } from "@/components/ui"
import { get, post, patch } from "@/lib/api"
import { toastError } from "@/components/toaster"
import { phoneError, requiredError } from "@/lib/validate"
import posthog from "posthog-js"

declare global {
  interface Window { FB?: any; fbAsyncInit?: () => void }
}

const STEPS = ["Your shop", "Connect WhatsApp", "Test message"]

/* Which Embedded Signup path the seller takes. "coexist" keeps the number they
   already run the WhatsApp Business app on — the common case for our sellers,
   and the one that carries their chats and contacts across (K-02). */
type Path = "coexist" | "fresh"

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ name: "", owner_name: "", phone: "", business_type: "fruits" })
  const [busy, setBusy] = useState(false)
  const [connected, setConnected] = useState(false)
  const [path, setPath] = useState<Path>("coexist")
  const [testSent, setTestSent] = useState(false)
  const [testPhone, setTestPhone] = useState("")
  const [testError, setTestError] = useState("")
  const [waCfg, setWaCfg] = useState<any | null>(null)
  const codeRef = useRef("")
  const assetsRef = useRef<{ waba_id?: string; phone_number_id?: string }>({})
  // The message listener is registered once, so it must not close over a stale
  // `path`. A ref keeps the value the listener reads current.
  const pathRef = useRef<Path>("coexist")
  pathRef.current = path

  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({})

  useEffect(() => { get("/wa/config").then(setWaCfg).catch(() => {}) }, [])

  const loadFbSdk = () => new Promise<void>((resolve) => {
    if (window.FB) return resolve()
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: waCfg.app_id, autoLogAppEvents: true, xfbml: false, version: "v25.0" })
      resolve()
    }
    const script = document.createElement("script")
    script.src = "https://connect.facebook.net/en_US/sdk.js"
    script.async = true
    script.defer = true
    document.body.appendChild(script)
  })

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return
      let data: any
      try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data } catch { return }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return
      if (data.event === "CANCEL") {
        setBusy(false)
        toastError(data.data?.error_message || "Meta signup was cancelled")
        return
      }
      const assets = data.data || {}
      if (assets.waba_id || assets.phone_number_id) {
        assetsRef.current = { waba_id: assets.waba_id, phone_number_id: assets.phone_number_id }
        completeCloudConnect()
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  const completeCloudConnect = async () => {
    if (!codeRef.current || !assetsRef.current.waba_id || !assetsRef.current.phone_number_id) return
    try {
      await post("/onboarding/connect", {
        code: codeRef.current, ...assetsRef.current, path: pathRef.current,
      })
      setConnected(true)
      // Default the test to the seller's own contact number. On a fresh signup
      // that's a different phone from the new WhatsApp number, so it works; on
      // coexistence it's the same number and the backend will say so.
      setTestPhone((p) => p || form.phone)
      setTimeout(() => setStep(3), 700)
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
      const msg = e instanceof Error ? e.message : "Couldn't send the test message"
      setTestError(msg)
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

  const connect = async () => {
    setBusy(true)
    try {
      if (waCfg?.mode === "cloud") {
        if (!waCfg.app_id || !waCfg.config_id) throw new Error("Meta Embedded Signup is not configured")
        codeRef.current = ""
        assetsRef.current = {}
        await loadFbSdk()
        window.FB.login((response: any) => {
          const code = response?.authResponse?.code
          if (!code) { setBusy(false); toastError("Meta signup did not return an authorization code"); return }
          codeRef.current = code
          completeCloudConnect()
        }, {
          config_id: waCfg.config_id,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            setup: {}, sessionInfoVersion: "3", version: "v4",
            // Only meaningful when the v4 config includes WhatsApp Business app
            // user onboarding; harmless otherwise.
            featureType: path === "coexist" ? "whatsapp_business_app_onboarding" : "",
          },
        })
        return
      }
      await post("/onboarding/connect", { phone: form.phone, path })
      posthog.capture("whatsapp_connected", { source: "onboarding", path })
      setConnected(true)
      setTestPhone((p) => p || form.phone)
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
          <div className="space-y-3">
            <div className="text-center space-y-1.5">
              <MessageCircle size={30} className="mx-auto text-success" />
              <h1 className="text-base font-semibold">Connect your WhatsApp</h1>
              <p className="text-xs text-muted-foreground">
                One tap. No Meta account setup, no app creation, no waiting.
              </p>
            </div>

            {!connected && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-medium">Which number will you use?</p>
                {([
                  ["coexist", "The number I already use", "Keeps your WhatsApp Business app working, and brings your chats and contacts with you."],
                  ["fresh", "A new number for the shop", "Keeps shop messages separate from your personal WhatsApp."],
                ] as const).map(([id, label, hint]) => (
                  <button
                    key={id}
                    onClick={() => setPath(id)}
                    className={cn(
                      "w-full text-left rounded-lg border p-2.5 transition-all",
                      path === id ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-input",
                    )}
                  >
                    <span className="text-xs font-medium">{label}</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{hint}</span>
                  </button>
                ))}
                {path === "coexist" && (
                  <p className="text-[11px] text-warning-text bg-warning-soft rounded-md px-2.5 py-2 leading-relaxed">
                    Your WhatsApp broadcast lists will stop working once you connect — that&apos;s
                    Meta&apos;s rule. Kadai&apos;s Broadcast replaces them, and reaches the same people.
                  </p>
                )}
              </div>
            )}

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
