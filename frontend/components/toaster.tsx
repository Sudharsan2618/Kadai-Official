"use client"

/* Global toast system — event-based so any module can fire without context
   threading. Success = quiet dark, error = soft red. Bottom-right on desktop,
   above the tab bar on mobile. */
import { useState, useEffect } from "react"
import { CheckCircle2, AlertCircle, X } from "lucide-react"
import { cn } from "@/components/ui"

export type ToastKind = "success" | "error"

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

let nextId = 1

export function toast(message: string, kind: ToastKind = "success") {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("kadai:toast", { detail: { id: nextId++, kind, message } }))
}

export const toastError = (message: string) => toast(message, "error")

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const onToast = (e: Event) => {
      const item = (e as CustomEvent).detail as ToastItem
      setItems((prev) => [...prev.slice(-3), item])
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== item.id))
      }, item.kind === "error" ? 5000 : 3000)
    }
    window.addEventListener("kadai:toast", onToast)
    return () => window.removeEventListener("kadai:toast", onToast)
  }, [])

  if (items.length === 0) return null

  return (
    <div className="fixed z-100 bottom-16 md:bottom-4 right-3 left-3 md:left-auto md:w-80 flex flex-col gap-2 pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm shadow-md animate-in",
            t.kind === "success"
              ? "bg-foreground text-white border-transparent"
              : "bg-destructive-soft text-destructive-text border-destructive/20",
          )}
          role="status"
        >
          {t.kind === "success"
            ? <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-success" />
            : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
          <span className="flex-1 min-w-0 break-words">{t.message}</span>
          <button
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
            className="shrink-0 opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
