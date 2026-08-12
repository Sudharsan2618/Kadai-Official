"use client"

/* /connect — the WhatsApp connection hub.
   Covers K-01…K-06 and K-29: Embedded Signup v4, coexistence onboarding,
   hosted (zero-integration) fallback, sandbox testing, number registration,
   the payment-method step we cannot skip as a Tech Provider, and the
   onboarding state machine. See docs/PRODUCT-SCOPE-2026.md. */

import { useState, useEffect, useRef } from "react"
import {
  Smartphone, Sparkles, Link2, FlaskConical, CreditCard, ShieldCheck,
  ArrowRight, Copy, Check, AlertTriangle, History, Users,
} from "lucide-react"
import { Shell } from "@/components/shell"
import { cn, Card, Chip, Button, Input, Field } from "@/components/ui"
import { PlatformPage, Section, Step, Row, Meter } from "@/components/platform"
import { toast } from "@/components/toaster"
import { get, post } from "@/lib/api"

const WA_GREEN = "#25D366"

type Path = "coexist" | "fresh" | "hosted" | "sandbox"

const PATHS: { id: Path; icon: any; title: string; blurb: string; badge?: string; tone?: "green" | "blue" }[] = [
  {
    id: "coexist",
    icon: Smartphone,
    title: "Keep the WhatsApp Business app",
    blurb:
      "Same number, same chats. The last 6 months of conversations and every contact come across. The seller keeps replying from their phone exactly as before — Kadai adds broadcasting and orders on top.",
    badge: "Recommended",
    tone: "green",
  },
  {
    id: "fresh",
    icon: Sparkles,
    title: "Start with a new number",
    blurb:
      "For a seller who wants their shop number separate from their personal WhatsApp, or who has never used the Business app.",
  },
  {
    id: "hosted",
    icon: Link2,
    title: "Send a signup link",
    blurb:
      "Meta hosts the whole onboarding page. Useful over a phone call — send the link, the seller finishes it themselves, and we pick them up from the webhook.",
    badge: "Zero setup",
    tone: "blue",
  },
  {
    id: "sandbox",
    icon: FlaskConical,
    title: "Test with a sandbox account",
    blurb:
      "A 30-day Meta test account. The full onboarding handshake works end to end, but the sandbox number cannot send or receive real messages.",
    badge: "Internal",
  },
]

const COEXIST_KEEPS = [
  { label: "Their existing number", ok: true },
  { label: "6 months of chat history", ok: true },
  { label: "Every saved contact", ok: true },
  { label: "1:1 replies from the phone", ok: true },
  { label: "Broadcast lists", ok: false },
  { label: "Disappearing / view-once messages", ok: false },
  { label: "Group chats (not synced)", ok: false },
]

export default function ConnectPage() {
  const [path, setPath] = useState<Path>("coexist")
  const [pin, setPin] = useState("")
  const [copied, setCopied] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [waCfg, setWaCfg] = useState<any | null>(null)
  const codeRef = useRef("")
  const assetsRef = useRef<{ waba_id?: string; phone_number_id?: string }>({})

  useEffect(() => { get("/wa/config").then(setWaCfg).catch(() => {}) }, [])

  const hostedUrl = "https://business.facebook.com/messaging/whatsapp/onboard/?app_id=2854903808192123"

  const copy = () => {
    navigator.clipboard?.writeText(hostedUrl)
    setCopied(true)
    toast("Signup link copied")
    setTimeout(() => setCopied(false), 1800)
  }

  const loadFbSdk = () => new Promise<void>((resolve) => {
    if (window.FB) return resolve()
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: waCfg?.app_id, autoLogAppEvents: true, xfbml: false, version: "v25.0" })
      resolve()
    }
    const s = document.createElement("script")
    s.src = "https://connect.facebook.net/en_US/sdk.js"
    s.async = true
    document.body.appendChild(s)
  })

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return
      let data: any
      try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data } catch { return }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return
      if (data.event === "CANCEL") { setLaunching(false); return }
      const assets = data.data || {}
      if (assets.waba_id || assets.phone_number_id) {
        assetsRef.current = { waba_id: assets.waba_id, phone_number_id: assets.phone_number_id }
        completeConnect()
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  })

  const completeConnect = () => {
    if (!codeRef.current || !assetsRef.current.waba_id || !assetsRef.current.phone_number_id) return
    post("/onboarding/connect", { code: codeRef.current, ...assetsRef.current, path })
      .then(() => toast("Seller connected — pulling chats and contacts"))
      .catch((e) => toast(typeof e?.message === "string" ? e.message : "Couldn't connect — try again"))
      .finally(() => setLaunching(false))
  }

  const launch = async () => {
    if (waCfg?.mode !== "cloud") {
      toast(waCfg?.mode === "mock"
        ? "Running in demo mode — connect a real Meta app in the server .env to go live"
        : "Meta Embedded Signup isn't configured on the server yet")
      return
    }
    if (!waCfg.app_id || !waCfg.config_id) {
      toast("Meta Embedded Signup isn't configured — set META_APP_ID / META_ES_CONFIG_ID")
      return
    }
    setLaunching(true)
    codeRef.current = ""
    assetsRef.current = {}
    await loadFbSdk()
    window.FB.login((response: any) => {
      const code = response?.authResponse?.code
      if (!code) { setLaunching(false); return }
      codeRef.current = code
      completeConnect()
    }, {
      config_id: waCfg.config_id,
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
        sessionInfoVersion: "3",
        version: "v4",
        // Coexistence: offer the "keep the WhatsApp Business app" path (K-02).
        // featureType is only meaningful when the v4 config includes the
        // WhatsApp Business app onboarding product; harmless otherwise.
        featureType: path === "coexist" ? "whatsapp_business_app_onboarding" : "",
      },
    })
  }

  return (
    <Shell title="Connect WhatsApp">
      <PlatformPage
        issues="K-01 … K-06, K-29"
        title="Connect a seller's WhatsApp"
        description="Choose the safest setup path, finish the Meta handshake, and verify the first message before handing the number back to the seller."
      >
        {/* ── Live status hero ─────────────────────────────────────────── */}
        <Card className="mt-4 overflow-hidden">
          <div className="px-5 py-4 flex items-start gap-4 flex-wrap">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `${WA_GREEN}1a` }}
            >
              <Smartphone size={20} style={{ color: WA_GREEN }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">+91 98430 21188</p>
                <Chip tone="green">Live</Chip>
                <Chip tone="blue">Coexisting with the Business app</Chip>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Murugan Fruits &amp; Vegetables · connected 3 days ago · quality rating{" "}
                <span className="text-success-text font-medium">Green</span>
              </p>
            </div>
            <Button variant="secondary">Manage number</Button>
          </div>
          <div className="px-5 pb-4 grid sm:grid-cols-3 gap-4 border-t border-border pt-3">
            <div>
              <p className="text-[11px] text-muted-foreground">Daily send limit</p>
              <p className="text-sm font-medium mt-0.5 tabular-nums">182 / 250 people</p>
              <div className="mt-1.5"><Meter value={182} max={250} tone="amber" /></div>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Sending speed</p>
              <p className="text-sm font-medium mt-0.5">20 messages / second</p>
              <p className="text-[11px] text-faint mt-0.5">Capped while coexisting</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Chats synced</p>
              <p className="text-sm font-medium mt-0.5 tabular-nums">1,204 messages · 318 contacts</p>
              <p className="text-[11px] text-faint mt-0.5">Last 6 months</p>
            </div>
          </div>
        </Card>

        {/* ── Onboarding path chooser ──────────────────────────────────── */}
        <Section
          title="How this seller joins"
          description="Pick the path before launching signup. Most Tamil Nadu sellers already run the WhatsApp Business app — that path keeps everything they have."
        >
          <div className="grid sm:grid-cols-2 gap-3">
            {PATHS.map(({ id, icon: Icon, title, blurb, badge, tone }) => (
              <button
                key={id}
                onClick={() => setPath(id)}
                className={cn(
                  "text-left rounded-lg border p-3.5 transition-all",
                  path === id
                    ? "border-primary ring-2 ring-primary/20 bg-white"
                    : "border-border hover:border-input bg-white",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <Icon size={17} className={cn("shrink-0 mt-0.5", path === id ? "text-primary" : "text-muted-foreground")} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium">{title}</span>
                      {badge && <Chip tone={tone === "green" ? "green" : tone === "blue" ? "blue" : "gray"}>{badge}</Chip>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{blurb}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {path === "coexist" && (
            <Card className="mt-3 px-4 py-3.5">
              <p className="text-xs font-semibold mb-2.5">What the seller keeps, and what changes</p>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {COEXIST_KEEPS.map(({ label, ok }) => (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    <span className={cn("shrink-0", ok ? "text-success-text" : "text-destructive-text")}>
                      {ok ? "✓" : "✕"}
                    </span>
                    <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-start gap-2 text-xs text-warning-text bg-warning-soft rounded-md px-3 py-2">
                <AlertTriangle size={14} className="shrink-0 mt-px" />
                <p className="leading-relaxed">
                  Broadcast lists stop working the moment they connect — that is Meta&apos;s
                  rule, not ours. Say it out loud during onboarding, then show them
                  Kadai&apos;s broadcast immediately. This is the moment we earn the subscription.
                </p>
              </div>
              <div className="mt-2.5 flex items-start gap-2 text-xs text-muted-foreground">
                <History size={14} className="shrink-0 mt-px" />
                <p className="leading-relaxed">
                  History has to be pulled within 24 hours of connecting, so keep the
                  seller&apos;s phone open and on WiFi until the sync finishes.
                </p>
              </div>
            </Card>
          )}

          {path === "hosted" && (
            <Card className="mt-3 px-4 py-3.5">
              <p className="text-xs text-muted-foreground mb-2">
                Send this to the seller. They complete Meta&apos;s onboarding page and we
                pick them up automatically from the <span className="font-mono">account_update</span> webhook.
              </p>
              <div className="flex gap-2">
                <Input readOnly value={hostedUrl} className="font-mono text-[11px]" />
                <Button variant="secondary" onClick={copy}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </Card>
          )}

          {path === "sandbox" && (
            <Card className="mt-3 px-4 py-3.5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium">Sandbox account</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Claimed 6 days ago · expires in 24 days
                  </p>
                </div>
                <Chip tone="blue">Active</Chip>
              </div>
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                The full handshake is testable — token exchange, webhook subscription,
                registration all return real IDs. The sandbox number cannot send or
                receive messages, so message-path testing still needs a real test number.
              </p>
            </Card>
          )}

          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Button className="gap-2" disabled={launching} onClick={launch}>
              {launching ? "Opening Meta…" : <>Launch signup <ArrowRight size={14} /></>}
            </Button>
            <span className="text-xs text-muted-foreground">
              Opens Meta's Embedded Signup (v4)
            </span>
          </div>
        </Section>

        {/* ── Onboarding state machine ─────────────────────────────────── */}
        <Section
          title="Setup progress"
          description="Every step is retryable on its own. If one fails we resume from there rather than making the seller start again."
        >
          <Card className="px-4 py-1">
            <Step
              n={1}
              state="done"
              title="Signup completed"
              description="Seller approved Kadai and returned a WABA ID, a phone number ID and an exchangeable code."
            />
            <Step
              n={2}
              state="done"
              title="Access token exchanged"
              description="Traded the code for a seller-scoped business token. Stored encrypted."
            />
            <Step
              n={3}
              state="done"
              title="Webhooks subscribed"
              description="Subscribed to messages, statuses, template updates, account alerts — plus history, contact sync and message echoes for coexistence."
            />
            <Step
              n={4}
              state="done"
              title="Number registered"
              description="Registered on Cloud API with a two-step verification PIN."
            />
            <Step
              n={5}
              state="blocked"
              title="Payment method on the seller's WhatsApp account"
              description="Meta bills the seller directly because we are a Tech Provider, not a Solution Partner. Until a card is attached, no charged template will send."
              action={
                <div className="flex gap-2 flex-wrap">
                  <Button variant="secondary" className="gap-1.5">
                    <CreditCard size={14} /> Send the seller a walkthrough
                  </Button>
                  <Button variant="ghost">Check again</Button>
                </div>
              }
            />
            <Step
              n={6}
              state="todo"
              title="First test message"
              description="Confirms the whole pipe works before the seller trusts it with real customers."
            />
          </Card>

          <Card className="mt-3 px-4 py-3.5 bg-secondary/40">
            <div className="flex items-start gap-2.5">
              <ShieldCheck size={16} className="text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Removing the card step</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  A Multi-Partner Solution with a Solution Partner would let their credit
                  line cover our sellers, deleting step 5 entirely. It is the single
                  biggest drop-off in this flow and the highest-value business decision
                  open to us right now.
                </p>
              </div>
            </div>
          </Card>
        </Section>

        {/* ── Partner capacity ─────────────────────────────────────────── */}
        <Section
          title="Our onboarding capacity"
          description="Meta caps how many new sellers a partner can onboard each week. Completing Access Verification raises it twentyfold."
        >
          <Card className="px-4 py-3">
            <Row
              label="Sellers onboarded this week"
              hint="Rolling 7-day window, newly onboarded only"
              value={<span className="tabular-nums font-medium">7 / 10</span>}
            />
            <Row
              label="Business Verification"
              value={<Chip tone="green">Done</Chip>}
            />
            <Row
              label="App Review"
              hint="whatsapp_business_messaging + whatsapp_business_management, advanced access"
              value={<Chip tone="green">Approved</Chip>}
            />
            <Row
              label="Access Verification"
              hint="The remaining gate. Passing it raises the cap from 10 to 200 sellers per week."
              value={<Chip tone="amber">Not started</Chip>}
            />
          </Card>
          <div className="mt-2.5">
            <Meter value={7} max={10} tone="amber" />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              At 7 of 10 we are three sellers from being blocked for the rest of the week.
            </p>
          </div>
        </Section>

        {/* ── Two-step PIN ─────────────────────────────────────────────── */}
        <Section
          title="Two-step verification PIN"
          description="Meta requires a 6-digit PIN on every registered number. Keep it somewhere the seller can find it — re-registration needs it."
        >
          <Card className="px-4 py-3.5">
            <div className="max-w-56">
              <Field label="6-digit PIN">
                <Input
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  className="font-mono tracking-[0.3em]"
                  inputMode="numeric"
                />
              </Field>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button disabled={pin.length !== 6} onClick={() => toast("PIN updated")}>
                Update PIN
              </Button>
              <span className="text-xs text-muted-foreground">Currently set</span>
            </div>
          </Card>
        </Section>

        {/* ── Synced data ──────────────────────────────────────────────── */}
        <Section
          title="What we pulled across"
          description="Only for sellers who came in on the coexistence path. Contacts land in Customers, chats land in Chats."
        >
          <Card className="px-4 py-3">
            <Row label="Contacts imported" value={<span className="tabular-nums">318</span>} />
            <Row label="Messages imported" value={<span className="tabular-nums">1,204</span>} hint="Last 6 months of 1:1 chats" />
            <Row label="Group chats" value={<span className="text-muted-foreground">Not synced</span>} hint="Meta does not sync groups" />
            <Row
              label="Ongoing mirroring"
              value={<Chip tone="green">On</Chip>}
              hint="Messages the seller sends from their phone still appear in Kadai"
            />
          </Card>
          <div className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
            <Users size={14} />
            <span>Imported contacts are opted-in only where we have a record of them messaging first.</span>
          </div>
        </Section>
      </PlatformPage>
    </Shell>
  )
}
