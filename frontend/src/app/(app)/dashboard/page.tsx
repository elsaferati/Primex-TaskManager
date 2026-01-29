"use client"

import * as React from "react"
import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/lib/auth"
import type { Task } from "@/lib/types"

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

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">Dashboard</div>
      <div className="grid gap-4 md:grid-cols-3 bg-red">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Open tasks</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{tasks.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Overdue</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{overdue.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Reminders</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{reminders.length}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 bg-green-100">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Quick links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm bg-red">
            <Link className="block underline" href="/weekly-planner">
              Weekly Planner
            </Link>
            <Link className="block underline" href="/monthly-planner">
              Monthly Planner
            </Link>
            <Link className="block underline" href="/reports">
              Reports & Exports
            </Link>
            {user?.role !== "STAFF" ? (
              <Link className="block underline" href="/settings">
                Settings
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">System tasks</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {system.length ? `${system.length} system tasks currently open.` : "No system tasks currently open."}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}



