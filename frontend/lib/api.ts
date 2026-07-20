const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010"

const TOKEN_KEY = "kadai.token"

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

/** Thrown on any non-2xx; carries the HTTP status so callers can branch (402, 401…). */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
    ...init,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || detail
    } catch {}
    // Session gone — drop the token and bounce to login (except when already there).
    if (res.status === 401 && typeof window !== "undefined") {
      clearToken()
      if (!location.pathname.startsWith("/login") && !location.pathname.startsWith("/signup")) {
        location.href = "/login"
      }
    }
    throw new ApiError(detail, res.status)
  }
  return res.json()
}

export const get = <T = any>(path: string) => api<T>(path)
export const post = <T = any>(path: string, body?: any) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) })
export const patch = <T = any>(path: string, body: any) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) })
export const del = <T = any>(path: string) => api<T>(path, { method: "DELETE" })

/** Live events from the backend (new message, ticks, broadcast progress). */
export function subscribeEvents(onEvent: (e: any) => void): () => void {
  const es = new EventSource(`${API}/events`)
  es.onmessage = (ev) => {
    try {
      onEvent(JSON.parse(ev.data))
    } catch {}
  }
  return () => es.close()
}

export { API }
