"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Pencil, Printer, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth"
import type { DailyReportResponse, Department, Task, TaskFinishPeriod, TaskPriority, User, UserLookup } from "@/lib/types"

import { SystemTasksView } from "../system-tasks/page"

const FINISH_PERIOD_NONE_VALUE = "__none__"
const PRIORITY_OPTIONS: TaskPriority[] = ["NORMAL", "HIGH", "BLLOK"]

// Date utility functions
const pad2 = (n: number) => String(n).padStart(2, "0")
const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const toDDMMYYYY = (isoDate: string) => {
  if (!isoDate) return ""
  const [y, m, d] = isoDate.split("-").map(Number)
  return `${pad2(d)}/${pad2(m)}/${y}`
}
const fromDDMMYYYY = (ddmmyyyy: string) => {
  if (!ddmmyyyy) return ""
  const parts = ddmmyyyy.split("/")
  if (parts.length !== 3) return ""
  const [d, m, y] = parts.map(Number)
  if (isNaN(d) || isNaN(m) || isNaN(y)) return ""
  if (d < 1 || d > 31 || m < 1 || m > 12) return ""
  return `${y}-${pad2(m)}-${pad2(d)}`
}
const DAY_OPTIONS = [
  { value: "all", label: "All days" },
  { value: "0", label: "Monday" },
  { value: "1", label: "Tuesday" },
  { value: "2", label: "Wednesday" },
  { value: "3", label: "Thursday" },
  { value: "4", label: "Friday" },
  { value: "5", label: "Saturday" },
  { value: "6", label: "Sunday" },
]

// --- Bold-only editor (same behavior as System Tasks) ---
const BOLD_TAG_PATTERN = /<(strong|b|br|div|p)(\s|>|\/)/i

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function sanitizeBoldOnlyHtml(raw: string) {
  if (typeof document === "undefined") return raw
  const container = document.createElement("div")
  container.innerHTML = raw

  const unwrapBlockElements = (el: Element) => {
    const blocks = el.querySelectorAll("div, p")
    Array.from(blocks)
      .reverse()
      .forEach((block) => {
        const parent = block.parentNode
        if (!parent) return
        while (block.firstChild) {
          parent.insertBefore(block.firstChild, block)
        }
        parent.removeChild(block)
      })
  }
  unwrapBlockElements(container)

  const clean = document.createElement("div")

  const sanitizeNode = (node: Node): Node[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ""
      return text.length > 0 ? [document.createTextNode(text)] : []
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return []
    const el = node as HTMLElement
    const tag = el.tagName
    if (tag === "BR") return [document.createElement("br")]
    const children = Array.from(el.childNodes).flatMap(sanitizeNode)
    if (tag === "B" || tag === "STRONG") {
      const strong = document.createElement("strong")
      children.forEach((child) => strong.appendChild(child))
      return [strong]
    }
    if (tag === "SPAN") {
      const weight = el.style.fontWeight || el.getAttribute("data-weight") || ""
      const numericWeight = Number.parseInt(weight, 10)
      const isBold =
        weight.toLowerCase() === "bold" || (!Number.isNaN(numericWeight) && numericWeight >= 600)
      if (isBold) {
        const strong = document.createElement("strong")
        children.forEach((child) => strong.appendChild(child))
        return [strong]
      }
      return children
    }
    return children
  }

  Array.from(container.childNodes).forEach((node) => {
    sanitizeNode(node).forEach((child) => clean.appendChild(child))
  })

  clean.normalize()

  const text = clean.textContent?.replace(/\s+/g, "") ?? ""
  if (!text) return ""
  return clean.innerHTML
}

function normalizeBoldValue(value: string) {
  if (!value) return ""
  if (typeof document === "undefined") return value
  if (BOLD_TAG_PATTERN.test(value)) return sanitizeBoldOnlyHtml(value)
  const container = document.createElement("div")
  const lines = value.split(/\r?\n/)
  lines.forEach((line, index) => {
    container.appendChild(document.createTextNode(line))
    if (index < lines.length - 1) container.appendChild(document.createElement("br"))
  })
  return container.innerHTML
}

type BoldOnlyEditorProps = {
  value: string
  onChange: (value: string) => void
}

function BoldOnlyEditor({ value, onChange }: BoldOnlyEditorProps) {
  const editorRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!editorRef.current) return
    const normalized = normalizeBoldValue(value)
    if (editorRef.current.innerHTML !== normalized) {
      editorRef.current.innerHTML = normalized
    }
  }, [value])

  const commitChange = React.useCallback(() => {
    if (!editorRef.current) return
    const sanitized = sanitizeBoldOnlyHtml(editorRef.current.innerHTML)
    if (sanitized !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = sanitized
    }
    onChange(sanitized)
  }, [onChange])

  const handleInput = React.useCallback(() => {
    if (!editorRef.current) return
    onChange(editorRef.current.innerHTML)
  }, [onChange])

  const [isBold, setIsBold] = React.useState(false)

  const checkBoldState = React.useCallback(() => {
    if (typeof document !== "undefined") {
      setIsBold(document.queryCommandState("bold"))
    }
  }, [])

  const applyBold = React.useCallback(() => {
    if (!editorRef.current) return
    editorRef.current.focus()
    document.execCommand("bold", false)
    checkBoldState()
    commitChange()
  }, [commitChange, checkBoldState])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-semibold shadow-sm transition ${
            isBold
              ? "border-blue-500 bg-blue-100 text-blue-700"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={applyBold}
          aria-label="Bold"
          aria-pressed={isBold}
        >
          B
        </button>
        <span className="text-xs text-muted-foreground">Bold only</span>
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] md:text-sm whitespace-pre-wrap"
        onInput={handleInput}
        onBlur={commitChange}
        onSelect={checkBoldState}
        onKeyUp={checkBoldState}
        onMouseUp={checkBoldState}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            document.execCommand("insertLineBreak")
            handleInput()
            return
          }
          if (event.ctrlKey || event.metaKey) {
            const key = event.key.toLowerCase()
            if (key === "b") {
              event.preventDefault()
              applyBold()
              return
            }
            if (["i", "u"].includes(key)) {
              event.preventDefault()
            }
          }
        }}
        onPaste={(event) => {
          event.preventDefault()
          const text = event.clipboardData.getData("text/plain")
          if (!text) return
          const html = escapeHtml(text)
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .replace(/\n/g, "<br>")
          document.execCommand("insertHTML", false, html)
          commitChange()
        }}
        suppressContentEditableWarning
      />
    </div>
  )
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" })
}

function getMondayBasedDay(date: Date) {
  return (date.getDay() + 6) % 7
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function initials(src: string) {
  return src
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

function dayKey(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function toDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function periodFromDate(value?: string | null) {
  if (!value) return "AM"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "AM"
  return date.getHours() >= 12 ? "PM" : "AM"
}

function resolvePeriod(finishPeriod?: TaskFinishPeriod | null, dateValue?: string | null) {
  if (finishPeriod === "PM") return "PM"
  if (finishPeriod === "AM") return "AM"
  return periodFromDate(dateValue)
}

function noProjectTypeLabel(task: Task) {
  if (task.is_bllok) return "BLLOK"
  if (task.is_1h_report) return "1H"
  if (task.is_r1) return "R1"
  if (task.is_personal) return "Personal"
  if (task.ga_note_origin_id) return "GA"
  return "Normal"
}

function fastReportSubtypeShort(task: Task) {
  const base = noProjectTypeLabel(task)
  if (base === "BLLOK") return "BLL"
  if (base === "Personal") return "P:"
  if (base === "Normal") return "N"
  return base
}

function getDisplayPriority(task: Task): TaskPriority {
  if (task.is_bllok) return "BLLOK"
  return (task.priority || "NORMAL") as TaskPriority
}

function reportStatusLabel(status?: Task["status"] | null) {
  if (!status) return "-"
  if (status === "IN_PROGRESS") return "In Progress"
  if (status === "TODO") return "To Do"
  if (status === "DONE") return "Done"
  return status
}

function taskStatusLabel(task: Task) {
  if (task.status) return reportStatusLabel(task.status)
  if (task.completed_at) return "Done"
  return "-"
}

function formatSystemOccurrenceStatus(status?: string | null) {
  if (!status) return "-"
  if (status === "NOT_DONE") return "Not Done"
  if (status === "DONE") return "Done"
  if (status === "OPEN") return "Open"
  if (status === "SKIPPED") return "Skipped"
  return status
}

function getTyoLabel(baseDate: Date | null, completedAt: string | null | undefined, today: Date) {
  const completedDate = completedAt ? toDate(completedAt) : null
  if (completedDate && isSameDay(completedDate, today)) return "T"
  if (!baseDate) return "-"
  if (isSameDay(baseDate, today)) return "T"
  const delta = Math.floor((dayKey(today) - dayKey(baseDate)) / MS_PER_DAY)
  if (delta === 1) return "Y"
  if (delta > 1) return String(delta)
  return "-"
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function GaKaTasksPage() {
  const { apiFetch, user } = useAuth()
  type AssigneeUser = User | UserLookup
  const [tasks, setTasks] = React.useState<Task[]>([])
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [users, setUsers] = React.useState<AssigneeUser[]>([])
  const [loadingTasks, setLoadingTasks] = React.useState(true)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [viewFilter, setViewFilter] = React.useState<"all" | "tasks" | "system">("all")
  const [priorityFilter, setPriorityFilter] = React.useState<"all" | TaskPriority>("all")
  const [dayFilter, setDayFilter] = React.useState<string>("all")
  const [dateFilter, setDateFilter] = React.useState("")

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [startDate, setStartDate] = React.useState("")
  const [startDateDisplay, setStartDateDisplay] = React.useState("")
  const [dueDate, setDueDate] = React.useState("")
  const [dueDateDisplay, setDueDateDisplay] = React.useState("")
  const [taskPriority, setTaskPriority] = React.useState<TaskPriority>("NORMAL")
  const [finishPeriod, setFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(
    FINISH_PERIOD_NONE_VALUE
  )

  // Edit task state
  const [editOpen, setEditOpen] = React.useState(false)
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null)
  const [editTitle, setEditTitle] = React.useState("")
  const [editDescription, setEditDescription] = React.useState("")
  const [editStartDate, setEditStartDate] = React.useState("")
  const [editStartDateDisplay, setEditStartDateDisplay] = React.useState("")
  const [editDueDate, setEditDueDate] = React.useState("")
  const [editDueDateDisplay, setEditDueDateDisplay] = React.useState("")
  const [editPriority, setEditPriority] = React.useState<TaskPriority>("NORMAL")
  const [editFinishPeriod, setEditFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(
    FINISH_PERIOD_NONE_VALUE
  )
  const [originalIsBllok, setOriginalIsBllok] = React.useState(false)
  const [savingEdit, setSavingEdit] = React.useState(false)
  const [deletingTaskId, setDeletingTaskId] = React.useState<string | null>(null)

  const printedAt = React.useMemo(() => new Date(), [])
  const printInitials = initials(user?.full_name || user?.username || "")
  const todayDate = React.useMemo(() => new Date(), [])
  const todayIso = React.useMemo(() => todayDate.toISOString().slice(0, 10), [todayDate])

  const [dailyReport, setDailyReport] = React.useState<DailyReportResponse | null>(null)
  const [loadingDailyReport, setLoadingDailyReport] = React.useState(false)
  const [showDailyUserReport, setShowDailyUserReport] = React.useState(false)
  const [dailyReportCommentEdits, setDailyReportCommentEdits] = React.useState<Record<string, string>>({})
  const [savingDailyReportComments, setSavingDailyReportComments] = React.useState<Record<string, boolean>>({})
  const [exportingDailyReport, setExportingDailyReport] = React.useState(false)
  const dailyReportScrollRef = React.useRef<HTMLDivElement | null>(null)
  const dailyReportDragRef = React.useRef({ isDragging: false, startX: 0, startScrollLeft: 0 })
  const [isDraggingDailyReport, setIsDraggingDailyReport] = React.useState(false)

  const isAdmin = user?.role === "ADMIN"
  const ganeUser = React.useMemo(
    () => users.find((person) => person.username?.toLowerCase() === "gane.arifaj") ?? null,
    [users]
  )
  const ganeUserId = ganeUser?.id ?? null

  const load = React.useCallback(async () => {
    setLoadingTasks(true)
    try {
      const [tasksRes, departmentsRes] = await Promise.all([
        apiFetch("/tasks?include_done=true"),
        apiFetch("/departments"),
      ])
      if (tasksRes.ok) {
        setTasks((await tasksRes.json()) as Task[])
      }
      if (departmentsRes.ok) {
        setDepartments((await departmentsRes.json()) as Department[])
      }
      const usersRes = await apiFetch(user?.role === "STAFF" ? "/users/lookup" : "/users")
      if (usersRes.ok) {
        setUsers((await usersRes.json()) as AssigneeUser[])
      }
    } finally {
      setLoadingTasks(false)
    }
  }, [apiFetch, user?.role])

  const adminDepartmentId = React.useMemo(() => {
    const byCode = departments.find((dept) => dept.code?.toUpperCase() === "GA")
    if (byCode) return byCode.id
    const byName = departments.find((dept) => dept.name?.toUpperCase().includes("GA"))
    return byName?.id ?? null
  }, [departments])

  const loadDailyReport = React.useCallback(async () => {
    if (!user?.id) return
    setLoadingDailyReport(true)
    try {
      const targetUserId = ganeUserId ?? user.id
      const params: Record<string, string> = {
        day: todayIso,
        user_id: targetUserId,
      }
      if (adminDepartmentId) {
        params.department_id = adminDepartmentId
      }
      const qs = new URLSearchParams(params)
      const res = await apiFetch(`/reports/daily?${qs.toString()}`)
      if (!res.ok) {
        toast.error("Failed to load daily report")
        return
      }
      setDailyReport((await res.json()) as DailyReportResponse)
    } catch (error) {
      console.error("Failed to load daily report", error)
      toast.error("Failed to load daily report")
    } finally {
      setLoadingDailyReport(false)
    }
  }, [adminDepartmentId, apiFetch, ganeUserId, todayIso, user?.id])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    if (!showDailyUserReport) return
    void loadDailyReport()
  }, [loadDailyReport, showDailyUserReport])


  const submitTask = async () => {
    if (!title.trim()) {
      toast.error("Task title is required")
      return
    }
    if (!ganeUserId) {
      toast.error("Gane Arifaj user not found. Cannot assign task.")
      return
    }
    setCreating(true)
    try {
      const noteRes = await apiFetch("/ga-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department_id: null,
          content: description.trim() || title.trim(),
          note_type: "GA",
        }),
      })
      if (!noteRes.ok) {
        let detail = "Failed to create GA note"
        try {
          const data = (await noteRes.json()) as { detail?: string | Array<{ msg?: string }> }
          if (data?.detail) {
            if (typeof data.detail === "string") {
              detail = data.detail
            } else if (Array.isArray(data.detail) && data.detail.length > 0) {
              detail = data.detail.map((e) => e.msg || "Validation error").join(", ")
            }
          }
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const createdNote = (await noteRes.json()) as { id: string }

      const startDateValue = startDate ? new Date(startDate).toISOString() : null
      const dueDateValue = dueDate ? new Date(dueDate).toISOString() : null
      const isBllok = taskPriority === "BLLOK"
      const actualPriority: "NORMAL" | "HIGH" = isBllok ? "NORMAL" : (taskPriority === "HIGH" ? "HIGH" : "NORMAL")
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        status: "TODO",
        priority: actualPriority,
        finish_period: finishPeriod === FINISH_PERIOD_NONE_VALUE ? null : finishPeriod,
        start_date: startDateValue,
        due_date: dueDateValue,
        ga_note_origin_id: createdNote.id,
        assigned_to: ganeUserId,
        ...(isBllok && { is_bllok: true }),
      }
      const res = await apiFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail = "Failed to create task"
        try {
          const data = (await res.json()) as { detail?: string | Array<{ msg?: string }> }
          if (data?.detail) {
            if (typeof data.detail === "string") {
              detail = data.detail
            } else if (Array.isArray(data.detail) && data.detail.length > 0) {
              detail = data.detail.map((e) => e.msg || "Validation error").join(", ")
            }
          }
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const created = (await res.json()) as Task
      setTasks((prev) => [created, ...prev])
      setCreateOpen(false)
      setTitle("")
      setDescription("")
      setStartDate("")
      setStartDateDisplay("")
      setDueDate("")
      setDueDateDisplay("")
      setTaskPriority("NORMAL")
      setFinishPeriod(FINISH_PERIOD_NONE_VALUE)
      toast.success("Task created")
    } finally {
      setCreating(false)
    }
  }

  const departmentMap = React.useMemo(() => new Map(departments.map((dept) => [dept.id, dept])), [departments])
  const userMap = React.useMemo(() => new Map(users.map((person) => [person.id, person])), [users])

  const gaTasks = React.useMemo(() => {
    return tasks.filter((task) => {
      const isSystem = Boolean(task.system_template_origin_id || task.task_type === "system")
      if (!task.ga_note_origin_id || isSystem) return false
      // Show tasks assigned to current user or to gane.arifaj
      const currentUserId = user?.id
      if (!currentUserId && !ganeUserId) return false
      const isAssigned = 
        (currentUserId && (task.assigned_to === currentUserId || task.assignees?.some((assignee) => assignee.id === currentUserId))) ||
        (ganeUserId && (task.assigned_to === ganeUserId || task.assignees?.some((assignee) => assignee.id === ganeUserId)))
      if (!isAssigned) return false
      const createdAt = task.created_at ? new Date(task.created_at).getTime() : 0
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
      return createdAt >= cutoff
    })
  }, [ganeUserId, tasks, user?.id])

  const filteredTasks = React.useMemo(() => {
    let filtered = gaTasks
    if (priorityFilter !== "all") {
      filtered = filtered.filter(
        (task) => getDisplayPriority(task).toUpperCase() === priorityFilter
      )
    }
    if (dateFilter) {
      filtered = filtered.filter((task) => {
        if (!task.due_date) return false
        const iso = new Date(task.due_date).toISOString().slice(0, 10)
        return iso === dateFilter
      })
    }
    if (dayFilter !== "all") {
      const targetDay = Number(dayFilter)
      if (!Number.isNaN(targetDay)) {
        filtered = filtered.filter((task) => {
          if (!task.due_date) return false
          const day = getMondayBasedDay(new Date(task.due_date))
          return day === targetDay
        })
      }
    }
    return filtered
  }, [dateFilter, dayFilter, gaTasks, priorityFilter])

  const sortedTasks = React.useMemo(
    () =>
      [...filteredTasks].sort((a, b) => {
        const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0
        const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0
        return bCreated - aCreated
      }),
    [filteredTasks]
  )

  const taskCommentMap = React.useMemo(() => {
    const map = new Map<string, string | null>()
    for (const task of tasks) {
      map.set(task.id, task.user_comment ?? null)
    }
    return map
  }, [tasks])

  const dailyUserReportRows = React.useMemo(() => {
    const rows: Array<{
      typeLabel: string
      subtype: string
      period: string
      department: string
      title: string
      description: string
      status: string
      bz: string
      kohaBz: string
      tyo: string
      comment?: string | null
      userInitials?: string
      taskId?: string
      systemTemplateId?: string
      systemOccurrenceDate?: string
      systemStatus?: string
    }> = []

    if (!dailyReport) return rows

    const tasksToday = dailyReport.tasks_today || []
    const tasksOverdue = dailyReport.tasks_overdue || []
    const seenTaskIds = new Set<string>()

    const resolveDepartmentLabel = (
      departmentId?: string | null,
      scope?: SystemTaskScope | null,
      isGaNote?: boolean
    ) => {
      if (scope === "GA") return "GA"
      if (scope === "ALL") return "ALL"
      if (departmentId) {
        const dept = departments.find((d) => d.id === departmentId)
        return dept?.code || dept?.name || "-"
      }
      if (isGaNote) return "GA"
      return "-"
    }

    const pushTaskRow = (item: DailyReportResponse["tasks_today"][number]) => {
      const task = item.task
      if (ganeUserId) {
        const isAssigned =
          task.assigned_to === ganeUserId ||
          task.assignees?.some((assignee) => assignee.id === ganeUserId)
        if (!isAssigned) return
      }
      if (seenTaskIds.has(task.id)) return
      seenTaskIds.add(task.id)
      const baseDate = toDate(task.due_date || task.start_date || task.created_at)
      const isProject = Boolean(task.project_id)
      rows.push({
        typeLabel: isProject ? "PRJK" : "FT",
        subtype: isProject ? "-" : fastReportSubtypeShort(task),
        period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at),
        department: resolveDepartmentLabel(task.department_id, null, Boolean(task.ga_note_origin_id)),
        title: task.title || "-",
        description: task.description || "-",
        status: taskStatusLabel(task),
        bz: "-",
        kohaBz: "-",
        tyo: getTyoLabel(baseDate, task.completed_at, todayDate),
        comment: taskCommentMap.get(task.id) ?? null,
        userInitials: ganeUser ? initials(ganeUser.full_name || ganeUser.username || "") : "",
        taskId: task.id,
      })
    }

    tasksToday.forEach(pushTaskRow)
    tasksOverdue.forEach(pushTaskRow)

    for (const task of tasks) {
      if (!ganeUserId) continue
      const isAssigned =
        task.assigned_to === ganeUserId ||
        task.assignees?.some((assignee) => assignee.id === ganeUserId)
      if (!isAssigned) continue
      if (task.is_active === false) continue
      if (task.system_template_origin_id) continue
      if (!task.due_date) continue
      const due = toDate(task.due_date)
      if (!due || !isSameDay(due, todayDate)) continue
      if (seenTaskIds.has(task.id)) continue
      seenTaskIds.add(task.id)
      const baseDate = toDate(task.due_date || task.start_date || task.created_at)
      const isProject = Boolean(task.project_id)
      rows.push({
        typeLabel: isProject ? "PRJK" : "FT",
        subtype: isProject ? "-" : fastReportSubtypeShort(task),
        period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at),
        department: resolveDepartmentLabel(task.department_id, null, Boolean(task.ga_note_origin_id)),
        title: task.title || "-",
        description: task.description || "-",
        status: taskStatusLabel(task),
        bz: "-",
        kohaBz: "-",
        tyo: getTyoLabel(baseDate, task.completed_at, todayDate),
        comment: taskCommentMap.get(task.id) ?? null,
        userInitials: ganeUser ? initials(ganeUser.full_name || ganeUser.username || "") : "",
        taskId: task.id,
      })
    }

    const systemToday = dailyReport.system_today || []
    const systemOverdue = dailyReport.system_overdue || []
    const seenSystemKeys = new Set<string>()
    const pushSystemRow = (occ: DailyReportResponse["system_today"][number]) => {
      const key = `${occ.template_id}:${occ.occurrence_date}`
      if (seenSystemKeys.has(key)) return
      seenSystemKeys.add(key)
      const baseDate = toDate(occ.occurrence_date)
      const systemSubtype =
        occ.frequency === "DAILY"
          ? "D"
          : occ.frequency === "WEEKLY"
            ? "W"
            : occ.frequency === "MONTHLY"
              ? "M"
              : occ.frequency === "YEARLY"
                ? "Y"
                : occ.frequency === "3_MONTHS"
                  ? "3M"
                  : occ.frequency === "6_MONTHS"
                    ? "6M"
                    : "SYS"
      rows.push({
        typeLabel: "SYS",
        subtype: systemSubtype,
        period: "AM",
        department: resolveDepartmentLabel(occ.department_id, occ.scope || null, false),
        title: occ.title || "-",
        description: "-",
        status: formatSystemOccurrenceStatus(occ.status),
        bz: "-",
        kohaBz: "-",
        tyo: getTyoLabel(baseDate, occ.acted_at, todayDate),
        comment: occ.comment ?? null,
        userInitials: ganeUser ? initials(ganeUser.full_name || ganeUser.username || "") : "",
        systemTemplateId: occ.template_id,
        systemOccurrenceDate: occ.occurrence_date,
        systemStatus: occ.status,
      })
    }
    systemToday.forEach(pushSystemRow)
    systemOverdue.forEach(pushSystemRow)

    return rows
  }, [dailyReport, departments, ganeUser, ganeUserId, taskCommentMap, tasks, todayDate])

  const startEditTask = (task: Task) => {
    setEditingTaskId(task.id)
    setEditTitle(task.title || "")
    setEditDescription(task.description || "")
    const taskStartDate = task.start_date ? new Date(task.start_date).toISOString().split("T")[0] : ""
    setEditStartDate(taskStartDate)
    setEditStartDateDisplay(taskStartDate ? toDDMMYYYY(taskStartDate) : "")
    const taskDueDate = task.due_date ? new Date(task.due_date).toISOString().split("T")[0] : ""
    setEditDueDate(taskDueDate)
    setEditDueDateDisplay(taskDueDate ? toDDMMYYYY(taskDueDate) : "")
    setEditPriority((task.is_bllok ? "BLLOK" : (task.priority || "NORMAL")) as TaskPriority)
    setOriginalIsBllok(task.is_bllok || false)
    setEditFinishPeriod(task.finish_period || FINISH_PERIOD_NONE_VALUE)
    setEditOpen(true)
  }

  const saveEditTask = async () => {
    if (!editingTaskId || !editTitle.trim()) return
    setSavingEdit(true)
    try {
      const startDateValue = editStartDate ? new Date(editStartDate).toISOString() : null
      const dueDateValue = editDueDate ? new Date(editDueDate).toISOString() : null
      const isBllok = editPriority === "BLLOK"
      const actualPriority: "NORMAL" | "HIGH" = isBllok ? "NORMAL" : (editPriority === "HIGH" ? "HIGH" : "NORMAL")
      const payload: Record<string, unknown> = {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        priority: actualPriority,
        start_date: startDateValue,
        due_date: dueDateValue,
        finish_period: editFinishPeriod === FINISH_PERIOD_NONE_VALUE ? null : editFinishPeriod,
      }
      // Only include is_bllok if it changed from the original value
      if (isBllok !== originalIsBllok) {
        payload.is_bllok = isBllok
      }
      const res = await apiFetch(`/tasks/${editingTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail = "Failed to update task"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const updated = (await res.json()) as Task
      setTasks((prev) => prev.map((task) => (task.id === updated.id ? updated : task)))
      setEditOpen(false)
      setEditingTaskId(null)
      toast.success("Task updated")
    } finally {
      setSavingEdit(false)
    }
  }

  const deleteTask = async (taskId: string) => {
    if (!confirm("Are you sure you want to delete this task?")) return
    setDeletingTaskId(taskId)
    try {
      const res = await apiFetch(`/tasks/${taskId}`, { method: "DELETE" })
      if (!res?.ok) {
        if (res?.status === 405) {
          toast.error("Delete endpoint not active. Restart backend.")
        } else {
          toast.error("Failed to delete task")
        }
        return
      }
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
      toast.success("Task deleted")
    } finally {
      setDeletingTaskId(null)
    }
  }

  const updateTaskCommentState = (taskId: string, comment: string | null) => {
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, user_comment: comment } : task)))
  }

  const setDailyReportCommentSaving = (commentKey: string, isSaving: boolean) => {
    setSavingDailyReportComments((prev) => ({ ...prev, [commentKey]: isSaving }))
  }

  const isDragTargetInteractive = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT" || tag === "LABEL"
  }

  const handleDailyReportMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if (isDragTargetInteractive(event.target)) return
    const container = dailyReportScrollRef.current
    if (!container) return
    dailyReportDragRef.current = {
      isDragging: true,
      startX: event.pageX - container.offsetLeft,
      startScrollLeft: container.scrollLeft,
    }
    setIsDraggingDailyReport(true)
  }

  const handleDailyReportMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const dragState = dailyReportDragRef.current
    if (!dragState.isDragging) return
    const container = dailyReportScrollRef.current
    if (!container) return
    const x = event.pageX - container.offsetLeft
    const walk = x - dragState.startX
    container.scrollLeft = dragState.startScrollLeft - walk
  }

  const handleDailyReportMouseEnd = () => {
    if (!dailyReportDragRef.current.isDragging) return
    dailyReportDragRef.current.isDragging = false
    setIsDraggingDailyReport(false)
  }

  const saveDailyReportTaskComment = async (
    taskId: string,
    nextValue: string,
    previousValue: string,
    commentKey: string
  ) => {
    const trimmed = nextValue.trim()
    const previousTrimmed = previousValue.trim()
    if (trimmed === previousTrimmed) return

    const payloadComment = trimmed.length ? trimmed : null
    setDailyReportCommentSaving(commentKey, true)
    try {
      const res = await apiFetch(`/tasks/${taskId}/comment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: payloadComment }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.detail || "Failed to save comment")
        setDailyReportCommentEdits((prev) => ({ ...prev, [commentKey]: previousValue }))
        return
      }
      updateTaskCommentState(taskId, payloadComment)
      setDailyReportCommentEdits((prev) => ({ ...prev, [commentKey]: trimmed }))
    } catch (error) {
      console.error("Failed to save comment", error)
      toast.error("Failed to save comment")
      setDailyReportCommentEdits((prev) => ({ ...prev, [commentKey]: previousValue }))
    } finally {
      setDailyReportCommentSaving(commentKey, false)
    }
  }

  const saveDailyReportSystemComment = async (
    templateId: string,
    occurrenceDate: string,
    status: string,
    nextValue: string,
    previousValue: string,
    commentKey: string
  ) => {
    const trimmed = nextValue.trim()
    const previousTrimmed = previousValue.trim()
    if (trimmed === previousTrimmed) return

    const payloadComment = trimmed.length ? trimmed : null
    setDailyReportCommentSaving(commentKey, true)
    try {
      const res = await apiFetch("/system-tasks/occurrences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: templateId,
          occurrence_date: occurrenceDate,
          status: status || "OPEN",
          comment: payloadComment,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.detail || "Failed to save comment")
        setDailyReportCommentEdits((prev) => ({ ...prev, [commentKey]: previousValue }))
        return
      }

      setDailyReport((prev) => {
        if (!prev) return prev
        const updateOccurrence = (occ: DailyReportResponse["system_today"][number]) =>
          occ.template_id === templateId && occ.occurrence_date === occurrenceDate
            ? { ...occ, comment: payloadComment }
            : occ
        return {
          ...prev,
          system_today: prev.system_today.map(updateOccurrence),
          system_overdue: prev.system_overdue.map(updateOccurrence),
        }
      })
      setDailyReportCommentEdits((prev) => ({ ...prev, [commentKey]: trimmed }))
    } catch (error) {
      console.error("Failed to save comment", error)
      toast.error("Failed to save comment")
      setDailyReportCommentEdits((prev) => ({ ...prev, [commentKey]: previousValue }))
    } finally {
      setDailyReportCommentSaving(commentKey, false)
    }
  }

  const exportDailyReport = async () => {
    if (!user?.id) return
    if (!ganeUserId) {
      toast.error("Gane Arifaj user not found. Cannot export.")
      return
    }
    setExportingDailyReport(true)
    try {
      const qs = new URLSearchParams({
        day: todayIso,
        user_id: ganeUserId,
      })
      const res = await apiFetch(`/exports/daily-report.xlsx?${qs.toString()}`)
      if (!res.ok) {
        toast.error("Failed to export report")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `daily_report_${todayIso}_${printInitials || "user"}.xlsx`
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

  return (
    <div className="space-y-6">
      <div className="space-y-6 print:hidden">
        <Card className="sticky top-0 z-40 border-0 bg-gradient-to-r from-slate-50 via-slate-100 to-slate-50 shadow-sm">
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Admin Tasks</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="border-slate-200 bg-white">
                  GA tasks: {gaTasks.length}
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-white">
                  Filtered: {sortedTasks.length}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[160px]">
                <Label className="text-xs text-muted-foreground">View</Label>
                <Select value={viewFilter} onValueChange={(value) => setViewFilter(value as "all" | "tasks" | "system")}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tasks + System</SelectItem>
                    <SelectItem value="tasks">Tasks only</SelectItem>
                    <SelectItem value="system">System only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[160px]">
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as "all" | TaskPriority)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All priorities</SelectItem>
                    {PRIORITY_OPTIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[160px]">
                <Label className="text-xs text-muted-foreground">Day</Label>
                <Select value={dayFilter} onValueChange={setDayFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[160px]">
                <Label className="text-xs text-muted-foreground">Due date</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={dateFilter}
                  onChange={(event) => setDateFilter(event.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  className="h-9 text-xs text-slate-600"
                  onClick={() => {
                    setViewFilter("all")
                    setPriorityFilter("all")
                    setDayFilter("all")
                    setDateFilter("")
                  }}
                >
                  Clear filters
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
        <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Daily Report</CardTitle>
              <div className="text-xs text-slate-500 mt-1">Tasks and system occurrences for today.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="h-8 rounded-lg border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm hover:bg-slate-50"
                onClick={() => setShowDailyUserReport((prev) => !prev)}
              >
                {showDailyUserReport ? "Hide Daily Report" : "Daily Report"}
              </Button>
              {showDailyUserReport ? (
                <>
                  <Button
                    variant="outline"
                    className="h-8 rounded-lg border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm hover:bg-slate-50"
                    onClick={() => window.print()}
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
                </>
              ) : null}
            </div>
          </CardHeader>
          {showDailyUserReport ? (
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="text-xs text-slate-500">
                  {todayDate.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })}
                </div>
                {loadingDailyReport ? <div className="text-xs text-slate-500">Loading...</div> : null}
              </div>
              <div
                ref={dailyReportScrollRef}
                className={`mt-3 max-h-[320px] overflow-x-auto overflow-y-auto ${
                  isDraggingDailyReport ? "cursor-grabbing" : "cursor-grab"
                }`}
                onMouseDown={handleDailyReportMouseDown}
                onMouseMove={handleDailyReportMouseMove}
                onMouseUp={handleDailyReportMouseEnd}
                onMouseLeave={handleDailyReportMouseEnd}
              >
                <table className="min-w-[900px] w-[80%] border border-slate-200 text-[11px] daily-report-table">
                  <colgroup>
                    <col className="w-[36px]" />
                    <col className="w-[44px]" />
                    <col className="w-[56px]" />
                    <col className="w-[56px]" />
                    <col className="w-[56px]" />
                    <col className="w-[150px]" />
                    <col className="w-[60px]" />
                    <col className="w-[40px]" />
                    <col className="w-[52px]" />
                    <col className="w-[48px]" />
                    <col className="w-[140px]" />
                    <col className="w-[70px]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr className="bg-slate-50">
                      <th className="sticky left-0 z-30 border border-slate-200 bg-slate-50 px-2 py-2 text-left text-xs uppercase whitespace-normal shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                        Nr
                      </th>
                      <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase">LL</th>
                      <th className="border border-slate-200 px-2 py-2 pr-3 text-left text-xs uppercase whitespace-normal">
                        NLL
                      </th>
                      <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase whitespace-normal">
                        <span className="block">AM/</span>
                        <span className="block">PM</span>
                      </th>
                      <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase">DEP</th>
                      <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase">Titulli</th>
                      <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase">STS</th>
                      <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase">BZ</th>
                      <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase whitespace-normal">
                        KOHA BZ
                      </th>
                      <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase whitespace-normal break-words">
                        T/Y/O
                      </th>
                      <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase">Koment</th>
                      <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase">User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyUserReportRows.length ? (
                      dailyUserReportRows.map((row, index) => {
                        const commentKey = row.taskId
                          ? `task:${row.taskId}`
                          : row.systemTemplateId && row.systemOccurrenceDate
                            ? `system:${row.systemTemplateId}:${row.systemOccurrenceDate}`
                            : ""
                        const previousValue = row.comment ?? ""
                        const commentValue = commentKey ? (dailyReportCommentEdits[commentKey] ?? previousValue) : ""
                        const isSaving = commentKey ? Boolean(savingDailyReportComments[commentKey]) : false
                        return (
                          <tr key={`${row.typeLabel}-${row.title}-${index}`}>
                            <td className="sticky left-0 z-20 border border-slate-200 bg-white px-2 py-2 align-top font-semibold shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                              {index + 1}
                            </td>
                            <td className="border border-slate-200 px-2 py-2 align-top font-semibold">{row.typeLabel}</td>
                            <td className="border border-slate-200 px-2 py-2 align-top whitespace-normal break-words">
                              {row.subtype}
                            </td>
                            <td className="border border-slate-200 px-2 py-2 align-top whitespace-normal break-words">
                              {row.period}
                            </td>
                            <td className="border border-slate-200 px-2 py-2 align-top">{row.department}</td>
                            <td className="border border-slate-200 px-2 py-2 align-top uppercase">{row.title}</td>
                            <td className="border border-slate-200 px-2 py-2 align-top uppercase">{row.status}</td>
                            <td className="border border-slate-200 px-2 py-2 align-top">{row.bz}</td>
                            <td className="border border-slate-200 px-2 py-2 align-top">{row.kohaBz}</td>
                            <td className="border border-slate-200 px-2 py-2 align-top whitespace-normal break-words">
                              {row.tyo}
                            </td>
                            <td className="border border-slate-200 px-2 py-2 align-top">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  aria-label="Koment"
                                  className="h-4 w-full border-b border-slate-300 bg-transparent"
                                  value={commentValue}
                                  onChange={(e) => {
                                    if (!commentKey) return
                                    const nextValue = e.target.value
                                    setDailyReportCommentEdits((prev) => ({ ...prev, [commentKey]: nextValue }))
                                  }}
                                  onBlur={(e) => {
                                    if (!commentKey) return
                                    const nextValue = e.target.value
                                    if (row.taskId) {
                                      void saveDailyReportTaskComment(row.taskId, nextValue, previousValue, commentKey)
                                      return
                                    }
                                    if (row.systemTemplateId && row.systemOccurrenceDate) {
                                      void saveDailyReportSystemComment(
                                        row.systemTemplateId,
                                        row.systemOccurrenceDate,
                                        row.systemStatus || "OPEN",
                                        nextValue,
                                        previousValue,
                                        commentKey
                                      )
                                    }
                                  }}
                                  disabled={!commentKey}
                                />
                                <button
                                  type="button"
                                  className="print:hidden text-[10px] font-semibold uppercase text-slate-500 hover:text-slate-700 disabled:text-slate-300"
                                  disabled={!commentKey || isSaving}
                                  onClick={() => {
                                    if (!commentKey) return
                                    if (row.taskId) {
                                      void saveDailyReportTaskComment(row.taskId, commentValue, previousValue, commentKey)
                                      return
                                    }
                                    if (row.systemTemplateId && row.systemOccurrenceDate) {
                                      void saveDailyReportSystemComment(
                                        row.systemTemplateId,
                                        row.systemOccurrenceDate,
                                        row.systemStatus || "OPEN",
                                        commentValue,
                                        previousValue,
                                        commentKey
                                      )
                                    }
                                  }}
                                >
                                  {isSaving ? "Saving" : "Save"}
                                </button>
                              </div>
                            </td>
                            <td className="border border-slate-200 px-2 py-2 align-top uppercase">
                              {row.userInitials || "-"}
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td className="border border-slate-200 px-2 py-4 text-center italic text-slate-500" colSpan={12}>
                          No data available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          ) : null}
        </Card>
        {viewFilter !== "system" ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Tasks</CardTitle>
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">+ Add Task</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add GA Task</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input value={title} onChange={(event) => setTitle(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <BoldOnlyEditor value={description} onChange={setDescription} />
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={taskPriority} onValueChange={(value) => setTaskPriority(value as TaskPriority)}>
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
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Finish period</Label>
                        <Select
                          value={finishPeriod}
                          onValueChange={(value) =>
                            setFinishPeriod(value as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="All day" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={FINISH_PERIOD_NONE_VALUE}>All day</SelectItem>
                            <SelectItem value="AM">AM</SelectItem>
                            <SelectItem value="PM">PM</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Start date </Label>
                        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                          <Input
                            type="text"
                            placeholder="DD/MM/YYYY"
                            value={startDateDisplay}
                            onChange={(e) => {
                              const value = e.target.value
                              setStartDateDisplay(value)
                              const isoDate = fromDDMMYYYY(value)
                              if (isoDate) {
                                setStartDate(isoDate)
                              }
                            }}
                            pattern="\d{2}/\d{2}/\d{4}"
                            style={{ paddingRight: "35px" }}
                          />
                          <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => {
                              const value = e.target.value
                              if (value) {
                                setStartDate(value)
                                setStartDateDisplay(toDDMMYYYY(value))
                              }
                            }}
                            style={{
                              position: "absolute",
                              right: "8px",
                              opacity: 0,
                              width: "24px",
                              height: "24px",
                              cursor: "pointer",
                              zIndex: 1
                            }}
                            title="Open calendar"
                          />
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                              position: "absolute",
                              right: "10px",
                              pointerEvents: "none",
                              color: "#666"
                            }}
                          >
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                          </svg>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Due date (optional) </Label>
                        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                          <Input
                            type="text"
                            placeholder="DD/MM/YYYY"
                            value={dueDateDisplay}
                            onChange={(e) => {
                              const value = e.target.value
                              setDueDateDisplay(value)
                              const isoDate = fromDDMMYYYY(value)
                              if (isoDate) {
                                setDueDate(isoDate)
                              }
                            }}
                            pattern="\d{2}/\d{2}/\d{4}"
                            style={{ paddingRight: "35px" }}
                          />
                          <Input
                            type="date"
                            value={dueDate}
                            onChange={(e) => {
                              const value = e.target.value
                              if (value) {
                                setDueDate(value)
                                setDueDateDisplay(toDDMMYYYY(value))
                              } else {
                                setDueDate("")
                                setDueDateDisplay("")
                              }
                            }}
                            style={{
                              position: "absolute",
                              right: "8px",
                              opacity: 0,
                              width: "24px",
                              height: "24px",
                              cursor: "pointer",
                              zIndex: 1
                            }}
                            title="Open calendar"
                          />
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                              position: "absolute",
                              right: "10px",
                              pointerEvents: "none",
                              color: "#666"
                            }}
                          >
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                          </svg>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setCreateOpen(false)}>
                        Cancel
                      </Button>
                      <Button disabled={creating || !title.trim()} onClick={() => void submitTask()}>
                        {creating ? "Saving..." : "Save task"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {loadingTasks ? (
                <div className="text-sm text-muted-foreground">Loading tasks...</div>
              ) : sortedTasks.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">
                          NO.
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Task Title
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Priority
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Due Date
                        </th>
                        {isAdmin ? (
                          <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">
                            Actions
                          </th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedTasks.map((task, index) => {
                        const department = task.department_id ? departmentMap.get(task.department_id) : null
                        const assignee = task.assigned_to ? userMap.get(task.assigned_to) : null
                        return (
                          <tr
                            key={task.id}
                            className="hover:bg-slate-50 transition-colors"
                          >
                            <td className="py-3 px-4">
                              <span className="text-sm text-slate-700">{index + 1}</span>
                            </td>
                            <td className="py-3 px-4">
                              <Link
                                href={`/tasks/${task.id}`}
                                className="font-semibold text-slate-900 hover:text-blue-600"
                              >
                                {task.title}
                              </Link>
                            </td>
                            <td className="py-3 px-4">
                              {task.status ? (
                                <Badge variant="secondary" className="uppercase">
                                  {task.status}
                                </Badge>
                              ) : (
                                <span className="text-sm text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {getDisplayPriority(task) ? (
                                <Badge variant="outline" className="border-slate-200 text-slate-700">
                                  {getDisplayPriority(task)}
                                </Badge>
                              ) : (
                                <span className="text-sm text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-sm text-slate-700">{formatDate(task.due_date)}</span>
                            </td>
                            {isAdmin ? (
                              <td className="py-3 px-4">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                    onClick={() => startEditTask(task)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50"
                                    disabled={deletingTaskId === task.id}
                                    onClick={() => void deleteTask(task.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            ) : null}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No tasks found.</div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Edit Task Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <BoldOnlyEditor value={editDescription} onChange={setEditDescription} />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={editPriority} onValueChange={(value) => setEditPriority(value as TaskPriority)}>
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
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Finish period</Label>
                <Select
                  value={editFinishPeriod}
                  onValueChange={(value) =>
                    setEditFinishPeriod(value as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All day" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FINISH_PERIOD_NONE_VALUE}>All day</SelectItem>
                    <SelectItem value="AM">AM</SelectItem>
                    <SelectItem value="PM">PM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Start date (DD/MM/YYYY)</Label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <Input
                    type="text"
                    placeholder="DD/MM/YYYY"
                    value={editStartDateDisplay}
                    onChange={(e) => {
                      const value = e.target.value
                      setEditStartDateDisplay(value)
                      const isoDate = fromDDMMYYYY(value)
                      if (isoDate) {
                        setEditStartDate(isoDate)
                      }
                    }}
                    pattern="\d{2}/\d{2}/\d{4}"
                    style={{ paddingRight: "35px" }}
                  />
                  <Input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => {
                      const value = e.target.value
                      if (value) {
                        setEditStartDate(value)
                        setEditStartDateDisplay(toDDMMYYYY(value))
                      } else {
                        setEditStartDate("")
                        setEditStartDateDisplay("")
                      }
                    }}
                    style={{
                      position: "absolute",
                      right: "8px",
                      opacity: 0,
                      width: "24px",
                      height: "24px",
                      cursor: "pointer",
                      zIndex: 1
                    }}
                    title="Open calendar"
                  />
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      position: "absolute",
                      right: "10px",
                      pointerEvents: "none",
                      color: "#666"
                    }}
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Due date (optional) (DD/MM/YYYY)</Label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <Input
                    type="text"
                    placeholder="DD/MM/YYYY"
                    value={editDueDateDisplay}
                    onChange={(e) => {
                      const value = e.target.value
                      setEditDueDateDisplay(value)
                      const isoDate = fromDDMMYYYY(value)
                      if (isoDate) {
                        setEditDueDate(isoDate)
                      } else if (!value) {
                        setEditDueDate("")
                      }
                    }}
                    pattern="\d{2}/\d{2}/\d{4}"
                    style={{ paddingRight: "35px" }}
                  />
                  <Input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => {
                      const value = e.target.value
                      if (value) {
                        setEditDueDate(value)
                        setEditDueDateDisplay(toDDMMYYYY(value))
                      } else {
                        setEditDueDate("")
                        setEditDueDateDisplay("")
                      }
                    }}
                    style={{
                      position: "absolute",
                      right: "8px",
                      opacity: 0,
                      width: "24px",
                      height: "24px",
                      cursor: "pointer",
                      zIndex: 1
                    }}
                    title="Open calendar"
                  />
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      position: "absolute",
                      right: "10px",
                      pointerEvents: "none",
                      color: "#666"
                    }}
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button disabled={savingEdit || !editTitle.trim()} onClick={() => void saveEditTask()}>
                {savingEdit ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {viewFilter !== "tasks" ? (
        <div className="print:hidden">
          <SystemTasksView
            scopeFilter="GA"
            headingTitle="Admin System Tasks"
            headingDescription="System tasks scoped for Kosove and Gane admins."
            showSystemActions={false}
            showFilters={false}
            allowMarkAsDone={true}
            assigneeRoleFilter={["ADMIN"]}
            assigneeUsernamesFilter={["gane.arifaj"]}
            externalPriorityFilter={priorityFilter}
            externalDayFilter={dayFilter}
            externalDateFilter={dateFilter}
          />
        </div>
      ) : null}
      <div className="hidden print:block print:!p-0 print:!m-0">
        <div className="print-page">
          <div className="print-header">
            <span />
            <div className="print-title">Daily Report</div>
            <div className="print-datetime">
              {printedAt.toLocaleString("en-US", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
          <table className="w-full border border-slate-900 text-[11px] daily-report-table print:table-fixed">
            <colgroup>
              <col className="w-[36px]" />
              <col className="w-[44px]" />
              <col className="w-[30px]" />
              <col className="w-[36px]" />
              <col className="w-[48px]" />
              <col className="w-[150px]" />
              <col className="w-[60px]" />
              <col className="w-[30px]" />
              <col className="w-[52px]" />
              <col className="w-[36px]" />
              <col className="w-[140px]" />
              <col className="w-[70px]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase whitespace-normal print-nr-cell">
                  Nr
                </th>
                <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">LL</th>
                <th className="border border-slate-900 px-2 py-2 pr-3 text-left text-xs uppercase whitespace-normal">
                  NLL
                </th>
                <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase whitespace-normal">
                  <span className="block">AM/</span>
                  <span className="block">PM</span>
                </th>
                <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">DEP</th>
                <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">Titulli</th>
                <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">STS</th>
                <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">BZ</th>
                <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase whitespace-normal">KOHA BZ</th>
                <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase whitespace-normal break-words">
                  T/Y/O
                </th>
                <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">Koment</th>
                <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">User</th>
              </tr>
            </thead>
            <tbody>
              {dailyUserReportRows.length ? (
                dailyUserReportRows.map((row, index) => (
                  <tr key={`${row.typeLabel}-${row.title}-${index}`}>
                    <td className="border border-slate-900 px-2 py-2 align-top print-nr-cell">{index + 1}</td>
                    <td className="border border-slate-900 px-2 py-2 align-top font-semibold">{row.typeLabel}</td>
                    <td className="border border-slate-900 px-2 py-2 align-top whitespace-normal break-words">
                      {row.subtype}
                    </td>
                    <td className="border border-slate-900 px-2 py-2 align-top whitespace-normal break-words">
                      {row.period}
                    </td>
                    <td className="border border-slate-900 px-2 py-2 align-top">{row.department}</td>
                    <td className="border border-slate-900 px-2 py-2 align-top uppercase">{row.title}</td>
                    <td className="border border-slate-900 px-2 py-2 align-top uppercase">
                      {(row.status || "-").toString().toUpperCase()}
                    </td>
                    <td className="border border-slate-900 px-2 py-2 align-top">{row.bz}</td>
                    <td className="border border-slate-900 px-2 py-2 align-top">{row.kohaBz}</td>
                    <td className="border border-slate-900 px-2 py-2 align-top whitespace-normal break-words">
                      {row.tyo}
                    </td>
                    <td className="border border-slate-900 px-2 py-2 align-top">
                      <div className="h-4 w-full border-b border-slate-400" />
                    </td>
                    <td className="border border-slate-900 px-2 py-2 align-top uppercase">
                      {row.userInitials || "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="border border-slate-900 px-2 py-4 text-center italic text-slate-600" colSpan={12}>
                    No data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="print-footer">
            <span />
            <span className="print-page-count">1/1</span>
            <div className="print-initials">PUNOI: {printInitials || "—"}</div>
          </div>
        </div>
      </div>
      <style jsx global>{`
        .daily-report-table th,
        .daily-report-table td {
          vertical-align: bottom;
          padding-bottom: 0;
          padding-top: 15px;
        }
        .daily-report-table {
          border-collapse: collapse !important;
          border-spacing: 0 !important;
        }
        .daily-report-table thead {
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .daily-report-table thead th {
          border-width: 2px !important;
          border-color: #475569 !important;
          background-color: #f8fafc !important;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        .daily-report-table thead th:first-child {
          border-left: 3px solid #475569 !important;
          position: sticky;
          left: 0;
          z-index: 30;
          box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1);
        }
        .daily-report-table thead th:last-child {
          border-right: 3px solid #475569 !important;
        }
        .daily-report-table thead tr {
          border-top: 3px solid #475569 !important;
          border-bottom: 3px solid #475569 !important;
          border-left: 2px solid #475569 !important;
          border-right: 2px solid #475569 !important;
        }
        @media print {
          * {
            box-sizing: border-box;
          }
          html, body {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            background: white;
          }
          aside, header, nav {
            display: none !important;
          }
          @page {
            margin: 0.25in 0.1in 0.35in 0.1in;
            size: landscape;
          }
          .print-page {
            position: relative;
            padding: 0.1in !important;
            margin: 0 !important;
            min-height: 0 !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
          }
          .print-header {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            margin-top: 0.15in;
            margin-bottom: 0.2in;
          }
          .print-title {
            font-size: 16px;
            font-weight: 700;
            text-transform: uppercase;
            text-align: center;
            color: #0f172a;
          }
          .print-datetime {
            text-align: right;
            font-size: 10px;
            color: #334155;
          }
          .print-footer {
            position: fixed;
            bottom: 0.1in;
            left: 0;
            right: 0;
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            padding-left: 0.2in;
            padding-right: 0.2in;
            font-size: 10px;
            color: #334155;
          }
          .print-page-count {
            text-align: center;
          }
          .print-initials {
            text-align: right;
          }
          .daily-report-table thead {
            display: table-header-group;
          }
          .daily-report-table th,
          .daily-report-table td {
            vertical-align: bottom !important;
            border: 1px solid #0f172a !important;
          }
          .daily-report-table {
            table-layout: fixed;
            border-width: 2px;
            border-color: #0f172a;
            border-collapse: collapse !important;
            border-spacing: 0 !important;
          }
          .daily-report-table thead th {
            border: 2px solid #0f172a !important;
            background-color: #f1f5f9 !important;
            box-shadow: none !important;
            position: static !important;
            border-left: 2px solid #0f172a !important;
            border-right: 2px solid #0f172a !important;
          }
          .daily-report-table thead tr {
            border-top: 3px solid #0f172a !important;
            border-bottom: 3px solid #0f172a !important;
          }
          .print-nr-cell {
            font-weight: 700;
          }
        }
      `}</style>
    </div>
  )
}
