"use client"

import * as React from "react"
import { Menu } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useAuth } from "@/lib/auth"
import type { Notification, User } from "@/lib/types"
import { useSidebar } from "./sidebar-context"

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
  const [notifications, setNotifications] = React.useState<Notification[]>([])

  const loadNotifications = React.useCallback(async () => {
    const res = await apiFetch("/notifications?unread_only=true")
    if (!res.ok) return
    const data = (await res.json()) as Notification[]
    setNotifications(data)
  }, [apiFetch])

  React.useEffect(() => {
    void loadNotifications()
  }, [loadNotifications])

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
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" onClick={() => void loadNotifications()}>
              Notifications{notifications.length ? ` (${notifications.length})` : ""}
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Notifications</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-3">
              {notifications.length ? (
                notifications.map((n) => (
                  <div key={n.id} className="rounded-md border p-3">
                    <div className="text-sm font-medium">{n.title}</div>
                    {n.body ? <div className="text-sm text-muted-foreground">{n.body}</div> : null}
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No unread notifications.</div>
              )}
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



