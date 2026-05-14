"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useConfirm } from "@/components/providers/confirm-dialog-provider"
import { useAuth } from "@/lib/auth"
import { departmentTableTag, formatDepartmentName } from "@/lib/department-name"
import { formatDateDMY, normalizeDueDateInput, toDateInputValue } from "@/lib/dates"
import { resolveProjectTitle } from "@/lib/project-display-title"
import { fetchUsersLookupCached } from "@/lib/users-cache"
import type { Department, GaNote, Project, Task, UserLookup } from "@/lib/types"

type PlanningInboxFilter = "all" | "unplanned" | "this_week" | "next_week" | "ga" | "plan" | "project" | "fast"
type PlannerTaskDialogMode = "plan" | "edit"

const ALL_VALUE = "__all__"
const NONE_VALUE = "__none__"

const pad2 = (value: number) => String(value).padStart(2, "0")
const toISODate = (value: Date) => `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`

function mondayISO(today = new Date()) {
  const d = new Date(today)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return toISODate(d)
}

function shiftIsoDateByDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

function taskDateKey(value?: string | null) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return toISODate(date)
}

function isTaskPlannedForWeek(task: Task, weekStart: string, weekEnd: string) {
  const due = taskDateKey(task.due_date)
  if (!due) return false
  const startCandidate = taskDateKey(task.start_date)
  const start = startCandidate && startCandidate <= due ? startCandidate : due
  return start <= weekEnd && due >= weekStart
}

function isFastPlannerTask(task: Task) {
  return !task.project_id && !task.system_template_origin_id
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function statusLabel(value?: string | null) {
  const normalized = (value || "TODO").toUpperCase()
  if (normalized === "IN_PROGRESS") return "In Progress"
  if (normalized === "WAITING_CONFIRMATION") return "Waiting Confirmation"
  if (normalized === "DONE") return "Done"
  return "To Do"
}

function compactPlanGroupLabel(label: string) {
  if (label === "Unplanned") return "None"
  if (label === "Planned This Week") return "This wk"
  if (label === "Planned Next Week") return "Next wk"
  if (label === "This Week + Next Week") return "Both"
  return label
}

function initialsFromDisplayName(name: string) {
  const t = name.trim()
  if (!t) return "?"
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    const w = parts[0]
    return (w.length >= 2 ? w[0] + w[1] : w[0]).toUpperCase()
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function OpenTasksPage() {
  const { apiFetch, user } = useAuth()
  const confirm = useConfirm()
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [projects, setProjects] = React.useState<Project[]>([])
  const [users, setUsers] = React.useState<UserLookup[]>([])
  const [tasks, setTasks] = React.useState<Task[]>([])
  const [notes, setNotes] = React.useState<GaNote[]>([])
  const [departmentId, setDepartmentId] = React.useState(ALL_VALUE)
  const [filter, setFilter] = React.useState<PlanningInboxFilter>("all")
  const [userId, setUserId] = React.useState(ALL_VALUE)
  const [search, setSearch] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [dialogMode, setDialogMode] = React.useState<PlannerTaskDialogMode>("plan")
  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null)
  const [startDate, setStartDate] = React.useState("")
  const [dueDate, setDueDate] = React.useState("")
  const [finishPeriod, setFinishPeriod] = React.useState<"AM" | "PM" | typeof NONE_VALUE>("AM")
  const [assigneeIds, setAssigneeIds] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)
  const [clearingId, setClearingId] = React.useState<string | null>(null)
  const [exportingExcel, setExportingExcel] = React.useState(false)

  const thisWeekStart = React.useMemo(() => mondayISO(), [])
  const thisWeekEnd = React.useMemo(() => shiftIsoDateByDays(thisWeekStart, 4), [thisWeekStart])
  const nextWeekStart = React.useMemo(() => shiftIsoDateByDays(thisWeekStart, 7), [thisWeekStart])
  const nextWeekEnd = React.useMemo(() => shiftIsoDateByDays(nextWeekStart, 4), [nextWeekStart])

  const loadLookups = React.useCallback(async () => {
    const [depRes, projectRes] = await Promise.all([apiFetch("/departments"), apiFetch("/projects?include_templates=true")])
    if (depRes.ok) setDepartments((await depRes.json()) as Department[])
    if (projectRes.ok) setProjects((await projectRes.json()) as Project[])
    const usersList = await fetchUsersLookupCached(apiFetch)
    if (usersList) setUsers((usersList as UserLookup[]).filter((item) => item.is_active))
  }, [apiFetch])

  const loadTasks = React.useCallback(async () => {
    setLoading(true)
    try {
      const taskParams = new URLSearchParams()
      taskParams.set("include_done", "false")
      taskParams.set("include_all_departments", "true")
      if (departmentId !== ALL_VALUE) taskParams.set("department_id", departmentId)

      const noteParams = new URLSearchParams()
      if (departmentId !== ALL_VALUE) noteParams.set("department_id", departmentId)

      const [tasksRes, notesRes] = await Promise.all([
        apiFetch(`/tasks?${taskParams.toString()}`),
        apiFetch(`/ga-notes${noteParams.toString() ? `?${noteParams.toString()}` : ""}`),
      ])

      setTasks(tasksRes.ok ? ((await tasksRes.json()) as Task[]) : [])
      setNotes(notesRes.ok ? ((await notesRes.json()) as GaNote[]) : [])
    } catch (error) {
      console.error("Failed to load open tasks", error)
      toast.error("Failed to load open tasks")
      setTasks([])
      setNotes([])
    } finally {
      setLoading(false)
    }
  }, [apiFetch, departmentId])

  React.useEffect(() => {
    void loadLookups()
  }, [loadLookups])

  React.useEffect(() => {
    if (user?.role === "STAFF" && user.department_id) {
      setDepartmentId(user.department_id)
    }
  }, [user?.department_id, user?.role])

  React.useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  const userById = React.useMemo(() => new Map(users.map((item) => [item.id, item])), [users])
  const noteById = React.useMemo(() => new Map(notes.map((item) => [item.id, item])), [notes])
  const departmentById = React.useMemo(() => new Map(departments.map((item) => [item.id, item])), [departments])
  const projectById = React.useMemo(() => new Map(projects.map((item) => [item.id, item])), [projects])

  const taskAssigneeIds = React.useCallback((task: Task) => {
    const ids = new Set<string>()
    if (task.assigned_to) ids.add(task.assigned_to)
    for (const assignee of task.assignees || []) {
      if (assignee.id) ids.add(assignee.id)
    }
    return Array.from(ids)
  }, [])

  const assigneeLabel = React.useCallback(
    (task: Task) => {
      const ids = taskAssigneeIds(task)
      if (!ids.length) return "Unassigned"
      return ids.map((id) => userById.get(id)?.full_name || userById.get(id)?.username || id).join(", ")
    },
    [taskAssigneeIds, userById]
  )

  const assigneeInitialsLabel = React.useCallback(
    (task: Task) => {
      const ids = taskAssigneeIds(task)
      if (!ids.length) return "—"
      return ids
        .map((id) => {
          const u = userById.get(id)
          const name = u?.full_name || u?.username || id
          return initialsFromDisplayName(String(name))
        })
        .join(", ")
    },
    [taskAssigneeIds, userById]
  )

  const sourceLabel = React.useCallback((task: Task) => {
    if (task.system_template_origin_id) return "System"
    if (task.project_id) return "Project"
    if (task.is_bllok) return "BLL"
    if (task.is_r1) return "R1"
    if (task.is_1h_report) return "1H"
    if (task.is_personal) return "P:"
    return "Fast"
  }, [])

  const userOptions = React.useMemo(() => {
    const scoped = departmentId !== ALL_VALUE ? users.filter((item) => item.department_id === departmentId) : users
    return scoped
      .map((item) => ({ id: item.id, name: item.full_name || item.username || item.id }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [departmentId, users])

  const filteredTasks = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    return tasks.filter((task) => {
      const project = task.project_id ? projectById.get(task.project_id) : null
      if (project?.is_template) return false

      const plannedThisWeek = isTaskPlannedForWeek(task, thisWeekStart, thisWeekEnd)
      const plannedNextWeek = isTaskPlannedForWeek(task, nextWeekStart, nextWeekEnd)
      const isGa = Boolean(task.ga_note_origin_id)
      const isPlan = Boolean(task.plan_note_origin_id)
      const isFast = isFastPlannerTask(task)
      const ids = taskAssigneeIds(task)

      if (userId !== ALL_VALUE && !ids.includes(userId)) return false
      if (filter === "unplanned" && (plannedThisWeek || plannedNextWeek)) return false
      if (filter === "this_week" && !plannedThisWeek) return false
      if (filter === "next_week" && !plannedNextWeek) return false
      if (filter === "ga" && !isGa) return false
      if (filter === "plan" && !isPlan) return false
      if (filter === "project" && !task.project_id) return false
      if (filter === "fast" && !isFast) return false
      if (query) {
        const note = task.ga_note_origin_id ? noteById.get(task.ga_note_origin_id) : null
        const dept = task.department_id ? departmentById.get(task.department_id) : null
        const haystack = [
          statusLabel(task.status),
          task.title,
          task.description,
          task.status,
          sourceLabel(task),
          task.plan_note_origin_id ? "next week plan note px jav" : "",
          assigneeLabel(task),
          assigneeInitialsLabel(task),
          note?.content,
          project ? resolveProjectTitle(project) : "",
          dept ? departmentTableTag(dept) : "",
          dept ? formatDepartmentName(dept.name) : "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [assigneeInitialsLabel, assigneeLabel, departmentById, filter, nextWeekEnd, nextWeekStart, noteById, projectById, search, sourceLabel, taskAssigneeIds, tasks, thisWeekEnd, thisWeekStart, userId])

  const unplannedTasks = filteredTasks.filter(
    (task) => !isTaskPlannedForWeek(task, thisWeekStart, thisWeekEnd) && !isTaskPlannedForWeek(task, nextWeekStart, nextWeekEnd)
  )
  const thisWeekTasks = filteredTasks.filter((task) => isTaskPlannedForWeek(task, thisWeekStart, thisWeekEnd))
  const nextWeekTasks = filteredTasks.filter((task) => isTaskPlannedForWeek(task, nextWeekStart, nextWeekEnd))
  const tableRows = React.useMemo(
    () =>
      filteredTasks.map((task) => {
        const plannedThisWeek = isTaskPlannedForWeek(task, thisWeekStart, thisWeekEnd)
        const plannedNextWeek = isTaskPlannedForWeek(task, nextWeekStart, nextWeekEnd)

        let planLabel = "Unplanned"
        if (plannedThisWeek && plannedNextWeek) {
          planLabel = "This Week + Next Week"
        } else if (plannedThisWeek) {
          planLabel = "Planned This Week"
        } else if (plannedNextWeek) {
          planLabel = "Planned Next Week"
        }

        return {
          task,
          planLabel,
          planned: plannedThisWeek || plannedNextWeek,
        }
      }),
    [filteredTasks, nextWeekEnd, nextWeekStart, thisWeekEnd, thisWeekStart]
  )

  const openDialog = (task: Task, mode: PlannerTaskDialogMode) => {
    setSelectedTask(task)
    setDialogMode(mode)
    setStartDate(toDateInputValue(task.start_date) || nextWeekStart)
    setDueDate(toDateInputValue(task.due_date) || nextWeekStart)
    setFinishPeriod((task.finish_period as "AM" | "PM" | null) || "AM")
    setAssigneeIds(taskAssigneeIds(task))
    setDialogOpen(true)
  }

  const parseFilenameFromDisposition = (headerValue: string | null) => {
    if (!headerValue) return null
    const match = headerValue.match(/filename=\"?([^\";]+)\"?/i)
    return match ? match[1] : null
  }

  const exportOpenTasksExcel = async () => {
    if (exportingExcel) return
    setExportingExcel(true)
    try {
      const qs = new URLSearchParams()
      qs.set("this_week_start", thisWeekStart)
      qs.set("filter", filter)
      if (departmentId !== ALL_VALUE) qs.set("department_id", departmentId)
      if (userId !== ALL_VALUE) qs.set("user_id", userId)
      if (search.trim()) qs.set("search", search.trim())

      const res = await apiFetch(`/exports/open-tasks.xlsx?${qs.toString()}`)
      if (!res.ok) {
        const detail = await res.text().catch(() => "")
        toast.error(detail || "Failed to export open tasks.")
        return
      }
      const blob = await res.blob()
      if (!blob.size) {
        toast.error("Export returned an empty file.")
        return
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = parseFilenameFromDisposition(res.headers.get("content-disposition")) || "OPEN_TASKS.xlsx"
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Failed to export open tasks", error)
      toast.error("Failed to export open tasks.")
    } finally {
      setExportingExcel(false)
    }
  }

  const saveTask = async () => {
    if (!selectedTask) return
    if (!dueDate) {
      toast.error("Due date is required.")
      return
    }
    if (startDate && startDate > dueDate) {
      toast.error("Start date cannot be after due date.")
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch(`/tasks/${selectedTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_date: startDate ? new Date(startDate).toISOString() : null,
          due_date: new Date(dueDate).toISOString(),
          finish_period: finishPeriod === NONE_VALUE ? null : finishPeriod,
          assigned_to: assigneeIds[0] ?? null,
          assignees: assigneeIds,
        }),
      })
      if (!res.ok) {
        toast.error("Failed to update task planning.")
        return
      }
      const updated = (await res.json()) as Task
      setTasks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setDialogOpen(false)
      setSelectedTask(null)
      toast.success(dialogMode === "plan" ? "Task planned." : "Task planning updated.")
      void loadTasks()
    } finally {
      setSaving(false)
    }
  }

  const removeFromPlan = async (task: Task) => {
    const confirmed = await confirm({
      title: "Remove from plan",
      description: task.project_id
        ? "This clears the task start/due dates, which may affect project deadline display. Continue?"
        : "This clears the task start/due dates so it leaves the weekly planner.",
      confirmLabel: "Remove from plan",
      variant: "destructive",
    })
    if (!confirmed) return

    setClearingId(task.id)
    try {
      const res = await apiFetch(`/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: null, due_date: null, finish_period: null }),
      })
      if (!res.ok) {
        toast.error("Failed to remove task from plan.")
        return
      }
      const updated = (await res.json()) as Task
      setTasks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      toast.success("Task removed from plan.")
      void loadTasks()
    } finally {
      setClearingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Open Tasks</h1>
          <p className="text-sm text-slate-500">
            Open tasks grouped by plan: this week {formatDate(thisWeekStart)} - {formatDate(thisWeekEnd)}, next week {formatDate(nextWeekStart)} - {formatDate(nextWeekEnd)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={loading || exportingExcel} onClick={() => void exportOpenTasksExcel()}>
            {exportingExcel ? "Exporting..." : "Export Excel"}
          </Button>
          <Button asChild variant="outline">
            <Link href="/weekly-planner">Open Weekly Planner</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-4">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search open tasks..." />
            <Select value={filter} onValueChange={(value) => setFilter(value as PlanningInboxFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All open</SelectItem>
                <SelectItem value="unplanned">Unplanned</SelectItem>
                <SelectItem value="this_week">Planned this week</SelectItem>
                <SelectItem value="next_week">Planned next week</SelectItem>
                <SelectItem value="ga">GA/KA</SelectItem>
                <SelectItem value="plan">Plan note</SelectItem>
                <SelectItem value="project">Project</SelectItem>
                <SelectItem value="fast">Fast task</SelectItem>
              </SelectContent>
            </Select>
            <Select value={departmentId} onValueChange={setDepartmentId} disabled={user?.role === "STAFF"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All departments</SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>{formatDepartmentName(department.name)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All users</SelectItem>
                {userOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-sm text-slate-500">Loading open tasks...</div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Card><CardContent className="pt-6 text-center"><div className="text-2xl font-semibold text-amber-700">{unplannedTasks.length}</div><div className="text-xs text-slate-500">Unplanned</div></CardContent></Card>
            <Card><CardContent className="pt-6 text-center"><div className="text-2xl font-semibold text-emerald-800">{thisWeekTasks.length}</div><div className="text-xs text-slate-500">Planned This Week</div></CardContent></Card>
            <Card><CardContent className="pt-6 text-center"><div className="text-2xl font-semibold text-blue-800">{nextWeekTasks.length}</div><div className="text-xs text-slate-500">Planned Next Week</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Open Tasks ({tableRows.length})</CardTitle>
              <div className="text-xs text-slate-500">
                Table view of open tasks with planning, ownership, date details, and actions.
              </div>
            </CardHeader>
            <CardContent>
              <Table className="w-full min-w-0 table-fixed border-collapse text-sm">
                <colgroup>
                  <col style={{ width: "2%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "34%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "4%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "5%" }} />
                  <col style={{ width: "4%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "10%" }} />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-auto px-1 py-1.5 text-xs font-medium">#</TableHead>
                    <TableHead className="h-auto px-1 py-1.5 text-xs font-medium" title="Group / plan status">
                      Group
                    </TableHead>
                    <TableHead className="h-auto min-w-0 px-1 py-1.5 text-xs font-medium">Task</TableHead>
                    <TableHead className="h-auto px-1 py-1.5 text-xs font-medium">Source</TableHead>
                    <TableHead className="h-auto px-0.5 py-1.5 text-center text-xs font-medium" title="Notes for next week plan">
                      PX JAV
                    </TableHead>
                    <TableHead className="h-auto whitespace-normal px-1 py-1.5 text-xs font-medium leading-tight">Status</TableHead>
                    <TableHead className="h-auto px-1 py-1.5 text-xs font-medium">Who</TableHead>
                    <TableHead className="h-auto px-1 py-1.5 text-xs font-medium" title="Department">
                      Dep
                    </TableHead>
                    <TableHead className="h-auto px-1 py-1.5 text-xs font-medium leading-tight">Due date</TableHead>
                    <TableHead className="h-auto px-1 py-1.5 text-xs font-medium leading-tight">Date created</TableHead>
                    <TableHead className="h-auto px-1 py-1.5 text-xs font-medium">Act</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.length ? (
                    tableRows.map(({ task, planLabel, planned }, index) => {
                      const department = task.department_id ? departmentById.get(task.department_id) : null
                      const dueLabel = task.due_date ? formatDateDMY(task.due_date) : "-"

                      return (
                        <TableRow key={task.id} className="align-middle">
                          <TableCell className="px-1 py-1.5 align-middle text-xs font-medium text-slate-600">{index + 1}</TableCell>
                          <TableCell className="px-1 py-1.5 align-middle">
                            <span
                              className={
                                planned
                                  ? "inline-flex max-w-full rounded-full border border-emerald-200 bg-emerald-50 px-1 py-0 text-[10px] font-semibold uppercase leading-tight text-emerald-800"
                                  : "inline-flex max-w-full rounded-full border border-amber-200 bg-amber-50 px-1 py-0 text-[10px] font-semibold uppercase leading-tight text-amber-800"
                              }
                              title={planLabel}
                            >
                              {compactPlanGroupLabel(planLabel)}
                            </span>
                          </TableCell>
                          <TableCell className="min-w-0 whitespace-normal px-1 py-1.5 align-middle">
                            <div className="break-words text-xs font-medium leading-snug text-slate-900">{task.title}</div>
                          </TableCell>
                          <TableCell className="px-1 py-1.5 align-middle text-xs text-slate-700">{sourceLabel(task)}</TableCell>
                          <TableCell className="whitespace-normal px-0.5 py-1.5 text-center align-middle text-slate-700">
                            {task.plan_note_origin_id ? (
                              <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-1 py-0 text-[9px] font-semibold uppercase text-indigo-700">
                                Y
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="min-w-0 whitespace-normal px-1 py-1.5 align-middle text-[11px] leading-snug text-slate-700">
                            {statusLabel(task.status)}
                          </TableCell>
                          <TableCell className="px-1 py-1.5 align-middle text-xs text-slate-700" title={assigneeLabel(task)}>
                            {assigneeInitialsLabel(task)}
                          </TableCell>
                          <TableCell className="px-1 py-1.5 align-middle text-xs text-slate-700" title={department ? formatDepartmentName(department.name) : undefined}>
                            {departmentTableTag(department)}
                          </TableCell>
                          <TableCell className="whitespace-normal px-1 py-1.5 align-middle tabular-nums text-[11px] leading-tight text-slate-700">{dueLabel}</TableCell>
                          <TableCell className="whitespace-normal px-1 py-1.5 align-middle tabular-nums text-[11px] leading-tight text-slate-700">
                            {formatDateDMY(task.created_at)}
                          </TableCell>
                          <TableCell className="min-w-0 whitespace-normal px-1 py-1.5 align-middle">
                            <div className="flex max-w-[10.5rem] flex-row flex-wrap items-center gap-0.5">
                              <Button size="sm" className="h-6 min-h-0 shrink-0 px-1.5 py-0 text-[10px] leading-tight" onClick={() => openDialog(task, planned ? "edit" : "plan")}>
                                {planned ? "Edit" : "Plan"}
                              </Button>
                              {planned ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 min-h-0 shrink-0 px-1.5 py-0 text-[10px] leading-tight"
                                  disabled={clearingId === task.id}
                                  onClick={() => void removeFromPlan(task)}
                                >
                                  {clearingId === task.id ? "…" : "Clear"}
                                </Button>
                              ) : null}
                              {task.ga_note_origin_id ? (
                                <Button asChild size="sm" variant="outline" className="h-6 min-h-0 shrink-0 px-1 py-0 text-[10px] leading-tight">
                                  <Link href={`/ga-ka-notes${task.department_id ? `?department_id=${task.department_id}` : ""}`}>GA</Link>
                                </Button>
                              ) : null}
                              {task.plan_note_origin_id ? (
                                <Button asChild size="sm" variant="outline" className="h-6 min-h-0 shrink-0 px-1 py-0 text-[10px] leading-tight">
                                  <Link href={`/next-week-plan${task.department_id ? `?department_id=${task.department_id}` : ""}`} title="Next week plan note">
                                    PX
                                  </Link>
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={11} className="py-8 text-center text-sm text-slate-500">
                        No open tasks match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => (!saving ? setDialogOpen(open) : undefined)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{dialogMode === "plan" ? "Plan task" : "Edit task planning"}</DialogTitle>
          </DialogHeader>
          {selectedTask ? (
            <div className="space-y-4">
              <div className="rounded-md border bg-slate-50 p-3">
                <div className="text-xs font-semibold uppercase text-slate-500">{sourceLabel(selectedTask)}</div>
                <div className="mt-1 text-sm font-semibold">{selectedTask.title}</div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Start date</Label>
                  <Input type="date" value={startDate} disabled={saving} onChange={(event) => setStartDate(normalizeDueDateInput(event.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Due date</Label>
                  <Input type="date" value={dueDate} disabled={saving} onChange={(event) => setDueDate(normalizeDueDateInput(event.target.value))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Finish by</Label>
                <Select value={finishPeriod} disabled={saving} onValueChange={(value) => setFinishPeriod(value as "AM" | "PM" | typeof NONE_VALUE)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                    <SelectItem value={NONE_VALUE}>None / all day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assignees</Label>
                <div className="rounded-md border bg-white p-2">
                  <div className="mb-2 flex flex-wrap gap-2">
                    {assigneeIds.length ? assigneeIds.map((id) => {
                      const person = userById.get(id)
                      return (
                        <button key={id} type="button" disabled={saving} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs" onClick={() => setAssigneeIds((prev) => prev.filter((item) => item !== id))}>
                          {person?.full_name || person?.username || id} <span className="text-slate-500">x</span>
                        </button>
                      )
                    }) : <span className="text-xs text-slate-500">No assignees selected.</span>}
                  </div>
                  <Select value="__picker__" disabled={saving || userOptions.length === 0} onValueChange={(value) => {
                    if (value === "__picker__") return
                    setAssigneeIds((prev) => (prev.includes(value) ? prev : [...prev, value]))
                  }}>
                    <SelectTrigger><SelectValue placeholder="Add assignee" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__picker__" disabled>Add assignee</SelectItem>
                      {userOptions.filter((option) => !assigneeIds.includes(option.id)).map((option) => (
                        <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button disabled={saving} onClick={() => void saveTask()}>{saving ? "Saving..." : "Save planning"}</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
