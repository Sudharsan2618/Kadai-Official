"use client"

/* Product tour — a spotlight walkthrough of the app, no library.
   Targets carry data-tour="…" attributes (Shell nav + header). Each step cuts
   a rounded hole over its target (box-shadow trick) and pins a card next to
   it. Steps whose target isn't visible (e.g. desktop rail on mobile) render
   as a centered card, so the tour works on every screen size.
   Auto-starts once for new users (localStorage), replayable from the header. */

import { useState, useEffect, useCallback, useLayoutEffect } from "react"
import { X } from "lucide-react"
import { cn, Button } from "@/components/ui"

export const TOUR_DONE_KEY = "kadai.tour.done"

type Step = { target: string; title: string; body: string }

const STEPS: Step[] = [
  { target: "", title: "Welcome to Kadai 👋", body: "Your whole shop, run from one WhatsApp number — chats, orders, customers and daily broadcasts. This quick tour shows you around (about a minute)." },
  { target: "today", title: "Today", body: "Your morning glance: today's sales, orders, who's waiting for a reply, and how your last broadcast performed." },
  { target: "chats", title: "Chats", body: "Every customer WhatsApp message lands here live. Reply free-form inside the 24-hour window, or send a ready message anytime." },
  { target: "broadcast", title: "Broadcast", body: "Send today's stock or offers to many customers at once — paced safely, with delivered/read/replied counts per person." },
  { target: "orders", title: "Orders", body: "Track every order from new → packed → paid → delivered. Payment reminders are one tap away." },
  { target: "customers", title: "Customers", body: "Your customer book: who buys what, how much they've spent, and any pending dues — built automatically from chats and orders." },
  { target: "catalog", title: "Catalog", body: "Your items and prices. Mark things out of stock and your stock broadcasts stay accurate." },
  { target: "wa-status", title: "WhatsApp status", body: "Green means your business number is connected and sending. Manage the connection in Settings." },
  { target: "settings", title: "Settings", body: "Shop details, your WhatsApp connection, and ready messages — pre-written texts you can send even when a chat is quiet." },
  { target: "billing", title: "Billing", body: "One simple plan, pay by UPI or card. Your payment history lives here too." },
  { target: "", title: "You're all set 🎉", body: "Start by adding a few customers and items, then send your first broadcast. You can replay this tour anytime from the header." },
]

function findTarget(name: string): HTMLElement | null {
  if (!name) return null
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)
  for (const el of nodes) {
    // pick the visible instance (desktop rail vs mobile tabs)
    if (el.offsetParent !== null) return el
  }
  return null
}

export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const finish = useCallback(() => {
    localStorage.setItem(TOUR_DONE_KEY, "1")
    setStep(0)
    onClose()
  }, [onClose])

  const measure = useCallback(() => {
    const el = findTarget(STEPS[step]?.target || "")
    if (el) {
      el.scrollIntoView({ block: "nearest" })
      setRect(el.getBoundingClientRect())
    } else {
      setRect(null)
    }
  }, [step])

  useLayoutEffect(() => {
    if (!open) return
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [open, measure])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish()
      if (e.key === "ArrowRight" || e.key === "Enter") setStep((s) => Math.min(s + 1, STEPS.length - 1))
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, finish])

  if (!open) return null

  const s = STEPS[step]
  const last = step === STEPS.length - 1
  const pad = 6

  // Card placement: right of the hole if there's room, else below, else centered.
  let cardStyle: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
  if (rect) {
    const cardW = 320
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (rect.right + pad + 16 + cardW < vw) {
      cardStyle = {
        left: rect.right + pad + 16,
        top: Math.max(16, Math.min(rect.top + rect.height / 2 - 90, vh - 240)),
      }
    } else {
      cardStyle = {
        left: Math.max(16, Math.min(rect.left + rect.width / 2 - cardW / 2, vw - cardW - 16)),
        top: rect.bottom + pad + 14 + 200 < vh ? rect.bottom + pad + 14 : Math.max(16, rect.top - pad - 14 - 200),
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-label="Product tour">
      {/* spotlight hole — the giant shadow is the dimmer */}
      {rect ? (
        <div
          className="absolute rounded-lg transition-all duration-300 ease-out pointer-events-none ring-2 ring-white/90"
          style={{
            left: rect.left - pad, top: rect.top - pad,
            width: rect.width + pad * 2, height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/55" />
      )}

      {/* click-catcher so the page underneath isn't interactive mid-tour */}
      <div className="absolute inset-0" onClick={() => !last && setStep(step + 1)} />

      {/* step card */}
      <div
        className="absolute w-[320px] max-w-[calc(100vw-32px)] bg-white rounded-xl border border-border shadow-lg p-4 transition-all duration-300 ease-out"
        style={cardStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold">{s.title}</h2>
          <button onClick={finish} title="Close tour" className="p-0.5 -m-0.5 text-muted-foreground hover:text-foreground shrink-0">
            <X size={16} />
          </button>
        </div>
        <p className="text-[13px] text-muted-foreground leading-relaxed mt-1.5">{s.body}</p>

        <div className="flex items-center gap-1 mt-3.5">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              aria-label={`Step ${i + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step ? "w-5 bg-primary" : "w-1.5 bg-border hover:bg-input",
              )}
            />
          ))}
          <span className="ml-auto text-[11px] text-faint">{step + 1} / {STEPS.length}</span>
        </div>

        <div className="flex items-center gap-2 mt-3.5">
          {!last && (
            <button onClick={finish} className="text-xs text-muted-foreground hover:text-foreground px-1">
              Skip tour
            </button>
          )}
          <span className="flex-1" />
          {step > 0 && (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>Back</Button>
          )}
          <Button onClick={() => (last ? finish() : setStep(step + 1))}>
            {last ? "Start selling" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  )
}
