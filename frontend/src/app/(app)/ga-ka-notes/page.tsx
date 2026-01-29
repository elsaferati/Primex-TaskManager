"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Clock, Printer } from "lucide-react"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
  const day = date.getDate().toString().padStart(2, "0")
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  let hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  hours = hours ? hours : 12 // the hour '0' should be '12'
  const hoursStr = hours.toString().padStart(2, "0")
  return `${day}.${month}, ${hoursStr}:${minutes} ${ampm}`
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

function abbreviateDepartmentName(name: string): string {
  const lowerName = name.toLowerCase()
  if (lowerName.includes("development")) return "DEV"
  if (lowerName.includes("graphic") && lowerName.includes("design")) return "GDS"
  if (lowerName.includes("product") && lowerName.includes("content")) return "PCM"
  if (lowerName.includes("project content")) return "PCM"
  // Return first 3 letters as fallback
  return name.slice(0, 3).toUpperCase()
}

export default function GaKaNotesPage() {
  const { user, apiFetch } = useAuth()
  const searchParams = useSearchParams()
  const [notes, setNotes] = React.useState<GaNote[]>([])
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [projects, setProjects] = React.useState<Project[]>([])
  const [users, setUsers] = React.useState<UserLookup[]>([])

  // Initialize from URL parameters if present
  const urlDepartmentId = searchParams.get("department_id")
  const urlProjectId = searchParams.get("project_id")
  const [departmentId, setDepartmentId] = React.useState(urlDepartmentId || "ALL")
  const [projectId, setProjectId] = React.useState(urlProjectId || "NONE")
  const [content, setContent] = React.useState("")
  const [noteType] = React.useState<NoteType>("GA")
  const [priority] = React.useState<NotePriority>("NONE")
  const [loading, setLoading] = React.useState(false)
  const [posting, setPosting] = React.useState(false)
  const [taskDialogNoteId, setTaskDialogNoteId] = React.useState<string | null>(null)
  const [creatingTask, setCreatingTask] = React.useState(false)
  const [rangeFilter, setRangeFilter] = React.useState<"week" | "all">("week")
  const [statusFilter, setStatusFilter] = React.useState<"all" | "open" | "closed">("all")
  const [noteTypeFilter, setNoteTypeFilter] = React.useState<"all" | "GA" | "KA">("all")
  const [taskFilter, setTaskFilter] = React.useState<"all" | "with_tasks" | "without_tasks">("all")
  const [exportingDailyReport, setExportingDailyReport] = React.useState(false)
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



  const fetchNotes = React.useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      let url = "/ga-notes"
      const params = new URLSearchParams()
      if (projectId !== "NONE") {
        params.set("project_id", projectId)
      } else if (departmentId !== "ALL") {
        params.set("department_id", departmentId)
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

  // Sync state with URL parameters when they change
  React.useEffect(() => {
    const urlDeptId = searchParams.get("department_id")
    const urlProjId = searchParams.get("project_id")
    if (urlDeptId) {
      setDepartmentId(urlDeptId)
    }
    if (urlProjId) {
      setProjectId(urlProjId)
    }
  }, [searchParams])

  React.useEffect(() => {
    void loadDepartments()
  }, [loadDepartments])

  React.useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  React.useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  React.useEffect(() => {
    void fetchNotes()
  }, [fetchNotes])



  const createNote = async () => {
    if (!content.trim()) {
      toast.error("Content is required")
      return
    }
    // Use URL parameters if present, otherwise determine based on user role
    const departmentForNote = searchParams.get("department_id") || null
    const projectForNote = searchParams.get("project_id") || null
    
    // Determine department_id to send to backend
    let finalDepartmentId = departmentForNote
    let finalProjectId = projectForNote
    
    // If no URL params, send user's department_id for STAFF users (for backend validation)
    // but we'll hide it in the display if it matches the user's auto-assigned department
    if (!departmentForNote && !projectForNote) {
      const isAdminOrManager = user?.role === "ADMIN" || user?.role === "MANAGER"
      if (!isAdminOrManager && user?.department_id) {
        finalDepartmentId = user.department_id
      }
    }
    
    setPosting(true)
    try {
      const res = await apiFetch("/ga-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          note_type: noteType,
          priority: priority === "NONE" ? null : priority,
          department_id: finalDepartmentId,
          project_id: finalProjectId,
        }),
      })
      if (!res?.ok) {
        let errorMessage = "Failed to create note"
        try {
          const errorData = (await res.json()) as { detail?: string }
          if (errorData?.detail) {
            errorMessage = errorData.detail
          }
        } catch {
          // ignore
        }
        toast.error(errorMessage)
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

  const exportDailyReport = async () => {
    if (!user?.id) return
    setExportingDailyReport(true)
    try {
      const qs = new URLSearchParams()
      if (departmentId !== "ALL") {
        qs.set("department_id", departmentId)
      }
      if (projectId !== "NONE") {
        qs.set("project_id", projectId)
      }
      // Note: You'll need to create a backend endpoint /exports/ga-notes.xlsx
      // For now, using a placeholder - adjust the endpoint as needed
      const res = await apiFetch(`/exports/ga-notes.xlsx?${qs.toString()}`)
      if (!res.ok) {
        toast.error("Failed to export report")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      const disposition = res.headers.get("Content-Disposition")
      const match = disposition?.match(/filename=\"?([^\";]+)\"?/i)
      if (match?.[1]) {
        link.download = match[1]
      } else {
        const today = new Date().toISOString().split('T')[0]
        link.download = `ga_notes_export_${today}.xlsx`
      }
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Failed to export report", error)
      toast.error("Failed to export report")
    } finally {
      setExportingDailyReport(false)
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
    const matchesStatus = (note: GaNote) => {
      if (statusFilter === "all") return true
      if (statusFilter === "open") return note.status !== "CLOSED"
      if (statusFilter === "closed") return note.status === "CLOSED"
      return true
    }
    const matchesNoteType = (note: GaNote) => {
      if (noteTypeFilter === "all") return true
      return note.note_type === noteTypeFilter
    }
    const matchesTaskFilter = (note: GaNote) => {
      if (taskFilter === "all") return true
      if (taskFilter === "with_tasks") return note.is_converted_to_task === true
      if (taskFilter === "without_tasks") return note.is_converted_to_task === false
      return true
    }
    const sorted = [...notes]
      .filter(withinRange)
      .filter(matchesStatus)
      .filter(matchesNoteType)
      .filter(matchesTaskFilter)
      .sort((a, b) => {
        // First, sort by status: open notes first, closed notes last
        const aIsClosed = a.status === "CLOSED"
        const bIsClosed = b.status === "CLOSED"
        if (aIsClosed !== bIsClosed) {
          return aIsClosed ? 1 : -1 // Closed notes go to the end
        }
        // Then sort by creation date (newest first) within each group
        const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0
        const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0
        return bCreated - aCreated
      })
    return sorted
  }, [notes, rangeFilter, statusFilter, noteTypeFilter, taskFilter])

  const departmentMap = React.useMemo(() => new Map(departments.map((dept) => [dept.id, dept])), [departments])
  const projectMap = React.useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
  const userMap = React.useMemo(() => new Map(users.map((person) => [person.id, person])), [users])

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-gradient-to-r from-amber-50 via-indigo-50 to-cyan-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-primary/80 uppercase">Notes for all</div>
            <div className="text-2xl font-semibold leading-tight mt-1 text-slate-900">GA/KA Notes</div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary" className="px-3 py-1 rounded-full shadow-sm bg-emerald-100 text-emerald-800">
              Open {notes.filter((n) => n.status !== "CLOSED").length}
            </Badge>
            <Badge variant="outline" className="px-3 py-1 rounded-full border-indigo-200 text-indigo-800">
              Total: {notes.length}
            </Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">New Note
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className="min-h-[220px] resize-none text-base md:text-lg bg-primary/5 border-primary/40 shadow-[0_0_0_1px_rgba(0,0,0,0.04)] focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:border-primary"
              autoFocus
            />
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
              <Select value={rangeFilter} onValueChange={(v) => setRangeFilter(v as "week" | "all")}>
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">This week (default)</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "open" | "closed")}>
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Select value={noteTypeFilter} onValueChange={(v) => setNoteTypeFilter(v as "all" | "GA" | "KA")}>
                <SelectTrigger className="h-9 w-[120px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">GA/KA</SelectItem>
                  <SelectItem value="GA">GA</SelectItem>
                  <SelectItem value="KA">KA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Select value={taskFilter} onValueChange={(v) => setTaskFilter(v as "all" | "with_tasks" | "without_tasks")}>
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue placeholder="Tasks" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Notes</SelectItem>
                  <SelectItem value="with_tasks">Tasks</SelectItem>
                  <SelectItem value="without_tasks">Notes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-8 rounded-lg border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm hover:bg-slate-50"
              onClick={() => {
                const printWindow = window.open('', '_blank')
                if (!printWindow) return
                
                const tableContainer = document.querySelector('.notes-table-container')
                if (!tableContainer) return
                
                const table = tableContainer.querySelector('table')
                if (!table) return
                
                // Clone the table and clean up React-specific attributes
                const clonedTable = table.cloneNode(true) as HTMLElement
                const allElements = clonedTable.querySelectorAll('*')
                allElements.forEach((el) => {
                  // Remove React event handlers and other attributes
                  Array.from(el.attributes).forEach((attr) => {
                    if (attr.name.startsWith('data-') || attr.name.startsWith('on') || attr.name === 'class') {
                      // Keep class for styling
                      return
                    }
                    if (['style', 'colspan', 'rowspan'].includes(attr.name)) {
                      return
                    }
                    el.removeAttribute(attr.name)
                  })
                })
                
                // Extract text content from badges and buttons, replace with plain text
                clonedTable.querySelectorAll('[class*="Badge"], button').forEach((el) => {
                  const text = el.textContent?.trim() || ''
                  const span = document.createElement('span')
                  span.textContent = text
                  el.parentNode?.replaceChild(span, el)
                })
                
                printWindow.document.write(`
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <title>GA/KA Notes</title>
                      <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { margin: 0; padding: 20px; font-family: Arial, sans-serif; font-size: 12px; }
                        table { border-collapse: collapse; width: 100%; min-width: 1050px; border: 2px solid #1e293b; }
                        th, td { border: 1px solid #475569; padding: 8px; text-align: left; vertical-align: bottom; }
                        th { background-color: white; font-weight: bold; border-bottom: 1px solid #334155; }
                        td:first-child { border-left: 1px solid #475569; font-weight: bold; }
                        td:last-child { border-right: 1px solid #475569; }
                        /* Thick outside border for table - top */
                        thead tr:first-child th { border-top: 2px solid #1e293b; }
                        /* Thick outside border for table - left */
                        thead tr:first-child th:first-child,
                        tbody tr td:first-child { border-left: 2px solid #1e293b; }
                        /* Thick outside border for table - right */
                        thead tr:first-child th:last-child,
                        tbody tr td:last-child { border-right: 2px solid #1e293b; }
                        /* Thick outside border for table - bottom */
                        tbody tr:last-child td { border-bottom: 2px solid #1e293b; }
                        /* Thick border for header row - bottom */
                        thead tr:first-child { border-bottom: 4px solid #1e293b; }
                        thead tr:first-child th { border-bottom: 4px solid #1e293b !important; }
                        @media print {
                          body { margin: 0; padding: 10px; }
                          @page { margin: 1cm; size: landscape; }
                          table { font-size: 10px; }
                          th, td { padding: 4px; }
                        }
                      </style>
                    </head>
                    <body>
                      <h1 style="margin-bottom: 15px; font-size: 18px;">GA/KA Notes</h1>
                      ${clonedTable.outerHTML}
                    </body>
                  </html>
                `)
                printWindow.document.close()
                setTimeout(() => {
                  printWindow.print()
                  setTimeout(() => printWindow.close(), 100)
                }, 250)
              }}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button
              variant="outline"
              className="h-8 rounded-lg border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm hover:bg-slate-50"
              disabled={exportingDailyReport}
              onClick={() => void exportDailyReport()}
            >
              {exportingDailyReport ? "Exporting..." : "Export Excel"}
            </Button>
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading notes...</div>
          ) : notes.length === 0 ? (
            <div className="text-sm text-muted-foreground">No notes yet.</div>
          ) : (
            <div className="notes-table-container rounded-md border-2 border-slate-700 max-h-[75vh] overflow-x-auto overflow-y-auto relative bg-white w-full md:w-fit">
              <div className="w-full md:w-[1050px] min-w-[1050px]">
                <table className="w-full caption-bottom text-sm min-w-[1050px]">
                  <thead className="sticky top-0 z-50 bg-white shadow-md" style={{ position: 'sticky', top: 0, zIndex: 50 }}>
                    <tr className="bg-white" style={{ borderBottom: '1px solid rgb(51 65 85)' }}>
                      <th className="w-[40px] border border-slate-600 border-l-2 border-l-slate-800 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>NR</th>
                      <th className="w-[calc(100vw-80px)] md:w-[450px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>SHENIMI</th>
                      <th className="w-[140px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>DATA,ORA</th>
                      <th className="w-[60px] border border-slate-600 bg-white text-foreground h-10 px-1.5 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>NGA</th>
                      <th className="w-[60px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>DEP</th>
                      <th className="w-[120px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>PRJK</th>
                      <th className="w-[80px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>KRIJO DETYRE</th>
                      <th className="w-[80px] border border-slate-600 border-r-2 border-r-slate-800 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>MBYLL SHENIM</th>
                    </tr>
                  </thead>
                  <tbody>
                  {visibleNotes.map((note, idx) => {
                    const creator = note.created_by ? userMap.get(note.created_by) : null
                    const creatorLabel =
                      creator?.full_name || creator?.username || "Unknown user"
                    const creatorInitials = getInitials(creatorLabel)
                    const creatorBadgeClasses =
                      creatorInitials === "GA"
                        ? "bg-rose-100 text-rose-800 border border-rose-200"
                        : creatorInitials === "KA"
                          ? "bg-blue-100 text-blue-800 border border-blue-200"
                          : "bg-slate-200 text-slate-700"
                    const noteDepartment = note.department_id ? departmentMap.get(note.department_id) : null
                    const noteProject = note.project_id ? projectMap.get(note.project_id) : null

                    // Only show department if:
                    // 1. Note has a project (always show projects)
                    // 2. We're currently filtering by department/project (on a specific page)
                    // 3. Note's department_id is different from user's department (explicitly set, not auto-assigned)
                    const isFilteredView = departmentId !== "ALL" || projectId !== "NONE"
                    const isExplicitDepartment = note.department_id && note.department_id !== user?.department_id
                    const shouldShowDepartment = noteDepartment && (noteProject || isFilteredView || isExplicitDepartment)

                    return (
                      <tr key={note.id} className="hover:bg-muted/50 border-b transition-colors">
                        <td className="font-bold text-muted-foreground border border-slate-600 border-l-2 border-l-slate-800 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>{idx + 1}</td>
                        <td className="whitespace-pre-wrap break-words w-[calc(100vw-80px)] md:w-[450px] border border-slate-600 p-2 align-middle" style={{ verticalAlign: 'bottom' }}>
                          <div className="flex flex-col gap-1">
                            <span className="text-sm">{note.content}</span>
                            <div className="flex items-center gap-2">
                              {note.priority ? (
                                <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_BADGE[note.priority as Exclude<NotePriority, "NONE">]}`}>
                                  {note.priority}
                                </Badge>
                              ) : null}


                            </div>
                          </div>
                        </td>
                        <td className="border border-slate-600 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>{formatDate(note.created_at)}</td>
                        <td className="w-[60px] border border-slate-600 p-1.5 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>
                          <div className="flex items-center gap-2 text-xs">
                            <div
                              className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${creatorBadgeClasses}`}
                              title={creatorLabel}
                            >
                              {creatorInitials}
                            </div>
                          </div>
                        </td>
                        <td className="border border-slate-600 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>
                          {shouldShowDepartment && noteDepartment ? (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 whitespace-normal text-left">
                              {abbreviateDepartmentName(noteDepartment.name)}
                            </Badge>
                          ) : null}
                        </td>
                        <td className="border border-slate-600 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>
                          {noteProject ? (
                            <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200 whitespace-normal text-left">
                              {noteProject.title || noteProject.name || "Project"}
                            </Badge>
                          ) : null}
                        </td>
                        <td className="border border-slate-600 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>
                          <div className="flex justify-center">
                            {!note.is_converted_to_task ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                onClick={() => openTaskDialog(note)}
                              >
                                Create Task
                              </Button>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200 h-7 flex items-center">
                                Task Created
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="border border-slate-600 border-r-2 border-r-slate-800 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>
                          <div className="flex justify-center">
                            {note.status !== "CLOSED" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => void closeNote(note.id)}
                              >
                                Close
                              </Button>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200 h-7 flex items-center">
                                Closed
                              </Badge>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
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
                        const label = person?.full_name || person?.username || id
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
                            {person.full_name || person.username || person.id}
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