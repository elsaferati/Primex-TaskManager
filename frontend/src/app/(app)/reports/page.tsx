"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth"
import type { Department, Project, TaskStatus, User } from "@/lib/types"

export default function ReportsPage() {
  const { user, apiFetch } = useAuth()
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [projects, setProjects] = React.useState<Project[]>([])
  const [statuses, setStatuses] = React.useState<TaskStatus[]>([])

  const ALL_DEPARTMENTS_VALUE = "__all__"
  const ALL_USERS_VALUE = "__all_users__"
  const ALL_PROJECTS_VALUE = "__all_projects__"
  const ALL_STATUSES_VALUE = "__all_statuses__"
  const [departmentId, setDepartmentId] = React.useState(ALL_DEPARTMENTS_VALUE)
  const [userId, setUserId] = React.useState(ALL_USERS_VALUE)
  const [projectId, setProjectId] = React.useState(ALL_PROJECTS_VALUE)
  const [statusId, setStatusId] = React.useState(ALL_STATUSES_VALUE)
  const [plannedFrom, setPlannedFrom] = React.useState("")
  const [plannedTo, setPlannedTo] = React.useState("")

  React.useEffect(() => {
    const boot = async () => {
      const [dRes, uRes, pRes, sRes] = await Promise.all([
        apiFetch("/departments"),
        apiFetch("/users"),
        apiFetch("/projects"),
        apiFetch("/task-statuses"),
      ])
      if (dRes.ok) {
        const deps = (await dRes.json()) as Department[]
        setDepartments(deps)
        setDepartmentId(user?.department_id || deps[0]?.id || ALL_DEPARTMENTS_VALUE)
      }
      if (uRes.ok) setUsers((await uRes.json()) as User[])
      if (pRes.ok) setProjects((await pRes.json()) as Project[])
      if (sRes.ok) setStatuses((await sRes.json()) as TaskStatus[])
    }
    if (user?.role !== "STAFF") void boot()
  }, [apiFetch, user])

  const download = async (ext: "csv" | "xlsx" | "pdf") => {
    const qs = new URLSearchParams()
    if (user?.role === "ADMIN" && departmentId && departmentId !== ALL_DEPARTMENTS_VALUE) {
      qs.set("department_id", departmentId)
    }
    if (userId && userId !== ALL_USERS_VALUE) qs.set("user_id", userId)
    if (projectId && projectId !== ALL_PROJECTS_VALUE) qs.set("project_id", projectId)
    if (statusId && statusId !== ALL_STATUSES_VALUE) qs.set("status_id", statusId)
    if (plannedFrom) qs.set("planned_from", plannedFrom)
    if (plannedTo) qs.set("planned_to", plannedTo)

    const res = await apiFetch(`/exports/tasks.${ext}?${qs.toString()}`)
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `tasks_export.${ext}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  if (!user || user.role === "STAFF") {
    return <div className="text-sm text-muted-foreground">Forbidden.</div>
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">Reports & Exports</div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Export tasks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {user.role === "ADMIN" ? (
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_DEPARTMENTS_VALUE}>All</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>User</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_USERS_VALUE}>All users</SelectItem>
                  {users
                    .filter((u) => (user.role === "ADMIN" ? true : u.department_id === user.department_id))
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name || u.username}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_PROJECTS_VALUE}>All projects</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name || p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusId} onValueChange={setStatusId}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES_VALUE}>All statuses</SelectItem>
                  {statuses
                    .filter((s) => (user.role === "ADMIN" && departmentId && departmentId !== ALL_DEPARTMENTS_VALUE ? s.department_id === departmentId : true))
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Planned from</Label>
              <Input type="date" value={plannedFrom} onChange={(e) => setPlannedFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Planned to</Label>
              <Input type="date" value={plannedTo} onChange={(e) => setPlannedTo(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void download("csv")}>
              Download CSV
            </Button>
            <Button variant="outline" onClick={() => void download("xlsx")}>
              Download XLSX
            </Button>
            <Button variant="outline" onClick={() => void download("pdf")}>
              Download PDF summary
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


