"use client"

import * as React from "react"
import Link from "next/link"
import { Clock } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { BoldOnlyEditor } from "@/components/bold-only-editor"
import { useAuth } from "@/lib/auth"
import { formatDepartmentName } from "@/lib/department-name"
import type { Department, GaNote, Project, Task, TaskFinishPeriod, TaskPriority, UserLookup } from "@/lib/types"

type NoteType = "GA" | "KA"
type NotePriority = "NORMAL" | "HIGH" | "NONE"

const TYPE_BADGE: Record<NoteType, string> = {
  GA: "bg-amber-100 text-amber-800 border-amber-200",
  KA: "bg-cyan-100 text-cyan-800 border-cyan-200",
}

const PRIORITY_BADGE: Record<Exclude<NotePriority, "NONE">, string> = {
  NORMAL: "bg-emerald-100 text-emerald-800 border-emerald-200",
  HIGH: "bg-rose-100 text-rose-800 border-rose-200",
}

const NOTE_TO_TASK_PRIORITY: Record<NotePriority, TaskPriority> = {
  NONE: "NORMAL",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
}

const PRIORITY_OPTIONS: TaskPriority[] = ["NORMAL", "HIGH"]
const FINISH_PERIOD_OPTIONS: TaskFinishPeriod[] = ["AM", "PM"]
const FINISH_PERIOD_NONE_VALUE = "__none__"
const TASK_PRIORITY_STYLES: Record<string, string> = {
  HIGH: "bg-rose-50 text-rose-700",
  NORMAL: "bg-blue-50 text-blue-700",
}
const TASK_STATUS_STYLES: Record<string, { label: string; dot: string; pill: string }> = {
  TODO: { label: "TODO", dot: "bg-slate-500", pill: "bg-slate-100 text-slate-700" },
  IN_PROGRESS: { label: "In progress", dot: "bg-amber-500", pill: "bg-amber-50 text-amber-700" },
  DONE: { label: "Done", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700" },
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getInitials(label: string) {
  const trimmed = label.trim()
  if (!trimmed) return "?"
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function getDueTone(value?: string | null) {
  if (!value) return "text-slate-500"
  const due = new Date(value)
  const now = new Date()
  if (Number.isNaN(due.getTime())) return "text-slate-500"
  if (due.getTime() < now.getTime()) return "text-rose-600"
  const hoursLeft = (due.getTime() - now.getTime()) / 3_600_000
  return hoursLeft <= 24 ? "text-amber-600" : "text-slate-600"
}

export default function GaKaNotesPage() {
  const { user, apiFetch } = useAuth()
  const [notes, setNotes] = React.useState<GaNote[]>([])
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [projects, setProjects] = React.useState<Project[]>([])
  const [users, setUsers] = React.useState<UserLookup[]>([])
  const [tasks, setTasks] = React.useState<Task[]>([])
  const [loadingTasks, setLoadingTasks] = React.useState(false)
  const [departmentId, setDepartmentId] = React.useState("ALL")
  const [projectId, setProjectId] = React.useState("NONE")
  const [content, setContent] = React.useState("")
  const [noteType] = React.useState<NoteType>("GA")
  const [priority] = React.useState<NotePriority>("NONE")
  const [loading, setLoading] = React.useState(false)
  const [posting, setPosting] = React.useState(false)
  const [taskDialogNoteId, setTaskDialogNoteId] = React.useState<string | null>(null)
  const [creatingTask, setCreatingTask] = React.useState(false)
  const [rangeFilter, setRangeFilter] = React.useState<"week" | "all">("week")
  const [showClosed, setShowClosed] = React.useState(true)
  const [taskTitle, setTaskTitle] = React.useState("")
  const [taskDescription, setTaskDescription] = React.useState("")
  const [taskPriority, setTaskPriority] = React.useState<TaskPriority>("NORMAL")
  const [taskFinishPeriod, setTaskFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(
    FINISH_PERIOD_NONE_VALUE
  )
  const [taskDueDate, setTaskDueDate] = React.useState("")
  const [taskAssigneeIds, setTaskAssigneeIds] = React.useState<string[]>([])
  const [taskDepartmentIds, setTaskDepartmentIds] = React.useState<string[]>([])
  const [taskProjectId, setTaskProjectId] = React.useState("NONE")

  // Default department for staff
  React.useEffect(() => {
    if (user?.department_id && departmentId === "ALL") {
      setDepartmentId(user.department_id)
    }
  }, [departmentId, user])

  const loadDepartments = React.useCallback(async () => {
    const res = await apiFetch("/departments")
    if (res?.ok) {
      setDepartments((await res.json()) as Department[])
    }
  }, [apiFetch])

  const loadUsers = React.useCallback(async () => {
    const res = await apiFetch(user?.role === "STAFF" ? "/users/lookup" : "/users")
    if (res?.ok) {
      setUsers((await res.json()) as UserLookup[])
    }
  }, [apiFetch, user?.role])

  const loadProjects = React.useCallback(
    async (deptId?: string) => {
      const query = deptId ? `?department_id=${deptId}` : ""
      const res = await apiFetch(`/projects${query}`)
      if (res?.ok) {
        setProjects((await res.json()) as Project[])
      }
    },
    [apiFetch]
  )

  const loadTasks = React.useCallback(
    async (noteIds: string[]) => {
      if (!noteIds.length) {
        setTasks([])
        return
      }
      setLoadingTasks(true)
      try {
        const res = await apiFetch("/tasks")
        if (res?.ok) {
          const allTasks = (await res.json()) as Task[]
          const allowedIds = new Set(noteIds)
          setTasks(allTasks.filter((task) => task.ga_note_origin_id && allowedIds.has(task.ga_note_origin_id)))
        }
      } finally {
        setLoadingTasks(false)
      }
    },
    [apiFetch]
  )

  const fetchNotes = React.useCallback(async () => {
    if (!user) return
    // Staff must always query by their department to satisfy backend requirements.
    const enforcedDepartmentId =
      user.role === "STAFF" ? user.department_id ?? null : departmentId !== "ALL" ? departmentId : null
    if (user.role === "STAFF" && !enforcedDepartmentId) {
      toast.error("Your department is required to load notes.")
      return
    }
    setLoading(true)
    try {
      let url = "/ga-notes"
      const params = new URLSearchParams()
      if (projectId !== "NONE") {
        params.set("project_id", projectId)
      } else if (enforcedDepartmentId) {
        params.set("department_id", enforcedDepartmentId)
      }
      url += params.toString() ? `?${params}` : ""
      const res = await apiFetch(url)
      if (res?.ok) {
        setNotes((await res.json()) as GaNote[])
      } else {
        toast.error("Could not load GA/KA notes")
      }
    } finally {
      setLoading(false)
    }
  }, [apiFetch, departmentId, projectId, user])

  React.useEffect(() => {
    void loadDepartments()
  }, [loadDepartments])

  React.useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  React.useEffect(() => {
    void fetchNotes()
  }, [fetchNotes])

  React.useEffect(() => {
    const noteIds = notes.filter((note) => note.is_converted_to_task).map((note) => note.id)
    void loadTasks(noteIds)
  }, [loadTasks, notes])

  const createNote = async () => {
    if (!content.trim()) {
      toast.error("Content is required")
      return
    }
    const departmentForNote = user?.role === "STAFF" ? user.department_id ?? null : null
    setPosting(true)
    try {
      const res = await apiFetch("/ga-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          note_type: noteType,
          priority: priority === "NONE" ? null : priority,
          department_id: departmentForNote,
          project_id: null,
        }),
      })
      if (!res?.ok) {
        toast.error("Failed to create note")
        return
      }
      const created = (await res.json()) as GaNote
      setNotes((prev) => [created, ...prev])
      setContent("")
    } finally {
      setPosting(false)
    }
  }

  const openTaskDialog = (note: GaNote) => {
    const trimmed = note.content.trim()
    const defaultTitle = trimmed ? trimmed.split(/\r?\n/)[0].slice(0, 120) : "GA/KA note task"
    setTaskDialogNoteId(note.id)
    setTaskTitle(defaultTitle)
    setTaskDescription(note.content || "")
    setTaskPriority(note.priority === "HIGH" ? "HIGH" : "NORMAL")
    setTaskFinishPeriod(FINISH_PERIOD_NONE_VALUE)
    setTaskDueDate("")
    setTaskAssigneeIds([])
    setTaskDepartmentIds([])
    setTaskProjectId(note.project_id ?? "NONE")
  }

  const createTaskFromNote = async (note: GaNote) => {
    if (note.is_converted_to_task) return
    if (!taskTitle.trim()) {
      toast.error("Task title is required")
      return
    }
    const effectiveDepartments =
      taskDepartmentIds.length > 0
        ? taskDepartmentIds
        : note.department_id
          ? [note.department_id]
          : []
    if (effectiveDepartments.length === 0) {
      toast.error("Select at least one department before creating a task")
      return
    }
    const primaryDepartmentId = effectiveDepartments[0]
    setCreatingTask(true)
    try {
      const dueDateValue = taskDueDate ? new Date(taskDueDate).toISOString() : null
      const taskRes = await apiFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskTitle.trim(),
          description: taskDescription.trim() || null,
          status: "TODO",
          priority: taskPriority,
          finish_period: taskFinishPeriod === FINISH_PERIOD_NONE_VALUE ? null : taskFinishPeriod,
          due_date: dueDateValue,
          assigned_to: taskAssigneeIds[0] ?? null,
          assignees: taskAssigneeIds,
          ga_note_origin_id: note.id,
          department_id: primaryDepartmentId,
          project_id: taskProjectId !== "NONE" ? taskProjectId : null,
        }),
      })
      if (!taskRes.ok) {
        toast.error("Failed to create task")
        return
      }
      const createdTask = (await taskRes.json()) as Task
      const patchRes = await apiFetch(`/ga-notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_converted_to_task: true }),
      })
      if (patchRes.ok) {
        const updated = (await patchRes.json()) as GaNote
        setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)))
      } else {
        setNotes((prev) =>
          prev.map((n) => (n.id === note.id ? { ...n, is_converted_to_task: true } : n))
        )
      }
      setTasks((prev) => {
        if (createdTask.ga_note_origin_id) {
          const filtered = prev.filter((task) => task.ga_note_origin_id !== createdTask.ga_note_origin_id)
          return [createdTask, ...filtered]
        }
        return [createdTask, ...prev]
      })
      setTaskDialogNoteId(null)
      toast.success("Task created from note")
    } finally {
      setCreatingTask(false)
    }
  }

  const closeNote = async (id: string) => {
    const res = await apiFetch(`/ga-notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CLOSED" }),
    })
    if (res?.ok) {
      const updated = (await res.json()) as GaNote
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)))
    } else {
      toast.error("Failed to update note")
    }
  }

  // Project list is used only in the task creation dialog (filtered separately).
  const taskDialogNote = taskDialogNoteId ? notes.find((n) => n.id === taskDialogNoteId) || null : null
  const taskDepartmentLocked = false
  const effectiveTaskDepartmentIds = React.useMemo(() => {
    if (taskDepartmentIds.length > 0) return taskDepartmentIds
    if (taskDialogNote?.department_id) return [taskDialogNote.department_id]
    return []
  }, [taskDepartmentIds, taskDialogNote?.department_id])
  const taskAssigneeOptions = users

  // Projects filtered by the department chosen in the task dialog
  const primaryDepartmentId = effectiveTaskDepartmentIds[0] || null
  const taskProjectOptions = React.useMemo(() => {
    if (primaryDepartmentId) {
      return projects.filter((p) => p.department_id === primaryDepartmentId)
    }
    return projects
  }, [primaryDepartmentId, projects])

  // Keep projects in sync when opening dialog or changing department
  React.useEffect(() => {
    if (!taskDialogNoteId) return
    const dep =
      effectiveTaskDepartmentIds.length === 1 ? effectiveTaskDepartmentIds[0] : undefined
    void loadProjects(dep)
  }, [effectiveTaskDepartmentIds, loadProjects, taskDialogNoteId])
  const visibleNotes = React.useMemo(() => {
    const now = Date.now()
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000
    const withinRange = (note: GaNote) => {
      if (rangeFilter === "all") return true
      const created = note.created_at ? new Date(note.created_at).getTime() : 0
      return created >= weekAgo
    }
    const sorted = [...notes]
      .filter(withinRange)
      .sort((a, b) => {
        const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0
        const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0
        return bCreated - aCreated
      })
    const openNotes = sorted.filter((note) => note.status !== "CLOSED")
    const closedNotes = showClosed ? sorted.filter((note) => note.status === "CLOSED") : []
    return [...openNotes, ...closedNotes]
  }, [notes, rangeFilter, showClosed])
  const taskByNoteId = React.useMemo(() => {
    const map = new Map<string, Task>()
    tasks.forEach((task) => {
      if (task.ga_note_origin_id) {
        map.set(task.ga_note_origin_id, task)
      }
    })
    return map
  }, [tasks])
  const departmentMap = React.useMemo(() => new Map(departments.map((dept) => [dept.id, dept])), [departments])
  const projectMap = React.useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
  const userMap = React.useMemo(() => new Map(users.map((person) => [person.id, person])), [users])

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-gradient-to-r from-amber-50 via-indigo-50 to-cyan-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-primary/80 uppercase">Department Notes</div>
            <div className="text-2xl font-semibold leading-tight mt-1 text-slate-900">GA/KA Notes</div>
            <div className="text-sm text-muted-foreground mt-1">
              Capture decisions, asks, and follow-ups. Keep it crisp and actionable.
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary" className="px-3 py-1 rounded-full shadow-sm bg-emerald-100 text-emerald-800">
              Open: {notes.filter((n) => n.status !== "CLOSED").length}
            </Badge>
            <Badge variant="outline" className="px-3 py-1 rounded-full border-indigo-200 text-indigo-800">
              Total: {notes.length}
            </Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">New note</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Content</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Capture the takeaway or ask. Be clear, action-oriented, and include owners or due dates."
              rows={6}
              className="min-h-[220px] resize-none text-base md:text-lg bg-primary/5 border-primary/40 shadow-[0_0_0_1px_rgba(0,0,0,0.04)] focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:border-primary"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Tip: Include the who/what/when so the note is actionable later.
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void createNote()} disabled={posting}>
              {posting ? "Saving..." : "Save note"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Range</Label>
              <Select value={rangeFilter} onValueChange={(v) => setRangeFilter(v as "week" | "all")}>
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">This week (default)</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-closed-notes"
                checked={showClosed}
                onCheckedChange={(v) => setShowClosed(Boolean(v))}
              />
              <Label htmlFor="show-closed-notes" className="text-sm">
                Show closed
              </Label>
            </div>
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading notes...</div>
          ) : notes.length === 0 ? (
            <div className="text-sm text-muted-foreground">No notes yet.</div>
          ) : (
            <div className="grid gap-3">
              {visibleNotes.map((note) => {
                if (note.is_converted_to_task) {
                  return (
                    <div
                      key={note.id}
                      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                    >
                      {(() => {
                        const task = taskByNoteId.get(note.id)
                        if (!task) {
                          return (
                            <div className="text-xs text-slate-500">
                              {loadingTasks ? "Loading task details..." : "Task details not available."}
                            </div>
                          )
                        }
                        const department = task.department_id ? departmentMap.get(task.department_id) : null
                        const project = task.project_id ? projectMap.get(task.project_id) : null
                        const assigneeNames =
                          task.assignees?.length
                            ? task.assignees
                                .map((assignee) => assignee.full_name || assignee.username || assignee.email || "")
                                .filter(Boolean)
                            : []
                        const fallbackAssignee = task.assigned_to ? userMap.get(task.assigned_to) : null
                        const assigneeLabel =
                          assigneeNames.length > 0
                            ? assigneeNames.join(", ")
                            : fallbackAssignee?.full_name ||
                              fallbackAssignee?.username ||
                              fallbackAssignee?.email ||
                              "-"
                        const assigneeInitials = getInitials(assigneeLabel)
                        const departmentLabel = department ? formatDepartmentName(department.name) : "No department"
                        const projectLabel = project?.title || project?.name || ""
                        const priorityLabel = task.priority || "NORMAL"
                        const priorityStyle = TASK_PRIORITY_STYLES[priorityLabel] || "bg-slate-100 text-slate-700"
                        const statusStyle =
                          TASK_STATUS_STYLES[task.status || ""] ||
                          { label: task.status || "Unknown", dot: "bg-slate-400", pill: "bg-slate-100 text-slate-600" }
                        const dueTone = getDueTone(task.due_date)
                        return (
                          <div className="space-y-3 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
                                  GA
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate text-base font-semibold text-slate-900">
                                    {task.title}
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                    <span className={`inline-flex rounded-full px-2.5 py-0.5 font-medium ${priorityStyle}`}>
                                      {priorityLabel === "HIGH" ? "High" : "Normal"}
                                    </span>
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium ${statusStyle.pill}`}
                                    >
                                      <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                                      {statusStyle.label}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <Link
                                href={`/tasks/${task.id}`}
                                className="text-xs font-medium text-slate-500 hover:text-slate-700"
                              >
                                View details
                              </Link>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                              <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700">
                                  {assigneeInitials}
                                </div>
                                <span className="font-medium text-slate-800">{assigneeLabel}</span>
                                <span className="text-slate-400">-</span>
                                <span className="text-slate-500">{departmentLabel}</span>
                                {projectLabel ? <span className="text-slate-400">-</span> : null}
                                {projectLabel ? <span className="text-slate-500">{projectLabel}</span> : null}
                              </div>
                              <div className={`flex items-center gap-1 ${dueTone}`}>
                                <Clock className="h-4 w-4" />
                                <span className="font-medium">{formatDate(task.due_date)}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )
                }
                return (
                  <Card
                    key={note.id}
                    className="border border-primary/10 bg-gradient-to-br from-white via-primary/5 to-transparent shadow-sm"
                  >
                    <CardContent className="flex flex-col gap-3 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge className={TYPE_BADGE[note.note_type] ?? ""}>{note.note_type}</Badge>
                            {note.priority && note.priority !== "NONE" ? (
                              <Badge className={PRIORITY_BADGE[note.priority as Exclude<NotePriority, "NONE">]}>
                                {note.priority}
                              </Badge>
                            ) : null}
                            <span>Created: {formatDate(note.created_at)}</span>
                          </div>
                          <div className="text-base font-medium leading-relaxed">{note.content}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-indigo-300 text-indigo-800 hover:bg-indigo-50"
                            onClick={() => openTaskDialog(note)}
                          >
                            Create task
                          </Button>
                          {note.status !== "CLOSED" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-emerald-200 text-emerald-800 hover:bg-emerald-50"
                              onClick={() => void closeNote(note.id)}
                            >
                              Close
                            </Button>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Closed</Badge>
                          )}
                        </div>
                      </div>
                      {note.project_id || note.department_id ? (
                        <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                          {note.project_id ? (
                            <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Project</Badge>
                          ) : null}
                          {note.department_id ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200">Department</Badge>
                          ) : null}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={Boolean(taskDialogNoteId)} onOpenChange={(open) => (!open ? setTaskDialogNoteId(null) : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Task from Note</DialogTitle>
          </DialogHeader>
          {taskDialogNote ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <BoldOnlyEditor value={taskDescription} onChange={setTaskDescription} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={taskPriority} onValueChange={(v) => setTaskPriority(v as TaskPriority)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Finish by (optional)</Label>
                  <Select
                    value={taskFinishPeriod}
                    onValueChange={(value) =>
                      setTaskFinishPeriod(value as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None (all day)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FINISH_PERIOD_NONE_VALUE}>None (all day)</SelectItem>
                      {FINISH_PERIOD_OPTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Due date (optional)</Label>
                  <Input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
                </div>
              <div className="space-y-2">
                <Label>Departments</Label>
                <div className="rounded-md border bg-white p-2">
                  <div className="flex flex-wrap gap-2 mb-2">
                    {taskDepartmentIds.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No departments selected.</span>
                    ) : (
                      taskDepartmentIds.map((id) => {
                        const dept = departments.find((d) => d.id === id)
                        const label = dept?.name || id
                        return (
                          <button
                            key={id}
                            type="button"
                            className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs"
                            onClick={() =>
                              setTaskDepartmentIds((prev) => prev.filter((item) => item !== id))
                            }
                          >
                            {label}
                            <span className="text-slate-500">×</span>
                          </button>
                        )
                      })
                    )}
                  </div>
                  <Select
                    value="__dept_picker__"
                    onValueChange={(value) => {
                      if (value === "__dept_picker__") return
                      setTaskProjectId("NONE")
                      setTaskDepartmentIds((prev) => (prev.includes(value) ? prev : [...prev, value]))
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Add department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__dept_picker__" disabled>
                        Add department
                      </SelectItem>
                      {departments
                        .filter((dept) => !taskDepartmentIds.includes(dept.id))
                        .map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              </div>
              <div className="space-y-2">
                <Label>Project (optional)</Label>
                <Select
                  value={taskProjectId}
                  onValueChange={(value) => setTaskProjectId(value)}
                  disabled={effectiveTaskDepartmentIds.length === 0 && taskProjectOptions.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No project</SelectItem>
                    {taskProjectOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title || p.name || "Untitled project"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {effectiveTaskDepartmentIds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Choose a department to filter its projects.</p>
                ) : null}
              </div>
                <div className="space-y-2">
                  <Label>Assign to</Label>
                  <div className="rounded-md border bg-white p-2">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {taskAssigneeIds.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No assignees selected.</span>
                      ) : (
                        taskAssigneeIds.map((id) => {
                          const person = taskAssigneeOptions.find((p) => p.id === id)
                          const label = person?.full_name || person?.username || person?.email || id
                          return (
                            <button
                              key={id}
                              type="button"
                              className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs"
                              onClick={() =>
                                setTaskAssigneeIds((prev) => prev.filter((item) => item !== id))
                              }
                            >
                              {label}
                              <span className="text-slate-500">×</span>
                            </button>
                          )
                        })
                      )}
                    </div>
                    <Select
                      value="__picker__"
                      onValueChange={(value) => {
                        if (value === "__picker__") return
                        setTaskAssigneeIds((prev) => (prev.includes(value) ? prev : [...prev, value]))
                        const person = users.find((u) => u.id === value)
                        if (person?.department_id) {
                          setTaskDepartmentIds((prev) =>
                            prev.includes(person.department_id as string)
                              ? prev
                              : [...prev, person.department_id as string]
                          )
                        }
                      }}
                      disabled={taskAssigneeOptions.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Add assignee" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__picker__" disabled>
                          Add assignee
                        </SelectItem>
                        {taskAssigneeOptions
                          .filter((person) => person.id && !taskAssigneeIds.includes(person.id))
                          .map((person) => (
                            <SelectItem key={person.id} value={person.id}>
                              {person.full_name || person.username || person.email || person.id}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                {taskDepartmentIds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Select one or more departments to guide projects (optional).</p>
                ) : null}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTaskDialogNoteId(null)}>
                  Cancel
                </Button>
                <Button disabled={creatingTask} onClick={() => void createTaskFromNote(taskDialogNote)}>
                  {creatingTask ? "Creating..." : "Create task"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
