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
import { formatDepartmentName } from "@/lib/department-name"
import type { ChecklistItem, Department, GaNote, Meeting, Project, SystemTaskTemplate, Task, TaskFinishPeriod, TaskPriority, UserLookup } from "@/lib/types"

const TABS = [
  { id: "all", label: "All (Today)", tone: "neutral" },
  { id: "projects", label: "Projects", tone: "neutral" },
  { id: "system", label: "System Tasks", tone: "blue" },
  { id: "no-project", label: "Fast Tasks", tone: "red" },
  { id: "ga-ka", label: "GA/KA Notes", tone: "neutral" },
  { id: "meetings", label: "Meetings", tone: "neutral" },
] as const

type TabId = (typeof TABS)[number]["id"]

const PHASES = ["MEETINGS", "PLANNING", "DEVELOPMENT", "TESTING", "DOCUMENTATION"] as const

const PHASE_LABELS: Record<string, string> = {
  MEETINGS: "Meetings",
  PLANNING: "Planning",
  DEVELOPMENT: "Development",
  TESTING: "Testing",
  DOCUMENTATION: "Documentation",
  CLOSED: "Closed",
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
  NORMAL: "border-amber-200 bg-amber-50 text-amber-700",
  HIGH: "border-red-200 bg-red-50 text-red-700",
}

const PRIORITY_BORDER_STYLES: Record<TaskPriority, string> = {
  NORMAL: "border-l-amber-500",
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

const PROJECT_TEMPLATES = [
  {
    id: "__custom__",
    label: "Custom",
    description: "Create a project from scratch.",
    status: "TODO" as string,
    current_phase: "MEETINGS" as string,
    progress_percentage: 0 as number,
  },
  {
    id: "MST",
    label: "MST",
    title: "MST",
    description: "Menaxhimi i programit dhe checklistes se produkteve.",
    status: "IN_PROGRESS",
    current_phase: "PLANNING",
    progress_percentage: 48,
  },
  {
    id: "VS/VL",
    label: "VS/VL PROJEKT I MADH",
    title: "VS/VL",
    description: "VS/VL project phases: Project Acceptance, Amazon, Check, Dreamrobot.",
    status: "IN_PROGRESS",
    current_phase: "PLANNING",
    progress_percentage: 0,
  },
  {
    id: "TT",
    label: "TT",
    title: "TT",
    description: "Menaxhimi i programit dhe checklistes se produkteve.",
    status: "IN_PROGRESS",
    current_phase: "PLANNING",
    progress_percentage: 48,
  },
] as const

type ProjectTemplateId = (typeof PROJECT_TEMPLATES)[number]["id"]

function applyProjectTemplateTitle(templateId: ProjectTemplateId, rawTitle: string) {
  const trimmed = rawTitle.trim()
  if (templateId === "__custom__") return trimmed
  const normalized = trimmed.toUpperCase()
  if (!trimmed) return templateId
  if (normalized.includes(templateId.toUpperCase())) return trimmed
  return `${templateId} ${trimmed}`.trim()
}

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

const INTERNAL_MEETING_GROUP_KEY = "pcm_internal_meetings"

const VS_VL_META_PREFIX = "VS_VL_META:"

const VS_VL_TEMPLATE_TASKS: readonly {
  key: string;
  title: string;
  phase: string;
  dependencyKey?: string;
}[] = [
  {
    key: "base",
    title: "ANALIZIMI DHE IDENTIFIKIMI I KOLONAVE",
    phase: "AMAZON",
  },
  {
    key: "template",
    title: "PLOTESIMI I TEMPLATE-IT TE AMAZONIT",
    phase: "AMAZON",
    dependencyKey: "base",
  },
  {
    key: "prices",
    title: "KALKULIMI I CMIMEVE",
    phase: "AMAZON",
  },
  {
    key: "photos",
    title: "GJENERIMI I FOTOVE",
    phase: "AMAZON",
  },
  {
    key: "kontrol",
    title: "KONTROLLIMI I PROD. EGZSISTUESE DHE POSTIMI NE AMAZON",
    phase: "AMAZON",
    dependencyKey: "ko2",
  },
  {
    key: "ko1",
    title: "KO1 E PROJEKTIT VS",
    phase: "CHECK",
    dependencyKey: "base",
  },
  {
    key: "ko2",
    title: "KO2 E PROJEKTIT VS",
    phase: "CHECK",
    dependencyKey: "ko1",
  },
  {
    key: "dreamVs",
    title: "DREAM ROBOT VS",
    phase: "DREAMROBOT",
    dependencyKey: "kontrol",
  },
  {
    key: "dreamVl",
    title: "DREAM ROBOT VL",
    phase: "DREAMROBOT",
    dependencyKey: "kontrol",
  },
  {
    key: "dreamWeights",
    title: "KALKULIMI I PESHAVE",
    phase: "DREAMROBOT",
  },
] as const

type VsVlPhase = (typeof VS_VL_TEMPLATE_TASKS)[number]["phase"]
type VsVlTaskMeta = {
  vs_vl_phase?: VsVlPhase
  checklist?: string
  comment?: string
  dependency_task_id?: string
}

const VS_VL_TEMPLATE_TITLE_KEYS = new Set(VS_VL_TEMPLATE_TASKS.map((task) => normalizeTaskTitle(task.title)))
const VS_VL_PHASE_BY_TITLE = new Map(
  VS_VL_TEMPLATE_TASKS.map((task) => [normalizeTaskTitle(task.title), task.phase])
)

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
  if (task.is_bllok) return "Blocked"
  if (task.is_1h_report) return "1H"
  if (task.is_r1) return "R1"
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
  const cleaned = note.trim().replace(/\s+/g, " ")
  if (!cleaned) return "GA/KA note task"
  if (cleaned.length <= 80) return cleaned
  return `${cleaned.slice(0, 77)}...`
}

function truncateDescription(value: string, limit = 120) {
  if (value.length <= limit) return { text: value, truncated: false }
  return { text: `${value.slice(0, limit).trim()}…`, truncated: true }
}

function normalizeTaskTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
}

function parseVsVlMeta(notes?: string | null): VsVlTaskMeta | null {
  if (!notes || !notes.startsWith(VS_VL_META_PREFIX)) return null
  try {
    return JSON.parse(notes.slice(VS_VL_META_PREFIX.length)) as VsVlTaskMeta
  } catch {
    return null
  }
}

function serializeVsVlMeta(meta: VsVlTaskMeta): string {
  return `${VS_VL_META_PREFIX}${JSON.stringify(meta)}`
}

export default function DepartmentKanban() {
  const departmentLookupName = "Project Content Manager"
  const departmentDisplayName = "Product Content"
  const { apiFetch, user } = useAuth()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const normalizedTab = tabParam === "tasks" ? "no-project" : tabParam
  const isTabId = Boolean(normalizedTab && TABS.some((tab) => tab.id === normalizedTab))
  const returnToTasks = `${pathname}?tab=no-project`
  const [department, setDepartment] = React.useState<Department | null>(null)
  const [projects, setProjects] = React.useState<Project[]>([])
  const [showTemplates, setShowTemplates] = React.useState(false)
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
  const [deletingProjectId, setDeletingProjectId] = React.useState<string | null>(null)
  const [projectTemplateId, setProjectTemplateId] = React.useState<ProjectTemplateId>("__custom__")
  const [projectTitle, setProjectTitle] = React.useState("")
  const [showTitleWarning, setShowTitleWarning] = React.useState(false)
  const [pendingProjectTitle, setPendingProjectTitle] = React.useState("")
  const [projectDescription, setProjectDescription] = React.useState("")
  const [projectManagerId, setProjectManagerId] = React.useState("__unassigned__")
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
  const [internalMeetingChecklistId, setInternalMeetingChecklistId] = React.useState<string | null>(null)
  const [internalMeetingItems, setInternalMeetingItems] = React.useState<ChecklistItem[]>([])
  const [newInternalMeetingItem, setNewInternalMeetingItem] = React.useState("")
  const [addingInternalMeetingItem, setAddingInternalMeetingItem] = React.useState(false)
  const [editingInternalMeetingItemId, setEditingInternalMeetingItemId] = React.useState<string | null>(null)
  const [editingInternalMeetingItem, setEditingInternalMeetingItem] = React.useState("")
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
  const [gaNoteCreateTask, setGaNoteCreateTask] = React.useState(false)
  const [gaNoteTaskAssignee, setGaNoteTaskAssignee] = React.useState("__unassigned__")
  const [gaNoteCreateTaskFinishPeriod, setGaNoteCreateTaskFinishPeriod] = React.useState<
    TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE
  >(FINISH_PERIOD_NONE_VALUE)
  const [gaNoteTaskOpenId, setGaNoteTaskOpenId] = React.useState<string | null>(null)
  const [gaNoteTaskAssigneeId, setGaNoteTaskAssigneeId] = React.useState("__unassigned__")
  const [gaNoteTaskTitle, setGaNoteTaskTitle] = React.useState("")
  const [gaNoteTaskDescription, setGaNoteTaskDescription] = React.useState("")
  const [gaNoteTaskPriority, setGaNoteTaskPriority] = React.useState<TaskPriority>("NORMAL")
  const [gaNoteTaskDueDate, setGaNoteTaskDueDate] = React.useState("")
  const [gaNoteTaskFinishPeriod, setGaNoteTaskFinishPeriod] = React.useState<
    TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE
  >(FINISH_PERIOD_NONE_VALUE)
  const [creatingGaNoteTask, setCreatingGaNoteTask] = React.useState(false)
  const [expandedSystemDescriptions, setExpandedSystemDescriptions] = React.useState<Record<string, boolean>>({})

  React.useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const depRes = await apiFetch("/departments")
        if (!depRes.ok) return
        const deps = (await depRes.json()) as Department[]
        const dep = deps.find((d) => d.name === departmentLookupName) || null
        setDepartment(dep)
        if (!dep) return

        const [projRes, sysRes, tasksRes, gaRes, meetingsRes] = await Promise.all([
          apiFetch(`/projects?department_id=${dep.id}${showTemplates ? "&include_templates=true" : ""}`),
          apiFetch(`/system-tasks?department_id=${dep.id}`),
          apiFetch(`/tasks?department_id=${dep.id}&include_done=false`),
          apiFetch(`/ga-notes?department_id=${dep.id}`),
          apiFetch(`/meetings?department_id=${dep.id}`),
        ])
        if (projRes.ok) setProjects((await projRes.json()) as Project[])
        if (sysRes.ok) setSystemTasks((await sysRes.json()) as SystemTaskTemplate[])
        if (tasksRes.ok) {
          const taskRows = (await tasksRes.json()) as Task[]
          const nonSystemTasks = taskRows.filter((t) => !t.system_template_origin_id)
          setDepartmentTasks(nonSystemTasks)
          setNoProjectTasks(nonSystemTasks.filter((t) => !t.project_id))
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
  }, [apiFetch, departmentLookupName, user?.role, showTemplates])

  React.useEffect(() => {
    if (!department) return
    let cancelled = false
    const loadInternalMeetingChecklist = async () => {
      try {
        const res = await apiFetch(
          `/checklists?group_key=${INTERNAL_MEETING_GROUP_KEY}&include_items=true`
        )
        if (!res.ok) return
        let checklist = (await res.json()) as {
          id: string
          items?: ChecklistItem[]
        }[]
        let selected = checklist[0]
        if (!selected) {
          const createRes = await apiFetch("/checklists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: INTERNAL_MEETING.title,
              note: INTERNAL_MEETING.title,
              group_key: INTERNAL_MEETING_GROUP_KEY,
            }),
          })
          if (!createRes.ok) return
          selected = (await createRes.json()) as { id: string }
        }
        if (cancelled) return
        setInternalMeetingChecklistId(selected.id)
        let items = selected.items || []
        const existingKeys = new Set(
          items.map((item) => `${item.day || ""}|${(item.title || "").trim().toLowerCase()}`)
        )
        const slotOrder = Object.keys(INTERNAL_MEETING.slots) as Array<
          keyof typeof INTERNAL_MEETING.slots
        >
        let position = 0
        const seedPromises: Promise<Response>[] = []
        for (const slot of slotOrder) {
          for (const title of INTERNAL_MEETING.slots[slot].items) {
            position += 1
            const key = `${slot}|${title.trim().toLowerCase()}`
            if (existingKeys.has(key)) continue
            seedPromises.push(
              apiFetch("/checklist-items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  checklist_id: selected.id,
                  item_type: "CHECKBOX",
                  path: "INTERNAL_MEETINGS",
                  day: slot,
                  title,
                  is_checked: false,
                  position,
                }),
              })
            )
          }
        }
        if (seedPromises.length) {
          await Promise.all(seedPromises)
          const reloadRes = await apiFetch(`/checklist-items?checklist_id=${selected.id}`)
          if (reloadRes.ok) {
            items = (await reloadRes.json()) as ChecklistItem[]
          }
        }
        if (cancelled) return
        setInternalMeetingItems(items)
      } catch (error) {
        console.error("Failed to load internal meetings checklist", error)
      }
    }
    void loadInternalMeetingChecklist()
    return () => {
      cancelled = true
    }
  }, [apiFetch, department])

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
  }, [apiFetch, projects])

  React.useEffect(() => {
    if (isTabId) {
      setActiveTab(normalizedTab as TabId)
    }
  }, [isTabId, normalizedTab])

  React.useEffect(() => {
    const template = PROJECT_TEMPLATES.find((item) => item.id === projectTemplateId)
    if (!template || template.id === "__custom__") return
    if (template.title) setProjectTitle(template.title)
    if (template.description) setProjectDescription(template.description)
    if (template.status) setProjectStatus(template.status)
  }, [projectTemplateId])

  const userMap = React.useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const departmentUsers = React.useMemo(
    () => (department ? users.filter((u) => u.department_id === department.id) : []),
    [department, users]
  )
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
  const showSystemActions = viewMode === "mine"
  const canDeleteProjects = user?.role === "ADMIN" && !isReadOnly

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
        days_of_week: systemFrequency === "WEEKLY" ? [dayIdx] : null,
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

  const looksLikeFullName = (title: string): boolean => {
    const trimmed = title.trim()
    if (!trimmed) return false
    const upper = trimmed.toUpperCase()

    const companyWords = [
      "COMPANY",
      "COMP",
      "INC",
      "INCORPORATED",
      "LLC",
      "LTD",
      "LIMITED",
      "CORP",
      "CORPORATION",
      "GROUP",
      "ENTERPRISES",
      "SOLUTIONS",
      "SYSTEMS",
      "SERVICES",
    ]
    const hasCompanyWord = companyWords.some((word) => upper.includes(word))

    const wordCount = trimmed.split(/\s+/).filter(Boolean).length
    const isTooLong = upper.length > 6

    return hasCompanyWord || wordCount > 1 || isTooLong
  }

  const handleProjectTitleChange = (value: string) => {
    const upperValue = value.toUpperCase()
    setProjectTitle(upperValue)
  }

  const attemptSubmitProject = () => {
    if (!department) return
    const resolvedTitle = applyProjectTemplateTitle(projectTemplateId, projectTitle)
    if (!resolvedTitle) return

    setPendingProjectTitle(resolvedTitle.trim())
    setShowTitleWarning(true)
  }

  const resetProjectForm = React.useCallback(() => {
    setProjectTemplateId("__custom__")
    setProjectTitle("")
    setProjectDescription("")
    setProjectManagerId("__unassigned__")
    setProjectStatus("TODO")
  }, [])

  const handleProjectDialogOpen = (open: boolean) => {
    setCreateProjectOpen(open)
    if (!open) {
      setShowTitleWarning(false)
      setPendingProjectTitle("")
      resetProjectForm()
    }
  }

  const submitProject = async () => {
    if (!department) return
    const template = PROJECT_TEMPLATES.find((item) => item.id === projectTemplateId)
    const resolvedTitle = applyProjectTemplateTitle(projectTemplateId, projectTitle)
    if (!resolvedTitle) return
    const resolvedDescription = projectDescription.trim() || template?.description || null
    setCreatingProject(true)
    try {
      const payload: Record<string, unknown> = {
        title: resolvedTitle,
        description: resolvedDescription,
        department_id: department.id,
        manager_id: projectManagerId === "__unassigned__" ? null : projectManagerId,
        status: projectStatus,
      }
      if (template?.current_phase) {
        payload.current_phase = template.current_phase
      }
      if (typeof template?.progress_percentage === "number") {
        payload.progress_percentage = template.progress_percentage
      }
      const res = await apiFetch("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail = "Failed to create project"
        try {
          const data = await res.json()
          if (typeof data?.detail === "string") {
            detail = data.detail
          } else if (Array.isArray(data?.detail) && data.detail[0]?.msg) {
            detail = data.detail[0].msg
          }
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const created = (await res.json()) as Project
      setProjects((prev) => [created, ...prev])
      setCreateProjectOpen(false)
      resetProjectForm()
      toast.success("Project created")
      // Tasks are now automatically copied from template by the backend
    } finally {
      setCreatingProject(false)
    }
  }

  const deleteProject = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    const projectLabel = project?.title || project?.name || "this project"
    if (!window.confirm(`Delete "${projectLabel}"? This cannot be undone.`)) return

    setDeletingProjectId(projectId)
    try {
      const res = await apiFetch(`/projects/${projectId}`, { method: "DELETE" })
      if (!res.ok) {
        let detail = "Failed to delete project"
        try {
          const data = await res.json()
          if (typeof data?.detail === "string") {
            detail = data.detail
          }
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      setProjects((prev) => prev.filter((p) => p.id !== projectId))
      toast.success("Project deleted")
    } finally {
      setDeletingProjectId((prev) => (prev === projectId ? null : prev))
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

  const toggleInternalMeetingItem = async (itemId: string, next: boolean) => {
    const previous = internalMeetingItems.find((item) => item.id === itemId)?.is_checked ?? false
    setInternalMeetingItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, is_checked: next } : item))
    )
    const res = await apiFetch(`/checklist-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_checked: next }),
    })
    if (!res.ok) {
      setInternalMeetingItems((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, is_checked: previous } : item))
      )
      toast.error("Failed to update internal meeting item")
    }
  }

  const addInternalMeetingItem = async () => {
    if (!internalMeetingChecklistId) return
    const title = newInternalMeetingItem.trim()
    if (!title) return
    setAddingInternalMeetingItem(true)
    try {
      const nextPosition =
        internalMeetingItems.reduce((max, item) => Math.max(max, item.position ?? 0), 0) + 1
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklist_id: internalMeetingChecklistId,
          item_type: "CHECKBOX",
          path: "INTERNAL_MEETINGS",
          day: internalSlot,
          title,
          is_checked: false,
          position: nextPosition,
        }),
      })
      if (!res.ok) {
        toast.error("Failed to add internal meeting item")
        return
      }
      const created = (await res.json()) as ChecklistItem
      setInternalMeetingItems((prev) => [...prev, created])
      setNewInternalMeetingItem("")
      toast.success("Internal meeting item added")
    } finally {
      setAddingInternalMeetingItem(false)
    }
  }

  const startEditInternalMeetingItem = (item: ChecklistItem) => {
    setEditingInternalMeetingItemId(item.id)
    setEditingInternalMeetingItem(item.title || "")
  }

  const cancelEditInternalMeetingItem = () => {
    setEditingInternalMeetingItemId(null)
    setEditingInternalMeetingItem("")
  }

  const saveInternalMeetingItem = async () => {
    if (!editingInternalMeetingItemId) return
    const title = editingInternalMeetingItem.trim()
    if (!title) return
    const res = await apiFetch(`/checklist-items/${editingInternalMeetingItemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) {
      toast.error("Failed to update internal meeting item")
      return
    }
    const updated = (await res.json()) as ChecklistItem
    setInternalMeetingItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    cancelEditInternalMeetingItem()
  }

  const deleteInternalMeetingItem = async (itemId: string) => {
    const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Failed to delete internal meeting item")
      return
    }
    setInternalMeetingItems((prev) => prev.filter((item) => item.id !== itemId))
    toast.success("Internal meeting item deleted")
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
      if (gaNoteCreateTask) {
        const taskPayload = {
          title: gaNoteTaskDefaultTitle(newGaNote),
          description: newGaNote.trim(),
          project_id: created.project_id ?? null,
          department_id: department.id,
          assigned_to: gaNoteTaskAssignee === "__unassigned__" ? null : gaNoteTaskAssignee,
          status: "TODO",
          priority: newGaNotePriority === "__none__" ? "NORMAL" : newGaNotePriority,
          ga_note_origin_id: created.id,
          finish_period:
            gaNoteCreateTaskFinishPeriod === FINISH_PERIOD_NONE_VALUE ? null : gaNoteCreateTaskFinishPeriod,
        }
        const taskRes = await apiFetch("/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(taskPayload),
        })
        if (!taskRes.ok) {
          let detail = "GA/KA note saved, but task creation failed"
          try {
            const data = (await taskRes.json()) as { detail?: string }
            if (data?.detail) detail = data.detail
          } catch {
            // ignore
          }
          toast.error(detail)
        } else {
          const createdTask = (await taskRes.json()) as Task
          setDepartmentTasks((prev) => [createdTask, ...prev])
          if (!createdTask.project_id) {
            setNoProjectTasks((prev) => [createdTask, ...prev])
          }
        }
      }
      setNewGaNote("")
      setNewGaNoteType("GA")
      setNewGaNotePriority("__none__")
      setNewGaNoteProjectId("__none__")
      setGaNoteCreateTask(false)
      setGaNoteTaskAssignee("__unassigned__")
      setGaNoteCreateTaskFinishPeriod(FINISH_PERIOD_NONE_VALUE)
      setGaNoteOpen(false)
      toast.success("GA/KA note added")
    } finally {
      setAddingGaNote(false)
    }
  }

  const submitGaNoteTask = async () => {
    if (!gaNoteTaskOpenId || !department) return
    const note = gaNotes.find((n) => n.id === gaNoteTaskOpenId)
    if (!note) {
      toast.error("GA/KA note not found.")
      return
    }
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
      if (!createdTask.project_id) {
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
    <div className="min-h-screen bg-slate-50">
      <div className="relative overflow-hidden rounded-[2.25rem] border border-stone-200/70 bg-gradient-to-br from-amber-50 via-rose-50/30 to-stone-50 p-6 shadow-lg print:hidden dark:border-stone-800/70 dark:from-stone-950 dark:via-stone-950 dark:to-rose-950/30">
        <div className="pointer-events-none absolute -top-24 right-0 h-56 w-56 rounded-full bg-amber-200/40 blur-3xl dark:bg-amber-900/30" />
        <div className="pointer-events-none absolute -bottom-24 left-0 h-56 w-56 rounded-full bg-rose-200/35 blur-3xl dark:bg-rose-900/20" />
        <div className="relative space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-[0.25em] text-stone-500 dark:text-stone-400">
                Department
              </div>
              <div className="text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                {departmentDisplayName}
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
                    <span className="uppercase tracking-wide">{tab.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${badgeClass}`}>{counts[tab.id]}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {activeTab === "projects" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="text-lg font-semibold">Active Projects</div>
                  {user?.role === "ADMIN" && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={showTemplates}
                        onCheckedChange={(checked) => setShowTemplates(checked === true)}
                      />
                      <span className="text-muted-foreground">Show Templates</span>
                    </label>
                  )}
                </div>
                {canManage ? (
                  <Dialog open={createProjectOpen} onOpenChange={handleProjectDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="rounded-xl">+ New Project</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Add Project</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                          <Label>Template</Label>
                          <Select value={projectTemplateId} onValueChange={(v) => setProjectTemplateId(v as ProjectTemplateId)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select template" />
                            </SelectTrigger>
                            <SelectContent>
                              {PROJECT_TEMPLATES.map((template) => (
                                <SelectItem key={template.id} value={template.id}>
                                  {template.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label>Title</Label>
                          <Input
                            value={projectTitle}
                            onChange={(e) => handleProjectTitleChange(e.target.value)}
                            className="uppercase placeholder:normal-case"
                            placeholder="Enter project shortcut (e.g., ABC, XYZ)"
                            style={{ textTransform: "uppercase" }}
                          />
                          <div className="text-xs text-muted-foreground">
                            Use a shortcut/abbreviation, not the full client name (e.g., "ABC" instead of "ABC Company").
                          </div>
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
                          <Label>Status</Label>
                          <Select value={projectStatus} onValueChange={setProjectStatus}>
                            <SelectTrigger>
                              <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="TODO">To do</SelectItem>
                              <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                              <SelectItem value="DONE">Done</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-end gap-2 md:col-span-2">
                          <Button variant="outline" onClick={() => handleProjectDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button disabled={!projectTitle.trim() || creatingProject} onClick={attemptSubmitProject}>
                            {creatingProject ? "Saving..." : "Save"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                ) : null}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {filteredProjects.map((project) => {
                  const manager = project.manager_id ? userMap.get(project.manager_id) : null
                  const phase = project.current_phase || "MEETINGS"
                  const membersForProject = projectMembers[project.id] || []
                  const memberColors = [
                    "bg-slate-100 text-slate-700",
                    "bg-amber-100 text-amber-800",
                    "bg-rose-100 text-rose-700",
                    "bg-emerald-100 text-emerald-700",
                    "bg-blue-100 text-blue-700",
                  ]
                  return (
                    <Card
                      key={project.id}
                      className="rounded-2xl border border-stone-200/70 bg-white/80 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-stone-800/70 dark:bg-stone-900/70"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold leading-tight">{project.title || project.name}</span>
                            {project.is_template && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-amber-700 border-amber-300 bg-amber-50">Template</Badge>
                            )}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                            {project.description || "-"}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {canDeleteProjects ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={deletingProjectId === project.id}
                              onClick={() => void deleteProject(project.id)}
                              className="h-7 rounded-full border-rose-200 px-3 text-xs text-rose-600 hover:bg-rose-50"
                            >
                              {deletingProjectId === project.id ? "Deleting..." : "Delete"}
                            </Button>
                          ) : null}
                          <Badge variant="outline" className="text-[10px]">
                            {PHASE_LABELS[phase] || "Meetings"}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-muted-foreground">
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
                      <div className="mt-2">
                        <div className="text-[10px] uppercase tracking-wide text-stone-500">Members</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {membersForProject.length ? (
                            membersForProject.slice(0, 6).map((member, idx) => (
                              <div
                                key={member.id}
                                className={[
                                  "h-6 w-6 rounded-full text-[9px] font-semibold flex items-center justify-center",
                                  memberColors[idx % memberColors.length],
                                ].join(" ")}
                                title={member.full_name || member.username || "-"}
                              >
                                {initials(member.full_name || member.username || "-")}
                              </div>
                            ))
                          ) : (
                            <div className="text-[11px] text-muted-foreground">No members yet.</div>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {manager ? (
                            <div className="h-6 w-6 rounded-full bg-amber-100 text-[9px] font-semibold text-amber-800 flex items-center justify-center dark:bg-amber-900/40 dark:text-amber-200">
                              {initials(manager.full_name || manager.username || "-")}
                            </div>
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-muted text-[9px] font-semibold flex items-center justify-center">
                              -
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/projects/pcm/${project.id}`}
                            className="text-[11px] font-semibold text-rose-700 transition-colors hover:text-rose-800 hover:underline dark:text-rose-200 dark:hover:text-rose-100"
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
                        {todaySystemTasks.map((task) => {
                          const description = task.description?.trim() || ""
                          const isExpanded = Boolean(expandedSystemDescriptions[task.id])
                          const { text, truncated } = truncateDescription(description)
                          const displayText = description ? (isExpanded ? description : text) : "-"
                          return (
                            <div
                              key={task.id}
                              className="rounded-lg border border-slate-200 border-l-4 border-blue-500 bg-white px-3 py-2 text-sm"
                            >
                              <div className="font-medium text-slate-800">{task.title}</div>
                              <div className="mt-1 text-xs text-slate-600">
                                {displayText}
                                {description && truncated ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleSystemDescription(task.id)}
                                    className="ml-2 text-[11px] font-semibold text-amber-700 hover:underline"
                                  >
                                    {isExpanded ? "Show less" : "Read more"}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          )
                        })}
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
                              <SelectItem value={department.id}>{formatDepartmentName(department.name)}</SelectItem>
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
                      <div
                        className={[
                          "grid gap-3 border-b bg-muted/30 px-4 py-3 text-xs font-semibold text-muted-foreground",
                          showSystemActions ? "grid-cols-8" : "grid-cols-7",
                        ].join(" ")}
                      >
                        <div className="col-span-2">TASK</div>
                        <div>DEPARTMENT</div>
                        <div>WHEN</div>
                        <div>STATUS</div>
                        <div>OWNER</div>
                        <div>SET BY</div>
                        {showSystemActions ? <div>ACTIONS</div> : null}
                      </div>
                      <div className="divide-y">
                        {group.items.map((item) => {
                          const owner = item.default_assignee_id ? users.find((u) => u.id === item.default_assignee_id) : null
                          const priorityValue = normalizePriority(item.priority)
                          const statusValue = item.status || "TODO"
                          const isClosed = statusValue === "DONE"
                          const isAssigned =
                            Boolean(user?.id) &&
                            (item.default_assignee_id === user?.id ||
                              item.assignees?.some((assignee) => assignee.id === user?.id))
                          return (
                            <div
                              key={item.id}
                              className={[
                                "grid gap-3 border-l-4 px-4 py-4 text-sm",
                                PRIORITY_BORDER_STYLES[priorityValue],
                                showSystemActions ? "grid-cols-8" : "grid-cols-7",
                              ].join(" ")}
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
                              <div>{item.scope === "ALL" ? "ALL" : item.scope === "GA" ? "GA" : department.code}</div>
                              <div className="whitespace-pre-line text-muted-foreground">
                                {formatSchedule(item, systemDate)}
                              </div>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="secondary">
                                    {item.is_active ? STATUS_LABELS.OPEN : STATUS_LABELS.INACTIVE}
                                  </Badge>
                                  <Badge variant="secondary" className="uppercase text-[10px]">
                                    {statusValue}
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
                              {showSystemActions ? (
                                <div>
                                  {isClosed ? (
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
                                  ) : null}
                                </div>
                              ) : null}
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
                            <Select value={newGaNoteType} onValueChange={(value) => setNewGaNoteType(value as "GA" | "KA")}>
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
                            <Select
                              value={newGaNotePriority}
                              onValueChange={(value) => setNewGaNotePriority(value as "NORMAL" | "HIGH" | "__none__")}
                            >
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
                        {canCreate ? (
                          <div className="rounded-xl border border-stone-200/70 bg-white/70 p-3 space-y-3">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={gaNoteCreateTask}
                                onCheckedChange={(value) => setGaNoteCreateTask(Boolean(value))}
                              />
                              <div className="text-sm font-medium">Create task from this note</div>
                            </div>
                            {gaNoteCreateTask ? (
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                  <Label>Assign to</Label>
                                  <Select value={gaNoteTaskAssignee} onValueChange={setGaNoteTaskAssignee}>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Unassigned" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__unassigned__">Unassigned</SelectItem>
                                      {departmentUsers.map((member) => (
                                        <SelectItem key={member.id} value={member.id}>
                                          {member.full_name || member.username}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Finish by (optional)</Label>
                                  <Select
                                    value={gaNoteCreateTaskFinishPeriod}
                                    onValueChange={(value) =>
                                      setGaNoteCreateTaskFinishPeriod(
                                        value as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE
                                      )
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
                              </div>
                            ) : null}
                          </div>
                        ) : null}
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
              <Dialog
                open={Boolean(gaNoteTaskOpenId)}
                onOpenChange={(open) => {
                  if (!open) setGaNoteTaskOpenId(null)
                }}
              >
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create Task from Note</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">This will create a task linked to the GA/KA note.</div>
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input value={gaNoteTaskTitle} onChange={(e) => setGaNoteTaskTitle(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={gaNoteTaskDescription}
                        onChange={(e) => setGaNoteTaskDescription(e.target.value)}
                        rows={4}
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Priority</Label>
                        <Select value={gaNoteTaskPriority} onValueChange={(v) => setGaNoteTaskPriority(v as TaskPriority)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Priority" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NORMAL">Normal</SelectItem>
                            <SelectItem value="HIGH">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Finish by (optional)</Label>
                        <Select
                          value={gaNoteTaskFinishPeriod}
                          onValueChange={(value) =>
                            setGaNoteTaskFinishPeriod(value as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)
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
                          value={gaNoteTaskDueDate}
                          onChange={(e) => setGaNoteTaskDueDate(normalizeDueDateInput(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Assign to</Label>
                      <Select value={gaNoteTaskAssigneeId} onValueChange={setGaNoteTaskAssigneeId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unassigned__">Unassigned</SelectItem>
                          {departmentUsers.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.full_name || member.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setGaNoteTaskOpenId(null)}>
                        Cancel
                      </Button>
                      <Button disabled={creatingGaNoteTask} onClick={() => void submitGaNoteTask()}>
                        {creatingGaNoteTask ? "Creating..." : "Create Task"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
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
                    const linkedTask = gaNoteTaskMap.get(note.id) || null
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
                          <div className="flex flex-wrap items-center gap-2">
                            {linkedTask ? (
                              <Button asChild variant="outline" size="sm">
                                <Link href={`/tasks/${linkedTask.id}?returnTo=${encodeURIComponent(returnToTasks)}`}>
                                  View Task
                                </Link>
                              </Button>
                            ) : canCreate && !isReadOnly && note.status !== "CLOSED" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setGaNoteTaskOpenId(note.id)
                                  setGaNoteTaskTitle(gaNoteTaskDefaultTitle(note.content || ""))
                                  setGaNoteTaskDescription(note.content || "")
                                  setGaNoteTaskPriority(note.priority === "HIGH" ? "HIGH" : "NORMAL")
                                  setGaNoteTaskDueDate("")
                                  setGaNoteTaskAssigneeId("__unassigned__")
                                  setGaNoteTaskFinishPeriod(FINISH_PERIOD_NONE_VALUE)
                                }}
                              >
                                Create Task
                              </Button>
                            ) : null}
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
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={newInternalMeetingItem}
                        onChange={(e) => setNewInternalMeetingItem(e.target.value)}
                        placeholder="Add checklist item..."
                        className="min-w-[220px] flex-1"
                      />
                      <Button
                        variant="outline"
                        disabled={!newInternalMeetingItem.trim() || addingInternalMeetingItem}
                        onClick={() => void addInternalMeetingItem()}
                      >
                        {addingInternalMeetingItem ? "Adding..." : "Add"}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {internalMeetingItems
                        .filter((item) => (item.day || internalSlot) === internalSlot)
                        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                        .map((item, idx) => {
                          const isEditing = editingInternalMeetingItemId === item.id
                          return (
                            <div key={item.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-stone-200/70 bg-white/80 px-3 py-2 dark:border-stone-800/70 dark:bg-stone-900/70">
                              <Checkbox
                                checked={Boolean(item.is_checked)}
                                onCheckedChange={(checked) => toggleInternalMeetingItem(item.id, Boolean(checked))}
                              />
                              <div className="flex-1">
                                {isEditing ? (
                                  <Input
                                    value={editingInternalMeetingItem}
                                    onChange={(e) => setEditingInternalMeetingItem(e.target.value)}
                                    placeholder="Checklist item"
                                  />
                                ) : (
                                  <div className="text-sm text-muted-foreground">
                                    {idx + 1}. {item.title || ""}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {isEditing ? (
                                  <>
                                    <Button size="sm" variant="outline" onClick={() => void saveInternalMeetingItem()}>
                                      Save
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={cancelEditInternalMeetingItem}>
                                      Cancel
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button size="sm" variant="outline" onClick={() => startEditInternalMeetingItem(item)}>
                                      Edit
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-600 border-red-200 hover:bg-red-50"
                                      onClick={() => void deleteInternalMeetingItem(item.id)}
                                    >
                                      Delete
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      {!internalMeetingItems.some((item) => (item.day || internalSlot) === internalSlot) ? (
                        <div className="text-sm text-muted-foreground">No checklist items yet.</div>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          ) : null}

          <Dialog open={showTitleWarning} onOpenChange={setShowTitleWarning}>
            <DialogContent className="sm:max-w-md border-red-200 bg-white shadow-xl">
              <DialogHeader>
                <DialogTitle className="text-slate-900 flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white text-lg shadow-sm">
                    !
                  </span>
                  <span>Confirm Project Title</span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="text-sm text-slate-700">
                  Please confirm the title "<span className="font-semibold text-red-900">{pendingProjectTitle}</span>" is
                  the correct shortcut to use.
                </div>
                {looksLikeFullName(pendingProjectTitle) ? (
                  <div className="text-sm text-red-700 font-semibold">
                    This looks longer than a typical shortcut. Consider shortening it.
                  </div>
                ) : null}
                <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-red-700 mb-2">Remember</div>
                  <div className="text-xs text-red-800 space-y-1">
                    <div>• Use shortcuts/abbreviations (e.g., "ABC" instead of "ABC Company")</div>
                    <div>• Keep it short and simple (typically 2-6 characters)</div>
                    <div>• Avoid company suffixes like "Company", "Inc", "LLC", etc.</div>
                  </div>
                </div>
                <div className="text-sm text-slate-700">Are you sure you want to use this as the project title?</div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowTitleWarning(false)
                    setPendingProjectTitle("")
                  }}
                >
                  Go Back & Edit
                </Button>
                <Button
                  onClick={() => {
                    setShowTitleWarning(false)
                    setPendingProjectTitle("")
                    void submitProject()
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white border-0 shadow-sm"
                >
                  Yes, Use This Title
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <div className="hidden print:block">
        <div className="px-6 py-4">
          <div className="text-center text-sm font-semibold text-slate-700">PrimeFlow</div>
          <div className="mt-4 text-2xl font-bold text-slate-900">Weekly Task Report</div>
          <div className="mt-1 text-sm text-slate-700">
            Department: {departmentDisplayName}
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
      <style jsx global>{`
        @media print {
          body {
            background: white;
          }
          aside {
            display: none !important;
          }
          @page {
            margin: 12mm;
          }
        }
      `}</style>
    </div>
  )
}

