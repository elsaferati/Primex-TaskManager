"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  LayoutDashboard, 
  Globe, 
  Code2, 
  FileText, 
  Palette, 
  CalendarDays, 
  CalendarRange, 
  BarChart3, 
  Users, 
  Settings,
  Layers,
  ClipboardCheck,
  Hexagon,
  StickyNote,
  type LucideIcon
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { UserRole } from "@/lib/types"

// 1. Add an 'icon' property to your type definition
type NavItem = { 
  href: string; 
  label: string; 
  icon: LucideIcon;
  roles?: UserRole[] 
}

// 2. Map icons to your existing routes
const items: NavItem[] = [
  { 
    href: "/dashboard", 
    label: "Dashboard", 
    icon: LayoutDashboard 
  },
  { 
    href: "/common", 
    label: "Common View", 
    icon: Globe 
  },
  {
    href: "/ga-ka-notes",
    label: "GA/KA Notes",
    icon: StickyNote,
  },
  {
    href: "/ga-ka-tasks",
    label: "Admin",
    icon: ClipboardCheck,
  },
  {
    href: "/system-tasks",
    label: "System Tasks",
    icon: Layers,
  },
  { 
    href: "/departments/development", 
    label: "Development", 
    icon: Code2 
  },
    { 
      href: "/departments/project-content-manager", 
      label: "Product Content", 
      icon: FileText 
    },
  { 
    href: "/departments/graphic-design", 
    label: "Graphic Design", 
    icon: Palette 
  },
  { 
    href: "/weekly-planner", 
    label: "Weekly Planner", 
    icon: CalendarDays 
  },
  { 
    href: "/monthly-planner", 
    label: "Monthly Planner", 
    icon: CalendarRange 
  },
  { 
    href: "/reports", 
    label: "Reports & Exports", 
    icon: BarChart3 
  },
  { 
    href: "/users", 
    label: "Users", 
    icon: Users, 
    roles: ["ADMIN", "MANAGER"] 
  },
  { 
    href: "/settings", 
    label: "Settings", 
    icon: Settings, 
    roles: ["ADMIN", "MANAGER"] 
  },
]

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()

  return (
    <aside className="w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground flex flex-col h-screen sticky top-0">
      {/* Header / Logo Area */}
      <div className="flex h-16 items-center border-b px-6">
        <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <Hexagon className="h-6 w-6 text-primary fill-primary/20" />
          <span>PrimeFlow</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {items
          .filter((i) => (!i.roles ? true : i.roles.includes(role)))
          .map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                    : "text-muted-foreground"
                )}
              >
                <item.icon className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )} />
                {item.label}
              </Link>
            )
          })}
      </nav>

      {/* Optional: User Profile / Footer area could go here */}
    </aside>
  )
}


