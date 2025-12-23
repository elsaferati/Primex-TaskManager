"use client"

import * as React from "react"
import Link from "next/link"

import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import type { Department, Project, SystemTaskTemplate, Task, User } from "@/lib/types"

const TABS = [
  { id: "all", label: "All (Sot)", tone: "neutral" },
  { id: "projects", label: "Projekte", tone: "neutral" },
  { id: "system", label: "Detyra Sistemi", tone: "blue" },
  { id: "no-project", label: "Detyra Pa Projekt", tone: "red" },
  { id: "ga-ka", label: "Shenime GA/KA", tone: "neutral" },
  { id: "meetings", label: "Takime", tone: "neutral" },
] as const

type TabId = (typeof TABS)[number]["id"]

const PHASES = ["PLANIFIKIMI", "ZHVILLIMI", "TESTIMI", "DOKUMENTIMI"] as const

const PHASE_LABELS: Record<string, string> = {
  PLANIFIKIMI: "Planifikimi",
  ZHVILLIMI: "Zhvillimi",
  TESTIMI: "Testimi",
  DOKUMENTIMI: "Dokumentimi",
  MBYLLUR: "Mbyllur",
}

const WEEKDAYS_SQ = [
  "E Hene",
  "E Marte",
  "E Merkure",
  "E Enjte",
  "E Premte",
  "E Shtune",
  "E Diel",
]

const FREQUENCY_LABELS: Record<SystemTaskTemplate["frequency"], string> = {
  DAILY: "DITORE",
  WEEKLY: "JAVORE",
  MONTHLY: "MUJORE",
  YEARLY: "VJETORE",
  "3_MONTHS": "3/6 MUJORE",
  "6_MONTHS": "3/6 MUJORE",
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  INACTIVE: "Inactive",
}

const STATUS_OPTIONS = ["OPEN", "INACTIVE"] as const

function initials(src: string) {
  return src
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

function formatToday() {
  const now = new Date()
  const date = now.toLocaleDateString("sq-AL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
  const day = now.toLocaleDateString("sq-AL", { weekday: "short" })
  return `${day} - ${date}`
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatDayLabel(date: Date) {
  const today = new Date()
  const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const targetKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const delta = Math.round((targetKey - todayKey) / (24 * 60 * 60 * 1000))
  const prefix = delta === 0 ? "Sot" : delta === -1 ? "Dje" : delta === 1 ? "Neser" : ""
  const weekday = WEEKDAYS_SQ[date.getDay() === 0 ? 6 : date.getDay() - 1]
  return prefix ? `${prefix} • ${weekday}` : weekday
}

function shouldShowTemplate(t: SystemTaskTemplate, date: Date) {
  if (t.frequency === "DAILY") return true
  if (t.frequency === "WEEKLY") {
    const dayIdx = date.getDay() === 0 ? 6 : date.getDay() - 1
    return t.day_of_week == null ? dayIdx === 0 : t.day_of_week === dayIdx
  }
  if (t.frequency === "MONTHLY") {
    return t.day_of_month == null ? date.getDate() === 1 : t.day_of_month === date.getDate()
  }
  if (t.frequency === "YEARLY") {
    if (t.month_of_year != null && t.month_of_year !== date.getMonth() + 1) return false
    if (t.day_of_month != null && t.day_of_month !== date.getDate()) return false
    return true
  }
  if (t.frequency === "3_MONTHS") {
    if (t.month_of_year != null && t.month_of_year !== date.getMonth() + 1) return false
    if (t.day_of_month != null && t.day_of_month !== date.getDate()) return false
    return (date.getMonth() + 1) % 3 === 0
  }
  if (t.frequency === "6_MONTHS") {
    if (t.month_of_year != null && t.month_of_year !== date.getMonth() + 1) return false
    if (t.day_of_month != null && t.day_of_month !== date.getDate()) return false
    return (date.getMonth() + 1) % 6 === 0
  }
  return false
}

function formatSchedule(t: SystemTaskTemplate, date: Date) {
  const dayLabel = formatDayLabel(date)
  const dateLabel = date.toLocaleDateString("sq-AL", { day: "2-digit", month: "2-digit", year: "numeric" })
  return `${dayLabel}\n${dateLabel}`
}

export function DepartmentKanban({ departmentName }: { departmentName: string }) {
  const { apiFetch, user } = useAuth()
  const [department, setDepartment] = React.useState<Department | null>(null)
  const [projects, setProjects] = React.useState<Project[]>([])
  const [systemTasks, setSystemTasks] = React.useState<SystemTaskTemplate[]>([])
  const [noProjectTasks, setNoProjectTasks] = React.useState<Task[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [loading, setLoading] = React.useState(true)
  const [viewMode, setViewMode] = React.useState<"department" | "mine">("department")
  const [activeTab, setActiveTab] = React.useState<TabId>("projects")
  const [selectedUserId, setSelectedUserId] = React.useState<string>("__all__")
  const [showAllSystem, setShowAllSystem] = React.useState(false)
  const [systemDate, setSystemDate] = React.useState(() => new Date())
  const [multiSelect, setMultiSelect] = React.useState(false)
  const [createSystemOpen, setCreateSystemOpen] = React.useState(false)
  const [creatingSystem, setCreatingSystem] = React.useState(false)
  const [systemTitle, setSystemTitle] = React.useState("")
  const [systemDescription, setSystemDescription] = React.useState("")
  const [systemOwnerId, setSystemOwnerId] = React.useState("__unassigned__")
  const [systemDepartmentId, setSystemDepartmentId] = React.useState("")
  const [systemDateInput, setSystemDateInput] = React.useState(() => formatDateInput(new Date()))
  const [systemFrequency, setSystemFrequency] = React.useState<SystemTaskTemplate["frequency"]>("DAILY")
  const [systemStatus, setSystemStatus] = React.useState<(typeof STATUS_OPTIONS)[number]>("OPEN")
  const [createProjectOpen, setCreateProjectOpen] = React.useState(false)
  const [creatingProject, setCreatingProject] = React.useState(false)
  const [projectTitle, setProjectTitle] = React.useState("")
  const [projectDescription, setProjectDescription] = React.useState("")
  const [projectManagerId, setProjectManagerId] = React.useState("__unassigned__")
  const [projectPhase, setProjectPhase] = React.useState("PLANIFIKIMI")
  const [projectStatus, setProjectStatus] = React.useState("TODO")

  React.useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const depRes = await apiFetch("/departments")
        if (!depRes.ok) return
        const deps = (await depRes.json()) as Department[]
        const dep = deps.find((d) => d.name === departmentName) || null
        setDepartment(dep)
        if (!dep) return

        const [projRes, sysRes, tasksRes] = await Promise.all([
          apiFetch(`/projects?department_id=${dep.id}`),
          apiFetch(`/system-tasks?department_id=${dep.id}`),
          apiFetch(`/tasks?department_id=${dep.id}&include_done=false`),
        ])
        if (projRes.ok) setProjects((await projRes.json()) as Project[])
        if (sysRes.ok) setSystemTasks((await sysRes.json()) as SystemTaskTemplate[])
        if (tasksRes.ok) {
          const taskRows = (await tasksRes.json()) as Task[]
          setNoProjectTasks(taskRows.filter((t) => !t.project_id))
        }

        if (user?.role !== "STAFF") {
          const usersRes = await apiFetch("/users")
          if (usersRes.ok) {
            const us = (await usersRes.json()) as User[]
            setUsers(us.filter((u) => u.department_id === dep.id))
          }
        }

        setSystemDepartmentId(dep.id)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [apiFetch, departmentName, user?.role])

  const userMap = React.useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const filteredProjects = React.useMemo(() => {
    if (viewMode === "mine" && user?.id) {
      return projects.filter((p) => p.manager_id === user.id)
    }
    return projects
  }, [projects, user?.id, viewMode])

  const counts = React.useMemo(
    () => ({
      all: filteredProjects.length,
      projects: filteredProjects.length,
      system: systemTasks.length,
      "no-project": noProjectTasks.length,
      "ga-ka": 0,
      meetings: 0,
    }),
    [filteredProjects.length, systemTasks.length, noProjectTasks.length]
  )

  const canCreate = user?.role === "ADMIN" || user?.role === "MANAGER"

  const visibleSystemTasks = React.useMemo(() => {
    if (showAllSystem) return systemTasks
    return systemTasks.filter((t) => shouldShowTemplate(t, systemDate))
  }, [showAllSystem, systemDate, systemTasks])

  const noProjectBuckets = React.useMemo(() => {
    const normal: Task[] = []
    const blocked: Task[] = []
    const oneHour: Task[] = []
    const r1: Task[] = []
    for (const t of noProjectTasks) {
      if (t.is_bllok) {
        blocked.push(t)
      } else if (t.is_1h_report) {
        oneHour.push(t)
      } else if (t.is_r1) {
        r1.push(t)
      } else {
        normal.push(t)
      }
    }
    return { normal, blocked, oneHour, r1 }
  }, [noProjectTasks])

  const systemGroups = React.useMemo(() => {
    const groups = new Map<string, SystemTaskTemplate[]>()
    for (const t of visibleSystemTasks) {
      const key = FREQUENCY_LABELS[t.frequency] || "DITORE"
      const list = groups.get(key) || []
      list.push(t)
      groups.set(key, list)
    }
    return Array.from(groups.entries()).map(([label, items]) => ({
      label,
      items: items.sort((a, b) => a.title.localeCompare(b.title)),
    }))
  }, [visibleSystemTasks])

  const submitSystemTask = async () => {
    if (!systemTitle.trim() || !systemDepartmentId) return
    setCreatingSystem(true)
    try {
      const date = new Date(systemDateInput)
      const dayIdx = date.getDay() === 0 ? 6 : date.getDay() - 1
      const dayOfMonth = date.getDate()
      const monthOfYear = date.getMonth() + 1

      const payload = {
        title: systemTitle.trim(),
        description: systemDescription.trim() || null,
        department_id: systemDepartmentId,
        default_assignee_id: systemOwnerId === "__unassigned__" ? null : systemOwnerId,
        frequency: systemFrequency,
        day_of_week: systemFrequency === "WEEKLY" ? dayIdx : null,
        day_of_month: systemFrequency !== "WEEKLY" && systemFrequency !== "DAILY" ? dayOfMonth : null,
        month_of_year:
          systemFrequency === "YEARLY" || systemFrequency === "3_MONTHS" || systemFrequency === "6_MONTHS"
            ? monthOfYear
            : null,
        is_active: systemStatus === "OPEN",
      }

      const res = await apiFetch("/system-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail = "Failed to create system task"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const created = (await res.json()) as SystemTaskTemplate
      setSystemTasks((prev) => [created, ...prev])
      setCreateSystemOpen(false)
      setSystemTitle("")
      setSystemDescription("")
      setSystemOwnerId("__unassigned__")
      setSystemDateInput(formatDateInput(new Date()))
      setSystemFrequency("DAILY")
      setSystemStatus("OPEN")
      toast.success("System task created")
    } finally {
      setCreatingSystem(false)
    }
  }

  const submitProject = async () => {
    if (!projectTitle.trim() || !department) return
    setCreatingProject(true)
    try {
      const payload = {
        title: projectTitle.trim(),
        description: projectDescription.trim() || null,
        department_id: department.id,
        manager_id: projectManagerId === "__unassigned__" ? null : projectManagerId,
        current_phase: projectPhase,
        status: projectStatus,
      }
      const res = await apiFetch("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail = "Failed to create project"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const created = (await res.json()) as Project
      setProjects((prev) => [created, ...prev])
      setCreateProjectOpen(false)
      setProjectTitle("")
      setProjectDescription("")
      setProjectManagerId("__unassigned__")
      setProjectPhase("PLANIFIKIMI")
      setProjectStatus("TODO")
      toast.success("Project created")
    } finally {
      setCreatingProject(false)
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading...</div>
  if (!department) return <div className="text-sm text-muted-foreground">Department not found.</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold">{departmentName}</div>
          <div className="text-sm text-muted-foreground">Menaxhimi i projekteve dhe detyrave ditore</div>
        </div>
        <div className="inline-flex rounded-xl border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setViewMode("department")}
            className={[
              "rounded-lg px-4 py-2 text-sm font-medium transition",
              viewMode === "department" ? "bg-background shadow-sm" : "text-muted-foreground",
            ].join(" ")}
          >
            Departamenti
          </button>
          <button
            type="button"
            onClick={() => setViewMode("mine")}
            className={[
              "rounded-lg px-4 py-2 text-sm font-medium transition",
              viewMode === "mine" ? "bg-background shadow-sm" : "text-muted-foreground",
            ].join(" ")}
          >
            Pamja Ime
          </button>
        </div>
      </div>

      <div className="border-b">
        <div className="flex flex-wrap gap-4">
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab
            const badgeTone =
              tab.tone === "blue"
                ? "bg-blue-50 text-blue-600"
                : tab.tone === "red"
                  ? "bg-red-50 text-red-600"
                  : "bg-muted text-foreground"
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "relative flex items-center gap-2 px-2 pb-3 text-sm font-medium",
                  isActive ? "text-foreground" : "text-muted-foreground",
                ].join(" ")}
              >
                {tab.label}
                <span className={`rounded-full px-2 py-0.5 text-xs ${badgeTone}`}>{counts[tab.id]}</span>
                {isActive ? <span className="absolute inset-x-2 bottom-0 h-0.5 bg-foreground" /> : null}
              </button>
            )
          })}
        </div>
      </div>

      {activeTab === "projects" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-lg font-semibold">Projekte Aktive</div>
            {canCreate ? (
              <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
                <DialogTrigger asChild>
                  <Button className="rounded-xl">+ Projekt i Ri</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Shto Projekt</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Titulli</Label>
                      <Input value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Pershkrimi</Label>
                      <Textarea
                        value={projectDescription}
                        onChange={(e) => setProjectDescription(e.target.value)}
                        placeholder="Shkruaj pershkrimin e projektit..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Manager</Label>
                      <Select value={projectManagerId} onValueChange={setProjectManagerId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select manager" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unassigned__">Unassigned</SelectItem>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.full_name || u.username || u.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Faza</Label>
                      <Select value={projectPhase} onValueChange={setProjectPhase}>
                        <SelectTrigger>
                          <SelectValue placeholder="Faza" />
                        </SelectTrigger>
                        <SelectContent>
                          {PHASES.map((p) => (
                            <SelectItem key={p} value={p}>
                              {PHASE_LABELS[p]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Statusi</Label>
                      <Select value={projectStatus} onValueChange={setProjectStatus}>
                        <SelectTrigger>
                          <SelectValue placeholder="Statusi" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TODO">To do</SelectItem>
                          <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                          <SelectItem value="REVIEW">Review</SelectItem>
                          <SelectItem value="DONE">Done</SelectItem>
                          <SelectItem value="CANCELLED">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2 md:col-span-2">
                      <Button variant="outline" onClick={() => setCreateProjectOpen(false)}>
                        Anulo
                      </Button>
                      <Button disabled={!projectTitle.trim() || creatingProject} onClick={() => void submitProject()}>
                        {creatingProject ? "Ruaj..." : "Ruaj"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {filteredProjects.map((project) => {
              const manager = project.manager_id ? userMap.get(project.manager_id) : null
              const phase = project.current_phase || "PLANIFIKIMI"
              return (
                <Card key={project.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold">{project.title || project.name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{project.description || "—"}</div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {PHASE_LABELS[phase] || "Planifikimi"}
                    </Badge>
                  </div>
                  <div className="mt-4 text-xs text-muted-foreground">
                    {PHASES.map((p, idx) => {
                      const isCurrent = p === phase
                      return (
                        <span key={p}>
                          <span className={isCurrent ? "text-blue-600 font-medium" : ""}>
                            {PHASE_LABELS[p]}
                          </span>
                          {idx < PHASES.length - 1 ? " -> " : ""}
                        </span>
                      )
                    })}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {manager ? (
                        <div className="h-8 w-8 rounded-full bg-blue-100 text-xs font-semibold text-blue-700 flex items-center justify-center">
                          {initials(manager.full_name || manager.username || manager.email)}
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-muted text-xs font-semibold flex items-center justify-center">
                          —
                        </div>
                      )}
                    </div>
                    <Link href={`/projects/${project.id}`} className="text-sm text-blue-600 hover:underline">
                      Kliko per detaje →
                    </Link>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      ) : null}

      {activeTab === "all" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">
                {viewMode === "department" ? "All (Sot) - Departamenti" : "All (Sot)"}
              </div>
              <div className="text-sm text-muted-foreground">
                {viewMode === "department"
                  ? "Te gjitha detyrat e sotit per ekipin e departamentit."
                  : "Te gjitha detyrat e sotit, te organizuara ne nje vend."}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-lg border bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                {formatToday()}
              </div>
              {viewMode === "mine" && users.length ? (
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="h-9 w-48">
                    <SelectValue placeholder="All users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All users</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name || u.username || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {viewMode === "mine" ? <Button variant="outline">Print</Button> : null}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: "PROJEKT TASKS", value: 0 },
              { label: "PA PROJEKT", value: 0 },
              { label: "SHENIME (OPEN)", value: 0 },
              { label: "SISTEM", value: 0 },
            ].map((stat) => (
              <Card key={stat.label} className="p-4">
                <div className="text-xs font-semibold text-muted-foreground">{stat.label}</div>
                <div className="mt-2 text-2xl font-semibold">{stat.value}</div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === "system" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">Detyra Sistemi</div>
              <div className="text-sm text-muted-foreground">
                Detyrat e departamenteve, te organizuara sipas frekuences dhe dates.
              </div>
            </div>
            {canCreate ? (
              <Dialog open={createSystemOpen} onOpenChange={setCreateSystemOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">+ Shto Detyre</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Shto Detyre Sistemi</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Titulli</Label>
                      <Input value={systemTitle} onChange={(e) => setSystemTitle(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Personi (Owner)</Label>
                      <Select value={systemOwnerId} onValueChange={setSystemOwnerId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select owner" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unassigned__">Unassigned</SelectItem>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.full_name || u.username || u.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Vendosur nga</Label>
                      <Input value={user?.full_name || user?.username || user?.email || ""} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>Data</Label>
                      <Input
                        type="date"
                        value={systemDateInput}
                        onChange={(e) => setSystemDateInput(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Frekuenca</Label>
                      <Select value={systemFrequency} onValueChange={(v) => setSystemFrequency(v as SystemTaskTemplate["frequency"])}>
                        <SelectTrigger>
                          <SelectValue placeholder="Frekuenca" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DAILY">Ditore</SelectItem>
                          <SelectItem value="WEEKLY">Javore</SelectItem>
                          <SelectItem value="MONTHLY">Mujore</SelectItem>
                          <SelectItem value="3_MONTHS">3 Mujore</SelectItem>
                          <SelectItem value="6_MONTHS">6 Mujore</SelectItem>
                          <SelectItem value="YEARLY">Vjetore</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Departamenti</Label>
                      <Select value={systemDepartmentId} onValueChange={setSystemDepartmentId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Department" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={department.id}>{department.name}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Statusi</Label>
                      <Select value={systemStatus} onValueChange={(v) => setSystemStatus(v as typeof systemStatus)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Statusi" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OPEN">Open</SelectItem>
                          <SelectItem value="INACTIVE">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Pershkrimi</Label>
                      <Textarea
                        value={systemDescription}
                        onChange={(e) => setSystemDescription(e.target.value)}
                        placeholder="Shkruaj detajet e detyres..."
                      />
                    </div>
                    <div className="flex justify-end gap-2 md:col-span-2">
                      <Button variant="outline" onClick={() => setCreateSystemOpen(false)}>
                        Anulo
                      </Button>
                      <Button disabled={!systemTitle.trim() || creatingSystem} onClick={() => void submitSystemTask()}>
                        {creatingSystem ? "Ruaj..." : "Ruaj"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-xl border bg-muted/40 p-1">
              {[
                { label: "Sot", offset: 0 },
                { label: "Dje", offset: -1 },
                { label: "Neser", offset: 1 },
              ].map((opt) => {
                const target = new Date()
                target.setDate(target.getDate() + opt.offset)
                const active =
                  target.toDateString() === systemDate.toDateString()
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setSystemDate(target)}
                    className={[
                      "rounded-lg px-4 py-2 text-sm font-medium transition",
                      active ? "bg-background shadow-sm" : "text-muted-foreground",
                    ].join(" ")}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={multiSelect} onCheckedChange={(v) => setMultiSelect(Boolean(v))} />
              <span>Multi-select</span>
            </div>
            <Input
              type="date"
              className="w-40"
              value={formatDateInput(systemDate)}
              onChange={(e) => setSystemDate(new Date(e.target.value))}
            />
            <Button variant="outline" onClick={() => setShowAllSystem((prev) => !prev)}>
              {showAllSystem ? "Vetem data" : "Shfaq te gjitha"}
            </Button>
          </div>

          <div className="space-y-4">
            {systemGroups.length ? (
              systemGroups.map((group) => (
                <Card key={group.label} className="overflow-hidden">
                  <div className="flex items-center gap-3 border-b px-4 py-3">
                    <Badge variant="outline" className="text-xs font-semibold">
                      {group.label}
                    </Badge>
                    <Badge variant="secondary">{group.items.length}</Badge>
                  </div>
                  <div className="grid grid-cols-7 gap-3 border-b bg-muted/30 px-4 py-3 text-xs font-semibold text-muted-foreground">
                    <div className="col-span-2">DETYRA</div>
                    <div>DEPARTAMENTI</div>
                    <div>KUR</div>
                    <div>STATUSI</div>
                    <div>OWNER</div>
                    <div>VENDOSUR NGA</div>
                  </div>
                  <div className="divide-y">
                    {group.items.map((item) => {
                      const owner = item.default_assignee_id ? users.find((u) => u.id === item.default_assignee_id) : null
                      return (
                        <div key={item.id} className="grid grid-cols-7 gap-3 px-4 py-4 text-sm">
                          <div className="col-span-2">
                            <div className="font-medium">{item.title}</div>
                            <div className="text-xs text-muted-foreground">{item.description || "—"}</div>
                          </div>
                          <div>{department.code}</div>
                          <div className="whitespace-pre-line text-muted-foreground">
                            {formatSchedule(item, systemDate)}
                          </div>
                          <div>
                            <Badge variant="secondary">{item.is_active ? STATUS_LABELS.OPEN : STATUS_LABELS.INACTIVE}</Badge>
                          </div>
                          <div>{owner?.full_name || owner?.username || "—"}</div>
                          <div>{user?.full_name || user?.username || "—"}</div>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No system tasks yet.</div>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === "no-project" ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <div className="text-sm font-semibold">Normale / GA</div>
            <div className="mt-3 space-y-3">
              {noProjectBuckets.normal.length ? (
                noProjectBuckets.normal.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}`}
                    className="block rounded-xl border px-4 py-3 hover:bg-muted/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{t.title}</div>
                      <Badge variant="outline" className="text-xs">
                        {t.ga_note_origin_id ? "GA" : "Normale"}
                      </Badge>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No tasks</div>
              )}
            </div>
          </Card>

          <Card className="p-4 bg-red-50/40 border-red-100">
            <div className="flex items-center gap-2 text-red-700 font-semibold">
              <span className="h-5 w-5 rounded-full bg-red-500" />
              <span>BLLOK</span>
            </div>
            <div className="mt-3 space-y-3">
              {noProjectBuckets.blocked.length ? (
                noProjectBuckets.blocked.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}`}
                    className="block rounded-xl border border-red-100 bg-white px-4 py-3 hover:bg-red-50"
                  >
                    <div className="font-medium">{t.title}</div>
                    <Badge variant="outline" className="mt-2 text-xs border-red-200 text-red-600">
                      BLLOK
                    </Badge>
                  </Link>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No tasks</div>
              )}
            </div>
          </Card>

          <Card className="p-4 bg-purple-50/40 border-purple-100">
            <div className="flex items-center gap-2 text-purple-700 font-semibold">
              <span className="h-5 w-5 rounded-full border-2 border-purple-500" />
              <span>1H Report</span>
            </div>
            <div className="mt-3 space-y-3">
              {noProjectBuckets.oneHour.length ? (
                noProjectBuckets.oneHour.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}`}
                    className="block rounded-xl border border-purple-100 bg-white px-4 py-3 hover:bg-purple-50"
                  >
                    <div className="font-medium">{t.title}</div>
                    <Badge variant="outline" className="mt-2 text-xs border-purple-200 text-purple-600">
                      1H
                    </Badge>
                  </Link>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No tasks</div>
              )}
            </div>
          </Card>

          <Card className="p-4 bg-green-50/40 border-green-100">
            <div className="text-green-700 font-semibold">R1</div>
            <div className="mt-2 text-sm text-green-700/80">
              Projekt i ri (rasti i pare) behet bashke me menaxherin.
            </div>
            <div className="mt-3 space-y-3">
              {noProjectBuckets.r1.length ? (
                noProjectBuckets.r1.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}`}
                    className="block rounded-xl border border-green-100 bg-white px-4 py-3 hover:bg-green-50"
                  >
                    <div className="font-medium">{t.title}</div>
                    <Badge variant="outline" className="mt-2 text-xs border-green-200 text-green-600">
                      R1
                    </Badge>
                  </Link>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No tasks</div>
              )}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
