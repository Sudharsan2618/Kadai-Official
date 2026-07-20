"use client"

import { type ReactNode } from "react"

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ")
}

export function Button({
  children, onClick, variant = "primary", disabled, className, type = "button",
}: {
  children: ReactNode
  onClick?: () => void
  variant?: "primary" | "secondary" | "ghost" | "danger"
  disabled?: boolean
  className?: string
  type?: "button" | "submit"
}) {
  const styles = {
    primary: "bg-action text-white hover:bg-action-hover",
    secondary: "bg-secondary text-foreground hover:bg-border",
    ghost: "text-foreground hover:bg-secondary",
    danger: "bg-destructive text-white hover:opacity-90",
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium px-3 h-8 transition-colors disabled:opacity-50 disabled:pointer-events-none",
        styles[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}

const chipStyles = {
  green: "bg-success-soft text-success-text",
  red: "bg-destructive-soft text-destructive-text",
  amber: "bg-warning-soft text-warning-text",
  blue: "bg-info-soft text-info-text",
  neutral: "bg-border text-foreground",
  gray: "bg-secondary text-muted-foreground",
} as const

export function Chip({ tone = "neutral", children, className }: {
  tone?: keyof typeof chipStyles
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-sm whitespace-nowrap", chipStyles[tone], className)}>
      {children}
    </span>
  )
}

export function Dot({ color = "var(--success)" }: { color?: string }) {
  return <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("card", className)}>{children}</div>
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {action}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full bg-secondary text-foreground text-sm rounded-sm px-3 h-9 outline-none border border-transparent focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-faint",
        props.className,
      )}
    />
  )
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full bg-secondary text-foreground text-sm rounded-sm px-3 py-2 outline-none border border-transparent focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-faint resize-none",
        props.className,
      )}
    />
  )
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
  return (
    <div className={cn("w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-[11px] font-semibold text-muted-foreground shrink-0", className)}>
      {initials}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse bg-secondary rounded-md", className)} />
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center px-4">
      <p className="text-sm font-medium text-destructive-text">Couldn't load this</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-64">
        {message || "Check your connection and try again."}
      </p>
      <Button variant="secondary" className="mt-3" onClick={onRetry}>Try again</Button>
    </div>
  )
}

export function FieldError({ error }: { error?: string }) {
  if (!error) return null
  return <p className="text-xs text-destructive-text mt-1">{error}</p>
}

export function EmptyState({ icon, title, hint, action }: {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center px-4">
      {icon && <div className="text-faint mb-2">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1 max-w-60">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function timeAgo(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

export function timeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
}

export function rupees(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`
}

export function windowLeft(expiresAt: string | null): string {
  if (!expiresAt) return ""
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return "closed"
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`
}

export const ORDER_STATUS: Record<string, { label: string; tone: "green" | "red" | "amber" | "blue" | "neutral" | "gray" }> = {
  new: { label: "New", tone: "blue" },
  packed: { label: "Packed", tone: "neutral" },
  payment_due: { label: "Payment due", tone: "amber" },
  paid: { label: "Paid", tone: "green" },
  delivered: { label: "Delivered", tone: "green" },
  cancelled: { label: "Cancelled", tone: "gray" },
}
