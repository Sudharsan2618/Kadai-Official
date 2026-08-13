"use client"

/* /connect — "can I send right now, and if not, why not?"
   The seller (not an operator) manages their own WhatsApp connection here.
   /onboarding is the first-run wizard; this is where you come back when
   something needs checking or fixing. Every block earns its place by either
   answering that question, fixing it, or being the thing you came to change. */

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Smartphone, Sparkles, CreditCard, BadgeCheck, RefreshCw, Send, History,
  AlertTriangle, CheckCircle2, Link2Off, Loader2, ExternalLink,
} from "lucide-react"
import { Shell } from "@/components/shell"
import { cn, Card, Chip, Button, Input, Field, FieldError } from "@/components/ui"
import { Section } from "@/components/platform"
import { toast, toastError } from "@/components/toaster"
import { get, post } from "@/lib/api"

type Path = "coexist" | "fresh"

/* Meta help pages the blockers link out to. These are the only places a seller
   can actually resolve these — neither is fixable inside Kadai. */
const META_BILLING = "https://www.facebook.com/business/help/488291839463771"
const META_DISPLAY_NAME = "https://www.facebook.com/business/help/378834799515077"
/* Meta gives no API for the test-number allow list — a recipient has to be added
   by hand and verify a code, which is the point of the restriction. All we can do
   is send the seller straight to the one screen where it's possible. */
const metaDevConsole = (appId: string) =>
  `https://developers.facebook.com/apps/${appId}/whatsapp-business/wa-dev-console/`

const BLOCKER_ICON: Record<string, any> = {
  payment_method: CreditCard,
  display_name: BadgeCheck,
  token_expired: RefreshCw,
  not_registered: Smartphone,
}

const SYNC_LABEL: Record<string, string> = {
  pending: "Bringing your chats across…",
  done: "Chats and contacts are in",
  failed: "Sync didn't finish",
  skipped: "You chose not to share chat history",
  none: "Not started",
}

export default function ConnectPage() {
  const [status, setStatus] = useState<any | null>(null)
  const [waCfg, setWaCfg] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [path, setPath] = useState<Path>("coexist")
  const [busy, setBusy] = useState<string>("")
  const [testPhone, setTestPhone] = useState("")
  const [testError, setTestError] = useState("")
  // A Meta rejection comes back as a 200 with guidance rather than an error
  // string, so the screen can show the fix instead of a "(#131030)" code.
  const [testProblem, setTestProblem] = useState<any | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const codeRef = useRef("")
  const assetsRef = useRef<{ waba_id?: string; phone_number_id?: string }>({})
  // The Meta message listener is registered once, so anything it reads has to
  // come from a ref — a closed-over `path` would always be the first render's.
  const pathRef = useRef<Path>("coexist")
  pathRef.current = path

  const loadStatus = useCallback(() =>
    get("/wa/onboarding-status")
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false)), [])

  useEffect(() => {
    get("/wa/config").then(setWaCfg).catch(() => {})
    loadStatus()
  }, [loadStatus])

  /* ── Meta Embedded Signup ─────────────────────────────────────────────── */
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

  const completeConnect = useCallback(() => {
    if (!codeRef.current || !assetsRef.current.waba_id || !assetsRef.current.phone_number_id) return
    post("/onboarding/connect", { code: codeRef.current, ...assetsRef.current, path: pathRef.current })
      .then(() => {
        toast(pathRef.current === "coexist"
          ? "Connected — bringing your chats across"
          : "WhatsApp connected")
        loadStatus()
      })
      .catch((e) => toastError(e instanceof Error ? e.message : "Couldn't connect — try again"))
      .finally(() => setBusy(""))
  }, [loadStatus])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return
      let data: any
      try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data } catch { return }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return
      if (data.event === "CANCEL") {
        setBusy("")
        toastError(data.data?.error_message || "WhatsApp setup was cancelled")
        return
      }
      const assets = data.data || {}
      if (assets.waba_id || assets.phone_number_id) {
        assetsRef.current = { waba_id: assets.waba_id, phone_number_id: assets.phone_number_id }
        completeConnect()
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [completeConnect])

  const launch = async () => {
    if (waCfg?.mode !== "cloud") {
      toast("Running in demo mode — no real WhatsApp account is connected")
      return
    }
    if (!waCfg.app_id || !waCfg.config_id) {
      toastError("WhatsApp setup isn't configured on the server yet")
      return
    }
    setBusy("connect")
    codeRef.current = ""
    assetsRef.current = {}
    await loadFbSdk()
    window.FB.login((response: any) => {
      const code = response?.authResponse?.code
      if (!code) { setBusy(""); return }
      codeRef.current = code
      completeConnect()
    }, {
      config_id: waCfg.config_id,
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {}, sessionInfoVersion: "3", version: "v4",
        featureType: path === "coexist" ? "whatsapp_business_app_onboarding" : "",
      },
    })
  }

  /* ── Actions ──────────────────────────────────────────────────────────── */
  const run = (key: string, p: Promise<any>, ok: string) => {
    setBusy(key)
    p.then(() => { toast(ok); loadStatus() })
      .catch((e) => toastError(e instanceof Error ? e.message : "That didn't work — try again"))
      .finally(() => setBusy(""))
  }

  const sendTest = () => {
    setTestError("")
    setTestProblem(null)
    setBusy("test")
    post("/wa/test-message", testPhone ? { phone: testPhone } : {})
      .then((r: any) => {
        if (r?.sent === false) { setTestProblem(r); loadStatus(); return }
        toast("Message sent — check that phone")
        loadStatus()
      })
      .catch((e) => setTestError(e instanceof Error ? e.message : "Couldn't send"))
      .finally(() => setBusy(""))
  }

  const openMeta = (url: string) => window.open(url, "_blank", "noopener")

  const actionButton = (action: string) => {
    switch (action) {
      case "billing": return <Button variant="secondary" onClick={() => openMeta(META_BILLING)}>
        Open Meta billing <ExternalLink size={13} /></Button>
      case "display_name": return <Button variant="secondary" onClick={() => openMeta(META_DISPLAY_NAME)}>
        Set display name <ExternalLink size={13} /></Button>
      case "allow_list": return <Button variant="secondary"
        onClick={() => openMeta(metaDevConsole(waCfg?.app_id || ""))}>
        Add the number in Meta <ExternalLink size={13} /></Button>
      case "reconnect": return <Button onClick={launch} disabled={busy === "connect"}>
        {busy === "connect" ? "Opening…" : "Reconnect WhatsApp"}</Button>
      case "register": return <Button variant="secondary" disabled={busy === "register"}
        onClick={() => run("register", post("/wa/register", {}), "Number registered")}>
        {busy === "register" ? "Registering…" : "Finish registering"}</Button>
      default: return null
    }
  }

  /* ── Render ───────────────────────────────────────────────────────────── */
  if (loading) {
    return <Shell title="WhatsApp"><div className="max-w-3xl mx-auto px-4 md:px-6 py-16 flex justify-center">
      <Loader2 size={20} className="animate-spin text-muted-foreground" />
    </div></Shell>
  }

  const connected = !!status?.connected
  const blocking = (status?.blockers || []).filter((b: any) => b.severity === "blocking")
  const unknowns = (status?.blockers || []).filter((b: any) => b.severity === "unknown")
  const canSend = !!status?.can_send

  return (
    <Shell title="WhatsApp">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-5">

        {!connected ? (
          /* ── Not connected: one decision, one action ─────────────────── */
          <>
            <h2 className="text-lg font-medium">Connect your WhatsApp</h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-xl">
              Kadai sends and receives on your shop&apos;s WhatsApp number. Choose which
              number to use — this is the one thing that&apos;s hard to change later.
            </p>

            <div className="grid sm:grid-cols-2 gap-3 mt-5">
              {([
                ["coexist", Smartphone, "The number I use today",
                  "Keeps your WhatsApp Business app working. Your chats and contacts come with you.", "Most sellers"],
                ["fresh", Sparkles, "A new number for the shop",
                  "Keeps shop messages separate from your personal WhatsApp.", ""],
              ] as const).map(([id, Icon, title, hint, badge]) => (
                <button
                  key={id}
                  onClick={() => setPath(id as Path)}
                  className={cn(
                    "text-left rounded-xl border p-4 transition-all bg-white",
                    path === id ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-input",
                  )}
                >
                  {badge && <Chip tone="blue" className="mb-2">{badge}</Chip>}
                  <div className="flex items-start gap-2.5">
                    <Icon size={17} className={cn("shrink-0 mt-0.5", path === id ? "text-primary" : "text-muted-foreground")} />
                    <div>
                      <p className="text-sm font-medium">{title}</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{hint}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {path === "coexist" && (
              <div className="mt-3 flex items-start gap-2 text-xs text-warning-text bg-warning-soft rounded-lg px-3 py-2.5">
                <AlertTriangle size={14} className="shrink-0 mt-px" />
                <p className="leading-relaxed">
                  Your WhatsApp broadcast lists stop working once you connect — that&apos;s
                  Meta&apos;s rule, not ours. Kadai&apos;s Broadcast replaces them and reaches
                  the same people.
                </p>
              </div>
            )}

            <Button className="mt-4" onClick={launch} disabled={busy === "connect"}>
              {busy === "connect" ? "Opening WhatsApp setup…" : "Connect WhatsApp"}
            </Button>
          </>
        ) : (
          /* ── Connected: verdict, then only what's blocking ───────────── */
          <>
            <Card className={cn("px-5 py-4", canSend
              ? "bg-success-soft border-success/20"
              : "bg-warning-soft border-warning/20")}>
              <div className="flex items-start gap-3">
                {canSend
                  ? <CheckCircle2 size={20} className="text-success-text shrink-0 mt-0.5" />
                  : <AlertTriangle size={20} className="text-warning-text shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <p className={cn("text-base font-medium",
                    canSend ? "text-success-text" : "text-warning-text")}>
                    {canSend ? "You can send messages" : "You can't send messages yet"}
                  </p>
                  <p className={cn("text-xs mt-1 leading-relaxed",
                    canSend ? "text-success-text" : "text-warning-text")}>
                    {canSend
                      ? status?.test_message_sent_at
                        ? "Your number is live and a test message has gone through."
                        : "Everything is set up. Send a test message below to be sure."
                      : `${blocking.length} thing${blocking.length === 1 ? "" : "s"} needs fixing. ${
                          blocking.every((b: any) => b.action === "billing" || b.action === "display_name")
                            ? "Both are done on Meta's side, not in Kadai." : ""}`}
                  </p>
                </div>
              </div>
            </Card>

            {(blocking.length > 0 || unknowns.length > 0) && (
              <Card className="mt-3 px-5 py-1">
                {[...blocking, ...unknowns].map((b: any) => {
                  const Icon = BLOCKER_ICON[b.key] || AlertTriangle
                  return (
                    <div key={b.key} className="flex gap-3 py-3.5 border-b border-border last:border-0">
                      <Icon size={17} className={cn("shrink-0 mt-0.5",
                        b.severity === "blocking" ? "text-warning-text" : "text-muted-foreground")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{b.title}</p>
                          {b.severity === "unknown" && <Chip tone="gray">Not confirmed</Chip>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{b.detail}</p>
                        <div className="mt-2.5">{actionButton(b.action)}</div>
                      </div>
                    </div>
                  )
                })}
              </Card>
            )}

            {/* Test message — the only proof that any of this works */}
            <Section
              title="Send a test message"
              description="One real WhatsApp message from your shop number. If it arrives, everything works."
            >
              <Card className="px-4 py-4">
                {status?.test_message_sent_at && (
                  <p className="text-xs text-success-text flex items-center gap-1.5 mb-3">
                    <CheckCircle2 size={13} /> Last sent {new Date(status.test_message_sent_at)
                      .toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </p>
                )}
                <div className="flex gap-2 items-end flex-wrap">
                  <div className="flex-1 min-w-52">
                    <Field label="Send to">
                      <Input
                        value={testPhone}
                        onChange={(e) => { setTestPhone(e.target.value); setTestError(""); setTestProblem(null) }}
                        placeholder="Your personal WhatsApp number"
                        inputMode="numeric"
                      />
                    </Field>
                  </div>
                  <Button onClick={sendTest} disabled={busy === "test"}>
                    <Send size={14} /> {busy === "test" ? "Sending…" : "Send"}
                  </Button>
                </div>
                <FieldError error={testError} />

                {/* Meta rejected it — explain in the seller's terms and point at
                    the only screen where it can actually be fixed. */}
                {testProblem && (
                  <div className="mt-3 rounded-lg bg-warning-soft px-3 py-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={15} className="text-warning-text shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-warning-text">{testProblem.title}</p>
                        <p className="text-xs text-warning-text mt-1 leading-relaxed">{testProblem.detail}</p>
                        {testProblem.action === "allow_list" && (
                          <ol className="text-xs text-warning-text mt-2 space-y-1 list-decimal pl-4 leading-relaxed">
                            <li>Open the Meta dashboard below</li>
                            <li>Under <span className="font-medium">To</span>, choose <span className="font-medium">Manage phone number list</span></li>
                            <li>Add <span className="font-mono">{testPhone || "the number"}</span> and send the code</li>
                            <li>Enter the code WhatsApp sends to that phone</li>
                            <li>Come back here and send again</li>
                          </ol>
                        )}
                        <div className="mt-2.5">{actionButton(testProblem.action)}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Say this before they hit it, not only after. */}
                {status?.is_test_number && !testProblem && (
                  <p className="text-[11px] text-muted-foreground mt-2.5 leading-relaxed">
                    This is a Meta test number, so it can only message people you&apos;ve added
                    to its list in the Meta dashboard. A real shop number has no such limit.
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  Use a different phone from your shop number — WhatsApp won&apos;t let a
                  number message itself.
                </p>
              </Card>
            </Section>

            {/* Coexistence — only when the seller kept their Business app */}
            {status?.coexisting && (
              <Section
                title="Your existing chats"
                description="Everything from your WhatsApp Business app, brought across when you connected."
              >
                <Card className="px-4 py-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <History size={17} className="text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium">
                          {SYNC_LABEL[status.history_sync_status] || "Not started"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                          {(status.contacts_synced ?? 0).toLocaleString("en-IN")} contacts ·{" "}
                          {(status.messages_synced ?? 0).toLocaleString("en-IN")} messages
                        </p>
                      </div>
                    </div>
                    {["failed", "none"].includes(status.history_sync_status) && (
                      <Button variant="secondary" disabled={busy === "sync"}
                        onClick={() => run("sync", post("/wa/sync-history", {}), "Sync restarted")}>
                        {busy === "sync" ? "Starting…" : "Try again"}
                      </Button>
                    )}
                  </div>
                  {status.history_sync_status === "pending" && (
                    <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                      Keep your phone on and connected to WiFi until this finishes. Meta only
                      allows this in the first 24 hours after connecting.
                    </p>
                  )}
                  {status.history_sync_status === "skipped" && (
                    <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                      Your past chats stayed on your phone. New messages still appear in Kadai
                      from now on.
                    </p>
                  )}
                  <p className="text-[11px] text-faint mt-3 leading-relaxed">
                    Group chats aren&apos;t brought across — Meta doesn&apos;t share them.
                  </p>
                </Card>
              </Section>
            )}

            {/* The number itself */}
            <Section
              title="Your number"
              description="What customers see, and what Meta has on record for this connection."
            >
              <Card className="px-4 py-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium tabular-nums">
                        {status.display_number || "Number pending"}
                      </p>
                      {status.is_test_number && <Chip tone="amber">Meta test number</Chip>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {status.verified_name || "No display name yet"}
                      {status.coexisting ? " · WhatsApp Business app kept" : " · new number"}
                    </p>
                  </div>
                  <Button variant="ghost" disabled={busy === "health"}
                    onClick={() => run("health", post("/wa/refresh-health", {}), "Refreshed from Meta")}>
                    <RefreshCw size={13} className={busy === "health" ? "animate-spin" : ""} /> Refresh
                  </Button>
                </div>
                <div className="grid sm:grid-cols-3 gap-4 border-t border-border mt-3.5 pt-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Display name</p>
                    <p className="text-xs mt-0.5">
                      {status.name_status
                        ? status.name_status.replace(/_/g, " ").toLowerCase()
                        : "not checked yet"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Quality</p>
                    <p className="text-xs mt-0.5">{status.quality_rating?.toLowerCase() || "not rated yet"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Business account</p>
                    <p className="text-xs mt-0.5 font-mono truncate">{status.waba_id || "—"}</p>
                  </div>
                </div>
              </Card>
            </Section>

            {/* Disconnect — destructive, so it asks */}
            <Section
              title="Disconnect"
              description="Detaches this number from Kadai. Your customers, chats and orders stay."
            >
              <Card className="px-4 py-4">
                {!confirmDisconnect ? (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
                      You&apos;ll stop sending and receiving on WhatsApp until you connect
                      again. Reconnecting means going through Meta&apos;s setup once more.
                    </p>
                    <Button variant="secondary" onClick={() => setConfirmDisconnect(true)}>
                      <Link2Off size={14} /> Disconnect
                    </Button>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium">
                      Disconnect {status.display_number || "this number"}?
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {status.coexisting
                        ? "Your WhatsApp Business app keeps working as normal. Chats already brought across stay in Kadai."
                        : "Messages already in Kadai stay. New ones stop arriving."}
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button variant="danger" disabled={busy === "disconnect"}
                        onClick={() => {
                          setConfirmDisconnect(false)
                          run("disconnect", post("/wa/disconnect", {}), "WhatsApp disconnected")
                        }}>
                        {busy === "disconnect" ? "Disconnecting…" : "Yes, disconnect"}
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmDisconnect(false)}>Keep it connected</Button>
                    </div>
                  </div>
                )}
              </Card>
            </Section>
          </>
        )}
      </div>
    </Shell>
  )
}
