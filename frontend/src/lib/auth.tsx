"use client"

import * as React from "react"
import { toast } from "sonner"

import { API_HTTP_URL, API_HTTP_FALLBACK_URL, API_WS_URL } from "@/lib/config"
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
const LOGOUT_AT_KEY = "primex_logout_at"
const FETCH_TIMEOUT_MS = 8000
// Refresh token when it has less than 3 minutes remaining (15 min total - 3 min buffer = 12 min)
const TOKEN_REFRESH_BUFFER_MS = 3 * 60 * 1000 // 3 minutes in milliseconds

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(ACCESS_TOKEN_KEY)
}

function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return
  if (!token) window.localStorage.removeItem(ACCESS_TOKEN_KEY)
  else window.localStorage.setItem(ACCESS_TOKEN_KEY, token)
}

function getStoredLogoutAt(): number | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(LOGOUT_AT_KEY)
  if (!raw) return null
  const value = Number(raw)
  return Number.isNaN(value) ? null : value
}

function setStoredLogoutAt(timestampMs: number | null) {
  if (typeof window === "undefined") return
  if (!timestampMs) window.localStorage.removeItem(LOGOUT_AT_KEY)
  else window.localStorage.setItem(LOGOUT_AT_KEY, String(timestampMs))
}

/**
 * Decode JWT token to get expiration time
 * Returns expiration timestamp in milliseconds, or null if invalid
 */
function getTokenExpiration(token: string): number | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1]))
    const exp = payload.exp
    if (typeof exp !== "number") return null
    return exp * 1000 // Convert to milliseconds
  } catch {
    return null
  }
}

/**
 * Check if token is about to expire (within buffer time)
 */
function isTokenExpiringSoon(token: string): boolean {
  const expiration = getTokenExpiration(token)
  if (!expiration) return true // If we can't parse it, assume it's expired
  const now = Date.now()
  const timeUntilExpiration = expiration - now
  return timeUntilExpiration < TOKEN_REFRESH_BUFFER_MS
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

async function fetchMe(token: string): Promise<User> {
  const res = await fetchWithTimeout(`${API_HTTP_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  })
  if (!res.ok) throw new Error("me_failed")
  return res.json()
}

async function refreshAccessToken(): Promise<string | null> {
  let res: Response
  try {
    res = await fetchWithTimeout(`${API_HTTP_URL}/auth/refresh`, {
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
  const logoutInProgressRef = React.useRef(false)

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
        if (getStoredLogoutAt() == null) {
          setStoredLogoutAt(Date.now() + 9 * 60 * 60 * 1000)
        }
      } catch {
        const refreshed = await refreshAccessToken()
        if (refreshed) {
          try {
            const me = await fetchMe(refreshed)
            setStoredToken(refreshed)
            setToken(refreshed)
            setUser(me)
            if (getStoredLogoutAt() == null) {
              setStoredLogoutAt(Date.now() + 9 * 60 * 60 * 1000)
            }
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

  // Proactive token refresh - refresh token before it expires
  React.useEffect(() => {
    if (!token || !user) return

    const checkAndRefresh = async () => {
      if (isTokenExpiringSoon(token)) {
        const refreshed = await refreshAccessToken()
        if (refreshed) {
          try {
            const me = await fetchMe(refreshed)
            setStoredToken(refreshed)
            setToken(refreshed)
            setUser(me)
          } catch {
            // If refresh fails, token will be refreshed on next API call
          }
        }
      }
    }

    // Check immediately
    void checkAndRefresh()

    // Check every minute
    const interval = setInterval(() => {
      void checkAndRefresh()
    }, 60 * 1000) // Check every minute

    return () => clearInterval(interval)
  }, [token, user])

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

  React.useEffect(() => {
    if (!token || !user) return
    const checkLogoutSession = async () => {
      if (logoutInProgressRef.current) return
      const logoutAt = getStoredLogoutAt()
      if (!logoutAt) return
      if (Date.now() >= logoutAt) {
        logoutInProgressRef.current = true
        toast("Session ended", {
          description: "You have been logged out.",
        })
        await logout()
      }
    }

    void checkLogoutSession()
    const interval = setInterval(() => {
      void checkLogoutSession()
    }, 60 * 1000)

    return () => clearInterval(interval)
  }, [token, user, logout])

  const apiFetch = React.useCallback(
    async (path: string, init: RequestInit = {}) => {
      const makeUrl = (base: string) =>
        path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`
      const url = makeUrl(API_HTTP_URL)
      const headers = new Headers(init.headers)
      if (token) headers.set("Authorization", `Bearer ${token}`)

      const doFetch = (overrideToken?: string | null, overrideUrl?: string) => {
        const h = new Headers(headers)
        if (overrideToken) h.set("Authorization", `Bearer ${overrideToken}`)
        return fetch(overrideUrl || url, { ...init, headers: h, credentials: "include" })
      }

      let res: Response
      try {
        res = await doFetch()
      } catch (err) {
        const errName = (err as { name?: string } | null)?.name
        const aborted = init.signal?.aborted || errName === "AbortError"
        if (aborted) {
          return new Response(null, { status: 499, statusText: "Request aborted" })
        }

        if (!path.startsWith("http") && API_HTTP_FALLBACK_URL !== API_HTTP_URL) {
          try {
            res = await doFetch(undefined, makeUrl(API_HTTP_FALLBACK_URL))
          } catch (fallbackErr) {
            const fallbackErrName = (fallbackErr as { name?: string } | null)?.name
            const fallbackAborted = init.signal?.aborted || fallbackErrName === "AbortError"
            if (fallbackAborted) {
              return new Response(null, { status: 499, statusText: "Request aborted" })
            }
            toast("Network error", {
              description: "Unable to reach the server. Check the API URL or backend status.",
            })
            return new Response(null, { status: 503, statusText: "Network error" })
          }
        } else {
          toast("Network error", {
            description: "Unable to reach the server. Check the API URL or backend status.",
          })
          return new Response(null, { status: 503, statusText: "Network error" })
        }
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
    let res: Response
    try {
      res = await fetchWithTimeout(`${API_HTTP_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      })
    } catch {
      throw new Error("network_error")
    }
    if (!res.ok) throw new Error("login_failed")
    const data = (await res.json()) as { access_token: string }
    const me = await fetchMe(data.access_token)
    setStoredToken(data.access_token)
    setToken(data.access_token)
    setUser(me)
    setStoredLogoutAt(Date.now() + 9 * 60 * 60 * 1000)
  }, [])

  const logout = React.useCallback(async () => {
    try {
      await fetch(`${API_HTTP_URL}/auth/logout`, { method: "POST", credentials: "include" })
    } catch {
      // ignore
    }
    setStoredToken(null)
    setStoredLogoutAt(null)
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



