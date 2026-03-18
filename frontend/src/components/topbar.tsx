"use client"

import * as React from "react"
import { Menu, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useAuth } from "@/lib/auth"
import { API_HTTP_URL } from "@/lib/config"
import type { Notification, User } from "@/lib/types"
import { useSidebar } from "./sidebar-context"

type RequestTrace = {
  method: string
  path: string
  url: string
  response: Response
}

function initials(user: User) {
  const src = user.full_name || user.username || user.email
  return src
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

export function Topbar() {
  const { user, apiFetch, logout } = useAuth()
  const { toggle } = useSidebar()
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [notifications, setNotifications] = React.useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = React.useState(0)
  const [deletingAll, setDeletingAll] = React.useState(false)
  const [deletingIds, setDeletingIds] = React.useState<string[]>([])
  const isDev = process.env.NODE_ENV !== "production"
  const apiTargetLabel = React.useMemo(() => API_HTTP_URL, [])

  const getErrorMessage = React.useCallback(async (res: Response, fallback: string) => {
    try {
      const data = (await res.json()) as { detail?: string }
      return data.detail || fallback
    } catch {
      return fallback
    }
  }, [])

  const requestWithTrace = React.useCallback(
    async (path: string, init: RequestInit): Promise<RequestTrace> => {
      const response = await apiFetch(path, init)
      return {
        method: init.method || "GET",
        path,
        url: `${API_HTTP_URL}${path.startsWith("/") ? "" : "/"}${path}`,
        response,
      }
    },
    [apiFetch]
  )

  const buildFailureDescription = React.useCallback(
    async (trace: RequestTrace, fallback: string) => {
      const detail = await getErrorMessage(trace.response, fallback)
      const requestInfo = `${trace.method} ${trace.path} -> ${trace.response.status} ${trace.response.statusText || ""}`.trim()
      return isDev ? `${detail} [${requestInfo}] API: ${apiTargetLabel}` : detail
    },
    [apiTargetLabel, getErrorMessage, isDev]
  )

  const deleteNotificationCompat = React.useCallback(
    async (notificationId: string): Promise<RequestTrace> => {
      const primary = await requestWithTrace(`/notifications/${notificationId}/delete`, { method: "POST" })
      if (primary.response.ok || (primary.response.status !== 404 && primary.response.status !== 405)) {
        return primary
      }
      return requestWithTrace(`/notifications/${notificationId}`, { method: "DELETE" })
    },
    [requestWithTrace]
  )

  const loadAllNotifications = React.useCallback(async () => {
    const res = await apiFetch("/notifications")
    if (!res.ok) return
    const data = (await res.json()) as Notification[]
    setNotifications(data)
  }, [apiFetch])

  const loadUnreadCount = React.useCallback(async () => {
    const res = await apiFetch("/notifications?unread_only=true")
    if (!res.ok) return
    const data = (await res.json()) as Notification[]
    setUnreadCount(data.length)
  }, [apiFetch])

  const handleNotificationsOpenChange = React.useCallback(
    async (open: boolean) => {
      setSheetOpen(open)
      if (!open) return

      await loadAllNotifications()
      const markReadRes = await apiFetch("/notifications/read-all", { method: "POST" })
      if (markReadRes.ok) {
        setUnreadCount(0)
        setNotifications((current) =>
          current.map((notification) =>
            notification.read_at ? notification : { ...notification, read_at: new Date().toISOString() }
          )
        )
      }
    },
    [apiFetch, loadAllNotifications]
  )

  const handleDeleteNotification = React.useCallback(
    async (notificationId: string) => {
      setDeletingIds((current) => [...current, notificationId])
      const trace = await deleteNotificationCompat(notificationId)
      if (!trace.response.ok) {
        toast("Unable to delete notification", {
          description: await buildFailureDescription(trace, "The notification could not be deleted."),
        })
        setDeletingIds((current) => current.filter((id) => id !== notificationId))
        return
      }
      setNotifications((current) => {
        const removed = current.find((notification) => notification.id === notificationId)
        if (removed && !removed.read_at) {
          setUnreadCount((count) => Math.max(0, count - 1))
        }
        return current.filter((notification) => notification.id !== notificationId)
      })
      setDeletingIds((current) => current.filter((id) => id !== notificationId))
    },
    [buildFailureDescription, deleteNotificationCompat]
  )

  const handleDeleteAllNotifications = React.useCallback(async () => {
    if (deletingAll) return
    setDeletingAll(true)
    const trace = await requestWithTrace("/notifications/delete-all", { method: "POST" })
    if (!trace.response.ok && notifications.length) {
      if (trace.response.status === 404 || trace.response.status === 405) {
        const results = await Promise.all(notifications.map((notification) => deleteNotificationCompat(notification.id)))
        const failedTrace = results.find((result) => !result.response.ok)
        if (!failedTrace) {
          setNotifications([])
          setUnreadCount(0)
          toast("Notifications deleted", {
            description: "All notifications have been removed.",
          })
          setDeletingAll(false)
          return
        }
        toast("Unable to delete notifications", {
          description: await buildFailureDescription(failedTrace, "Some notifications could not be deleted."),
        })
        setDeletingAll(false)
        return
      }
    }
    if (!trace.response.ok) {
      toast("Unable to delete notifications", {
        description: await buildFailureDescription(trace, "All notifications could not be deleted."),
      })
      setDeletingAll(false)
      return
    }
    setNotifications([])
    setUnreadCount(0)
    toast("Notifications deleted", {
      description: "All notifications have been removed.",
    })
    setDeletingAll(false)
  }, [buildFailureDescription, deleteNotificationCompat, deletingAll, notifications, requestWithTrace])

  React.useEffect(() => {
    void loadUnreadCount()
  }, [loadUnreadCount])

  React.useEffect(() => {
    const handleNotification = () => {
      void loadUnreadCount()
      if (sheetOpen) {
        void loadAllNotifications()
      }
    }

    window.addEventListener("primex:notification", handleNotification)
    return () => window.removeEventListener("primex:notification", handleNotification)
  }, [loadAllNotifications, loadUnreadCount, sheetOpen])

  if (!user) return null

  return (
    <header className="flex h-14 items-center justify-between border-b px-4 print:hidden">
      <div className="flex items-center gap-3">
        {/* Hamburger menu button for mobile */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          className="md:hidden"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="text-sm text-muted-foreground hidden md:block">Ctrl+K to search</div>
      </div>
      <div className="flex items-center gap-2">
        <Sheet open={sheetOpen} onOpenChange={(open) => void handleNotificationsOpenChange(open)}>
          <SheetTrigger asChild>
            <Button variant="outline">
              Notifications{unreadCount ? ` (${unreadCount})` : ""}
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader className="pr-12">
              <SheetTitle>Notifications</SheetTitle>
              {isDev ? <div className="text-xs text-muted-foreground">API: {apiTargetLabel}</div> : null}
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {notifications.length ? (
                <div className="mb-3 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={deletingAll}
                    onClick={() => void handleDeleteAllNotifications()}
                  >
                    {deletingAll ? "Deleting..." : "Delete all"}
                  </Button>
                </div>
              ) : null}
              <div className="space-y-3">
              {notifications.length ? (
                notifications.map((n) => (
                  <div key={n.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{n.title}</div>
                        {n.body ? <div className="text-sm text-muted-foreground">{n.body}</div> : null}
                        <div className="mt-1 text-xs text-muted-foreground">
                          {n.read_at ? "Read" : "Unread"}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label="Delete notification"
                        disabled={deletingAll || deletingIds.includes(n.id)}
                        onClick={() => void handleDeleteNotification(n.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No notifications.</div>
              )}
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-10 w-10 rounded-full p-0">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials(user)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void logout()}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}



