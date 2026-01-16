"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { toast } from "sonner"
import { Trash2 } from "lucide-react"

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

// --- CONSTANTS ---

const TABS = [
  { id: "all", label: "Overview", tone: "neutral" },
  { id: "projects", label: "Projects", tone: "neutral" },
  { id: "system", label: "System Tasks", tone: "blue" },
  { id: "no-project", label: "Fast Tasks", tone: "red" },
  { id: "ga-ka", label: "GA/KA Notes", tone: "neutral" },
  { id: "meetings", label: "Meetings", tone: "neutral" },
] as const

type TabId = (typeof TABS)[number]["id"]

const GENERAL_PROJECT_PHASES = ["MEETINGS", "PLANNING", "DEVELOPMENT", "TESTING", "DOCUMENTATION"] as const
const MST_PROJECT_PHASES = ["PLANNING", "PRODUCT", "CONTROL", "FINAL"] as const

const PHASE_LABELS: Record<string, string> = {
  MEETINGS: "Meetings",
  PLANNING: "Planning",
  DEVELOPMENT: "Development",
  TESTING: "Testing",
  DOCUMENTATION: "Documentation",
  PRODUCT: "Product",
  CONTROL: "Control",
  FINAL: "Final",
  CLOSED: "Closed",
}

const WEEKDAYS_SQ = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

const PROJECT_TYPES = [
  { id: "GENERAL", label: "General" },
  { id: "MST", label: "MST Project" },
] as const

const formatProjectTitle = (title: string, type: (typeof PROJECT_TYPES)[number]["id"]) => {
  const trimmed = title.trim()
  if (!trimmed) return ""
  if (type !== "MST") return trimmed
  const normalized = trimmed.toUpperCase()
  if (normalized.includes("MST")) return trimmed
  return `MST - ${trimmed}`
}

const formatProjectTitleWithProducts = (project: Project | null | undefined): string => {
  if (!project) return ""
  const baseTitle = project.title || project.name || ""
  if (!baseTitle) return ""
  
  // Add total products if available and project is MST type
  if (project.project_type === "MST" && project.total_products != null && project.total_products > 0) {
    return `${baseTitle} - ${project.total_products}`
  }
  
  return baseTitle
}

const FREQUENCY_LABELS: Record<SystemTaskTemplate["frequency"], string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
  "3_MONTHS": "3/6 months",
  "6_MONTHS": "3/6 months",
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  NORMAL: "Normal",
  HIGH: "High",
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
  { id: "personal", label: "Personal", description: "Personal tasks tracked only in this view." },
  { id: "ga", label: "GA", description: "GA tasks that should be tracked separately." },
  { id: "blocked", label: "BLLOK", description: "Blocked all day by a single task." },
  { id: "hourly", label: "1H Report", description: "Hourly meeting/reporting task." },
  { id: "r1", label: "R1", description: "First case must be discussed with the manager." },
] as const

function isFastNormalTask(task: Task) {
  return (
    !task.project_id &&
    !task.system_template_origin_id &&
    !task.ga_note_origin_id &&
    !task.is_bllok &&
    !task.is_1h_report &&
    !task.is_r1 &&
    !task.is_personal &&
    task.priority === "NORMAL" &&
    task.department_id !== null
  )
}

const INTERNAL_MEETING = {
  title: "Daily Sync (Development)",
  team: ["Elsa Ferati", "Rinesa Ahmedi", "Laurent Hoxha", "Endi Hyseni"],
  slots: {
    M1: {
      label: "M1: Morning Standup (08:08 - 08:15)",
      items: [
        "Attendances & Plan changes?",
        "Check GA/KA notes in Trello/Groups.",
        "Check new emails (IT).",
        "Discuss individual tasks (Open RD/Trello side-by-side).",
        "Copy Development group notes to Trello GA/KA.",
      ],
    },
    M2: {
      label: "M2: Mid-day Check (12:00 - 12:15)",
      items: [
        "Check GA/KA notes in Trello/Groups.",
        "Discuss progress so far.",
        "What remains for PM?",
      ],
    },
    M3: {
      label: "M3: Wrap-up (16:10 - 16:30)",
      items: [
        "Check GA/KA notes.",
        "Discuss daily achievements.",
        "Plan for tomorrow.",
      ],
    },
  },
} as const

// --- HELPERS ---

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
  const date = now.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
  const day = now.toLocaleDateString("en-US", { weekday: "long" })
  return `${day}, ${date}`
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

function getLastDayOfMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function getFirstWorkingDay(year: number, monthIndex: number) {
  const firstDay = new Date(year, monthIndex, 1)
  const day = firstDay.getDay()
  if (day === 6) return 3
  if (day === 0) return 2
  return 1
}

function getYearEndDate(year: number) {
  const date = new Date(year, 11, 31)
  const weekday = date.getDay()
  if (weekday === 6) date.setDate(date.getDate() - 1)
  if (weekday === 0) date.setDate(date.getDate() - 2)
  return date
}

function getScheduledDateForMonth(t: SystemTaskTemplate, year: number, monthIndex: number) {
  const lastDay = getLastDayOfMonth(year, monthIndex)
  let day =
    t.day_of_month == null ? 1 : t.day_of_month === 0 ? lastDay : t.day_of_month === -1 ? getFirstWorkingDay(year, monthIndex) : t.day_of_month
  if (day < 1 || day > lastDay) return null
  const scheduled = new Date(year, monthIndex, day)
  if (t.day_of_month !== -1) {
    const weekday = scheduled.getDay()
    if (weekday === 6) scheduled.setDate(scheduled.getDate() - 1)
    if (weekday === 0) scheduled.setDate(scheduled.getDate() - 2)
  }
  return scheduled
}

function shouldShowTemplate(t: SystemTaskTemplate, date: Date) {
  if (t.frequency === "DAILY") return true
  if (t.frequency === "WEEKLY") {
    const dayIdx = date.getDay() === 0 ? 6 : date.getDay() - 1
    const days =
      t.days_of_week && t.days_of_week.length
        ? t.days_of_week
        : t.day_of_week != null
          ? [t.day_of_week]
          : null
    return days ? days.includes(dayIdx) : dayIdx === 0
  }
  if (t.frequency === "MONTHLY") {
    const current = getScheduledDateForMonth(t, date.getFullYear(), date.getMonth())
    const next = getScheduledDateForMonth(t, date.getFullYear(), date.getMonth() + 1)
    return (current && isSameDay(current, date)) || (next && isSameDay(next, date))
  }
  if (t.frequency === "YEARLY") {
    if (t.day_of_month === 0) {
      const current = getYearEndDate(date.getFullYear())
      const next = getYearEndDate(date.getFullYear() + 1)
      return (current && isSameDay(current, date)) || (next && isSameDay(next, date))
    }
    if (t.month_of_year == null) {
      const current = getScheduledDateForMonth(t, date.getFullYear(), date.getMonth())
      const next = getScheduledDateForMonth(t, date.getFullYear(), date.getMonth() + 1)
      return (current && isSameDay(current, date)) || (next && isSameDay(next, date))
    }
    const targetMonth = t.month_of_year - 1
    const current = getScheduledDateForMonth(t, date.getFullYear(), targetMonth)
    const next = getScheduledDateForMonth(t, date.getFullYear() + 1, targetMonth)
    return (current && isSameDay(current, date)) || (next && isSameDay(next, date))
  }
  if (t.frequency === "3_MONTHS" || t.frequency === "6_MONTHS") {
    const interval = t.frequency === "3_MONTHS" ? 3 : 6
    const monthValue = date.getMonth() + 1
    const nextDate = new Date(date.getFullYear(), date.getMonth() + 1, 1)
    const nextMonthValue = nextDate.getMonth() + 1
    const targetMonth = t.month_of_year != null ? t.month_of_year : null
    if (targetMonth != null && targetMonth !== monthValue && targetMonth !== nextMonthValue) return false
    const current =
      monthValue % interval === 0 ? getScheduledDateForMonth(t, date.getFullYear(), date.getMonth()) : null
    const next =
      nextMonthValue % interval === 0 ? getScheduledDateForMonth(t, nextDate.getFullYear(), nextDate.getMonth()) : null
    return (current && isSameDay(current, date)) || (next && isSameDay(next, date))
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

function startOfWeekMonday(date: Date) {
  const day = date.getDay()
  const diff = (day + 6) % 7
  const start = new Date(date)
  start.setDate(date.getDate() - diff)
  start.setHours(0, 0, 0, 0)
  return start
}

function formatPrintDay(date: Date) {
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" })
  const day = date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" })
  return `${weekday} ${day}`
}

function noProjectTypeLabel(task: Task) {
  if (task.is_bllok) return "BLLOK"
  if (task.is_1h_report) return "1H"
  if (task.is_r1) return "R1"
  if (task.is_personal) return "Personal"
  if (task.ga_note_origin_id) return "GA"
  return "Normal"
}

function formatMeetingPrintLabel(meeting: Meeting) {
  if (!meeting.starts_at) return meeting.title || "Meeting"
  const date = new Date(meeting.starts_at)
  if (Number.isNaN(date.getTime())) return meeting.title || "Meeting"
  const timeLabel = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  return `${timeLabel} ${meeting.title || "Meeting"}`
}

function toMeetingInputValue(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(0, 16)
}

function normalizePriority(value?: TaskPriority | string | null): TaskPriority {
  const normalized = typeof value === "string" ? value.toUpperCase() : null
  if (normalized === "URGENT") return "HIGH"
  if (normalized === "LOW" || normalized === "MEDIUM") return "NORMAL"
  if (normalized === "NORMAL" || normalized === "HIGH") return normalized
  return "NORMAL"
}

function gaNoteTaskDefaultTitle(note: string) {
  return note.length > 50 ? note.slice(0, 50) + "..." : note
}

// --- MAIN COMPONENT ---

export default function DepartmentKanban() {
  const departmentName = "Graphic Design"
  const { apiFetch, user } = useAuth()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const normalizedTab = tabParam === "tasks" ? "no-project" : tabParam
  const isTabId = Boolean(normalizedTab && TABS.some((tab) => tab.id === normalizedTab))
  const returnToTasks = `${pathname}?tab=no-project`

  // --- STATES ---
  const [department, setDepartment] = React.useState<Department | null>(null)
  const [projects, setProjects] = React.useState<Project[]>([])
  const [templateProjects, setTemplateProjects] = React.useState<Project[]>([])
  const [projectMembers, setProjectMembers] = React.useState<Record<string, UserLookup[]>>({})
  const projectMembersRef = React.useRef<Record<string, UserLookup[]>>({})
  const [systemTasks, setSystemTasks] = React.useState<SystemTaskTemplate[]>([])
  const [systemStatusUpdatingId, setSystemStatusUpdatingId] = React.useState<string | null>(null)
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
  const [printRange, setPrintRange] = React.useState<"today" | "week">("week")

  // Form States
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
  const [projectMemberIds, setProjectMemberIds] = React.useState<string[]>([])
  const [selectMembersOpen, setSelectMembersOpen] = React.useState(false)
  const [projectType, setProjectType] = React.useState<(typeof PROJECT_TYPES)[number]["id"]>("GENERAL")
  const [projectPhase, setProjectPhase] = React.useState("MEETINGS")
  const [projectStatus, setProjectStatus] = React.useState("TODO")
  const [mstTemplateId, setMstTemplateId] = React.useState("__auto__")
  const [totalProducts, setTotalProducts] = React.useState("")

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
  const [deletingNoProjectTaskId, setDeletingNoProjectTaskId] = React.useState<string | null>(null)

  const [gaNoteOpen, setGaNoteOpen] = React.useState(false)
  const [addingGaNote, setAddingGaNote] = React.useState(false)
  const [newGaNoteProjectId, setNewGaNoteProjectId] = React.useState("__none__")
  const [newGaNoteType, setNewGaNoteType] = React.useState<"GA" | "KA">("GA")
  const [newGaNotePriority, setNewGaNotePriority] = React.useState<"__none__" | "NORMAL" | "HIGH">("__none__")
  const [newGaNote, setNewGaNote] = React.useState("")

  const [gaNoteCreateTask, setGaNoteCreateTask] = React.useState(false)
  const [gaNoteTaskOpenId, setGaNoteTaskOpenId] = React.useState<string | null>(null)
  const [creatingGaNoteTask, setCreatingGaNoteTask] = React.useState(false)
  const [gaNoteTaskAssigneeId, setGaNoteTaskAssigneeId] = React.useState("__unassigned__")
  const [gaNoteTaskTitle, setGaNoteTaskTitle] = React.useState("")
  const [gaNoteTaskDescription, setGaNoteTaskDescription] = React.useState("")
  const [gaNoteTaskPriority, setGaNoteTaskPriority] = React.useState<TaskPriority>("NORMAL")
  const [gaNoteTaskDueDate, setGaNoteTaskDueDate] = React.useState("")
  const [gaNoteTaskFinishPeriod, setGaNoteTaskFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(
    FINISH_PERIOD_NONE_VALUE
  )

  // --- DATA LOADING ---
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
          apiFetch(`/projects?department_id=${dep.id}&include_templates=true`),
          apiFetch(`/system-tasks?department_id=${dep.id}`),
          apiFetch(`/tasks?department_id=${dep.id}&include_done=false`),
          apiFetch(`/ga-notes?department_id=${dep.id}`),
          apiFetch(`/meetings?department_id=${dep.id}`),
        ])
        let templateProjectIds = new Set<string>()
        if (projRes.ok) {
          const allProjects = (await projRes.json()) as Project[]
          const templateProjects = allProjects.filter((p) => p.is_template)
          templateProjectIds = new Set(templateProjects.map((p) => p.id))
          setTemplateProjects(templateProjects)
          setProjects(allProjects.filter((p) => !p.is_template))
        }
        if (sysRes.ok) setSystemTasks((await sysRes.json()) as SystemTaskTemplate[])
        if (tasksRes.ok) {
          const taskRows = (await tasksRes.json()) as Task[]
          const nonSystemTasks = taskRows.filter(
            (t) => !t.system_template_origin_id && (!t.project_id || !templateProjectIds.has(t.project_id))
          )
          setDepartmentTasks(nonSystemTasks)
          setNoProjectTasks(nonSystemTasks.filter(isFastNormalTask))
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
    projectMembersRef.current = projectMembers
  }, [projectMembers])

  React.useEffect(() => {
    if (!projects.length) return
    let cancelled = false
    const loadMembers = async () => {
      const missing = projects.filter((project) => !projectMembersRef.current[project.id])
      if (!missing.length) return
      const results = await Promise.all(
        missing.map(async (project) => {
          const res = await apiFetch(`/project-members?project_id=${project.id}`)
          if (!res.ok) return { id: project.id, members: [] as UserLookup[] }
          const members = (await res.json()) as UserLookup[]
          return { id: project.id, members }
        })
      )
      if (cancelled) return
      setProjectMembers((prev) => {
        const next = { ...prev }
        for (const result of results) {
          next[result.id] = result.members
        }
        return next
      })
    }
    void loadMembers()
    return () => {
      cancelled = true
    }
  }, [projects, apiFetch])

  React.useEffect(() => {
    if (isTabId) {
      setActiveTab(normalizedTab as TabId)
    }
  }, [isTabId, normalizedTab])

  // --- MEMOS ---
  const userMap = React.useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const departmentUsers = React.useMemo(
    () => (department ? users.filter((u) => u.department_id === department.id) : []),
    [department, users]
  )
  const projectPhaseOptions = projectType === "MST" ? MST_PROJECT_PHASES : GENERAL_PROJECT_PHASES
  const mstTemplateOptions = React.useMemo(() => {
    return templateProjects.filter((p) => {
      if (p.project_type) return p.project_type === "MST"
      const title = (p.title || p.name || "").toUpperCase()
      return title.includes("MST")
    })
  }, [templateProjects])
  const todayDate = React.useMemo(() => new Date(), [])
  const weekDates = React.useMemo(() => {
    const start = startOfWeekMonday(todayDate)
    return Array.from({ length: 5 }, (_, index) => {
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    })
  }, [todayDate])
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
    () => {
      // Show ONLY tasks specific to this department (exclude global/ALL scope)
      const depTasks = department ? systemTasks.filter((t) => t.department_id === department.id) : []
      return isMineView && user?.id ? depTasks.filter((t) => t.default_assignee_id === user.id) : depTasks
    },
    [systemTasks, isMineView, user?.id, department]
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
      const matchesDate = date ? isSameDay(date, todayDate) : false
      if (!matchesDate) return false
      if (selectedUserId !== "__all__") {
        return task.assigned_to === selectedUserId
      }
      return true
    })
  }, [projectTasks, todayDate, selectedUserId])
  const todayNoProjectTasks = React.useMemo(() => {
    return visibleNoProjectTasks.filter((task) => {
      const date = toDate(task.due_date || task.start_date || task.created_at)
      const matchesDate = date ? isSameDay(date, todayDate) : false
      if (!matchesDate) return false
      if (selectedUserId !== "__all__") {
        return task.assigned_to === selectedUserId
      }
      return true
    })
  }, [visibleNoProjectTasks, todayDate, selectedUserId])
  const todayOpenNotes = React.useMemo(() => {
    return openNotes.filter((note) => {
      const date = toDate(note.created_at)
      const matchesDate = date ? isSameDay(date, todayDate) : false
      if (!matchesDate) return false
      if (selectedUserId !== "__all__") {
        return note.created_by === selectedUserId
      }
      return true
    })
  }, [openNotes, todayDate, selectedUserId])
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
  const weekProjectTasks = React.useMemo(() => {
    return weekDates.map((date) => {
      return projectTasks
        .filter((task) => {
          const taskDate = toDate(task.due_date || task.start_date || task.created_at)
          return taskDate ? isSameDay(taskDate, date) : false
        })
        .map((task) => {
          const project = projects.find((p) => p.id === task.project_id) || null
          const projectLabel = project?.title || project?.name || "Project"
          return `${projectLabel}: ${task.title}`
        })
        .sort((a, b) => a.localeCompare(b))
    })
  }, [projectTasks, projects, weekDates])
  const weekNoProjectTasks = React.useMemo(() => {
    const fallbackDate =
      weekDates.find((date) => isSameDay(date, todayDate)) || weekDates[0]
    return weekDates.map((date) => {
      return visibleNoProjectTasks
        .filter((task) => {
          const taskDate = toDate(task.due_date || task.start_date || task.planned_for)
          const resolvedDate = taskDate || fallbackDate
          return resolvedDate ? isSameDay(resolvedDate, date) : false
        })
        .map((task) => `${noProjectTypeLabel(task)}: ${task.title}`)
        .sort((a, b) => a.localeCompare(b))
    })
  }, [visibleNoProjectTasks, weekDates])
  const weekNotes = React.useMemo(() => {
    return weekDates.map((date) => {
      return openNotes
        .filter((note) => {
          const noteDate = toDate(note.created_at)
          return noteDate ? isSameDay(noteDate, date) : false
        })
        .map((note) => note.content || "Note")
        .sort((a, b) => a.localeCompare(b))
    })
  }, [openNotes, weekDates])
  const weekSystemTasks = React.useMemo(() => {
    return weekDates.map((date) => {
      return visibleSystemTemplates
        .filter((task) => shouldShowTemplate(task, date))
        .map((task) => task.title || "System task")
        .sort((a, b) => a.localeCompare(b))
    })
  }, [visibleSystemTemplates, weekDates])
  const weekMeetings = React.useMemo(() => {
    return weekDates.map((date) => {
      return visibleMeetings
        .filter((meeting) => {
          if (!meeting.starts_at) return false
          const start = new Date(meeting.starts_at)
          if (Number.isNaN(start.getTime())) return false
          return isSameDay(start, date)
        })
        .map(formatMeetingPrintLabel)
        .sort((a, b) => a.localeCompare(b))
    })
  }, [visibleMeetings, weekDates])
  const printRows = React.useMemo(
    () => [
      { id: "project", label: "Project tasks", itemsByDay: weekProjectTasks },
      { id: "no-project", label: "Fast tasks", itemsByDay: weekNoProjectTasks },
      { id: "notes", label: "GA/KA notes", itemsByDay: weekNotes },
      { id: "system", label: "System tasks", itemsByDay: weekSystemTasks },
      { id: "meetings", label: "Meetings", itemsByDay: weekMeetings },
    ],
    [weekMeetings, weekNoProjectTasks, weekNotes, weekProjectTasks, weekSystemTasks]
  )
  const weekRangeLabel = React.useMemo(() => {
    const start = weekDates[0]
    const end = weekDates[weekDates.length - 1]
    if (!start || !end) return ""
    const startLabel = start.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
    const endLabel = end.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
    return `${startLabel} - ${endLabel}`
  }, [weekDates])
  const todayProjectPrint = React.useMemo(() => {
    return todayProjectTasks
      .map((task) => {
        const project = task.project_id ? projects.find((p) => p.id === task.project_id) || null : null
        const projectLabel = project?.title || project?.name || "Project"
        return `${projectLabel}: ${task.title}`
      })
      .sort((a, b) => a.localeCompare(b))
  }, [projects, todayProjectTasks])
  const todayNoProjectPrint = React.useMemo(() => {
    return todayNoProjectTasks
      .map((task) => `${noProjectTypeLabel(task)}: ${task.title}`)
      .sort((a, b) => a.localeCompare(b))
  }, [todayNoProjectTasks])
  const todayNotesPrint = React.useMemo(() => {
    return todayOpenNotes.map((note) => note.content || "Note").sort((a, b) => a.localeCompare(b))
  }, [todayOpenNotes])
  const todaySystemPrint = React.useMemo(() => {
    return todaySystemTasks.map((task) => task.title || "System task").sort((a, b) => a.localeCompare(b))
  }, [todaySystemTasks])
  const todayMeetingsPrint = React.useMemo(() => {
    return todayMeetings.map(formatMeetingPrintLabel).sort((a, b) => a.localeCompare(b))
  }, [todayMeetings])
  const printDates = React.useMemo(() => {
    return printRange === "today" ? [todayDate] : weekDates
  }, [printRange, todayDate, weekDates])
  const printRowsByRange = React.useMemo(() => {
    if (printRange === "today") {
      return [
        { id: "project", label: "Project tasks", itemsByDay: [todayProjectPrint] },
        { id: "no-project", label: "Fast tasks", itemsByDay: [todayNoProjectPrint] },
        { id: "notes", label: "GA/KA notes", itemsByDay: [todayNotesPrint] },
        { id: "system", label: "System tasks", itemsByDay: [todaySystemPrint] },
        { id: "meetings", label: "Meetings", itemsByDay: [todayMeetingsPrint] },
      ]
    }
    return printRows
  }, [
    printRange,
    printRows,
    todayMeetingsPrint,
    todayNoProjectPrint,
    todayNotesPrint,
    todayProjectPrint,
    todaySystemPrint,
  ])
  const printRangeLabel = React.useMemo(() => {
    if (printRange === "today") {
      const dateLabel = todayDate.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
      return `Today - ${dateLabel}`
    }
    return weekRangeLabel
  }, [printRange, todayDate, weekRangeLabel])

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
    [filteredProjects, visibleSystemTemplates, visibleNoProjectTasks, visibleGaNotes, visibleMeetings, todayProjectTasks, todayNoProjectTasks, todayOpenNotes, todaySystemTasks, todayMeetings]
  )

  const canCreate = true // Everyone in this department can create/manage
  const isReadOnly = viewMode === "mine"
  const canManage = canCreate && !isReadOnly
  const canDeleteNoProject = user?.role === "ADMIN" && !isReadOnly

  const visibleSystemTasks = React.useMemo(() => {
    if (showAllSystem) return visibleSystemTemplates
    return visibleSystemTemplates.filter((t) => shouldShowTemplate(t, systemDate))
  }, [showAllSystem, systemDate, visibleSystemTemplates])

  const noProjectBuckets = React.useMemo(() => {
    const normal: Task[] = []
    const personal: Task[] = []
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
      } else if (t.is_personal) {
        personal.push(t)
      } else if (t.ga_note_origin_id) {
        ga.push(t)
      } else if (isFastNormalTask(t)) {
        normal.push(t)
      }
    }
    return { normal, personal, ga, blocked, oneHour, r1 }
  }, [visibleNoProjectTasks])

  const gaNoteTaskMap = React.useMemo(() => {
    const map = new Map<string, Task>()
    for (const task of departmentTasks) {
      if (task.ga_note_origin_id) {
        map.set(task.ga_note_origin_id, task)
      }
    }
    return map
  }, [departmentTasks])

  const systemGroups = React.useMemo(() => {
    const groups = new Map<string, SystemTaskTemplate[]>()
    for (const t of visibleSystemTasks) {
      const key = FREQUENCY_LABELS[t.frequency] || "Daily"
      const list = groups.get(key) || []
      list.push(t)
      groups.set(key, list)
    }
    return Array.from(groups.entries()).map(([label, items]) => ({
      label,
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

  // --- ACTIONS ---

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
        days_of_week: systemFrequency === "WEEKLY" ? [dayIdx] : null,
        day_of_month: systemFrequency !== "WEEKLY" && systemFrequency !== "DAILY" ? dayOfMonth : null,
        month_of_year:
          systemFrequency === "YEARLY" || systemFrequency === "3_MONTHS" || systemFrequency === "6_MONTHS"
            ? monthOfYear : null,
        is_active: systemStatus === "OPEN",
      }
      const res = await apiFetch("/system-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      if (!res.ok) { toast.error("Failed to create system task"); return }
      const created = (await res.json()) as SystemTaskTemplate
      setSystemTasks((prev) => [created, ...prev])
      setCreateSystemOpen(false)
      setSystemTitle("")
      setSystemDescription("")
      toast.success("System task created")
    } finally {
      setCreatingSystem(false)
    }
  }

  const updateSystemTaskStatus = async (taskId: string, nextStatus: "TODO" | "DONE") => {
    setSystemStatusUpdatingId(taskId)
    try {
      const res = await apiFetch(`/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!res.ok) {
        toast.error("Failed to update system task status")
        return
      }
      setSystemTasks((prev) =>
        prev.map((item) => (item.id === taskId ? { ...item, status: nextStatus } : item))
      )
      toast.success(nextStatus === "DONE" ? "System task closed" : "System task reopened")
    } finally {
      setSystemStatusUpdatingId(null)
    }
  }

  const submitProject = async () => {
    if (!department) return
    const resolvedTitle = formatProjectTitle(projectTitle, projectType)
    if (!resolvedTitle) return
    setCreatingProject(true)
    try {
      const payload: Record<string, unknown> = {
        title: resolvedTitle,
        description: projectDescription.trim() || null,
        department_id: department.id,
        manager_id: projectMemberIds.length > 0 ? projectMemberIds[0] : (projectManagerId === "__unassigned__" ? null : projectManagerId),
        project_type: projectType,
        current_phase: projectPhase,
        status: projectStatus,
      }
      if (projectType === "MST" && mstTemplateId !== "__auto__") {
        payload.template_project_id = mstTemplateId
      }
      if (projectType === "MST" && totalProducts.trim()) {
        const totalProductsNum = parseInt(totalProducts.trim(), 10)
        if (!isNaN(totalProductsNum) && totalProductsNum >= 0) {
          payload.total_products = totalProductsNum
        }
      }
      const res = await apiFetch("/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      if (!res.ok) { toast.error("Failed to create project"); return }
      const created = (await res.json()) as Project
      
      // Add project members if any were selected
      if (projectMemberIds.length > 0) {
        try {
          const memberRes = await apiFetch("/project-members", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: created.id,
              user_ids: projectMemberIds.filter((id) => id !== "__unassigned__"),
            }),
          })
          if (memberRes.ok) {
            // Reload members for the newly created project
            const members = (await memberRes.json()) as UserLookup[]
            setProjectMembers((prev) => ({
              ...prev,
              [created.id]: members,
            }))
          } else {
            console.error("Failed to add project members")
          }
        } catch (error) {
          console.error("Error adding project members:", error)
        }
      }
      
      setProjects((prev) => [created, ...prev])
      setCreateProjectOpen(false)
      setProjectTitle("")
      setProjectMemberIds([])
      setProjectDescription("")
      setProjectType("GENERAL")
      setProjectPhase("MEETINGS")
      setMstTemplateId("__auto__")
      setTotalProducts("")
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
        const noteRes = await apiFetch("/ga-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ department_id: department.id, content: noProjectDescription.trim() || noProjectTitle.trim(), note_type: "GA" }) })
        if (noteRes.ok) {
          const createdNote = (await noteRes.json()) as GaNote
          gaNoteId = createdNote.id
          setGaNotes((prev) => [createdNote, ...prev])
        }
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
          is_personal: noProjectType === "personal",
          ga_note_origin_id: gaNoteId,
          due_date: dueDate,
        }
      const assigneeIds = noProjectAssignee === "__all__" ? departmentUsers.map((u) => u.id) : noProjectAssignee === "__unassigned__" ? [null] : [noProjectAssignee]

      const createdTasks: Task[] = []
      for (const assigneeId of assigneeIds) {
        const res = await apiFetch("/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, assigned_to: assigneeId }) })
        if (res.ok) {
          const created = (await res.json()) as Task
          if (noProjectType === "personal") {
            created.is_personal = true
          }
          createdTasks.push(created)
        }
      }
      if (createdTasks.length) {
        // Only add to noProjectTasks if they meet fast task criteria
        const fastTasks = createdTasks.filter(isFastNormalTask)
        if (fastTasks.length) {
          setNoProjectTasks((prev) => [...fastTasks, ...prev])
        }
        setDepartmentTasks((prev) => [...createdTasks, ...prev])
      }
      setNoProjectOpen(false)
      setNoProjectTitle("")
      setNoProjectDescription("")
      toast.success("Task created")
    } finally {
      setCreatingNoProject(false)
    }
  }

  const deleteNoProjectTask = async (taskId: string) => {
    const task = noProjectTasks.find((t) => t.id === taskId)
    const taskLabel = task?.title || "this task"
    if (!window.confirm(`Delete "${taskLabel}"? This cannot be undone.`)) return

    setDeletingNoProjectTaskId(taskId)
    try {
      const res = await apiFetch(`/tasks/${taskId}`, { method: "DELETE" })
      if (!res.ok) {
        let detail = "Failed to delete task"
        try {
          const data = (await res.json()) as { detail?: string }
          if (typeof data?.detail === "string") detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      setDepartmentTasks((prev) => prev.filter((t) => t.id !== taskId))
      setNoProjectTasks((prev) => prev.filter((t) => t.id !== taskId))
      toast.success("Task deleted")
    } finally {
      setDeletingNoProjectTaskId((prev) => (prev === taskId ? null : prev))
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
      const res = await apiFetch("/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      if (!res.ok) { toast.error("Failed to create meeting"); return }
      const created = (await res.json()) as Meeting
      setMeetings((prev) => [created, ...prev])
      setMeetingTitle("")
      setMeetingPlatform("")
      setMeetingStartsAt("")
      toast.success("Meeting created")
    } finally {
      setCreatingMeeting(false)
    }
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
    const res = await apiFetch(`/meetings/${meetingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    if (!res.ok) { toast.error("Failed to update"); return }
    const updated = (await res.json()) as Meeting
    setMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
    setEditingMeetingId(null)
  }

  const deleteMeeting = async (meetingId: string) => {
    const res = await apiFetch(`/meetings/${meetingId}`, { method: "DELETE" })
    if (res.ok) {
      setMeetings((prev) => prev.filter((m) => m.id !== meetingId))
      toast.success("Meeting deleted")
    }
  }

  const submitGaNote = async () => {
    if (!newGaNote.trim() || !department) return
    setAddingGaNote(true)
    try {
      const priorityValue = newGaNotePriority === "__none__" ? null : newGaNotePriority
      const payload: Record<string, unknown> = {
        content: newGaNote.trim(),
        note_type: newGaNoteType,
        priority: priorityValue,
      }
      if (newGaNoteProjectId === "__none__") payload.department_id = department.id
      else payload.project_id = newGaNoteProjectId

      const res = await apiFetch("/ga-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        toast.error("Failed to add note")
        return
      }
      const created = (await res.json()) as GaNote
      setGaNotes((prev) => [created, ...prev])

      if (gaNoteCreateTask) {
        const taskPayload = {
          title: gaNoteTaskTitle.trim() || gaNoteTaskDefaultTitle(created.content || ""),
          description: gaNoteTaskDescription.trim() || null,
          project_id: newGaNoteProjectId === "__none__" ? null : newGaNoteProjectId,
          department_id: department.id,
          assigned_to: gaNoteTaskAssigneeId === "__unassigned__" ? null : gaNoteTaskAssigneeId,
          status: "TODO",
          priority: gaNoteTaskPriority,
          ga_note_origin_id: created.id,
          due_date: gaNoteTaskDueDate ? new Date(gaNoteTaskDueDate).toISOString() : null,
          finish_period: gaNoteTaskFinishPeriod === FINISH_PERIOD_NONE_VALUE ? null : gaNoteTaskFinishPeriod,
        }
        const taskRes = await apiFetch("/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(taskPayload),
        })
        if (taskRes.ok) {
          const createdTask = (await taskRes.json()) as Task
          setDepartmentTasks((prev) => [createdTask, ...prev])
          // Only add to noProjectTasks if it meets fast task criteria
          if (isFastNormalTask(createdTask)) {
            setNoProjectTasks((prev) => [createdTask, ...prev])
          }
          toast.success("Note and Task created")
        } else {
          toast.success("Note added, but failed to create task")
        }
      } else {
        toast.success("Note added")
      }

      setNewGaNote("")
      setGaNoteCreateTask(false)
      setGaNoteTaskTitle("")
      setGaNoteTaskDescription("")
      setGaNoteTaskPriority("NORMAL")
      setGaNoteTaskDueDate("")
      setGaNoteTaskFinishPeriod(FINISH_PERIOD_NONE_VALUE)
      setGaNoteTaskAssigneeId("__unassigned__")
      setGaNoteOpen(false)
    } finally {
      setAddingGaNote(false)
    }
  }

  const submitGaNoteTask = async () => {
    if (!gaNoteTaskOpenId || !department) return
    const note = gaNotes.find((n) => n.id === gaNoteTaskOpenId)
    if (!note) return

    setCreatingGaNoteTask(true)
    try {
      const dueDateValue = gaNoteTaskDueDate ? new Date(gaNoteTaskDueDate).toISOString() : null
      const taskPayload = {
        title: gaNoteTaskTitle.trim() || gaNoteTaskDefaultTitle(note.content || ""),
        description: gaNoteTaskDescription.trim() || null,
        project_id: note.project_id ?? null,
        department_id: department.id,
        assigned_to: gaNoteTaskAssigneeId === "__unassigned__" ? null : gaNoteTaskAssigneeId,
        status: "TODO",
        priority: gaNoteTaskPriority,
        ga_note_origin_id: note.id,
        due_date: dueDateValue,
        finish_period: gaNoteTaskFinishPeriod === FINISH_PERIOD_NONE_VALUE ? null : gaNoteTaskFinishPeriod,
      }
      const res = await apiFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskPayload),
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
      const createdTask = (await res.json()) as Task
      setDepartmentTasks((prev) => [createdTask, ...prev])
      // Only add to noProjectTasks if it meets fast task criteria
      if (isFastNormalTask(createdTask)) {
        setNoProjectTasks((prev) => [createdTask, ...prev])
      }
      setGaNoteTaskOpenId(null)
      setGaNoteTaskAssigneeId("__unassigned__")
      setGaNoteTaskTitle("")
      setGaNoteTaskDescription("")
      setGaNoteTaskPriority("NORMAL")
      setGaNoteTaskDueDate("")
      setGaNoteTaskFinishPeriod(FINISH_PERIOD_NONE_VALUE)
      toast.success("Task created")
    } finally {
      setCreatingGaNoteTask(false)
    }
  }

  const closeGaNote = async (noteId: string) => {
    const res = await apiFetch(`/ga-notes/${noteId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CLOSED" }) })
    if (res.ok) {
      const updated = (await res.json()) as GaNote
      setGaNotes((prev) => prev.map((note) => (note.id === updated.id ? updated : note)))
    }
  }

  if (loading) return <div className="flex h-screen items-center justify-center text-sm text-slate-500 animate-pulse">Loading department...</div>
  if (!department) return <div className="p-8 text-center text-sm text-muted-foreground">Department not found.</div>

  // --- RENDER ---
  return (
    <div className="min-h-screen ">
      <div className="relative rounded-3xl bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 p-6 print:hidden dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/30">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
          <div className="absolute -top-24 right-0 h-56 w-56 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-900/30" />
          <div className="absolute -bottom-24 left-0 h-56 w-56 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-900/30" />
        </div>

        <div className="relative space-y-6">
<div className="sticky top-0 z-40 rounded-3xl bg-gradient-to-br from-slate-50 via-white to-emerald-50 pb-4 px-4 pt-4 -mt-4 -mx-4 print:static">       <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Department</div>
                  <div className="text-3xl font-semibold tracking-tight">{departmentName}</div>
                  <div className="text-sm text-muted-foreground">Manage projects and daily tasks.</div>
                </div>
                <div className="inline-flex rounded-full bg-card/70 p-1 backdrop-blur">
                  <button
                    type="button"
                    onClick={() => setViewMode("department")}
                    className={[
                      "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                      viewMode === "department"
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
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
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    My View
                  </button>
                </div>
              </div>

              <div className="rounded-2xl bg-card/70 p-1 backdrop-blur">
                <div className="flex flex-wrap gap-2">
                  {TABS.map((tab) => {
                    const isActive = tab.id === activeTab
                    const badgeTone =
                      tab.tone === "blue"
                        ? "bg-blue-50 text-blue-600"
                        : tab.tone === "red"
                          ? "bg-red-50 text-red-600"
                          : "bg-muted text-foreground"
                    const badgeClass = isActive ? "bg-background text-foreground" : badgeTone
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={[
                          "relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-foreground text-background shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-background/70",
                        ].join(" ")}
                      >
                        <span className="uppercase tracking-wide">{tab.label}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${badgeClass}`}>{counts[tab.id]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-[600px] animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* PROJECTS */}
            {activeTab === "projects" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-medium tracking-tight text-slate-900 dark:text-white">Active Projects</h2>
                  {canManage && (
                    <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
                      <DialogTrigger asChild><Button className="rounded-xl bg-slate-900 text-white hover:bg-slate-800">+ New Project</Button></DialogTrigger>
                      <DialogContent className="sm:max-w-xl rounded-2xl">
                        <DialogHeader><DialogTitle>Create Project</DialogTitle></DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="space-y-2"><Label>Title</Label><Input className="rounded-xl" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} /></div>
                          <div className="space-y-2"><Label>Description</Label><Textarea className="rounded-xl" value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} /></div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Members</Label>
                              <Dialog open={selectMembersOpen} onOpenChange={setSelectMembersOpen}>
                                <DialogTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start rounded-xl"
                                  >
                                    {projectMemberIds.length === 0
                                      ? "Select members..."
                                      : `${projectMemberIds.length} member${projectMemberIds.length === 1 ? "" : "s"} selected`}
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-md">
                                  <DialogHeader>
                                    <DialogTitle>Select Project Members</DialogTitle>
                                  </DialogHeader>
                                  <div className="mt-4 max-h-[400px] overflow-y-auto space-y-2">
                                    {departmentUsers.map((u) => {
                                      const isSelected = projectMemberIds.includes(u.id)
                                      return (
                                        <div
                                          key={u.id}
                                          className="flex items-center space-x-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                                          onClick={() => {
                                            if (isSelected) {
                                              setProjectMemberIds((prev) => prev.filter((id) => id !== u.id))
                                            } else {
                                              setProjectMemberIds((prev) => [...prev, u.id])
                                            }
                                          }}
                                        >
                                          <Checkbox checked={isSelected} />
                                          <Label className="cursor-pointer flex-1">
                                            {u.full_name || u.username || "-"}
                                          </Label>
                                        </div>
                                      )
                                    })}
                                  </div>
                                  <div className="mt-4 flex justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      onClick={() => {
                                        setProjectMemberIds([])
                                        setSelectMembersOpen(false)
                                      }}
                                    >
                                      Clear
                                    </Button>
                                    <Button onClick={() => setSelectMembersOpen(false)}>
                                      Done
                                    </Button>
                                  </div>
                                </DialogContent>
                              </Dialog>
                              {projectMemberIds.length > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  {projectMemberIds.length} member{projectMemberIds.length === 1 ? "" : "s"} selected
                                </div>
                              )}
                            </div>
                            <div className="space-y-2">
                              <Label>Project Type</Label>
                              <Select
                                value={projectType}
                                onValueChange={(value) => {
                                  setProjectType(value as (typeof PROJECT_TYPES)[number]["id"])
                                  setProjectPhase(value === "MST" ? "PLANNING" : "MEETINGS")
                                  if (value !== "MST") {
                                    setMstTemplateId("__auto__")
                                  }
                                }}
                              >
                                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {PROJECT_TYPES.map((type) => (
                                    <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          {projectType === "MST" && (
                            <>
                              <div className="space-y-2">
                                <Label>MST Template</Label>
                                <Select value={mstTemplateId} onValueChange={setMstTemplateId}>
                                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__auto__">Auto (first MST template)</SelectItem>
                                    {mstTemplateOptions.map((project) => (
                                      <SelectItem key={project.id} value={project.id}>
                                        {project.title || project.name || "MST Template"}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {!mstTemplateOptions.length && (
                                  <div className="text-xs text-muted-foreground">No MST templates found.</div>
                                )}
                              </div>
                              <div className="space-y-2">
                                <Label>Total Products</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="Enter number of products"
                                  className="rounded-xl"
                                  value={totalProducts}
                                  onChange={(e) => setTotalProducts(e.target.value)}
                                />
                              </div>
                            </>
                          )}
                          <div className="space-y-2">
                            <Label>Phase</Label>
                            <Select value={projectPhase} onValueChange={setProjectPhase}>
                              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {projectPhaseOptions.map((p) => (
                                  <SelectItem key={p} value={p}>{PHASE_LABELS[p]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCreateProjectOpen(false)}>Cancel</Button><Button className="rounded-xl" onClick={() => void submitProject()}>Create</Button></div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-2">
                  {filteredProjects.map((project) => {
                    // Derived Data Calculation
                    const tasks = departmentTasks.filter(t => t.project_id === project.id);
                    const phase = project.current_phase || "MEETINGS";
                    const noteCount = gaNotes.filter(n => n.project_id === project.id).length;

                    // Get members from project-members API first, then add manager and task assignees
                    const apiMembers = projectMembers[project.id] || [];
                    const memberIds = new Set<string>();
                    // Add API members
                    apiMembers.forEach(m => memberIds.add(m.id));
                    // Add manager
                    if (project.manager_id) memberIds.add(project.manager_id);
                    // Add task assignees
                    tasks.forEach(t => { if (t.assigned_to) memberIds.add(t.assigned_to); });
                    const members = Array.from(memberIds).map(id => userMap.get(id as string)).filter(Boolean);

                    return (
                      <div key={project.id} className="group flex flex-col gap-6 justify-between overflow-hidden rounded-3xl border-0 bg-white/60 p-6 shadow-sm ring-1 ring-slate-900/5 transition-all hover:-translate-y-1 hover:shadow-lg dark:bg-slate-900/60 dark:ring-white/10">
                        <div className="space-y-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{formatProjectTitleWithProducts(project)}</h3>
                              {/* Single Phase Badge */}
                              <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                                {PHASE_LABELS[phase]}
                              </Badge>
                            </div>
                            <div className="text-right">
                              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Tasks</div>
                              <div className="text-xl font-light text-slate-900 dark:text-white">{tasks.length}</div>
                            </div>
                          </div>

                          {/* Description */}
                          <p className="text-sm leading-relaxed text-slate-500 line-clamp-2 dark:text-slate-400">{project.description || "No description provided."}</p>

                          {/* Taskbar: Horizontal list of tasks */}
                          <div className="space-y-2">
                            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Task Summary</div>
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                              {tasks.length > 0 ? tasks.slice(0, 5).map(t => (
                                <div key={t.id} className="flex-shrink-0 max-w-[150px] truncate rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  {t.title}
                                </div>
                              )) : <div className="text-xs text-slate-400 italic">No active tasks</div>}
                              {tasks.length > 5 && <div className="flex-shrink-0 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-500">+{tasks.length - 5} more</div>}
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                          <div className="flex items-center gap-4">
                            {/* Members Stack */}
                            <div className="flex -space-x-2">
                              {members.length > 0 ? members.slice(0, 4).map(m => (
                                <div
                                  key={m?.id}
                                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-bold text-slate-600 dark:border-slate-900 dark:bg-slate-700 dark:text-slate-300"
                                  title={m?.full_name || m?.username || "Unknown"}
                                >
                                  {initials(m?.full_name || "?")}
                                </div>
                              )) : <div className="text-xs text-slate-400">No members</div>}
                              {members.length > 4 && <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[10px] text-slate-500 dark:border-slate-900 dark:bg-slate-800">+{members.length - 4}</div>}
                            </div>

                            {/* GA Notes Count */}
                            {noteCount > 0 && (
                              <div className="flex items-center gap-1 text-xs text-slate-500">
                                <span className="font-bold text-slate-700 dark:text-slate-300">{noteCount}</span> GA Notes
                              </div>
                            )}
                          </div>

                          <Link href={`/projects/design/${project.id}`} className="flex items-center gap-1 text-sm font-semibold text-slate-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400">
                            View <span aria-hidden="true">&rarr;</span>
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* OVERVIEW */}
            {activeTab === "all" && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-2xl font-bold tracking-tight text-slate-800">
                      {viewMode === "department" ? "All (Today) - Department" : "All (Today)"}
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      {viewMode === "department"
                        ? "All of today's tasks for the department team."
                        : "All of today's tasks, organized in one place."}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm">
                      {formatToday()}
                    </div>
                    {viewMode === "department" && departmentUsers.length ? (
                      <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                        <SelectTrigger className="h-9 w-48 border-slate-200 focus:border-slate-400 rounded-xl">
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
                    {viewMode === "mine" ? (
                      <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-sm">
                        <span className="text-[11px] font-semibold uppercase text-slate-500">Print range</span>
                        <Select value={printRange} onValueChange={(value) => setPrintRange(value as "today" | "week")}>
                          <SelectTrigger className="h-8 w-28 border-0 shadow-none focus:border-transparent focus:ring-0">
                            <SelectValue placeholder="This Week" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="week">This Week</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          className="h-8 rounded-lg px-3 text-sm text-slate-700 hover:bg-slate-100"
                          onClick={() => window.print()}
                        >
                          Print
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  {[
                    { label: "PROJECT TASKS", value: todayProjectTasks.length },
                    { label: "NO PROJECT", value: todayNoProjectTasks.length },
                    { label: "NOTES (OPEN)", value: todayOpenNotes.length },
                    { label: "SYSTEM", value: todaySystemTasks.length },
                  ].map((stat) => (
                    <Card key={stat.label} className="bg-white border border-slate-200 shadow-sm rounded-2xl p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stat.label}</div>
                      <div className="mt-2 text-3xl font-bold text-slate-900">{stat.value}</div>
                    </Card>
                  ))}
                </div>
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row">
                    <div className="relative w-full rounded-xl bg-white border border-slate-200 border-l-4 border-sky-500 p-4 text-slate-700 md:w-48 md:shrink-0">
                      <div className="text-sm font-semibold">PROJECT TASKS</div>
                      <span className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {todayProjectTasks.length}
                      </span>
                      <div className="mt-2 text-xs text-slate-500">Due today</div>
                    </div>
                    <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 flex flex-col">
                      {todayProjectTaskGroups.length ? (
                        <div className="space-y-3">
                          {todayProjectTaskGroups.map((group) => (
                            <div key={group.id}>
                              <div className="text-xs font-semibold text-slate-700">{group.name}</div>
                              <div className="mt-2 space-y-2">
                                {group.tasks.map((task) => {
                                  const assignee = task.assigned_to ? userMap.get(task.assigned_to) : null
                                  const phaseLabel = PHASE_LABELS[task.phase || "MEETINGS"] || task.phase || "MEETINGS"
                                  return (
                                    <Link
                                      key={task.id}
                                      href={`/tasks/${task.id}`}
                                      className="block rounded-lg border border-slate-200 border-l-4 border-sky-500 bg-white px-3 py-2 text-sm transition hover:bg-slate-50"
                                    >
                                      <div className="flex items-center gap-2">
                                        <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs">
                                          {task.status || "TODO"}
                                        </Badge>
                                        <Badge className="bg-sky-500 text-white border-0 text-xs shadow-sm">
                                          {phaseLabel}
                                        </Badge>
                                        <div className="font-medium text-slate-800">{task.title}</div>
                                      </div>
                                      <div className="mt-1 text-xs text-slate-600">
                                        {assignee?.full_name || assignee?.username || "Unassigned"}
                                      </div>
                                    </Link>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500">No project tasks today.</div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row">
                    <div className="relative w-full rounded-xl bg-white border border-slate-200 border-l-4 border-blue-500 p-4 text-slate-700 md:w-48 md:shrink-0">
                      <div className="text-sm font-semibold">NO PROJECT</div>
                      <span className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {todayNoProjectTasks.length}
                      </span>
                      <div className="mt-2 text-xs text-slate-500">Ad-hoc tasks</div>
                    </div>
                    <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 flex flex-col">
                      {todayNoProjectTasks.length ? (
                        <div className="space-y-2">
                          {todayNoProjectTasks.map((task) => {
                            const assignee = task.assigned_to ? userMap.get(task.assigned_to) : null
                            const phaseLabel = PHASE_LABELS[task.phase || "MEETINGS"] || task.phase || "MEETINGS"
                            const typeLabel = noProjectTypeLabel(task)
                            return (
                              <Link
                                key={task.id}
                                href={`/tasks/${task.id}`}
                                className="block rounded-lg border border-slate-200 border-l-4 border-blue-500 bg-white px-3 py-2 text-sm transition hover:bg-slate-50"
                              >
                                <div className="flex items-center gap-2">
                                  <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs">
                                    {typeLabel}
                                  </Badge>
                                  <Badge className="bg-blue-500 text-white border-0 text-xs shadow-sm">
                                    {phaseLabel}
                                  </Badge>
                                  <div className="font-medium text-slate-800">{task.title}</div>
                                </div>
                                <div className="mt-1 text-xs text-slate-600">
                                  {assignee?.full_name || assignee?.username || "Unassigned"}
                                </div>
                              </Link>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500">No tasks today.</div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row">
                    <div className="relative w-full rounded-xl bg-white border border-slate-200 border-l-4 border-sky-500 p-4 text-slate-700 md:w-48 md:shrink-0">
                      <div className="text-sm font-semibold">NOTES (OPEN)</div>
                      <span className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {todayOpenNotes.length}
                      </span>
                      <div className="mt-2 text-xs text-slate-500">Quick notes</div>
                    </div>
                    <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 flex flex-col">
                      {todayOpenNotes.length ? (
                        <div className="space-y-2">
                          {todayOpenNotes.map((note) => (
                            <div
                              key={note.id}
                              className="rounded-lg border border-slate-200 border-l-4 border-sky-500 bg-white px-3 py-2 text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {note.note_type || "GA"}
                                </Badge>
                                <div className="font-medium">{note.content}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">No open notes today.</div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row">
                    <div className="relative w-full rounded-xl bg-white border border-slate-200 border-l-4 border-blue-500 p-4 text-slate-700 md:w-48 md:shrink-0">
                      <div className="text-sm font-semibold">SYSTEM</div>
                      <span className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {todaySystemTasks.length}
                      </span>
                      <div className="mt-2 text-xs text-slate-500">Scheduled</div>
                    </div>
                    <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 flex flex-col">
                      {todaySystemTasks.length ? (
                        <div className="space-y-2">
                          {todaySystemTasks.map((task) => (
                            <div
                              key={task.id}
                              className="rounded-lg border border-slate-200 border-l-4 border-blue-500 bg-white px-3 py-2 text-sm"
                            >
                              <div className="font-medium text-slate-800">{task.title}</div>
                              <div className="mt-1 text-xs text-slate-600">{task.description || "-"}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500">No system tasks today.</div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row">
                    <div className="relative w-full rounded-xl bg-white border border-slate-200 border-l-4 border-slate-500 p-4 text-slate-700 md:w-48 md:shrink-0">
                      <div className="text-sm font-semibold">MEETINGS</div>
                      <span className="absolute right-3 top-3 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {todayMeetings.length}
                      </span>
                      <div className="mt-2 text-xs text-slate-500">Today</div>
                    </div>
                    <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 flex flex-col">
                      {todayMeetings.length ? (
                        <div className="space-y-2">
                          {todayMeetings.map((meeting) => (
                            <div
                              key={meeting.id}
                              className="rounded-lg border border-slate-200 border-l-4 border-slate-500 bg-white px-3 py-2 text-sm"
                            >
                              <div className="font-medium">{formatMeetingLabel(meeting)}</div>
                              {meeting.project_id ? (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {projects.find((p) => p.id === meeting.project_id)?.title || "Project"}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">No meetings today.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "system" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-medium tracking-tight text-slate-900 dark:text-white">System Routine</h2>
                  {canManage && (<Dialog open={createSystemOpen} onOpenChange={setCreateSystemOpen}><DialogTrigger asChild><Button className="rounded-xl bg-slate-900 text-white">Add Routine Task</Button></DialogTrigger><DialogContent className="rounded-2xl sm:max-w-xl"><DialogHeader><DialogTitle>New Routine</DialogTitle></DialogHeader><div className="grid gap-4 py-4"><div className="space-y-2"><Label>Title</Label><Input className="rounded-xl" value={systemTitle} onChange={(e) => setSystemTitle(e.target.value)} /></div><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Owner</Label><Select value={systemOwnerId} onValueChange={setSystemOwnerId}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__unassigned__">Unassigned</SelectItem>{departmentUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Frequency</Label><Select value={systemFrequency} onValueChange={(v: any) => setSystemFrequency(v)}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(FREQUENCY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div></div><div className="space-y-2"><Label>Description</Label><Textarea className="rounded-xl" value={systemDescription} onChange={(e) => setSystemDescription(e.target.value)} /></div></div><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCreateSystemOpen(false)}>Cancel</Button><Button className="rounded-xl" onClick={() => void submitSystemTask()}>Save</Button></div></DialogContent></Dialog>)}
                </div>
                <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
                  <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                    {[{ l: "Today", o: 0 }, { l: "Yesterday", o: -1 }, { l: "Tomorrow", o: 1 }].map(d => {
                      const target = new Date(); target.setDate(target.getDate() + d.o);
                      const active = target.toDateString() === systemDate.toDateString();
                      return <button key={d.l} onClick={() => setSystemDate(target)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${active ? "bg-white shadow-sm text-slate-900 dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-900"}`}>{d.l}</button>
                    })}
                  </div>
                  <div className="h-6 w-px bg-slate-200 dark:bg-slate-700"></div>
                  <Input type="date" className="h-9 w-auto border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0" value={formatDateInput(systemDate)} onChange={(e) => setSystemDate(new Date(e.target.value))} />
                  <div className="ml-auto flex items-center gap-2"><Label className="text-xs text-slate-500">Show All</Label><Checkbox checked={showAllSystem} onCheckedChange={(v) => setShowAllSystem(!!v)} /></div>
                </div>
                <div className="space-y-8">
                  {systemGroups.map(group => (
                    <div key={group.label} className="space-y-4">
                      <div className="flex items-center gap-3">
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-400">{group.label}</span>
                        <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800"></div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {group.items.map(item => {
                          const statusValue = item.status || "TODO"
                          const isClosed = statusValue === "DONE"
                          const owner = users.find(u => u.id === item.default_assignee_id)
                          const isAssigned =
                            Boolean(user?.id) &&
                            (item.default_assignee_id === user?.id ||
                              item.assignees?.some((assignee) => assignee.id === user?.id))
                          return (
                            <div key={item.id} className="flex flex-col justify-between rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 transition hover:ring-emerald-200 dark:bg-slate-900 dark:ring-slate-800">
                              <div className="space-y-2">
                                <div className="flex items-start justify-between">
                                  <div className="space-y-1">
                                    <h4 className="font-medium text-slate-900 dark:text-white">{item.title}</h4>
                                    <Badge variant="secondary" className="h-5 text-[10px] uppercase">{statusValue}</Badge>
                                  </div>
                                  <div className={`mt-1 h-2 w-2 rounded-full ${item.is_active ? "bg-emerald-400" : "bg-slate-300"}`}></div>
                                </div>
                                <p className="text-xs text-slate-500 line-clamp-2">{item.description || "No description."}</p>
                              </div>
                              <div className="mt-4 flex items-center justify-between border-t border-slate-50 pt-3 dark:border-slate-800">
                                <div className="flex items-center gap-2">
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 dark:bg-slate-800">
                                    {initials(owner?.full_name || "?")}
                                  </div>
                                  <span className="text-xs text-slate-400">{owner?.full_name || "Unassigned"}</span>
                                </div>
                                {viewMode === "mine" ? (
                                  isClosed ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                      <span className="text-[12px]">✓</span>
                                      Done
                                    </span>
                                  ) : isAssigned ? (
                                    <button
                                      type="button"
                                      disabled={systemStatusUpdatingId === item.id}
                                      className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-transparent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
                                      onClick={() => void updateSystemTaskStatus(item.id, "DONE")}
                                    >
                                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-emerald-400 bg-white text-[9px] leading-none text-emerald-600">
                                        ✓
                                      </span>
                                      Mark Done
                                    </button>
                                  ) : null
                                ) : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* BUCKETS */}
            {activeTab === "no-project" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div><h2 className="text-xl font-medium tracking-tight text-slate-900 dark:text-white">Task Buckets</h2><p className="text-sm text-slate-500">Non-project specific workflows.</p></div>
                  {!isReadOnly && (<Dialog open={noProjectOpen} onOpenChange={setNoProjectOpen}><DialogTrigger asChild><Button className="rounded-xl bg-slate-900 text-white">Create Task</Button></DialogTrigger><DialogContent className="rounded-2xl sm:max-w-xl"><DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader><div className="grid gap-4 py-4"><div className="space-y-2"><Label>Category</Label><Select value={noProjectType} onValueChange={(v: any) => setNoProjectType(v)}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{NO_PROJECT_TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Title</Label><Input className="rounded-xl" value={noProjectTitle} onChange={(e) => setNoProjectTitle(e.target.value)} /></div><div className="space-y-2"><Label>Description</Label><Textarea className="rounded-xl" value={noProjectDescription} onChange={(e) => setNoProjectDescription(e.target.value)} /></div><div className="grid grid-cols-3 gap-4"><div className="space-y-2"><Label>Assignee</Label><Select value={noProjectAssignee} onValueChange={setNoProjectAssignee}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__unassigned__">Unassigned</SelectItem><SelectItem value="__all__">Everyone</SelectItem>{departmentUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Finish by</Label><Select value={noProjectFinishPeriod} onValueChange={(value) => setNoProjectFinishPeriod(value as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={FINISH_PERIOD_NONE_VALUE}>{FINISH_PERIOD_NONE_LABEL}</SelectItem>{FINISH_PERIOD_OPTIONS.map(value => (<SelectItem key={value} value={value}>{value}</SelectItem>))}</SelectContent></Select></div><div className="space-y-2"><Label>Due Date</Label><Input className="rounded-xl" type="date" value={noProjectDueDate} onChange={(e) => setNoProjectDueDate(normalizeDueDateInput(e.target.value))} /></div></div></div><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setNoProjectOpen(false)}>Cancel</Button><Button className="rounded-xl" onClick={() => void submitNoProjectTask()}>Create</Button></div></DialogContent></Dialog>)}
                </div>
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-3xl border border-slate-200 bg-white/50 p-4 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/50">
                    <div className="mb-4 flex items-center justify-between px-1">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">General</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">{noProjectBuckets.normal.length}</span>
                    </div>
                    <div className="space-y-2">
                      {noProjectBuckets.normal.map(t => (
                        <Link key={t.id} href={`/tasks/${t.id}?returnTo=${encodeURIComponent(returnToTasks)}`} className="relative block rounded-xl border border-white bg-white/80 p-3 pr-8 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
                          {canDeleteNoProject ? (
                            <Button
                              variant="outline"
                              size="icon"
                              disabled={deletingNoProjectTaskId === t.id}
                              className="absolute right-2 top-2 h-6 w-6 border-slate-200 text-slate-500 hover:border-red-200 hover:text-red-600"
                              title="Delete"
                              aria-label={`Delete ${t.title}`}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                void deleteNoProjectTask(t.id)
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          <div className="text-sm font-medium text-slate-900 dark:text-white">{t.title}</div>
                          {t.assigned_to ? (
                            <div className="mt-2 text-xs text-slate-400">For: {assigneeLabel(userMap.get(t.assigned_to))}</div>
                          ) : null}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-purple-100 bg-purple-50/40 p-4 backdrop-blur-sm dark:border-purple-900/30 dark:bg-purple-900/10">
                    <div className="mb-4 flex items-center justify-between px-1">
                      <span className="text-sm font-semibold text-purple-700 dark:text-purple-400">Personal</span>
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-600 dark:bg-purple-900 dark:text-purple-300">{noProjectBuckets.personal.length}</span>
                    </div>
                    <div className="space-y-2">
                      {noProjectBuckets.personal.map(t => (
                        <Link key={t.id} href={`/tasks/${t.id}?returnTo=${encodeURIComponent(returnToTasks)}`} className="relative block rounded-xl border border-purple-100 bg-white/80 p-3 pr-8 shadow-sm transition hover:shadow-md dark:border-purple-900 dark:bg-purple-950">
                          {canDeleteNoProject ? (
                            <Button
                              variant="outline"
                              size="icon"
                              disabled={deletingNoProjectTaskId === t.id}
                              className="absolute right-2 top-2 h-6 w-6 border-slate-200 text-slate-500 hover:border-red-200 hover:text-red-600"
                              title="Delete"
                              aria-label={`Delete ${t.title}`}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                void deleteNoProjectTask(t.id)
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          <div className="text-sm font-medium text-purple-900 dark:text-purple-100">{t.title}</div>
                          {t.assigned_to ? (
                            <div className="mt-2 text-xs text-purple-500">For: {assigneeLabel(userMap.get(t.assigned_to))}</div>
                          ) : null}
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-rose-100 bg-rose-50/40 p-4 backdrop-blur-sm dark:border-rose-900/30 dark:bg-rose-900/10">
                    <div className="mb-4 flex items-center justify-between px-1">
                      <span className="text-sm font-semibold text-rose-700 dark:text-rose-400">BLLOK</span>
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-600 dark:bg-rose-900 dark:text-rose-300">{noProjectBuckets.blocked.length}</span>
                    </div>
                    <div className="space-y-2">
                      {noProjectBuckets.blocked.map(t => (
                        <Link key={t.id} href={`/tasks/${t.id}?returnTo=${encodeURIComponent(returnToTasks)}`} className="relative block rounded-xl border border-rose-100 bg-white/80 p-3 pr-8 shadow-sm transition hover:shadow-md dark:border-rose-900 dark:bg-rose-950">
                          {canDeleteNoProject ? (
                            <Button
                              variant="outline"
                              size="icon"
                              disabled={deletingNoProjectTaskId === t.id}
                              className="absolute right-2 top-2 h-6 w-6 border-slate-200 text-slate-500 hover:border-red-200 hover:text-red-600"
                              title="Delete"
                              aria-label={`Delete ${t.title}`}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                void deleteNoProjectTask(t.id)
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          <div className="text-sm font-medium text-rose-900 dark:text-rose-100">{t.title}</div>
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-sky-100 bg-sky-50/40 p-4 backdrop-blur-sm dark:border-sky-900/30 dark:bg-sky-900/10">
                    <div className="mb-4 flex items-center justify-between px-1">
                      <span className="text-sm font-semibold text-sky-700 dark:text-sky-400">GA Tasks</span>
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-600 dark:bg-sky-900 dark:text-sky-300">{noProjectBuckets.ga.length}</span>
                    </div>
                    <div className="space-y-2">
                      {noProjectBuckets.ga.map(t => (
                        <Link key={t.id} href={`/tasks/${t.id}?returnTo=${encodeURIComponent(returnToTasks)}`} className="relative block rounded-xl border border-sky-100 bg-white/80 p-3 pr-8 shadow-sm transition hover:shadow-md dark:border-sky-900 dark:bg-sky-950">
                          {canDeleteNoProject ? (
                            <Button
                              variant="outline"
                              size="icon"
                              disabled={deletingNoProjectTaskId === t.id}
                              className="absolute right-2 top-2 h-6 w-6 border-slate-200 text-slate-500 hover:border-red-200 hover:text-red-600"
                              title="Delete"
                              aria-label={`Delete ${t.title}`}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                void deleteNoProjectTask(t.id)
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          <div className="text-sm font-medium text-sky-900 dark:text-sky-100">{t.title}</div>
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-amber-100 bg-amber-50/40 p-4 backdrop-blur-sm dark:border-amber-900/30 dark:bg-amber-900/10">
                    <div className="mb-4 flex items-center justify-between px-1">
                      <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">R1 / 1H</span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-600 dark:bg-amber-900 dark:text-amber-300">{noProjectBuckets.r1.length + noProjectBuckets.oneHour.length}</span>
                    </div>
                    <div className="space-y-2">
                      {[...noProjectBuckets.r1, ...noProjectBuckets.oneHour].map(t => (
                        <Link key={t.id} href={`/tasks/${t.id}?returnTo=${encodeURIComponent(returnToTasks)}`} className="relative block rounded-xl border border-amber-100 bg-white/80 p-3 pr-8 shadow-sm transition hover:shadow-md dark:border-amber-900 dark:bg-amber-950">
                          {canDeleteNoProject ? (
                            <Button
                              variant="outline"
                              size="icon"
                              disabled={deletingNoProjectTaskId === t.id}
                              className="absolute right-2 top-2 h-6 w-6 border-slate-200 text-slate-500 hover:border-red-200 hover:text-red-600"
                              title="Delete"
                              aria-label={`Delete ${t.title}`}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                void deleteNoProjectTask(t.id)
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="h-4 text-[9px] px-1 border-amber-300 text-amber-700">{t.is_r1 ? "R1" : "1H"}</Badge>
                          </div>
                          <div className="text-sm font-medium text-amber-900 dark:text-amber-100">{t.title}</div>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* NOTES */}
            {activeTab === "ga-ka" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div><h2 className="text-xl font-medium tracking-tight text-slate-900 dark:text-white">GA / KA Notes</h2><p className="text-sm text-slate-500">General Admin & Key Accounts.</p></div>
                  {!isReadOnly && (
                    <Dialog open={gaNoteOpen} onOpenChange={setGaNoteOpen}>
                      <DialogTrigger asChild>
                        <Button className="rounded-xl bg-slate-900 text-white">Add Note</Button>
                      </DialogTrigger>
                      <DialogContent className="rounded-2xl sm:max-w-xl">
                        <DialogHeader>
                          <DialogTitle>New Note</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="space-y-2">
                            <Label>Related Project</Label>
                            <Select value={newGaNoteProjectId} onValueChange={setNewGaNoteProjectId}>
                              <SelectTrigger className="rounded-xl">
                                <SelectValue placeholder="None (General)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {projects.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Type</Label>
                              <Select value={newGaNoteType} onValueChange={(v: any) => setNewGaNoteType(v)}>
                                <SelectTrigger className="rounded-xl">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="GA">GA</SelectItem>
                                  <SelectItem value="KA">KA</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Priority</Label>
                              <Select value={newGaNotePriority} onValueChange={(v: any) => setNewGaNotePriority(v)}>
                                <SelectTrigger className="rounded-xl">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">None</SelectItem>
                                  <SelectItem value="NORMAL">Normal</SelectItem>
                                  <SelectItem value="HIGH">High</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Content</Label>
                            <Textarea
                              className="rounded-xl"
                              value={newGaNote}
                              onChange={(e) => setNewGaNote(e.target.value)}
                              rows={4}
                            />
                          </div>

                          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                            <Checkbox
                              id="create-task"
                              checked={gaNoteCreateTask}
                              onCheckedChange={(v) => setGaNoteCreateTask(!!v)}
                            />
                            <Label
                              htmlFor="create-task"
                              className="text-sm font-medium text-slate-700 cursor-pointer select-none"
                            >
                              Create task from this note
                            </Label>
                          </div>

                          {gaNoteCreateTask && (
                            <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2">
                              <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                  <Label>Assignee</Label>
                                  <Select value={gaNoteTaskAssigneeId} onValueChange={setGaNoteTaskAssigneeId}>
                                    <SelectTrigger className="rounded-xl">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__unassigned__">Unassigned</SelectItem>
                                      {departmentUsers.map((u) => (
                                        <SelectItem key={u.id} value={u.id}>
                                          {u.full_name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Finish By</Label>
                                  <Select
                                    value={gaNoteTaskFinishPeriod}
                                    onValueChange={(v) =>
                                      setGaNoteTaskFinishPeriod(v as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)
                                    }
                                  >
                                    <SelectTrigger className="rounded-xl">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={FINISH_PERIOD_NONE_VALUE}>{FINISH_PERIOD_NONE_LABEL}</SelectItem>
                                      {FINISH_PERIOD_OPTIONS.map((o) => (
                                        <SelectItem key={o} value={o}>
                                          {o}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label>Due Date</Label>
                                <Input
                                  type="date"
                                  className="rounded-xl"
                                  value={gaNoteTaskDueDate}
                                  onChange={(e) => setGaNoteTaskDueDate(normalizeDueDateInput(e.target.value))}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" onClick={() => setGaNoteOpen(false)}>
                            Cancel
                          </Button>
                          <Button className="rounded-xl" onClick={() => void submitGaNote()} disabled={addingGaNote}>
                            {addingGaNote ? "Saving..." : "Save"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                  <Dialog open={Boolean(gaNoteTaskOpenId)} onOpenChange={(v) => !v && setGaNoteTaskOpenId(null)}>
                    <DialogContent className="rounded-2xl sm:max-w-xl">
                      <DialogHeader>
                        <DialogTitle>Create Task from Note</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                          <Label>Task Title</Label>
                          <Input
                            className="rounded-xl"
                            value={gaNoteTaskTitle}
                            onChange={(e) => setGaNoteTaskTitle(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Textarea
                            className="rounded-xl"
                            value={gaNoteTaskDescription}
                            onChange={(e) => setGaNoteTaskDescription(e.target.value)}
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Assignee</Label>
                            <Select value={gaNoteTaskAssigneeId} onValueChange={setGaNoteTaskAssigneeId}>
                              <SelectTrigger className="rounded-xl">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__unassigned__">Unassigned</SelectItem>
                                {departmentUsers.map((u) => (
                                  <SelectItem key={u.id} value={u.id}>
                                    {u.full_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Priority</Label>
                            <Select
                              value={gaNoteTaskPriority}
                              onValueChange={(v) => setGaNoteTaskPriority(v as TaskPriority)}
                            >
                              <SelectTrigger className="rounded-xl">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PRIORITY_OPTIONS.map((p) => (
                                  <SelectItem key={p} value={p}>
                                    {PRIORITY_LABELS[p]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Finish By</Label>
                            <Select
                              value={gaNoteTaskFinishPeriod}
                              onValueChange={(v) =>
                                setGaNoteTaskFinishPeriod(v as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)
                              }
                            >
                              <SelectTrigger className="rounded-xl">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={FINISH_PERIOD_NONE_VALUE}>{FINISH_PERIOD_NONE_LABEL}</SelectItem>
                                {FINISH_PERIOD_OPTIONS.map((o) => (
                                  <SelectItem key={o} value={o}>
                                    {o}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Due Date</Label>
                            <Input
                              type="date"
                              className="rounded-xl"
                              value={gaNoteTaskDueDate}
                              onChange={(e) => setGaNoteTaskDueDate(normalizeDueDateInput(e.target.value))}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setGaNoteTaskOpenId(null)}>
                          Cancel
                        </Button>
                        <Button
                          className="rounded-xl"
                          onClick={() => void submitGaNoteTask()}
                          disabled={creatingGaNoteTask}
                        >
                          {creatingGaNoteTask ? "Creating..." : "Create Task"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {visibleGaNotes.length ? visibleGaNotes.map(note => {
                    const author = users.find(u => u.id === note.created_by)
                    const project = note.project_id ? projects.find(p => p.id === note.project_id) : null
                    return (
                      <Card key={note.id} className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border-0 bg-white/60 p-5 shadow-sm ring-1 ring-slate-900/5 transition hover:shadow-md dark:bg-slate-900/60 dark:ring-white/10">
                        <div className="absolute top-0 right-0 h-16 w-16 -translate-y-6 translate-x-6 rounded-full bg-slate-50 dark:bg-slate-800"></div>
                        <div className="relative z-10">
                          <div className="flex items-center justify-between mb-3"><span className={`rounded-md px-2 py-1 text-[10px] font-bold ${note.note_type === "KA" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>{note.note_type}</span><span className="text-[10px] text-slate-400">{new Date(note.created_at).toLocaleDateString()}</span></div>
                          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{note.content}</p>
                        </div>
                        <div className="relative z-10 mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-600 dark:bg-slate-800">
                              {initials(author?.full_name || "?")}
                            </div>
                            <span className="text-[10px] text-slate-400">{project ? formatProjectTitleWithProducts(project) : "General"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {gaNoteTaskMap.has(note.id) ? (
                              <Link href={`/tasks/${gaNoteTaskMap.get(note.id)!.id}`}>
                                <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[10px]">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                  View Task
                                </Button>
                              </Link>
                            ) : !isReadOnly && note.status !== "CLOSED" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 gap-1 px-2 text-[10px]"
                                onClick={() => {
                                  setGaNoteTaskOpenId(note.id)
                                  setGaNoteTaskTitle(gaNoteTaskDefaultTitle(note.content || ""))
                                  setGaNoteTaskAssigneeId("__unassigned__")
                                  setGaNoteTaskPriority(note.priority || "NORMAL")
                                }}
                              >
                                Create Task
                              </Button>
                            ) : null}
                            {note.status !== "CLOSED" && !isReadOnly ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                onClick={() => void closeGaNote(note.id)}
                              >
                                Archive
                              </Button>
                            ) : note.status === "CLOSED" ? (
                              <Badge variant="secondary" className="h-5 text-[10px]">
                                Archived
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </Card>
                    )
                  }) : <div className="col-span-full py-12 text-center text-sm text-slate-400">No active notes.</div>}
                </div>
              </div>
            )}

            {/* MEETINGS */}
            {activeTab === "meetings" && (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-medium tracking-tight text-slate-900 dark:text-white">Meetings</h2>
                </div>

                <div className="grid gap-8 lg:grid-cols-2">
                  {/* Internal Sync */}
                  <div className="relative overflow-hidden rounded-3xl bg-white/70 p-8 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900/60 dark:ring-slate-800">
                    <div className="relative z-10">
                      <h3 className="text-lg font-medium text-slate-900 dark:text-white">Internal Sync</h3>
                      <p className="text-sm text-slate-500">Daily routine checks.</p>

                      <div className="mt-6 mb-8 flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                        {(Object.keys(INTERNAL_MEETING.slots) as Array<keyof typeof INTERNAL_MEETING.slots>).map(slot => (
                          <button key={slot} onClick={() => setInternalSlot(slot)} className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${internalSlot === slot ? "bg-white shadow-sm text-slate-900 dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-900"}`}>{slot}</button>
                        ))}
                      </div>

                      <div className="space-y-4">
                        <h4 className="font-medium text-emerald-600 dark:text-emerald-400">{INTERNAL_MEETING.slots[internalSlot].label}</h4>
                        <ul className="space-y-3">
                          {INTERNAL_MEETING.slots[internalSlot].items.map((item, i) => (
                            <li key={i} className="flex gap-4 text-sm text-slate-600 dark:text-slate-400">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[10px] font-bold text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">{i + 1}</span>
                              <span className="leading-relaxed">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Scheduled */}
                  <div className="relative overflow-hidden rounded-3xl bg-white/70 p-8 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900/60 dark:ring-slate-800">
                    <div className="flex items-center justify-between mb-4">
                      <div><h3 className="text-lg font-medium text-slate-900 dark:text-white">Scheduled</h3><p className="text-sm text-slate-500">Project meetings & Calendar events.</p></div>
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600">{visibleMeetings.length} today</Badge>
                    </div>

                    {!isReadOnly && (
                      <div className="mb-6 rounded-2xl bg-slate-50/50 p-4 ring-1 ring-slate-100 dark:bg-slate-800/50 dark:ring-slate-700">
                        <div className="space-y-3">
                          <Input className="rounded-xl border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" placeholder="New Meeting Title" value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} />
                          <div className="grid grid-cols-2 gap-3">
                            <Input className="rounded-xl border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" placeholder="Platform" value={meetingPlatform} onChange={(e) => setMeetingPlatform(e.target.value)} />
                            <Input className="rounded-xl border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" type="datetime-local" value={meetingStartsAt} onChange={(e) => setMeetingStartsAt(e.target.value)} />
                          </div>
                          <div className="flex gap-3">
                            <Select value={meetingProjectId} onValueChange={setMeetingProjectId}><SelectTrigger className="rounded-xl border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><SelectValue placeholder="Project (Opt)" /></SelectTrigger><SelectContent><SelectItem value="__none__">None</SelectItem>{filteredProjects.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent></Select>
                            <Button className="shrink-0 rounded-xl bg-slate-900 text-white" onClick={() => void submitMeeting()} disabled={!meetingTitle.trim() || creatingMeeting}>Add</Button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {visibleMeetings.map((meeting) => {
                        const project = meeting.project_id ? projects.find(p => p.id === meeting.project_id) : null
                        const isEditing = editingMeetingId === meeting.id

                        if (isEditing) {
                          return (
                            <div key={meeting.id} className="rounded-xl border bg-white p-4 space-y-2 shadow-lg ring-2 ring-emerald-100">
                              <Input value={editMeetingTitle} onChange={(e) => setEditMeetingTitle(e.target.value)} className="font-medium" />
                              <div className="grid grid-cols-2 gap-2"><Input value={editMeetingPlatform} onChange={(e) => setEditMeetingPlatform(e.target.value)} /><Input type="datetime-local" value={editMeetingStartsAt} onChange={(e) => setEditMeetingStartsAt(e.target.value)} /></div>
                              <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setEditingMeetingId(null)}>Cancel</Button><Button size="sm" onClick={() => void saveMeeting(meeting.id)}>Save</Button></div>
                            </div>
                          )
                        }
                        return (
                          <div key={meeting.id} className="group flex items-center justify-between rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-100 transition hover:ring-slate-300 dark:bg-slate-900 dark:ring-slate-800">
                            <div className="flex items-start gap-4">
                              <div className="flex flex-col items-center min-w-[3rem]">
                                <span className="text-xs font-bold text-slate-900 dark:text-white">{meeting.starts_at ? new Date(meeting.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--"}</span>
                                <Badge variant="outline" className="mt-1 h-4 px-1 text-[8px] border-slate-200 text-slate-500">DB</Badge>
                              </div>
                              <div>
                                <div className="font-medium text-slate-900 dark:text-white flex items-center gap-2">{meeting.title}</div>
                                <div className="flex items-center gap-2 mt-0.5">{meeting.platform && <span className="text-xs text-slate-500">{meeting.platform}</span>}{project && <><span className="text-[8px] text-slate-300">•</span><span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">{formatProjectTitleWithProducts(project)}</span></>}</div>
                              </div>
                            </div>
                            {!isReadOnly && (
                              <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-slate-900" onClick={() => { setEditingMeetingId(meeting.id); setEditMeetingTitle(meeting.title); setEditMeetingPlatform(meeting.platform || ""); setEditMeetingStartsAt(toMeetingInputValue(meeting.starts_at)); setEditMeetingProjectId(meeting.project_id || "__none__"); }}>✎</Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-400 hover:text-rose-600" onClick={() => void deleteMeeting(meeting.id)}>✕</Button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {!visibleMeetings.length && <div className="py-4 text-center text-sm text-slate-400">No scheduled meetings.</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="hidden print:block">
          <div className="px-6 py-4">
            <div className="text-center text-sm font-semibold text-slate-700">PrimeFlow</div>
            <div className="mt-4 text-2xl font-bold text-slate-900">Weekly Task Report</div>
            <div className="mt-1 text-sm text-slate-700">
              Department: {departmentName}
            </div>
            <div className="text-sm text-slate-700">
              User: {user?.full_name || user?.username || "-"}
            </div>
            <div className="text-sm text-slate-700">
              {printRange === "today" ? "Date" : "Week"}: {printRangeLabel}
            </div>
          </div>
          <div className="px-6 pb-6">
            <table className="w-full border border-slate-900 text-[11px]">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">Category</th>
                  {printDates.map((date) => (
                    <th key={date.toISOString()} className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">
                      {formatPrintDay(date)}
                    </th>
                  ))}
                  <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">Status</th>
                  <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">Comment</th>
                </tr>
              </thead>
              <tbody>
                {printRowsByRange.map((row) => {
                  const total = row.itemsByDay.reduce((sum, items) => sum + items.length, 0)
                  return (
                    <tr key={row.id}>
                      <td className="border border-slate-900 px-2 py-2 align-top font-semibold uppercase">
                        {row.label}
                        <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-900 text-[10px] font-semibold">
                          {total}
                        </span>
                      </td>
                      {row.itemsByDay.map((items, idx) => (
                        <td key={`${row.id}-${idx}`} className="border border-slate-900 px-2 py-2 align-top">
                          {items.length ? (
                            <div className="space-y-1">
                              {items.map((item, itemIndex) => (
                                <div
                                  key={`${row.id}-${idx}-${itemIndex}`}
                                  className="border-b border-dashed border-slate-300 pb-1 last:border-0"
                                >
                                  <div className="flex items-start gap-1 leading-tight">
                                    <span className="text-[10px] font-semibold">{itemIndex + 1}.</span>
                                    <span>{item}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="italic text-slate-600">No data available.</div>
                          )}
                        </td>
                      ))}
                      <td className="border border-slate-900 px-2 py-2 align-top" />
                      <td className="border border-slate-900 px-2 py-2 align-top" />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          body { background: white; }
          aside { display: none !important; }
          @page { margin: 12mm; }
        }
      `}} />
    </div>
  )
}
