"use client"

import { useState, useEffect, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Sun, MessageCircle, Megaphone, ShoppingCart, Users, Package, Settings,
  CreditCard, LogOut, PanelLeftClose, PanelLeftOpen, MoreHorizontal, X, Compass,
  Smartphone, FileText, BarChart3, Wallet, TrendingUp,
} from "lucide-react"
import { cn, Dot } from "@/components/ui"
import { get } from "@/lib/api"
import { useAuth, useRequireAuth } from "@/lib/auth"
import { Tour, TOUR_DONE_KEY } from "@/components/tour"

const NAV = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/chats", label: "Chats", icon: MessageCircle },
  { href: "/broadcast", label: "Broadcast", icon: Megaphone },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/catalog", label: "Catalog", icon: Package },
]

/* Platform — the WhatsApp/Meta surface. Design previews on mock data today;
   scoped in docs/PRODUCT-SCOPE-2026.md and tracked as GitHub issues. */
const PLATFORM = [
  { href: "/connect", label: "Connect", icon: Smartphone },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/payments", label: "Payments", icon: Wallet },
  { href: "/growth", label: "Grow", icon: TrendingUp },
]

const SECONDARY = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/billing", label: "Billing", icon: CreditCard },
]

const MOBILE_TABS = NAV.slice(0, 4)
const MOBILE_MORE = [...NAV.slice(4), ...PLATFORM, ...SECONDARY]

export function Shell({ children, title, actions }: {
  children: ReactNode
  title: string
  actions?: ReactNode
}) {
  const pathname = usePathname()
  const { user, loading } = useRequireAuth()
  const { logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [shop, setShop] = useState<any | null>(null)
  const [sub, setSub] = useState<any | null>(null)
  const [tourOpen, setTourOpen] = useState(false)

  useEffect(() => {
    if (!user) return
    get("/shop").then(setShop).catch(() => {})
    get("/billing/status").then((s) => setSub(s.subscription)).catch(() => {})
    const saved = localStorage.getItem("kadai.nav.collapsed")
    if (saved === "1") setCollapsed(true)
    // first visit → start the tour once, after the UI has settled
    if (!localStorage.getItem(TOUR_DONE_KEY)) {
      const t = setTimeout(() => setTourOpen(true), 800)
      return () => clearTimeout(t)
    }
  }, [user])

  if (loading || !user) {
    return (
      <div className="h-dvh flex items-center justify-center">
        <div className="w-8 h-8 rounded-md bg-action text-white flex items-center justify-center text-sm font-semibold animate-pulse">K</div>
      </div>
    )
  }

  const toggleNav = () => {
    setCollapsed((c) => {
      localStorage.setItem("kadai.nav.collapsed", c ? "0" : "1")
      return !c
    })
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop rail — gray, collapsible */}
      <aside
        className={cn(
          "hidden md:flex flex-col bg-sidebar border-r border-border shrink-0 transition-[width] duration-150",
          collapsed ? "w-12" : "w-52",
        )}
      >
        <div className={cn("flex items-center gap-2 py-3", collapsed ? "px-2 justify-center" : "px-4")}>
          <div className="w-7 h-7 rounded-md bg-action text-white flex items-center justify-center text-xs font-semibold shrink-0">
            K
          </div>
          {!collapsed && <span className="text-sm font-semibold truncate">{shop?.name || "Kadai"}</span>}
        </div>

        <nav className="flex-1 py-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                title={label}
                data-tour={href.slice(1)}
                className={cn(
                  "flex items-center gap-2.5 mx-1.5 my-0.5 rounded-md text-sm transition-colors",
                  collapsed ? "justify-center px-0 py-2" : "px-2.5 py-1.5",
                  active ? "bg-white text-primary font-semibold shadow-xs" : "text-muted-foreground hover:bg-white/60",
                )}
              >
                <Icon size={17} className="shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            )
          })}

          {/* Platform group — the Meta/WhatsApp surface */}
          <div className={cn("mt-3 pt-2 border-t border-white/60 mx-1.5", collapsed && "mx-1")}>
            {!collapsed && (
              <p className="text-[10px] uppercase tracking-wide text-faint px-2.5 pb-1">
                WhatsApp
              </p>
            )}
            {PLATFORM.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  className={cn(
                    "flex items-center gap-2.5 my-0.5 rounded-md text-sm transition-colors",
                    collapsed ? "justify-center px-0 py-2" : "px-2.5 py-1.5",
                    active ? "bg-white text-primary font-semibold shadow-xs" : "text-muted-foreground hover:bg-white/60",
                  )}
                >
                  <Icon size={17} className="shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </Link>
              )
            })}
          </div>
        </nav>

        <div className="pb-2">
          {SECONDARY.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              title={label}
              data-tour={href.slice(1)}
              className={cn(
                "flex items-center gap-2.5 mx-1.5 my-0.5 rounded-md text-sm transition-colors",
                collapsed ? "justify-center px-0 py-2" : "px-2.5 py-1.5",
                pathname.startsWith(href)
                  ? "bg-white text-primary font-semibold shadow-xs"
                  : "text-muted-foreground hover:bg-white/60",
              )}
            >
              <Icon size={17} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          ))}
          <button
            onClick={toggleNav}
            title={collapsed ? "Expand menu" : "Collapse menu"}
            className={cn(
              "flex items-center gap-2.5 mx-1.5 rounded-md text-sm text-muted-foreground hover:bg-white/60 w-[calc(100%-12px)] transition-colors",
              collapsed ? "justify-center px-0 py-2" : "px-2.5 py-1.5",
            )}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            {!collapsed && <span>Collapse</span>}
          </button>

          {/* User + sign out */}
          <div className={cn("mt-1 pt-2 border-t border-white/60 mx-1.5", collapsed && "flex justify-center")}>
            {collapsed ? (
              <button onClick={logout} title="Sign out" className="p-2 rounded-md text-muted-foreground hover:bg-white/60">
                <LogOut size={17} />
              </button>
            ) : (
              <div className="flex items-center gap-2 px-1.5 py-1">
                <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-[11px] font-semibold text-foreground shrink-0">
                  {(user.name || user.email || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{user.name || "You"}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                </div>
                <button onClick={logout} title="Sign out" className="p-1 text-muted-foreground hover:text-foreground">
                  <LogOut size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 px-4 md:px-5 h-13 border-b border-border shrink-0 bg-white" style={{ height: 52 }}>
          <div className="md:hidden w-7 h-7 rounded-md bg-action text-white flex items-center justify-center text-xs font-semibold">
            K
          </div>
          <h1 className="text-lg font-normal">{title}</h1>
          <span className="flex-1" />
          <button
            onClick={() => setTourOpen(true)}
            title="Take a tour of Kadai"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-secondary transition-colors"
          >
            <Compass size={14} />
            <span className="hidden sm:inline">Take a tour</span>
          </button>
          {shop && (
            <span data-tour="wa-status" className={cn(
              "hidden sm:inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-sm",
              shop.wa_connected ? "bg-success-soft text-success-text" : "bg-warning-soft text-warning-text",
            )}>
              <Dot color={shop.wa_connected ? "var(--success)" : "var(--warning)"} />
              {shop.wa_connected ? "WhatsApp connected" : "Not connected"}
            </span>
          )}
          {actions}
        </header>

        {sub && !sub.active && sub.status !== "none" && !pathname.startsWith("/billing") && (
          <Link href="/billing" className="flex items-center gap-2 px-4 md:px-5 py-2 bg-destructive-soft text-destructive-text text-xs md:text-sm border-b border-destructive/20 hover:bg-destructive-soft/70">
            <CreditCard size={14} className="shrink-0" />
            Your plan has ended. Renew to keep sending on WhatsApp →
          </Link>
        )}

        <main className="flex-1 overflow-y-auto bg-[#fafafa] pb-16 md:pb-0">{children}</main>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-border flex z-40">
        {MOBILE_TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              data-tour={href.slice(1)}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px]",
                active ? "text-primary font-semibold" : "text-muted-foreground",
              )}
            >
              <Icon size={19} />
              {label}
            </Link>
          )
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] text-muted-foreground"
        >
          <MoreHorizontal size={19} />
          More
        </button>
      </nav>

      <Tour open={tourOpen} onClose={() => setTourOpen(false)} />

      {/* Mobile "More" sheet */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute bottom-0 inset-x-0 bg-white rounded-t-xl p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold">More</span>
              <button onClick={() => setMoreOpen(false)} className="p-1 text-muted-foreground">
                <X size={18} />
              </button>
            </div>
            {MOBILE_MORE.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 py-2.5 text-sm text-foreground"
              >
                <Icon size={18} className="text-muted-foreground" />
                {label}
              </Link>
            ))}
            <button
              onClick={logout}
              className="flex items-center gap-3 py-2.5 text-sm text-destructive-text w-full border-t border-border mt-1 pt-3"
            >
              <LogOut size={18} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
