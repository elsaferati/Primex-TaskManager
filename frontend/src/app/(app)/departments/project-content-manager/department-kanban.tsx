"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

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
import { normalizeDueDateInput } from "@/lib/dates"
import type { Department, GaNote, Meeting, Project, SystemTaskTemplate, Task, TaskFinishPeriod, TaskPriority, UserLookup } from "@/lib/types"

const TABS = [
  { id: "all", label: "All (Today)", tone: "neutral" },
  { id: "projects", label: "Projects", tone: "neutral" },
  { id: "system", label: "System Tasks", tone: "blue" },
  { id: "no-project", label: "Tasks", tone: "red" },
  { id: "ga-ka", label: "GA/KA Notes", tone: "neutral" },
  { id: "meetings", label: "Meetings", tone: "neutral" },
] as const

type TabId = (typeof TABS)[number]["id"]

const PHASES = ["PROJEKTE"] as const

const PHASE_LABELS: Record<string, string> = {
 PROJEKTE: "Projects",
}

const WEEKDAYS_SQ = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]

const FREQUENCY_LABELS: Record<SystemTaskTemplate["frequency"], string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
  "3_MONTHS": "3/6 months",
  "6_MONTHS": "3/6 months",
}

const FREQUENCY_ORDER: SystemTaskTemplate["frequency"][] = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "3_MONTHS",
  "6_MONTHS",
  "YEARLY",
]

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  NORMAL: "Normal",
  HIGH: "High",
}

const PRIORITY_BADGE_STYLES: Record<TaskPriority, string> = {
  NORMAL: "border-emerald-200 bg-emerald-50 text-emerald-700",
  HIGH: "border-red-200 bg-red-50 text-red-700",
}

const PRIORITY_BORDER_STYLES: Record<TaskPriority, string> = {
  NORMAL: "border-l-emerald-500",
  HIGH: "border-l-red-600",
}

const PRIORITY_OPTIONS: TaskPriority[] = ["NORMAL", "HIGH"]
const FINISH_PERIOD_OPTIONS: TaskFinishPeriod[] = ["AM", "PM"]
const FINISH_PERIOD_NONE_VALUE = "__none__"
const FINISH_PERIOD_NONE_LABEL = "None (all day)"

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  INACTIVE: "Inactive",
}

const STATUS_OPTIONS = ["OPEN", "INACTIVE"] as const

const NO_PROJECT_TYPES = [
  { id: "normal", label: "Normal", description: "General tasks without a project." },
  { id: "ga", label: "GA", description: "GA tasks that should be tracked separately." },
  { id: "blocked", label: "Blocked", description: "Blocked all day by a single task." },
  { id: "hourly", label: "1H Report", description: "Hourly meeting/reporting task." },
  { id: "r1", label: "R1", description: "First case must be discussed with the manager." },
] as const

const INTERNAL_MEETING = {
  title: "Pikat e diskutimit (Zhvillim M1, M2, M3)",
  team: ["Elsa Ferati", "Rinesa Ahmedi", "Laurent Hoxha", "Endi Hyseni"],
  slots: {
    M1: {
      label: "M1 PER ZHVILLIM (BLIC 08:08-08:15 MAX)",
      items: [
        "A ka mungesa, a ndryshon plani per sot?",
        "A ka shenime GA/KA ne grupe/Trello?",
        "A ka e-mails te reja ne IT?",
        "Detyrat e secilit per sot (secili hap RD/Trello side-by-side dhe diskuton detyrat).",
        "Shenimet ne grup te zhvillimit vendosen copy/paste ne Trello tek shenimet GA/KA.",
      ],
    },
    M2: {
      label: "M2 PER ZHVILLIM (12:00-12:15 MAX)",
      items: [
        "A ka shenime GA/KA ne grupe/Trello?",
        "Detyrat e secilit diskutohen, cka kemi punu deri 12:00?",
        "Cka mbetet per PM?",
      ],
    },
    M3: {
      label: "M3 (ME TRELLO) PER ZHVILLIM (16:10-16:30 MAX)",
      items: [
        "A ka shenime GA/KA ne grupe/Trello?",
        "Diskuto detyrat e te gjithve, cka kemi punu deri tash?",
        "Cka kemi me punu neser?",
      ],
    },
  },
} as const

function initials(src: string) {
  return src
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

function assigneeLabel(user?: UserLookup | null) {
  return user?.full_name || user?.username || "-"
}

function formatToday() {
  const now = new Date()
  const date = now.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
  const day = now.toLocaleDateString("en-US", { weekday: "short" })
  return `${day} - ${date}`
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function toDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatDayLabel(date: Date) {
  const today = new Date()
  const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const targetKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const delta = Math.round((targetKey - todayKey) / (24 * 60 * 60 * 1000))
  const prefix = delta === 0 ? "Today" : delta === -1 ? "Yesterday" : delta === 1 ? "Tomorrow" : ""
  const weekday = WEEKDAYS_SQ[date.getDay() === 0 ? 6 : date.getDay() - 1]
  return prefix ? `${prefix} - ${weekday}` : weekday
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
  const dateLabel = date.toLocaleDateString("en-US", { day: "2-digit", month: "2-digit", year: "numeric" })
  return `${dayLabel}\n${dateLabel}`
}

function formatMeetingLabel(meeting: Meeting) {
  const platformLabel = meeting.platform ? ` (${meeting.platform})` : ""
  if (!meeting.starts_at) return `${meeting.title}${platformLabel}`
  const date = new Date(meeting.starts_at)
  if (Number.isNaN(date.getTime())) return `${meeting.title}${platformLabel}`
  const today = new Date()
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  const timeLabel = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  const weekdayLabel = date.toLocaleDateString("en-US", { weekday: "long" })
  const prefix = sameDay ? timeLabel : weekdayLabel
  return `${prefix} - ${meeting.title}${platformLabel}`
}

function toMeetingInputValue(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(0, 16)
}

function normalizePriority(value?: TaskPriority | null): TaskPriority {
  if (value === "URGENT") return "HIGH"
  if (value === "LOW" || value === "MEDIUM") return "NORMAL"
  if (value && PRIORITY_OPTIONS.includes(value)) return value
  return "NORMAL"
}

function truncateDescription(value: string, limit = 120) {
  if (value.length <= limit) return { text: value, truncated: false }
  return { text: `${value.slice(0, limit).trim()}…`, truncated: true }
}

export default function DepartmentKanban() {
  const departmentName = "Project Content Manager"
  const { apiFetch, user } = useAuth()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const normalizedTab = tabParam === "tasks" ? "no-project" : tabParam
  const isTabId = Boolean(normalizedTab && TABS.some((tab) => tab.id === normalizedTab))
  const returnToTasks = `${pathname}?tab=no-project`
  const [department, setDepartment] = React.useState<Department | null>(null)
  const [projects, setProjects] = React.useState<Project[]>([])
  const [systemTasks, setSystemTasks] = React.useState<SystemTaskTemplate[]>([])
  const [departmentTasks, setDepartmentTasks] = React.useState<Task[]>([])
  const [noProjectTasks, setNoProjectTasks] = React.useState<Task[]>([])
  const [users, setUsers] = React.useState<UserLookup[]>([])
  const [gaNotes, setGaNotes] = React.useState<GaNote[]>([])
  const [meetings, setMeetings] = React.useState<Meeting[]>([])
  const [loading, setLoading] = React.useState(true)
  const [viewMode, setViewMode] = React.useState<"department" | "mine">("department")
  const [activeTab, setActiveTab] = React.useState<TabId>(
    isTabId ? (normalizedTab as TabId) : "projects"
  )
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
  const [projectPhase, setProjectPhase] = React.useState("TAKIMET")
  const [projectStatus, setProjectStatus] = React.useState("TODO")
  const [meetingTitle, setMeetingTitle] = React.useState("")
  const [meetingPlatform, setMeetingPlatform] = React.useState("")
  const [meetingStartsAt, setMeetingStartsAt] = React.useState("")
  const [meetingProjectId, setMeetingProjectId] = React.useState("__none__")
  const [creatingMeeting, setCreatingMeeting] = React.useState(false)
  const [editingMeetingId, setEditingMeetingId] = React.useState<string | null>(null)
  const [editMeetingTitle, setEditMeetingTitle] = React.useState("")
  const [editMeetingPlatform, setEditMeetingPlatform] = React.useState("")
  const [editMeetingStartsAt, setEditMeetingStartsAt] = React.useState("")
  const [editMeetingProjectId, setEditMeetingProjectId] = React.useState("__none__")
  const [internalSlot, setInternalSlot] = React.useState<keyof typeof INTERNAL_MEETING.slots>("M1")
  const [noProjectOpen, setNoProjectOpen] = React.useState(false)
  const [noProjectTitle, setNoProjectTitle] = React.useState("")
  const [noProjectDescription, setNoProjectDescription] = React.useState("")
  const [noProjectType, setNoProjectType] = React.useState<(typeof NO_PROJECT_TYPES)[number]["id"]>("normal")
  const [noProjectAssignee, setNoProjectAssignee] = React.useState<string>("__unassigned__")
  const [noProjectDueDate, setNoProjectDueDate] = React.useState("")
  const [noProjectFinishPeriod, setNoProjectFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(
    FINISH_PERIOD_NONE_VALUE
  )
  const [creatingNoProject, setCreatingNoProject] = React.useState(false)
  const [gaNoteOpen, setGaNoteOpen] = React.useState(false)
  const [addingGaNote, setAddingGaNote] = React.useState(false)
  const [newGaNoteProjectId, setNewGaNoteProjectId] = React.useState("__none__")
  const [newGaNoteType, setNewGaNoteType] = React.useState<"GA" | "KA">("GA")
  const [newGaNotePriority, setNewGaNotePriority] = React.useState<"__none__" | "NORMAL" | "HIGH">(
    "__none__"
  )
  const [newGaNote, setNewGaNote] = React.useState("")
  const [expandedSystemDescriptions, setExpandedSystemDescriptions] = React.useState<Record<string, boolean>>({})

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

        const [projRes, sysRes, tasksRes, gaRes, meetingsRes] = await Promise.all([
          apiFetch(`/projects?department_id=${dep.id}`),
          apiFetch(`/system-tasks?department_id=${dep.id}`),
          apiFetch(`/tasks?department_id=${dep.id}&include_done=false`),
          apiFetch(`/ga-notes?department_id=${dep.id}`),
          apiFetch(`/meetings?department_id=${dep.id}`),
        ])
        if (projRes.ok) setProjects((await projRes.json()) as Project[])
        if (sysRes.ok) setSystemTasks((await sysRes.json()) as SystemTaskTemplate[])
        if (tasksRes.ok) {
          const taskRows = (await tasksRes.json()) as Task[]
          setDepartmentTasks(taskRows)
          setNoProjectTasks(taskRows.filter((t) => !t.project_id))
        }
        if (gaRes.ok) setGaNotes((await gaRes.json()) as GaNote[])
        if (meetingsRes.ok) setMeetings((await meetingsRes.json()) as Meeting[])

        const usersRes = await apiFetch("/users/lookup")
        if (usersRes.ok) {
          const us = (await usersRes.json()) as UserLookup[]
          setUsers(us)
        }

        setSystemDepartmentId(dep.id)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [apiFetch, departmentName, user?.role])

  React.useEffect(() => {
    if (isTabId) {
      setActiveTab(normalizedTab as TabId)
    }
  }, [isTabId, normalizedTab])

  const userMap = React.useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const departmentUsers = React.useMemo(
    () => (department ? users.filter((u) => u.department_id === department.id) : []),
    [department, users]
  )
  const todayDate = React.useMemo(() => new Date(), [])
  const isMineView = viewMode === "mine" && Boolean(user?.id)
  const filteredProjects = React.useMemo(() => {
    if (viewMode === "mine" && user?.id) {
      return projects.filter((p) => p.manager_id === user.id)
    }
    return projects
  }, [projects, user?.id, viewMode])

  const visibleDepartmentTasks = React.useMemo(
    () => (isMineView && user?.id ? departmentTasks.filter((t) => t.assigned_to === user.id) : departmentTasks),
    [departmentTasks, isMineView, user?.id]
  )
  const visibleNoProjectTasks = React.useMemo(
    () => (isMineView && user?.id ? noProjectTasks.filter((t) => t.assigned_to === user.id) : noProjectTasks),
    [noProjectTasks, isMineView, user?.id]
  )
  const visibleGaNotes = React.useMemo(
    () => (isMineView && user?.id ? gaNotes.filter((n) => n.created_by === user.id) : gaNotes),
    [gaNotes, isMineView, user?.id]
  )
  const visibleMeetings = React.useMemo(
    () => (isMineView && user?.id ? meetings.filter((m) => m.created_by === user.id) : meetings),
    [meetings, isMineView, user?.id]
  )
  const visibleSystemTemplates = React.useMemo(
    () => (isMineView && user?.id ? systemTasks.filter((t) => t.default_assignee_id === user.id) : systemTasks),
    [systemTasks, isMineView, user?.id]
  )

  const projectTasks = React.useMemo(
    () => visibleDepartmentTasks.filter((t) => t.project_id),
    [visibleDepartmentTasks]
  )
  const todaySystemTasks = React.useMemo(
    () => visibleSystemTemplates.filter((t) => shouldShowTemplate(t, todayDate)),
    [visibleSystemTemplates, todayDate]
  )
  const openNotes = React.useMemo(() => visibleGaNotes.filter((n) => n.status !== "CLOSED"), [visibleGaNotes])
  const todayProjectTasks = React.useMemo(() => {
    return projectTasks.filter((task) => {
      const date = toDate(task.due_date || task.start_date || task.created_at)
      return date ? isSameDay(date, todayDate) : false
    })
  }, [projectTasks, todayDate])
  const todayNoProjectTasks = React.useMemo(() => {
    return visibleNoProjectTasks.filter((task) => {
      const date = toDate(task.due_date || task.start_date || task.created_at)
      return date ? isSameDay(date, todayDate) : false
    })
  }, [visibleNoProjectTasks, todayDate])
  const todayOpenNotes = React.useMemo(() => {
    return openNotes.filter((note) => {
      const date = toDate(note.created_at)
      return date ? isSameDay(date, todayDate) : false
    })
  }, [openNotes, todayDate])
  const todayMeetings = React.useMemo(
    () =>
      visibleMeetings.filter((m) => {
        if (!m.starts_at) return false
        const start = new Date(m.starts_at)
        if (Number.isNaN(start.getTime())) return false
        return isSameDay(start, todayDate)
      }),
    [visibleMeetings, todayDate]
  )

  const projectTaskGroups = React.useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const task of projectTasks) {
      if (!task.project_id) continue
      const list = map.get(task.project_id) || []
      list.push(task)
      map.set(task.project_id, list)
    }
    return Array.from(map.entries()).map(([projectId, tasks]) => {
      const project = projects.find((p) => p.id === projectId) || null
      return {
        id: projectId,
        name: project?.title || project?.name || "Project",
        tasks,
      }
    })
  }, [projectTasks, projects])
  const todayProjectTaskGroups = React.useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const task of todayProjectTasks) {
      if (!task.project_id) continue
      const list = map.get(task.project_id) || []
      list.push(task)
      map.set(task.project_id, list)
    }
    return Array.from(map.entries()).map(([projectId, tasks]) => {
      const project = projects.find((p) => p.id === projectId) || null
      return {
        id: projectId,
        name: project?.title || project?.name || "Project",
        tasks,
      }
    })
  }, [todayProjectTasks, projects])

  const counts = React.useMemo(
    () => ({
      all:
        todayProjectTasks.length +
        todayNoProjectTasks.length +
        todayOpenNotes.length +
        todaySystemTasks.length +
        todayMeetings.length,
      projects: filteredProjects.length,
      system: visibleSystemTemplates.length,
      "no-project": visibleNoProjectTasks.length,
      "ga-ka": visibleGaNotes.filter((n) => n.status !== "CLOSED").length,
      meetings: visibleMeetings.length,
    }),
    [
      filteredProjects.length,
      visibleSystemTemplates.length,
      visibleNoProjectTasks.length,
      visibleGaNotes,
      visibleMeetings,
      openNotes.length,
      projectTasks.length,
      todayProjectTasks.length,
      todayNoProjectTasks.length,
      todayOpenNotes.length,
      todayMeetings.length,
      todaySystemTasks.length,
    ]
  )

  const canCreate = user?.role === "ADMIN" || user?.role === "MANAGER"
  const isReadOnly = viewMode === "mine"
  const canManage = canCreate && !isReadOnly

  const visibleSystemTasks = React.useMemo(() => {
    if (showAllSystem) return visibleSystemTemplates
    return visibleSystemTemplates.filter((t) => shouldShowTemplate(t, systemDate))
  }, [showAllSystem, systemDate, visibleSystemTemplates])

  const toggleSystemDescription = React.useCallback((id: string) => {
    setExpandedSystemDescriptions((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const noProjectBuckets = React.useMemo(() => {
    const normal: Task[] = []
    const ga: Task[] = []
    const blocked: Task[] = []
    const oneHour: Task[] = []
    const r1: Task[] = []
    for (const t of visibleNoProjectTasks) {
      if (t.is_bllok) {
        blocked.push(t)
      } else if (t.is_1h_report) {
        oneHour.push(t)
      } else if (t.is_r1) {
        r1.push(t)
      } else if (t.ga_note_origin_id) {
        ga.push(t)
      } else {
        normal.push(t)
      }
    }
    return { normal, ga, blocked, oneHour, r1 }
  }, [visibleNoProjectTasks])

  const systemGroups = React.useMemo(() => {
    const groups = new Map<SystemTaskTemplate["frequency"], SystemTaskTemplate[]>()
    for (const t of visibleSystemTasks) {
      const key = t.frequency
      const list = groups.get(key) || []
      list.push(t)
      groups.set(key, list)
    }
    return Array.from(groups.entries())
      .sort((a, b) => FREQUENCY_ORDER.indexOf(a[0]) - FREQUENCY_ORDER.indexOf(b[0]))
      .map(([frequency, items]) => ({
        label: FREQUENCY_LABELS[frequency] || "Daily",
        items: items.sort((a, b) => {
          const rank = (value?: string | null) => {
            if (value === "HIGH") return 3
            if (value === "NORMAL") return 2
            return 0
          }
          const byPriority = rank(b.priority) - rank(a.priority)
          if (byPriority !== 0) return byPriority
          return a.title.localeCompare(b.title)
        }),
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
      setProjectPhase("TAKIMET")
      setProjectStatus("TODO")
      toast.success("Project created")
    } finally {
      setCreatingProject(false)
    }
  }

  const submitNoProjectTask = async () => {
    if (!noProjectTitle.trim() || !department) return
    setCreatingNoProject(true)
    try {
      let gaNoteId: string | null = null
      if (noProjectType === "ga") {
        const noteRes = await apiFetch("/ga-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            department_id: department.id,
            content: noProjectDescription.trim() || noProjectTitle.trim(),
            note_type: "GA",
          }),
        })
        if (!noteRes.ok) {
          let detail = "Failed to create GA note"
          try {
            const data = (await noteRes.json()) as { detail?: string }
            if (data?.detail) detail = data.detail
          } catch {
            // ignore
          }
          toast.error(detail)
          return
        }
        const createdNote = (await noteRes.json()) as GaNote
        gaNoteId = createdNote.id
        setGaNotes((prev) => [createdNote, ...prev])
      }
      const dueDate = noProjectDueDate ? new Date(noProjectDueDate).toISOString() : null
      const payload = {
        title: noProjectTitle.trim(),
        description: noProjectDescription.trim() || null,
        project_id: null,
        department_id: department.id,
        status: "TODO",
        priority: "NORMAL",
        finish_period: noProjectFinishPeriod === FINISH_PERIOD_NONE_VALUE ? null : noProjectFinishPeriod,
        is_bllok: noProjectType === "blocked",
        is_1h_report: noProjectType === "hourly",
        is_r1: noProjectType === "r1",
        ga_note_origin_id: gaNoteId,
        due_date: dueDate,
      }
      const assigneeIds =
        noProjectAssignee === "__all__"
          ? departmentUsers.map((u) => u.id)
          : noProjectAssignee === "__unassigned__"
            ? [null]
            : [noProjectAssignee]
      if (noProjectAssignee === "__all__" && assigneeIds.length === 0) {
        toast.error("No users available to assign.")
        return
      }

      const createdTasks: Task[] = []
      for (const assigneeId of assigneeIds) {
        const res = await apiFetch("/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            assigned_to: assigneeId,
          }),
        })
        if (!res.ok) {
          let detail = "Failed to create task"
          try {
            const data = (await res.json()) as { detail?: string }
            if (data?.detail) detail = data.detail
          } catch {
            // ignore
          }
          toast.error(detail)
          return
        }
        createdTasks.push((await res.json()) as Task)
      }
      if (createdTasks.length) {
        setNoProjectTasks((prev) => [...createdTasks, ...prev])
        setDepartmentTasks((prev) => [...createdTasks, ...prev])
      }
      setNoProjectOpen(false)
      setNoProjectTitle("")
      setNoProjectDescription("")
      setNoProjectType("normal")
      setNoProjectAssignee("__unassigned__")
      setNoProjectDueDate("")
      setNoProjectFinishPeriod(FINISH_PERIOD_NONE_VALUE)
      toast.success("Task created")
    } finally {
      setCreatingNoProject(false)
    }
  }

  const submitMeeting = async () => {
    if (!meetingTitle.trim() || !department) return
    setCreatingMeeting(true)
    try {
      const startsAt = meetingStartsAt ? new Date(meetingStartsAt).toISOString() : null
      const payload = {
        title: meetingTitle.trim(),
        platform: meetingPlatform.trim() || null,
        starts_at: startsAt,
        department_id: department.id,
        project_id: meetingProjectId === "__none__" ? null : meetingProjectId,
      }
      const res = await apiFetch("/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail = "Failed to create meeting"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const created = (await res.json()) as Meeting
      setMeetings((prev) => [created, ...prev])
      setMeetingTitle("")
      setMeetingPlatform("")
      setMeetingStartsAt("")
      setMeetingProjectId("__none__")
      toast.success("Meeting created")
    } finally {
      setCreatingMeeting(false)
    }
  }

  const startEditMeeting = (meeting: Meeting) => {
    setEditingMeetingId(meeting.id)
    setEditMeetingTitle(meeting.title)
    setEditMeetingPlatform(meeting.platform || "")
    setEditMeetingStartsAt(toMeetingInputValue(meeting.starts_at))
    setEditMeetingProjectId(meeting.project_id || "__none__")
  }

  const cancelEditMeeting = () => {
    setEditingMeetingId(null)
    setEditMeetingTitle("")
    setEditMeetingPlatform("")
    setEditMeetingStartsAt("")
    setEditMeetingProjectId("__none__")
  }

  const saveMeeting = async (meetingId: string) => {
    if (!editMeetingTitle.trim()) return
    const startsAt = editMeetingStartsAt ? new Date(editMeetingStartsAt).toISOString() : null
    const payload = {
      title: editMeetingTitle.trim(),
      platform: editMeetingPlatform.trim() || null,
      starts_at: startsAt,
      project_id: editMeetingProjectId === "__none__" ? null : editMeetingProjectId,
    }
    const res = await apiFetch(`/meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      let detail = "Failed to update meeting"
      try {
        const data = (await res.json()) as { detail?: string }
        if (data?.detail) detail = data.detail
      } catch {
        // ignore
      }
      toast.error(detail)
      return
    }
    const updated = (await res.json()) as Meeting
    setMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
    cancelEditMeeting()
  }

  const deleteMeeting = async (meetingId: string) => {
    const res = await apiFetch(`/meetings/${meetingId}`, { method: "DELETE" })
    if (!res.ok) {
      let detail = "Failed to delete meeting"
      try {
        const data = (await res.json()) as { detail?: string }
        if (data?.detail) detail = data.detail
      } catch {
        // ignore
      }
      toast.error(detail)
      return
    }
    setMeetings((prev) => prev.filter((m) => m.id !== meetingId))
    toast.success("Meeting deleted")
  }

  const submitGaNote = async () => {
    if (!newGaNote.trim()) return
    if (!department) {
      toast.error("Department not loaded.")
      return
    }
    setAddingGaNote(true)
    try {
      const priorityValue = newGaNotePriority === "__none__" ? null : newGaNotePriority
      const payload: Record<string, unknown> = {
        content: newGaNote.trim(),
        note_type: newGaNoteType,
        priority: priorityValue,
      }
      if (newGaNoteProjectId === "__none__") {
        payload.department_id = department.id
      } else {
        payload.project_id = newGaNoteProjectId
      }
      const res = await apiFetch("/ga-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail = "Failed to add GA/KA note"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const created = (await res.json()) as GaNote
      setGaNotes((prev) => [created, ...prev])
      setNewGaNote("")
      setNewGaNoteType("GA")
      setNewGaNotePriority("__none__")
      setNewGaNoteProjectId("__none__")
      setGaNoteOpen(false)
      toast.success("GA/KA note added")
    } finally {
      setAddingGaNote(false)
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading...</div>
  if (!department) return <div className="text-sm text-muted-foreground">Department not found.</div>

  const closeGaNote = async (noteId: string) => {
    const res = await apiFetch(`/ga-notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CLOSED" }),
    })
    if (!res.ok) {
      let detail = "Failed to close GA/KA note"
      try {
        const data = (await res.json()) as { detail?: string }
        if (data?.detail) detail = data.detail
      } catch {
        // ignore
      }
      toast.error(detail)
      return
    }
    const updated = (await res.json()) as GaNote
    setGaNotes((prev) => prev.map((note) => (note.id === updated.id ? updated : note)))
  }

  return (
    <div className="relative overflow-hidden rounded-[2.25rem] border border-stone-200/70 bg-gradient-to-br from-amber-50 via-rose-50/30 to-stone-50 p-6 shadow-lg dark:border-stone-800/70 dark:from-stone-950 dark:via-stone-950 dark:to-rose-950/30">
      <div className="pointer-events-none absolute -top-24 right-0 h-56 w-56 rounded-full bg-amber-200/40 blur-3xl dark:bg-amber-900/30" />
      <div className="pointer-events-none absolute -bottom-24 left-0 h-56 w-56 rounded-full bg-rose-200/35 blur-3xl dark:bg-rose-900/20" />
      <div className="relative space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-stone-500 dark:text-stone-400">
              Department
            </div>
            <div className="text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              {departmentName}
            </div>
            <div className="text-sm text-stone-600 dark:text-stone-400">Manage projects and daily tasks.</div>
          </div>
          <div className="inline-flex rounded-full border border-stone-200/70 bg-white/70 p-1 shadow-sm backdrop-blur dark:border-stone-800/70 dark:bg-stone-950/40">
            <button
              type="button"
              onClick={() => setViewMode("department")}
              className={[
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                viewMode === "department"
                  ? "bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-900"
                  : "text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200",
              ].join(" ")}
            >
              Department
            </button>
            <button
              type="button"
              onClick={() => setViewMode("mine")}
              className={[
                "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                viewMode === "mine"
                  ? "bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-900"
                  : "text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200",
              ].join(" ")}
            >
              My View
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200/70 bg-white/70 p-1 shadow-sm backdrop-blur dark:border-stone-800/70 dark:bg-stone-950/40">
          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => {
              const isActive = tab.id === activeTab
              const badgeTone =
                tab.tone === "blue"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
                  : tab.tone === "red"
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200"
                    : "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-200"
              const badgeClass = isActive
                ? "bg-white/90 text-stone-900 dark:bg-stone-100 dark:text-stone-900"
                : badgeTone
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                    isActive
                      ? "bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-900"
                      : "text-stone-600 hover:text-stone-900 hover:bg-white/80 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-900/40",
                  ].join(" ")}
                >
                  {tab.label}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${badgeClass}`}>{counts[tab.id]}</span>
                </button>
              )
            })}
          </div>
        </div>

      {activeTab === "projects" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-lg font-semibold">Active Projects</div>
            {canManage ? (
              <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
                <DialogTrigger asChild>
                  <Button className="rounded-xl">+ New Project</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Add Project</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Title</Label>
                      <Input value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Description</Label>
                      <Textarea
                        value={projectDescription}
                        onChange={(e) => setProjectDescription(e.target.value)}
                        placeholder="Enter the project description..."
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
                          {departmentUsers.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.full_name || u.username || "-"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Phase</Label>
                      <Select value={projectPhase} onValueChange={setProjectPhase}>
                        <SelectTrigger>
                          <SelectValue placeholder="Phase" />
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
                      <Label>Status</Label>
                      <Select value={projectStatus} onValueChange={setProjectStatus}>
                        <SelectTrigger>
                          <SelectValue placeholder="Status" />
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
                        Cancel
                      </Button>
                      <Button disabled={!projectTitle.trim() || creatingProject} onClick={() => void submitProject()}>
                        {creatingProject ? "Saving..." : "Save"}
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
              const phase = project.current_phase || "TAKIMET"
              return (
                <Card
                  key={project.id}
                  className="rounded-2xl border border-stone-200/70 bg-white/80 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-stone-800/70 dark:bg-stone-900/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold">{project.title || project.name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{project.description || "-"}</div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {PHASE_LABELS[phase] || "Meetings"}
                    </Badge>
                  </div>
                  <div className="mt-4 text-xs text-muted-foreground">
                    {PHASES.map((p, idx) => {
                      const isCurrent = p === phase
                      return (
                        <span key={p}>
                          <span className={isCurrent ? "text-rose-600 font-semibold" : ""}>
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
                        <div className="h-8 w-8 rounded-full bg-amber-100 text-xs font-semibold text-amber-800 flex items-center justify-center dark:bg-amber-900/40 dark:text-amber-200">
                        {initials(manager.full_name || manager.username || "-")}
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-muted text-xs font-semibold flex items-center justify-center">
                          -
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/projects/${project.id}`}
                        className="text-sm font-semibold text-rose-700 transition-colors hover:text-rose-800 hover:underline dark:text-rose-200 dark:hover:text-rose-100"
                      >
                        View details -&gt;
                      </Link>
                    </div>
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
              <div className="text-xl font-semibold tracking-tight">
                {viewMode === "department" ? "All (Today) - Department" : "All (Today)"}
              </div>
              <div className="text-sm text-muted-foreground">
                {viewMode === "department"
                  ? "All of today's tasks for the department team."
                  : "All of today's tasks, organized in one place."}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-amber-200/60 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                {formatToday()}
              </div>
              {viewMode === "department" && departmentUsers.length ? (
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="h-9 w-48">
                    <SelectValue placeholder="All users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All users</SelectItem>
                    {departmentUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name || u.username || "-"}
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
              { label: "PROJECT TASKS", value: todayProjectTasks.length },
              { label: "NO PROJECT", value: todayNoProjectTasks.length },
              { label: "NOTES (OPEN)", value: todayOpenNotes.length },
              { label: "SYSTEM", value: todaySystemTasks.length },
            ].map((stat) => (
              <Card
                key={stat.label}
                className="rounded-2xl border-stone-200/70 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-stone-800/70 dark:bg-stone-900/70"
              >
                <div className="text-xs font-semibold text-muted-foreground">{stat.label}</div>
                <div className="mt-2 text-2xl font-semibold">{stat.value}</div>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-2xl border-stone-200/70 bg-white/80 p-4 shadow-sm dark:border-stone-800/70 dark:bg-stone-900/70">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Project Tasks</div>
                <Badge variant="secondary">{todayProjectTasks.length}</Badge>
              </div>
              <div className="mt-4 space-y-4">
                {todayProjectTaskGroups.length ? (
                  todayProjectTaskGroups.map((group) => (
                    <div key={group.id}>
                      <div className="text-xs font-semibold text-muted-foreground">{group.name}</div>
                      <div className="mt-2 space-y-2">
                        {group.tasks.map((task) => {
                          const assignee = task.assigned_to ? userMap.get(task.assigned_to) : null
                          const phaseLabel = PHASE_LABELS[task.phase || "TAKIMET"] || task.phase || "TAKIMET"
                          return (
                            <Link
                              key={task.id}
                              href={`/tasks/${task.id}`}
                              className="block rounded-xl border border-stone-200/70 bg-white/80 px-3 py-2 text-sm transition hover:border-stone-300 hover:bg-white/90 hover:shadow-sm dark:border-stone-800/70 dark:bg-stone-900/60 dark:hover:border-stone-700"
                            >
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {task.status || "TODO"}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {phaseLabel}
                                </Badge>
                                <div className="font-medium">{task.title}</div>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {assignee?.full_name || assignee?.username || "Unassigned"}
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">No project tasks today.</div>
                )}
              </div>
            </Card>

            <div className="grid gap-4">
              <Card className="rounded-2xl border-stone-200/70 bg-white/80 p-4 shadow-sm dark:border-stone-800/70 dark:bg-stone-900/70">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">No Project Tasks</div>
                  <Badge variant="secondary">{todayNoProjectTasks.length}</Badge>
                </div>
                <div className="mt-4 space-y-2">
                  {todayNoProjectTasks.length ? (
                    todayNoProjectTasks.map((task) => {
                      const assignee = task.assigned_to ? userMap.get(task.assigned_to) : null
                      const phaseLabel = PHASE_LABELS[task.phase || "TAKIMET"] || task.phase || "TAKIMET"
                      const typeLabel = task.is_bllok
                        ? "Blocked"
                        : task.is_1h_report
                          ? "1H"
                          : task.is_r1
                            ? "R1"
                            : "Normal"
                      return (
                        <Link
                          key={task.id}
                          href={`/tasks/${task.id}`}
                          className="block rounded-xl border border-stone-200/70 bg-white/80 px-3 py-2 text-sm transition hover:border-stone-300 hover:bg-white/90 hover:shadow-sm dark:border-stone-800/70 dark:bg-stone-900/60 dark:hover:border-stone-700"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {typeLabel}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {phaseLabel}
                            </Badge>
                            <div className="font-medium">{task.title}</div>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {assignee?.full_name || assignee?.username || "Unassigned"}
                          </div>
                        </Link>
                      )
                    })
                  ) : (
                    <div className="text-sm text-muted-foreground">No tasks today.</div>
                  )}
                </div>
              </Card>

              <Card className="rounded-2xl border-stone-200/70 bg-white/80 p-4 shadow-sm dark:border-stone-800/70 dark:bg-stone-900/70">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">System Tasks</div>
                  <Badge variant="secondary">{todaySystemTasks.length}</Badge>
                </div>
                <div className="mt-4 space-y-2">
                  {todaySystemTasks.length ? (
                    todaySystemTasks.map((task) => {
                      const description = task.description?.trim() || ""
                      const isExpanded = Boolean(expandedSystemDescriptions[task.id])
                      const { text, truncated } = truncateDescription(description)
                      const displayText = description ? (isExpanded ? description : text) : "-"
                      return (
                        <div key={task.id} className="rounded-xl border border-stone-200/70 bg-white/80 px-3 py-2 text-sm dark:border-stone-800/70 dark:bg-stone-900/60">
                          <div className="font-medium">{task.title}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {displayText}
                            {description && truncated ? (
                              <button
                                type="button"
                                onClick={() => toggleSystemDescription(task.id)}
                                className="ml-2 text-[11px] font-semibold text-amber-700 hover:underline dark:text-amber-200"
                              >
                                {isExpanded ? "Show less" : "Read more"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-sm text-muted-foreground">No system tasks today.</div>
                  )}
                </div>
              </Card>
            </div>

            <Card className="rounded-2xl border-stone-200/70 bg-white/80 p-4 shadow-sm dark:border-stone-800/70 dark:bg-stone-900/70">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">GA/KA Notes (Open)</div>
                <Badge variant="secondary">{todayOpenNotes.length}</Badge>
              </div>
              <div className="mt-4 space-y-2">
                {todayOpenNotes.length ? (
                  todayOpenNotes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-stone-200/70 bg-white/80 px-3 py-2 text-sm dark:border-stone-800/70 dark:bg-stone-900/60">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {note.note_type || "GA"}
                        </Badge>
                        <div className="font-medium">{note.content}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">No open notes today.</div>
                )}
              </div>
            </Card>

            <Card className="rounded-2xl border-stone-200/70 bg-white/80 p-4 shadow-sm dark:border-stone-800/70 dark:bg-stone-900/70">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Meetings (Today)</div>
                <Badge variant="secondary">{todayMeetings.length}</Badge>
              </div>
              <div className="mt-4 space-y-2">
                {todayMeetings.length ? (
                  todayMeetings.map((meeting) => (
                    <div key={meeting.id} className="rounded-xl border border-stone-200/70 bg-white/80 px-3 py-2 text-sm dark:border-stone-800/70 dark:bg-stone-900/60">
                      <div className="font-medium">{formatMeetingLabel(meeting)}</div>
                      {meeting.project_id ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {projects.find((p) => p.id === meeting.project_id)?.title || "Project"}
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">No meetings today.</div>
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {activeTab === "system" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">System Tasks</div>
              <div className="text-sm text-muted-foreground">
                Department tasks organized by frequency and date.
              </div>
            </div>
            {canManage ? (
              <Dialog open={createSystemOpen} onOpenChange={setCreateSystemOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">+ Add Task</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Add System Task</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Title</Label>
                      <Input value={systemTitle} onChange={(e) => setSystemTitle(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Owner</Label>
                      <Select value={systemOwnerId} onValueChange={setSystemOwnerId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select owner" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unassigned__">Unassigned</SelectItem>
                          {departmentUsers.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.full_name || u.username || "-"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Set by</Label>
                      <Input value={user?.full_name || user?.username || user?.email || ""} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={systemDateInput}
                        onChange={(e) => setSystemDateInput(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Frequency</Label>
                      <Select value={systemFrequency} onValueChange={(v) => setSystemFrequency(v as SystemTaskTemplate["frequency"])}>
                        <SelectTrigger>
                          <SelectValue placeholder="Frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DAILY">Daily</SelectItem>
                          <SelectItem value="WEEKLY">Weekly</SelectItem>
                          <SelectItem value="MONTHLY">Monthly</SelectItem>
                          <SelectItem value="3_MONTHS">3 months</SelectItem>
                          <SelectItem value="6_MONTHS">6 months</SelectItem>
                          <SelectItem value="YEARLY">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Department</Label>
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
                      <Label>Status</Label>
                      <Select value={systemStatus} onValueChange={(v) => setSystemStatus(v as typeof systemStatus)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OPEN">Open</SelectItem>
                          <SelectItem value="INACTIVE">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Description</Label>
                      <Textarea
                        value={systemDescription}
                        onChange={(e) => setSystemDescription(e.target.value)}
                        placeholder="Enter task details..."
                      />
                    </div>
                    <div className="flex justify-end gap-2 md:col-span-2">
                      <Button variant="outline" onClick={() => setCreateSystemOpen(false)}>
                        Cancel
                      </Button>
                      <Button disabled={!systemTitle.trim() || creatingSystem} onClick={() => void submitSystemTask()}>
                        {creatingSystem ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full border border-stone-200/70 bg-white/70 p-1 shadow-sm backdrop-blur dark:border-stone-800/70 dark:bg-stone-950/40">
              {[
                { label: "Today", offset: 0 },
                { label: "Yesterday", offset: -1 },
                { label: "Tomorrow", offset: 1 },
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
                      "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-900"
                        : "text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200",
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
              {showAllSystem ? "Only date" : "Show all"}
            </Button>
          </div>

          <div className="space-y-4">
            {systemGroups.length ? (
              systemGroups.map((group) => (
                <Card
                  key={group.label}
                  className="overflow-hidden rounded-2xl border-stone-200/70 bg-white/80 shadow-sm dark:border-stone-800/70 dark:bg-stone-900/70"
                >
                  <div className="flex items-center gap-3 border-b px-4 py-3">
                    <Badge variant="outline" className="text-xs font-semibold">
                      {group.label}
                    </Badge>
                    <Badge variant="secondary">{group.items.length}</Badge>
                  </div>
                  <div className="grid grid-cols-7 gap-3 border-b bg-muted/30 px-4 py-3 text-xs font-semibold text-muted-foreground">
                    <div className="col-span-2">TASK</div>
                    <div>DEPARTMENT</div>
                    <div>WHEN</div>
                    <div>STATUS</div>
                    <div>OWNER</div>
                    <div>SET BY</div>
                  </div>
                  <div className="divide-y">
                    {group.items.map((item) => {
                      const owner = item.default_assignee_id ? users.find((u) => u.id === item.default_assignee_id) : null
                      const priorityValue = normalizePriority(item.priority)
                      return (
                        <div
                          key={item.id}
                          className={`grid grid-cols-7 gap-3 border-l-4 px-4 py-4 text-sm ${PRIORITY_BORDER_STYLES[priorityValue]}`}
                        >
                          <div className="col-span-2">
                            <div className="font-medium">{item.title}</div>
                            {(() => {
                              const description = item.description?.trim() || ""
                              const isExpanded = Boolean(expandedSystemDescriptions[item.id])
                              const { text, truncated } = truncateDescription(description)
                              const displayText = description ? (isExpanded ? description : text) : "-"
                              return (
                                <div className="text-xs text-muted-foreground">
                                  {displayText}
                                  {description && truncated ? (
                                    <button
                                      type="button"
                                      onClick={() => toggleSystemDescription(item.id)}
                                      className="ml-2 text-[11px] font-semibold text-blue-600 hover:underline"
                                    >
                                      {isExpanded ? "Show less" : "Read more"}
                                    </button>
                                  ) : null}
                                </div>
                              )
                            })()}
                          </div>
                          <div>{department.code}</div>
                          <div className="whitespace-pre-line text-muted-foreground">
                            {formatSchedule(item, systemDate)}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">
                                {item.is_active ? STATUS_LABELS.OPEN : STATUS_LABELS.INACTIVE}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={`border px-2 py-0.5 text-[11px] ${PRIORITY_BADGE_STYLES[priorityValue]}`}
                              >
                                {PRIORITY_LABELS[priorityValue]}
                              </Badge>
                            </div>
                          </div>
                          <div>{owner?.full_name || owner?.username || "-"}</div>
                          <div>{user?.full_name || user?.username || "-"}</div>
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
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">Tasks (No Project)</div>
              <div className="text-sm text-muted-foreground">
                Use these buckets to track non-project tasks and special cases.
              </div>
            </div>
            {!isReadOnly ? (
              <Dialog open={noProjectOpen} onOpenChange={setNoProjectOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">+ Add Task</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>New Task</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={noProjectType} onValueChange={(v) => setNoProjectType(v as typeof noProjectType)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {NO_PROJECT_TYPES.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="text-xs text-muted-foreground">
                        {NO_PROJECT_TYPES.find((opt) => opt.id === noProjectType)?.description}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input value={noProjectTitle} onChange={(e) => setNoProjectTitle(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={noProjectDescription}
                        onChange={(e) => setNoProjectDescription(e.target.value)}
                        rows={4}
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Assign to</Label>
                        <Select value={noProjectAssignee} onValueChange={setNoProjectAssignee}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select assignee" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__unassigned__">Unassigned</SelectItem>
                            <SelectItem value="__all__">All team</SelectItem>
                            {departmentUsers.map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.full_name || u.username || "-"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Finish by (optional)</Label>
                        <Select
                          value={noProjectFinishPeriod}
                          onValueChange={(value) =>
                            setNoProjectFinishPeriod(value as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select period" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={FINISH_PERIOD_NONE_VALUE}>{FINISH_PERIOD_NONE_LABEL}</SelectItem>
                            {FINISH_PERIOD_OPTIONS.map((value) => (
                              <SelectItem key={value} value={value}>
                                {value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Due date</Label>
                        <Input
                          type="date"
                          value={noProjectDueDate}
                          onChange={(e) => setNoProjectDueDate(normalizeDueDateInput(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setNoProjectOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        disabled={!noProjectTitle.trim() || creatingNoProject}
                        onClick={() => void submitNoProjectTask()}
                      >
                        {creatingNoProject ? "Creating..." : "Create"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-4">
          <Card className="rounded-2xl border-stone-200/70 bg-white/80 p-4 shadow-sm dark:border-stone-800/70 dark:bg-stone-900/70">
            <div className="text-sm font-semibold">Normal</div>
            <div className="mt-3 space-y-3">
              {noProjectBuckets.normal.length ? (
                noProjectBuckets.normal.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}?returnTo=${encodeURIComponent(returnToTasks)}`}
                    className="block rounded-xl border border-stone-200/70 bg-white/80 px-4 py-3 transition hover:border-stone-300 hover:bg-white/90 hover:shadow-sm dark:border-stone-800/70 dark:bg-stone-900/60 dark:hover:border-stone-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{t.title}</div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          Normal
                        </Badge>
                        {t.assigned_to ? (
                          <div
                            className="h-7 w-7 rounded-full bg-amber-100 text-[10px] font-semibold text-amber-800 flex items-center justify-center dark:bg-amber-900/40 dark:text-amber-200"
                            title={assigneeLabel(userMap.get(t.assigned_to) || null)}
                          >
                            {initials(assigneeLabel(userMap.get(t.assigned_to) || null))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No tasks</div>
              )}
            </div>
          </Card>

          <Card className="rounded-2xl border-stone-200/70 bg-white/80 p-4 shadow-sm dark:border-stone-800/70 dark:bg-stone-900/70">
            <div className="text-sm font-semibold">GA</div>
            <div className="mt-3 space-y-3">
              {noProjectBuckets.ga.length ? (
                noProjectBuckets.ga.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}?returnTo=${encodeURIComponent(returnToTasks)}`}
                    className="block rounded-xl border border-stone-200/70 bg-white/80 px-4 py-3 transition hover:border-stone-300 hover:bg-white/90 hover:shadow-sm dark:border-stone-800/70 dark:bg-stone-900/60 dark:hover:border-stone-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{t.title}</div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          GA
                        </Badge>
                        {t.assigned_to ? (
                          <div
                            className="h-7 w-7 rounded-full bg-rose-100 text-[10px] font-semibold text-rose-700 flex items-center justify-center dark:bg-rose-900/40 dark:text-rose-200"
                            title={assigneeLabel(userMap.get(t.assigned_to) || null)}
                          >
                            {initials(assigneeLabel(userMap.get(t.assigned_to) || null))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No tasks</div>
              )}
            </div>
          </Card>

          <Card className="rounded-2xl border-rose-100 bg-rose-50/60 p-4 shadow-sm dark:border-rose-900/50 dark:bg-rose-950/30">
            <div className="flex items-center gap-2 text-rose-700 font-semibold">
              <span className="h-5 w-5 rounded-full bg-rose-500" />
              <span>BLOCKED</span>
            </div>
            <div className="mt-3 space-y-3">
              {noProjectBuckets.blocked.length ? (
                noProjectBuckets.blocked.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}?returnTo=${encodeURIComponent(returnToTasks)}`}
                    className="block rounded-xl border border-rose-100/80 bg-white/80 px-4 py-3 transition hover:bg-rose-50 hover:shadow-sm dark:border-rose-900/50 dark:bg-rose-950/20 dark:hover:bg-rose-950/30"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{t.title}</div>
                      {t.assigned_to ? (
                        <div
                          className="h-7 w-7 rounded-full bg-rose-100 text-[10px] font-semibold text-rose-700 flex items-center justify-center"
                          title={assigneeLabel(userMap.get(t.assigned_to) || null)}
                        >
                          {initials(assigneeLabel(userMap.get(t.assigned_to) || null))}
                        </div>
                      ) : null}
                    </div>
                    <Badge variant="outline" className="mt-2 text-xs border-rose-200 text-rose-600 dark:border-rose-800 dark:text-rose-200">
                      BLOCKED
                    </Badge>
                  </Link>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No tasks</div>
              )}
            </div>
          </Card>

          <Card className="rounded-2xl border-amber-100 bg-amber-50/60 p-4 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/25">
            <div className="flex items-center gap-2 text-amber-700 font-semibold">
              <span className="h-5 w-5 rounded-full border-2 border-amber-500" />
              <span>1H Report</span>
            </div>
            <div className="mt-3 space-y-3">
              {noProjectBuckets.oneHour.length ? (
                noProjectBuckets.oneHour.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}?returnTo=${encodeURIComponent(returnToTasks)}`}
                    className="block rounded-xl border border-amber-100/80 bg-white/80 px-4 py-3 transition hover:bg-amber-50 hover:shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{t.title}</div>
                      {t.assigned_to ? (
                        <div
                          className="h-7 w-7 rounded-full bg-amber-100 text-[10px] font-semibold text-amber-700 flex items-center justify-center"
                          title={assigneeLabel(userMap.get(t.assigned_to) || null)}
                        >
                          {initials(assigneeLabel(userMap.get(t.assigned_to) || null))}
                        </div>
                      ) : null}
                    </div>
                    <Badge variant="outline" className="mt-2 text-xs border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-200">
                      1H
                    </Badge>
                  </Link>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No tasks</div>
              )}
            </div>
          </Card>

          <Card className="rounded-2xl border-emerald-100 bg-emerald-50/60 p-4 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <div className="text-emerald-700 font-semibold">R1</div>
            <div className="mt-2 text-sm text-emerald-700/80">
              New project (first case) is handled with the manager.
            </div>
            <div className="mt-3 space-y-3">
              {noProjectBuckets.r1.length ? (
                noProjectBuckets.r1.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tasks/${t.id}?returnTo=${encodeURIComponent(returnToTasks)}`}
                    className="block rounded-xl border border-emerald-100/80 bg-white/80 px-4 py-3 transition hover:bg-emerald-50 hover:shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{t.title}</div>
                      {t.assigned_to ? (
                        <div
                          className="h-7 w-7 rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-700 flex items-center justify-center"
                          title={assigneeLabel(userMap.get(t.assigned_to) || null)}
                        >
                          {initials(assigneeLabel(userMap.get(t.assigned_to) || null))}
                        </div>
                      ) : null}
                    </div>
                    <Badge variant="outline" className="mt-2 text-xs border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-200">
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
        </div>
      ) : null}

      {activeTab === "ga-ka" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-lg font-semibold">GA/KA Notes</div>
            {!isReadOnly ? (
              <Dialog open={gaNoteOpen} onOpenChange={setGaNoteOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">+ Add Note</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add GA/KA Note</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Project</Label>
                      <Select value={newGaNoteProjectId} onValueChange={setNewGaNoteProjectId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select project (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No project (General)</SelectItem>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.title || project.name || "Project"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!projects.length ? (
                        <div className="text-xs text-muted-foreground">No projects available.</div>
                      ) : null}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select value={newGaNoteType} onValueChange={setNewGaNoteType}>
                          <SelectTrigger>
                            <SelectValue placeholder="GA/KA" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GA">GA</SelectItem>
                            <SelectItem value="KA">KA</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Priority</Label>
                        <Select value={newGaNotePriority} onValueChange={setNewGaNotePriority}>
                          <SelectTrigger>
                            <SelectValue placeholder="Priority" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No priority</SelectItem>
                            <SelectItem value="NORMAL">Normal</SelectItem>
                            
                            <SelectItem value="HIGH">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Note</Label>
                      <Textarea
                        placeholder="Add GA/KA note..."
                        value={newGaNote}
                        onChange={(e) => setNewGaNote(e.target.value)}
                        rows={4}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setGaNoteOpen(false)}>
                        Cancel
                      </Button>
                      <Button disabled={!newGaNote.trim() || addingGaNote} onClick={() => void submitGaNote()}>
                        {addingGaNote ? "Saving..." : "Add Note"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
          {visibleGaNotes.length ? (
            [...visibleGaNotes]
              .sort((a, b) => {
                const order = ["HIGH", "NORMAL"]
                const aRank = a.priority ? order.indexOf(a.priority) : order.length
                const bRank = b.priority ? order.indexOf(b.priority) : order.length
                if (aRank !== bRank) return aRank - bRank
                const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
                const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
                return bTime - aTime
              })
              .map((note) => {
              const author = users.find((u) => u.id === note.created_by) || null
              const project = note.project_id ? projects.find((p) => p.id === note.project_id) || null : null
              return (
                <Card key={note.id} className="rounded-2xl border-stone-200/70 bg-white/80 p-5 shadow-sm dark:border-stone-800/70 dark:bg-stone-900/70">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Badge
                        variant="outline"
                        className={note.note_type === "KA" ? "border-orange-200 text-orange-600" : "border-blue-200 text-blue-600"}
                        >
                          {note.note_type || "GA"}
                        </Badge>
                        <span>By {author?.full_name || author?.username || "-"}</span>
                        <span>- {note.created_at ? new Date(note.created_at).toLocaleString("en-US") : "-"}</span>
                        {project ? (
                          <Badge variant="outline" className="text-sm px-2 py-0.5">
                            {project.title || project.name || "Project"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-sm px-2 py-0.5">
                            General
                          </Badge>
                        )}
                        {note.priority ? <Badge variant="secondary">{note.priority}</Badge> : null}
                      </div>
                    {note.status !== "CLOSED" ? (
                      !isReadOnly ? (
                        <Button variant="outline" size="sm" onClick={() => void closeGaNote(note.id)}>
                          Close
                        </Button>
                      ) : (
                        <Badge variant="secondary">Open</Badge>
                      )
                    ) : (
                      <Badge variant="secondary">Closed</Badge>
                    )}
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">{note.content}</div>
                </Card>
              )
            })
            ) : (
              <div className="text-sm text-muted-foreground">No GA/KA notes yet.</div>
            )}
          </div>
        ) : null}

      {activeTab === "meetings" ? (
        <div className="space-y-4">
          <div className="text-xl font-semibold">Meetings</div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-2xl border-stone-200/70 bg-white/80 p-5 shadow-sm space-y-4 dark:border-stone-800/70 dark:bg-stone-900/70">
              <div className="text-sm font-semibold">External Meetings</div>
              {!isReadOnly ? (
                <div className="grid gap-3">
                  <Input
                    placeholder="Meeting title"
                    value={meetingTitle}
                    onChange={(e) => setMeetingTitle(e.target.value)}
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      placeholder="Platform (Zoom, Meet, Office...)"
                      value={meetingPlatform}
                      onChange={(e) => setMeetingPlatform(e.target.value)}
                    />
                    <Input
                      type="datetime-local"
                      value={meetingStartsAt}
                      onChange={(e) => setMeetingStartsAt(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select value={meetingProjectId} onValueChange={setMeetingProjectId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Project (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No project</SelectItem>
                        {filteredProjects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.title || project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button disabled={!meetingTitle.trim() || creatingMeeting} onClick={() => void submitMeeting()}>
                      {creatingMeeting ? "Saving..." : "Add"}
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="space-y-3">
                {visibleMeetings.length ? (
                  visibleMeetings.map((meeting) => {
                    const project = meeting.project_id
                      ? projects.find((p) => p.id === meeting.project_id) || null
                      : null
                    const isEditing = !isReadOnly && editingMeetingId === meeting.id
                    return (
                      <Card key={meeting.id} className="rounded-2xl border-stone-200/70 bg-white/80 p-4 shadow-sm dark:border-stone-800/70 dark:bg-stone-900/70">
                        {isEditing ? (
                          <div className="space-y-3">
                            <Input
                              value={editMeetingTitle}
                              onChange={(e) => setEditMeetingTitle(e.target.value)}
                            />
                            <div className="grid gap-3 md:grid-cols-2">
                              <Input
                                value={editMeetingPlatform}
                                onChange={(e) => setEditMeetingPlatform(e.target.value)}
                                placeholder="Platform"
                              />
                              <Input
                                type="datetime-local"
                                value={editMeetingStartsAt}
                                onChange={(e) => setEditMeetingStartsAt(e.target.value)}
                              />
                            </div>
                            <Select value={editMeetingProjectId} onValueChange={setEditMeetingProjectId}>
                              <SelectTrigger>
                                <SelectValue placeholder="Project (optional)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">No project</SelectItem>
                                {filteredProjects.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.title || p.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" onClick={cancelEditMeeting}>
                                Cancel
                              </Button>
                              <Button onClick={() => void saveMeeting(meeting.id)}>Save</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold">{formatMeetingLabel(meeting)}</div>
                              {project ? (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Project: {project.title || project.name}
                                </div>
                              ) : null}
                            </div>
                            {!isReadOnly ? (
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" onClick={() => startEditMeeting(meeting)}>
                                  Edit
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => void deleteMeeting(meeting.id)}>
                                  Delete
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </Card>
                    )
                  })
                ) : (
                  <div className="text-sm text-muted-foreground">No external meetings yet.</div>
                )}
              </div>
            </Card>

            <Card className="rounded-2xl border-stone-200/70 bg-white/80 p-5 shadow-sm space-y-4 dark:border-stone-800/70 dark:bg-stone-900/70">
              <div className="text-sm font-semibold">Internal Meetings</div>
              <div>
                <div className="text-base font-semibold">{INTERNAL_MEETING.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {INTERNAL_MEETING.team.join(", ")}
                </div>
              </div>
              <div className="inline-flex rounded-full border border-stone-200/70 bg-white/70 p-1 shadow-sm backdrop-blur dark:border-stone-800/70 dark:bg-stone-950/40">
                {(Object.keys(INTERNAL_MEETING.slots) as Array<keyof typeof INTERNAL_MEETING.slots>).map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setInternalSlot(slot)}
                    className={[
                      "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                      internalSlot === slot
                        ? "bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-900"
                        : "text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200",
                    ].join(" ")}
                  >
                    {slot}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                <div className="text-sm font-semibold">{INTERNAL_MEETING.slots[internalSlot].label}</div>
                <div className="space-y-2">
                  {INTERNAL_MEETING.slots[internalSlot].items.map((item, idx) => (
                    <div key={item} className="flex items-start gap-3 rounded-xl border border-stone-200/70 bg-white/80 px-3 py-2 dark:border-stone-800/70 dark:bg-stone-900/70">
                      <Checkbox checked={false} disabled />
                      <div className="text-sm text-muted-foreground">
                        {idx + 1}. {item}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  )
}
