"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { useAuth } from "@/lib/auth"
import type { Task, UserLookup } from "@/lib/types"
import { fetchUsersLookupCached } from "@/lib/users-cache"

type WaitingConfirmationGaContextValue = {
  ganeUser: UserLookup | null
  tasks: Task[]
  count: number
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  applyTaskResult: (task: Task) => void
}

const WaitingConfirmationGaContext = React.createContext<WaitingConfirmationGaContextValue | null>(null)

function matchesGane(user: UserLookup) {
  const fullName = (user.full_name || "").trim().toLowerCase()
  const username = (user.username || "").trim().toLowerCase()
  return fullName === "gane arifaj" || username === "gane.arifaj" || username === "gane_arifaj" || username === "gane"
}

export function WaitingConfirmationGaProvider({ children }: { children: React.ReactNode }) {
  const { apiFetch } = useAuth()
  const pathname = usePathname()
  const [ganeUser, setGaneUser] = React.useState<UserLookup | null>(null)
  const [tasks, setTasks] = React.useState<Task[]>([])
  const [count, setCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const usersPromise = (async () => {
        const cached = await fetchUsersLookupCached(apiFetch)
        if (cached) return cached as UserLookup[]
        const res = await apiFetch("/users/lookup")
        if (!res.ok) return [] as UserLookup[]
        return (await res.json()) as UserLookup[]
      })()

      const [users, tasksRes] = await Promise.all([
        usersPromise,
        apiFetch("/tasks?status=WAITING_CONFIRMATION&include_done=false"),
      ])

      if (!tasksRes.ok) {
        throw new Error("tasks_failed")
      }

      const gane = users.find(matchesGane) ?? null
      const fetchedTasks = (await tasksRes.json()) as Task[]

      const matchingTasks = gane
        ? fetchedTasks.filter(
            (task) =>
              task.status === "WAITING_CONFIRMATION" &&
              task.confirmation_assignee_id === gane.id
          )
        : []
      setGaneUser(gane)
      setTasks(matchingTasks)
      setCount(matchingTasks.length)
    } catch {
      setError("Could not load waiting confirmation tasks.")
    } finally {
      setLoading(false)
    }
  }, [apiFetch])

  const refreshCount = React.useCallback(async () => {
    try {
      const res = await apiFetch("/tasks/waiting-confirmation-ga/count")
      if (!res.ok) return
      const data = (await res.json()) as { count: number }
      setCount(Math.max(0, Number(data.count) || 0))
    } finally {
      setLoading(false)
    }
  }, [apiFetch])

  React.useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof window.setTimeout> | null = null
    let idleId: number | null = null

    const onWaitingConfirmationPage = pathname === "/waiting-confirmation-ga"
    const runRefresh = () => {
      if (cancelled) return
      void (onWaitingConfirmationPage ? refresh() : refreshCount())
    }

    if (onWaitingConfirmationPage) {
      runRefresh()
    } else if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(runRefresh, { timeout: 1200 })
    } else {
      timeoutId = setTimeout(runRefresh, 150)
    }

    return () => {
      cancelled = true
      if (idleId !== null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [pathname, refresh, refreshCount])

  const applyTaskResult = React.useCallback(
    (task: Task) => {
      setTasks((prev) => {
        const shouldStay =
          ganeUser &&
          task.status === "WAITING_CONFIRMATION" &&
          task.confirmation_assignee_id === ganeUser.id

        let next: Task[]
        if (!shouldStay) {
          next = prev.filter((item) => item.id !== task.id)
        } else {
          const existingIndex = prev.findIndex((item) => item.id === task.id)
          next = existingIndex === -1 ? [task, ...prev] : [...prev]
          if (existingIndex !== -1) next[existingIndex] = task
        }
        setCount(next.length)
        return next
      })
    },
    [ganeUser]
  )

  const value = React.useMemo<WaitingConfirmationGaContextValue>(
    () => ({
      ganeUser,
      tasks,
      count,
      loading,
      error,
      refresh,
      applyTaskResult,
    }),
    [applyTaskResult, count, error, ganeUser, loading, refresh, tasks]
  )

  return (
    <WaitingConfirmationGaContext.Provider value={value}>
      {children}
    </WaitingConfirmationGaContext.Provider>
  )
}

export function useWaitingConfirmationGa() {
  const context = React.useContext(WaitingConfirmationGaContext)
  if (!context) {
    throw new Error("useWaitingConfirmationGa must be used within WaitingConfirmationGaProvider")
  }
  return context
}
