"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { CommandPalette } from "@/components/command-palette"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import { SidebarProvider } from "@/components/sidebar-context"
import { useAuth } from "@/lib/auth"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, loading } = useAuth()

  React.useEffect(() => {
    if (!loading && !user) router.push("/login")
  }, [loading, user, router])

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading...</div>
  }
  if (!user) return null

  return (
    <SidebarProvider>
      <div className="flex min-h-screen print:min-h-0 print:block relative">
        <Sidebar role={user.role} />
        <div className="flex min-w-0 flex-1 flex-col print:block w-full">
          <Topbar />
          <main className="flex-1 p-4 print:p-0">{children}</main>
        </div>
        <CommandPalette />
      </div>
    </SidebarProvider>
  )
}



