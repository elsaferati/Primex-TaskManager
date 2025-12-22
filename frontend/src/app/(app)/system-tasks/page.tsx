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
import type { Department, SystemTaskFrequency, SystemTaskTemplate, User } from "@/lib/types"

const DAY_FILTERS = [
  { id: "today", label: "Sot", offset: 0 },
  { id: "yesterday", label: "Dje", offset: -1 },
  { id: "tomorrow", label: "Nesër", offset: 1 },
] as const

const EMPTY_VALUE = "__none__"

const FREQUENCY_OPTIONS = [
  { value: "DAILY", label: "Çdo ditë" },
  { value: "WEEKLY", label: "Çdo javë" },
  { value: "MONTHLY", label: "Çdo muaj" },
  { value: "YEARLY", label: "Çdo vit" },
  { value: "3_MONTHS", label: "Çdo 3 muaj" },
  { value: "6_MONTHS", label: "Çdo 6 muaj" },
] as const

const WEEK_DAYS = [
  { value: "0", label: "E Hënë" },
  { value: "1", label: "E Martë" },
  { value: "2", label: "E Mërkurë" },
  { value: "3", label: "E Enjte" },
  { value: "4", label: "E Premte" },
  { value: "5", label: "E Shtunë" },
  { value: "6", label: "E Diel" },
]

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, "0"),
  label: new Date(0, index).toLocaleString("default", { month: "long" }),
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
  return date.toLocaleDateString("default", { weekday: "long", day: "numeric", month: "short" })
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

export default function SystemTasksPage() {
  const { apiFetch, user } = useAuth()
  const [templates, setTemplates] = React.useState<SystemTaskTemplate[]>([])
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedDays, setSelectedDays] = React.useState<string[]>(["today"])
  const [multiSelect, setMultiSelect] = React.useState(false)
  const [customDate, setCustomDate] = React.useState("")
  const [createOpen, setCreateOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [departmentId, setDepartmentId] = React.useState("")
  const [defaultAssignee, setDefaultAssignee] = React.useState(EMPTY_VALUE)
  const [frequency, setFrequency] = React.useState<SystemTaskFrequency>("DAILY")
  const [dayOfWeek, setDayOfWeek] = React.useState("")
  const [dayOfMonth, setDayOfMonth] = React.useState("")
  const [monthOfYear, setMonthOfYear] = React.useState(EMPTY_VALUE)
  const [isActive, setIsActive] = React.useState(true)

  const canCreate = user?.role !== "STAFF"

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
      return
    }
    if (user?.department_id && user.department_id !== departmentId) {
      setDepartmentId(user.department_id)
    }
  }, [departments, departmentId, user?.department_id])

  const departmentMap = React.useMemo(() => {
    return new Map(departments.map((dept) => [dept.id, dept]))
  }, [departments])

  const userMap = React.useMemo(() => {
    return new Map(users.map((u) => [u.id, u]))
  }, [users])

  const customDateObject = React.useMemo(() => {
    if (!customDate) return null
    const parsed = new Date(`${customDate}T00:00:00`)
    return Number.isNaN(parsed.getTime()) ? null : normalizeDate(parsed)
  }, [customDate])

  const sections = React.useMemo<Section[]>(() => {
    const items: Section[] = []

    for (const filter of DAY_FILTERS) {
      if (!selectedDays.includes(filter.id)) continue
      const target = normalizeDate(new Date())
      target.setDate(target.getDate() + filter.offset)
      const scheduled = templates.filter((template) => shouldRunTemplate(template, target))
      items.push({
        id: `${filter.id}-${target.toISOString()}`,
        label: `${filter.label} • ${formatDisplayDate(target)}`,
        date: target,
        templates: scheduled,
      })
    }

    if (customDateObject) {
      const scheduled = templates.filter((template) => shouldRunTemplate(template, customDateObject))
      const label = `Data e zgjedhur • ${formatDisplayDate(customDateObject)}`
      items.push({
        id: `custom-${customDateObject.toISOString()}`,
        label,
        date: customDateObject,
        templates: scheduled,
      })
    }

    return items
  }, [customDateObject, selectedDays, templates])

  const dayCounts = React.useMemo(() => {
    return new Map(
      DAY_FILTERS.map((filter) => {
        const target = normalizeDate(new Date())
        target.setDate(target.getDate() + filter.offset)
        const count = templates.filter((template) => shouldRunTemplate(template, target)).length
        return [filter.id, count] as const
      })
    )
  }, [templates])

  const resetFilters = () => {
    setSelectedDays(["today"])
    setMultiSelect(false)
    setCustomDate("")
  }

  const toggleDay = (id: string) => {
    setSelectedDays((prev) => {
      if (prev.includes(id)) {
        if (!multiSelect && prev.length === 1) {
          return prev
        }
        return prev.filter((value) => value !== id)
      }
      if (multiSelect) {
        return [...prev, id]
      }
      return [id]
    })
  }

  const submit = async () => {
    if (!departmentId) return
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        department_id: departmentId,
        default_assignee_id: defaultAssignee === EMPTY_VALUE ? null : defaultAssignee,
        frequency,
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
      setIsActive(true)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const availableAssignees = React.useMemo(() => {
    if (!departmentId) return users
    return users.filter((u) => u.department_id === departmentId)
  }, [departmentId, users])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Detyra Sistemi</h3>
          <p className="text-sm text-muted-foreground">
            Detyrat e departamenteve, të organizuara sipas frekuencës dhe datës.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={!canCreate}>
                + Shto Detyrë
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Shto detyrë sistemi</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Departamenti</Label>
                  <Select value={departmentId} onValueChange={setDepartmentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Zgjidh departamentin" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name} ({dept.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Titulli</Label>
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Përshkrimi</Label>
                  <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Frekuenca</Label>
                    <Select value={frequency} onValueChange={(value) => setFrequency(value as SystemTaskFrequency)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Zgjidh frekuencën" />
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
                  {frequency === "WEEKLY" ? (
                    <div className="space-y-2">
                      <Label>Ditë e javës</Label>
                      <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                        <SelectTrigger>
                          <SelectValue placeholder="Zgjidh ditën" />
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
                      <Label>Data (ditë)</Label>
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
                      <Label>Muaji (opsional)</Label>
                      <Select value={monthOfYear} onValueChange={setMonthOfYear}>
                        <SelectTrigger>
                          <SelectValue placeholder="Zgjidh muajin" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_VALUE}>Nuk ka</SelectItem>
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
                  <Label>Default assignee (opsional)</Label>
                  <Select value={defaultAssignee} onValueChange={setDefaultAssignee}>
                    <SelectTrigger>
                      <SelectValue placeholder="Zgjidh përdoruesin" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_VALUE}>Asnjë</SelectItem>
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
                  <span className="text-sm">Aktiv</span>
                </div>
                <div className="flex justify-end">
                  <Button disabled={saving || !title.trim() || !departmentId} onClick={() => void submit()}>
                    {saving ? "Ruaj..." : "Ruaj detyrën"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          {!canCreate ? (
            <span className="text-xs text-muted-foreground">Vetëm menaxherët ose admin mund të shtojnë detyra.</span>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-muted p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" id="system-day-chips">
            {DAY_FILTERS.map((filter) => {
              const active = selectedDays.includes(filter.id)
              return (
                <button
                  key={filter.id}
                  type="button"
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-transparent bg-white text-muted-foreground hover:border-border hover:bg-white"
                  )}
                  onClick={() => toggleDay(filter.id)}
                >
                  {filter.label} <small>({dayCounts.get(filter.id) ?? 0})</small>
                </button>
              )
            })}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              id="system-multi-toggle"
              type="checkbox"
              className="h-4 w-4 rounded border"
              checked={multiSelect}
              onChange={(event) => setMultiSelect(event.target.checked)}
            />
            Multi-select
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Input
              id="system-date"
              type="date"
              className="w-auto rounded-md"
              value={customDate}
              onChange={(event) => setCustomDate(event.target.value)}
            />
          </div>
          <Button variant="outline" onClick={resetFilters}>
            Shfaq të gjitha
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Duke ngarkuar...</div>
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
                  section.templates.map((template) => (
                    <div key={template.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">{template.title}</div>
                        <Badge variant="outline">
                          {FREQUENCY_OPTIONS.find((option) => option.value === template.frequency)?.label ??
                            template.frequency}
                        </Badge>
                      </div>
                      {template.description ? (
                        <p className="text-sm text-muted-foreground">{template.description}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>
                          Dept: {departmentMap.get(template.department_id || "")?.name ?? "-"}
                        </span>
                        <span>
                          Assignee: {userMap.get(template.default_assignee_id || "")?.full_name || "-"}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">Nuk ka detyra të planifikuara.</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          Asnjë detyrë sistemi e planifikuar për datat e përzgjedhura.
        </div>
      )}
    </div>
  )
}
