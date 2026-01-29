"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { toast } from "sonner"
import { Pencil, Printer, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { BoldOnlyEditor } from "@/components/bold-only-editor"
import { useAuth } from "@/lib/auth"
import { normalizeDueDateInput } from "@/lib/dates"
import { formatDepartmentName } from "@/lib/department-name"
import type { ChecklistItem, DailyReportResponse, Department, GaNote, Meeting, Project, SystemTaskTemplate, Task, TaskFinishPeriod, TaskPriority, UserLookup } from "@/lib/types"

const TABS = [
  { id: "all", label: "All (Today)", tone: "neutral" },
  { id: "projects", label: "Projects", tone: "neutral" },
  { id: "system", label: "System Tasks", tone: "blue" },
  { id: "no-project", label: "Fast Tasks", tone: "blue" },
  { id: "ga-ka", label: "GA/KA Notes", tone: "neutral" },
  { id: "meetings", label: "Meetings", tone: "neutral" },
] as const

type TabId = (typeof TABS)[number]["id"]

type MicrosoftEvent = {
  id: string
  subject: string | null
  starts_at: string | null
  ends_at: string | null
  location?: string | null
  is_all_day: boolean
  organizer?: string | null
  body_preview?: string | null
}

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
  { id: "personal", label: "Personal", description: "Personal tasks tracked only in this view." },
  { id: "ga", label: "GA", description: "GA tasks that should be tracked separately." },
  { id: "blocked", label: "BLLOK", description: "Blocked all day by a single task." },
  { id: "hourly", label: "1H", description: "Hourly meeting/reporting task." },
  { id: "r1", label: "R1", description: "First case must be discussed with the manager." },
] as const

function hasProjectId(projectId?: Task["project_id"]) {
  if (projectId == null) return false
  if (typeof projectId !== "string") return true
  return projectId.trim().length > 0
}

function isNoProjectTask(task: Task) {
  return !hasProjectId(task.project_id) && task.system_template_origin_id == null
}

function isFastNormalTask(task: Task) {
  return (
    isNoProjectTask(task) &&
    !task.ga_note_origin_id &&
    !task.is_bllok &&
    !task.is_1h_report &&
    !task.is_r1 &&
    !task.is_personal &&
    task.priority === "NORMAL" &&
    task.department_id !== null &&
    task.department_id !== undefined
  )
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

const INTERNAL_MEETING_GROUP_KEY = "development_internal_meetings"

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

function formatMsEventWindow(event: MicrosoftEvent) {
  if (!event.starts_at) return "Time not set"
  const start = new Date(event.starts_at)
  if (Number.isNaN(start.getTime())) return "Time not set"
  const end = event.ends_at ? new Date(event.ends_at) : null
  const dateLabel = start.toLocaleDateString("en-US", { month: "short", day: "2-digit" })
  if (event.is_all_day) return `${dateLabel} - All day`
  const startTime = start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  const endTime =
    end && !Number.isNaN(end.getTime())
      ? end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      : null
  return endTime ? `${dateLabel} ${startTime} - ${endTime}` : `${dateLabel} ${startTime}`
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

function fastSubtypeLabel(task: Task) {
  const base = noProjectTypeLabel(task)
  if (base === "BLLOK") return "BLL"
  if (base === "Personal") return "P"
  return base
}

function systemFrequencyLabel(freq?: string | null) {
  if (!freq) return "-"
  switch (freq) {
    case "DAILY":
      return "Daily"
    case "WEEKLY":
      return "Weekly"
    case "MONTHLY":
      return "Monthly"
    case "3_MONTHS":
      return "Every 3 months"
    case "6_MONTHS":
      return "Every 6 months"
    case "YEARLY":
      return "Yearly"
    default:
      return freq
  }
}

function systemFrequencyShortLabel(freq?: SystemTaskTemplate["frequency"] | string | null) {
  if (!freq) return "-"
  switch (freq) {
    case "DAILY":
      return "D"
    case "WEEKLY":
      return "W"
    case "MONTHLY":
      return "M"
    case "YEARLY":
      return "Y"
    case "3_MONTHS":
      return "3M"
    case "6_MONTHS":
      return "6M"
    default:
      return String(freq)
  }
}

function reportStatusLabel(status?: Task["status"] | null) {
  if (!status) return "-"
  if (status === "IN_PROGRESS") return "In Progress"
  if (status === "TODO") return "To Do"
  if (status === "DONE") return "Done"
  return status
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function dayKey(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function systemFrequencyReportLabel(freq?: SystemTaskTemplate["frequency"] | string | null) {
  if (!freq) return "-"
  switch (freq) {
    case "DAILY":
      return "Daily"
    case "WEEKLY":
      return "Weekly"
    case "MONTHLY":
      return "Monthly"
    case "YEARLY":
      return "Yearly"
    case "3_MONTHS":
      return "3 months"
    case "6_MONTHS":
      return "6 months"
    default:
      return String(freq)
  }
}

function formatSystemOccurrenceStatus(status?: string | null) {
  if (!status) return "-"
  if (status === "NOT_DONE") return "Not Done"
  if (status === "DONE") return "Done"
  if (status === "OPEN") return "Open"
  if (status === "SKIPPED") return "Skipped"
  return status
}

function formatAlignmentTime(value?: string | null) {
  if (!value) return "-"
  const match = String(value).match(/^(\d{2}:\d{2})/)
  return match ? match[1] : String(value)
}

function formatAlignmentUsers(userIds: string[] | null | undefined, userMap: Map<string, UserLookup>) {
  if (!userIds || userIds.length === 0) return "-"
  return userIds
    .map((id) => {
      const user = userMap.get(id)
      return user?.full_name || user?.username || id
    })
    .join(", ")
}

function formatAlignmentInitials(userIds: string[] | null | undefined, userMap: Map<string, UserLookup>) {
  if (!userIds || userIds.length === 0) return "-"
  const values = userIds
    .map((id) => {
      const user = userMap.get(id)
      const label = user?.full_name || user?.username || id
      return initials(label)
    })
    .filter(Boolean)
  if (!values.length) return "-"
  return values.join("/")
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

function fastReportSubtype(task: Task) {
  const base = noProjectTypeLabel(task)
  if (base === "BLLOK") return "BLL"
  if (base === "Personal") return "P"
  if (base === "Normal") return "NORMAL"
  return base
}

function fastReportSubtypeShort(task: Task) {
  const base = noProjectTypeLabel(task)
  if (base === "BLLOK") return "BLL"
  if (base === "Personal") return "P:"
  if (base === "Normal") return "N"
  return base
}

function taskStatusLabel(task: Task) {
  if (task.status) return reportStatusLabel(task.status)
  if (task.completed_at) return "Done"
  return "-"
}

function reportPriorityLabel(priority?: TaskPriority | string | null) {
  if (!priority) return "-"
  return PRIORITY_LABELS[normalizePriority(priority)]
}

function formatMeetingPrintLabel(meeting: Meeting) {
  if (!meeting.starts_at) return meeting.title || "Meeting"
  const date = new Date(meeting.starts_at)
  if (Number.isNaN(date.getTime())) return meeting.title || "Meeting"
  const timeLabel = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  return `${timeLabel} ${meeting.title || "Meeting"}`
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

export default function DepartmentKanban() {
  const departmentName = "Development"
  const { apiFetch, user } = useAuth()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const msParam = searchParams.get("ms")
  const normalizedTab = tabParam === "tasks" ? "no-project" : tabParam
  const isTabId = Boolean(normalizedTab && TABS.some((tab) => tab.id === normalizedTab))
  const returnToTasks = `${pathname}?tab=no-project`
  const printedAt = React.useMemo(() => new Date(), [])
  const printInitials = React.useMemo(
    () => initials(user?.full_name || user?.username || ""),
    [user?.full_name, user?.username]
  )
  const [department, setDepartment] = React.useState<Department | null>(null)
  const [projects, setProjects] = React.useState<Project[]>([])
  const [projectMembers, setProjectMembers] = React.useState<Record<string, UserLookup[]>>({})
  const projectMembersRef = React.useRef<Record<string, UserLookup[]>>({})
  const printContainerRef = React.useRef<HTMLDivElement | null>(null)
  const printMeasureRef = React.useRef<HTMLDivElement | null>(null)
  const [printPageMarkers, setPrintPageMarkers] = React.useState<Array<{ page: number; total: number; top: number }>>([])
  const [printPageMinHeight, setPrintPageMinHeight] = React.useState<number | null>(null)
  const [printTotalPages, setPrintTotalPages] = React.useState<number>(1)
  const [pendingPrint, setPendingPrint] = React.useState(false)
  const [systemTasks, setSystemTasks] = React.useState<SystemTaskTemplate[]>([])
  const [closeTaskDialogOpen, setCloseTaskDialogOpen] = React.useState(false)
  const [taskToCloseId, setTaskToCloseId] = React.useState<string | null>(null)
  const [closeTaskComment, setCloseTaskComment] = React.useState("")
  const [closingTask, setClosingTask] = React.useState(false)
  const [departmentTasks, setDepartmentTasks] = React.useState<Task[]>([])
  const [noProjectTasks, setNoProjectTasks] = React.useState<Task[]>([])
  const [users, setUsers] = React.useState<UserLookup[]>([])
  const [gaNotes, setGaNotes] = React.useState<GaNote[]>([])
  const [meetings, setMeetings] = React.useState<Meeting[]>([])
  const [msConnected, setMsConnected] = React.useState(false)
  const [msEvents, setMsEvents] = React.useState<MicrosoftEvent[]>([])
  const [loadingMsEvents, setLoadingMsEvents] = React.useState(false)
  const [checkingMsStatus, setCheckingMsStatus] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [viewMode, setViewMode] = React.useState<"department" | "mine">("department")
  const [activeTab, setActiveTab] = React.useState<TabId>(
    isTabId ? (normalizedTab as TabId) : "projects"
  )
  const [selectedUserId, setSelectedUserId] = React.useState<string>("__all__")
  const [dailyReport, setDailyReport] = React.useState<DailyReportResponse | null>(null)
  const [loadingDailyReport, setLoadingDailyReport] = React.useState(false)
  const [dailyReportCommentEdits, setDailyReportCommentEdits] = React.useState<Record<string, string>>({})
  const [savingDailyReportComments, setSavingDailyReportComments] = React.useState<Record<string, boolean>>({})
  const [exportingDailyReport, setExportingDailyReport] = React.useState(false)
  const [allUsersDailyReports, setAllUsersDailyReports] = React.useState<Map<string, DailyReportResponse>>(new Map())
  const [loadingAllUsersDailyReports, setLoadingAllUsersDailyReports] = React.useState(false)
  const dailyReportScrollRef = React.useRef<HTMLDivElement | null>(null)
  const dailyReportDragRef = React.useRef({ isDragging: false, startX: 0, startScrollLeft: 0 })
  const [isDraggingDailyReport, setIsDraggingDailyReport] = React.useState(false)
  const [showAllSystem, setShowAllSystem] = React.useState(false)
  const [systemDate, setSystemDate] = React.useState(() => new Date())
  const [showDailyUserReport, setShowDailyUserReport] = React.useState(false)
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
  const departmentCode = React.useMemo(
    () => (department?.code || department?.name || departmentName || "DEV").toUpperCase(),
    [department?.code, department?.name, departmentName]
  )
  const [projectManagerId, setProjectManagerId] = React.useState("__unassigned__")
  const [projectMemberIds, setProjectMemberIds] = React.useState<string[]>([])
  const [selectMembersOpen, setSelectMembersOpen] = React.useState(false)
  const [projectStatus, setProjectStatus] = React.useState("TODO")
  const [projectDueDate, setProjectDueDate] = React.useState("")
  const [deletingProjectId, setDeletingProjectId] = React.useState<string | null>(null)
  const [deletingNoProjectTaskId, setDeletingNoProjectTaskId] = React.useState<string | null>(null)
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null)
  const [editTaskTitle, setEditTaskTitle] = React.useState("")
  const [editTaskDescription, setEditTaskDescription] = React.useState("")
  const [editTaskStartDate, setEditTaskStartDate] = React.useState("")
  const [editTaskDueDate, setEditTaskDueDate] = React.useState("")
  const [editTaskFinishPeriod, setEditTaskFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(FINISH_PERIOD_NONE_VALUE)
  const [updatingTask, setUpdatingTask] = React.useState(false)
  const [showTitleWarning, setShowTitleWarning] = React.useState(false)
  const [pendingProjectTitle, setPendingProjectTitle] = React.useState("")
  const [meetingTitle, setMeetingTitle] = React.useState("")
  const [meetingPlatform, setMeetingPlatform] = React.useState("")
  const [meetingStartsAt, setMeetingStartsAt] = React.useState("")
  const [meetingProjectId, setMeetingProjectId] = React.useState("__none__")
  const [creatingMeeting, setCreatingMeeting] = React.useState(false)
  const [showAddMeetingForm, setShowAddMeetingForm] = React.useState(false)
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
  const [noProjectAssignees, setNoProjectAssignees] = React.useState<string[]>([])
  const [selectNoProjectAssigneesOpen, setSelectNoProjectAssigneesOpen] = React.useState(false)
  const [noProjectStartDate, setNoProjectStartDate] = React.useState("")
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
  const [creatingGaNoteTask, setCreatingGaNoteTask] = React.useState(false)
  const [gaNoteTaskAssigneeId, setGaNoteTaskAssigneeId] = React.useState("__unassigned__")
  const [gaNoteTaskTitle, setGaNoteTaskTitle] = React.useState("")
  const [gaNoteTaskDescription, setGaNoteTaskDescription] = React.useState("")
  const [gaNoteTaskPriority, setGaNoteTaskPriority] = React.useState<TaskPriority>("NORMAL")
  const [gaNoteTaskDueDate, setGaNoteTaskDueDate] = React.useState("")
  const [gaNoteTaskFinishPeriod, setGaNoteTaskFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(
    FINISH_PERIOD_NONE_VALUE
  )
  const [printRange, setPrintRange] = React.useState<"today" | "week">("week")

  React.useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const depRes = await apiFetch("/departments")
        if (!depRes.ok) {
          console.error("Failed to load departments:", depRes.status)
          setLoading(false)
          return
        }
        const deps = (await depRes.json()) as Department[]
        const dep = deps.find((d) => d.name === departmentName) || null
        setDepartment(dep)
        if (!dep) {
          setLoading(false)
          return
        }

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
          const nonSystemTasks = taskRows.filter((t) => !t.system_template_origin_id)
          setDepartmentTasks(nonSystemTasks)
          setNoProjectTasks(nonSystemTasks.filter(isNoProjectTask))
        }
        if (gaRes.ok) setGaNotes((await gaRes.json()) as GaNote[])
        if (meetingsRes.ok) setMeetings((await meetingsRes.json()) as Meeting[])

        const usersRes = await apiFetch("/users/lookup")
        if (usersRes.ok) {
          const us = (await usersRes.json()) as UserLookup[]
          setUsers(us)
        }

        setSystemDepartmentId(dep.id)
      } catch (error) {
        console.error("Error loading department data:", error)
        toast.error("Failed to load department data. Please check if the backend server is running.")
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
    const handleBeforePrint = () => {
      const container = printContainerRef.current
      if (!container) return
      const dpi = 96
      const measuredHeight = printMeasureRef.current?.offsetHeight
      const pageHeightPx = measuredHeight ?? (8.5 * dpi - (0.25 + 0.35) * dpi)
      const footerOffsetPx = 0.2 * dpi
      const totalPages = Math.max(1, Math.ceil(container.scrollHeight / pageHeightPx))
      const markers = Array.from({ length: totalPages }, (_, index) => ({
        page: index + 1,
        total: totalPages,
        top: pageHeightPx * (index + 1) - footerOffsetPx,
      }))
      setPrintPageMarkers(markers)
      setPrintPageMinHeight(totalPages * pageHeightPx)
      setPrintTotalPages(totalPages)
    }
    const handleAfterPrint = () => {
      setPrintPageMarkers([])
      setPrintPageMinHeight(null)
      setPrintTotalPages(1)
    }
    window.addEventListener("beforeprint", handleBeforePrint)
    window.addEventListener("afterprint", handleAfterPrint)
    const mediaQuery = window.matchMedia("print")
    const handleMediaChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        handleBeforePrint()
      } else {
        handleAfterPrint()
      }
    }
    if ("addEventListener" in mediaQuery) {
      mediaQuery.addEventListener("change", handleMediaChange)
    } else {
      mediaQuery.addListener(handleMediaChange)
    }
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint)
      window.removeEventListener("afterprint", handleAfterPrint)
      if ("removeEventListener" in mediaQuery) {
        mediaQuery.removeEventListener("change", handleMediaChange)
      } else {
        mediaQuery.removeListener(handleMediaChange)
      }
    }
  }, [])

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
    if (isTabId) {
      setActiveTab(normalizedTab as TabId)
    }
  }, [isTabId, normalizedTab])

  const userMap = React.useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const departmentUsers = React.useMemo(
    () => (department ? users.filter((u) => u.department_id === department.id) : []),
    [department, users]
  )
  const noProjectAssigneeLabel = React.useMemo(() => {
    if (noProjectAssignees.length === 0) return "Unassigned"
    if (departmentUsers.length && noProjectAssignees.length === departmentUsers.length) return "All team"
    if (noProjectAssignees.length === 1) {
      const selected = departmentUsers.find((u) => u.id === noProjectAssignees[0])
      return selected?.full_name || selected?.username || "1 selected"
    }
    return `${noProjectAssignees.length} selected`
  }, [departmentUsers, noProjectAssignees])
  const todayDate = React.useMemo(() => new Date(), [])
  const todayIso = React.useMemo(() => todayDate.toISOString().slice(0, 10), [todayDate])
  const weekDates = React.useMemo(() => {
    const start = startOfWeekMonday(todayDate)
    return Array.from({ length: 5 }, (_, index) => {
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    })
  }, [todayDate])
  const isMineView = viewMode === "mine" && Boolean(user?.id)
  const filteredProjects = React.useMemo(() => {
    if (viewMode === "mine" && user?.id) {
      return projects.filter((p) => {
        if (p.manager_id === user.id) return true
        const members = projectMembers[p.id] || []
        return members.some((m) => m.id === user.id)
      })
    }
    return projects
  }, [projects, projectMembers, user?.id, viewMode])

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
      // Filter by user if selected
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
      // Filter by user if selected
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
      // Filter by user if selected (GA notes use created_by)
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
  const dailyReportFastTasks = React.useMemo(() => {
    const todayKey = dayKey(todayDate)
    return visibleNoProjectTasks.filter((task) => {
      const baseDate = toDate(task.due_date || task.start_date || task.planned_for || task.created_at)
      const completedDate = task.completed_at ? toDate(task.completed_at) : null
      const completedToday = completedDate ? isSameDay(completedDate, todayDate) : false
      if (completedDate && !completedToday) return false
      if (!baseDate) return completedToday
      const baseKey = dayKey(baseDate)
      return baseKey <= todayKey || completedToday
    })
  }, [todayDate, visibleNoProjectTasks])
  const dailyReportProjectTasks = React.useMemo(() => {
    const todayKey = dayKey(todayDate)
    return projectTasks.filter((task) => {
      const baseDate = toDate(task.due_date || task.start_date || task.created_at)
      const completedDate = task.completed_at ? toDate(task.completed_at) : null
      const completedToday = completedDate ? isSameDay(completedDate, todayDate) : false
      if (completedDate && !completedToday) return false
      if (!baseDate) return completedToday
      const baseKey = dayKey(baseDate)
      return baseKey <= todayKey || completedToday
    })
  }, [projectTasks, todayDate])
  const systemTemplateById = React.useMemo(() => {
    const map = new Map<string, SystemTaskTemplate>()
    for (const tmpl of visibleSystemTemplates) {
      map.set(tmpl.id, tmpl)
      if (tmpl.template_id) {
        map.set(tmpl.template_id, tmpl)
      }
    }
    return map
  }, [visibleSystemTemplates])
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
    const systemAmRows: typeof rows = []
    const systemPmRows: typeof rows = []
    const fastRows: Array<{ order: number; index: number; row: (typeof rows)[number] }> = []
    const projectRows: typeof rows = []
    let fastIndex = 0

    const pushSystemRow = (row: (typeof rows)[number]) => {
      if (row.period === "PM") {
        systemPmRows.push(row)
        return
      }
      systemAmRows.push(row)
    }

    const fastTypeOrder = (task: Task) => {
      const label = noProjectTypeLabel(task)
      if (label === "BLLOK") return 0
      if (label === "1H") return 1
      if (label === "Personal") return 2
      if (label === "R1") return 3
      if (label === "Normal") return 4
      return 5
    }

    const todayTemplateIds = new Set(
      todaySystemTasks.map((tmpl) => tmpl.template_id || tmpl.id)
    )
    const systemTodayByTemplate = new Map<string, DailyReportResponse["system_today"][number]>()
    if (dailyReport?.system_today?.length) {
      for (const occ of dailyReport.system_today) {
        systemTodayByTemplate.set(occ.template_id, occ)
      }
    }
    const overdueByTemplate = new Map<string, DailyReportResponse["system_overdue"][number]>()
    if (dailyReport?.system_overdue?.length) {
      for (const occ of dailyReport.system_overdue) {
        if (todayTemplateIds.has(occ.template_id)) {
          continue
        }
        const existing = overdueByTemplate.get(occ.template_id)
        if (!existing) {
          overdueByTemplate.set(occ.template_id, occ)
          continue
        }
        const existingDate = toDate(existing.occurrence_date)
        const nextDate = toDate(occ.occurrence_date)
        if (!existingDate || (nextDate && dayKey(nextDate) > dayKey(existingDate))) {
          overdueByTemplate.set(occ.template_id, occ)
        }
      }
    }

    for (const occ of overdueByTemplate.values()) {
      const tmpl = systemTemplateById.get(occ.template_id) || null
      const baseDate = toDate(occ.occurrence_date)
      const alignmentEnabled = Boolean(
        tmpl?.requires_alignment ||
        tmpl?.alignment_time ||
        (tmpl?.alignment_user_ids && tmpl.alignment_user_ids.length) ||
        (tmpl?.alignment_roles && tmpl.alignment_roles.length)
      )
      const bzUsers = formatAlignmentUsers(tmpl?.alignment_user_ids, userMap)
      pushSystemRow({
        typeLabel: "SYS",
        subtype: tmpl ? systemFrequencyShortLabel(tmpl.frequency) : "SYS",
        period: resolvePeriod(tmpl?.finish_period ?? null, occ.occurrence_date),
        department: departmentCode,
        title: occ.title || "-",
        description: tmpl?.description || "-",
        status: formatSystemOccurrenceStatus(occ.status),
        bz: alignmentEnabled
          ? bzUsers !== "-"
            ? formatAlignmentInitials(tmpl?.alignment_user_ids, userMap)
            : tmpl?.alignment_roles?.length
              ? tmpl.alignment_roles.join(", ")
            : "-"
          : "-",
        kohaBz: alignmentEnabled ? formatAlignmentTime(tmpl?.alignment_time) : "-",
        tyo: getTyoLabel(baseDate, occ.acted_at, todayDate),
        comment: occ.comment ?? null,
        userInitials: printInitials,
        systemTemplateId: occ.template_id,
        systemOccurrenceDate: occ.occurrence_date,
        systemStatus: occ.status,
      })
    }

    for (const tmpl of todaySystemTasks) {
      const templateId = tmpl.template_id || tmpl.id
      const occ = templateId ? systemTodayByTemplate.get(templateId) : undefined
      const alignmentEnabled = Boolean(
        tmpl.requires_alignment ||
        tmpl.alignment_time ||
        (tmpl.alignment_user_ids && tmpl.alignment_user_ids.length) ||
        (tmpl.alignment_roles && tmpl.alignment_roles.length)
      )
      const bzUsers = formatAlignmentUsers(tmpl.alignment_user_ids, userMap)
      pushSystemRow({
        typeLabel: "SYS",
        subtype: systemFrequencyShortLabel(tmpl.frequency),
        period: resolvePeriod(tmpl.finish_period, todayIso),
        department: departmentCode,
        title: tmpl.title || "-",
        description: tmpl.description || "-",
        status: tmpl.status ? (STATUS_LABELS[tmpl.status] || tmpl.status) : "-",
        bz: alignmentEnabled
          ? bzUsers !== "-"
            ? formatAlignmentInitials(tmpl.alignment_user_ids, userMap)
            : tmpl.alignment_roles?.length
              ? tmpl.alignment_roles.join(", ")
            : "-"
          : "-",
        kohaBz: alignmentEnabled ? formatAlignmentTime(tmpl.alignment_time) : "-",
        tyo: "T",
        comment: occ?.comment ?? null,
        userInitials: printInitials,
        systemTemplateId: templateId,
        systemOccurrenceDate: occ?.occurrence_date || todayIso,
        systemStatus: occ?.status || "OPEN",
      })
    }

    for (const task of dailyReportFastTasks) {
      const baseDate = toDate(task.due_date || task.start_date || task.planned_for || task.created_at)
      fastRows.push({
        order: fastTypeOrder(task),
        index: fastIndex,
        row: {
          typeLabel: "FT",
          subtype: fastReportSubtypeShort(task),
          period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.planned_for || task.created_at),
          department: departmentCode,
          title: task.title || "-",
          description: task.description || "-",
          status: taskStatusLabel(task),
          bz: "-",
          kohaBz: "-",
          tyo: getTyoLabel(baseDate, task.completed_at, todayDate),
          comment: task.user_comment ?? null,
          userInitials: printInitials,
          taskId: task.id,
        },
      })
      fastIndex += 1
    }

    for (const task of dailyReportProjectTasks) {
      const baseDate = toDate(task.due_date || task.start_date || task.created_at)
      const project = task.project_id ? projects.find((p) => p.id === task.project_id) || null : null
      const projectLabel = project?.title || project?.name || "-"
      projectRows.push({
        typeLabel: "PRJK",
        subtype: "-",
        period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at),
        department: departmentCode,
        title: `${projectLabel} - ${task.title || "-"}`,
        description: task.description || "-",
        status: taskStatusLabel(task),
        bz: "-",
        kohaBz: "-",
        tyo: getTyoLabel(baseDate, task.completed_at, todayDate),
        comment: task.user_comment ?? null,
        userInitials: printInitials,
        taskId: task.id,
      })
    }

    fastRows
      .sort((a, b) => a.order - b.order || a.index - b.index)
      .forEach((entry) => rows.push(entry.row))
    rows.push(...systemAmRows)
    rows.push(...projectRows)
    rows.push(...systemPmRows)

    return rows
  }, [
    dailyReport,
    dailyReportFastTasks,
    dailyReportProjectTasks,
    projects,
    systemTemplateById,
    todayDate,
    todayIso,
    todaySystemTasks,
    userMap,
    departmentCode,
    printInitials,
  ])

  // Helper function to convert DailyReportResponse to rows for print view
  const convertDailyReportToRows = React.useCallback(
    (report: DailyReportResponse, userId: string): Array<{
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
      userInitials: string
      taskId?: string
      systemTemplateId?: string
      systemOccurrenceDate?: string
      systemStatus?: string
    }> => {
      const rows: ReturnType<typeof convertDailyReportToRows> = []
      const systemAmRows: typeof rows = []
      const systemPmRows: typeof rows = []
      const fastRows: Array<{ order: number; index: number; row: (typeof rows)[number] }> = []
      const projectRows: typeof rows = []
      let fastIndex = 0
      const reportUser = userMap.get(userId)
      const rowUserInitials = initials(reportUser?.full_name || reportUser?.username || "")

      const pushSystemRow = (row: (typeof rows)[number]) => {
        if (row.period === "PM") {
          systemPmRows.push(row)
          return
        }
        systemAmRows.push(row)
      }

      const fastTypeOrder = (task: Task) => {
        const label = noProjectTypeLabel(task)
        if (label === "BLLOK") return 0
        if (label === "1H") return 1
        if (label === "Personal") return 2
        if (label === "R1") return 3
        if (label === "Normal") return 4
        return 5
      }

      // Process system tasks
      const allSystemOccurrences = [
        ...(report.system_today || []),
        ...(report.system_overdue || []),
      ]
      const systemTodayByTemplate = new Map<string, DailyReportResponse["system_today"][number]>()
      for (const occ of report.system_today || []) {
        systemTodayByTemplate.set(occ.template_id, occ)
      }

      for (const occ of allSystemOccurrences) {
        const tmpl = systemTemplateById.get(occ.template_id) || null
        const baseDate = toDate(occ.occurrence_date)
        if (baseDate && dayKey(baseDate) > dayKey(todayDate)) {
          continue
        }
        const alignmentEnabled = Boolean(
          tmpl?.requires_alignment ||
          tmpl?.alignment_time ||
          (tmpl?.alignment_user_ids && tmpl.alignment_user_ids.length) ||
          (tmpl?.alignment_roles && tmpl.alignment_roles.length)
        )
        const bzUsers = formatAlignmentUsers(tmpl?.alignment_user_ids, userMap)
        pushSystemRow({
          typeLabel: "SYS",
          subtype: tmpl ? systemFrequencyShortLabel(tmpl.frequency) : "SYS",
          period: resolvePeriod(tmpl?.finish_period ?? null, occ.occurrence_date),
          department: departmentCode,
          title: occ.title || "-",
          description: tmpl?.description || "-",
          status: formatSystemOccurrenceStatus(occ.status),
          bz: alignmentEnabled
            ? bzUsers !== "-"
              ? formatAlignmentInitials(tmpl?.alignment_user_ids, userMap)
              : tmpl?.alignment_roles?.length
                ? tmpl.alignment_roles.join(", ")
              : "-"
            : "-",
          kohaBz: alignmentEnabled ? formatAlignmentTime(tmpl?.alignment_time) : "-",
          tyo: getTyoLabel(baseDate, occ.acted_at, todayDate),
          comment: occ.comment ?? null,
          userInitials: rowUserInitials,
          systemTemplateId: occ.template_id,
          systemOccurrenceDate: occ.occurrence_date,
          systemStatus: occ.status,
        })
      }

      // Process tasks from API response
      const allTasks = [
        ...(report.tasks_today || []).map((item) => item.task),
        ...(report.tasks_overdue || []).map((item) => item.task),
      ]

      for (const task of allTasks) {
        const baseDate = toDate(task.due_date || task.start_date || task.created_at)
        if (baseDate && dayKey(baseDate) > dayKey(todayDate)) {
          continue
        }
        const isProject = Boolean(task.project_id)
        const project = task.project_id ? projects.find((p) => p.id === task.project_id) || null : null
        const projectLabel = project?.title || project?.name || "-"

        if (isProject) {
          projectRows.push({
            typeLabel: "PRJK",
            subtype: "-",
            period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at),
            department: departmentCode,
            title: `${projectLabel} - ${task.title || "-"}`,
            description: task.description || "-",
            status: taskStatusLabel(task),
            bz: "-",
            kohaBz: "-",
            tyo: getTyoLabel(baseDate, task.completed_at, todayDate),
            comment: task.user_comment ?? null,
            userInitials: rowUserInitials,
            taskId: task.id,
          })
        } else {
          fastRows.push({
            order: fastTypeOrder(task),
            index: fastIndex,
            row: {
              typeLabel: "FT",
              subtype: fastReportSubtypeShort(task),
              period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at),
              department: departmentCode,
              title: task.title || "-",
              description: task.description || "-",
              status: taskStatusLabel(task),
              bz: "-",
              kohaBz: "-",
              tyo: getTyoLabel(baseDate, task.completed_at, todayDate),
              comment: task.user_comment ?? null,
              userInitials: rowUserInitials,
              taskId: task.id,
            },
          })
          fastIndex += 1
        }
      }

      const tyoRank = (value: string) => {
        const trimmed = value.trim()
        if (!trimmed || trimmed === "-") return 3
        if (trimmed === "Y") return 1
        if (trimmed === "T") return 2
        if (/^\d+$/.test(trimmed)) return 0
        return 3
      }
      const tyoNumber = (value: string) => {
        const trimmed = value.trim()
        return /^\d+$/.test(trimmed) ? Number(trimmed) : -1
      }
      const sortByTyo = (a: (typeof rows)[number], b: (typeof rows)[number]) => {
        const rankA = tyoRank(a.tyo)
        const rankB = tyoRank(b.tyo)
        if (rankA !== rankB) return rankA - rankB
        if (rankA === 0) return tyoNumber(b.tyo) - tyoNumber(a.tyo)
        return 0
      }

      fastRows
        .sort((a, b) => a.order - b.order || sortByTyo(a.row, b.row) || a.index - b.index)
        .forEach((entry) => rows.push(entry.row))
      rows.push(...systemAmRows.sort(sortByTyo))
      rows.push(...projectRows.sort(sortByTyo))
      rows.push(...systemPmRows.sort(sortByTyo))

      return rows
    },
    [departmentCode, projects, systemTemplateById, todayDate, userMap]
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
  const weeklyTaskReportRows = React.useMemo(() => {
    const start = printRange === "today" ? todayDate : weekDates[0]
    const end = printRange === "today" ? todayDate : weekDates[weekDates.length - 1]
    if (!start || !end) return []

    const startKey = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
    const endKey = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime()
    const isInRange = (date: Date | null) => {
      if (!date) return false
      const key = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
      return key >= startKey && key <= endKey
    }

    const rows: {
      typeLabel: string
      subtype: string
      priority: string
      period: string
      title: string
      description: string
      status: string
    }[] = []

    for (const task of projectTasks) {
      const taskDate = toDate(task.due_date || task.start_date || task.created_at)
      if (!isInRange(taskDate)) continue
      const project = task.project_id ? projects.find((p) => p.id === task.project_id) || null : null
      const subtype = project?.title || project?.name || "-"
      rows.push({
        typeLabel: "PRJK",
        subtype,
        priority: reportPriorityLabel(task.priority),
        period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at),
        title: task.title || "-",
        description: task.description || "-",
        status: reportStatusLabel(task.status),
      })
    }

    for (const task of visibleNoProjectTasks) {
      const taskDate = toDate(task.due_date || task.start_date || task.planned_for || task.created_at)
      if (!isInRange(taskDate)) continue
      rows.push({
        typeLabel: "FAST",
        subtype: fastSubtypeLabel(task),
        priority: reportPriorityLabel(task.priority),
        period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at),
        title: task.title || "-",
        description: task.description || "-",
        status: reportStatusLabel(task.status),
      })
    }

    for (const tmpl of visibleSystemTemplates) {
      const occursInRange =
        printRange === "today"
          ? shouldShowTemplate(tmpl, todayDate)
          : weekDates.some((date) => shouldShowTemplate(tmpl, date))
      if (!occursInRange) continue
      rows.push({
        typeLabel: "SYSTEM",
        subtype: systemFrequencyLabel(String(tmpl.frequency || "")),
        priority: reportPriorityLabel(tmpl.priority),
        period: resolvePeriod(tmpl.finish_period, null),
        title: tmpl.title || "-",
        description: tmpl.description || "-",
        status: "-",
      })
    }

    return rows
  }, [
    printRange,
    projectTasks,
    projects,
    todayDate,
    visibleNoProjectTasks,
    visibleSystemTemplates,
    weekDates,
  ])
  const printRangeLabel = React.useMemo(() => {
    if (printRange === "today") {
      const dateLabel = todayDate.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
      return `Today - ${dateLabel}`
    }
    return weekRangeLabel
  }, [printRange, todayDate, weekRangeLabel])

  const allTodayPrintBaseUsers = React.useMemo(() => {
    if (viewMode === "department") {
      if (selectedUserId !== "__all__") {
        const selected = departmentUsers.find((member) => member.id === selectedUserId)
        return selected ? [selected] : []
      }
      return departmentUsers.filter((member) => {
        const username = member.username?.toLowerCase()
        const fullName = member.full_name?.toLowerCase()
        return username !== "admin" && fullName !== "admin"
      })
    }
    if (user) {
      return [
        {
          id: user.id,
          full_name: user.full_name,
          username: user.username,
        },
      ]
    }
    return []
  }, [departmentUsers, selectedUserId, user, viewMode])

  const allTodayPrintItems = React.useMemo(() => {
    const items: Array<{
      userId: string
      period: "AM" | "PM"
      label: string
      category: "PRJK" | "FT" | "SYS" | "EXM" | "GA"
      fastType?: string
    }> = []
    for (const task of todayProjectTasks) {
      const project = task.project_id ? projects.find((p) => p.id === task.project_id) || null : null
      const projectLabel = project?.title || project?.name || "Project"
      const period = resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at)
      const userId = task.assigned_to || task.assigned_to_user_id || task.created_by || "__unassigned__"
      items.push({
        userId,
        period,
        label: `${projectLabel}: ${task.title}`,
        category: "PRJK",
      })
    }
    for (const task of todayNoProjectTasks) {
      const period = resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at)
      const userId = task.assigned_to || task.assigned_to_user_id || task.created_by || "__unassigned__"
      const fastType = noProjectTypeLabel(task)
      items.push({
        userId,
        period,
        label: task.title,
        category: "FT",
        fastType,
      })
    }
    for (const task of todaySystemTasks) {
      const period = resolvePeriod(task.finish_period, task.created_at)
      const userId = task.default_assignee_id || "__unassigned__"
      items.push({
        userId,
        period,
        label: `${task.title || "System task"}`,
        category: "SYS",
      })
    }
    for (const note of todayOpenNotes) {
      const period = periodFromDate(note.created_at)
      const userId = note.created_by || "__unassigned__"
      items.push({
        userId,
        period,
        label: `${note.note_type || "GA"}: ${note.content || "Note"}`,
        category: "GA",
      })
    }
    for (const meeting of todayMeetings) {
      const period = periodFromDate(meeting.starts_at)
      const userId = meeting.created_by || "__unassigned__"
      items.push({
        userId,
        period,
        label: `${formatMeetingPrintLabel(meeting)}`,
        category: "EXM",
      })
    }
    return items
  }, [projects, todayMeetings, todayNoProjectTasks, todayOpenNotes, todayProjectTasks, todaySystemTasks])

  const allTodayPrintHasUnassigned = React.useMemo(
    () => allTodayPrintItems.some((item) => item.userId === "__unassigned__"),
    [allTodayPrintItems]
  )

  const allTodayPrintColumns = React.useMemo(() => {
    const baseIds = new Set(allTodayPrintBaseUsers.map((member) => member.id))
    const extraIds = Array.from(
      new Set(
        allTodayPrintItems
          .map((item) => item.userId)
          .filter((userId) => userId !== "__unassigned__" && !baseIds.has(userId))
      )
    )
    const extraColumns = extraIds
      .map((userId) => {
        const user = userMap.get(userId)
        return {
          id: userId,
          label: user?.full_name || user?.username || "Unknown",
        }
      })
      .filter((column) => {
        if (column.label === "Unknown") return false
        const label = column.label.toLowerCase()
        return label !== "admin"
      })
    const columns = allTodayPrintBaseUsers.map((member) => ({
      id: member.id,
      label: member.full_name || member.username || "-",
    }))
      .concat(extraColumns)
    if (allTodayPrintHasUnassigned) {
      columns.push({ id: "__unassigned__", label: "Unassigned" })
    }
    return columns
  }, [allTodayPrintBaseUsers, allTodayPrintHasUnassigned, allTodayPrintItems, userMap])

  const allTodayPrintByUser = React.useMemo(() => {
    const categories = ["PRJK", "FT", "SYS", "EXM", "GA"] as const
    const map = new Map<
      string,
      Record<string, Array<{ period: "AM" | "PM"; label: string; fastType?: string }>>
    >()
    const ensure = (userId: string) => {
      if (!map.has(userId)) {
        const emptyBuckets = categories.reduce<
          Record<string, Array<{ period: "AM" | "PM"; label: string; fastType?: string }>>
        >(
          (acc, category) => {
            acc[category] = []
            return acc
          },
          {}
        )
        map.set(userId, { ...emptyBuckets })
      }
      return map.get(userId)!
    }
    for (const column of allTodayPrintColumns) {
      ensure(column.id)
    }
    for (const item of allTodayPrintItems) {
      const bucket = ensure(item.userId)
      bucket[item.category].push({ period: item.period, label: item.label, fastType: item.fastType })
    }
    for (const bucket of map.values()) {
      for (const category of categories) {
        bucket[category].sort((a, b) => a.label.localeCompare(b.label))
      }
    }
    return map
  }, [allTodayPrintColumns, allTodayPrintItems])

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
  const showAllTodayPrint = activeTab === "all" && viewMode === "department"

  // Daily Report (overdue) for All Today (department view) and My View (current user).
  React.useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (activeTab !== "all") {
        setDailyReport(null)
        return
      }
      const targetUserId =
        viewMode === "department" ? (selectedUserId !== "__all__" ? selectedUserId : null) : user?.id
      if (!department?.id || !targetUserId) {
        setDailyReport(null)
        return
      }
      setLoadingDailyReport(true)
      try {
        const qs = new URLSearchParams({
          day: todayIso,
          department_id: department.id,
          user_id: targetUserId,
        })
        const res = await apiFetch(`/reports/daily?${qs.toString()}`)
        if (!res.ok) {
          setDailyReport(null)
          return
        }
        const payload = (await res.json()) as DailyReportResponse
        if (!cancelled) setDailyReport(payload)
      } catch {
        if (!cancelled) setDailyReport(null)
      } finally {
        if (!cancelled) setLoadingDailyReport(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [activeTab, apiFetch, department?.id, selectedUserId, todayIso, user?.id, viewMode])

  // Fetch daily reports for all users when showing All Today print view
  React.useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!showAllTodayPrint || !department?.id || allTodayPrintBaseUsers.length === 0) {
        setAllUsersDailyReports(new Map())
        setLoadingAllUsersDailyReports(false)
        return
      }
      setLoadingAllUsersDailyReports(true)
      try {
        const reportsMap = new Map<string, DailyReportResponse>()
        await Promise.all(
          allTodayPrintBaseUsers.map(async (member) => {
            try {
              const qs = new URLSearchParams({
                day: todayIso,
                department_id: department.id,
                user_id: member.id,
              })
              const res = await apiFetch(`/reports/daily?${qs.toString()}`)
              if (res.ok && !cancelled) {
                const payload = (await res.json()) as DailyReportResponse
                reportsMap.set(member.id, payload)
              }
            } catch {
              // Ignore errors for individual users
            }
          })
        )
        if (!cancelled) {
          setAllUsersDailyReports(reportsMap)
        }
      } catch {
        if (!cancelled) {
          setAllUsersDailyReports(new Map())
        }
      } finally {
        if (!cancelled) {
          setLoadingAllUsersDailyReports(false)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [showAllTodayPrint, department?.id, allTodayPrintBaseUsers, todayIso, apiFetch])

  const handlePrint = React.useCallback(() => {
    if (showAllTodayPrint && loadingAllUsersDailyReports) {
      setPendingPrint(true)
      return
    }
    window.print()
  }, [loadingAllUsersDailyReports, showAllTodayPrint])

  React.useEffect(() => {
    if (!pendingPrint) return
    if (loadingAllUsersDailyReports) return
    if (!showAllTodayPrint) {
      setPendingPrint(false)
      return
    }
    setPendingPrint(false)
    const timer = window.setTimeout(() => window.print(), 0)
    return () => window.clearTimeout(timer)
  }, [loadingAllUsersDailyReports, pendingPrint, showAllTodayPrint])

  const canCreate = user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "STAFF"
  const isReadOnly = viewMode === "mine"
  const canManage = canCreate && !isReadOnly
  const showSystemActions = viewMode === "mine"
  const canDeleteProjects = user?.role === "ADMIN" && !isReadOnly
  const canDeleteNoProject = user?.role === "ADMIN" && !isReadOnly
  const allTodayPrintCategories = React.useMemo(
    () => [
      { id: "PRJK", label: "PRJK" },
      { id: "FT", label: "FT" },
      { id: "SYS", label: "SYS" },
      { id: "EXM", label: "EXM" },
      { id: "GA", label: "GA" },
    ],
    []
  )

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

  const statusRows = [
    {
      id: "blocked",
      title: "BLLOK",
      count: noProjectBuckets.blocked.length,
      items: noProjectBuckets.blocked,
      headerBg: "bg-white",
      headerText: "text-slate-700",
      badgeClass: "bg-white text-red-600 border border-red-200",
      borderClass: "border-red-500",
      itemBadge: "BLLOK",
      itemBadgeClass: "bg-white text-red-600 border-red-200",
    },
    {
      id: "one-hour",
      title: "1H TASKS",
      count: noProjectBuckets.oneHour.length,
      items: noProjectBuckets.oneHour,
      headerBg: "bg-white",
      headerText: "text-slate-700",
      badgeClass: "bg-white text-indigo-600 border border-indigo-200",
      borderClass: "border-indigo-500",
      itemBadge: "1H",
      itemBadgeClass: "bg-white text-indigo-600 border-indigo-200",
    },
    {
      id: "r1",
      title: "R1",
      count: noProjectBuckets.r1.length,
      items: noProjectBuckets.r1,
      headerBg: "bg-white",
      headerText: "text-slate-700",
      badgeClass: "bg-white text-emerald-600 border border-emerald-200",
      borderClass: "border-emerald-500",
      itemBadge: "R1",
      itemBadgeClass: "bg-white text-emerald-600 border-emerald-200",
    },
    {
      id: "ga",
      title: "GA TASKS",
      count: noProjectBuckets.ga.length,
      items: noProjectBuckets.ga,
      headerBg: "bg-white",
      headerText: "text-slate-700",
      badgeClass: "bg-white text-sky-600 border border-slate-200",
      borderClass: "border-sky-500",
      itemBadge: "GA",
      itemBadgeClass: "bg-white text-sky-600 border-slate-200",
    },
    {
      id: "personal",
      title: "PERSONAL",
      count: noProjectBuckets.personal.length,
      items: noProjectBuckets.personal,
      headerBg: "bg-white",
      headerText: "text-slate-700",
      badgeClass: "bg-white text-purple-600 border border-purple-200",
      borderClass: "border-purple-500",
      itemBadge: "Personal",
      itemBadgeClass: "bg-white text-purple-600 border-purple-200",
    },
    {
      id: "normal",
      title: "NORMAL",
      count: noProjectBuckets.normal.length,
      items: noProjectBuckets.normal,
      headerBg: "bg-white",
      headerText: "text-slate-700",
      badgeClass: "bg-white text-blue-600 border border-slate-200",
      borderClass: "border-blue-500",
      itemBadge: "Normal",
      itemBadgeClass: "bg-white text-blue-600 border-slate-200",
    },
  ] as const

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

  const handleCloseTaskClick = (taskId: string) => {
    setTaskToCloseId(taskId)
    setCloseTaskComment("")
    setCloseTaskDialogOpen(true)
  }

  const confirmCloseTask = async () => {
    if (!taskToCloseId) return

    if (!closeTaskComment.trim()) {
      toast.error("Comment is required to close this task")
      return
    }

    setClosingTask(true)
    try {
      const commentRes = await apiFetch(`/tasks/${taskToCloseId}/comment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: closeTaskComment.trim() }),
      })
      if (!commentRes.ok) {
        const data = await commentRes.json()
        toast.error(data.detail || "Failed to save comment")
        setClosingTask(false)
        return
      }

      // Close the task
      const res = await apiFetch(`/tasks/${taskToCloseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      })
      if (!res.ok) {
        toast.error("Failed to close system task")
        setClosingTask(false)
        return
      }
      
      // Reload system tasks
      const sysRes = await apiFetch(`/system-tasks?department_id=${department?.id || ""}`)
      if (sysRes.ok) {
        setSystemTasks((await sysRes.json()) as SystemTaskTemplate[])
      }
      
      setCloseTaskDialogOpen(false)
      setTaskToCloseId(null)
      setCloseTaskComment("")
      toast.success("Task closed successfully")
    } catch (err) {
      console.error("Failed to close task", err)
      toast.error("Failed to close task")
    } finally {
      setClosingTask(false)
    }
  }

  const updateTaskCommentState = (taskId: string, comment: string | null) => {
    setDepartmentTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, user_comment: comment } : task))
    )
    setNoProjectTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, user_comment: comment } : task))
    )
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
    if (!department?.id || !user?.id) return
    setExportingDailyReport(true)
    try {
      const qs = new URLSearchParams({
        day: todayIso,
        department_id: department.id,
        user_id: user.id,
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
      const disposition = res.headers.get("Content-Disposition")
      const match = disposition?.match(/filename=\"?([^\";]+)\"?/i)
      if (match?.[1]) {
        link.download = match[1]
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

  const exportAllTodayReport = async () => {
    if (!department?.id) return
    setExportingDailyReport(true)
    try {
      const qs = new URLSearchParams({
        day: todayIso,
        department_id: department.id,
      })
      if (selectedUserId && selectedUserId !== "__all__") {
        qs.set("user_id", selectedUserId)
      } else {
        qs.set("all_users", "true")
      }
      const res = await apiFetch(`/exports/daily-report.xlsx?${qs.toString()}`)
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

  const looksLikeFullName = (title: string): boolean => {
    const trimmed = title.trim()
    if (!trimmed) return false
    const upper = trimmed.toUpperCase()

    // Check for common company suffixes
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

    // Check for multiple words or long titles (shortcuts should be short).
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length
    const isTooLong = upper.length > 6

    return hasCompanyWord || wordCount > 1 || isTooLong
  }

  const handleProjectTitleChange = (value: string) => {
    const upperValue = value.toUpperCase()
    setProjectTitle(upperValue)
  }

  const attemptSubmitProject = () => {
    const trimmedTitle = projectTitle.trim()
    if (!trimmedTitle || !department) return

    setPendingProjectTitle(trimmedTitle)
    setShowTitleWarning(true)
  }

  const submitProject = async () => {
    if (!projectTitle.trim() || !department) return
    setCreatingProject(true)
    try {
      const payload = {
        title: projectTitle.trim(),
        description: projectDescription.trim() || null,
        department_id: department.id,
        manager_id: projectMemberIds.length > 0 ? projectMemberIds[0] : (projectManagerId === "__unassigned__" ? null : projectManagerId),
        status: projectStatus,
      }
      
      // Add due_date if provided
      if (projectDueDate.trim()) {
        const normalized = normalizeDueDateInput(projectDueDate.trim())
        if (normalized) {
          payload.due_date = new Date(normalized).toISOString()
        }
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
          if (Array.isArray(data)) {
            detail = data.map(e => `${e.loc.join('.')}: ${e.msg}`).join(', ')
          } else if (data?.detail) {
            detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
          }
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
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
            setProjectMembers((prev) => ({ ...prev, [created.id]: members }))
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
      setProjectDescription("")
      setProjectManagerId("__unassigned__")
      setProjectMemberIds([])
      setProjectMemberIds([])
      setProjectStatus("TODO")
      setProjectDueDate("")
      toast.success("Project created")
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
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
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

  const startEditTask = (task: Task) => {
    setEditingTaskId(task.id)
    setEditTaskTitle(task.title || "")
    setEditTaskDescription(task.description || "")
    setEditTaskStartDate(task.start_date ? new Date(task.start_date).toISOString().split("T")[0] : "")
    setEditTaskDueDate(task.due_date ? new Date(task.due_date).toISOString().split("T")[0] : "")
    setEditTaskFinishPeriod(task.finish_period || FINISH_PERIOD_NONE_VALUE)
  }

  const cancelEditTask = () => {
    setEditingTaskId(null)
    setEditTaskTitle("")
    setEditTaskDescription("")
    setEditTaskStartDate("")
    setEditTaskDueDate("")
    setEditTaskFinishPeriod(FINISH_PERIOD_NONE_VALUE)
  }

  const updateNoProjectTask = async () => {
    if (!editingTaskId || !editTaskTitle.trim() || !editTaskStartDate) return
    setUpdatingTask(true)
    try {
      const startDateValue = editTaskStartDate ? new Date(editTaskStartDate).toISOString() : null
      const dueDateValue = editTaskDueDate ? new Date(editTaskDueDate).toISOString() : null
      const res = await apiFetch(`/tasks/${editingTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTaskTitle.trim(),
          description: editTaskDescription.trim() || null,
          start_date: startDateValue,
          due_date: dueDateValue,
          finish_period: editTaskFinishPeriod === FINISH_PERIOD_NONE_VALUE ? null : editTaskFinishPeriod,
        }),
      })
      if (!res.ok) {
        let detail = "Failed to update task"
        try {
          const data = (await res.json()) as { detail?: string }
          if (typeof data?.detail === "string") detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const updated = (await res.json()) as Task
      setDepartmentTasks((prev) => prev.map((t) => (t.id === editingTaskId ? updated : t)))
      setNoProjectTasks((prev) => prev.map((t) => (t.id === editingTaskId ? updated : t)))
      cancelEditTask()
      toast.success("Task updated")
    } finally {
      setUpdatingTask(false)
    }
  }

  const submitNoProjectTask = async () => {
    if (!noProjectTitle.trim() || !noProjectStartDate || !department) return
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
      const startDate = noProjectStartDate ? new Date(noProjectStartDate).toISOString() : null
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
          start_date: startDate,
          due_date: dueDate,
        }
      const assigneeIds = noProjectAssignees.length ? noProjectAssignees : [null]

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
        const created = (await res.json()) as Task
        // Ensure boolean fields are explicitly set (backend might return undefined)
        // Explicitly set all boolean fields based on task type to ensure proper categorization
        created.is_bllok = noProjectType === "blocked" ? true : (created.is_bllok ?? false)
        created.is_1h_report = noProjectType === "hourly" ? true : (created.is_1h_report ?? false)
        created.is_r1 = noProjectType === "r1" ? true : (created.is_r1 ?? false)
        created.is_personal = noProjectType === "personal" ? true : (created.is_personal ?? false)
        if (noProjectType === "normal") {
          created.ga_note_origin_id = created.ga_note_origin_id || null
          created.priority = created.priority || "NORMAL"
        }
        createdTasks.push(created)
      }
      if (createdTasks.length) {
        // Add all non-project tasks to noProjectTasks (they'll be categorized into buckets)
        const nonProjectTasks = createdTasks.filter(isNoProjectTask)
        if (nonProjectTasks.length) {
          setNoProjectTasks((prev) => [...nonProjectTasks, ...prev])
        }
        setDepartmentTasks((prev) => [...createdTasks, ...prev])
      }
      setNoProjectOpen(false)
      setNoProjectTitle("")
      setNoProjectDescription("")
      setNoProjectType("normal")
      setNoProjectAssignees([])
      setNoProjectStartDate("")
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
      setShowAddMeetingForm(false)
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

  const loadMicrosoftStatus = React.useCallback(async () => {
    setCheckingMsStatus(true)
    try {
      const res = await apiFetch("/microsoft/status")
      if (!res.ok) {
        setMsConnected(false)
        return
      }
      const data = (await res.json()) as { connected?: boolean }
      setMsConnected(Boolean(data.connected))
    } finally {
      setCheckingMsStatus(false)
    }
  }, [apiFetch])

  const connectMicrosoft = async () => {
    const redirectTo = `${window.location.origin}${pathname}?tab=meetings`
    const res = await apiFetch(`/microsoft/authorize-url?redirect_to=${encodeURIComponent(redirectTo)}`)
    if (!res.ok) {
      toast.error("Unable to start Microsoft auth")
      return
    }
    const data = (await res.json()) as { url?: string }
    if (data.url) {
      window.location.href = data.url
    } else {
      toast.error("Missing Microsoft auth URL")
    }
  }

  const disconnectMicrosoft = async () => {
    const res = await apiFetch("/microsoft/disconnect", { method: "DELETE" })
    if (!res.ok) {
      toast.error("Failed to disconnect Microsoft calendar")
      return
    }
    setMsConnected(false)
    setMsEvents([])
  }

  const loadMicrosoftEvents = React.useCallback(async () => {
    if (!msConnected) return
    setLoadingMsEvents(true)
    try {
      const start = new Date()
      const end = new Date(start)
      end.setDate(end.getDate() + 30)
      const res = await apiFetch(
        `/microsoft/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`
      )
      if (!res.ok) {
        toast.error("Failed to load Microsoft events")
        return
      }
      const data = (await res.json()) as MicrosoftEvent[]
      setMsEvents(data)
    } finally {
      setLoadingMsEvents(false)
    }
  }, [apiFetch, msConnected])

  React.useEffect(() => {
    if (activeTab !== "meetings") return
    void loadMicrosoftStatus()
  }, [activeTab, loadMicrosoftStatus])

  React.useEffect(() => {
    if (msParam === "connected") {
      toast.success("Microsoft calendar connected")
      void loadMicrosoftStatus()
    }
  }, [msParam, loadMicrosoftStatus])

  React.useEffect(() => {
    if (!msConnected || activeTab !== "meetings") return
    void loadMicrosoftEvents()
  }, [msConnected, activeTab, loadMicrosoftEvents])

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
          // Add to noProjectTasks if it's a non-project task (will be categorized into buckets)
          if (isNoProjectTask(createdTask)) {
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
      // Add to noProjectTasks if it's a non-project task (will be categorized into buckets)
      if (isNoProjectTask(createdTask)) {
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

  if (loading)
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-slate-400 border-r-transparent"></div>
          <div className="mt-4 text-sm text-slate-600">Loading department...</div>
        </div>
      </div>
    )
  if (!department)
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-600">Department not found.</div>
      </div>
    )

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
    <div className="min-h-screen">
      <div className="sticky top-0 z-[100] print:hidden ">
        <div className="relative overflow-hidden rounded-[1.5rem] sm:rounded-[2.25rem] border border-stone-200/70 bg-gradient-to-br from-amber-50 via-rose-50 to-stone-50 p-4 sm:p-6 shadow-lg dark:border-stone-800/70 dark:from-stone-950 dark:via-stone-950 dark:to-rose-950">
          <div className="pointer-events-none absolute -top-24 right-0 h-56 w-56 rounded-full bg-amber-200/40 blur-3xl dark:bg-amber-900/30" />
          <div className="pointer-events-none absolute -bottom-24 left-0 h-56 w-56 rounded-full bg-rose-200/35 blur-3xl dark:bg-rose-900/20" />
          <div className="relative space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-[0.25em] text-stone-500 dark:text-stone-400">
                  Department
                </div>
                <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                  {departmentName}
                </div>
                <div className="text-sm text-stone-600 dark:text-stone-400">Manage projects and daily tasks.</div>
              </div>
              <div className="inline-flex rounded-full border border-stone-200/70 bg-white p-1 shadow-sm dark:border-stone-800/70 dark:bg-stone-950 w-full sm:w-auto justify-center">
                <button
                  type="button"
                  onClick={() => setViewMode("department")}
                  className={[
                    "rounded-full px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors flex-1 sm:flex-none",
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
                    "rounded-full px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors flex-1 sm:flex-none",
                    viewMode === "mine"
                      ? "bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-900"
                      : "text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200",
                  ].join(" ")}
                >
                  My View
                </button>
              </div>
            </div>

            <div className="rounded-xl sm:rounded-2xl border border-stone-200/70 bg-white p-0.5 sm:p-1 shadow-sm dark:border-stone-800/70 dark:bg-stone-950">
              <div className="flex flex-nowrap sm:flex-wrap gap-1 sm:gap-1.5 md:gap-2 overflow-x-auto pb-1 sm:pb-0 -mx-0.5 sm:mx-0 px-0.5 sm:px-0">
                {TABS.map((tab) => {
                  const isActive = tab.id === activeTab
                  const badgeTone =
                    tab.tone === "blue"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
                      : tab.tone === "red"
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200"
                        : "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-200"
                  const badgeClass = isActive
                    ? "bg-white text-stone-900 dark:bg-stone-100 dark:text-stone-900"
                    : badgeTone
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={[
                        "relative flex items-center gap-1.5 sm:gap-2 rounded-full px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition-colors",
                        isActive
                          ? "bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-900"
                          : "text-stone-600 hover:text-stone-900 hover:bg-white/80 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:bg-stone-900/40",
                      ].join(" ")}
                    >
                      <span className="uppercase tracking-wide whitespace-nowrap">{tab.label}</span>
                      <span className={`rounded-full px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs ${badgeClass}`}>{counts[tab.id]}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="px-4 sm:px-6 pb-4 sm:pb-6 print:hidden">
        {activeTab === "projects" ? (
            <div className="mb-4 sm:mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-lg sm:text-xl font-semibold text-slate-800">Active Projects</div>
              {canManage ? (
                <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-slate-900 hover:bg-slate-800 text-white border-0 shadow-sm rounded-xl px-4 sm:px-6 w-full sm:w-auto">
                      + New Project
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-2xl bg-white border-slate-200 rounded-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-slate-800">Add Project</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2 md:col-span-2">
                        <Label className="text-slate-700">Title</Label>
                        <Input
                          value={projectTitle}
                          onChange={(e) => handleProjectTitleChange(e.target.value)}
                          className="border-slate-200 focus:border-slate-400 rounded-xl uppercase placeholder:normal-case"
                          placeholder="Enter project shortcut (e.g., ABC, XYZ)"
                          style={{ textTransform: 'uppercase' }}
                        />
                        <div className="text-xs text-slate-600 flex items-center gap-1.5">
                          <span className="text-slate-500">i</span>
                          <span>Use a shortcut/abbreviation, not the full client name (e.g., "ABC" instead of "ABC Company")</span>
                        </div>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label className="text-slate-700">Description</Label>
                        <Textarea
                          value={projectDescription}
                          onChange={(e) => setProjectDescription(e.target.value)}
                          placeholder="Enter the project description..."
                          className="border-slate-200 focus:border-slate-400 rounded-xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-700">Members</Label>
                        <Dialog open={selectMembersOpen} onOpenChange={setSelectMembersOpen}>
                          <DialogTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full justify-start border-slate-200 focus:border-slate-400 rounded-xl"
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
                          <div className="text-xs text-slate-600">
                            {projectMemberIds.length} member{projectMemberIds.length === 1 ? "" : "s"} selected
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-700">Due Date</Label>
                          <Input
                            type="date"
                            value={projectDueDate}
                            onChange={(e) => setProjectDueDate(e.target.value)}
                            placeholder="Select due date"
                            className="border-slate-200 focus:border-slate-400 rounded-xl"
                          />
                        </div>
                      <div className="flex justify-end gap-2 md:col-span-2">
                        <Button variant="outline" onClick={() => setCreateProjectOpen(false)} className="rounded-xl border-slate-200">
                          Cancel
                        </Button>
                        <Button disabled={!projectTitle.trim() || creatingProject} onClick={attemptSubmitProject} className="bg-slate-900 hover:bg-slate-800 text-white border-0 shadow-sm rounded-xl">
                          {creatingProject ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : null}
              </div>
            </div>
          ) : null}

        {activeTab === "projects" ? (
          <div className="space-y-4 sm:space-y-6">
            <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
              {filteredProjects.map((project) => {
                const manager = project.manager_id ? userMap.get(project.manager_id) : null
                const membersForProject = projectMembers[project.id] || []
                const combinedMembers = manager ? [...membersForProject, manager] : membersForProject
                const uniqueMembers = Array.from(new Map(combinedMembers.map((m) => [m.id, m])).values())
                const visibleMembers = uniqueMembers.slice(0, 4)
                const remainingMembers = uniqueMembers.length - visibleMembers.length
                const phase = project.current_phase || "MEETINGS"
                return (
                  <Link key={project.id} href={`/projects/${project.id}`} className="group block">
                    <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl p-4 sm:p-5 transition-all hover:shadow-md hover:-translate-y-0.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                          <div className="h-3 w-3 rounded-full bg-slate-400 mt-2 flex-shrink-0"></div>
                          <div className="min-w-0 flex-1">
                            <div className="text-base sm:text-lg font-semibold text-slate-800 truncate">{project.title || project.name}</div>
                            <div className="mt-1 text-xs sm:text-sm text-slate-600 line-clamp-2">
                              {project.description
                                ? project.description.split(".").slice(0, 3).join(".").trim() + (project.description.includes(".") ? "." : "")
                                : "-"}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          {canDeleteProjects ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={deletingProjectId === project.id}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                void deleteProject(project.id)
                              }}
                              className="h-7 rounded-full border-red-200 px-2 sm:px-3 text-xs text-red-600 hover:bg-red-50"
                            >
                              {deletingProjectId === project.id ? "Deleting..." : "Delete"}
                            </Button>
                          ) : null}
                          <Badge className="bg-slate-100 text-slate-700 border border-slate-200 text-xs whitespace-nowrap">
                            {PHASE_LABELS[phase] || "Meetings"}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-3 sm:mt-4 text-xs text-slate-600 overflow-x-auto">
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          {PHASES.map((p, idx) => {
                            const isCurrent = p === phase
                            return (
                              <span key={p}>
                                <span className={isCurrent ? "text-slate-800 font-semibold" : ""}>
                                  {PHASE_LABELS[p]}
                                </span>
                                {idx < PHASES.length - 1 ? " > " : ""}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                      <div className="mt-3 sm:mt-4 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {visibleMembers.length ? (
                            <div className="flex -space-x-2">
                              {visibleMembers.map((member) => (
                                <div
                                  key={member.id}
                                  title={member.full_name || member.username || "-"}
                                  className="h-7 w-7 sm:h-8 sm:w-8 rounded-full border-2 border-white bg-slate-100 text-[10px] sm:text-xs font-semibold text-slate-600 flex items-center justify-center shadow-sm"
                                >
                                  {initials(member.full_name || member.username || "-")}
                                </div>
                              ))}
                              {remainingMembers > 0 ? (
                                <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full border-2 border-white bg-slate-100 text-[10px] font-semibold text-slate-600 flex items-center justify-center shadow-sm">
                                  +{remainingMembers}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-slate-100 text-xs font-semibold text-slate-500 flex items-center justify-center">
                              -
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs sm:text-sm font-semibold text-slate-600 transition-colors group-hover:text-slate-800 group-hover:underline whitespace-nowrap">
                            View details -&gt;
                          </span>
                        </div>
                      </div>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </div>
        ) : null}

        {activeTab === "all" ? (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800">
                  {viewMode === "department" ? "All (Today) - Department" : "All (Today)"}
                </div>
                <div className="text-xs sm:text-sm text-slate-600 mt-1">
                  {viewMode === "department"
                    ? "All of today's tasks for the department team."
                    : "All of today's tasks, organized in one place."}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-xl border border-slate-200 bg-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-slate-600 shadow-sm">
                  {formatToday()}
                </div>
                {viewMode === "department" ? (
                  <>
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger className="h-8 sm:h-9 w-full sm:w-48 border-slate-200 focus:border-slate-400 rounded-xl text-xs sm:text-sm">
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
                    <Button
                      variant="outline"
                      className="h-8 sm:h-9 rounded-xl border-slate-300 bg-white px-2 sm:px-3 text-xs sm:text-sm text-slate-900 shadow-sm hover:bg-slate-50 flex-1 sm:flex-none"
                      onClick={handlePrint}
                    >
                      <Printer className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                      Print
                    </Button>
                    <Button
                      variant="outline"
                      className="h-8 sm:h-9 rounded-xl border-slate-300 bg-white px-2 sm:px-3 text-xs sm:text-sm text-slate-900 shadow-sm hover:bg-slate-50 flex-1 sm:flex-none"
                      onClick={exportAllTodayReport}
                      disabled={exportingDailyReport}
                    >
                      {exportingDailyReport ? "Exporting..." : "Export Excel"}
                    </Button>
                  </>
                ) : null}
                  {viewMode === "mine" ? (
                    <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-sm">
                      <Button
                        variant="outline"
                        className="h-8 rounded-lg border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm hover:bg-slate-50"
                        onClick={() =>
                          setShowDailyUserReport((prev) => {
                            const next = !prev
                            if (next) setPrintRange("today")
                            return next
                          })
                        }
                      >
                        {showDailyUserReport ? "Hide Daily Report" : "Daily Report"}
                      </Button>
                      <span className="text-[11px] font-semibold uppercase text-slate-500">Print range</span>
                      <Select value={printRange} onValueChange={(value) => setPrintRange(value as "today" | "week")}>
                        <SelectTrigger className="h-8 w-28 border-0 shadow-none focus:border-transparent focus:ring-0">
                          <SelectValue placeholder="Today" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="today">Today</SelectItem>
                        </SelectContent>
                      </Select>
                    <Button
                      variant="outline"
                      className="h-8 rounded-lg border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm hover:bg-slate-50"
                      onClick={handlePrint}
                    >
                      <Printer className="mr-2 h-4 w-4" />
                      Print
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              {[
                { label: "PROJECT TASKS", value: todayProjectTasks.length, color: "sky" },
                { label: "GA NOTES", value: todayOpenNotes.length, color: "sky" },
                { label: "FAST TASKS", value: todayNoProjectTasks.length, color: "blue" },
                { label: "SYSTEM TASKS", value: todaySystemTasks.length, color: "blue" },
              ].map((stat) => (
                <Card key={stat.label} className="bg-white border border-slate-200 shadow-sm rounded-2xl p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stat.label}</div>
                  <div className="mt-2 text-3xl font-bold text-slate-900">{stat.value}</div>
                </Card>
              ))}
            </div>

            {viewMode === "mine" && showDailyUserReport ? (
              <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Daily Report</div>
                    <div className="text-xs text-slate-500 mt-1">
                      System, fast, and project tasks for today.
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {loadingDailyReport ? <div className="text-xs text-slate-500">Loading...</div> : null}
                    <Button
                      variant="outline"
                      className="h-8 rounded-lg border-slate-300 bg-white px-3 text-xs text-slate-900 shadow-sm hover:bg-slate-50"
                      disabled={exportingDailyReport}
                      onClick={() => void exportDailyReport()}
                    >
                      {exportingDailyReport ? "Exporting..." : "Export Excel"}
                    </Button>
                  </div>
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
                      <col className="w-[28px]" />
                      <col className="w-[32px]" />
                      <col className="w-[32px]" />
                      <col className="w-[36px]" />
                      <col className="w-[150px]" />
                      <col className="w-[48px]" />
                      <col className="w-[32px]" />
                      <col className="w-[48px]" />
                      <col className="w-[32px]" />
                      <col className="w-[140px]" />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr>
                        <th className="sticky left-0 z-30 border border-slate-200 bg-slate-50 px-2 py-2 text-left text-xs uppercase whitespace-normal">
                          Nr
                        </th>
                        <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase">LL</th>
                        <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase">NLL</th>
                        <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase whitespace-normal">
                          <span className="block">AM/</span>
                          <span className="block">PM</span>
                        </th>
                        <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase">Titulli</th>
                        <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase">STS</th>
                        <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase">BZ</th>
                        <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase whitespace-normal">KOHA BZ</th>
                        <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase whitespace-normal">
                          <span className="block">T/Y</span>
                          <span className="block">/O</span>
                        </th>
                        <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase">Koment</th>
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
                              <td className="sticky left-0 z-20 border border-slate-200 bg-white px-2 py-2 align-top font-semibold">
                                {index + 1}
                              </td>
                              <td className="border border-slate-200 px-2 py-2 align-top font-semibold">{row.typeLabel}</td>
                              <td className="border border-slate-200 px-2 py-2 align-top">{row.subtype}</td>
                              <td className="border border-slate-200 px-2 py-2 align-top">{row.period}</td>
                              <td className="border border-slate-200 px-2 py-2 align-top uppercase">{row.title}</td>
                              <td className="border border-slate-200 px-2 py-2 align-top uppercase">{row.status}</td>
                              <td className="border border-slate-200 px-2 py-2 align-top">{row.bz}</td>
                              <td className="border border-slate-200 px-2 py-2 align-top">{row.kohaBz}</td>
                              <td className="border border-slate-200 px-2 py-2 align-top">{row.tyo}</td>
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
                            </tr>
                          )
                        })
                      ) : (
                        <tr>
                          <td className="border border-slate-200 px-2 py-4 text-center italic text-slate-500" colSpan={11}>
                            No data available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : null}

            {viewMode === "department" ? (
            <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl p-4 max-w-5xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-800">Daily Report (Overdue)</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Shows overdue items for the selected user (not for “All users”).
                  </div>
                </div>
                {loadingDailyReport ? (
                  <div className="text-xs text-slate-500">Loading…</div>
                ) : null}
              </div>
              {selectedUserId === "__all__" ? (
                <div className="mt-3 text-sm text-slate-600">Select a user to view their overdue report.</div>
              ) : dailyReport ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overdue tasks</div>
                    {dailyReport.tasks_overdue.length ? (
                      <div className="mt-2 space-y-2">
                        {dailyReport.tasks_overdue.slice(0, 8).map((item) => (
                          <div key={item.task.id} className="flex items-start justify-between gap-2">
                            <div className="text-sm text-slate-800">{item.task.title}</div>
                            <div className="shrink-0 rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 text-[11px] font-semibold">
                              late {item.late_days ?? 0}d
                            </div>
                          </div>
                        ))}
                        {dailyReport.tasks_overdue.length > 8 ? (
                          <div className="text-xs text-slate-500">+{dailyReport.tasks_overdue.length - 8} more</div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-slate-500">No overdue tasks.</div>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overdue system tasks</div>
                    {dailyReport.system_overdue.length ? (
                      <div className="mt-2 space-y-2">
                        {dailyReport.system_overdue.slice(0, 8).map((occ) => (
                          <div key={`${occ.template_id}-${occ.occurrence_date}`} className="flex items-start justify-between gap-2">
                            <div className="text-sm text-slate-800">
                              {occ.title}{" "}
                              <span className="text-xs text-slate-500">(planned {occ.occurrence_date})</span>
                            </div>
                            <div className="shrink-0 rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 text-[11px] font-semibold">
                              late {occ.late_days ?? 0}d
                            </div>
                          </div>
                        ))}
                        {dailyReport.system_overdue.length > 8 ? (
                          <div className="text-xs text-slate-500">+{dailyReport.system_overdue.length - 8} more</div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-slate-500">No overdue system tasks.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-slate-500">No report available.</div>
              )}
            </Card>
            ) : null}
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row max-w-5xl">
                <div className="relative w-full rounded-xl bg-white border border-slate-200 border-l-4 border-sky-500 p-4 text-slate-700 md:w-48 md:shrink-0">
                  <div className="text-sm font-semibold">PROJECT TASKS</div>
                  <span className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {todayProjectTasks.length}
                  </span>
                  <div className="mt-2 text-xs text-slate-500">Due today</div>
                </div>
                <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 flex flex-col max-h-[300px] overflow-y-auto">
                  {todayProjectTaskGroups.length ? (
                    <div className="space-y-3">
                      {todayProjectTaskGroups.map((group) => (
                        <div key={group.id}>
                          <div className="text-xs font-semibold text-slate-700">{group.name}</div>
                          <div className="mt-2 space-y-2">
                            {group.tasks.map((task) => {
                              const assignee = task.assigned_to ? userMap.get(task.assigned_to) : null
                              const phaseLabel = PHASE_LABELS[task.phase || "MEETINGS"] || task.phase || "MEETINGS"
                              const priorityValue = normalizePriority(task.priority)
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
                                    <Badge
                                      variant="outline"
                                      className={`text-xs ${PRIORITY_BADGE_STYLES[priorityValue]}`}
                                    >
                                      {PRIORITY_LABELS[priorityValue]}
                                    </Badge>
                                    <div className="font-medium text-slate-800">{task.title}</div>
                                    {task.finish_period && (
                                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                                        {task.finish_period}
                                      </Badge>
                                    )}
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

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row max-w-5xl">
                <div className="relative w-full rounded-xl bg-white border border-slate-200 border-l-4 border-sky-500 p-4 text-slate-700 md:w-48 md:shrink-0">
                  <div className="text-sm font-semibold">GA NOTES</div>
                  <span className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {todayOpenNotes.length}
                  </span>
                  <div className="mt-2 text-xs text-slate-500">Quick notes</div>
                </div>
                <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 flex flex-col max-h-[300px] overflow-y-auto">
                  {todayOpenNotes.length ? (
                    <div className="space-y-2">
                      {todayOpenNotes.map((note) => {
                        const priorityValue = normalizePriority(note.priority)
                        return (
                        <div
                          key={note.id}
                          className="rounded-lg border border-slate-200 border-l-4 border-sky-500 bg-white px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {note.note_type || "GA"}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`text-xs ${PRIORITY_BADGE_STYLES[priorityValue]}`}
                            >
                              {PRIORITY_LABELS[priorityValue]}
                            </Badge>
                            <div className="font-medium">{note.content}</div>
                          </div>
                        </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No open notes today.</div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row max-w-5xl">
                <div className="relative w-full rounded-xl bg-white border border-slate-200 border-l-4 border-blue-500 p-4 text-slate-700 md:w-48 md:shrink-0">
                  <div className="text-sm font-semibold">FAST TASKS</div>
                  <span className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {todayNoProjectTasks.length}
                  </span>
                  <div className="mt-2 text-xs text-slate-500">Ad-hoc tasks</div>
                </div>
                <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 flex flex-col max-h-[300px] overflow-y-auto">
                  {todayNoProjectTasks.length ? (
                    <div className="space-y-2">
                      {todayNoProjectTasks.map((task) => {
                        const assignee = task.assigned_to ? userMap.get(task.assigned_to) : null
                        const typeLabel = noProjectTypeLabel(task)
                        const taskPriority = (task.priority as "HIGH" | "NORMAL") || "NORMAL"
                        const isHighPriority = taskPriority === "HIGH"
                        return (
                          <Link
                            key={task.id}
                            href={`/tasks/${task.id}`}
                            className="block rounded-lg border border-slate-200 border-l-4 border-blue-500 bg-white px-3 py-2 text-sm transition hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs">
                                {typeLabel}
                              </Badge>
                              <div className="font-medium text-slate-800">{task.title}</div>
                              <Badge
                                variant="secondary"
                                className={`text-xs ${
                                  isHighPriority
                                    ? "bg-red-100 text-red-700 border-red-200"
                                    : "bg-slate-100 text-slate-700 border-slate-200"
                                }`}
                              >
                                {taskPriority}
                              </Badge>
                              {task.finish_period && (
                                <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                                  {task.finish_period}
                                </Badge>
                              )}
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

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row max-w-5xl">
                <div className="relative w-full rounded-xl bg-white border border-slate-200 border-l-4 border-blue-500 p-4 text-slate-700 md:w-48 md:shrink-0">
                  <div className="text-sm font-semibold">SYSTEM TASKS</div>
                  <span className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {todaySystemTasks.length}
                  </span>
                  <div className="mt-2 text-xs text-slate-500">Scheduled</div>
                </div>
                <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 flex flex-col max-h-[300px] overflow-y-auto">
                  {todaySystemTasks.length ? (
                    <div className="space-y-2">
                      {todaySystemTasks.map((task) => {
                        const priorityValue = normalizePriority(task.priority)
                        return (
                        <div
                          key={task.id}
                          className="rounded-lg border border-slate-200 border-l-4 border-blue-500 bg-white px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-slate-800">{task.title}</div>
                            <Badge
                              variant="outline"
                              className={`text-xs ${PRIORITY_BADGE_STYLES[priorityValue]}`}
                            >
                              {PRIORITY_LABELS[priorityValue]}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-slate-600">{task.description || "-"}</div>
                        </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">No system tasks today.</div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row max-w-5xl">
                <div className="relative w-full rounded-xl bg-white border border-slate-200 border-l-4 border-slate-500 p-4 text-slate-700 md:w-48 md:shrink-0">
                  <div className="text-sm font-semibold">EXTERNAL MEETINGS</div>
                  <span className="absolute right-3 top-3 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {todayMeetings.length}
                  </span>
                  <div className="mt-2 text-xs text-slate-500">Today</div>
                </div>
                <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 flex flex-col max-h-[300px] overflow-y-auto">
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
          <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-lg sm:text-xl font-semibold text-slate-900">System Tasks</div>
                <div className="text-xs sm:text-sm text-muted-foreground">
                  Department tasks organized by frequency and date.
                </div>
              </div>
              {canManage ? (
                <Dialog open={createSystemOpen} onOpenChange={setCreateSystemOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-auto">+ Add Task</Button>
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
              <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
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
                          ? "bg-foreground text-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
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
                (() => {
                  let globalTaskNumber = 0
                  return systemGroups.map((group) => (
                    <Card key={group.label} className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
                      <div className="flex items-center gap-3 border-b px-4 py-3">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          {group.label.toUpperCase()}
                        </span>
                        <Badge variant="secondary">{group.items.length}</Badge>
                      </div>
                      <div
                        className={[
                          "grid gap-3 border-b bg-slate-50 px-4 py-3 text-xs font-semibold text-muted-foreground",
                          showSystemActions
                            ? "grid-cols-[minmax(260px,1.6fr)_minmax(120px,0.6fr)_minmax(160px,0.8fr)_minmax(120px,0.6fr)_minmax(120px,0.6fr)_minmax(120px,0.6fr)_minmax(120px,0.6fr)]"
                            : "grid-cols-[minmax(260px,1.6fr)_minmax(120px,0.6fr)_minmax(160px,0.8fr)_minmax(120px,0.6fr)_minmax(120px,0.6fr)_minmax(120px,0.6fr)]",
                        ].join(" ")}
                      >
                        <div>Task Title</div>
                        <div>Dept</div>
                        <div>Owner</div>
                        <div>Frequency</div>
                        <div>Finish By</div>
                        <div>Priority</div>
                        {showSystemActions ? <div>Actions</div> : null}
                      </div>
                      <div className="divide-y">
                        {group.items.map((item) => {
                          globalTaskNumber++
                          const owner = item.default_assignee_id ? users.find((u) => u.id === item.default_assignee_id) : null
                          const priorityValue = normalizePriority(item.priority)
                          const priorityBadgeClass =
                            priorityValue === "HIGH"
                              ? "border-red-200 bg-red-50 text-red-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
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
                                showSystemActions
                                  ? "grid-cols-[minmax(260px,1.6fr)_minmax(120px,0.6fr)_minmax(160px,0.8fr)_minmax(120px,0.6fr)_minmax(120px,0.6fr)_minmax(120px,0.6fr)_minmax(120px,0.6fr)]"
                                  : "grid-cols-[minmax(260px,1.6fr)_minmax(120px,0.6fr)_minmax(160px,0.8fr)_minmax(120px,0.6fr)_minmax(120px,0.6fr)_minmax(120px,0.6fr)]",
                              ].join(" ")}
                            >
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="font-medium">{globalTaskNumber}. {item.title}</div>
                                <Badge variant="secondary" className="h-5 text-[10px] uppercase">{statusValue}</Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">{item.description || "-"}</div>
                            </div>
                            <div>{item.scope === "ALL" ? "ALL" : item.scope === "GA" ? "GA" : department.code}</div>
                            <div>{owner?.full_name || owner?.username || "-"}</div>
                            <div className="text-muted-foreground">
                              {FREQUENCY_LABELS[item.frequency] || item.frequency}
                            </div>
                            <div className="text-muted-foreground">{item.finish_period || "-"}</div>
                            <div>
                              <Badge
                                variant="outline"
                                className={`border px-2 py-0.5 text-[11px] ${priorityBadgeClass}`}
                              >
                                {PRIORITY_LABELS[priorityValue]}
                              </Badge>
                            </div>
                            {showSystemActions ? (
                              <div className="flex flex-col gap-2">
                                {isClosed ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                    <span className="text-[12px]">✓</span>
                                    Done
                                  </span>
                                ) : isAssigned ? (
                                  <button
                                    type="button"
                                    disabled={closingTask}
                                    className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-transparent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
                                    onClick={() => handleCloseTaskClick(item.id)}
                                  >
                                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-emerald-400 bg-white text-[9px] leading-none text-emerald-600">
                                      ✓
                                    </span>
                                    Mark Done
                                  </button>
                                ) : null}
                                {item.user_comment ? (
                                  <div className="text-xs text-muted-foreground bg-slate-50 p-2 rounded border border-slate-200">
                                    {item.user_comment}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        )
                        })}
                      </div>
                    </Card>
                  ))
                })()
              ) : (
                <div className="text-sm text-muted-foreground">No system tasks yet.</div>
              )}
            </div>
          </div>
        ) : null}

        {/* Dialog for closing task with optional comment */}
        <Dialog open={closeTaskDialogOpen} onOpenChange={setCloseTaskDialogOpen}>
          <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Close System Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="close-task-comment">
              Employee Comment
            </Label>
            <Textarea
              id="close-task-comment"
              value={closeTaskComment}
              onChange={(e) => setCloseTaskComment(e.target.value)}
              placeholder="Describe what was done in this task..."
              className="min-h-[120px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
                  onClick={() => {
                    setCloseTaskDialogOpen(false)
                    setTaskToCloseId(null)
                    setCloseTaskComment("")
                  }}
                  disabled={closingTask}
                >
                  Cancel
            </Button>
            <Button
              onClick={() => void confirmCloseTask()}
              disabled={closingTask || !closeTaskComment.trim()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {closingTask ? "Closing..." : "Close Task"}
            </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {activeTab === "no-project" ? (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-lg sm:text-xl font-semibold text-slate-900">Tasks (No Project)</div>
                <div className="text-xs sm:text-sm text-slate-600">
                  Use these buckets to track non-project tasks and special cases.
                </div>
              </div>
              {!isReadOnly ? (
                <Dialog open={noProjectOpen} onOpenChange={setNoProjectOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-blue-500 hover:bg-blue-600 text-white border-0 shadow-sm rounded-xl px-4 sm:px-6 w-full sm:w-auto">
                      + Add Task
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg bg-white border-slate-200 rounded-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-slate-800">New Task</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-slate-700">Type</Label>
                        <Select value={noProjectType} onValueChange={(v) => setNoProjectType(v as typeof noProjectType)}>
                          <SelectTrigger className="border-slate-200 focus:border-slate-400 rounded-xl">
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
                        <div className="text-xs text-slate-500">
                          {NO_PROJECT_TYPES.find((opt) => opt.id === noProjectType)?.description}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-700">Title</Label>
                        <Input value={noProjectTitle} onChange={(e) => setNoProjectTitle(e.target.value)} className="border-slate-200 focus:border-slate-400 rounded-xl" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-700">Description</Label>
                        <BoldOnlyEditor value={noProjectDescription} onChange={setNoProjectDescription} />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label className="text-slate-700">Assign to</Label>
                            <Dialog open={selectNoProjectAssigneesOpen} onOpenChange={setSelectNoProjectAssigneesOpen}>
                              <DialogTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full justify-start border-slate-200 focus:border-slate-400 rounded-xl"
                                >
                                  {noProjectAssigneeLabel}
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-md z-[110]">
                                <DialogHeader>
                                  <DialogTitle>Select Assignees</DialogTitle>
                                </DialogHeader>
                                <div className="mt-4 max-h-[400px] overflow-y-auto space-y-2">
                                  {departmentUsers.length ? (
                                    departmentUsers.map((u) => {
                                      const isSelected = noProjectAssignees.includes(u.id)
                                      return (
                                        <div
                                          key={u.id}
                                          className="flex items-center space-x-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                                          onClick={() => {
                                            if (isSelected) {
                                              setNoProjectAssignees((prev) => prev.filter((id) => id !== u.id))
                                            } else {
                                              setNoProjectAssignees((prev) => [...prev, u.id])
                                            }
                                          }}
                                        >
                                          <Checkbox checked={isSelected} />
                                          <Label className="cursor-pointer flex-1">
                                            {u.full_name || u.username || "-"}
                                          </Label>
                                        </div>
                                      )
                                    })
                                  ) : (
                                    <div className="text-sm text-slate-600">No team members available.</div>
                                  )}
                                </div>
                                <div className="mt-4 flex justify-end gap-2">
                                  <Button variant="outline" onClick={() => setNoProjectAssignees([])}>
                                    Clear
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={() => setNoProjectAssignees(departmentUsers.map((u) => u.id))}
                                    disabled={!departmentUsers.length}
                                  >
                                    All team
                                  </Button>
                                  <Button onClick={() => setSelectNoProjectAssigneesOpen(false)}>
                                    Done
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        <div className="space-y-2">
                          <Label className="text-slate-700">Finish by (optional)</Label>
                          <Select
                            value={noProjectFinishPeriod}
                            onValueChange={(value) =>
                              setNoProjectFinishPeriod(value as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)
                            }
                          >
                            <SelectTrigger className="border-slate-200 focus:border-slate-400 rounded-xl">
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
                          <Label className="text-slate-700">Start date</Label>
                          <Input
                            type="date"
                            required
                            value={noProjectStartDate}
                            onChange={(e) => setNoProjectStartDate(normalizeDueDateInput(e.target.value))}
                            className="border-slate-200 focus:border-slate-400 rounded-xl w-full"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-slate-700">Due date (optional)</Label>
                          <Input
                            type="date"
                            value={noProjectDueDate}
                            onChange={(e) => setNoProjectDueDate(normalizeDueDateInput(e.target.value))}
                            className="border-slate-200 focus:border-slate-400 rounded-xl w-full"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setNoProjectOpen(false)} className="rounded-xl border-slate-200">
                          Cancel
                        </Button>
                        <Button
                          disabled={!noProjectTitle.trim() || !noProjectStartDate || creatingNoProject}
                          onClick={() => void submitNoProjectTask()}
                          className="bg-blue-500 hover:bg-blue-600 text-white border-0 shadow-sm rounded-xl"
                        >
                          {creatingNoProject ? "Creating..." : "Create"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : null}
              {!isReadOnly ? (
                <Dialog open={Boolean(editingTaskId)} onOpenChange={(open) => { if (!open) cancelEditTask() }}>
                  <DialogContent className="sm:max-w-lg bg-white border-slate-200 rounded-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-slate-800">Edit Task</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-slate-700">Title</Label>
                        <Input value={editTaskTitle} onChange={(e) => setEditTaskTitle(e.target.value)} className="border-slate-200 focus:border-slate-400 rounded-xl" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-700">Description</Label>
                        <BoldOnlyEditor value={editTaskDescription} onChange={setEditTaskDescription} />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-slate-700">Finish by (optional)</Label>
                          <Select
                            value={editTaskFinishPeriod}
                            onValueChange={(value) =>
                              setEditTaskFinishPeriod(value as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)
                            }
                          >
                            <SelectTrigger className="border-slate-200 focus:border-slate-400 rounded-xl">
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
                          <Label className="text-slate-700">Start date</Label>
                          <Input
                            type="date"
                            required
                            value={editTaskStartDate}
                            onChange={(e) => setEditTaskStartDate(normalizeDueDateInput(e.target.value))}
                            className="border-slate-200 focus:border-slate-400 rounded-xl w-full"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-slate-700">Due date (optional)</Label>
                          <Input
                            type="date"
                            value={editTaskDueDate}
                            onChange={(e) => setEditTaskDueDate(normalizeDueDateInput(e.target.value))}
                            className="border-slate-200 focus:border-slate-400 rounded-xl w-full"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={cancelEditTask} className="rounded-xl border-slate-200">
                          Cancel
                        </Button>
                        <Button
                          disabled={!editTaskTitle.trim() || !editTaskStartDate || updatingTask}
                          onClick={() => void updateNoProjectTask()}
                          className="bg-blue-500 hover:bg-blue-600 text-white border-0 shadow-sm rounded-xl"
                        >
                          {updatingTask ? "Updating..." : "Update"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : null}
            </div>
            <div className="space-y-4">
              {statusRows.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row"
                >
                  <div
                    className={`relative w-full rounded-xl border border-slate-200 border-l-4 p-4 md:w-48 md:shrink-0 ${row.headerBg} ${row.headerText} ${row.borderClass}`}
                  >
                    <div className="text-sm font-semibold">{row.title}</div>
                    <span
                      className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-xs font-semibold ${row.badgeClass}`}
                    >
                      {row.count}
                    </span>
                    <div className="mt-2 text-xs text-slate-500">
                      {row.items.length ? "Active items" : "No items"}
                    </div>
                  </div>
                  <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 flex flex-col max-h-[300px] overflow-y-auto">
                    {row.items.length ? (
                      <div className="flex flex-col gap-2">
                        {row.items.map((t) => {
                          const taskPriority = (t.priority as "HIGH" | "NORMAL") || "NORMAL"
                          const isHighPriority = taskPriority === "HIGH"
                          return (
                          <Link
                            key={t.id}
                            href={`/tasks/${t.id}?returnTo=${encodeURIComponent(returnToTasks)}`}
                            className={`block rounded-lg border border-slate-200 border-l-4 ${row.borderClass} bg-white px-3 py-2 text-sm transition hover:bg-slate-50`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="font-medium text-slate-800 text-xs">{t.title}</div>
                                <Badge
                                  variant="secondary"
                                  className={`text-[11px] ${
                                    isHighPriority
                                      ? "bg-red-100 text-red-700 border-red-200"
                                      : "bg-slate-100 text-slate-700 border-slate-200"
                                  }`}
                                >
                                  {taskPriority}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className={`border text-[11px] ${row.itemBadgeClass}`}>
                                  {row.itemBadge}
                                </Badge>
                                {t.assigned_to ? (
                                  <div
                                    className="h-6 w-6 rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600 flex items-center justify-center"
                                    title={assigneeLabel(userMap.get(t.assigned_to) || null)}
                                  >
                                    {initials(assigneeLabel(userMap.get(t.assigned_to) || null))}
                                  </div>
                                ) : null}
                                {canDeleteNoProject ? (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-6 w-6 border-slate-200 text-slate-500 hover:border-blue-200 hover:text-blue-600"
                                      title="Edit"
                                      aria-label={`Edit ${t.title}`}
                                      onClick={(event) => {
                                        event.preventDefault()
                                        event.stopPropagation()
                                        startEditTask(t)
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      disabled={deletingNoProjectTaskId === t.id}
                                      className="h-6 w-6 border-slate-200 text-slate-500 hover:border-red-200 hover:text-red-600"
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
                                  </>
                                ) : null}
                              </div>
                            </div>
                            {t.description ? (
                              <div className="mt-0.5 text-[10px] text-slate-500 line-clamp-1">{t.description}</div>
                            ) : null}
                          </Link>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">No tasks in this category.</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === "ga-ka" ? (
          <div className="space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-base sm:text-lg font-semibold">GA/KA Notes</div>
              {!isReadOnly ? (
                <Dialog open={gaNoteOpen} onOpenChange={setGaNoteOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-auto">+ Add Note</Button>
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
                          <Select value={newGaNoteType} onValueChange={(v) => setNewGaNoteType(v as "GA" | "KA")}>
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
                          <Select value={newGaNotePriority} onValueChange={(v) => setNewGaNotePriority(v as typeof newGaNotePriority)}>
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
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
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
                  <div className="text-sm text-muted-foreground">
                    This will create a task linked to the GA/KA note.
                  </div>
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
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row">
              <div className="relative w-full rounded-xl bg-white border border-slate-200 border-l-4 border-sky-500 p-4 text-slate-700 md:w-48 md:shrink-0">
                <div className="text-sm font-semibold">GA/KA NOTES</div>
                <span className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {visibleGaNotes.length}
                </span>
                <div className="mt-2 text-xs text-slate-500">Quick reminders</div>
              </div>
              <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 flex flex-col">
                {visibleGaNotes.length ? (
                  <div className="space-y-3">
                    {[...visibleGaNotes]
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
                        const isHighPriority = note.priority === "HIGH"
                        return (
                          <div
                            key={note.id}
                            className={`rounded-xl border-l-4 border border-slate-200 bg-white p-4 shadow-sm ${
                              isHighPriority ? "border-l-red-500 bg-red-50/50" : "border-l-sky-500"
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Badge
                                  variant="outline"
                                  className={note.note_type === "KA" ? "border-orange-200 text-orange-600" : "border-slate-200 text-blue-600"}
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
                                {note.priority ? (
                                  <Badge
                                    variant={isHighPriority ? "destructive" : "secondary"}
                                    className={isHighPriority ? "bg-red-100 text-red-700 border-red-200" : ""}
                                  >
                                    {note.priority}
                                  </Badge>
                                ) : null}
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
                          </div>
                        )
                      })}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No GA/KA notes yet.</div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "meetings" ? (
          <div className="space-y-4 sm:space-y-6">
            <div className="text-lg sm:text-xl font-semibold">Meetings</div>
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="text-sm font-semibold">External Meetings</div>
                <div className="space-y-3">
                  {visibleMeetings.length ? (
                    visibleMeetings.map((meeting) => {
                      const project = meeting.project_id
                        ? projects.find((p) => p.id === meeting.project_id) || null
                        : null
                      const isEditing = !isReadOnly && editingMeetingId === meeting.id
                      return (
                        <Card key={meeting.id} className="rounded-2xl border-slate-200 bg-white p-4 shadow-sm">
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
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => startEditMeeting(meeting)}
                                    aria-label="Edit meeting"
                                    title="Edit"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => void deleteMeeting(meeting.id)}
                                    aria-label="Delete meeting"
                                    title="Delete"
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
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
                {!isReadOnly ? (
                  <div className="border-t border-slate-200 pt-4">
                    {!showAddMeetingForm ? (
                      <Button onClick={() => setShowAddMeetingForm(true)} variant="outline">
                        Add
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-sm font-semibold">Add</div>
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
                            <div className="flex gap-2">
                              <Button 
                                disabled={!meetingTitle.trim() || creatingMeeting} 
                                onClick={() => void submitMeeting()}
                                className="flex-1"
                              >
                                {creatingMeeting ? "Saving..." : "Add"}
                              </Button>
                              <Button 
                                variant="outline" 
                                onClick={() => {
                                  setShowAddMeetingForm(false)
                                  setMeetingTitle("")
                                  setMeetingPlatform("")
                                  setMeetingStartsAt("")
                                  setMeetingProjectId("__none__")
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-800">Microsoft Calendar</div>
                    <div className="flex items-center gap-2">
                      {msConnected ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void loadMicrosoftEvents()}
                          disabled={loadingMsEvents}
                          className="rounded-full border-slate-200"
                        >
                          {loadingMsEvents ? "Syncing..." : "Sync"}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void connectMicrosoft()}
                          disabled={checkingMsStatus}
                          className="rounded-full border-slate-200"
                        >
                          {checkingMsStatus ? "Checking..." : "Connect"}
                        </Button>
                      )}
                      {msConnected ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void disconnectMicrosoft()}
                          className="rounded-full text-slate-500"
                        >
                          Disconnect
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {msConnected ? (
                    loadingMsEvents ? (
                      <div className="text-xs text-muted-foreground">Loading events...</div>
                    ) : msEvents.length ? (
                      <div className="space-y-2">
                        {msEvents.map((event) => (
                          <div key={event.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                            <div className="text-sm font-semibold text-slate-800">
                              {event.subject || "Untitled event"}
                            </div>
                            <div className="text-xs text-slate-600">{formatMsEventWindow(event)}</div>
                            {event.location ? (
                              <div className="text-xs text-slate-500">Location: {event.location}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">No upcoming events.</div>
                    )
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Connect your Microsoft account to read calendar events.
                    </div>
                  )}
                </div>
              </Card>

              <Card className="rounded-2xl border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="text-sm font-semibold">Internal Meetings</div>
                <div>
                  <div className="text-base font-semibold">{INTERNAL_MEETING.title}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {INTERNAL_MEETING.team.join(", ")}
                  </div>
                </div>
                <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                  {(Object.keys(INTERNAL_MEETING.slots) as Array<keyof typeof INTERNAL_MEETING.slots>).map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setInternalSlot(slot)}
                      className={[
                        "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                        internalSlot === slot
                          ? "bg-foreground text-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      ].join(" ")}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
                <div className="space-y-3">
                  <div className="text-sm font-semibold">{INTERNAL_MEETING.slots[internalSlot].label}</div>
                  {!isReadOnly ? (
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
                  ) : null}
                  <div className="space-y-2">
                    {internalMeetingItems
                      .filter((item) => (item.day || internalSlot) === internalSlot)
                      .filter((item) => (internalSlot === "M1" ? !/[a-z]/.test(item.title || "") : true))
                      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                      .map((item, idx) => {
                        const isEditing = editingInternalMeetingItemId === item.id
                        return (
                          <div key={item.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
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
                            {!isReadOnly ? (
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
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      onClick={() => startEditInternalMeetingItem(item)}
                                      aria-label="Edit internal meeting item"
                                      title="Edit"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className="text-red-600 border-red-200 hover:bg-red-50"
                                      onClick={() => void deleteInternalMeetingItem(item.id)}
                                      aria-label="Delete internal meeting item"
                                      title="Delete"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            ) : null}
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

        {/* Title Warning Confirmation Dialog */}
        <Dialog open={showTitleWarning} onOpenChange={setShowTitleWarning}>
          <DialogContent className="sm:max-w-md border-red-200 bg-white shadow-xl rounded-2xl">
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
                Please confirm the title "<span className="font-semibold text-red-900">{pendingProjectTitle}</span>" is the correct shortcut to use.
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
              <div className="text-sm text-slate-700">
                Are you sure you want to use this as the project title?
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowTitleWarning(false)
                  setPendingProjectTitle("")
                }}
                className="rounded-xl border-slate-200 hover:bg-slate-100"
              >
                Go Back & Edit
              </Button>
              <Button
                onClick={() => {
                  setShowTitleWarning(false)
                  setPendingProjectTitle("")
                  void submitProject()
                }}
                className="bg-red-600 hover:bg-red-700 text-white border-0 shadow-sm rounded-xl"
              >
                Yes, Use This Title
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="hidden print:block">
        <div
          ref={printContainerRef}
          className="print-page px-6 pb-6"
          style={printPageMinHeight ? { minHeight: `${printPageMinHeight}px` } : undefined}
        >
          <div ref={printMeasureRef} className="print-page-measure" />
          <div className="print-header">
            <div />
            <div className="print-title">
              {showAllTodayPrint
                ? "ALL TODAY REPORT"
                : printRange === "today" && showDailyUserReport
                  ? "DAILY TASK REPORT"
                  : "PLANIFIKIMI JAVOR - PRMBL PLANIFIKIMI JAVOR"}
            </div>
            <div className="print-datetime">
              {printedAt.toLocaleString("en-US", {
                month: "2-digit",
                day: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
          <div className="print-meta">
            <div>Department: {departmentName}</div>
            {showAllTodayPrint ? (
              <div>
                Users: {selectedUserId === "__all__"
                  ? "All users"
                  : allTodayPrintColumns[0]?.label || "Selected user"}
              </div>
            ) : (
              <div>User: {user?.full_name || user?.username || "-"}</div>
            )}
            {null}
          </div>
          {showAllTodayPrint ? (
            <>
              {loadingAllUsersDailyReports ? (
                <div className="text-sm text-slate-600 py-4">Loading daily reports...</div>
              ) : (() => {
                // Collect all rows from all users into a single array
                const allRows: Array<{
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
                  taskId?: string
                  systemTemplateId?: string
                  systemOccurrenceDate?: string
                  systemStatus?: string
                  userName: string
                  userInitials: string
                }> = []
                
                for (const member of allTodayPrintBaseUsers) {
                  const userReport = allUsersDailyReports.get(member.id)
                  if (!userReport) continue
                  const userRows = convertDailyReportToRows(userReport, member.id)
                  const userName = member.full_name || member.username || "-"
                  const userInitials = initials(userName)
                  // Add userName to each row and add to allRows
                  for (const row of userRows) {
                    allRows.push({ ...row, userName, userInitials })
                  }
                }
                
                // Sort by LL (typeLabel), NLL (subtype), and T/Y/O (tyo)
                allRows.sort((a, b) => {
                  // First sort by typeLabel (LL)
                  if (a.typeLabel !== b.typeLabel) {
                    return a.typeLabel.localeCompare(b.typeLabel)
                  }
                  // Then by subtype (NLL)
                  if (a.subtype !== b.subtype) {
                    return a.subtype.localeCompare(b.subtype)
                  }
                  // Finally by tyo (T/Y/O)
                  return a.tyo.localeCompare(b.tyo)
                })
                
                return (
                  <table className="w-full border border-slate-900 text-[11px] daily-report-table print:table-fixed">
                    <colgroup>
                      <col className="w-[32px]" />
                      <col className="w-[40px]" />
                      <col className="w-[28px]" />
                      <col className="w-[32px]" />
                      <col className="w-[170px]" />
                      <col className="w-[60px]" />
                      <col className="w-[36px]" />
                      <col className="w-[50px]" />
                      <col className="w-[36px]" />
                      <col className="w-[90px]" />
                      <col className="w-[40px]" />
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
                      {allRows.length ? (
                        allRows.map((row, index) => (
                          <tr key={`${row.userName}-${row.typeLabel}-${row.title}-${index}`}>
                            <td className="border border-slate-900 px-2 py-2 align-top print-nr-cell">{index + 1}</td>
                            <td className="border border-slate-900 px-2 py-2 align-top font-semibold">{row.typeLabel}</td>
                            <td className="border border-slate-900 px-2 py-2 align-top whitespace-normal break-words">
                              {row.subtype}
                            </td>
                            <td className="border border-slate-900 px-2 py-2 align-top whitespace-normal break-words">
                              {row.period}
                            </td>
                            <td className="border border-slate-900 px-2 py-2 align-top uppercase">{row.title}</td>
                            <td className="border border-slate-900 px-2 py-2 align-top uppercase">{row.status}</td>
                            <td className="border border-slate-900 px-2 py-2 align-top">{row.bz}</td>
                            <td className="border border-slate-900 px-2 py-2 align-top">{row.kohaBz}</td>
                            <td className="border border-slate-900 px-2 py-2 align-top whitespace-normal break-words">
                              {row.tyo}
                            </td>
                            <td className="border border-slate-900 px-2 py-2 align-top">
                              <div className="h-4 w-full border-b border-slate-400" />
                            </td>
                            <td className="border border-slate-900 px-2 py-2 align-top uppercase">
                              {row.userInitials}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="border border-slate-900 px-2 py-4 text-center italic text-slate-600" colSpan={11}>
                            No data available.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )
              })()}
            </>
          ) : printRange === "today" && showDailyUserReport ? (
            <table className="w-full border border-slate-900 text-[11px] daily-report-table print:table-fixed">
              <colgroup>
                <col className="w-[36px]" />
                <col className="w-[44px]" />
                <col className="w-[30px]" />
                <col className="w-[36px]" />
                <col className="w-[200px]" />
                <col className="w-[60px]" />
                <col className="w-[40px]" />
                <col className="w-[52px]" />
                <col className="w-[40px]" />
                <col className="w-[140px]" />
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
                  <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">Titulli</th>
                <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">STS</th>
                <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">BZ</th>
                <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase whitespace-normal">KOHA BZ</th>
                <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase whitespace-normal break-words">T/Y/O</th>
                <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">Koment</th>
              </tr>
            </thead>
            <tbody>
              {dailyUserReportRows.length ? (
                dailyUserReportRows.map((row, index) => (
                  <tr key={`${row.typeLabel}-${row.title}-${index}`}>
                    <td className="border border-slate-900 px-2 py-2 align-top print-nr-cell">{index + 1}</td>
                    <td className="border border-slate-900 px-2 py-2 align-top font-semibold">{row.typeLabel}</td>
                    <td className="border border-slate-900 px-2 py-2 align-top whitespace-normal break-words">{row.subtype}</td>
                    <td className="border border-slate-900 px-2 py-2 align-top whitespace-normal break-words">{row.period}</td>
                    <td className="border border-slate-900 px-2 py-2 align-top uppercase">{row.title}</td>
                    <td className="border border-slate-900 px-2 py-2 align-top uppercase">{row.status}</td>
                    <td className="border border-slate-900 px-2 py-2 align-top">{row.bz}</td>
                    <td className="border border-slate-900 px-2 py-2 align-top">{row.kohaBz}</td>
                    <td className="border border-slate-900 px-2 py-2 align-top whitespace-normal break-words">{row.tyo}</td>
                    <td className="border border-slate-900 px-2 py-2 align-top">
                      <div className="h-4 w-full border-b border-slate-400" />
                    </td>
                  </tr>
                ))
              ) : (
                  <tr>
                    <td className="border border-slate-900 px-2 py-4 text-center italic text-slate-600" colSpan={10}>
                      No data available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full border border-slate-900 text-[11px] weekly-report-table">
              <colgroup>
                <col className="w-[36px]" />
                <col className="w-[44px]" />
                <col className="w-[56px]" />
                <col className="w-[56px]" />
                <col className="w-[150px]" />
                <col className="w-[110px]" />
                <col className="w-[60px]" />
                <col className="w-[40px]" />
                <col className="w-[52px]" />
                <col className="w-[48px]" />
                <col className="w-[140px]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase whitespace-normal print-nr-cell">
                    Nr
                  </th>
                  <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">LL</th>
                  <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">NLL</th>
                  <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">Prioriteti</th>
                  <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">AM/PM</th>
                  <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">Titulli</th>
                  <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">Pershkrimi</th>
                  <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">STS</th>
                  <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">BZ</th>
                  <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase whitespace-normal">KOHA BZ</th>
                  <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">T/Y/O</th>
                  <th className="border border-slate-900 px-2 py-2 text-left text-xs uppercase">Koment</th>
                </tr>
              </thead>
              <tbody>
                {weeklyTaskReportRows.length ? (
                  weeklyTaskReportRows.map((row, index) => (
                    <tr key={`${row.typeLabel}-${row.title}-${index}`}>
                      <td className="border border-slate-900 px-2 py-2 align-top print-nr-cell">{index + 1}</td>
                      <td className="border border-slate-900 px-2 py-2 align-top font-semibold">{row.typeLabel}</td>
                      <td className="border border-slate-900 px-2 py-2 align-top">{row.subtype}</td>
                      <td className="border border-slate-900 px-2 py-2 align-top">{row.priority}</td>
                      <td className="border border-slate-900 px-2 py-2 align-top">{row.period}</td>
                      <td className="border border-slate-900 px-2 py-2 align-top uppercase">{row.title}</td>
                      <td className="border border-slate-900 px-2 py-2 align-top">{row.description}</td>
                      <td className="border border-slate-900 px-2 py-2 align-top uppercase">{row.status}</td>
                      <td className="border border-slate-900 px-2 py-2 align-top">-</td>
                      <td className="border border-slate-900 px-2 py-2 align-top">-</td>
                      <td className="border border-slate-900 px-2 py-2 align-top">-</td>
                      <td className="border border-slate-900 px-2 py-2 align-top">
                        <input
                          type="text"
                          aria-label="Koment"
                          className="h-4 w-full border-b border-slate-400 bg-transparent"
                        />
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
          )}
          {printPageMarkers.map((marker) => (
            <div
              key={`print-page-${marker.page}`}
              className="print-page-marker"
              style={{ top: `${marker.top}px` }}
            >
              Page {marker.page} / {marker.total}
            </div>
          ))}
          <div className="print-footer">
            <span />
            <div className="print-page-count">1/{printTotalPages}</div>
            <div className="print-initials">
              PUNOI: {printInitials || "-"}
            </div>
          </div>
        </div>
      </div>
      <style jsx global>{`
        .daily-report-table th,
        .daily-report-table td {
          vertical-align: bottom;
          padding-bottom: 0;
          padding-top: 15px;
          direction: ltr;
          text-align: left;
        }
        .weekly-report-table th,
        .weekly-report-table td {
          vertical-align: bottom;
          padding-bottom: 0;
          padding-top: 15px;
          padding-left: 4px;
          padding-right: 4px;
          direction: ltr;
          text-align: left;
        }
        .daily-report-table th:nth-child(3),
        .daily-report-table td:nth-child(3) {
          padding-left: 2px;
          padding-right: 2px;
        }
        .daily-report-table thead th {
          border-width: 2px;
          border-color: #cbd5e1;
        }
        .weekly-report-table thead th {
          border-width: 2px;
          border-color: #0f172a;
        }
        .daily-report-table thead tr {
          border-top: 2px solid #e2e8f0;
          border-bottom: 2px solid #e2e8f0;
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
            padding-bottom: 0.6in;
          }
          .print-page-measure {
            position: absolute;
            top: 0;
            left: 0;
            height: calc(8.5in - 0.25in - 0.35in);
            width: 1px;
            visibility: hidden;
            pointer-events: none;
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
          .print-meta {
            font-size: 11px;
            color: #334155;
            margin-bottom: 16px;
            display: grid;
            gap: 2px;
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
          .print-page-marker {
            position: absolute;
            left: 0.1in;
            right: 0.1in;
            text-align: center;
            font-size: 10px;
            color: #334155;
            z-index: 5;
            display: none;
          }
          .weekly-report-table thead {
            display: table-header-group;
          }
          .weekly-report-table th,
          .weekly-report-table td,
          .daily-report-table th,
          .daily-report-table td {
            vertical-align: bottom !important;
            direction: ltr;
            text-align: left;
          }
          .weekly-report-table th,
          .weekly-report-table td {
            padding-bottom: 0;
            padding-top: 15px;
            padding-left: 4px;
            padding-right: 4px;
          }
          .daily-report-table th:nth-child(3),
          .daily-report-table td:nth-child(3) {
            padding-left: 2px;
            padding-right: 2px;
          }
          .weekly-report-table,
          .daily-report-table {
            table-layout: fixed;
            margin-bottom: 0.6in;
            page-break-inside: auto;
          }
          .daily-report-table tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          .daily-report-table thead {
            display: table-header-group;
          }
          .daily-report-table tfoot {
            display: table-footer-group;
          }
          .weekly-report-table thead th {
            border-width: 2px;
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
          .daily-report-table th,
          .daily-report-table td {
            border: 1px solid #0f172a !important;
          }
          .daily-report-table {
            border-width: 2px;
            border-color: #0f172a;
            border-collapse: collapse !important;
            border-spacing: 0 !important;
          }
          .weekly-report-table {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-nr-cell {
            font-weight: 700;
          }
        }
      `}</style>
    </div>
  )
}
