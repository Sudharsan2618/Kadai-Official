"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button, Input, Field, FieldError } from "@/components/ui"
import { AuthShell, GoogleButton } from "@/components/auth-shell"
import { useAuth } from "@/lib/auth"
import { toastError } from "@/components/toaster"

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(undefined)
    if (!email || !password) return setErr("Enter your email and password")
    setBusy(true)
    try {
      await login(email, password)
      router.replace("/today")
    } catch (e: any) {
      const msg = e?.message || "Couldn't sign in"
      setErr(msg)
      toastError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your shop"
      footer={<>New to Kadai? <Link href="/signup" className="text-primary font-medium">Create an account</Link></>}
    >
      <GoogleButton />
      <div className="flex items-center gap-3 my-4 text-xs text-faint">
        <span className="flex-1 h-px bg-border" /> or <span className="flex-1 h-px bg-border" />
      </div>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                 placeholder="you@shop.com" autoComplete="email" />
        </Field>
        <Field label="Password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                 placeholder="••••••••" autoComplete="current-password" />
        </Field>
        <FieldError error={err} />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="text-xs text-faint mt-4 text-center">
        Demo: demo@kadai.shop / demo1234
      </p>
    </AuthShell>
  )
}
