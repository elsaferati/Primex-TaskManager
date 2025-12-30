"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import type { Department, SystemTaskFrequency, SystemTaskTemplate, TaskFinishPeriod, TaskPriority, User } from "@/lib/types"

const EMPTY_VALUE = "__none__"
const ALL_DEPARTMENTS_VALUE = "__all_departments__"
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

const PRIORITY_BORDER_STYLES: Record<TaskPriority, string> = {
  NORMAL: "border-l-[#F97316]",
  HIGH: "border-l-[#EF4444]",
}

const PRIORITY_CHIPS = [
  { id: "all", label: "All" },
  ...PRIORITY_OPTIONS.map((value) => ({ id: value, label: PRIORITY_LABELS[value] })),
]

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

const INTERNAL_NOTE_FIELDS = [
  { key: "REGJ", label: "REGJ", placeholder: "0" },
  { key: "PATH", label: "PATH", placeholder: "S:\\03_HOMEFACE\\04_PLAN PRODUTION\\2023" },
  { key: "CHECK", label: "CHECK", placeholder: "S:\\03_HOMEFACE\\01_CHECKLISTA\\01_CHECKLISTA" },
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
]

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, "0"),
  label: new Date(0, index).toLocaleString("en-US", { month: "long" }),
}))

const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, index) => ({
  value: String(index + 1),
  label: String(index + 1),
}))

type Section = {
  id: string
  label: string
  date: Date
  templates: SystemTaskTemplate[]
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

function normalizePriority(value?: TaskPriority | null): TaskPriority {
  if (value === "URGENT") return "HIGH"
  if (value === "LOW" || value === "MEDIUM") return "NORMAL"
  if (value && PRIORITY_OPTIONS.includes(value)) return value
  return "NORMAL"
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

export default function SystemTasksPage() {
  const { apiFetch, user } = useAuth()
  const [templates, setTemplates] = React.useState<SystemTaskTemplate[]>([])
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [loading, setLoading] = React.useState(true)
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

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [departmentId, setDepartmentId] = React.useState("")
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
  const [dayOfWeek, setDayOfWeek] = React.useState("")
  const [dayOfMonth, setDayOfMonth] = React.useState("")
  const [monthOfYear, setMonthOfYear] = React.useState(EMPTY_VALUE)
  const [isActive, setIsActive] = React.useState(true)
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
  const [editDayOfWeek, setEditDayOfWeek] = React.useState("")
  const [editDayOfMonth, setEditDayOfMonth] = React.useState("")
  const [editMonthOfYear, setEditMonthOfYear] = React.useState(EMPTY_VALUE)
  const [editIsActive, setEditIsActive] = React.useState(true)

  const canEdit = user?.role !== "STAFF"
  const canCreate = canEdit

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [templatesRes, departmentsRes] = await Promise.all([
        apiFetch("/system-tasks"),
        apiFetch("/departments"),
      ])
      if (templatesRes.ok) {
        setTemplates((await templatesRes.json()) as SystemTaskTemplate[])
      }
      if (departmentsRes.ok) {
        setDepartments((await departmentsRes.json()) as Department[])
      }
      if (canCreate) {
        const usersRes = await apiFetch("/users")
        if (usersRes.ok) {
          setUsers((await usersRes.json()) as User[])
        }
      }
    } finally {
      setLoading(false)
    }
  }, [apiFetch, canCreate])

  React.useEffect(() => {
    void load()
  }, [load])

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
      setDepartmentId(ALL_DEPARTMENTS_VALUE)
    }
  }, [departments, departmentId, user?.department_id])

  React.useEffect(() => {
    if (!editTemplate) return
    setEditTitle(editTemplate.title || "")
    setEditDescription(editTemplate.description || "")
    setEditDepartmentId(editTemplate.department_id ?? ALL_DEPARTMENTS_VALUE)
    const editIds =
      editTemplate.assignees?.map((assignee) => assignee.id) ??
      (editTemplate.default_assignee_id ? [editTemplate.default_assignee_id] : [])
    setEditAssigneeIds(editIds)
    setEditFrequency(editTemplate.frequency)
    setEditPriority(normalizePriority(editTemplate.priority))
    setEditFinishPeriod(editTemplate.finish_period ?? FINISH_PERIOD_NONE_VALUE)
    setEditInternalNotes(parseInternalNotes(editTemplate.internal_notes))
    setEditDayOfWeek(editTemplate.day_of_week != null ? String(editTemplate.day_of_week) : "")
    setEditDayOfMonth(
      editTemplate.day_of_month === 0
        ? END_OF_MONTH_VALUE
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
    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]}, ${names[1]}`
    return `${names[0]}, ${names[1]} +${names.length - 2}`
  }, [])

  const ownerDepartmentId = React.useCallback(
    (ownerId: string) => userMap.get(ownerId)?.department_id ?? null,
    [userMap]
  )

  const validateOwners = React.useCallback(
    (deptId: string, ownerIds: string[]) => {
      if (!ownerIds.length) return { ok: true }
      if (!deptId || deptId === ALL_DEPARTMENTS_VALUE) return { ok: true }
      const allMatch = ownerIds.every((id) => ownerDepartmentId(id) === deptId)
      if (!allMatch) {
        return {
          ok: false,
          message: "Owners duhet me qene prej te njejtit departament. Ndrysho departamentin ose hiq ownerin.",
        }
      }
      return { ok: true }
    },
    [ownerDepartmentId]
  )

  const handleDepartmentChange = (nextDeptId: string) => {
    setDepartmentId(nextDeptId)
    if (nextDeptId === ALL_DEPARTMENTS_VALUE) {
      setAssigneeIds([])
      setAssigneeError(null)
      return
    }
    setAssigneeIds((prev) => prev.filter((id) => ownerDepartmentId(id) === nextDeptId))
    setAssigneeError(null)
  }

  const handleEditDepartmentChange = (nextDeptId: string) => {
    setEditDepartmentId(nextDeptId)
    if (nextDeptId === ALL_DEPARTMENTS_VALUE) {
      setEditAssigneeIds([])
      setEditAssigneeError(null)
      return
    }
    setEditAssigneeIds((prev) => prev.filter((id) => ownerDepartmentId(id) === nextDeptId))
    setEditAssigneeError(null)
  }

  const handleAssigneesChange = (nextOwnerIds: string[]) => {
    if (!nextOwnerIds.length) {
      setAssigneeIds([])
      setAssigneeError(null)
      return
    }
    const firstDept = ownerDepartmentId(nextOwnerIds[0])
    if (!firstDept) return
    if (departmentId !== ALL_DEPARTMENTS_VALUE) {
      const allMatch = nextOwnerIds.every((id) => ownerDepartmentId(id) === departmentId)
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
    const firstDept = ownerDepartmentId(nextOwnerIds[0])
    if (!firstDept) return
    if (editDepartmentId !== ALL_DEPARTMENTS_VALUE) {
      const allMatch = nextOwnerIds.every((id) => ownerDepartmentId(id) === editDepartmentId)
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

  const frequencyCounts = React.useMemo(() => {
    const counts = new Map<SystemTaskFrequency, number>()
    for (const value of FREQUENCY_VALUES) {
      counts.set(value as SystemTaskFrequency, 0)
    }
    for (const template of templates) {
      counts.set(template.frequency, (counts.get(template.frequency) || 0) + 1)
    }
    return counts
  }, [templates])

  const priorityCounts = React.useMemo(() => {
    const counts = new Map<TaskPriority, number>()
    for (const value of PRIORITY_OPTIONS) {
      counts.set(value, 0)
    }
    for (const template of templates) {
      const normalized = normalizePriority(template.priority)
      counts.set(normalized, (counts.get(normalized) || 0) + 1)
    }
    return counts
  }, [templates])

  const filteredTemplates = React.useMemo(() => {
    let filtered = templates
    const query = searchQuery.trim().toLowerCase()
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
  }, [frequencyFilters, priorityFilters, searchQuery, templates])


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
      const aPriority = PRIORITY_SORT_ORDER[normalizePriority(a.priority)]
      const bPriority = PRIORITY_SORT_ORDER[normalizePriority(b.priority)]
      if (aPriority !== bPriority) return aPriority - bPriority
      const aFrequency = frequencyOrder[a.frequency]
      const bFrequency = frequencyOrder[b.frequency]
      if (aFrequency !== bFrequency) return aFrequency - bFrequency
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
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        department_id:
          finalDeptId === ALL_DEPARTMENTS_VALUE ? null : finalDeptId,
        assignees: assigneeIds,
        frequency,
        priority,
        finish_period: finishPeriod === FINISH_PERIOD_NONE_VALUE ? null : finishPeriod,
        internal_notes: buildInternalNotes(internalNotes),
        day_of_week: dayOfWeek ? Number(dayOfWeek) : null,
        day_of_month:
          dayOfMonth === END_OF_MONTH_VALUE ? 0 : dayOfMonth ? Number(dayOfMonth) : null,
        month_of_year:
          monthOfYear && monthOfYear !== EMPTY_VALUE ? Number(monthOfYear) : null,
        is_active: isActive,
      }
      const res = await apiFetch("/system-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) return
      setCreateOpen(false)
      setTitle("")
      setDescription("")
      setAssigneeIds([])
      setAssigneeQuery("")
      setAssigneeError(null)
      setDayOfWeek("")
      setDayOfMonth("")
      setMonthOfYear(EMPTY_VALUE)
      setFrequency("DAILY")
      setPriority("NORMAL")
      setFinishPeriod(FINISH_PERIOD_NONE_VALUE)
      setInternalNotes({})
      setIsActive(true)
      await load()
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

  const startEdit = (template: SystemTaskTemplate) => {
    if (!canEdit) return
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
    setEditSaving(true)
    try {
      const payload = {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        department_id:
          finalDeptId === ALL_DEPARTMENTS_VALUE ? null : finalDeptId,
        assignees: editAssigneeIds,
        frequency: editFrequency,
        priority: editPriority,
        finish_period: editFinishPeriod === FINISH_PERIOD_NONE_VALUE ? null : editFinishPeriod,
        internal_notes: buildInternalNotes(editInternalNotes),
        day_of_week: editDayOfWeek ? Number(editDayOfWeek) : null,
        day_of_month:
          editDayOfMonth === END_OF_MONTH_VALUE
            ? 0
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
      if (!res.ok) return
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
    if (!departmentId || departmentId === ALL_DEPARTMENTS_VALUE) return users
    return users.filter((u) => u.department_id === departmentId)
  }, [departmentId, users])
  const editAvailableAssignees = React.useMemo(() => {
    if (!editDepartmentId || editDepartmentId === ALL_DEPARTMENTS_VALUE) return users
    return users.filter((u) => u.department_id === editDepartmentId)
  }, [editDepartmentId, users])
  const filteredAssignees = React.useMemo(() => {
    const query = assigneeQuery.trim().toLowerCase()
    if (!query) return availableAssignees
    return availableAssignees.filter((person) => {
      const name = `${person.full_name || ""} ${person.username || ""} ${person.email}`.toLowerCase()
      return name.includes(query)
    })
  }, [assigneeQuery, availableAssignees])
  const filteredEditAssignees = React.useMemo(() => {
    const query = editAssigneeQuery.trim().toLowerCase()
    const base = !query
      ? editAvailableAssignees
      : editAvailableAssignees.filter((person) => {
          const name = `${person.full_name || ""} ${person.username || ""} ${person.email}`.toLowerCase()
          return name.includes(query)
        })
    return [...base].sort((a, b) => {
      const aSelected = editAssigneeIds.includes(a.id)
      const bSelected = editAssigneeIds.includes(b.id)
      if (aSelected !== bSelected) return aSelected ? -1 : 1
      const aName = (a.full_name || a.username || a.email).toLowerCase()
      const bName = (b.full_name || b.username || b.email).toLowerCase()
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
    const body = rows.map((template) => {
      const department = template.department_id ? departmentMap.get(template.department_id) : null
      const assignee = template.default_assignee_id ? userMap.get(template.default_assignee_id) : null
      return [
        template.title,
        template.description || "",
        department ? department.name : "All departments",
        department ? department.code : "",
        template.frequency,
        normalizePriority(template.priority),
        template.finish_period || "",
        template.day_of_week ?? "",
        template.day_of_month ?? "",
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

    const dayOfWeekForValue = (value: string) => {
      const raw = normalize(value)
      if (!raw) return null
      const numeric = Number(raw)
      if (!Number.isNaN(numeric)) return numeric
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
      return map[raw] ?? null
    }

    const departmentIdForValue = (value: string) => {
      const raw = normalize(value)
      if (!raw || raw === "all" || raw === "all departments") return null
      const byCode = departments.find((dept) => dept.code.toLowerCase() === raw)
      if (byCode) return byCode.id
      const byName = departments.find((dept) => dept.name.toLowerCase() === raw)
      return byName?.id ?? null
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

    for (const row of dataRows) {
      const title = row[idxTitle]?.trim()
      if (!title) continue
      const frequencyValue = frequencyForValue(row[idxFrequency] || "")
      if (!frequencyValue) continue
      const priorityValue =
        idxPriority >= 0 ? priorityForValue(row[idxPriority] || "") : null
      const finishPeriodValue =
        idxFinishPeriod >= 0 ? finishPeriodForValue(row[idxFinishPeriod] || "") : null

      const payload = {
        title,
        description: row[idxDescription]?.trim() || null,
        department_id: departmentIdForValue(row[idxDepartment] || ""),
        default_assignee_id: assigneeIdForValue(row[idxAssignee] || ""),
        frequency: frequencyValue,
        priority: priorityValue,
        finish_period: finishPeriodValue,
        day_of_week: dayOfWeekForValue(row[idxDayOfWeek] || ""),
        day_of_month: row[idxDayOfMonth] ? Number(row[idxDayOfMonth]) : null,
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

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border/60 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold leading-tight text-slate-900">System Tasks</h3>
            <p className="text-sm font-normal leading-snug text-slate-500">
              Department tasks organized by frequency and date.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (file) await importTemplatesFromFile(file)
              event.target.value = ""
            }}
          />
          <Button
            variant="outline"
            disabled={!canCreate}
            onClick={() => fileInputRef.current?.click()}
            size="sm"
            className="h-9 border-blue-200 px-3 text-sm text-blue-700 hover:bg-blue-50 hover:text-blue-800"
          >
            Import Excel
          </Button>
          <Button
            variant="outline"
            onClick={() => exportTemplatesCSV("all")}
            size="sm"
            className="h-9 border-blue-200 px-3 text-sm text-blue-700 hover:bg-blue-50 hover:text-blue-800"
          >
            Export All
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
                        {departments.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name} ({dept.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input value={title} onChange={(event) => setTitle(event.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
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
                {frequency === "WEEKLY" ? (
                  <div className="space-y-2">
                    <Label>Day of week</Label>
                    <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select day" />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEK_DAYS.map((day) => (
                          <SelectItem key={day.value} value={day.value}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                          <SelectItem value={END_OF_MONTH_VALUE}>End of month</SelectItem>
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
                  {departmentId === ALL_DEPARTMENTS_VALUE ? (
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
                        const label = person?.full_name || person?.username || person?.email || id
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
                                <span>{person.full_name || person.username || person.email}</span>
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
          <Dialog
            open={editOpen}
            onOpenChange={(open) => {
              setEditOpen(open)
              if (!open) setEditTemplate(null)
            }}
          >
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
                        {departments.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name} ({dept.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                  />
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
                {editFrequency === "WEEKLY" ? (
                  <div className="space-y-2">
                    <Label>Day of week</Label>
                    <Select value={editDayOfWeek} onValueChange={setEditDayOfWeek}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select day" />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEK_DAYS.map((day) => (
                          <SelectItem key={day.value} value={day.value}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                          <SelectItem value={END_OF_MONTH_VALUE}>End of month</SelectItem>
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
                  {editDepartmentId === ALL_DEPARTMENTS_VALUE ? (
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
                        const label = person?.full_name || person?.username || person?.email || id
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
                                <span>{person.full_name || person.username || person.email}</span>
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
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
              className="h-9 border-slate-200 bg-white pl-9 pr-16 text-sm"
            />
            <span className="pointer-events-none absolute right-2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-500">
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
                    ? templates.length
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
                      <span className="text-base text-muted-foreground">({templates.length})</span>
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
      </div>

      {loading ? (
        <div className="text-base text-muted-foreground">Loading...</div>
      ) : sections.length ? (
        <div id="system-task-sections" className="space-y-2">
          {sections.map((section) => (
            <Card key={section.id} className="rounded-lg border border-border/70 bg-white shadow-sm">
              <CardHeader className="flex items-center justify-between border-b border-border/70 bg-slate-50 px-4 py-2">
                <CardTitle className="text-base font-semibold text-slate-800">
                  {section.label}
                </CardTitle>
                <Badge variant="secondary">{section.templates.length}</Badge>
              </CardHeader>
              <CardContent className="space-y-0.5 pt-3">
                <div className="overflow-x-auto">
                  <div className="min-w-[880px] space-y-1">
                    <div className="grid grid-cols-[minmax(260px,1.6fr)_minmax(160px,1fr)_minmax(160px,1fr)_minmax(120px,0.6fr)_minmax(110px,0.5fr)_minmax(110px,0.5fr)_minmax(90px,0.4fr)] items-center gap-1.5 border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-semibold uppercase leading-tight tracking-[0.08em] text-slate-500">
                      <div>Task Title</div>
                      <div>Department</div>
                      <div>Owner</div>
                      <div className="whitespace-nowrap">Frequency</div>
                      <div className="whitespace-nowrap">Finish by</div>
                      <div className="whitespace-nowrap">Priority</div>
                      <div className="text-center whitespace-nowrap text-muted-foreground" />
                    </div>
                    {section.templates.length ? (
                      section.templates.map((template, index) => {
                        const priorityValue = normalizePriority(template.priority)
                        const department = template.department_id ? departmentMap.get(template.department_id) : null
                        const assigneeDeptNames = departmentNamesForAssignees(template.assignees)
                        const ownerLabel = assigneeSummary(template.assignees)
                        const isUnassignedAll = !template.department_id && !template.default_assignee_id
                        const frequencyLabel =
                          FREQUENCY_OPTIONS.find((option) => option.value === template.frequency)?.label ??
                          template.frequency
                        const isInactive = template.is_active === false
                        const showInactiveDivider =
                          isInactive && (index === 0 || section.templates[index - 1]?.is_active !== false)
                        const prev = index > 0 ? section.templates[index - 1] : null
                        const prevPriority = prev ? normalizePriority(prev.priority) : null
                        const showPriorityDivider =
                          prevPriority !== null && prevPriority !== priorityValue && priorityValue === "HIGH"
                        const showFrequencyDivider =
                          index === 0 ||
                          (prev && prev.frequency !== template.frequency) ||
                          (prevPriority !== null && prevPriority !== priorityValue)
                        return (
                          <React.Fragment key={template.id}>
                            {showInactiveDivider ? (
                              <div className="flex items-center gap-1.5 border-t border-dashed pt-1 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                                <span>Inactive tasks</span>
                              </div>
                            ) : null}
                            {showPriorityDivider ? (
                              <div className="flex items-center gap-2 border-t border-slate-200/70 bg-slate-50/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500">
                                  {PRIORITY_LABELS[priorityValue]}
                                </span>
                              </div>
                            ) : null}
                            {showFrequencyDivider ? (
                              <div className="flex items-center gap-2 border-t border-slate-200/70 bg-white px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500">
                                  {frequencyLabel}
                                </span>
                              </div>
                            ) : null}
                            <div
                              className={cn(
                                "grid grid-cols-[minmax(260px,1.6fr)_minmax(160px,1fr)_minmax(160px,1fr)_minmax(120px,0.6fr)_minmax(110px,0.5fr)_minmax(110px,0.5fr)_minmax(90px,0.4fr)] items-center gap-2 border border-slate-200 border-l-4 bg-white px-3 py-3 text-[14px] font-normal leading-tight transition-colors hover:bg-blue-50/40",
                                PRIORITY_BORDER_STYLES[priorityValue]
                              )}
                            >
                              <div className="space-y-0">
                                <div className="text-[15px] font-semibold leading-tight text-slate-900">
                                  {template.title}
                                </div>
                              </div>
                              <div className="text-[14px] font-normal text-slate-700">
                                {department
                                  ? department.name
                                  : assigneeDeptNames.length
                                    ? formatDepartmentNames(assigneeDeptNames)
                                    : isInactive && isUnassignedAll
                                      ? "NONE"
                                      : "ALL"}
                              </div>
                              <div className="text-[14px] font-normal text-slate-700">
                                {ownerLabel === "-" && isUnassignedAll ? "-" : ownerLabel}
                              </div>
                              <div className="text-[14px] font-normal text-slate-700 whitespace-nowrap">{frequencyLabel}</div>
                              <div className="text-[14px] font-normal text-slate-700 whitespace-nowrap">
                                {template.finish_period || "-"}
                              </div>
                              <div className="flex items-center justify-start">
                                <Badge
                                  variant="outline"
                                  className={cn("border px-2 py-0.5 text-[13px]", PRIORITY_BADGE_STYLES[priorityValue])}
                                >
                                  {PRIORITY_LABELS[priorityValue]}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-center">
                                {canEdit ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                                    onClick={() => startEdit(template)}
                                  >
                                    Edit
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </React.Fragment>
                        )
                      })
                    ) : (
                      <div className="text-base text-muted-foreground">No scheduled tasks.</div>
                    )}
                    {section.templates.some((template) => template.is_active === false) ? (
                      <div className="border-t pt-3 text-base text-muted-foreground">
                        Inactive tasks are listed at the bottom.
                      </div>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-4 text-base text-muted-foreground">
          No system tasks match the current filters.
        </div>
      )}
    </div>
  )
}


