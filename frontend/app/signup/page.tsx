"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button, Input, Field, FieldError } from "@/components/ui"
import { AuthShell, GoogleButton } from "@/components/auth-shell"
import { useAuth } from "@/lib/auth"
import { toastError } from "@/components/toaster"

export default function SignupPage() {
  const router = useRouter()
  const { signup } = useAuth()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!email.includes("@")) errs.email = "Enter a valid email"
    if (password.length < 6) errs.password = "At least 6 characters"
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      await signup(email, password, name)
      router.replace("/onboarding")
    } catch (e: any) {
      const msg = e?.message || "Couldn't create your account"
      toastError(msg)
      if (msg.toLowerCase().includes("email")) setErrors({ email: msg })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Create your shop"
      subtitle="Start free — no card needed for 14 days"
      footer={<>Already have an account? <Link href="/login" className="text-primary font-medium">Sign in</Link></>}
    >
      <GoogleButton />
      <div className="flex items-center gap-3 my-4 text-xs text-faint">
        <span className="flex-1 h-px bg-border" /> or <span className="flex-1 h-px bg-border" />
      </div>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Your name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Murugan" autoComplete="name" />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                 placeholder="you@shop.com" autoComplete="email" />
          <FieldError error={errors.email} />
        </Field>
        <Field label="Password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                 placeholder="At least 6 characters" autoComplete="new-password" />
          <FieldError error={errors.password} />
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </Button>
      </form>
      <p className="text-xs text-faint mt-4 text-center leading-relaxed">
        By continuing you agree to Kadai's Terms and Privacy Policy.
      </p>
    </AuthShell>
  )
}
