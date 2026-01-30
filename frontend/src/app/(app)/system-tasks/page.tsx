
"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BoldOnlyEditor } from "@/components/bold-only-editor"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { formatDepartmentName } from "@/lib/department-name"
import { toast } from "sonner"
import type {
  Department,
  SystemTaskFrequency,
  SystemTaskScope,
  SystemTaskTemplate,
  TaskFinishPeriod,
  TaskPriority,
  User,
  UserLookup,
} from "@/lib/types"

// --- Constants & Types ---

const EMPTY_VALUE = "__none__"
const ALL_DEPARTMENTS_VALUE = "__all_departments__"
const GA_DEPARTMENTS_VALUE = "__ga__"
const FIRST_WORKING_DAY_VALUE = "__first_working_day__"
const END_OF_MONTH_VALUE = "__end_of_month__"

const FREQUENCY_OPTIONS = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "3_MONTHS", label: "Every 3 months" },
  { value: "6_MONTHS", label: "Every 6 months" },
  { value: "YEARLY", label: "Yearly" },
] as const

const FREQUENCY_VALUES = FREQUENCY_OPTIONS.map((option) => option.value)
const COMBINED_FREQUENCIES: SystemTaskFrequency[] = ["3_MONTHS", "6_MONTHS"]

const FREQUENCY_CHIPS = [
  { id: "all", label: "All" },
  { id: "DAILY", label: "Daily" },
  { id: "WEEKLY", label: "Weekly" },
  { id: "MONTHLY", label: "Monthly" },
  { id: "3_6_MONTHS", label: "Every 3/6 months" },
  { id: "YEARLY", label: "Yearly" },
]

const PRIORITY_OPTIONS: TaskPriority[] = ["NORMAL", "HIGH"]

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  NORMAL: "Normal",
  HIGH: "High",
}

const PRIORITY_BADGE_STYLES: Record<TaskPriority, string> = {
  NORMAL: "border-[#FDBA74] bg-[#FFEDD5] text-[#9A3412]",
  HIGH: "border-[#FCA5A5] bg-[#FEE2E2] text-[#B91C1C]",
}

// Restored specific left-border colors
const PRIORITY_BORDER_STYLES: Record<TaskPriority, string> = {
  NORMAL: "border-l-[#F97316]", // Specific Orange
  HIGH: "border-l-[#EF4444]",   // Specific Red
}

const PRIORITY_SORT_ORDER: Record<TaskPriority, number> = {
  HIGH: 0,
  NORMAL: 1,
}

const FINISH_PERIOD_OPTIONS: TaskFinishPeriod[] = ["AM", "PM"]
const FINISH_PERIOD_NONE_VALUE = EMPTY_VALUE
const FINISH_PERIOD_NONE_LABEL = "None (all day)"

const FINISH_PERIOD_LABELS: Record<TaskFinishPeriod, string> = {
  AM: "AM",
  PM: "PM",
}

function timeInputValue(value?: string | null) {
  if (!value) return ""
  const match = String(value).match(/^(\d{2}:\d{2})/)
  if (match) return match[1]
  return String(value).slice(0, 5)
}

function userDisplayLabel(
  user?: {
    full_name?: string | null
    username?: string | null
    email?: string | null
  } | null
) {
  if (!user) return ""
  return user.full_name || user.username || user.email || ""
}

function userInitials(label: string) {
  const trimmed = label.trim()
  if (!trimmed) return "--"
  const base = trimmed.includes("@") ? trimmed.split("@")[0] : trimmed
  const tokens = base.match(/[A-Za-z0-9]+/g) || []
  if (tokens.length === 0) return base.slice(0, 2).toUpperCase()
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase()
  const first = tokens[0]?.[0] ?? ""
  const last = tokens[tokens.length - 1]?.[0] ?? ""
  return `${first}${last}`.toUpperCase()
}

const INTERNAL_NOTE_FIELDS = [
  { key: "REGJ", label: "REGJ", placeholder: "0" },
  { key: "PATH", label: "PATH", placeholder: "S:\\03_HOMEFACE\\04_PLAN PRODUTION\\2023" },
  { key: "CHECK", label: "CHECKLISTA", placeholder: "S:\\03_HOMEFACE\\01_CHECKLISTA\\01_CHECKLISTA" },
  { key: "TRAINING", label: "TRAINING", placeholder: "Z:\\03_HOMEFACE\\04_PLAN PRODUCTION" },
  { key: "BZ GROUP", label: "BZ GROUP", placeholder: "! BO PLAN PRODUCTION (PR 15:00 - H 10:00)" },
]

const INTERNAL_QA_FIELDS = [
  { key: "QA", label: "Question/Answer", placeholder: "" },
]

const WEEK_DAYS = [
  { value: "0", label: "Monday" },
  { value: "1", label: "Tuesday" },
  { value: "2", label: "Wednesday" },
  { value: "3", label: "Thursday" },
  { value: "4", label: "Friday" },
  { value: "5", label: "Saturday" },
  { value: "6", label: "Sunday" },
]
const WEEKDAY_OPTIONS = WEEK_DAYS.slice(0, 5)
const WEEKEND_OPTIONS = WEEK_DAYS.slice(5)

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, "0"),
  label: new Date(0, index).toLocaleString("en-US", { month: "long" }),
}))

const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, index) => ({
  value: String(index + 1),
  label: String(index + 1),
}))

// Define the grid layout once so header and body always match.
// Columns: Order, Title (Flex), Department, Owner, Frequency, Finish, Priority, Actions
// MODIFIED: Added Responsive Breakpoints (tighten columns on smaller screens, expand on XL)
const GRID_CLASS = "grid grid-cols-[32px_minmax(200px,1fr)_120px_120px_100px_56px_80px_70px] xl:grid-cols-[36px_1fr_150px_150px_120px_64px_100px_80px] gap-2 xl:gap-4 items-center px-4"

type Section = {
  id: string
  label: string
  date: Date
  templates: SystemTaskTemplate[]
}

// --- Helpers ---

function resolveScope(value: string): SystemTaskScope {
  if (value === GA_DEPARTMENTS_VALUE) return "GA"
  if (value === ALL_DEPARTMENTS_VALUE) return "ALL"
  return "DEPARTMENT"
}

function resolveDepartmentId(value: string): string | null {
  return resolveScope(value) === "DEPARTMENT" ? value : null
}

function isGlobalScopeValue(value: string) {
  return value === ALL_DEPARTMENTS_VALUE || value === GA_DEPARTMENTS_VALUE
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (inQuotes) {
      if (char === "\"") {
        const next = text[i + 1]
        if (next === "\"") {
          field += "\""
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === "\"") {
      inQuotes = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n") {
      row.push(field)
      if (row.some((cell) => cell.trim().length)) rows.push(row)
      row = []
      field = ""
    } else if (char !== "\r") {
      field += char
    }
  }

  row.push(field)
  if (row.some((cell) => cell.trim().length)) rows.push(row)
  return rows
}

function csvEscape(value: unknown): string {
  const str = String(value ?? "")
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, "\"\"")}"` : str
}

function normalizePriority(value?: TaskPriority | string | null): TaskPriority {
  const normalized = typeof value === "string" ? value.toUpperCase() : null
  if (normalized === "URGENT") return "HIGH"
  if (normalized === "LOW" || normalized === "MEDIUM") return "NORMAL"
  if (normalized === "NORMAL" || normalized === "HIGH") return normalized
  return "NORMAL"
}

function getMondayBasedDay(date: Date) {
  return (date.getDay() + 6) % 7
}

function getFirstWorkingDayOfMonth(year: number, monthIndex: number) {
  for (let day = 1; day <= 7; day += 1) {
    const date = new Date(year, monthIndex, day)
    const dayOfWeek = getMondayBasedDay(date)
    if (dayOfWeek <= 4) return day
  }
  return 1
}

function matchesTemplateDayOfWeek(template: SystemTaskTemplate, targetDay: number) {
  if (template.days_of_week && template.days_of_week.length) {
    return template.days_of_week.includes(targetDay)
  }
  if (template.day_of_week != null) return template.day_of_week === targetDay
  return false
}

function matchesTemplateDate(template: SystemTaskTemplate, date: Date) {
  const dayOfWeek = getMondayBasedDay(date)
  const dayOfMonth = date.getDate()
  const monthIndex = date.getMonth()
  const year = date.getFullYear()
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()

  if (template.frequency === "DAILY") return true
  if (template.frequency === "WEEKLY") {
    return matchesTemplateDayOfWeek(template, dayOfWeek)
  }

  const templateDay = template.day_of_month
  const resolvedDay =
    templateDay == null
      ? null
      : templateDay === 0
        ? lastDay
        : templateDay === -1
          ? getFirstWorkingDayOfMonth(year, monthIndex)
          : templateDay

  if (template.frequency === "MONTHLY" || template.frequency === "3_MONTHS" || template.frequency === "6_MONTHS") {
    return resolvedDay == null ? true : resolvedDay === dayOfMonth
  }

  if (template.frequency === "YEARLY") {
    const matchesMonth =
      template.month_of_year == null ? true : template.month_of_year === monthIndex + 1
    const matchesDay = resolvedDay == null ? true : resolvedDay === dayOfMonth
    return matchesMonth && matchesDay
  }

  return true
}

function parseInternalNotes(value?: string | null): Record<string, string> {
  const result: Record<string, string> = {}
  if (!value) return result
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  for (const line of lines) {
    const idx = line.indexOf(":")
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const rest = line.slice(idx + 1).trim()
    if (!key) continue
    const normalizedKey = key.toLowerCase().replace(/\s+/g, "")
    if (normalizedKey === "qa" || normalizedKey === "question/answer" || normalizedKey === "questionanswer") {
      result.QA = rest
      continue
    }
    if (normalizedKey === "q1" || normalizedKey === "q2" || normalizedKey === "q3" || normalizedKey === "q4" || normalizedKey === "q5") {
      const existing = result.QA ? `${result.QA}\n${rest}` : rest
      result.QA = existing
      continue
    }
    result[key] = rest
  }
  return result
}

function resolveTemplateScope(template: SystemTaskTemplate): SystemTaskScope {
  if (template.scope) return template.scope
  return template.department_id ? "DEPARTMENT" : "ALL"
}

type SystemTasksViewProps = {
  scopeFilter?: SystemTaskScope
  headingTitle?: string
  headingDescription?: string
  showSystemActions?: boolean
  showFilters?: boolean
  allowMarkAsDone?: boolean
  externalPriorityFilter?: TaskPriority | "all"
  externalDayFilter?: string | "all"
  externalDateFilter?: string | null
}

export function SystemTasksView({
  scopeFilter,
  headingTitle,
  headingDescription,
  showSystemActions = true,
  showFilters = true,
  allowMarkAsDone = false,
  externalPriorityFilter = "all",
  externalDayFilter = "all",
  externalDateFilter = null,
}: SystemTasksViewProps) {
  const { apiFetch, user } = useAuth()
  type AssigneeUser = User | UserLookup
  const [templates, setTemplates] = React.useState<SystemTaskTemplate[]>([])
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [users, setUsers] = React.useState<AssigneeUser[]>([])
  const [loading, setLoading] = React.useState(true)
  const [updatingTaskIds, setUpdatingTaskIds] = React.useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [editSaving, setEditSaving] = React.useState(false)
  const [frequencyFilters, setFrequencyFilters] = React.useState<SystemTaskFrequency[]>([])
  const [frequencyMultiSelect, setFrequencyMultiSelect] = React.useState(false)
  const [priorityFilters, setPriorityFilters] = React.useState<TaskPriority[]>([])
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const searchInputRef = React.useRef<HTMLInputElement | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [printing, setPrinting] = React.useState(false)
  const [exportingExcel, setExportingExcel] = React.useState(false)

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [departmentId, setDepartmentId] = React.useState(
    scopeFilter === "GA" ? GA_DEPARTMENTS_VALUE : ""
  )
  const [assigneeIds, setAssigneeIds] = React.useState<string[]>([])
  const [assigneeQuery, setAssigneeQuery] = React.useState("")
  const [assigneeError, setAssigneeError] = React.useState<string | null>(null)
  const [assigneeOpen, setAssigneeOpen] = React.useState(false)
  const [frequency, setFrequency] = React.useState<SystemTaskFrequency>("DAILY")
  const [priority, setPriority] = React.useState<TaskPriority>("NORMAL")
  const [finishPeriod, setFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(
    FINISH_PERIOD_NONE_VALUE
  )
  const [internalNotes, setInternalNotes] = React.useState<Record<string, string>>({})
  const [daysOfWeek, setDaysOfWeek] = React.useState<string[]>([])
  const [dayOfMonth, setDayOfMonth] = React.useState("")
  const [monthOfYear, setMonthOfYear] = React.useState(EMPTY_VALUE)
  const [isActive, setIsActive] = React.useState(true)
  const [requiresAlignment, setRequiresAlignment] = React.useState(false)
  const [alignmentTime, setAlignmentTime] = React.useState("")
  const [alignmentManagerIds, setAlignmentManagerIds] = React.useState<string[]>([])
  const [showWeekendDays, setShowWeekendDays] = React.useState(false)
  const [editTemplate, setEditTemplate] = React.useState<SystemTaskTemplate | null>(null)
  const [editTitle, setEditTitle] = React.useState("")
  const [editDescription, setEditDescription] = React.useState("")
  const [editDepartmentId, setEditDepartmentId] = React.useState("")
  const [editAssigneeIds, setEditAssigneeIds] = React.useState<string[]>([])
  const [editAssigneeQuery, setEditAssigneeQuery] = React.useState("")
  const [editAssigneeError, setEditAssigneeError] = React.useState<string | null>(null)
  const [editAssigneeOpen, setEditAssigneeOpen] = React.useState(false)
  const [editFrequency, setEditFrequency] = React.useState<SystemTaskFrequency>("DAILY")
  const [editPriority, setEditPriority] = React.useState<TaskPriority>("NORMAL")
  const [editFinishPeriod, setEditFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(
    FINISH_PERIOD_NONE_VALUE
  )
  const [editInternalNotes, setEditInternalNotes] = React.useState<Record<string, string>>({})
  const [editDaysOfWeek, setEditDaysOfWeek] = React.useState<string[]>([])
  const [editDayOfMonth, setEditDayOfMonth] = React.useState("")
  const [editMonthOfYear, setEditMonthOfYear] = React.useState(EMPTY_VALUE)
  const [editIsActive, setEditIsActive] = React.useState(true)
  const [editRequiresAlignment, setEditRequiresAlignment] = React.useState(false)
  const [editAlignmentTime, setEditAlignmentTime] = React.useState("")
  const [editAlignmentManagerIds, setEditAlignmentManagerIds] = React.useState<string[]>([])
  const [editShowWeekendDays, setEditShowWeekendDays] = React.useState(false)

  const isManagerOrAdmin = user?.role === "ADMIN" || user?.role === "MANAGER"
  const canCreate = showSystemActions

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [templatesRes, departmentsRes, templateMetaRes] = await Promise.all([
        apiFetch("/system-tasks"),
        apiFetch("/departments"),
        apiFetch("/system-tasks/templates"),
      ])
      if (templatesRes.ok) {
        const rows = (await templatesRes.json()) as SystemTaskTemplate[]
        let metaById = new Map<
          string,
          {
            requires_alignment?: boolean | null
            alignment_time?: string | null
            alignment_roles?: string[] | null
            alignment_user_ids?: string[] | null
          }
        >()
        if (templateMetaRes.ok) {
          const metas = (await templateMetaRes.json()) as Array<{
            id: string
            requires_alignment?: boolean | null
            alignment_time?: string | null
            alignment_roles?: string[] | null
            alignment_user_ids?: string[] | null
          }>
          metaById = new Map(
            metas.map((m) => [
              m.id,
              {
                requires_alignment: m.requires_alignment ?? false,
                alignment_time: m.alignment_time ?? null,
                alignment_roles: m.alignment_roles ?? null,
                alignment_user_ids: m.alignment_user_ids ?? null,
              },
            ])
          )
        }
        setTemplates(
          rows.map((row) => {
            const templateId = row.template_id ?? row.id
            const meta = metaById.get(templateId)
            if (!meta) return row
            const merged = { ...row, ...meta }
            if (row.requires_alignment != null) merged.requires_alignment = row.requires_alignment
            if (row.alignment_time != null) merged.alignment_time = row.alignment_time
            if (row.alignment_roles && row.alignment_roles.length) {
              merged.alignment_roles = row.alignment_roles
            }
            if (row.alignment_user_ids && row.alignment_user_ids.length) {
              merged.alignment_user_ids = row.alignment_user_ids
            }
            return merged
          })
        )
      } else {
        console.error("Failed to load system tasks", templatesRes.status)
      }
      if (departmentsRes.ok) {
        setDepartments((await departmentsRes.json()) as Department[])
      } else {
        console.error("Failed to load departments", departmentsRes.status)
      }
      const usersRes = await apiFetch(isManagerOrAdmin ? "/users" : "/users/lookup")
      if (usersRes.ok) {
        setUsers((await usersRes.json()) as AssigneeUser[])
      } else {
        console.error("Failed to load users", usersRes.status)
      }
    } finally {
      setLoading(false)
    }
  }, [apiFetch, isManagerOrAdmin])

  React.useEffect(() => {
    void load()
  }, [load])

  const toggleTaskStatus = React.useCallback(async (template: SystemTaskTemplate) => {
    if (!template.id) return
    const taskId = template.id
    const currentStatus = template.status || "TODO"
    const newStatus = currentStatus === "DONE" ? "TODO" : "DONE"
    
    setUpdatingTaskIds((prev) => new Set(prev).add(taskId))
    try {
      const res = await apiFetch(`/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        let detail = "Failed to update task status"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      // Update the template status in local state
      setTemplates((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      )
      toast.success(`Task marked as ${newStatus}`)
    } catch (error) {
      toast.error("Failed to update task status")
    } finally {
      setUpdatingTaskIds((prev) => {
        const next = new Set(prev)
        next.delete(taskId)
        return next
      })
    }
  }, [apiFetch])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  React.useEffect(() => {
    if (departments.length === 0) return
    if (!departmentId) {
      setDepartmentId(scopeFilter === "GA" ? GA_DEPARTMENTS_VALUE : ALL_DEPARTMENTS_VALUE)
    }
  }, [departments, departmentId, scopeFilter, user?.department_id])


  React.useEffect(() => {
    if (!editTemplate) return
    setEditTitle(editTemplate.title || "")
    setEditDescription(editTemplate.description || "")
    const editDeptValue =
      editTemplate.scope === "GA"
        ? GA_DEPARTMENTS_VALUE
        : editTemplate.scope === "ALL"
          ? ALL_DEPARTMENTS_VALUE
          : editTemplate.department_id ?? ALL_DEPARTMENTS_VALUE
    setEditDepartmentId(editDeptValue)
    const editIds =
      editTemplate.assignees?.map((assignee) => assignee.id) ??
      (editTemplate.default_assignee_id ? [editTemplate.default_assignee_id] : [])
    setEditAssigneeIds(editIds)
    setEditFrequency(editTemplate.frequency)
    setEditPriority(normalizePriority(editTemplate.priority))
    setEditFinishPeriod(editTemplate.finish_period ?? FINISH_PERIOD_NONE_VALUE)
    setEditInternalNotes(parseInternalNotes(editTemplate.internal_notes))
    const editDays =
      editTemplate.days_of_week && editTemplate.days_of_week.length
        ? editTemplate.days_of_week
        : editTemplate.day_of_week != null
          ? [editTemplate.day_of_week]
          : []
    setEditDaysOfWeek(editDays.map((value) => String(value)))
    setEditDayOfMonth(
      editTemplate.day_of_month === 0
        ? END_OF_MONTH_VALUE
        : editTemplate.day_of_month === -1
          ? FIRST_WORKING_DAY_VALUE
          : editTemplate.day_of_month != null
            ? String(editTemplate.day_of_month)
            : ""
    )
    setEditMonthOfYear(
      editTemplate.month_of_year != null
        ? String(editTemplate.month_of_year).padStart(2, "0")
        : EMPTY_VALUE
    )
    setEditIsActive(editTemplate.is_active)
    setEditRequiresAlignment(Boolean(editTemplate.requires_alignment))
    setEditAlignmentTime(timeInputValue(editTemplate.alignment_time))
    setEditAlignmentManagerIds(editTemplate.alignment_user_ids ?? [])
    setEditAssigneeQuery("")
    setEditAssigneeError(null)
  }, [editTemplate])

  const departmentMap = React.useMemo(() => {
    return new Map(departments.map((dept) => [dept.id, dept]))
  }, [departments])

  const userMap = React.useMemo(() => {
    return new Map(users.map((u) => [u.id, u]))
  }, [users])

  const departmentNamesForOwnerIds = React.useCallback(
    (ownerIds: string[]) => {
      const ids = new Set<string>()
      for (const ownerId of ownerIds) {
        const deptId = userMap.get(ownerId)?.department_id
        if (deptId) ids.add(deptId)
      }
      return Array.from(ids)
        .map((id) => departmentMap.get(id)?.name)
        .filter((name): name is string => Boolean(name))
    },
    [departmentMap, userMap]
  )

  const departmentNamesForAssignees = React.useCallback(
    (assignees?: SystemTaskTemplate["assignees"]) => {
      if (!assignees || assignees.length === 0) return []
      return departmentNamesForOwnerIds(assignees.map((assignee) => assignee.id))
    },
    [departmentNamesForOwnerIds]
  )

  const formatDepartmentNames = React.useCallback((names: string[]) => {
    if (!names.length) return "All departments"
    const formatted = names.map((name) => formatDepartmentName(name))
    if (formatted.length === 1) return formatted[0]
    if (formatted.length === 2) return `${formatted[0]}, ${formatted[1]}`
    return `${formatted[0]}, ${formatted[1]} +${formatted.length - 2}`
  }, [])

  const ownerDepartmentId = React.useCallback(
    (ownerId: string) => userMap.get(ownerId)?.department_id ?? null,
    [userMap]
  )

  const isAssigneeAllowedForDepartment = React.useCallback(
    (deptId: string, ownerId: string) => {
      if (!deptId || isGlobalScopeValue(deptId)) return true
      const ownerDept = ownerDepartmentId(ownerId)
      if (!ownerDept) return true
      return ownerDept === deptId
    },
    [ownerDepartmentId]
  )

  const validateOwners = React.useCallback(
    (deptId: string, ownerIds: string[]) => {
      if (!ownerIds.length) return { ok: true }
      if (!deptId || isGlobalScopeValue(deptId)) return { ok: true }
      const allMatch = ownerIds.every((id) => isAssigneeAllowedForDepartment(deptId, id))
      if (!allMatch) {
        return {
          ok: false,
          message: "Owners duhet me qene prej te njejtit departament. Ndrysho departamentin ose hiq ownerin.",
        }
      }
      return { ok: true }
    },
    [isAssigneeAllowedForDepartment]
  )

  const handleDepartmentChange = (nextDeptId: string) => {
    setDepartmentId(nextDeptId)
    if (isGlobalScopeValue(nextDeptId)) {
      setAssigneeIds([])
      setAssigneeError(null)
      return
    }
    setAssigneeIds((prev) => prev.filter((id) => isAssigneeAllowedForDepartment(nextDeptId, id)))
    setAssigneeError(null)
  }

  const handleEditDepartmentChange = (nextDeptId: string) => {
    setEditDepartmentId(nextDeptId)
    if (isGlobalScopeValue(nextDeptId)) {
      setEditAssigneeIds([])
      setEditAssigneeError(null)
      return
    }
    setEditAssigneeIds((prev) => prev.filter((id) => isAssigneeAllowedForDepartment(nextDeptId, id)))
    setEditAssigneeError(null)
  }

  const handleAssigneesChange = (nextOwnerIds: string[]) => {
    if (!nextOwnerIds.length) {
      setAssigneeIds([])
      setAssigneeError(null)
      return
    }
    if (isGlobalScopeValue(departmentId)) {
      for (const id of nextOwnerIds) {
        const assigneeDeptId = ownerDepartmentId(id)
        if (assigneeDeptId) {
          setDepartmentId(assigneeDeptId)
          break
        }
      }
    } else {
      const allMatch = nextOwnerIds.every((id) => isAssigneeAllowedForDepartment(departmentId, id))
      if (!allMatch) {
        setAssigneeError("Owners duhet me qene prej te njejtit departament. Ndrysho departamentin ose hiq ownerin.")
        return
      }
    }
    setAssigneeIds(nextOwnerIds)
    setAssigneeError(null)
  }

  const handleEditAssigneesChange = (nextOwnerIds: string[]) => {
    if (!nextOwnerIds.length) {
      setEditAssigneeIds([])
      setEditAssigneeError(null)
      return
    }
    if (isGlobalScopeValue(editDepartmentId)) {
      for (const id of nextOwnerIds) {
        const assigneeDeptId = ownerDepartmentId(id)
        if (assigneeDeptId) {
          setEditDepartmentId(assigneeDeptId)
          break
        }
      }
    } else {
      const allMatch = nextOwnerIds.every((id) => isAssigneeAllowedForDepartment(editDepartmentId, id))
      if (!allMatch) {
        setEditAssigneeError("Owners duhet me qene prej te njejtit departament. Ndrysho departamentin ose hiq ownerin.")
        return
      }
    }
    setEditAssigneeIds(nextOwnerIds)
    setEditAssigneeError(null)
  }

  const removeAssignee = (id: string) => {
    handleAssigneesChange(assigneeIds.filter((item) => item !== id))
  }

  const removeEditAssignee = (id: string) => {
    handleEditAssigneesChange(editAssigneeIds.filter((item) => item !== id))
  }

  const scopeTemplates = React.useMemo(() => {
    if (!scopeFilter) return templates
    return templates.filter((template) => resolveTemplateScope(template) === scopeFilter)
  }, [scopeFilter, templates])

  const frequencyCounts = React.useMemo(() => {
    const counts = new Map<SystemTaskFrequency, number>()
    for (const value of FREQUENCY_VALUES) {
      counts.set(value as SystemTaskFrequency, 0)
    }
    for (const template of scopeTemplates) {
      counts.set(template.frequency, (counts.get(template.frequency) || 0) + 1)
    }
    return counts
  }, [scopeTemplates])

  const priorityCounts = React.useMemo(() => {
    const counts = new Map<TaskPriority, number>()
    for (const value of PRIORITY_OPTIONS) {
      counts.set(value, 0)
    }
    for (const template of scopeTemplates) {
      const normalized = normalizePriority(template.priority)
      counts.set(normalized, (counts.get(normalized) || 0) + 1)
    }
    return counts
  }, [scopeTemplates])

  const filteredTemplates = React.useMemo(() => {
    let filtered = scopeTemplates
    const query = searchQuery.trim().toLowerCase()
    const dayFilterValue =
      externalDayFilter === "all" ? null : Number.isNaN(Number(externalDayFilter)) ? null : Number(externalDayFilter)
    const dateValue = externalDateFilter ? new Date(`${externalDateFilter}T00:00:00`) : null
    const hasValidDate = Boolean(dateValue && !Number.isNaN(dateValue.getTime()))

    if (externalPriorityFilter !== "all") {
      filtered = filtered.filter((template) => normalizePriority(template.priority) === externalPriorityFilter)
    }
    if (hasValidDate && dateValue) {
      filtered = filtered.filter((template) => matchesTemplateDate(template, dateValue))
    }
    if (dayFilterValue != null) {
      filtered = filtered.filter((template) => {
        if (template.frequency === "DAILY") return true
        if (matchesTemplateDayOfWeek(template, dayFilterValue)) return true
        return false
      })
    }
    if (query) {
      filtered = filtered.filter((template) => {
        const title = template.title?.toLowerCase() || ""
        const description = template.description?.toLowerCase() || ""
        return title.includes(query) || description.includes(query)
      })
    }
    if (frequencyFilters.length) {
      const allowed = new Set(frequencyFilters)
      filtered = filtered.filter((template) => allowed.has(template.frequency))
    }
    if (priorityFilters.length) {
      const allowed = new Set(priorityFilters)
      filtered = filtered.filter((template) => allowed.has(normalizePriority(template.priority)))
    }
    return filtered
  }, [
    externalDateFilter,
    externalDayFilter,
    externalPriorityFilter,
    frequencyFilters,
    priorityFilters,
    scopeTemplates,
    searchQuery,
  ])


  React.useEffect(() => {
    const combinedSelected =
      COMBINED_FREQUENCIES.every((value) => frequencyFilters.includes(value)) &&
      frequencyFilters.length >= COMBINED_FREQUENCIES.length
    if (!frequencyMultiSelect && frequencyFilters.length > 1 && !combinedSelected) {
      setFrequencyFilters([frequencyFilters[0]])
    }
  }, [frequencyFilters, frequencyMultiSelect])

  const sections = React.useMemo<Section[]>(() => {
    const frequencyOrder: Record<SystemTaskFrequency, number> = {
      DAILY: 0,
      WEEKLY: 1,
      MONTHLY: 2,
      "3_MONTHS": 3,
      "6_MONTHS": 4,
      YEARLY: 5,
    }
    const sorted = [...filteredTemplates].sort((a, b) => {
      const aInactive = !a.is_active
      const bInactive = !b.is_active
      if (aInactive !== bInactive) return aInactive ? 1 : -1
      const aFrequency = frequencyOrder[a.frequency]
      const bFrequency = frequencyOrder[b.frequency]
      if (aFrequency !== bFrequency) return aFrequency - bFrequency
      const aPriority = PRIORITY_SORT_ORDER[normalizePriority(a.priority)]
      const bPriority = PRIORITY_SORT_ORDER[normalizePriority(b.priority)]
      if (aPriority !== bPriority) return aPriority - bPriority
      const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0
      const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0
      if (aCreated !== bCreated) return bCreated - aCreated
      return a.title.localeCompare(b.title)
    })
    return [
      {
        id: "all-templates",
        label: "All System Tasks",
        date: new Date(),
        templates: sorted,
      },
    ]
  }, [filteredTemplates])

  const resetFilters = () => {
    setFrequencyFilters([])
    setFrequencyMultiSelect(false)
    setPriorityFilters([])
  }

  const toggleFrequencyFilter = (value: SystemTaskFrequency | "all" | "3_6_MONTHS") => {
    if (value === "all") {
      setFrequencyFilters([])
      return
    }
    if (value === "3_6_MONTHS") {
      setFrequencyFilters((prev) => {
        const hasCombined = COMBINED_FREQUENCIES.every((item) => prev.includes(item))
        const remaining = prev.filter((item) => !COMBINED_FREQUENCIES.includes(item))
        if (hasCombined) {
          return remaining
        }
        if (frequencyMultiSelect) {
          return [...remaining, ...COMBINED_FREQUENCIES]
        }
        return [...COMBINED_FREQUENCIES]
      })
      return
    }
    setFrequencyFilters((prev) => {
      if (prev.includes(value)) {
        return prev.filter((item) => item !== value)
      }
      if (frequencyMultiSelect) {
        return [...prev, value]
      }
      return [value]
    })
  }

  const submit = async () => {
    if (!departmentId) return
    const validation = validateOwners(departmentId, assigneeIds)
    if (!validation.ok) {
      setAssigneeError(
        validation.message || "Owners duhet me qene prej te njejtit departament. Ndrysho departamentin ose hiq ownerin."
      )
      return
    }
    const finalDeptId = departmentId
    const scope = resolveScope(finalDeptId)
    const weeklyDays = frequency === "WEEKLY" ? normalizeDayValues(daysOfWeek) : []
    if (requiresAlignment && !alignmentTime) {
      toast.error("BZ time is required when BZ is enabled.")
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        scope,
        department_id: resolveDepartmentId(finalDeptId),
        assignees: assigneeIds,
        frequency,
        priority,
        finish_period: finishPeriod === FINISH_PERIOD_NONE_VALUE ? null : finishPeriod,
        internal_notes: buildInternalNotes(internalNotes),
        requires_alignment: requiresAlignment,
        alignment_time: requiresAlignment ? alignmentTime : null,
        alignment_roles: requiresAlignment ? ["MANAGER"] : [],
        alignment_user_ids: requiresAlignment ? alignmentManagerIds : [],
        day_of_week: weeklyDays.length ? weeklyDays[0] : null,
        days_of_week: weeklyDays.length ? weeklyDays : null,
        day_of_month:
          dayOfMonth === END_OF_MONTH_VALUE
            ? 0
            : dayOfMonth === FIRST_WORKING_DAY_VALUE
              ? -1
              : dayOfMonth
                ? Number(dayOfMonth)
                : null,
        month_of_year:
          monthOfYear && monthOfYear !== EMPTY_VALUE ? Number(monthOfYear) : null,
        is_active: isActive,
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
        toast.error(typeof detail === "string" ? detail : "An error occurred")
        return
      }
      setCreateOpen(false)
      setTitle("")
      setDescription("")
      setAssigneeIds([])
      setAssigneeQuery("")
      setAssigneeError(null)
      setDaysOfWeek([])
      setDayOfMonth("")
      setMonthOfYear(EMPTY_VALUE)
      setFrequency("DAILY")
      setPriority("NORMAL")
      setFinishPeriod(FINISH_PERIOD_NONE_VALUE)
      setInternalNotes({})
      setIsActive(true)
      setRequiresAlignment(false)
      setAlignmentTime("")
      setAlignmentManagerIds([])
      await load()
      toast.success("System task created")
    } finally {
      setSaving(false)
    }
  }

  const togglePriorityFilter = (value: TaskPriority | "all") => {
    if (value === "all") {
      setPriorityFilters([])
      return
    }
    setPriorityFilters([value])
  }

  const canEditTemplate = React.useCallback(
    (template?: SystemTaskTemplate | null) => {
      if (!template) return false
      if (!showSystemActions || !user) return false
      if (isManagerOrAdmin) return true
      const creatorId = template.created_by
      const assigneeIds = new Set<string>()
      if (template.default_assignee_id) assigneeIds.add(template.default_assignee_id)
      if (template.assignees && template.assignees.length) {
        for (const person of template.assignees) {
          assigneeIds.add(person.id)
        }
      }
      if (creatorId && creatorId === user.id) return true
      return assigneeIds.has(user.id)
    },
    [isManagerOrAdmin, showSystemActions, user]
  )

  const startEdit = (template: SystemTaskTemplate) => {
    if (!canEditTemplate(template)) return
    setEditTemplate(template)
    setEditOpen(true)
  }

  const submitEdit = async () => {
    if (!editTemplate || !editTitle.trim()) return
    const validation = validateOwners(editDepartmentId, editAssigneeIds)
    if (!validation.ok) {
      setEditAssigneeError(
        validation.message || "Owners duhet me qene prej te njejtit departament. Ndrysho departamentin ose hiq ownerin."
      )
      return
    }
    const finalDeptId = editDepartmentId
    const scope = resolveScope(finalDeptId)
    const weeklyDays = editFrequency === "WEEKLY" ? normalizeDayValues(editDaysOfWeek) : []
    if (editRequiresAlignment && !editAlignmentTime) {
      toast.error("BZ time is required when BZ is enabled.")
      return
    }
    setEditSaving(true)
    try {
      const payload = {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        scope,
        department_id: resolveDepartmentId(finalDeptId),
        assignees: editAssigneeIds,
        frequency: editFrequency,
        priority: editPriority,
        finish_period: editFinishPeriod === FINISH_PERIOD_NONE_VALUE ? null : editFinishPeriod,
        internal_notes: buildInternalNotes(editInternalNotes),
        requires_alignment: editRequiresAlignment,
        alignment_time: editRequiresAlignment ? editAlignmentTime : null,
        alignment_roles: editRequiresAlignment ? ["MANAGER"] : [],
        alignment_user_ids: editRequiresAlignment ? editAlignmentManagerIds : [],
        day_of_week: weeklyDays.length ? weeklyDays[0] : null,
        days_of_week: weeklyDays.length ? weeklyDays : null,
        day_of_month:
          editDayOfMonth === END_OF_MONTH_VALUE
            ? 0
            : editDayOfMonth === FIRST_WORKING_DAY_VALUE
              ? -1
              : editDayOfMonth
                ? Number(editDayOfMonth)
                : null,
        month_of_year:
          editMonthOfYear && editMonthOfYear !== EMPTY_VALUE ? Number(editMonthOfYear) : null,
        is_active: editIsActive,
      }
      const templateId = editTemplate.template_id ?? editTemplate.id
      const res = await apiFetch(`/system-tasks/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail = "Failed to update system task"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(typeof detail === "string" ? detail : "An error occurred")
        return
      }
      const updated = (await res.json()) as SystemTaskTemplate
      setTemplates((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setEditOpen(false)
      setEditTemplate(null)
      setEditAssigneeError(null)
      await load()
    } finally {
      setEditSaving(false)
    }
  }

  const availableAssignees = React.useMemo(() => {
    if (!departmentId || isGlobalScopeValue(departmentId)) return users
    return users.filter((u) => u.department_id === departmentId || !u.department_id)
  }, [departmentId, users])
  const editAvailableAssignees = React.useMemo(() => {
    if (!editDepartmentId || isGlobalScopeValue(editDepartmentId)) return users
    return users.filter((u) => u.department_id === editDepartmentId || !u.department_id)
  }, [editDepartmentId, users])
  const filteredAssignees = React.useMemo(() => {
    const query = assigneeQuery.trim().toLowerCase()
    if (!query) return availableAssignees
    return availableAssignees.filter((person) => {
      const email = "email" in person ? person.email || "" : ""
      const name = `${person.full_name || ""} ${person.username || ""} ${email}`.toLowerCase()
      return name.includes(query)
    })
  }, [assigneeQuery, availableAssignees])
  const filteredEditAssignees = React.useMemo(() => {
    const query = editAssigneeQuery.trim().toLowerCase()
    const base = !query
      ? editAvailableAssignees
      : editAvailableAssignees.filter((person) => {
        const email = "email" in person ? person.email || "" : ""
        const name = `${person.full_name || ""} ${person.username || ""} ${email}`.toLowerCase()
        return name.includes(query)
      })
    return [...base].sort((a, b) => {
      const aSelected = editAssigneeIds.includes(a.id)
      const bSelected = editAssigneeIds.includes(b.id)
      if (aSelected !== bSelected) return aSelected ? -1 : 1
      const aEmail = "email" in a ? a.email || "" : ""
      const bEmail = "email" in b ? b.email || "" : ""
      const aName = (a.full_name || a.username || aEmail).toLowerCase()
      const bName = (b.full_name || b.username || bEmail).toLowerCase()
      return aName.localeCompare(bName)
    })
  }, [editAssigneeQuery, editAvailableAssignees, editAssigneeIds])
  const combinedSelected =
    COMBINED_FREQUENCIES.every((value) => frequencyFilters.includes(value)) &&
    frequencyFilters.length >= COMBINED_FREQUENCIES.length
  const allFrequenciesSelected = frequencyFilters.length === 0
  const allPrioritiesSelected = priorityFilters.length === 0
  const frequencyFilterActive = !allFrequenciesSelected
  const priorityFilterActive = !allPrioritiesSelected
  const filterTriggerClass =
    "h-8 rounded-full border border-slate-200 bg-slate-100 px-3 text-sm font-medium text-slate-700 hover:bg-slate-200"
  const filterTriggerActiveClass = "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
  const frequencyLabel = React.useMemo(() => {
    if (allFrequenciesSelected) return "All frequencies"
    const labels: string[] = []
    const remaining = frequencyFilters.filter((value) => !COMBINED_FREQUENCIES.includes(value))
    if (combinedSelected) labels.push("3/6 months")
    for (const value of remaining) {
      const option = FREQUENCY_OPTIONS.find((item) => item.value === value)
      if (option) labels.push(option.label)
    }
    if (labels.length > 2) return `${labels.length} selected`
    return labels.join(", ") || "Selected"
  }, [allFrequenciesSelected, combinedSelected, frequencyFilters])
  const priorityLabel = allPrioritiesSelected
    ? "All priorities"
    : PRIORITY_LABELS[priorityFilters[0] as TaskPriority] || "Priority"
  const assigneeDeptNames = departmentNamesForOwnerIds(assigneeIds)
  const editAssigneeDeptNames = departmentNamesForOwnerIds(editAssigneeIds)
  const weekendShiftHint =
    "If the selected day falls on Saturday/Sunday, the task runs on Friday."

  const assigneeSummary = (list?: SystemTaskTemplate["assignees"]) => {
    if (!list || list.length === 0) return "-"
    if (list.length <= 2) {
      return list
        .map((person) => person.full_name || person.username || person.email)
        .join(", ")
    }
    return `${list.length} people`
  }

  const setInternalNoteValue = (
    key: string,
    value: string,
    setter: React.Dispatch<React.SetStateAction<Record<string, string>>>
  ) => {
    setter((prev) => ({ ...prev, [key]: value }))
  }

  const buildInternalNotes = (values: Record<string, string>) => {
    const lines = [...INTERNAL_NOTE_FIELDS, ...INTERNAL_QA_FIELDS]
      .map(({ key, label }) => {
        const raw = values[key]?.trim()
        return raw ? `${label}: ${raw}` : ""
      })
      .filter(Boolean)
    return lines.length ? lines.join("\n") : null
  }

  const normalizeDayValues = (values: string[]) => {
    const cleaned = values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
    return Array.from(new Set(cleaned)).sort((a, b) => a - b)
  }

  const toggleDayValue = (
    value: string,
    current: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]
    next.sort((a, b) => Number(a) - Number(b))
    setter(next)
  }

  const exportTemplatesCSV = (mode: "all" | "active" | "inactive") => {
    const rows = templates.filter((template) => {
      if (mode === "active") return template.is_active
      if (mode === "inactive") return !template.is_active
      return true
    })
    const header = [
      "Title",
      "Description",
      "Department",
      "DepartmentCode",
      "Frequency",
      "Priority",
      "FinishPeriod",
      "DayOfWeek",
      "DayOfMonth",
      "MonthOfYear",
      "DefaultAssignee",
      "Active",
    ]
    const dayOfMonthLabel = (value?: number | null) => {
      if (value == null) return ""
      if (value === 0) return "end_of_month"
      if (value === -1) return "first_working_day"
      return String(value)
    }
    const dayOfWeekLabel = (template: SystemTaskTemplate) => {
      const days =
        template.days_of_week && template.days_of_week.length
          ? template.days_of_week
          : template.day_of_week != null
            ? [template.day_of_week]
            : []
      return days.join("|")
    }

    const body = rows.map((template) => {
      const department = template.department_id ? departmentMap.get(template.department_id) : null
      const assignee = template.default_assignee_id ? userMap.get(template.default_assignee_id) : null
      const scope = template.scope || (template.department_id ? "DEPARTMENT" : "ALL")
      const departmentLabel =
        scope === "GA"
          ? "GA"
          : scope === "ALL"
            ? "ALL"
            : department
              ? formatDepartmentName(department.name)
              : ""
      const departmentCode = scope === "DEPARTMENT" && department ? department.code : ""
      return [
        template.title,
        template.description || "",
        departmentLabel,
        departmentCode,
        template.frequency,
        normalizePriority(template.priority),
        template.finish_period || "",
        dayOfWeekLabel(template),
        dayOfMonthLabel(template.day_of_month),
        template.month_of_year ?? "",
        assignee ? assignee.username || assignee.full_name || "" : "",
        template.is_active ? "true" : "false",
      ]
        .map(csvEscape)
        .join(",")
    })
    const blob = new Blob([header.join(",") + "\n" + body.join("\n")], { type: "text/csv" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `system_task_templates_${mode}.csv`
    link.click()
  }

  const exportTemplatesExcel = async () => {
    if (exportingExcel) return
    setExportingExcel(true)
    try {
      const res = await apiFetch("/exports/system-tasks.xlsx?active_only=true")
      if (!res?.ok) {
        const detail = await res.text()
        alert(detail || "Failed to export Excel.")
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = "system_tasks_active.xlsx"
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Failed to export system tasks Excel", err)
      alert("Failed to export Excel.")
    } finally {
      setExportingExcel(false)
    }
  }

  const handlePrint = React.useCallback(() => {
    const escapeHtml = (value: unknown) => {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
    }
    const stripHtml = (value: string | null | undefined) => String(value ?? "").replace(/<[^>]+>/g, "").trim()
    const buildDetails = (template: SystemTaskTemplate) => {
      const notes = parseInternalNotes(template.internal_notes)
      const parts: string[] = []
      const reg = notes.REGJ ? `REGJ: ${notes.REGJ}` : ""
      const path = notes.PATH ? `PATH: ${notes.PATH}` : ""
      const check = notes.CHECKLISTA || notes.CHECK ? `CHECKLISTA: ${notes.CHECKLISTA || notes.CHECK}` : ""
      const training = notes.TRAINING ? `TRAINING: ${notes.TRAINING}` : ""
      if (reg) parts.push(reg)
      if (path) parts.push(path)
      if (check) parts.push(check)
      if (training) parts.push(training)
      return parts.join(" | ")
    }
    const buildBzGroup = (template: SystemTaskTemplate) => {
      const notes = parseInternalNotes(template.internal_notes)
      return notes["BZ GROUP"] || ""
    }
    const buildBzMe = (template: SystemTaskTemplate) => {
      const managerIds = template.alignment_user_ids ?? []
      if (managerIds.length === 0) return ""
      const labels = managerIds
        .map((id) => {
          const person = userMap.get(id)
          if (!person) return ""
          return userDisplayLabel(person)
        })
        .filter(Boolean)
        .map((label) => userInitials(label))
        .filter(Boolean)
      return labels.join(", ")
    }
    const buildBzKur = (template: SystemTaskTemplate) => {
      if (!template.requires_alignment) return ""
      return timeInputValue(template.alignment_time)
    }
    const buildDetailsWithBzGroup = (template: SystemTaskTemplate) => {
      const notes = parseInternalNotes(template.internal_notes)
      const normalize = (value?: string | null) => {
        const trimmed = String(value ?? "").trim()
        return trimmed === "-" ? "" : trimmed
      }
      const reg = normalize(notes.REGJ)
      const path = normalize(notes.PATH)
      const training = normalize(notes.TRAINING)
      const checklistaValue = normalize(notes.CHECKLISTA || notes.CHECK)
      const bzGroup = normalize(buildBzGroup(template))
      const hasAny = reg || path || training || checklistaValue || bzGroup
      if (!hasAny) return ""
      const parts = [
        `<strong>1.REGJ:</strong> ${escapeHtml(reg || "-")}`,
        `<strong>2.PATH:</strong> ${escapeHtml(path || "-")}`,
        `<strong>3.CHECKLISTA:</strong> ${escapeHtml(checklistaValue || "-")}`,
        `<strong>4.TRAINING:</strong> ${escapeHtml(training || "-")}`,
        `<strong>5.BZ GROUP:</strong> ${escapeHtml(bzGroup || "-")}`,
      ]
      return parts.join("\n")
    }
    const assigneeInitials = (list?: SystemTaskTemplate["assignees"]) => {
      if (!list || list.length === 0) return "-"
      return list
        .map((person) => userDisplayLabel(person))
        .filter(Boolean)
        .map((label) => userInitials(label))
        .join(", ")
    }

    const rows = sections[0]?.templates ?? []
    if (rows.length === 0) {
      toast("No system tasks to print for the current filters.")
      return
    }

    const printWindow = window.open("", "_blank")
    if (!printWindow) return

    const effectiveTitle = headingTitle ?? (scopeFilter === "GA" ? "Admin System Tasks" : "System Tasks")
    const now = new Date()
    const printedAt = now.toLocaleString()

    const activeFilters: string[] = []
    if (searchQuery.trim()) activeFilters.push(`Search: "${searchQuery.trim()}"`)
    if (!allFrequenciesSelected) activeFilters.push(`Frequency: ${frequencyLabel}`)
    if (!allPrioritiesSelected) activeFilters.push(`Priority: ${priorityLabel}`)
    const filterLine = activeFilters.length ? activeFilters.join(" | ") : "All"

    const frequencyOrder: SystemTaskFrequency[] = ["DAILY", "WEEKLY", "MONTHLY", "3_MONTHS", "6_MONTHS", "YEARLY"]
    const grouped = new Map<SystemTaskFrequency, SystemTaskTemplate[]>()
    for (const f of frequencyOrder) grouped.set(f, [])
    const inactive: SystemTaskTemplate[] = []
    for (const template of rows) {
      if (template.is_active === false) {
        inactive.push(template)
        continue
      }
      grouped.get(template.frequency)?.push(template)
    }

    const frequencyShortLabel = (value: SystemTaskFrequency) => {
      switch (value) {
        case "DAILY":
          return "D"
        case "WEEKLY":
          return "W"
        case "MONTHLY":
          return "M"
        case "3_MONTHS":
          return "3M"
        case "6_MONTHS":
          return "6M"
        case "YEARLY":
          return "Y"
        default:
          return value
      }
    }

    const departmentShortLabel = (template: SystemTaskTemplate, department: Department | null) => {
      if (template.scope === "GA") return "GA"
      if (template.scope === "ALL") return "ALL"
      if (department?.code) return department.code.toUpperCase()
      const name = department?.name || ""
      if (!name) return "-"
      return name
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join("")
        .toUpperCase()
    }

    const renderTemplateRow = (template: SystemTaskTemplate, rowNumber: number) => {
      const priorityValue = normalizePriority(template.priority)
      const department = template.department_id ? departmentMap.get(template.department_id) : null
      const scope = template.scope || (template.department_id ? "DEPARTMENT" : "ALL")
      const departmentLabel =
        scope === "GA"
          ? "GA"
          : scope === "ALL"
            ? "ALL"
            : department
              ? formatDepartmentName(department.name)
              : "-"
      const ownerLabel = assigneeInitials(template.assignees)
      const frequencyLabelResolved =
        FREQUENCY_OPTIONS.find((option) => option.value === template.frequency)?.label ?? template.frequency
      const frequencyShort = frequencyShortLabel(template.frequency)
      const departmentShort = departmentShortLabel(template, department || null)
      const priorityShort = priorityValue === "HIGH" ? "H" : "N"

      return `
        <tr>
          <td class="num tight">${rowNumber}</td>
          <td class="center tight">${escapeHtml(priorityShort)}</td>
          <td class="center no-wrap tight">${escapeHtml(frequencyShort)}</td>
          <td class="no-wrap tight">${escapeHtml(departmentShort)}</td>
          <td class="ampm tight">${escapeHtml(template.finish_period || "-")}</td>
          <td class="title">${escapeHtml(template.title)}</td>
          <td>${escapeHtml(ownerLabel)}</td>
          <td class="details-bz">${buildDetailsWithBzGroup(template)}</td>
          <td class="bz-me">${escapeHtml(buildBzMe(template) || "-")}</td>
          <td class="bz-kur">${escapeHtml(buildBzKur(template) || "-")}</td>
          <td class="comment">${escapeHtml(template.user_comment || "-")}</td>
        </tr>
      `
    }

    let tableBody = ""
    let counter = 0
    for (const frequency of frequencyOrder) {
      const list = grouped.get(frequency) ?? []
      if (!list.length) continue
      // Print view: no DAILY/WEEKLY/... separator rows; keep ordering only.
      for (const template of list) {
        counter += 1
        tableBody += renderTemplateRow(template, counter)
      }
    }

    // Keep inactive tasks at the end, but without a separate "Inactive Tasks" separator row.
    if (inactive.length) {
      for (const template of inactive) {
        counter += 1
        tableBody += renderTemplateRow(template, counter)
      }
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(effectiveTitle)}</title>
          <style>
            @page { margin: 8mm; }
            html, body {
              direction: ltr;
              margin: 0;
              padding: 0;
            }

            body {
              font-family: Arial, sans-serif;
              font-size: 10pt;
              color: #0f172a;
            }

            .header {
              text-align: left;
              margin: 0 0 8px 0;
              padding: 0;
              border-bottom: 0;
            }

            .header h1 {
              margin: 0;
              font-size: 16pt;
              letter-spacing: 0.2px;
              text-align: center;
            }

            .meta {
              margin-top: 6px;
              font-size: 9pt;
              color: #475569;
              display: flex;
              justify-content: space-between;
              gap: 12px;
              flex-wrap: wrap;
            }

            .meta .filters {
              flex: 1;
              text-align: left;
              word-break: break-word;
            }

            .meta .printedAt {
              white-space: nowrap;
              text-align: right;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: auto;
              direction: ltr;
              margin-top: 0;
              border: 2px solid #0f172a;
            }

            col.col-num { width: auto; }
            col.col-prio { width: auto; }
            col.col-lloji { width: auto; }
            col.col-dept { width: auto; }
            col.col-ampm { width: auto; }
            col.col-title { width: 20%; }
            col.col-person { width: auto; }
            col.col-details { width: 28%; }
            col.col-bzme { width: auto; }
            col.col-bzkur { width: auto; }
            col.col-comment { width: 12%; }

            thead th {
              background: #f1f5f9;
              border: 2px solid #0f172a;
              padding: 3px;
              font-size: 9pt;
              text-align: left;
              text-transform: uppercase;
              white-space: normal;
              word-break: break-word;
              hyphens: auto;
              vertical-align: bottom;
              line-height: 1.1;
            }

            tbody td {
              border: 1px solid #0f172a;
              padding: 3px;
              vertical-align: bottom;
              font-size: 9pt;
              word-break: break-word;
              white-space: normal;
            }
            /* Match left/right spacing for narrow columns */
            thead th:nth-child(-n + 5),
            tbody td:nth-child(-n + 5),
            thead th:nth-child(7),
            tbody td:nth-child(7),
            thead th:nth-child(9),
            tbody td:nth-child(9),
            thead th:nth-child(10),
            tbody td:nth-child(10) {
              padding-left: 4px;
              padding-right: 4px;
            }
            .details-bz {
              white-space: pre-line;
            }
 /* Force tight columns (first 5 + Personi + BZ ME + KOHA BZ) */
            thead th:nth-child(-n + 5),
            tbody td:nth-child(-n + 5),
            thead th:nth-child(7),
            tbody td:nth-child(7),
            thead th:nth-child(9),
            tbody td:nth-child(9),
            thead th:nth-child(10),
            tbody td:nth-child(10) {
              padding-left: 4px;
              padding-right: 4px;
              white-space: nowrap;
            }

            tr { page-break-inside: avoid; }

            .num { text-align: left; font-weight: bold; }
            .tight { padding-left: 0; padding-right: 0; }
            .ampm { text-align: center; }
            .ampm-head { text-align: center; line-height: 1.05; }
            .ampm-head span { display: inline-block; }
            .title { font-weight: 400; }
            .description { }
            .details { }
            .bz-group { }
            .center { text-align: left; }

            .pill {
              display: inline-block;
              padding: 2px 8px;
              border-radius: 999px;
              border: 1px solid #cbd5e1;
              font-size: 8pt;
              font-weight: 700;
            }

            .pill-normal { background: #ffedd5; border-color: #fdba74; color: #9a3412; }
            .pill-high { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; }

            .print-footer {
              display: none;
            }

            @media print {
              .print-footer {
                display: grid;
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                padding: 0;
                font-size: 9pt;
                color: #475569;
                grid-template-columns: 1fr auto 1fr;
                align-items: center;
              }
              .print-footer .page-count {
                grid-column: 2;
                text-align: center;
              }
              .print-footer .punoi {
                grid-column: 3;
                text-align: right;
              }
            }

            @media screen {
              .print-footer {
                display: grid;
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                padding: 0;
                font-size: 9pt;
                color: #475569;
                background: white;
                grid-template-columns: 1fr auto 1fr;
                align-items: center;
              }
              .print-footer .page-count {
                grid-column: 2;
                text-align: center;
              }
              .print-footer .punoi {
                grid-column: 3;
                text-align: right;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${escapeHtml(effectiveTitle)}</h1>
            <div class="meta">
              <div class="filters"><strong>FILTERS:</strong> ${escapeHtml(filterLine).toUpperCase()}</div>
              <div class="printedAt">${escapeHtml(printedAt)}</div>
            </div>
          </div>

          <table>
            <colgroup>
              <col class="col-num" />
              <col class="col-prio" />
              <col class="col-lloji" />
              <col class="col-dept" />
              <col class="col-ampm" />
              <col class="col-title" />
              <col class="col-person" />
              <col class="col-details" />
              <col class="col-bzme" />
              <col class="col-bzkur" />
              <col class="col-comment" />
            </colgroup>
            <thead>
              <tr>
                <th class="tight">NR</th>
                <th class="tight">PRIO</th>
                <th class="tight">LL</th>
                <th class="tight">DEP</th>
                <th class="ampm-head tight"><span>AM/<br />PM</span></th>
                <th>Titulli</th>
                <th>USER</th>
                <th>REGJ/PATH/CHECKLISTA/TRAINING / BZ GROUP</th>
                <th>BZ ME</th>
                <th>KOHA BZ</th>
                <th>KOMENT</th>
              </tr>
            </thead>
            <tbody>
              ${tableBody}
            </tbody>
          </table>
          <div class="print-footer">
            <span></span>
            <span class="page-count" id="page-count">1/1</span>
            <span class="punoi">PUNOI ___</span>
          </div>
          <script>
            (function () {
              // Calculate approximate page count based on content height
              var A4_HEIGHT_PX = 11.69 * 96; // ~1122px
              var MARGIN_PX = 0;
              var printableHeight = A4_HEIGHT_PX - MARGIN_PX * 2;
              
              function updatePageCount() {
                var bodyHeight = Math.max(
                  document.body.scrollHeight,
                  document.body.offsetHeight,
                  document.documentElement.scrollHeight
                );
                var totalPages = Math.max(1, Math.ceil(bodyHeight / printableHeight));
                var pageCountEl = document.getElementById("page-count");
                if (pageCountEl) {
                  pageCountEl.textContent = "1/" + totalPages;
                }
              }
              
              // Update on load
              if (document.readyState === "complete") {
                updatePageCount();
              } else {
                window.addEventListener("load", updatePageCount);
              }
            })();
          </script>
        </body>
      </html>
    `

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()

    const triggerPrint = () => {
      printWindow.focus()
      printWindow.print()
    }

    // Prefer onload so the footer/counters are ready for the preview.
    printWindow.onload = () => {
      setTimeout(triggerPrint, 100)
    }
    printWindow.onafterprint = () => {
      printWindow.close()
    }
    // Fallback in case onload doesn't fire (rare for about:blank).
    setTimeout(() => {
      try {
        triggerPrint()
      } catch {}
    }, 600)
  }, [
    allFrequenciesSelected,
    allPrioritiesSelected,
    departmentMap,
    frequencyLabel,
    headingTitle,
    priorityLabel,
    scopeFilter,
    searchQuery,
    sections,
  ])

  const importTemplatesFromFile = async (file: File) => {
    if (!canCreate) return
    const text = await file.text()
    const rows = parseCSV(text)
    if (!rows.length) return

    const header = rows[0].map((cell) => cell.trim().toLowerCase())
    const hasHeader = header.includes("title") || header.includes("frequency")
    const dataRows = hasHeader ? rows.slice(1) : rows
    const noHeaderHasPriority = !hasHeader && (dataRows[0]?.length ?? 0) >= 11
    const noHeaderHasFinishPeriod = !hasHeader && (dataRows[0]?.length ?? 0) >= 12

    const getIndex = (name: string, aliases: string[] = []) => {
      const target = [name, ...aliases]
      return header.findIndex((cell) => target.includes(cell.replace(/\s+/g, "")))
    }

    const idxTitle = hasHeader ? getIndex("title") : 0
    const idxDescription = hasHeader ? getIndex("description") : 1
    const idxDepartment = hasHeader ? getIndex("department", ["departmentcode", "department_code"]) : 2
    const idxFrequency = hasHeader ? getIndex("frequency") : 3
    const idxPriority = hasHeader ? getIndex("priority") : noHeaderHasPriority ? 4 : -1
    const idxFinishPeriod = hasHeader
      ? getIndex("finishperiod", ["finish_period", "finish"])
      : noHeaderHasFinishPeriod
        ? 5
        : -1
    const idxDayOfWeek = hasHeader
      ? getIndex("dayofweek", ["day_of_week"])
      : noHeaderHasFinishPeriod
        ? 6
        : noHeaderHasPriority
          ? 5
          : 4
    const idxDayOfMonth = hasHeader
      ? getIndex("dayofmonth", ["day_of_month"])
      : noHeaderHasFinishPeriod
        ? 7
        : noHeaderHasPriority
          ? 6
          : 5
    const idxMonthOfYear = hasHeader
      ? getIndex("monthofyear", ["month_of_year"])
      : noHeaderHasFinishPeriod
        ? 8
        : noHeaderHasPriority
          ? 7
          : 6
    const idxAssignee = hasHeader
      ? getIndex("defaultassignee", ["assignee"])
      : noHeaderHasFinishPeriod
        ? 9
        : noHeaderHasPriority
          ? 8
          : 7
    const idxActive = hasHeader
      ? getIndex("active")
      : noHeaderHasFinishPeriod
        ? 10
        : noHeaderHasPriority
          ? 9
          : 8

    const normalize = (value: string) => value.trim().toLowerCase()
    const frequencyForValue = (value: string): SystemTaskFrequency | null => {
      const raw = normalize(value)
      const upper = value.trim().toUpperCase()
      if ((FREQUENCY_VALUES as string[]).includes(upper)) {
        return upper as SystemTaskFrequency
      }
      if (raw.includes("daily") || raw.includes("every day") || raw.includes("ditore")) return "DAILY"
      if (raw.includes("weekly") || raw.includes("every week") || raw.includes("javore")) return "WEEKLY"
      if (raw.includes("yearly") || raw.includes("annual") || raw.includes("vjetore")) return "YEARLY"
      if (raw.includes("3") && raw.includes("month")) return "3_MONTHS"
      if (raw.includes("6") && raw.includes("month")) return "6_MONTHS"
      if (raw.includes("3") && raw.includes("mujore")) return "3_MONTHS"
      if (raw.includes("6") && raw.includes("mujore")) return "6_MONTHS"
      if (raw.includes("monthly") || raw.includes("mujore")) return "MONTHLY"
      return null
    }

    const priorityForValue = (value: string): TaskPriority | null => {
      const raw = normalize(value)
      if (!raw) return null
      const upper = value.trim().toUpperCase()
      if ((PRIORITY_OPTIONS as string[]).includes(upper)) {
        return upper as TaskPriority
      }
      if (raw.includes("urgent") || raw.includes("critical")) return "HIGH"
      if (raw.includes("high")) return "HIGH"
      if (raw.includes("medium") || raw.includes("low") || raw.includes("normal")) return "NORMAL"
      return null
    }

    const finishPeriodForValue = (value: string): TaskFinishPeriod | null => {
      const raw = normalize(value)
      if (!raw) return null
      if (raw.includes("none") || raw.includes("all day") || raw.includes("allday")) return null
      const upper = value.trim().toUpperCase()
      if ((FINISH_PERIOD_OPTIONS as string[]).includes(upper)) {
        return upper as TaskFinishPeriod
      }
      if (raw.includes("am")) return "AM"
      if (raw.includes("pm")) return "PM"
      return null
    }

    const dayOfWeekForValue = (value: string): number[] | null => {
      const raw = normalize(value)
      if (!raw) return null
      const map: Record<string, number> = {
        monday: 0,
        tuesday: 1,
        wednesday: 2,
        thursday: 3,
        friday: 4,
        saturday: 5,
        sunday: 6,
        "e hene": 0,
        "e marte": 1,
        "e merkure": 2,
        "e enjte": 3,
        "e premte": 4,
        "e shtune": 5,
        "e diel": 6,
      }
      const parseToken = (token: string) => {
        const cleaned = token.trim().toLowerCase()
        if (!cleaned) return null
        const numeric = Number(cleaned)
        if (!Number.isNaN(numeric)) return numeric
        return map[cleaned] ?? null
      }
      const segments = raw.split(/[|;,\s]+/).filter(Boolean)
      const parsed = segments.map(parseToken).filter((day): day is number => day != null)
      if (parsed.length) return Array.from(new Set(parsed)).sort((a, b) => a - b)
      const single = parseToken(raw)
      return single != null ? [single] : null
    }

    const scopeForValue = (value: string): { scope: SystemTaskScope; departmentId: string | null } => {
      const raw = normalize(value)
      if (!raw || raw === "all" || raw === "all departments") {
        return { scope: "ALL", departmentId: null }
      }
      if (raw === "ga") {
        return { scope: "GA", departmentId: null }
      }
      const byCode = departments.find((dept) => dept.code.toLowerCase() === raw)
      if (byCode) return { scope: "DEPARTMENT", departmentId: byCode.id }
      const byName = departments.find((dept) => dept.name.toLowerCase() === raw)
      return { scope: "DEPARTMENT", departmentId: byName?.id ?? null }
    }

    const assigneeIdForValue = (value: string) => {
      const raw = normalize(value)
      if (!raw) return null
      const byUsername = users.find((u) => (u.username || "").toLowerCase() === raw)
      if (byUsername) return byUsername.id
      const byName = users.find((u) => (u.full_name || "").toLowerCase() === raw)
      return byName?.id ?? null
    }

    const activeForValue = (value: string) => {
      const raw = normalize(value)
      if (!raw) return true
      if (["true", "yes", "1", "active", "open"].includes(raw)) return true
      if (["false", "no", "0", "inactive", "closed"].includes(raw)) return false
      return true
    }

    const dayOfMonthForValue = (value: string) => {
      const raw = normalize(value)
      if (!raw) return null
      if (raw.includes("first") && raw.includes("work")) return -1
      if (raw.includes("end") && raw.includes("month")) return 0
      const numeric = Number(raw)
      return Number.isNaN(numeric) ? null : numeric
    }

    for (const row of dataRows) {
      const title = row[idxTitle]?.trim()
      if (!title) continue
      const frequencyValue = frequencyForValue(row[idxFrequency] || "")
      if (!frequencyValue) continue
      const priorityValue =
        idxPriority >= 0 ? priorityForValue(row[idxPriority] || "") : null
      const finishPeriodValue =
        idxFinishPeriod >= 0 ? finishPeriodForValue(row[idxFinishPeriod] || "") : null

      const scopeEntry = scopeForValue(row[idxDepartment] || "")
      const dayOfWeekValue = dayOfWeekForValue(row[idxDayOfWeek] || "")
      const payload = {
        title,
        description: row[idxDescription]?.trim() || null,
        scope: scopeEntry.scope,
        department_id: scopeEntry.departmentId,
        default_assignee_id: assigneeIdForValue(row[idxAssignee] || ""),
        frequency: frequencyValue,
        priority: priorityValue,
        finish_period: finishPeriodValue,
        day_of_week: dayOfWeekValue ? dayOfWeekValue[0] : null,
        days_of_week: dayOfWeekValue,
        day_of_month: dayOfMonthForValue(row[idxDayOfMonth] || ""),
        month_of_year: row[idxMonthOfYear] ? Number(row[idxMonthOfYear]) : null,
        is_active: activeForValue(row[idxActive] || ""),
      }

      await apiFetch("/system-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    }

    await load()
  }

  const effectiveHeadingTitle =
    headingTitle ?? (scopeFilter === "GA" ? "Admin System Tasks" : "System Tasks")
  const effectiveHeadingDescription =
    headingDescription ??
    (scopeFilter === "GA"
      ? "System tasks scoped for Kosove and Gane admins."
      : "Department tasks organized by frequency and date.")

  const stickyHeaderRef = React.useRef<HTMLDivElement | null>(null)
  const [stickyOffset, setStickyOffset] = React.useState(0)

  React.useLayoutEffect(() => {
    const element = stickyHeaderRef.current
    if (!element || typeof ResizeObserver === "undefined") return

    const updateOffset = () => {
      setStickyOffset(element.offsetHeight)
    }

    updateOffset()
    const observer = new ResizeObserver(updateOffset)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className="space-y-4 pb-12"
      style={{ "--system-tasks-sticky-offset": `${stickyOffset}px` } as React.CSSProperties}
    >
      {/* Header Area */}
      <div
        ref={stickyHeaderRef}
        className="sticky top-0 z-50 rounded-lg border border-border/60 bg-white/95 p-4 shadow-sm backdrop-blur"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold leading-tight text-slate-900">{effectiveHeadingTitle}</h3>
            <p className="text-sm font-normal leading-snug text-slate-500">
              {effectiveHeadingDescription}
            </p>
          </div>
          {showSystemActions ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={handlePrint}
                size="sm"
                className="h-9 border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50"
              >
                Print
              </Button>
              <Button
                variant="outline"
                onClick={() => void exportTemplatesExcel()}
                disabled={exportingExcel}
                size="sm"
                className="h-9 border-blue-200 px-3 text-sm text-blue-700 hover:bg-blue-50 hover:text-blue-800"
              >
                {exportingExcel ? "Exporting..." : "Export Excel"}
              </Button>
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button
                    disabled={!canCreate}
                    size="sm"
                    className="h-9 bg-blue-600 px-3 text-sm text-white hover:bg-blue-700"
                  >
                    + Add Task
                  </Button>
                </DialogTrigger>
                {/* CREATE DIALOG CONTENT (Omitted for brevity, assumed same as original) */}
                <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Add system task</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Department</Label>
                        <Select value={departmentId} onValueChange={handleDepartmentChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={ALL_DEPARTMENTS_VALUE}>All departments</SelectItem>
                            <SelectItem value={GA_DEPARTMENTS_VALUE}>GA</SelectItem>
                            {departments.map((dept) => (
                              <SelectItem key={dept.id} value={dept.id}>
                                {formatDepartmentName(dept.name)} ({dept.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input value={title} onChange={(event) => setTitle(event.target.value.toUpperCase())} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <BoldOnlyEditor value={description} onChange={setDescription} />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Repeat</Label>
                        <Select value={frequency} onValueChange={(value) => setFrequency(value as SystemTaskFrequency)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select repeat" />
                          </SelectTrigger>
                          <SelectContent>
                            {FREQUENCY_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Finish by (optional)</Label>
                        <Select
                          value={finishPeriod}
                          onValueChange={(value) =>
                            setFinishPeriod(value as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select period" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={FINISH_PERIOD_NONE_VALUE}>{FINISH_PERIOD_NONE_LABEL}</SelectItem>
                            {FINISH_PERIOD_OPTIONS.map((value) => (
                              <SelectItem key={value} value={value}>
                                {FINISH_PERIOD_LABELS[value]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Priority</Label>
                        <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                          <SelectContent>
                            {PRIORITY_OPTIONS.map((value) => (
                              <SelectItem key={value} value={value}>
                                {PRIORITY_LABELS[value]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={requiresAlignment}
                          onCheckedChange={(value) => setRequiresAlignment(Boolean(value))}
                        />
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-slate-900">Requires BZ</div>
                          {requiresAlignment ? (
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              <div className="space-y-2">
                                <Label>BZ time</Label>
                                <Input
                                  type="time"
                                  value={alignmentTime}
                                  onChange={(event) => setAlignmentTime(event.target.value)}
                                />
                                <div className="text-[12px] text-slate-500">Required.</div>
                              </div>
                              <div className="space-y-2">
                                <Label>BZ with (managers)</Label>
                                <div className="rounded-md border border-slate-200 bg-white p-2">
                                  <div className="flex flex-wrap gap-2">
                                    {alignmentManagerIds.map((id) => {
                                      const manager = users.find((u) => u.id === id)
                                      const label = userDisplayLabel(manager) || id
                                      const initials = userInitials(label)
                                      return (
                                        <span
                                          key={id}
                                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                                          title={label}
                                        >
                                          {initials}
                                          <button
                                            type="button"
                                            className="text-slate-500 hover:text-slate-900"
                                            onClick={() => setAlignmentManagerIds((prev) => prev.filter((x) => x !== id))}
                                            aria-label={`Remove ${label}`}
                                          >
                                            ×
                                          </button>
                                        </span>
                                      )
                                    })}
                                    <Select
                                      value={EMPTY_VALUE}
                                      onValueChange={(value) => {
                                        if (value === EMPTY_VALUE) return
                                        setAlignmentManagerIds((prev) => (prev.includes(value) ? prev : [...prev, value]))
                                      }}
                                    >
                                      <SelectTrigger className="h-8 w-48">
                                        <SelectValue placeholder="Add manager" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value={EMPTY_VALUE}>Select…</SelectItem>
                                        {users
                                          .filter((u) => u.role === "MANAGER")
                                          .map((manager) => (
                                            <SelectItem key={manager.id} value={manager.id}>
                                              {manager.full_name || manager.username || ("email" in manager ? manager.email : "")}
                                            </SelectItem>
                                          ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {frequency === "WEEKLY" ? (
                      <div className="space-y-2">
                        <Label>Days of week</Label>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {WEEKDAY_OPTIONS.map((day) => {
                            const checked = daysOfWeek.includes(day.value)
                            return (
                              <label key={day.value} className="flex items-center gap-2 text-sm text-slate-700">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggleDayValue(day.value, daysOfWeek, setDaysOfWeek)}
                                />
                                <span>{day.label}</span>
                              </label>
                            )
                          })}
                          <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-start-2 lg:col-start-3">
                            <Checkbox
                              checked={showWeekendDays}
                              onCheckedChange={(value) => setShowWeekendDays(Boolean(value))}
                            />
                            <span>Show weekend days</span>
                          </label>
                        </div>
                        {showWeekendDays ? (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {WEEKEND_OPTIONS.map((day) => {
                              const checked = daysOfWeek.includes(day.value)
                              return (
                                <label key={day.value} className="flex items-center gap-2 text-sm text-slate-700">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() => toggleDayValue(day.value, daysOfWeek, setDaysOfWeek)}
                                  />
                                  <span>{day.label}</span>
                                </label>
                              )
                            })}
                          </div>
                        ) : null}
                        <p className="text-[12px] text-muted-foreground">Select one or more days.</p>
                      </div>
                    ) : null}
                    {(frequency === "MONTHLY" ||
                      frequency === "YEARLY" ||
                      frequency === "3_MONTHS" ||
                      frequency === "6_MONTHS") && (
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Day of month</Label>
                            <Select value={dayOfMonth} onValueChange={setDayOfMonth}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select day" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={FIRST_WORKING_DAY_VALUE}>First working day</SelectItem>
                                <SelectItem value={END_OF_MONTH_VALUE}>End of month/year</SelectItem>
                                {DAY_OF_MONTH_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="text-[13px] text-muted-foreground">{weekendShiftHint}</div>
                          </div>
                          <div className="space-y-2">
                            <Label>Month (optional)</Label>
                            <Select value={monthOfYear} onValueChange={setMonthOfYear}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select month" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={EMPTY_VALUE}>None</SelectItem>
                                {MONTH_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    <details className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <summary className="cursor-pointer text-sm font-medium text-slate-700">
                        More details
                      </summary>
                      <div className="mt-3 space-y-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          {INTERNAL_NOTE_FIELDS.map((field) => (
                            <div key={field.key} className="space-y-1">
                              <Label className="text-sm">{field.label}</Label>
                              <Input
                                value={internalNotes[field.key] || ""}
                                onChange={(event) =>
                                  setInternalNoteValue(field.key, event.target.value, setInternalNotes)
                                }
                                placeholder={field.placeholder}
                                className="placeholder:text-muted-foreground/60"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm text-muted-foreground">Question/Answer (optional)</Label>
                          <Textarea
                            value={internalNotes.QA || ""}
                            onChange={(event) => setInternalNoteValue("QA", event.target.value, setInternalNotes)}
                            placeholder="Type any questions/answers..."
                            className="placeholder:text-muted-foreground/60"
                          />
                        </div>
                      </div>
                    </details>
                    <div className="space-y-2">
                      <Label>Assignees (optional)</Label>
                      {isGlobalScopeValue(departmentId) ? (
                        assigneeDeptNames.length ? (
                          <p className="text-[13px] text-muted-foreground">
                            Departments: {formatDepartmentNames(assigneeDeptNames)}
                          </p>
                        ) : (
                          <p className="text-[13px] text-muted-foreground">
                            When you select an owner, the department will appear here.
                          </p>
                        )
                      ) : null}
                      <div className="rounded-lg border border-border/60 bg-white p-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {assigneeIds.map((id) => {
                            const person = userMap.get(id)
                            const email = person && "email" in person ? person.email || "" : ""
                            const label = person?.full_name || person?.username || email || id
                            return (
                              <span key={id} className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
                                <span>{label}</span>
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={() => removeAssignee(id)}
                                  aria-label={`Remove ${label}`}
                                >
                                  ×
                                </button>
                              </span>
                            )
                          })}
                          <Input
                            value={assigneeQuery}
                            onChange={(event) => setAssigneeQuery(event.target.value)}
                            onFocus={() => setAssigneeOpen(true)}
                            onBlur={() => setTimeout(() => setAssigneeOpen(false), 120)}
                            placeholder="Search users..."
                            className="h-8 min-w-[180px] border-0 px-0 focus-visible:ring-0"
                          />
                        </div>
                        {assigneeOpen ? (
                          <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-border/60 bg-white shadow-sm">
                            {filteredAssignees.length ? (
                              filteredAssignees.map((person) => {
                                const isSelected = assigneeIds.includes(person.id)
                                const nextIds = isSelected
                                  ? assigneeIds.filter((item) => item !== person.id)
                                  : [...assigneeIds, person.id]
                                return (
                                  <button
                                    key={person.id}
                                    type="button"
                                    className="flex w-full items-center justify-between px-2 py-2 text-left text-sm hover:bg-muted/60"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => handleAssigneesChange(nextIds)}
                                  >
                                    <span>{person.full_name || person.username || ("email" in person ? person.email : "")}</span>
                                    {isSelected ? <span className="text-xs text-muted-foreground">Selected</span> : null}
                                  </button>
                                )
                              })
                            ) : (
                              <div className="px-2 py-2 text-sm text-muted-foreground">No users found.</div>
                            )}
                          </div>
                        ) : null}
                      </div>
                      {assigneeError ? (
                        <div className="text-[13px] font-medium text-red-600">{assigneeError}</div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <Checkbox checked={isActive} onCheckedChange={(value) => setIsActive(Boolean(value))} />
                      <span className="text-base">Active</span>
                    </div>
                    <div className="sticky bottom-0 z-10 -mx-6 mt-6 flex items-center justify-end gap-2 border-t border-border/60 bg-white/90 px-6 py-3 backdrop-blur">
                      <Button variant="outline" onClick={() => setCreateOpen(false)}>
                        Cancel
                      </Button>
                      <Button disabled={saving || !title.trim() || !departmentId} onClick={() => void submit()}>
                        {saving ? "Saving..." : "Save task"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* EDIT DIALOG */}
              <Dialog
                open={editOpen}
                onOpenChange={(open) => {
                  setEditOpen(open)
                  if (!open) setEditTemplate(null)
                }}
              >
                {/* EDIT DIALOG CONTENT (Same structure as create) */}
                <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Edit system task</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Department</Label>
                        <Select value={editDepartmentId} onValueChange={handleEditDepartmentChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={ALL_DEPARTMENTS_VALUE}>All departments</SelectItem>
                            <SelectItem value={GA_DEPARTMENTS_VALUE}>GA</SelectItem>
                            {departments.map((dept) => (
                              <SelectItem key={dept.id} value={dept.id}>
                                {formatDepartmentName(dept.name)} ({dept.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input value={editTitle} onChange={(event) => setEditTitle(event.target.value.toUpperCase())} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <BoldOnlyEditor value={editDescription} onChange={setEditDescription} />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Repeat</Label>
                        <Select
                          value={editFrequency}
                          onValueChange={(value) => setEditFrequency(value as SystemTaskFrequency)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select repeat" />
                          </SelectTrigger>
                          <SelectContent>
                            {FREQUENCY_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Finish by (optional)</Label>
                        <Select
                          value={editFinishPeriod}
                          onValueChange={(value) =>
                            setEditFinishPeriod(value as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select period" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={FINISH_PERIOD_NONE_VALUE}>{FINISH_PERIOD_NONE_LABEL}</SelectItem>
                            {FINISH_PERIOD_OPTIONS.map((value) => (
                              <SelectItem key={value} value={value}>
                                {FINISH_PERIOD_LABELS[value]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Priority</Label>
                        <Select value={editPriority} onValueChange={(value) => setEditPriority(value as TaskPriority)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                          <SelectContent>
                            {PRIORITY_OPTIONS.map((value) => (
                              <SelectItem key={value} value={value}>
                                {PRIORITY_LABELS[value]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={editRequiresAlignment}
                          onCheckedChange={(value) => setEditRequiresAlignment(Boolean(value))}
                        />
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-slate-900">Requires BZ</div>
                          <div className="text-xs text-slate-500 mt-1">
                            If enabled, the task should be BZ with managers at the specified time.
                          </div>
                          {editRequiresAlignment ? (
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              <div className="space-y-2">
                                <Label>BZ time</Label>
                                <Input
                                  type="time"
                                  value={editAlignmentTime}
                                  onChange={(event) => setEditAlignmentTime(event.target.value)}
                                />
                                <div className="text-[12px] text-slate-500">Required.</div>
                              </div>
                              <div className="space-y-2">
                                <Label>BZ me (managers)</Label>
                                <div className="rounded-md border border-slate-200 bg-white p-2">
                                  <div className="flex flex-wrap gap-2">
                                    {editAlignmentManagerIds.map((id) => {
                                      const manager = users.find((u) => u.id === id)
                                      const label = userDisplayLabel(manager) || id
                                      const initials = userInitials(label)
                                      return (
                                        <span
                                          key={id}
                                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                                          title={label}
                                        >
                                          {initials}
                                          <button
                                            type="button"
                                            className="text-slate-500 hover:text-slate-900"
                                            onClick={() => setEditAlignmentManagerIds((prev) => prev.filter((x) => x !== id))}
                                            aria-label={`Remove ${label}`}
                                          >
                                            ×
                                          </button>
                                        </span>
                                      )
                                    })}
                                    <Select
                                      value={EMPTY_VALUE}
                                      onValueChange={(value) => {
                                        if (value === EMPTY_VALUE) return
                                        setEditAlignmentManagerIds((prev) => (prev.includes(value) ? prev : [...prev, value]))
                                      }}
                                    >
                                      <SelectTrigger className="h-8 w-48">
                                        <SelectValue placeholder="Add manager" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value={EMPTY_VALUE}>Select…</SelectItem>
                                        {users
                                          .filter((u) => u.role === "MANAGER")
                                          .map((manager) => (
                                            <SelectItem key={manager.id} value={manager.id}>
                                              {manager.full_name || manager.username || ("email" in manager ? manager.email : "")}
                                            </SelectItem>
                                          ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {editFrequency === "WEEKLY" ? (
                      <div className="space-y-2">
                        <Label>Days of week</Label>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {WEEKDAY_OPTIONS.map((day) => {
                            const checked = editDaysOfWeek.includes(day.value)
                            return (
                              <label key={day.value} className="flex items-center gap-2 text-sm text-slate-700">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() =>
                                    toggleDayValue(day.value, editDaysOfWeek, setEditDaysOfWeek)
                                  }
                                />
                                <span>{day.label}</span>
                              </label>
                            )
                          })}
                          <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-start-2 lg:col-start-3">
                            <Checkbox
                              checked={editShowWeekendDays}
                              onCheckedChange={(value) => setEditShowWeekendDays(Boolean(value))}
                            />
                            <span>Show weekend days</span>
                          </label>
                        </div>
                        {editShowWeekendDays ? (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {WEEKEND_OPTIONS.map((day) => {
                              const checked = editDaysOfWeek.includes(day.value)
                              return (
                                <label key={day.value} className="flex items-center gap-2 text-sm text-slate-700">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() =>
                                      toggleDayValue(day.value, editDaysOfWeek, setEditDaysOfWeek)
                                    }
                                  />
                                  <span>{day.label}</span>
                                </label>
                              )
                            })}
                          </div>
                        ) : null}
                        <p className="text-[12px] text-muted-foreground">Select one or more days.</p>
                      </div>
                    ) : null}
                    {(editFrequency === "MONTHLY" ||
                      editFrequency === "YEARLY" ||
                      editFrequency === "3_MONTHS" ||
                      editFrequency === "6_MONTHS") && (
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Day of month</Label>
                            <Select value={editDayOfMonth} onValueChange={setEditDayOfMonth}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select day" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={FIRST_WORKING_DAY_VALUE}>First working day</SelectItem>
                                <SelectItem value={END_OF_MONTH_VALUE}>End of month/year</SelectItem>
                                {DAY_OF_MONTH_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="text-[13px] text-muted-foreground">{weekendShiftHint}</div>
                          </div>
                          <div className="space-y-2">
                            <Label>Month (optional)</Label>
                            <Select value={editMonthOfYear} onValueChange={setEditMonthOfYear}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select month" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={EMPTY_VALUE}>None</SelectItem>
                                {MONTH_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    <details className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <summary className="cursor-pointer text-sm font-medium text-slate-700">
                        More details
                      </summary>
                      <div className="mt-3 space-y-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          {INTERNAL_NOTE_FIELDS.map((field) => (
                            <div key={field.key} className="space-y-1">
                              <Label className="text-sm">{field.label}</Label>
                              <Input
                                value={editInternalNotes[field.key] || ""}
                                onChange={(event) =>
                                  setInternalNoteValue(field.key, event.target.value, setEditInternalNotes)
                                }
                                placeholder={field.placeholder}
                                className="placeholder:text-muted-foreground/60"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm text-muted-foreground">Question/Answer (optional)</Label>
                          <Textarea
                            value={editInternalNotes.QA || ""}
                            onChange={(event) => setInternalNoteValue("QA", event.target.value, setEditInternalNotes)}
                            placeholder="Type any questions/answers..."
                            className="placeholder:text-muted-foreground/60"
                          />
                        </div>
                      </div>
                    </details>
                    <div className="space-y-2">
                      <Label>Assignees (optional)</Label>
                      {isGlobalScopeValue(editDepartmentId) ? (
                        editAssigneeDeptNames.length ? (
                          <p className="text-[13px] text-muted-foreground">
                            Departments: {formatDepartmentNames(editAssigneeDeptNames)}
                          </p>
                        ) : (
                          <p className="text-[13px] text-muted-foreground">
                            When you select an owner, the department will appear here.
                          </p>
                        )
                      ) : null}
                      <div className="rounded-lg border border-border/60 bg-white p-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {editAssigneeIds.map((id) => {
                            const person = userMap.get(id)
                            const email = person && "email" in person ? person.email || "" : ""
                            const label = person?.full_name || person?.username || email || id
                            return (
                              <span key={id} className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs">
                                <span>{label}</span>
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={() => removeEditAssignee(id)}
                                  aria-label={`Remove ${label}`}
                                >
                                  ×
                                </button>
                              </span>
                            )
                          })}
                          <Input
                            value={editAssigneeQuery}
                            onChange={(event) => setEditAssigneeQuery(event.target.value)}
                            onFocus={() => setEditAssigneeOpen(true)}
                            onBlur={() => setTimeout(() => setEditAssigneeOpen(false), 120)}
                            placeholder="Search users..."
                            className="h-8 min-w-[180px] border-0 px-0 focus-visible:ring-0"
                          />
                        </div>
                        {editAssigneeOpen ? (
                          <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-border/60 bg-white shadow-sm">
                            {filteredEditAssignees.length ? (
                              filteredEditAssignees.map((person) => {
                                const isSelected = editAssigneeIds.includes(person.id)
                                const nextIds = isSelected
                                  ? editAssigneeIds.filter((item) => item !== person.id)
                                  : [...editAssigneeIds, person.id]
                                return (
                                  <button
                                    key={person.id}
                                    type="button"
                                    className="flex w-full items-center justify-between px-2 py-2 text-left text-sm hover:bg-muted/60"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => handleEditAssigneesChange(nextIds)}
                                  >
                                    <span>{person.full_name || person.username || ("email" in person ? person.email : "")}</span>
                                    {isSelected ? <span className="text-xs text-muted-foreground">Selected</span> : null}
                                  </button>
                                )
                              })
                            ) : (
                              <div className="px-2 py-2 text-sm text-muted-foreground">No users found.</div>
                            )}
                          </div>
                        ) : null}
                      </div>
                      {editAssigneeError ? (
                        <div className="text-[13px] font-medium text-red-600">{editAssigneeError}</div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <Checkbox checked={editIsActive} onCheckedChange={(value) => setEditIsActive(Boolean(value))} />
                      <span className="text-base">Active</span>
                    </div>
                    <div className="sticky bottom-0 z-10 -mx-6 mt-6 flex items-center justify-end gap-2 border-t border-border/60 bg-white/90 px-6 py-3 backdrop-blur">
                      <Button variant="outline" onClick={() => setEditOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        disabled={editSaving || !editTitle.trim() || !editDepartmentId}
                        onClick={() => void submitEdit()}
                      >
                        {editSaving ? "Saving..." : "Save changes"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {!canCreate ? (
                <span className="text-base text-muted-foreground">Only managers or admins can add tasks.</span>
              ) : null}
            </div>
          ) : null}
        </div>

        {showFilters ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
            <div className="relative flex min-w-[220px] flex-1 items-center">
              <span className="pointer-events-none absolute left-3 text-slate-400">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                  <path
                    d="M14.5 14.5L18 18"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <circle cx="8.75" cy="8.75" r="5.75" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </span>
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by task name..."
                className="h-9 border-slate-200 bg-slate-50 pl-9 pr-16 text-sm focus:bg-white transition-colors"
              />
              <span className="pointer-events-none absolute right-2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-500">
                Ctrl K
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(filterTriggerClass, frequencyFilterActive && filterTriggerActiveClass)}
                  >
                    Frequency: {frequencyLabel}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64">
                  <DropdownMenuLabel>Frequency</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {FREQUENCY_CHIPS.map((chip) => {
                    const isAll = chip.id === "all"
                    const isCombined = chip.id === "3_6_MONTHS"
                    const active = isAll
                      ? allFrequenciesSelected
                      : isCombined
                        ? combinedSelected
                        : frequencyFilters.includes(chip.id as SystemTaskFrequency)
                    const count = isAll
                      ? scopeTemplates.length
                      : isCombined
                        ? (frequencyCounts.get("3_MONTHS") ?? 0) + (frequencyCounts.get("6_MONTHS") ?? 0)
                        : frequencyCounts.get(chip.id as SystemTaskFrequency) ?? 0
                    return (
                      <DropdownMenuCheckboxItem
                        key={chip.id}
                        checked={active}
                        onCheckedChange={() =>
                          toggleFrequencyFilter(chip.id as SystemTaskFrequency | "all" | "3_6_MONTHS")
                        }
                      >
                        <span className="flex flex-1 items-center justify-between">
                          <span>{chip.label}</span>
                          <span className="text-base text-muted-foreground">({count})</span>
                        </span>
                      </DropdownMenuCheckboxItem>
                    )
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={frequencyMultiSelect}
                    onCheckedChange={(value) => setFrequencyMultiSelect(Boolean(value))}
                  >
                    Multi-select frequencies
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(filterTriggerClass, priorityFilterActive && filterTriggerActiveClass)}
                  >
                    Priority: {priorityLabel}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuLabel>Priority</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={allPrioritiesSelected ? "all" : (priorityFilters[0] as TaskPriority)}
                    onValueChange={(value) => togglePriorityFilter(value as TaskPriority | "all")}
                  >
                    <DropdownMenuRadioItem value="all">
                      <span className="flex flex-1 items-center justify-between">
                        <span>All</span>
                        <span className="text-base text-muted-foreground">({scopeTemplates.length})</span>
                      </span>
                    </DropdownMenuRadioItem>
                    {PRIORITY_OPTIONS.map((value) => (
                      <DropdownMenuRadioItem key={value} value={value}>
                        <span className="flex flex-1 items-center justify-between">
                          <span>{PRIORITY_LABELS[value]}</span>
                          <span className="text-base text-muted-foreground">({priorityCounts.get(value) ?? 0})</span>
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                onClick={resetFilters}
                size="sm"
                className="h-8 px-3 text-sm text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                Clear filters
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading tasks...</div>
      ) : sections.length ? (
        <div
          id="system-task-table"
          className={cn(
            "relative w-full rounded-lg border bg-white shadow-sm print:rounded-none print:border-slate-900 print:shadow-none",
            printing && "print:border-0 print:shadow-none"
          )}
        >
          {/* SCROLL WRAPPER for responsive table */}
          <div className="max-h-[calc(100vh-var(--system-tasks-sticky-offset)-1.5rem)] overflow-auto overscroll-contain print:max-h-none print:overflow-visible">
            {/* STICKY HEADER ROW */}
            <div className="min-w-[1000px] xl:min-w-0 print:min-w-0">
              <div className="sticky top-0 z-30 print:static">
                <div className="border-b bg-slate-50/95 backdrop-blur py-3 px-4 print:bg-white print:backdrop-blur-0 print:px-2 print:py-2 print:border-slate-900">
                  <div
                    className={cn(
                      GRID_CLASS,
                      "text-[11px] font-bold uppercase tracking-wider text-slate-500 print:border print:border-slate-900 print:px-2 print:gap-0 print:divide-x print:divide-slate-900 print:text-slate-900 print:[&>*]:px-2 print:[&>*]:py-2"
                    )}
                  >
                    <div>No.</div>
                    <div>Task Title</div>
                    <div>Department</div>
                    <div>Owner</div>
                    <div>Frequency</div>
                    <div>Finish by</div>
                    <div>Priority</div>
                    <div className="text-right">Actions</div>
                  </div>
                </div>
              </div>

              {/* TABLE BODY */}
              <div className="p-4 space-y-2 bg-slate-50 print:bg-white print:p-0 print:space-y-0">
                {(() => {
                  let globalIndex = 0
                  return sections.map((section) => (
                    <React.Fragment key={section.id}>
                      {section.templates.length ? (
                        section.templates.map((template, index) => {
                          const taskNumber = globalIndex + 1
                          globalIndex++
                        const priorityValue = normalizePriority(template.priority)
                        const department = template.department_id ? departmentMap.get(template.department_id) : null
                        const scope = template.scope || (template.department_id ? "DEPARTMENT" : "ALL")
                        const departmentLabel =
                          scope === "GA"
                            ? "GA"
                            : scope === "ALL"
                              ? "ALL"
                              : department
                                ? formatDepartmentName(department.name)
                                : "-"
                        const ownerLabel = assigneeSummary(template.assignees)
                        const isUnassignedAll = !template.department_id && !template.default_assignee_id
                        const frequencyLabel =
                          FREQUENCY_OPTIONS.find((option) => option.value === template.frequency)?.label ??
                          template.frequency

                        const isInactive = template.is_active === false
                        const showInactiveDivider =
                          isInactive && (index === 0 || section.templates[index - 1]?.is_active !== false)

                        // Grouping Logic
                        const prev = index > 0 ? section.templates[index - 1] : null
                        const prevPriority = prev ? normalizePriority(prev.priority) : null
                        const showFrequencyDivider =
                          !isInactive &&
                          (index === 0 || (prev && prev.frequency !== template.frequency))

                        const showPriorityDivider =
                          !isInactive &&
                          !showFrequencyDivider &&
                          prevPriority !== null &&
                          prevPriority !== priorityValue &&
                          priorityValue === "HIGH"

                        return (
                          <React.Fragment key={template.id}>
                            {/* Dividers */}
                            {showInactiveDivider && (
                              <div className="col-span-full border-b border-dashed bg-slate-50 px-2 py-2 text-xs font-semibold uppercase text-slate-400 print:border print:border-slate-900 print:bg-slate-100 print:text-slate-700 print:rounded-none">
                                Inactive Tasks
                              </div>
                            )}
                            {showPriorityDivider && (
                              <div className="col-span-full rounded border-l-4 border-l-transparent bg-red-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-red-400 print:border print:border-slate-900 print:bg-slate-100 print:text-slate-700 print:rounded-none">
                                High Priority
                              </div>
                            )}
                            {showFrequencyDivider && (
                              <div className="col-span-full rounded border-l-4 border-l-transparent bg-slate-100 px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 print:border print:border-slate-900 print:bg-slate-100 print:text-slate-700 print:rounded-none">
                                {frequencyLabel}
                              </div>
                            )}

                            {/* Task Row (Card Style) */}
                            <div
                              className={cn(
                                GRID_CLASS,
                                "py-3 bg-white border border-slate-200 border-l-4 transition-colors hover:bg-slate-50 print:gap-0 print:divide-x print:divide-slate-900 print:border-slate-900 print:border-l-slate-900 print:rounded-none print:shadow-none print:px-2 print:[&>*]:px-2 print:[&>*]:py-2",
                                PRIORITY_BORDER_STYLES[priorityValue],
                                isInactive && "opacity-60 grayscale"
                              )}
                            >
                              <div className="text-sm font-semibold text-slate-600">
                                {taskNumber}
                              </div>
                              {/* Title Only (Description removed from list view) */}
                              <div className="min-w-0 pr-4">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-[15px] font-semibold leading-tight text-slate-900 break-words" title={template.title}>
                                    {template.title}
                                  </div>
                                  <Badge variant="secondary" className="h-5 text-[10px] uppercase">
                                    {template.status || "TODO"}
                                  </Badge>
                                </div>
                              </div>

                              <div className="truncate text-sm text-slate-700 font-normal" title={departmentLabel}>
                                {departmentLabel}
                              </div>

                              <div className="truncate text-sm text-slate-700 font-normal" title={ownerLabel !== "-" ? ownerLabel : ""}>
                                {ownerLabel === "-" && isUnassignedAll ? <span className="text-slate-400">-</span> : ownerLabel}
                              </div>

                              <div>
                                <span className="text-sm text-slate-700 font-normal">
                                  {frequencyLabel}
                                </span>
                              </div>

                              <div className="text-sm text-slate-700 font-normal">
                                {template.finish_period || "-"}
                              </div>

                              <div>
                                <Badge
                                  variant="outline"
                                  className={cn("px-2 py-0.5 text-[13px] border", PRIORITY_BADGE_STYLES[priorityValue])}
                                >
                                  {PRIORITY_LABELS[priorityValue]}
                                </Badge>
                              </div>

                              <div className="text-right">
                                <div className="flex flex-col items-end gap-2">
                                  {allowMarkAsDone && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={updatingTaskIds.has(template.id)}
                                      onClick={() => void toggleTaskStatus(template)}
                                      className="h-7 text-xs"
                                    >
                                      {updatingTaskIds.has(template.id)
                                        ? "Updating..."
                                        : template.status === "DONE"
                                          ? "Mark as TODO"
                                          : "Mark done"}
                                    </Button>
                                  )}
                                  {canEditTemplate(template) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-full border border-transparent text-xs text-slate-500 hover:border-slate-200 hover:bg-white hover:text-blue-600"
                                      onClick={() => startEdit(template)}
                                    >
                                      Edit
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </React.Fragment>
                        )
                      })
                    ) : (
                      <div className="py-12 text-center text-sm text-muted-foreground">
                        No scheduled tasks found.
                      </div>
                    )}
                  </React.Fragment>
                  ))
                })()}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-muted-foreground bg-slate-50">
          No system tasks match the current filters.
        </div>
      )}
    </div>
  )
}

export default function SystemTasksPage() {
  return <SystemTasksView />
}
