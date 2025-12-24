"use client"

import * as React from "react"
import { toast } from "sonner"

import { API_HTTP_URL, API_WS_URL } from "@/lib/config"
import type { User } from "@/lib/types"

type AuthContextValue = {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

const ACCESS_TOKEN_KEY = "primex_access_token"

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(ACCESS_TOKEN_KEY)
}

function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return
  if (!token) window.localStorage.removeItem(ACCESS_TOKEN_KEY)
  else window.localStorage.setItem(ACCESS_TOKEN_KEY, token)
}

async function fetchMe(token: string): Promise<User> {
  const res = await fetch(`${API_HTTP_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  })
  if (!res.ok) throw new Error("me_failed")
  return res.json()
}

async function refreshAccessToken(): Promise<string | null> {
  let res: Response
  try {
    res = await fetch(`${API_HTTP_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = React.useState<string | null>(null)
  const [user, setUser] = React.useState<User | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const boot = async () => {
      const existing = getStoredToken()
      if (!existing) {
        setLoading(false)
        return
      }

      try {
        const me = await fetchMe(existing)
        setToken(existing)
        setUser(me)
      } catch {
        const refreshed = await refreshAccessToken()
        if (refreshed) {
          try {
            const me = await fetchMe(refreshed)
            setStoredToken(refreshed)
            setToken(refreshed)
            setUser(me)
          } catch {
            setStoredToken(null)
            setToken(null)
            setUser(null)
          }
        } else {
          setStoredToken(null)
          setToken(null)
          setUser(null)
        }
      } finally {
        setLoading(false)
      }
    }
    void boot()
  }, [])

  React.useEffect(() => {
    if (!token || !user) return

    const ws = new WebSocket(`${API_WS_URL}/ws/notifications?token=${encodeURIComponent(token)}`)
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type?: string; title?: string; body?: string }
        if (msg.type === "notification") {
          toast(msg.title || "Notification", { description: msg.body || undefined })
        }
      } catch {
        // ignore
      }
    }
    ws.onerror = () => {
      // ignore
    }
    return () => ws.close()
  }, [token, user])

  const apiFetch = React.useCallback(
    async (path: string, init: RequestInit = {}) => {
      const url = path.startsWith("http") ? path : `${API_HTTP_URL}${path.startsWith("/") ? "" : "/"}${path}`
      const headers = new Headers(init.headers)
      if (token) headers.set("Authorization", `Bearer ${token}`)

      const doFetch = (overrideToken?: string | null) => {
        const h = new Headers(headers)
        if (overrideToken) h.set("Authorization", `Bearer ${overrideToken}`)
        return fetch(url, { ...init, headers: h, credentials: "include" })
      }

      let res: Response
      try {
        res = await doFetch()
      } catch {
        toast("Network error", {
          description: "Unable to reach the server. Check the API URL or backend status.",
        })
        return new Response(null, { status: 503, statusText: "Network error" })
      }
      if (res.status !== 401) return res

      const refreshed = await refreshAccessToken()
      if (!refreshed) return res

      setStoredToken(refreshed)
      setToken(refreshed)
      try {
        const me = await fetchMe(refreshed)
        setUser(me)
      } catch {
        // ignore
      }

      return doFetch(refreshed)
    },
    [token]
  )

  const login = React.useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_HTTP_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) throw new Error("login_failed")
    const data = (await res.json()) as { access_token: string }
    const me = await fetchMe(data.access_token)
    setStoredToken(data.access_token)
    setToken(data.access_token)
    setUser(me)
  }, [])

  const logout = React.useCallback(async () => {
    try {
      await fetch(`${API_HTTP_URL}/auth/logout`, { method: "POST", credentials: "include" })
    } catch {
      // ignore
    }
    setStoredToken(null)
    setToken(null)
    setUser(null)
  }, [])

  const value = React.useMemo<AuthContextValue>(
    () => ({ user, token, loading, login, logout, apiFetch }),
    [user, token, loading, login, logout, apiFetch]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}



