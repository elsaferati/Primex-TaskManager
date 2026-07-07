"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

interface SidebarContextType {
  isOpen: boolean
  isDesktop: boolean
  setIsOpen: (open: boolean) => void
  toggle: () => void
}

const SidebarContext = React.createContext<SidebarContextType | undefined>(undefined)
const SIDEBAR_STORAGE_KEY = "primeflow-sidebar-open"

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = React.useState(false)
  const [isDesktop, setIsDesktop] = React.useState(false)
  const previousPathnameRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)")

    const syncSidebarForViewport = () => {
      const nextIsDesktop = mediaQuery.matches
      setIsDesktop(nextIsDesktop)

      if (!nextIsDesktop) {
        setIsOpen(true)
        return
      }

      const savedPreference = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
      setIsOpen(savedPreference == null ? true : savedPreference === "true")
    }

    syncSidebarForViewport()
    mediaQuery.addEventListener("change", syncSidebarForViewport)

    return () => mediaQuery.removeEventListener("change", syncSidebarForViewport)
  }, [])

  React.useEffect(() => {
    if (previousPathnameRef.current === null) {
      previousPathnameRef.current = pathname
      return
    }

    if (previousPathnameRef.current === pathname) return
    previousPathnameRef.current = pathname

    if (!isDesktop) {
      setIsOpen(false)
    }
  }, [isDesktop, pathname])

  const setSidebarOpen = React.useCallback((open: boolean) => {
    setIsOpen(open)

    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open))
    }
  }, [])

  const toggle = React.useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev

      if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
      }

      return next
    })
  }, [])

  const value = React.useMemo(
    () => ({ isOpen, isDesktop, setIsOpen: setSidebarOpen, toggle }),
    [isDesktop, isOpen, setSidebarOpen, toggle]
  )

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return context
}
