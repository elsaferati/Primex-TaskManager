"use client"

import * as React from "react"
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
  ListTodo,
  Users, 
  Settings,
  Layers,
  ClipboardCheck,
  Hexagon,
  StickyNote,
  CalendarClock,
  Briefcase,
  DollarSign,
  Clock3,
  Shield,
  PanelLeftClose,
  type LucideIcon
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import type { UserRole } from "@/lib/types"
import { useSidebar } from "./sidebar-context"
import { useWaitingConfirmationGa } from "./waiting-confirmation-ga-context"

// 1. Add an 'icon' property to your type definition
type NavItem = { 
  href: string; 
  label: string; 
  icon: LucideIcon;
  match?: string[];
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
    href: "/next-week-plan",
    label: "PX JAV",
    icon: CalendarClock,
  },
  {
    href: "/waiting-confirmation-ga",
    label: "Waiting Conf GA",
    icon: Clock3,
  },
  {
    href: "/admin-tasks",
    label: "Admin tasks",
    icon: ClipboardCheck,
  },
  {
    href: "/system-tasks",
    label: "System Tasks",
    icon: Layers,
  },
  {
    href: "/system-task-instances",
    label: "System Tasks Report",
    icon: Layers,
  },
  { 
    href: "/departments/development", 
    label: "Development", 
    icon: Code2,
    match: ["/departments/development", "/projects/dev"]
  },
    { 
      href: "/departments/project-content-manager", 
      label: "Product Content", 
      icon: FileText,
      match: ["/departments/project-content-manager", "/projects/pcm"]
    },
  { 
    href: "/departments/graphic-design", 
    label: "Graphic Design", 
    icon: Palette,
    match: ["/departments/graphic-design", "/projects/design"]
  },
  { 
    href: "/departments/human-resource", 
    label: "Human Resource", 
    icon: Briefcase,
    match: ["/departments/human-resource"]
  },
  { 
    href: "/departments/finance", 
    label: "Finance", 
    icon: DollarSign,
    match: ["/departments/finance"]
  },
  { 
    href: "/weekly-planner", 
    label: "Weekly Planner", 
    icon: CalendarDays 
  },
  {
    href: "/open-tasks",
    label: "Open Tasks",
    icon: ListTodo,
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
    href: "/platforms",
    label: "PrimexEU Links",
    icon: Shield,
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
  const { apiFetch } = useAuth()
  const { isOpen, setIsOpen } = useSidebar()
  const { count } = useWaitingConfirmationGa()
  const [resolvedProjectRoute, setResolvedProjectRoute] = React.useState<"dev" | "pcm" | "design" | null>(null)
  const genericProjectId = React.useMemo(() => {
    const match = pathname.match(/^\/projects\/([^/]+)$/)
    return match ? decodeURIComponent(match[1]) : null
  }, [pathname])

  React.useEffect(() => {
    if (!genericProjectId) {
      setResolvedProjectRoute(null)
      return
    }

    let cancelled = false

    const resolveProjectRoute = async () => {
      try {
        const [projectRes, departmentsRes] = await Promise.all([
          apiFetch(`/projects/${genericProjectId}`),
          apiFetch("/departments"),
        ])

        if (!projectRes.ok || !departmentsRes.ok) {
          if (!cancelled) setResolvedProjectRoute(null)
          return
        }

        const project = (await projectRes.json()) as { department_id?: string | null }
        const departments = (await departmentsRes.json()) as Array<{ id: string; name: string; code?: string | null }>
        const department = departments.find((item) => item.id === project.department_id) || null
        const departmentKey = (department?.code || department?.name || "").trim().toLowerCase()

        let nextRoute: "dev" | "pcm" | "design" | null = null
        if (departmentKey === "development" || departmentKey === "dev") nextRoute = "dev"
        else if (
          departmentKey === "graphic design" ||
          departmentKey === "graphic-design" ||
          departmentKey === "gd"
        ) nextRoute = "design"
        else if (
          departmentKey === "project content manager" ||
          departmentKey === "project-content-manager" ||
          departmentKey === "pcm"
        ) nextRoute = "pcm"

        if (!cancelled) setResolvedProjectRoute(nextRoute)
      } catch {
        if (!cancelled) setResolvedProjectRoute(null)
      }
    }

    void resolveProjectRoute()

    return () => {
      cancelled = true
    }
  }, [apiFetch, genericProjectId])

  const projectRoute =
    pathname.startsWith("/projects/pcm")
      ? "pcm"
      : pathname.startsWith("/projects/design")
        ? "design"
        : pathname.startsWith("/projects/dev")
          ? "dev"
          : genericProjectId
            ? resolvedProjectRoute
            : null

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[110] md:hidden pointer-events-none"
          aria-hidden="true"
        />
      )}
      
      <aside
        className={cn(
          "fixed md:sticky md:top-0 left-0 z-[110] md:z-50 w-64 shrink-0 overflow-hidden border-r bg-sidebar text-sidebar-foreground flex flex-col h-screen md:h-[100vh] print:hidden transition-[width,transform] duration-300 ease-in-out",
          isOpen ? "translate-x-0 md:w-64" : "-translate-x-full md:w-0 md:translate-x-0 md:border-r-0"
        )}
        style={{ touchAction: "pan-y" }}
      >
        {/* Header / Logo Area */}
        <div className="flex h-16 w-64 items-center justify-between border-b px-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <Hexagon className="h-6 w-6 text-primary fill-primary/20" />
            <span>PrimeFlow</span>
          </Link>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-md hover:bg-sidebar-accent transition-colors"
            aria-label="Close sidebar"
            title="Close sidebar"
          >
            <PanelLeftClose className="h-5 w-5" />
          </button>
        </div>

      {/* Navigation Links */}
      <nav className="w-64 flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {items
          .filter((i) => (!i.roles ? true : i.roles.includes(role)))
          .map((item) => {
            const matchTargets = item.match || [item.href]
            const active =
              matchTargets.some((target) => pathname === target || pathname.startsWith(target + "/")) ||
              (item.label === "Development" && projectRoute === "dev") ||
              (item.label === "Product Content" && projectRoute === "pcm") ||
              (item.label === "Graphic Design" && projectRoute === "design")
            const displayLabel =
              item.href === "/waiting-confirmation-ga" ? `${item.label} (${count})` : item.label
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
                {displayLabel}
              </Link>
            )
          })}
      </nav>

      {/* Optional: User Profile / Footer area could go here */}
    </aside>
    </>
  )
}
