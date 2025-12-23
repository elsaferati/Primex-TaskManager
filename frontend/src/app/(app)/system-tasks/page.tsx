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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import type { Department, SystemTaskFrequency, SystemTaskTemplate, TaskPriority, User } from "@/lib/types"

const EMPTY_VALUE = "__none__"
const ALL_DEPARTMENTS_VALUE = "__all_departments__"

const FREQUENCY_OPTIONS = [
  { value: "DAILY", label: "Every day" },
  { value: "WEEKLY", label: "Every week" },
  { value: "MONTHLY", label: "Every month" },
  { value: "3_MONTHS", label: "Every 3 months" },
  { value: "6_MONTHS", label: "Every 6 months" },
  { value: "YEARLY", label: "Every year" },
] as const

const FREQUENCY_VALUES = FREQUENCY_OPTIONS.map((option) => option.value)

const COMBINED_FREQUENCIES: SystemTaskFrequency[] = ["3_MONTHS", "6_MONTHS"]

const FREQUENCY_CHIPS = [
  { id: "all", label: "All" },
  { id: "DAILY", label: "Daily" },
  { id: "WEEKLY", label: "Weekly" },
  { id: "MONTHLY", label: "Monthly" },
  { id: "3_6_MONTHS", label: "3/6 months" },
  { id: "YEARLY", label: "Yearly" },
]

const PRIORITY_OPTIONS: TaskPriority[] = ["LOW", "MEDIUM", "HIGH"]

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "High",
}

const PRIORITY_BADGE_STYLES: Record<TaskPriority, string> = {
  LOW: "border-emerald-200 bg-emerald-50 text-emerald-700",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-700",
  HIGH: "border-red-200 bg-red-50 text-red-700",
  URGENT: "border-red-200 bg-red-50 text-red-700",
}

const PRIORITY_BORDER_STYLES: Record<TaskPriority, string> = {
  LOW: "border-l-emerald-500",
  MEDIUM: "border-l-amber-500",
  HIGH: "border-l-red-600",
  URGENT: "border-l-red-600",
}

const PRIORITY_CHIPS = [
  { id: "all", label: "All" },
  ...PRIORITY_OPTIONS.map((value) => ({ id: value, label: PRIORITY_LABELS[value] })),
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

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, "0"),
  label: new Date(0, index).toLocaleString("en-US", { month: "long" }),
}))

type Section = {
  id: string
  label: string
  date: Date
  templates: SystemTaskTemplate[]
}

function normalizeDate(date: Date) {
  const clone = new Date(date)
  clone.setHours(0, 0, 0, 0)
  return clone
}

function formatDisplayDate(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "short" })
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

function pythonWeekday(date: Date) {
  return (date.getDay() + 6) % 7
}

function shouldRunTemplate(template: SystemTaskTemplate, date: Date) {
  const normalized = normalizeDate(date)
  const month = normalized.getMonth() + 1
  const day = normalized.getDate()
  const weekday = pythonWeekday(normalized)

  if (!template.frequency) return false

  switch (template.frequency) {
    case "DAILY":
      return true
    case "WEEKLY":
      return weekday === (template.day_of_week ?? 0)
    case "MONTHLY":
      return day === (template.day_of_month ?? 1)
    case "YEARLY":
      if (template.month_of_year != null && template.month_of_year !== month) return false
      if (template.day_of_month != null && template.day_of_month !== day) return false
      return true
    case "3_MONTHS":
      if (template.month_of_year != null && template.month_of_year !== month) return false
      if (template.day_of_month != null && template.day_of_month !== day) return false
      return month % 3 === 0
    case "6_MONTHS":
      if (template.month_of_year != null && template.month_of_year !== month) return false
      if (template.day_of_month != null && template.day_of_month !== day) return false
      return month % 6 === 0
    default:
      return false
  }
}

function normalizePriority(value?: TaskPriority | null): TaskPriority {
  if (value === "URGENT") return "HIGH"
  if (value && PRIORITY_OPTIONS.includes(value)) return value
  return "MEDIUM"
}

export default function SystemTasksPage() {
  const { apiFetch, user } = useAuth()
  const [templates, setTemplates] = React.useState<SystemTaskTemplate[]>([])
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [loading, setLoading] = React.useState(true)
  const [customDate, setCustomDate] = React.useState("")
  const [createOpen, setCreateOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [showAllTemplates, setShowAllTemplates] = React.useState(true)
  const [frequencyFilters, setFrequencyFilters] = React.useState<SystemTaskFrequency[]>([])
  const [frequencyMultiSelect, setFrequencyMultiSelect] = React.useState(false)
  const [priorityFilters, setPriorityFilters] = React.useState<TaskPriority[]>([])
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [departmentId, setDepartmentId] = React.useState("")
  const [defaultAssignee, setDefaultAssignee] = React.useState(EMPTY_VALUE)
  const [frequency, setFrequency] = React.useState<SystemTaskFrequency>("DAILY")
  const [priority, setPriority] = React.useState<TaskPriority>("MEDIUM")
  const [dayOfWeek, setDayOfWeek] = React.useState("")
  const [dayOfMonth, setDayOfMonth] = React.useState("")
  const [monthOfYear, setMonthOfYear] = React.useState(EMPTY_VALUE)
  const [isActive, setIsActive] = React.useState(true)

  const canCreate = user?.role !== "STAFF"
  const canDelete = user?.role === "ADMIN"

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [templatesRes, departmentsRes] = await Promise.all([
        apiFetch("/system-tasks?only_active=true"),
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
    if (departments.length === 0) return
    if (!departmentId) {
      setDepartmentId(user?.department_id || departments[0].id)
    }
  }, [departments, departmentId, user?.department_id])

  const departmentMap = React.useMemo(() => {
    return new Map(departments.map((dept) => [dept.id, dept]))
  }, [departments])

  const userMap = React.useMemo(() => {
    return new Map(users.map((u) => [u.id, u]))
  }, [users])

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
    if (frequencyFilters.length) {
      const allowed = new Set(frequencyFilters)
      filtered = filtered.filter((template) => allowed.has(template.frequency))
    }
    if (priorityFilters.length) {
      const allowed = new Set(priorityFilters)
      filtered = filtered.filter((template) => allowed.has(normalizePriority(template.priority)))
    }
    return filtered
  }, [frequencyFilters, priorityFilters, templates])

  React.useEffect(() => {
    const combinedSelected =
      COMBINED_FREQUENCIES.every((value) => frequencyFilters.includes(value)) &&
      frequencyFilters.length >= COMBINED_FREQUENCIES.length
    if (!frequencyMultiSelect && frequencyFilters.length > 1 && !combinedSelected) {
      setFrequencyFilters([frequencyFilters[0]])
    }
  }, [frequencyFilters, frequencyMultiSelect])

  const customDateObject = React.useMemo(() => {
    if (!customDate) return null
    const parsed = new Date(`${customDate}T00:00:00`)
    return Number.isNaN(parsed.getTime()) ? null : normalizeDate(parsed)
  }, [customDate])

  const sections = React.useMemo<Section[]>(() => {
    if (showAllTemplates || !customDateObject) {
      const sorted = [...filteredTemplates].sort((a, b) => a.title.localeCompare(b.title))
      return [
        {
          id: "all-templates",
          label: "All system tasks",
          date: new Date(),
          templates: sorted,
        },
      ]
    }

    const scheduled = filteredTemplates.filter((template) => shouldRunTemplate(template, customDateObject))
    return [
      {
        id: `custom-${customDateObject.toISOString()}`,
        label: `Selected date - ${formatDisplayDate(customDateObject)}`,
        date: customDateObject,
        templates: scheduled,
      },
    ]
  }, [customDateObject, filteredTemplates, showAllTemplates])

  const resetFilters = () => {
    setCustomDate("")
    setShowAllTemplates(true)
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
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        department_id:
          departmentId === ALL_DEPARTMENTS_VALUE ? null : departmentId,
        default_assignee_id: defaultAssignee === EMPTY_VALUE ? null : defaultAssignee,
        frequency,
        priority,
        day_of_week: dayOfWeek ? Number(dayOfWeek) : null,
        day_of_month: dayOfMonth ? Number(dayOfMonth) : null,
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
      setDefaultAssignee(EMPTY_VALUE)
      setDayOfWeek("")
      setDayOfMonth("")
      setMonthOfYear(EMPTY_VALUE)
      setFrequency("DAILY")
      setPriority("MEDIUM")
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
    setPriorityFilters((prev) => (prev.includes(value) ? [] : [value]))
  }

  const deleteTemplate = async (templateId: string) => {
    if (!canDelete) return
    const confirmed = window.confirm("Delete this system task? This cannot be undone.")
    if (!confirmed) return
    setDeletingId(templateId)
    try {
      const res = await apiFetch(`/system-tasks/${templateId}`, { method: "DELETE" })
      if (!res.ok) return
      setTemplates((prev) => prev.filter((template) => template.id !== templateId))
    } finally {
      setDeletingId(null)
    }
  }

  const availableAssignees = React.useMemo(() => {
    if (!departmentId || departmentId === ALL_DEPARTMENTS_VALUE) return users
    return users.filter((u) => u.department_id === departmentId)
  }, [departmentId, users])
  const combinedSelected =
    COMBINED_FREQUENCIES.every((value) => frequencyFilters.includes(value)) &&
    frequencyFilters.length >= COMBINED_FREQUENCIES.length
  const allFrequenciesSelected = frequencyFilters.length === 0
  const allPrioritiesSelected = priorityFilters.length === 0

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

    const getIndex = (name: string, aliases: string[] = []) => {
      const target = [name, ...aliases]
      return header.findIndex((cell) => target.includes(cell.replace(/\s+/g, "")))
    }

    const idxTitle = hasHeader ? getIndex("title") : 0
    const idxDescription = hasHeader ? getIndex("description") : 1
    const idxDepartment = hasHeader ? getIndex("department", ["departmentcode", "department_code"]) : 2
    const idxFrequency = hasHeader ? getIndex("frequency") : 3
    const idxPriority = hasHeader ? getIndex("priority") : noHeaderHasPriority ? 4 : -1
    const idxDayOfWeek = hasHeader ? getIndex("dayofweek", ["day_of_week"]) : noHeaderHasPriority ? 5 : 4
    const idxDayOfMonth = hasHeader ? getIndex("dayofmonth", ["day_of_month"]) : noHeaderHasPriority ? 6 : 5
    const idxMonthOfYear = hasHeader ? getIndex("monthofyear", ["month_of_year"]) : noHeaderHasPriority ? 7 : 6
    const idxAssignee = hasHeader ? getIndex("defaultassignee", ["assignee"]) : noHeaderHasPriority ? 8 : 7
    const idxActive = hasHeader ? getIndex("active") : noHeaderHasPriority ? 9 : 8

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
      if (raw.includes("medium")) return "MEDIUM"
      if (raw.includes("low")) return "LOW"
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

      const payload = {
        title,
        description: row[idxDescription]?.trim() || null,
        department_id: departmentIdForValue(row[idxDepartment] || ""),
        default_assignee_id: assigneeIdForValue(row[idxAssignee] || ""),
        frequency: frequencyValue,
        priority: priorityValue,
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">System Tasks</h3>
          <p className="text-sm text-muted-foreground">
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
          >
            Import Excel
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Export</span>
            <Button variant="outline" onClick={() => exportTemplatesCSV("all")}>
              Export All
            </Button>
            <Button variant="outline" onClick={() => exportTemplatesCSV("active")}>
              Export Open
            </Button>
            <Button variant="outline" onClick={() => exportTemplatesCSV("inactive")}>
              Export Closed
            </Button>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={!canCreate}>
                + Add Task
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add system task</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Select value={departmentId} onValueChange={setDepartmentId}>
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
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Frequency</Label>
                    <Select value={frequency} onValueChange={(value) => setFrequency(value as SystemTaskFrequency)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
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
                  {frequency === "WEEKLY" ? (
                    <div className="space-y-2 md:col-span-2">
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
                </div>
                {(frequency === "MONTHLY" ||
                  frequency === "YEARLY" ||
                  frequency === "3_MONTHS" ||
                  frequency === "6_MONTHS") && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Day of month</Label>
                      <Input
                        type="number"
                        min={1}
                        max={31}
                        value={dayOfMonth}
                        onChange={(event) => setDayOfMonth(event.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="1-31"
                      />
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
                <div className="space-y-2">
                  <Label>Default assignee (optional)</Label>
                  <Select value={defaultAssignee} onValueChange={setDefaultAssignee}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_VALUE}>None</SelectItem>
                      {availableAssignees.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.full_name || person.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox checked={isActive} onCheckedChange={(value) => setIsActive(Boolean(value))} />
                  <span className="text-sm">Active</span>
                </div>
                <div className="flex justify-end">
                  <Button disabled={saving || !title.trim() || !departmentId} onClick={() => void submit()}>
                    {saving ? "Saving..." : "Save task"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          {!canCreate ? (
            <span className="text-xs text-muted-foreground">Only managers or admins can add tasks.</span>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-border/70 bg-gradient-to-br from-muted/80 to-muted p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3" id="system-all-freq-chips">
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
                <button
                  key={chip.id}
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition shadow-sm",
                    isAll && "px-5 font-semibold tracking-tight",
                    active
                      ? "border-black bg-black text-white shadow-md ring-1 ring-white/10"
                      : isAll
                        ? "border-black bg-black text-white shadow-md"
                        : "border-black/70 bg-black/80 text-white/70 hover:border-black hover:bg-black hover:text-white hover:shadow-md"
                  )}
                  onClick={() =>
                    toggleFrequencyFilter(chip.id as SystemTaskFrequency | "all" | "3_6_MONTHS")
                  }
                >
                  <span>{chip.label}</span>
                  {isAll ? null : (
                    <span className={cn("text-xs", active ? "text-white/80" : "text-white/60")}>
                      ({count})
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              id="system-all-multi-toggle"
              type="checkbox"
              className="h-4 w-4 rounded border"
              checked={frequencyMultiSelect}
              onChange={(event) => setFrequencyMultiSelect(event.target.checked)}
            />
            Multi-select frequencies
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3" id="system-priority-chips">
          {PRIORITY_CHIPS.map((chip) => {
            const isAll = chip.id === "all"
            const active = isAll
              ? allPrioritiesSelected
              : priorityFilters.includes(chip.id as TaskPriority)
            const count = isAll
              ? templates.length
              : priorityCounts.get(chip.id as TaskPriority) ?? 0
            return (
              <button
                key={chip.id}
                type="button"
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition shadow-sm",
                  isAll && "px-5 font-semibold tracking-tight",
                  active
                    ? "border-black bg-black text-white shadow-md ring-1 ring-white/10"
                    : isAll
                      ? "border-black bg-black text-white shadow-md"
                      : "border-black/70 bg-black/80 text-white/70 hover:border-black hover:bg-black hover:text-white hover:shadow-md"
                )}
                onClick={() => togglePriorityFilter(chip.id as TaskPriority | "all")}
              >
                <span>{chip.label}</span>
                {isAll ? null : (
                  <span className={cn("text-xs", active ? "text-white/80" : "text-white/60")}>
                    ({count})
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Input
              id="system-date"
              type="date"
              className="w-auto rounded-md"
              value={customDate}
              onChange={(event) => {
                const nextValue = event.target.value
                setCustomDate(nextValue)
                setShowAllTemplates(!nextValue)
              }}
            />
          </div>
          <Button variant="outline" onClick={resetFilters}>
            Clear filters
          </Button>
          <Button variant="outline" onClick={() => setShowAllTemplates((prev) => !prev)}>
            {showAllTemplates ? "Show scheduled" : "Show all tasks"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : sections.length ? (
        <div id="system-task-sections" className="space-y-4">
          {sections.map((section) => (
            <Card key={section.id}>
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="text-sm">{section.label}</CardTitle>
                <Badge variant="secondary">{section.templates.length}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {section.templates.length ? (
                  section.templates.map((template) => {
                    const priorityValue = normalizePriority(template.priority)
                    return (
                      <div
                        key={template.id}
                        className={cn(
                          "rounded-md border border-l-4 p-3",
                          PRIORITY_BORDER_STYLES[priorityValue]
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold">{template.title}</div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {FREQUENCY_OPTIONS.find((option) => option.value === template.frequency)?.label ??
                                template.frequency}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn("border px-2 py-0.5 text-[11px]", PRIORITY_BADGE_STYLES[priorityValue])}
                            >
                              {PRIORITY_LABELS[priorityValue]}
                            </Badge>
                            {canDelete ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                disabled={deletingId === template.id}
                                onClick={() => void deleteTemplate(template.id)}
                              >
                                {deletingId === template.id ? "Deleting..." : "Delete"}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        {template.description ? (
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        ) : null}
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span>
                            Dept:{" "}
                            {template.department_id
                              ? departmentMap.get(template.department_id)?.name ?? "-"
                              : "All departments"}
                          </span>
                          <span>
                            Assignee: {userMap.get(template.default_assignee_id || "")?.full_name || "-"}
                          </span>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-sm text-muted-foreground">No scheduled tasks.</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No system tasks match the current filters.
        </div>
      )}
    </div>
  )
}
