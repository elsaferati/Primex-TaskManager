"use client"

import * as React from "react"
import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth"
import type { Department, Task, User } from "@/lib/types"

type WeeklyDay = { date: string; tasks: Task[] }
type WeeklyResponse = { week_start: string; week_end: string; overdue: Task[]; days: WeeklyDay[] }

function mondayISO(today = new Date()) {
  const d = new Date(today)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

export default function WeeklyPlannerPage() {
  const { apiFetch, user } = useAuth()
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [departmentId, setDepartmentId] = React.useState<string>("")
  const [userId, setUserId] = React.useState<string>("")
  const [weekStart, setWeekStart] = React.useState<string>(mondayISO())
  const [data, setData] = React.useState<WeeklyResponse | null>(null)

  React.useEffect(() => {
    const boot = async () => {
      const depRes = await apiFetch("/departments")
      if (depRes.ok) {
        const deps = (await depRes.json()) as Department[]
        setDepartments(deps)
        const initialDep = user?.department_id || deps[0]?.id || ""
        setDepartmentId(initialDep)
      }
      if (user?.role !== "staff") {
        const uRes = await apiFetch("/users")
        if (uRes.ok) {
          const us = (await uRes.json()) as User[]
          setUsers(us)
        }
      }
    }
    void boot()
  }, [apiFetch, user])

  React.useEffect(() => {
    const load = async () => {
      const qs = new URLSearchParams()
      qs.set("week_start", weekStart)
      if (departmentId) qs.set("department_id", departmentId)
      if (userId) qs.set("user_id", userId)
      const res = await apiFetch(`/planners/weekly?${qs.toString()}`)
      if (!res.ok) return
      const payload = (await res.json()) as WeeklyResponse
      setData(payload)
    }
    if (!weekStart) return
    void load()
  }, [apiFetch, weekStart, departmentId, userId])

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">Weekly Planner</div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Week start</Label>
          <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
        </div>
        {user?.role !== "staff" ? (
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
        {user?.role !== "staff" ? (
          <div className="space-y-2">
            <Label>User</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All users</SelectItem>
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
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Overdue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.overdue.length ? (
                data.overdue.map((t) => (
                  <Link key={t.id} href={`/tasks/${t.id}`} className="block text-sm hover:underline">
                    {t.title}
                  </Link>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No overdue tasks.</div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {data.days.map((d) => (
              <Card key={d.date}>
                <CardHeader>
                  <CardTitle className="text-sm">{d.date}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {d.tasks.length ? (
                    d.tasks.map((t) => (
                      <Link key={t.id} href={`/tasks/${t.id}`} className="block text-sm hover:underline">
                        {t.title}
                      </Link>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground">No tasks.</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Loading planner…</div>
      )}
    </div>
  )
}

