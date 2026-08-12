"use client"

/* Shared primitives for the Platform pages (/connect, /templates, /insights,
   /payments, /growth). These screens are design previews backed by mock data —
   the Meta capabilities they represent are scoped in docs/PRODUCT-SCOPE-2026.md
   and tracked as GitHub issues. Everything here reuses the Carbon token system
   so the previews read as the real product, not as wireframes. */

import { type ReactNode } from "react"
import { FlaskConical } from "lucide-react"
import { cn, Chip } from "@/components/ui"

/** Two-column settings row: label rail left, content right. Mirrors Settings. */
export function Section({ title, description, children }: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="grid md:grid-cols-[210px_1fr] gap-4 md:gap-6 py-5 border-b border-border last:border-0">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Page-top banner marking a screen as a design preview on mock data. */
export function PreviewBanner({ issues }: { issues: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-info-soft text-info-text text-xs">
      <FlaskConical size={15} className="shrink-0 mt-px" />
      <p className="leading-relaxed">
        <span className="font-semibold">Design preview.</span>{" "}
        Mock data preview · test the seller flow before the backend is connected. Scoped as{" "}
        <span className="font-mono">{issues}</span>.
      </p>
    </div>
  )
}

/** Standard page frame: preview banner + constrained column. */
export function PlatformPage({
  issues,
  title,
  description,
  action,
  children,
}: {
  issues: string
  title: string
  description: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-5">
      <PreviewBanner issues={issues} />
      <div className="flex items-end justify-between gap-4 pt-5 pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">WhatsApp workspace</p>
          <h2 className="text-2xl font-semibold tracking-tight mt-1">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>
        </div>
        {action}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  )
}

/** A single metric tile. */
export function Stat({ label, value, sub, tone }: {
  label: string
  value: string
  sub?: string
  tone?: "good" | "warn" | "bad"
}) {
  const toneClass = tone === "good" ? "text-success-text"
    : tone === "warn" ? "text-warning-text"
    : tone === "bad" ? "text-destructive-text"
    : "text-foreground"
  return (
    <div className="card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-semibold mt-1 tabular-nums", toneClass)}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

/** Horizontal progress meter with an optional cap marker. */
export function Meter({ value, max, tone = "blue" }: {
  value: number
  max: number
  tone?: "blue" | "green" | "amber" | "red"
}) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const bg = {
    blue: "var(--primary)",
    green: "var(--success)",
    amber: "var(--warning)",
    red: "var(--destructive)",
  }[tone]
  return (
    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: bg }} />
    </div>
  )
}

/** Numbered step in a setup flow, with done / active / todo states. */
export function Step({ n, title, description, state, action }: {
  n: number
  title: string
  description: string
  state: "done" | "active" | "todo" | "blocked"
  action?: ReactNode
}) {
  const badge = {
    done: "bg-success text-white",
    active: "bg-action text-white",
    todo: "bg-secondary text-faint",
    blocked: "bg-warning-soft text-warning-text",
  }[state]
  return (
    <div className="flex gap-3 py-3 border-b border-border last:border-0">
      <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0", badge)}>
        {state === "done" ? "✓" : n}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn("text-sm", state === "todo" ? "text-muted-foreground" : "font-medium")}>{title}</p>
          {state === "blocked" && <Chip tone="amber">Needs the seller</Chip>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  )
}

/** Simple bar chart for daily series — no chart library, matches the token set. */
export function Bars({ data, unit = "" }: { data: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="flex items-end gap-1.5 h-28">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1 group">
          <div className="w-full flex-1 flex items-end">
            <div
              className="w-full rounded-t-sm bg-primary/80 group-hover:bg-primary transition-colors"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: 2 }}
              title={`${d.label}: ${d.value}${unit}`}
            />
          </div>
          <span className="text-[10px] text-faint">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Row in a definition-style list. */
export function Row({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border last:border-0">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{hint}</p>}
      </div>
      <div className="text-sm text-right shrink-0">{value}</div>
    </div>
  )
}

/** Small labelled toggle used across the platform previews. */
export function Toggle({ on, onChange, label, hint }: {
  on: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="flex items-start justify-between gap-4 w-full py-2.5 text-left border-b border-border last:border-0"
    >
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{hint}</p>}
      </div>
      <span
        className={cn(
          "w-9 h-5 rounded-full shrink-0 transition-colors relative mt-0.5",
          on ? "bg-success" : "bg-input",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all",
            on ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  )
}
