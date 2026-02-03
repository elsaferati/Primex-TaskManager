"use client"

import * as React from "react"
import Link from "next/link"
import {
  CheckCircle2,
  AlertCircle,
  Bell,
  CalendarDays,
  CalendarRange,
  BarChart3,
  Settings,
  Layers,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/lib/auth"
import type { Task } from "@/lib/types"
import { cn } from "@/lib/utils"

export default function DashboardPage() {
  const { apiFetch, user } = useAuth()
  const [tasks, setTasks] = React.useState<Task[]>([])

  React.useEffect(() => {
    const load = async () => {
      const res = await apiFetch("/tasks?include_done=false")
      if (!res.ok) return
      const data = (await res.json()) as Task[]
      setTasks(data)
    }
    void load()
  }, [apiFetch])

  const overdue = tasks.filter((t) => t.planned_for && !t.completed_at && t.planned_for < new Date().toISOString().slice(0, 10))
  const reminders = tasks.filter((t) => t.reminder_enabled)
  const system = tasks.filter((t) => t.task_type === "system")

  const stats = [
    {
      label: "Open tasks",
      value: tasks.length,
      icon: CheckCircle2,
    },
    {
      label: "Overdue",
      value: overdue.length,
      icon: AlertCircle,
    },
    {
      label: "Reminders",
      value: reminders.length,
      icon: Bell,
    },
  ]

  const quickLinks = [
    {
      label: "Weekly Planner",
      href: "/weekly-planner",
      icon: CalendarDays,
    },
    {
      label: "Monthly Planner",
      href: "/monthly-planner",
      icon: CalendarRange,
    },
    {
      label: "Reports & Exports",
      href: "/reports",
      icon: BarChart3,
    },
    ...(user?.role !== "STAFF" 
      ? [{ label: "Settings", href: "/settings", icon: Settings }]
      : []
    ),
  ]

  return (
    <div className="space-y-6">
      <div className="text-lg font-semibold">Dashboard</div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="bg-white border border-slate-200 shadow-sm rounded-2xl">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                      {stat.label}
                    </div>
                    <div className="text-3xl font-bold text-slate-900">
                      {stat.value}
                    </div>
                  </div>
                  <div className="ml-4">
                    <Icon className="h-8 w-8 text-slate-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Quick Links and System Tasks */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {/* Quick Links Card */}
        <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold">Quick links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {quickLinks.map((link) => {
              const Icon = link.icon
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm",
                    "text-slate-700 hover:bg-slate-50 hover:text-slate-900",
                    "transition-colors duration-150",
                    "focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
                  )}
                >
                  <Icon className="h-4 w-4 text-slate-500" />
                  <span>{link.label}</span>
                </Link>
              )
            })}
          </CardContent>
        </Card>

        {/* System Tasks Card */}
        <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold">System tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {system.length > 0 ? (
              <div className="flex items-start gap-3">
                <Layers className="h-5 w-5 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-slate-700">
                    {system.length} system {system.length === 1 ? "task" : "tasks"} currently open.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <Layers className="h-5 w-5 text-slate-300 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-slate-500">
                    No system tasks currently open.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
