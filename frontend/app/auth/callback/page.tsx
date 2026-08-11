"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { setToken } from "@/lib/api"
import { useAuth } from "@/lib/auth"

/** Landing spot after Google OAuth: backend redirects here with #token=… */
export default function AuthCallbackPage() {
  const router = useRouter()
  const { refresh } = useAuth()

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const token = hash.get("token")
    if (!token) {
      router.replace("/login?error=google")
      return
    }
    setToken(token)
    refresh().then((me) => {
      router.replace(me?.onboarded ? "/today" : "/onboarding")
    })
  }, [refresh, router])

  return (
    <div className="h-dvh flex items-center justify-center">
      <div className="w-8 h-8 rounded-md bg-action text-white flex items-center justify-center text-sm font-semibold animate-pulse">K</div>
    </div>
  )
}
