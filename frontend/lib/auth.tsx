"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { get, post, setToken, clearToken, getToken } from "@/lib/api"
import posthog from "posthog-js"

export type User = { id: number; email: string; name: string; avatar_url: string; provider: string }
type AuthMe = { user: User; onboarded?: boolean }

type AuthState = {
  user: User | null
  loading: boolean
  signup: (email: string, password: string, name: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refresh: () => Promise<AuthMe | null>
}

const Ctx = createContext<AuthState | null>(null)

function identifyUser(user: User) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || !process.env.NEXT_PUBLIC_POSTHOG_HOST) return

  posthog.identify(String(user.id), {
    email: user.email,
    name: user.name,
  })
}

function resetPostHog() {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || !process.env.NEXT_PUBLIC_POSTHOG_HOST) return

  posthog.reset()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      setLoading(false)
      return null
    }
    try {
      const me = await get<AuthMe>("/auth/me")
      identifyUser(me.user)
      setUser(me.user)
      return me
    } catch {
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const signup = async (email: string, password: string, name: string) => {
    const res = await post<{ token: string; user: User }>("/auth/signup", { email, password, name })
    setToken(res.token)
    identifyUser(res.user)
    setUser(res.user)
  }
  const login = async (email: string, password: string) => {
    const res = await post<{ token: string; user: User }>("/auth/login", { email, password })
    setToken(res.token)
    identifyUser(res.user)
    setUser(res.user)
  }
  const logout = () => {
    resetPostHog()
    clearToken()
    setUser(null)
    window.location.href = "/login"
  }

  return (
    <Ctx.Provider value={{ user, loading, signup, login, logout, refresh: load }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

/** Redirects to /login if there's no session. Wrap protected pages/shell. */
export function useRequireAuth() {
  const { user, loading } = useAuth()
  const router = useRouter()
  useEffect(() => {
    if (!loading && !user) router.replace("/login")
  }, [loading, user, router])
  return { user, loading }
}
