"use client"

/* /connect — "can I send right now, and if not, why not?"
   The seller manages their own WhatsApp connection here. Linking is a single
   step: scan a QR (or enter a pairing code) with the phone whose WhatsApp you
   want Kadai to send and receive on. No Meta, no templates, no billing — it is
   WhatsApp Web, the same link you use on a laptop. */

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Smartphone, Send, CheckCircle2, Link2Off, Loader2, QrCode,
} from "lucide-react"
import { Shell } from "@/components/shell"
import { cn, Card, Button, Input, Field, FieldError } from "@/components/ui"
import { Section } from "@/components/platform"
import { toast, toastError } from "@/components/toaster"
import { get, post } from "@/lib/api"

const POLL_MS = 2000

export default function ConnectPage() {
  const [status, setStatus] = useState<any | null>(null)
  const [waCfg, setWaCfg] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string>("")
  const [testPhone, setTestPhone] = useState("")
  const [testError, setTestError] = useState("")
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  // Linking state: the QR/pairing code the gateway is currently showing.
  const [linking, setLinking] = useState(false)
  const [link, setLink] = useState<{ status?: string; qr?: string; code?: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadStatus = useCallback(() =>
    get("/wa/onboarding-status")
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false)), [])

  useEffect(() => {
    get("/wa/config").then(setWaCfg).catch(() => {})
    loadStatus()
  }, [loadStatus])

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  // Poll the gateway for the QR/pairing code and the moment the link goes live.
  const poll = useCallback(() => {
    get("/wa/link/status")
      .then((r: any) => {
        setLink(r)
        if (r?.status === "linked") {
          stopPolling()
          setLinking(false)
          toast("WhatsApp connected")
          loadStatus()
        }
      })
      .catch(() => {})
  }, [loadStatus, stopPolling])

  const startLink = useCallback(() => {
    if (waCfg?.mode === "mock") {
      // Demo mode has no gateway — the connect endpoint just marks it linked.
      setBusy("connect")
      post("/onboarding/connect", {})
        .then(() => { toast("Running in demo mode — connected"); loadStatus() })
        .catch((e) => toastError(e instanceof Error ? e.message : "Couldn't connect"))
        .finally(() => setBusy(""))
      return
    }
    setBusy("connect")
    setLink(null)
    post("/wa/link/start", testPhone ? { phone: testPhone } : {})
      .then(() => {
        setLinking(true)
        stopPolling()
        poll()
        pollRef.current = setInterval(poll, POLL_MS)
      })
      .catch((e) => toastError(e instanceof Error ? e.message : "Couldn't start linking"))
      .finally(() => setBusy(""))
  }, [waCfg, testPhone, poll, stopPolling, loadStatus])

  useEffect(() => stopPolling, [stopPolling])

  /* ── Actions ──────────────────────────────────────────────────────────── */
  const run = (key: string, p: Promise<any>, ok: string) => {
    setBusy(key)
    p.then(() => { toast(ok); loadStatus() })
      .catch((e) => toastError(e instanceof Error ? e.message : "That didn't work — try again"))
      .finally(() => setBusy(""))
  }

  const sendTest = () => {
    setTestError("")
    setBusy("test")
    post("/wa/test-message", testPhone ? { phone: testPhone } : {})
      .then(() => { toast("Message sent — check that phone"); loadStatus() })
      .catch((e) => setTestError(e instanceof Error ? e.message : "Couldn't send"))
      .finally(() => setBusy(""))
  }

  const disconnect = () => {
    setConfirmDisconnect(false)
    stopPolling()
    setLinking(false)
    setLink(null)
    run("disconnect", post("/wa/disconnect", {}), "WhatsApp disconnected")
  }

  /* ── Render ───────────────────────────────────────────────────────────── */
  if (loading) {
    return <Shell title="WhatsApp"><div className="max-w-3xl mx-auto px-4 md:px-6 py-16 flex justify-center">
      <Loader2 size={20} className="animate-spin text-muted-foreground" />
    </div></Shell>
  }

  const connected = !!status?.connected

  return (
    <Shell title="WhatsApp">
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-5">

        {!connected ? (
          /* ── Not connected: scan a QR to link ────────────────────────── */
          <>
            <h2 className="text-lg font-medium">Connect your WhatsApp</h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-xl">
              Link the phone whose WhatsApp number your shop uses. Kadai then sends and
              receives on that number — it&apos;s the same linked-device setup as WhatsApp
              on a laptop. Nothing to pay, no Meta account needed.
            </p>

            {!linking ? (
              <>
                <div className="mt-5 max-w-xs">
                  <Field label="Shop WhatsApp number (optional)">
                    <Input
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder="e.g. 9843000001"
                      inputMode="numeric"
                    />
                  </Field>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                    Enter it to get an 8-digit pairing code instead of a QR. Leave blank to
                    scan a QR code.
                  </p>
                </div>
                <Button className="mt-4" onClick={startLink} disabled={busy === "connect"}>
                  <QrCode size={15} /> {busy === "connect" ? "Starting…" : "Connect WhatsApp"}
                </Button>
              </>
            ) : (
              <Card className="mt-5 px-5 py-5">
                <div className="flex flex-col items-center text-center">
                  {link?.qr ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={link.qr} alt="WhatsApp QR code" width={240} height={240}
                        className="rounded-lg border border-border" />
                      <p className="text-sm font-medium mt-4">Scan this with WhatsApp</p>
                      <ol className="text-xs text-muted-foreground mt-2 space-y-1 text-left leading-relaxed">
                        <li>1. Open WhatsApp on your shop phone</li>
                        <li>2. Tap <span className="font-medium">Settings → Linked devices</span></li>
                        <li>3. Tap <span className="font-medium">Link a device</span> and scan this code</li>
                      </ol>
                    </>
                  ) : link?.code ? (
                    <>
                      <p className="text-sm font-medium">Enter this pairing code in WhatsApp</p>
                      <p className="text-3xl font-mono tracking-[0.3em] mt-3 tabular-nums">{link.code}</p>
                      <p className="text-xs text-muted-foreground mt-3 leading-relaxed max-w-xs">
                        WhatsApp → Settings → Linked devices → Link a device → Link with phone
                        number instead.
                      </p>
                    </>
                  ) : (
                    <div className="py-10 flex flex-col items-center gap-3">
                      <Loader2 size={22} className="animate-spin text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Preparing your code…</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-5 text-xs text-muted-foreground">
                    <Loader2 size={13} className="animate-spin" /> Waiting for you to scan…
                  </div>
                  <Button variant="ghost" className="mt-3" onClick={() => { stopPolling(); setLinking(false); setLink(null) }}>
                    Cancel
                  </Button>
                </div>
              </Card>
            )}
          </>
        ) : (
          /* ── Connected ────────────────────────────────────────────────── */
          <>
            <Card className="px-5 py-4 bg-success-soft border-success/20">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={20} className="text-success-text shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-base font-medium text-success-text">You can send messages</p>
                  <p className="text-xs mt-1 leading-relaxed text-success-text">
                    Your WhatsApp is linked. Send a test message below to be sure.
                  </p>
                </div>
              </div>
            </Card>

            {/* Test message — the only proof that any of this works */}
            <Section
              title="Send a test message"
              description="One real WhatsApp message from your shop number. If it arrives, everything works."
            >
              <Card className="px-4 py-4">
                <div className="flex gap-2 items-end flex-wrap">
                  <div className="flex-1 min-w-52">
                    <Field label="Send to">
                      <Input
                        value={testPhone}
                        onChange={(e) => { setTestPhone(e.target.value); setTestError("") }}
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
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  Use a different phone from your shop number — WhatsApp won&apos;t let a
                  number message itself.
                </p>
              </Card>
            </Section>

            {/* The number itself */}
            <Section title="Your number" description="The WhatsApp number Kadai is linked to.">
              <Card className="px-4 py-4">
                <div className="flex items-center gap-2.5">
                  <Smartphone size={17} className="text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium tabular-nums">
                      {status.display_number || status.number || "Linked"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Linked device · WhatsApp Web</p>
                  </div>
                </div>
              </Card>
            </Section>

            {/* Disconnect — destructive, so it asks */}
            <Section
              title="Disconnect"
              description="Unlinks this number from Kadai. Your customers, chats and orders stay."
            >
              <Card className="px-4 py-4">
                {!confirmDisconnect ? (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
                      You&apos;ll stop sending and receiving on WhatsApp until you link again.
                      Reconnecting just means scanning the QR once more.
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
                      Messages already in Kadai stay. New ones stop arriving until you link again.
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button variant="danger" disabled={busy === "disconnect"} onClick={disconnect}>
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
