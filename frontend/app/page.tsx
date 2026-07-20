"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  MessageCircle, Megaphone, ShoppingCart, Package, Users, FileText,
  ArrowRight, Check, Star, ShieldCheck, Zap, Store, Plus, Minus, Menu, X,
} from "lucide-react"
import { useAuth } from "@/lib/auth"

/* ── Kadai landing page ───────────────────────────────────────────────────────
   Layout rhythm borrowed from retellai.com (extracted via Firecrawl — see
   research/landing-reference/), re-skinned in Kadai's Carbon brand: near-black
   buttons, white canvas, Carbon-blue accent, IBM Plex. Framed for Tamil Nadu's
   small shops — WhatsApp-first, ₹ pricing, Tanglish voice. */

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${dark ? "bg-white text-action" : "bg-action text-white"}`}>K</div>
      <span className="text-base font-semibold tracking-tight">Kadai</span>
    </div>
  )
}

function Nav() {
  const [open, setOpen] = useState(false)
  const links = [
    { href: "#features", label: "Features" },
    { href: "#how", label: "How it works" },
    { href: "#pricing", label: "Pricing" },
    { href: "#faq", label: "FAQ" },
  ]
  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <Link href="/"><Logo /></Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-foreground transition-colors">{l.label}</a>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-2">
          <Link href="/login" className="text-sm font-medium px-3 h-9 inline-flex items-center rounded-lg hover:bg-secondary transition-colors">Sign in</Link>
          <Link href="/signup" className="text-sm font-medium px-4 h-9 inline-flex items-center gap-1.5 rounded-lg bg-action text-white hover:bg-action-hover transition-colors">
            Start free <ArrowRight size={15} />
          </Link>
        </div>
        <button className="md:hidden p-2" onClick={() => setOpen((o) => !o)} aria-label="Menu">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-border px-4 py-3 space-y-1 bg-white">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-2 text-sm text-muted-foreground">{l.label}</a>
          ))}
          <div className="flex gap-2 pt-2">
            <Link href="/login" className="flex-1 text-center text-sm font-medium py-2 rounded-lg border border-border">Sign in</Link>
            <Link href="/signup" className="flex-1 text-center text-sm font-medium py-2 rounded-lg bg-action text-white">Start free</Link>
          </div>
        </div>
      )}
    </header>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* soft backdrop */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-secondary/60 to-white" />
      <div aria-hidden className="absolute -top-24 left-1/2 -translate-x-1/2 -z-10 w-[720px] h-[720px] rounded-full blur-3xl opacity-40"
           style={{ background: "radial-gradient(circle, rgba(15,98,254,0.12), transparent 60%)" }} />
      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-16 md:pt-24 pb-12 md:pb-16 grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-8 items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-white border border-border text-muted-foreground">
            Made in Tamil Nadu, for Tamil Nadu's shops
          </span>
          <h1 className="mt-5 text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
            We streamline your<br />WhatsApp sales.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-xl">
            Kadai turns the WhatsApp you already use into a proper shop — send daily stock to every
            customer, take orders in chat, and track payments. No new app for your customers to learn.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-action text-white text-sm font-semibold hover:bg-action-hover transition-colors">
              Start free — 14 days <ArrowRight size={16} />
            </Link>
            <a href="#how" className="inline-flex items-center gap-2 h-11 px-5 rounded-lg border border-border text-sm font-semibold hover:bg-secondary transition-colors">
              See how it works
            </a>
          </div>
          <p className="mt-4 text-xs text-faint">No card needed · Set up in one morning · Cancel anytime</p>
        </div>
        <PhoneMock />
      </div>
      <TrustStrip />
    </section>
  )
}

function PhoneMock() {
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <div className="rounded-[2rem] border border-border bg-white shadow-xl overflow-hidden">
        {/* WhatsApp-style header (green here is illustrative of WhatsApp itself) */}
        <div className="flex items-center gap-2 px-4 py-3 text-white" style={{ background: "#075E54" }}>
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-semibold">MA</div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Mango Anna Fruits</p>
            <p className="text-[10px] text-white/70">Business · online</p>
          </div>
        </div>
        <div className="px-3 py-4 space-y-2.5" style={{ background: "#ECE5DD" }}>
          <Bubble out>வணக்கம் Selvi akka! 🥭 Today: Alphonso ₹280/kg, Banganapalli ₹120/kg, Mixed box ₹700. Reply to order.</Bubble>
          <Bubble>Same as last week please 🙏</Bubble>
          <Bubble>Add 1 mixed box also</Bubble>
          <Bubble out>Confirmed akka! 3kg Banganapalli + 1 mixed box = ₹1,060. Evening delivery 👍</Bubble>
          <div className="flex justify-center">
            <span className="text-[10px] bg-white/70 rounded-full px-2 py-0.5 text-muted-foreground">Order created · Payment due</span>
          </div>
        </div>
      </div>
      {/* floating stat chips */}
      <div className="absolute -left-4 top-16 hidden sm:flex items-center gap-2 bg-white border border-border rounded-xl shadow-lg px-3 py-2">
        <Megaphone size={15} className="text-primary" />
        <div className="leading-tight">
          <p className="text-xs font-semibold">142 sent</p>
          <p className="text-[10px] text-muted-foreground">in one tap</p>
        </div>
      </div>
      <div className="absolute -right-3 bottom-14 hidden sm:flex items-center gap-2 bg-white border border-border rounded-xl shadow-lg px-3 py-2">
        <ShoppingCart size={15} className="text-success" />
        <div className="leading-tight">
          <p className="text-xs font-semibold">18 orders</p>
          <p className="text-[10px] text-muted-foreground">today</p>
        </div>
      </div>
    </div>
  )
}

function Bubble({ children, out = false }: { children: ReactNode; out?: boolean }) {
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] text-[13px] leading-snug px-3 py-2 rounded-xl ${out ? "bg-[#DCF8C6] rounded-br-sm" : "bg-white rounded-bl-sm"}`}>
        {children}
      </div>
    </div>
  )
}

function TrustStrip() {
  const personas = [
    "Fruit stalls", "Vegetable vendors", "Boutiques", "Tiffin centres", "Home bakers",
    "Cloud kitchens", "Sweet shops", "Saree shops", "Flower shops", "Provision stores",
    "Mobile accessories", "Plant nurseries", "Fish & meat stalls", "Home foods",
    "Cake shops", "Dairy & milk", "Jewellery boutiques", "Pet supplies",
  ]
  // Duplicate the row so the -50% slide loops seamlessly.
  const row = [...personas, ...personas]
  return (
    <div className="border-y border-border bg-white/60 py-6 overflow-hidden">
      {/* keyframes inlined so the animation never depends on stylesheet pickup */}
      <style>{`@keyframes kadai-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
      <p className="text-center text-xs uppercase tracking-wide text-faint mb-4">
        Trusted by shops already selling on WhatsApp
      </p>
      <div className="marquee-mask overflow-hidden">
        <div
          style={{
            display: "flex",
            width: "max-content",
            flexWrap: "nowrap",
            animation: "kadai-marquee 40s linear infinite",
          }}
        >
          {row.map((p, i) => (
            <span
              key={i}
              style={{ flexShrink: 0, whiteSpace: "nowrap" }}
              className="mx-5 inline-flex items-center gap-2.5 text-sm text-muted-foreground font-medium"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function Section({ id, eyebrow, title, subtitle, children }: {
  id?: string; eyebrow?: string; title: ReactNode; subtitle?: string; children: ReactNode
}) {
  return (
    <section id={id} className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-24">
      <div className="max-w-2xl">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">{eyebrow}</p>}
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight leading-tight">{title}</h2>
        {subtitle && <p className="mt-3 text-lg text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="mt-10">{children}</div>
    </section>
  )
}

const CARDS = [
  { icon: MessageCircle, title: "Chats that don't get lost", body: "Every customer message in one inbox — with the 24-hour reply window shown, so you never miss a sale or break WhatsApp's rules." },
  { icon: Megaphone, title: "One message, whole street", body: "Send today's stock or an offer to all your customers at once. Kadai paces it safely so your number stays healthy." },
  { icon: ShoppingCart, title: "Orders & payments, tracked", body: "Turn a chat into an order in two taps. See what's packed, what's out for delivery, and who still owes you money." },
]

function WhatIs() {
  return (
    <Section id="features" eyebrow="What is Kadai"
      title="Everything your shop does on WhatsApp — finally organised."
      subtitle="You already sell on WhatsApp. Kadai just makes it faster, so you spend less time typing and more time selling.">
      <div className="grid md:grid-cols-3 gap-4">
        {CARDS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="card p-6">
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
              <Icon size={20} className="text-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

const FEATURES = [
  { icon: FileText, title: "Ready messages", body: "Save your daily stock list, order confirmation, and payment reminder once. Send with a tap — {name} and {shop} fill in automatically." },
  { icon: Package, title: "Your catalog", body: "List your items with prices and units. Mark what's in stock today so customers always order what you actually have." },
  { icon: Users, title: "Customer book", body: "Every buyer saved with their area and what they usually order — no more scrolling to find that one regular." },
  { icon: Megaphone, title: "Safe broadcasts", body: "Reach everyone without getting blocked. Kadai sends at a healthy pace and shows you who read and who replied." },
]

function Features() {
  return (
    <Section eyebrow="Built for the way you work"
      title="Simple enough for day one. Powerful enough to grow.">
      <div className="grid md:grid-cols-2 gap-4">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-4 card p-6">
            <div className="w-10 h-10 shrink-0 rounded-lg bg-info-soft flex items-center justify-center">
              <Icon size={19} className="text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

const STEPS = [
  { n: "1", title: "Connect your WhatsApp", body: "One tap. We handle all the Meta setup — no account creation, no waiting, no technical steps for you." },
  { n: "2", title: "Add your items & customers", body: "Put in today's stock and import your regulars. Takes one quiet morning." },
  { n: "3", title: "Send your first broadcast", body: "Message every customer your fresh stock. Watch the orders come back into your inbox." },
]

function How() {
  return (
    <section id="how" className="bg-action text-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/60 mb-2">How it works</p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight leading-tight">Selling on WhatsApp in three steps.</h2>
        </div>
        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {STEPS.map(({ n, title, body }) => (
            <div key={n} className="rounded-xl border border-white/15 p-6 bg-white/[0.03]">
              <div className="w-9 h-9 rounded-lg bg-white text-action flex items-center justify-center font-bold">{n}</div>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-white/70 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const METRICS = [
  { value: "3×", label: "more orders after switching to daily broadcasts" },
  { value: "10 min", label: "to message every customer, instead of an hour" },
  { value: "₹0", label: "for your customers — they use the WhatsApp they have" },
]
const TESTIMONIALS = [
  { quote: "Kaalaila oru message anuppuren, mid-day-ku 20 order ready. Time romba save aaguthu.", name: "Murugan", shop: "Mango Anna Fruits, Koyambedu" },
  { quote: "Payment due யாருக்குனு clear-a theriyuthu. Reminder anuppa ready message use panren. Super.", name: "Selvi", shop: "Selvi Beauty Parlour, Madurai" },
]

function Proof() {
  return (
    <Section eyebrow="Real shops, real orders"
      title="Small shops across Tamil Nadu are already selling more.">
      <div className="grid sm:grid-cols-3 gap-4">
        {METRICS.map((m) => (
          <div key={m.label} className="card p-6 text-center">
            <p className="text-4xl font-semibold tracking-tight">{m.value}</p>
            <p className="mt-2 text-sm text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4 mt-4">
        {TESTIMONIALS.map((t) => (
          <div key={t.name} className="card p-6">
            <div className="flex gap-0.5 text-warning">
              {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={15} fill="currentColor" />)}
            </div>
            <p className="mt-3 text-[15px] leading-relaxed">“{t.quote}”</p>
            <p className="mt-4 text-sm font-semibold">{t.name}</p>
            <p className="text-xs text-muted-foreground">{t.shop}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

const PLAN_FEATURES = [
  "Unlimited WhatsApp chats & broadcasts",
  "Orders, customers & catalog",
  "Ready messages with auto-fill",
  "Delivery & read tracking",
  "Your own business number, fully managed",
  "Support in Tamil & English",
]

function Pricing() {
  return (
    <Section id="pricing" eyebrow="Pricing"
      title="One simple plan. No surprises."
      subtitle="Everything included. Start with a 14-day free trial — no card needed.">
      <div className="max-w-md">
        <div className="card p-7">
          <div className="flex items-center gap-2">
            <Store size={18} className="text-primary" />
            <span className="text-sm font-semibold">Kadai for Shops</span>
          </div>
          <div className="mt-4 flex items-end gap-1.5">
            <span className="text-5xl font-semibold tracking-tight">₹1,500</span>
            <span className="text-muted-foreground mb-1.5">/ month</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Billed monthly · GST included · Cancel anytime</p>
          <Link href="/signup" className="mt-5 flex items-center justify-center gap-2 h-11 rounded-lg bg-action text-white text-sm font-semibold hover:bg-action-hover transition-colors">
            <Zap size={16} /> Start your free trial
          </Link>
          <ul className="mt-6 space-y-2.5">
            {PLAN_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check size={16} className="text-success mt-0.5 shrink-0" /> {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}

function Trust() {
  const items = [
    { icon: ShieldCheck, title: "Official WhatsApp Business", body: "Kadai runs on Meta's official platform — your account stays safe and never gets banned." },
    { icon: MessageCircle, title: "Your number, your customers", body: "Keep your own business number. Your customer list is yours — export it anytime." },
    { icon: Zap, title: "No spam, ever", body: "Broadcasts go only to people who've messaged you, paced the way Meta expects." },
  ]
  return (
    <Section eyebrow="Safe & trusted" title="Serious about your shop's safety.">
      <div className="grid md:grid-cols-3 gap-4">
        {items.map(({ icon: Icon, title, body }) => (
          <div key={title} className="card p-6">
            <Icon size={20} className="text-primary" />
            <h3 className="mt-3 text-base font-semibold">{title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

const FAQS = [
  { q: "Do my customers need to install anything?", a: "No. Your customers use the same WhatsApp they already have. Only you use Kadai — they just chat with your shop like normal." },
  { q: "Will my WhatsApp number get banned?", a: "No. Kadai uses Meta's official WhatsApp Business platform and paces broadcasts the way Meta expects, so your number stays healthy." },
  { q: "Can I use Kadai in Tamil?", a: "Yes — Kadai works fully in English today, with Tamil coming soon. Our support team helps you in both Tamil and English." },
  { q: "What does it cost my customers?", a: "Nothing. They message your shop for free on WhatsApp. You pay one simple ₹1,500/month plan." },
  { q: "How long does setup take?", a: "One morning. Connect your WhatsApp in a tap, add your items and customers, and send your first broadcast the same day." },
  { q: "Can I cancel?", a: "Anytime, from the Billing page. You keep access until the end of the period you've paid for." },
]

function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <Section id="faq" eyebrow="Questions" title="Everything you might be wondering.">
      <div className="max-w-3xl divide-y divide-border border-y border-border">
        {FAQS.map((f, i) => (
          <div key={f.q}>
            <button onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between gap-4 py-4 text-left">
              <span className="text-[15px] font-medium">{f.q}</span>
              {open === i ? <Minus size={18} className="shrink-0 text-muted-foreground" /> : <Plus size={18} className="shrink-0 text-muted-foreground" />}
            </button>
            {open === i && <p className="pb-4 -mt-1 text-sm text-muted-foreground leading-relaxed max-w-2xl">{f.a}</p>}
          </div>
        ))}
      </div>
    </Section>
  )
}

function FinalCta() {
  return (
    <section className="max-w-6xl mx-auto px-4 md:px-6 pb-16 md:pb-24">
      <div className="rounded-2xl bg-action text-white px-6 md:px-12 py-12 md:py-16 text-center relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full blur-3xl opacity-20"
             style={{ background: "radial-gradient(circle, rgba(15,98,254,0.6), transparent 60%)" }} />
        <h2 className="relative z-10 text-3xl md:text-4xl font-semibold tracking-tight max-w-2xl mx-auto leading-tight">
          Your next order is one message away.
        </h2>
        <p className="relative z-10 mt-3 text-white/70 max-w-xl mx-auto">
          Join the small shops across Tamil Nadu turning WhatsApp into real sales. Start free today.
        </p>
        <div className="relative z-10 mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="inline-flex items-center gap-2 h-11 px-6 rounded-lg bg-white text-action text-sm font-semibold hover:bg-white/90 transition-colors">
            Start free — 14 days <ArrowRight size={16} />
          </Link>
          <Link href="/login" className="inline-flex items-center h-11 px-6 rounded-lg border border-white/25 text-sm font-semibold hover:bg-white/10 transition-colors">
            Sign in
          </Link>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
        <Logo />
        <p className="text-xs text-muted-foreground">Kadai — your shop on WhatsApp. Made in Tamil Nadu 🇮🇳</p>
        <div className="flex gap-5 text-xs text-muted-foreground">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <Link href="/login" className="hover:text-foreground">Sign in</Link>
        </div>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  // Signed-in shopkeepers skip the pitch and go straight to work.
  useEffect(() => {
    if (!loading && user) router.replace("/today")
  }, [loading, user, router])

  return (
    <div className="bg-white text-foreground">
      <Nav />
      <main>
        <Hero />
        <WhatIs />
        <Features />
        <How />
        <Proof />
        <Pricing />
        <Trust />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
