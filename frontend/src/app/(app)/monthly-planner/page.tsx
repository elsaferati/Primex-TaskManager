"use client"

import * as React from "react"
import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth"
import type { Department, Task, User } from "@/lib/types"

type MonthlySummary = { month_completed: number; previous_month_completed: number }
type MonthlyResponse = {
  month_start: string
  month_end: string
  tasks: Task[]
  recurring: Task[]
  summary: MonthlySummary
}

export default function MonthlyPlannerPage() {
  const { apiFetch, user } = useAuth()
  const now = new Date()
  const [year, setYear] = React.useState(String(now.getFullYear()))
  const [month, setMonth] = React.useState(String(now.getMonth() + 1))
  const ALL_USERS_VALUE = "__all__"
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [departmentId, setDepartmentId] = React.useState<string>("")
  const [userId, setUserId] = React.useState<string>(ALL_USERS_VALUE)
  const [data, setData] = React.useState<MonthlyResponse | null>(null)

  React.useEffect(() => {
    const boot = async () => {
      const depRes = await apiFetch("/departments")
      if (depRes.ok) {
        const deps = (await depRes.json()) as Department[]
        setDepartments(deps)
        const initialDep = user?.department_id || deps[0]?.id || ""
        setDepartmentId(initialDep)
      }
      if (user?.role !== "STAFF") {
        const uRes = await apiFetch("/users")
        if (uRes.ok) setUsers((await uRes.json()) as User[])
      }
    }
    void boot()
  }, [apiFetch, user])

  React.useEffect(() => {
    const load = async () => {
      const qs = new URLSearchParams()
      qs.set("year", year)
      qs.set("month", month)
      if (departmentId) qs.set("department_id", departmentId)
      if (userId && userId !== ALL_USERS_VALUE) qs.set("user_id", userId)
      const res = await apiFetch(`/planners/monthly?${qs.toString()}`)
      if (!res.ok) return
      setData((await res.json()) as MonthlyResponse)
    }
    void load()
  }, [apiFetch, year, month, departmentId, userId])

  const tasksByDay = React.useMemo(() => {
    const map = new Map<string, Task[]>()
    if (!data) return map
    for (const t of data.tasks) {
      const d = (t.planned_for || "").slice(0, 10)
      if (!d) continue
      map.set(d, [...(map.get(d) || []), t])
    }
    return map
  }, [data])

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">Monthly Planner</div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-2">
          <Label>Year</Label>
          <Input value={year} onChange={(e) => setYear(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Month</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }).map((_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {user?.role !== "STAFF" ? (
          <div className="space-y-2">
            <Label>Department</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {user?.role !== "STAFF" ? (
          <div className="space-y-2">
            <Label>User</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_USERS_VALUE}>All users</SelectItem>
                {users
                  .filter((u) => !departmentId || u.department_id === departmentId)
                  .map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.username}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {data ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Completed (planned this month)</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{data.summary.month_completed}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Previous month</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{data.summary.previous_month_completed}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recurring</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {data.recurring.length}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">List view</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from(tasksByDay.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([d, list]) => (
                  <div key={d}>
                    <div className="mb-1 text-sm font-medium">{d}</div>
                    <div className="space-y-1">
                      {list.map((t) => (
                        <Link key={t.id} href={`/tasks/${t.id}`} className="block text-sm hover:underline">
                          {t.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              {!tasksByDay.size ? <div className="text-sm text-muted-foreground">No tasks scheduled.</div> : null}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Loading planner…</div>
      )}
    </div>
  )
}


