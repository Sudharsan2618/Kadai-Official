"use client"

import { type ReactNode } from "react"
import { API } from "@/lib/api"

/** Centered card used by login + signup. Left brand strip on desktop. */
export function AuthShell({ title, subtitle, children, footer }: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="min-h-dvh flex">
      {/* Brand panel — desktop only */}
      <div className="hidden lg:flex flex-col justify-between w-[42%] bg-action text-white p-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white text-action flex items-center justify-center text-sm font-bold">K</div>
          <span className="text-base font-semibold">Kadai</span>
        </div>
        <div>
          <h2 className="text-2xl font-semibold leading-snug max-w-sm">
            Your shop, running on WhatsApp.
          </h2>
          <p className="text-sm text-white/70 mt-3 max-w-sm">
            Chats, broadcasts, orders and customers — all in one place, built for how you already sell.
          </p>
        </div>
        <p className="text-xs text-white/50">Made for small shops across India.</p>
      </div>

      {/* Form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-6 justify-center">
            <div className="w-8 h-8 rounded-lg bg-action text-white flex items-center justify-center text-sm font-bold">K</div>
            <span className="text-base font-semibold">Kadai</span>
          </div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-5 text-sm text-center text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  )
}

/** "Continue with Google" — sends the browser to the backend OAuth entrypoint. */
export function GoogleButton() {
  return (
    <a
      href={`${API}/auth/google/login`}
      className="flex items-center justify-center gap-2 w-full h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors"
    >
      <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.6-3.4-11.3-8.1l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C41.4 35.9 44 30.5 44 24c0-1.3-.1-2.3-.4-3.5z"/>
      </svg>
      Continue with Google
    </a>
  )
}
