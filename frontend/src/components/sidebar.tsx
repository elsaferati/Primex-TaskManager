"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import type { UserRole } from "@/lib/types"

type NavItem = { href: string; label: string; roles?: UserRole[] }

const items: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/common", label: "Common View" },
  { href: "/departments/development", label: "Development" },
  { href: "/departments/pcm", label: "Project Content Manager" },
  { href: "/departments/graphic-design", label: "Graphic Design" },
  { href: "/weekly-planner", label: "Weekly Planner" },
  { href: "/monthly-planner", label: "Monthly Planner" },
  { href: "/reports", label: "Reports & Exports" },
  { href: "/users", label: "Users", roles: ["admin", "manager"] },
  { href: "/settings", label: "Settings", roles: ["admin", "manager"] },
]

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()

  return (
    <aside className="w-64 border-r bg-sidebar text-sidebar-foreground">
      <div className="px-4 py-4 text-sm font-semibold tracking-tight">Primex Nexus</div>
      <nav className="space-y-1 px-2 pb-4">
        {items
          .filter((i) => (!i.roles ? true : i.roles.includes(role)))
          .map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
              >
                {item.label}
              </Link>
            )
          })}
      </nav>
    </aside>
  )
}

