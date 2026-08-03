"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { 
  LayoutDashboard, 
  Globe, 
  Code2, 
  FileText, 
  FileSpreadsheet,
  Palette, 
  CalendarDays, 
  CalendarRange, 
  BarChart3, 
  ListTodo,
  Users, 
  Settings,
  Layers,
  ClipboardCheck,
  StickyNote,
  CalendarClock,
  Briefcase,
  DollarSign,
  FolderLock,
  Clock3,
  MailCheck,
  Shield,
  PanelLeftClose,
  Gem,
  Activity,
  ChevronDown,
  ChevronDown,
  FileSpreadsheet,
  ScrollText,
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
  exact?: boolean;
  roles?: UserRole[] 
}

type NavGroup = {
  id: string
  label: string
  icon: LucideIcon
  items: NavItem[]
}

const primaryItems: NavItem[] = [
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
]

const navGroups: NavGroup[] = [
  {
    id: "tasks",
    label: "Tasks",
    icon: ListTodo,
    items: [
      { href: "/primeflow-classifications", label: "Klasifikime", icon: Layers },
      { href: "/primeflow-pyetje", label: "Pyetje", icon: ClipboardCheck },
      { href: "/waiting-confirmation-ga", label: "Waiting Conf GA", icon: Clock3 },
      { href: "/admin-tasks", label: "Admin Tasks", icon: ClipboardCheck },
      { href: "/system-tasks", label: "System Tasks", icon: Layers },
      { href: "/open-tasks", label: "Open Tasks", icon: ListTodo },
    ],
  },
  {
    id: "departments",
    label: "Departamentet",
    icon: Briefcase,
    items: [
      {
        href: "/departments/development",
        label: "Development",
        icon: Code2,
        match: ["/departments/development", "/projects/dev"],
      },
      {
        href: "/departments/project-content-manager",
        label: "Product Content",
        icon: FileText,
        match: ["/departments/project-content-manager", "/projects/pcm"],
      },
      {
        href: "/departments/graphic-design",
        label: "Graphic Design",
        icon: Palette,
        match: ["/departments/graphic-design", "/projects/design"],
      },
      {
        href: "/departments/human-resource",
        label: "Human Resource",
        icon: Briefcase,
        match: ["/departments/human-resource"],
      },
      {
        href: "/departments/finance",
        label: "Finance",
        icon: DollarSign,
        match: ["/departments/finance"],
      },
    ],
  },
  {
    id: "planning",
    label: "Planifikimi",
    icon: CalendarDays,
    items: [
      { href: "/weekly-planner", label: "Weekly Planner", icon: CalendarDays },
      { href: "/monthly-planner", label: "Monthly Planner", icon: CalendarRange },
      { href: "/realization", label: "Realizimi", icon: Activity },
    ],
  },
  {
    id: "reports",
    label: "Raporte & Kontroll",
    icon: BarChart3,
    items: [
      { href: "/system-task-instances", label: "System Tasks Report", icon: Layers },
      { href: "/meetings-report", label: "Mbyllja e dites M3", icon: MailCheck },
      { href: "/reviews", label: "Reviews", icon: Gem },
      { href: "/reports", label: "Reports & Exports", icon: BarChart3, exact: true },
      {
        href: "/reports/weekly-planning-audit",
        label: "Kontrolli PLNF JAV",
        icon: FileSpreadsheet,
        roles: ["ADMIN", "MANAGER"],
      },
      {
        href: "/admin/1h-reports",
        label: "1H Report Management",
        icon: MailCheck,
        roles: ["ADMIN"],
      },
    ],
  },
  {
    id: "administration",
    label: "Administrimi",
    icon: Settings,
    items: [
      { href: "/platforms", label: "PrimexEU Links", icon: Shield },
      { href: "/file-access", label: "File Access", icon: FolderLock },
      { href: "/users", label: "Users", icon: Users, roles: ["ADMIN", "MANAGER"] },
      { href: "/settings", label: "Settings", icon: Settings, roles: ["ADMIN", "MANAGER"] },
    ],
  },
]

export function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const router = useRouter()
  const { apiFetch, user } = useAuth()
  const canAccessOneHReports =
    role === "ADMIN" || user?.full_name?.trim().toLocaleLowerCase() === "laurent hoxha"
  const { isOpen, isDesktop, setIsOpen } = useSidebar()
  const { count } = useWaitingConfirmationGa()
  const standardsActive = pathname === "/standards/excel" || pathname.startsWith("/standards/excel/")
  const [standardsOpen, setStandardsOpen] = React.useState(standardsActive)
  const [resolvedProjectRoute, setResolvedProjectRoute] = React.useState<"dev" | "pcm" | "design" | null>(null)
  const genericProjectId = React.useMemo(() => {
    const match = pathname.match(/^\/projects\/([^/]+)$/)
    return match ? decodeURIComponent(match[1]) : null
  }, [pathname])

  React.useEffect(() => {
    if (standardsActive) setStandardsOpen(true)
  }, [standardsActive])

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

  const canViewItem = React.useCallback(
    (item: NavItem) =>
      item.href === "/admin/1h-reports"
        ? canAccessOneHReports
        : !item.roles || item.roles.includes(role),
    [canAccessOneHReports, role]
  )

  const isItemActive = React.useCallback(
    (item: NavItem) => {
      const matchTargets = item.match || [item.href]
      return (
        matchTargets.some((target) =>
          item.exact ? pathname === target : pathname === target || pathname.startsWith(target + "/")
        ) ||
        (item.label === "Development" && projectRoute === "dev") ||
        (item.label === "Product Content" && projectRoute === "pcm") ||
        (item.label === "Graphic Design" && projectRoute === "design")
      )
    },
    [pathname, projectRoute]
  )

  const visibleGroups = React.useMemo(
    () =>
      navGroups
        .map((group) => ({ ...group, items: group.items.filter(canViewItem) }))
        .filter((group) => group.items.length > 0),
    [canViewItem]
  )

  const activeGroupId = React.useMemo(
    () => visibleGroups.find((group) => group.items.some(isItemActive))?.id ?? null,
    [isItemActive, visibleGroups]
  )
  const [openGroupId, setOpenGroupId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (activeGroupId) setOpenGroupId(activeGroupId)
  }, [activeGroupId])

  const renderNavItem = (item: NavItem, nested = false) => {
    const active = isItemActive(item)
    const displayLabel =
      item.href === "/waiting-confirmation-ga" ? `${item.label} (${count})` : item.label

    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={false}
        onMouseEnter={() => router.prefetch(item.href)}
        onFocus={() => router.prefetch(item.href)}
        onClick={() => {
          if (!isDesktop) setIsOpen(false)
        }}
        className={cn(
          "group flex items-center gap-3 rounded-md py-2.5 text-sm font-medium transition-colors",
          nested ? "pl-9 pr-3" : "px-3",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-muted-foreground"
        )}
      >
        <item.icon
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
          )}
        />
        <span className="min-w-0 truncate">{displayLabel}</span>
      </Link>
    )
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[100] md:hidden"
          aria-hidden="true"
          onClick={() => setIsOpen(false)}
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
        <div className="flex h-20 w-64 items-center justify-between border-b px-3">
          <Link
            href="/dashboard"
            className="flex h-full min-w-0 flex-1 items-center justify-center px-2"
            aria-label="PrimeFlow dashboard"
          >
            <Image
              src="/primeflow-sidebar-logo-transparent.png"
              alt="Prime Flow"
              width={160}
              height={58}
              priority
              className="h-auto max-h-[54px] w-full max-w-[160px] object-contain"
            />
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
        {primaryItems.filter(canViewItem).map((item) => renderNavItem(item))}

        <div className="my-2 border-t border-sidebar-border" />

        {visibleGroups.map((group) => {
          const isExpanded = openGroupId === group.id
          const containsActiveItem = group.id === activeGroupId

          return (
            <div key={group.id}>
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={`sidebar-group-${group.id}`}
                onClick={() => setOpenGroupId((current) => (current === group.id ? null : group.id))}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  containsActiveItem ? "text-sidebar-accent-foreground" : "text-muted-foreground"
                )}
              >
                <group.icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    containsActiveItem
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform duration-200",
                    isExpanded && "rotate-180"
                  )}
                />
              </button>

              {isExpanded && (
                <div id={`sidebar-group-${group.id}`} className="mt-1 space-y-1">
                  {group.items.map((item) => renderNavItem(item, true))}
                </div>
              )}
            </div>
          )
        })}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setStandardsOpen((current) => !current)}
            className={cn(
              "group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              standardsActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground"
            )}
            aria-expanded={standardsOpen}
          >
            <ScrollText className={cn("h-4 w-4 shrink-0", standardsActive ? "text-primary" : "text-muted-foreground")} />
            <span className="flex-1 text-left">STANDARDET</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", standardsOpen && "rotate-180")} />
          </button>
          {standardsOpen ? (
            <Link
              href="/standards/excel"
              onMouseEnter={() => router.prefetch("/standards/excel")}
              onFocus={() => router.prefetch("/standards/excel")}
              onClick={() => {
                if (!isDesktop) setIsOpen(false)
              }}
              className={cn(
                "ml-6 mt-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                standardsActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground"
              )}
            >
              <FileSpreadsheet className={cn("h-4 w-4", standardsActive ? "text-primary" : "text-muted-foreground")} />
              Excel
            </Link>
          ) : null}
        </div>
      </nav>

      {/* Optional: User Profile / Footer area could go here */}
    </aside>
    </>
  )
}

