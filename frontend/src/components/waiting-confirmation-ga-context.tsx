"use client"

import * as React from "react"

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
  const [ganeUser, setGaneUser] = React.useState<UserLookup | null>(null)
  const [tasks, setTasks] = React.useState<Task[]>([])
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

      setGaneUser(gane)
      setTasks(
        gane
          ? fetchedTasks.filter(
              (task) =>
                task.status === "WAITING_CONFIRMATION" &&
                task.confirmation_assignee_id === gane.id
            )
          : []
      )
    } catch {
      setError("Could not load waiting confirmation tasks.")
    } finally {
      setLoading(false)
    }
  }, [apiFetch])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const applyTaskResult = React.useCallback(
    (task: Task) => {
      setTasks((prev) => {
        const shouldStay =
          ganeUser &&
          task.status === "WAITING_CONFIRMATION" &&
          task.confirmation_assignee_id === ganeUser.id

        if (!shouldStay) {
          return prev.filter((item) => item.id !== task.id)
        }

        const existingIndex = prev.findIndex((item) => item.id === task.id)
        if (existingIndex === -1) return [task, ...prev]
        const next = [...prev]
        next[existingIndex] = task
        return next
      })
    },
    [ganeUser]
  )

  const value = React.useMemo<WaitingConfirmationGaContextValue>(
    () => ({
      ganeUser,
      tasks,
      count: tasks.length,
      loading,
      error,
      refresh,
      applyTaskResult,
    }),
    [applyTaskResult, error, ganeUser, loading, refresh, tasks]
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
