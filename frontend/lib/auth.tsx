"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { get, post, setToken, clearToken, getToken } from "@/lib/api"

export type User = { id: number; email: string; name: string; avatar_url: string; provider: string }

type AuthState = {
  user: User | null
  loading: boolean
  signup: (email: string, password: string, name: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!getToken()) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const me = await get<{ user: User }>("/auth/me")
      setUser(me.user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const signup = async (email: string, password: string, name: string) => {
    const res = await post<{ token: string; user: User }>("/auth/signup", { email, password, name })
    setToken(res.token)
    setUser(res.user)
  }
  const login = async (email: string, password: string) => {
    const res = await post<{ token: string; user: User }>("/auth/login", { email, password })
    setToken(res.token)
    setUser(res.user)
  }
  const logout = () => {
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
