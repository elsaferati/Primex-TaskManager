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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { BoldOnlyEditor } from "@/components/bold-only-editor"
import { useAuth } from "@/lib/auth"
import { normalizeDueDateInput } from "@/lib/dates"
import { formatDepartmentName } from "@/lib/department-name"
import type { DailyReportResponse, Department, GaNote, Meeting, Project, SystemTaskTemplate, Task, TaskAssignee, TaskFinishPeriod, TaskPriority, UserLookup } from "@/lib/types"

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

const PRIORITY_BADGE_STYLES: Record<TaskPriority, string> = {
  NORMAL: "border-amber-200 bg-amber-50 text-amber-700",
  HIGH: "border-red-200 bg-red-50 text-red-700",
}

const PRIORITY_BORDER_STYLES: Record<TaskPriority, string> = {
  NORMAL: "border-l-amber-500",
  HIGH: "border-l-red-600",
}

// Grid layout for system tasks table - matches system-tasks page
const GRID_CLASS = "grid grid-cols-[32px_minmax(200px,1fr)_120px_120px_100px_56px_80px_70px] xl:grid-cols-[36px_1fr_150px_150px_120px_64px_100px_80px] gap-2 xl:gap-4 items-center px-4"

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
  return (
    !hasProjectId(task.project_id) &&
    !hasProjectId(task.dependency_task_id) &&
    task.system_template_origin_id == null
  )
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

function abbreviateDepartmentName(name: string): string {
  const lowerName = name.toLowerCase()
  if (lowerName.includes("development")) return "DEV"
  if (lowerName.includes("graphic") && lowerName.includes("design")) return "GDS"
  if (lowerName.includes("product") && lowerName.includes("content")) return "PCM"
  if (lowerName.includes("project content")) return "PCM"
  // Return first 3 letters as fallback
  return name.slice(0, 3).toUpperCase()
}

const PRIORITY_BADGE: Record<"NORMAL" | "HIGH", string> = {
  NORMAL: "bg-emerald-100 text-emerald-800 border-emerald-200",
  HIGH: "bg-rose-100 text-rose-800 border-rose-200",
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

function isTaskActiveForDate(task: Task, targetDate: Date) {
  const targetKey = dayKey(targetDate)
  const start = toDate(task.start_date || task.created_at || task.due_date)
  const due = toDate(task.due_date || task.start_date || task.created_at)
  const startKey = start ? dayKey(start) : null
  const dueKey = due ? dayKey(due) : startKey

  const completedDate = task.completed_at ? toDate(task.completed_at) : null
  if (completedDate && dayKey(completedDate) < targetKey) return false

  if (startKey != null && targetKey < startKey) return false
  if (dueKey != null && targetKey > dueKey) return false
  return true
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

function getNextOccurrenceDate(t: SystemTaskTemplate, fromDate: Date = new Date()): Date {
  const today = new Date(fromDate)
  today.setHours(0, 0, 0, 0)
  
  if (t.frequency === "DAILY") {
    return today
  }
  
  if (t.frequency === "WEEKLY") {
    const days = t.days_of_week && t.days_of_week.length
      ? t.days_of_week
      : t.day_of_week != null
        ? [t.day_of_week]
        : [0] // Monday by default
    
    const currentDayIdx = today.getDay() === 0 ? 6 : today.getDay() - 1
    const sortedDays = [...days].sort((a, b) => a - b)
    
    // Find next day in this week
    for (const dayIdx of sortedDays) {
      if (dayIdx >= currentDayIdx) {
        const nextDate = new Date(today)
        nextDate.setDate(today.getDate() + (dayIdx - currentDayIdx))
        return nextDate
      }
    }
    
    // If no day found this week, use first day of next week
    const nextDate = new Date(today)
    const daysUntilNextWeek = 7 - currentDayIdx + sortedDays[0]
    nextDate.setDate(today.getDate() + daysUntilNextWeek)
    return nextDate
  }
  
  if (t.frequency === "MONTHLY") {
    const current = getScheduledDateForMonth(t, today.getFullYear(), today.getMonth())
    if (current && current >= today) {
      return current
    }
    const next = getScheduledDateForMonth(t, today.getFullYear(), today.getMonth() + 1)
    return next || today
  }
  
  if (t.frequency === "YEARLY") {
    if (t.day_of_month === 0) {
      const current = getYearEndDate(today.getFullYear())
      if (current && current >= today) {
        return current
      }
      return getYearEndDate(today.getFullYear() + 1)
    }
    if (t.month_of_year == null) {
      const current = getScheduledDateForMonth(t, today.getFullYear(), today.getMonth())
      if (current && current >= today) {
        return current
      }
      const next = getScheduledDateForMonth(t, today.getFullYear(), today.getMonth() + 1)
      if (next) return next
      return getScheduledDateForMonth(t, today.getFullYear() + 1, 0) || today
    }
    const targetMonth = t.month_of_year - 1
    const current = getScheduledDateForMonth(t, today.getFullYear(), targetMonth)
    if (current && current >= today) {
      return current
    }
    return getScheduledDateForMonth(t, today.getFullYear() + 1, targetMonth) || today
  }
  
  if (t.frequency === "3_MONTHS" || t.frequency === "6_MONTHS") {
    const interval = t.frequency === "3_MONTHS" ? 3 : 6
    let checkMonth = today.getMonth()
    let checkYear = today.getFullYear()
    
    // Check up to 2 years ahead
    for (let i = 0; i < 24; i++) {
      const monthValue = checkMonth + 1
      if (monthValue % interval === 0) {
        const candidate = getScheduledDateForMonth(t, checkYear, checkMonth)
        if (candidate && candidate >= today) {
          return candidate
        }
      }
      checkMonth++
      if (checkMonth >= 12) {
        checkMonth = 0
        checkYear++
      }
    }
  }
  
  return today
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
  if (task.is_r1) return "R1"
  if (task.is_1h_report) return "1H"
  if (task.is_personal) return "Personal"
  if (task.ga_note_origin_id) return "GA"
  return "Normal"
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function dayKey(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
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
  const [dailyReport, setDailyReport] = React.useState<DailyReportResponse | null>(null)
  const [loadingDailyReport, setLoadingDailyReport] = React.useState(false)
  const [dailyReportCommentEdits, setDailyReportCommentEdits] = React.useState<Record<string, string>>({})
  const [allUsersDailyReports, setAllUsersDailyReports] = React.useState<Map<string, DailyReportResponse>>(new Map())
  const [loadingAllUsersDailyReports, setLoadingAllUsersDailyReports] = React.useState(false)
  const [savingDailyReportComments, setSavingDailyReportComments] = React.useState<Record<string, boolean>>({})
  const [showAllSystem, setShowAllSystem] = React.useState(false)
  const [systemDate, setSystemDate] = React.useState(() => new Date())
  const [showDailyUserReport, setShowDailyUserReport] = React.useState(false)
  const [multiSelect, setMultiSelect] = React.useState(false)
  const [printRange, setPrintRange] = React.useState<"today" | "week">("week")
  const dailyReportScrollRef = React.useRef<HTMLDivElement | null>(null)
  const dailyReportDragRef = React.useRef({ isDragging: false, startX: 0, startScrollLeft: 0 })
  const [isDraggingDailyReport, setIsDraggingDailyReport] = React.useState(false)
  const [exportingDailyReport, setExportingDailyReport] = React.useState(false)
  const printContainerRef = React.useRef<HTMLDivElement | null>(null)
  const printMeasureRef = React.useRef<HTMLDivElement | null>(null)
  const [printPageMarkers, setPrintPageMarkers] = React.useState<Array<{ page: number; total: number; top: number }>>([])
  const [printPageMinHeight, setPrintPageMinHeight] = React.useState<number | null>(null)
  const [printTotalPages, setPrintTotalPages] = React.useState<number>(1)
  const [pendingPrint, setPendingPrint] = React.useState(false)

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
  const [projectDueDate, setProjectDueDate] = React.useState("")

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
  const [noProjectAssignees, setNoProjectAssignees] = React.useState<string[]>([])
  const [selectNoProjectAssigneesOpen, setSelectNoProjectAssigneesOpen] = React.useState(false)
  const [noProjectStartDate, setNoProjectStartDate] = React.useState("")
  const [noProjectDueDate, setNoProjectDueDate] = React.useState("")
  const [noProjectFinishPeriod, setNoProjectFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(
    FINISH_PERIOD_NONE_VALUE
  )
  const [creatingNoProject, setCreatingNoProject] = React.useState(false)
  const [deletingNoProjectTaskId, setDeletingNoProjectTaskId] = React.useState<string | null>(null)
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null)
  const [editTaskTitle, setEditTaskTitle] = React.useState("")
  const [editTaskDescription, setEditTaskDescription] = React.useState("")
  const [editTaskStartDate, setEditTaskStartDate] = React.useState("")
  const [editTaskDueDate, setEditTaskDueDate] = React.useState("")
  const [editTaskFinishPeriod, setEditTaskFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(FINISH_PERIOD_NONE_VALUE)
  const [updatingTask, setUpdatingTask] = React.useState(false)

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

        // Fetch users first so we can filter tasks by assignee departments
        const usersRes = await apiFetch("/users/lookup")
        let allUsers: UserLookup[] = []
        if (usersRes.ok) {
          allUsers = (await usersRes.json()) as UserLookup[]
          setUsers(allUsers)
        }
        
        // Create a set of user IDs that belong to this department
        const departmentUserIds = new Set(
          allUsers.filter((u) => u.department_id === dep.id).map((u) => u.id)
        )

        const [projRes, sysRes, tasksRes, gaRes, meetingsRes] = await Promise.all([
          apiFetch(`/projects?department_id=${dep.id}&include_templates=true`),
          apiFetch(`/system-tasks?department_id=${dep.id}`),
          // Remove department_id filter to get all tasks, then filter client-side
          apiFetch(`/tasks?include_done=false`),
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
          // Filter tasks: include if task belongs to this department OR any assignee belongs to this department
          const nonSystemTasks = taskRows.filter((t) => {
            // Exclude system tasks and template projects
            if (t.system_template_origin_id || (t.project_id && templateProjectIds.has(t.project_id))) {
              return false
            }
            // Include if task belongs to this department
            if (t.department_id === dep.id) return true
            // Include if primary assignee belongs to this department
            if (t.assigned_to && departmentUserIds.has(t.assigned_to)) return true
            // Include if any assignee in the assignees array belongs to this department
            if (t.assignees?.some((a) => a.id && departmentUserIds.has(a.id))) return true
            return false
          })
          setDepartmentTasks(nonSystemTasks)
          setNoProjectTasks(nonSystemTasks.filter(isNoProjectTask))
        }
        if (gaRes.ok) setGaNotes((await gaRes.json()) as GaNote[])
        if (meetingsRes.ok) setMeetings((await meetingsRes.json()) as Meeting[])

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
    const handleBeforePrint = () => {
      const container = printContainerRef.current
      if (!container) return
      const dpi = 96
      const measuredHeight = printMeasureRef.current?.offsetHeight
      const pageHeightPx = measuredHeight ?? (11 * dpi - (0.36 + 0.51) * dpi)
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
    if (isTabId) {
      setActiveTab(normalizedTab as TabId)
    }
  }, [isTabId, normalizedTab])

  // --- MEMOS ---
  const userMap = React.useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const departmentUsers = React.useMemo(
    () =>
      department
        ? users.filter((u) => {
            if (u.department_id !== department.id) return false
            const username = u.username?.toLowerCase()
            const fullName = u.full_name?.toLowerCase()
            return username !== "admin" && fullName !== "admin"
          })
        : [],
    [department, users]
  )
  const noProjectAssigneeLabel = React.useMemo(() => {
    if (noProjectAssignees.length === 0) return "Unassigned"
    if (users.length && noProjectAssignees.length === users.length) return "All users"
    if (noProjectAssignees.length === 1) {
      const selected = users.find((u) => u.id === noProjectAssignees[0])
      return selected?.full_name || selected?.username || "1 selected"
    }
    return `${noProjectAssignees.length} selected`
  }, [users, noProjectAssignees])
  const projectPhaseOptions = projectType === "MST" ? MST_PROJECT_PHASES : GENERAL_PROJECT_PHASES
  const mstTemplateOptions = React.useMemo(() => {
    return templateProjects.filter((p) => {
      if (p.project_type) return p.project_type === "MST"
      const title = (p.title || p.name || "").toUpperCase()
      return title.includes("MST")
    })
  }, [templateProjects])
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
    let filtered = projects.filter((p) => p.project_type !== "GENERAL")
    if (viewMode === "mine" && user?.id) {
      filtered = filtered.filter((p) => p.manager_id === user.id)
    }
    return filtered
  }, [projects, user?.id, viewMode])

  const visibleDepartmentTasks = React.useMemo(
    () => (isMineView && user?.id ? departmentTasks.filter((t) => t.assigned_to === user.id) : departmentTasks),
    [departmentTasks, isMineView, user?.id]
  )
  const visibleNoProjectTasks = React.useMemo(() => {
    const base = isMineView && user?.id ? noProjectTasks.filter((t) => t.assigned_to === user.id) : noProjectTasks
    const filtered = base.filter(isNoProjectTask)
    
    // Deduplicate tasks by ID first, then by title+properties as fallback
    // This handles cases where backend creates separate task records per assignee
    const taskMapById = new Map<string, Task>()
    const taskMapByKey = new Map<string, Task>()
    
    // Helper to create a unique key for grouping similar tasks
    const getTaskKey = (task: Task): string => {
      return [
        task.title || "",
        task.department_id || "",
        task.is_bllok ? "bllok" : "",
        task.is_r1 ? "r1" : "",
        task.is_1h_report ? "1h" : "",
        task.is_personal ? "personal" : "",
        task.ga_note_origin_id || "",
        task.start_date || "",
        task.due_date || "",
      ].join("|")
    }
    
    for (const t of filtered) {
      // First try to deduplicate by ID
      const existingById = taskMapById.get(t.id)
      if (existingById) {
        // Merge assignees if task already exists with same ID
        const assigneeMap = new Map<string, TaskAssignee>()
        
        // Add existing assignees
        if (existingById.assigned_to && userMap.has(existingById.assigned_to)) {
          const user = userMap.get(existingById.assigned_to)!
          assigneeMap.set(existingById.assigned_to, {
            id: existingById.assigned_to,
            full_name: user.full_name || null,
            username: user.username || null,
            email: user.email || null,
            department_id: user.department_id || null,
          })
        }
        existingById.assignees?.forEach(a => {
          if (a.id) assigneeMap.set(a.id, a)
        })
        
        // Add new task's assignees
        if (t.assigned_to && userMap.has(t.assigned_to)) {
          const user = userMap.get(t.assigned_to)!
          assigneeMap.set(t.assigned_to, {
            id: t.assigned_to,
            full_name: user.full_name || null,
            username: user.username || null,
            email: user.email || null,
            department_id: user.department_id || null,
          })
        }
        t.assignees?.forEach(a => {
          if (a.id) assigneeMap.set(a.id, a)
        })
        
        // Update existing task with merged assignees
        existingById.assignees = Array.from(assigneeMap.values())
        if (!existingById.assigned_to && t.assigned_to) {
          existingById.assigned_to = t.assigned_to
        }
        continue
      }
      
      // If not found by ID, check if we have a similar task by key (title+properties)
      const taskKey = getTaskKey(t)
      const existingByKey = taskMapByKey.get(taskKey)
      if (existingByKey && existingByKey.id !== t.id) {
        // Found a similar task with different ID - merge assignees into the existing task
        const assigneeMap = new Map<string, TaskAssignee>()
        
        // Add existing assignees
        if (existingByKey.assigned_to && userMap.has(existingByKey.assigned_to)) {
          const user = userMap.get(existingByKey.assigned_to)!
          assigneeMap.set(existingByKey.assigned_to, {
            id: existingByKey.assigned_to,
            full_name: user.full_name || null,
            username: user.username || null,
            email: user.email || null,
            department_id: user.department_id || null,
          })
        }
        existingByKey.assignees?.forEach(a => {
          if (a.id) assigneeMap.set(a.id, a)
        })
        
        // Add new task's assignees
        if (t.assigned_to && userMap.has(t.assigned_to)) {
          const user = userMap.get(t.assigned_to)!
          assigneeMap.set(t.assigned_to, {
            id: t.assigned_to,
            full_name: user.full_name || null,
            username: user.username || null,
            email: user.email || null,
            department_id: user.department_id || null,
          })
        }
        t.assignees?.forEach(a => {
          if (a.id) assigneeMap.set(a.id, a)
        })
        
        // Update existing task with merged assignees
        existingByKey.assignees = Array.from(assigneeMap.values())
        if (!existingByKey.assigned_to && t.assigned_to) {
          existingByKey.assigned_to = t.assigned_to
        }
        // Also add this task's ID to taskMapById so we don't process it again
        taskMapById.set(t.id, existingByKey)
        continue
      }
      
      // New unique task - add it to both maps
      const taskCopy = { ...t }
      taskMapById.set(t.id, taskCopy)
      taskMapByKey.set(taskKey, taskCopy)
    }
    
    // Use a Set to ensure we only get unique task objects
    const uniqueTasks = new Set<Task>(taskMapById.values())
    return Array.from(uniqueTasks)
  }, [noProjectTasks, isMineView, user?.id, userMap])
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
      if (!isMineView || !user?.id) return depTasks
      return depTasks.filter((t) => {
        // Check if user is the default assignee
        if (t.default_assignee_id === user.id) return true
        // Check if user is in the assignees array
        if (t.assignees?.some((assignee) => assignee.id === user.id)) return true
        // Check if user is in the alignment_user_ids array
        if (t.alignment_user_ids?.includes(user.id)) return true
        return false
      })
    },
    [systemTasks, isMineView, user?.id, department]
  )

  const projectTasks = React.useMemo(
    () => visibleDepartmentTasks.filter((t) => t.project_id),
    [visibleDepartmentTasks]
  )
  const todaySystemTasks = React.useMemo(
    () => {
      const todayTasks = visibleSystemTemplates.filter((t) => shouldShowTemplate(t, todayDate))
      
      // If in "my view", also include overdue system tasks where next occurrence has passed
      if (isMineView && user?.id && dailyReport?.system_overdue?.length) {
        const todayTaskIds = new Set(todayTasks.map((t) => t.template_id || t.id))
        const overdueTaskIds = new Set(dailyReport.system_overdue.map((occ) => occ.template_id))
        
        const overdueTasks = visibleSystemTemplates.filter((t) => {
          const templateId = t.template_id || t.id
          // Skip if already in today's tasks
          if (todayTaskIds.has(templateId)) return false
          // Only include if it's in overdue list
          if (!overdueTaskIds.has(templateId)) return false
          
          // Check if next occurrence date has passed
          const nextOccurrence = getNextOccurrenceDate(t, todayDate)
          const nextOccurrenceKey = dayKey(nextOccurrence)
          const todayKey = dayKey(todayDate)
          
          // Only show if next occurrence is in the past (overdue)
          return nextOccurrenceKey < todayKey
        })
        
        return [...todayTasks, ...overdueTasks]
      }
      
      return todayTasks
    },
    [visibleSystemTemplates, todayDate, isMineView, user?.id, dailyReport?.system_overdue]
  )
  const openNotes = React.useMemo(() => visibleGaNotes.filter((n) => n.status !== "CLOSED"), [visibleGaNotes])
  const todayProjectTasks = React.useMemo(() => {
    return projectTasks.filter((task) => {
      if (!isTaskActiveForDate(task, todayDate)) return false
      if (selectedUserId !== "__all__") {
        return task.assigned_to === selectedUserId
      }
      return true
    })
  }, [projectTasks, todayDate, selectedUserId])
  const todayNoProjectTasks = React.useMemo(() => {
    return visibleNoProjectTasks.filter((task) => {
      if (!isTaskActiveForDate(task, todayDate)) return false
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
  const dailyReportFastTasks = React.useMemo(() => {
    return visibleNoProjectTasks.filter((task) => {
      if (!isTaskActiveForDate(task, todayDate)) return false
      const completedDate = task.completed_at ? toDate(task.completed_at) : null
      const completedToday = completedDate ? isSameDay(completedDate, todayDate) : false
      if (completedDate && !completedToday) return false
      return true
    })
  }, [todayDate, visibleNoProjectTasks])
  const dailyReportProjectTasks = React.useMemo(() => {
    return projectTasks.filter((task) => {
      if (!isTaskActiveForDate(task, todayDate)) return false
      const completedDate = task.completed_at ? toDate(task.completed_at) : null
      const completedToday = completedDate ? isSameDay(completedDate, todayDate) : false
      if (completedDate && !completedToday) return false
      return true
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
        systemTemplateId: occ.template_id,
        systemOccurrenceDate: occ.occurrence_date,
        systemStatus: occ.status,
      })
    }

    for (const tmpl of todaySystemTasks) {
      const templateId = tmpl.template_id || tmpl.id
      const occ = systemTodayByTemplate.get(templateId) || null
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
        period: resolvePeriod(tmpl.finish_period, occ?.occurrence_date || todayIso),
        title: occ?.title || tmpl.title || "-",
        description: tmpl.description || "-",
        status: formatSystemOccurrenceStatus(occ?.status || tmpl.status),
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
        systemTemplateId: templateId,
        systemOccurrenceDate: occ?.occurrence_date || todayIso,
        systemStatus: occ?.status || "OPEN",
      })
    }

    for (const task of dailyReportFastTasks) {
      const baseDate = toDate(task.start_date || task.planned_for || task.due_date || task.created_at)
      fastRows.push({
        order: fastTypeOrder(task),
        index: fastIndex,
        row: {
          typeLabel: "FT",
          subtype: fastReportSubtypeShort(task),
          period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.planned_for || task.created_at),
          title: task.title || "-",
          description: task.description || "-",
          status: taskStatusLabel(task),
          bz: "-",
          kohaBz: "-",
          tyo: getTyoLabel(baseDate, task.completed_at, todayDate),
          comment: task.user_comment ?? null,
          taskId: task.id,
        },
      })
      fastIndex += 1
    }

    for (const task of dailyReportProjectTasks) {
      const baseDate = toDate(task.start_date || task.due_date || task.created_at)
      const project = task.project_id ? projects.find((p) => p.id === task.project_id) || null : null
      const projectLabel = project?.title || project?.name || "-"
      projectRows.push({
        typeLabel: "PRJK",
        subtype: "-",
        period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at),
        title: `${projectLabel} - ${task.title || "-"}`,
        description: task.description || "-",
        status: taskStatusLabel(task),
        bz: "-",
        kohaBz: "-",
        tyo: getTyoLabel(baseDate, task.completed_at, todayDate),
        comment: task.user_comment ?? null,
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
  ])

  // Helper function to convert DailyReportResponse to rows for print view
  const convertDailyReportToRows = React.useCallback(
    (report: DailyReportResponse, userId: string): Array<{
      typeLabel: string
      subtype: string
      period: string
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
    }> => {
      const rows: ReturnType<typeof convertDailyReportToRows> = []
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

      const printedTaskIds = new Set<string>()

      for (const task of allTasks) {
        const dueDate = toDate(task.due_date)
        const startDate = toDate(task.start_date)
        const createdDate = toDate(task.created_at)

        // Use the start date (or the earliest available date) to decide whether a task
        // is active for the daily report. This keeps it visible from start_date until due_date.
        const baseDate = startDate || createdDate || dueDate
        const dueKey = dueDate ? dayKey(dueDate) : null
        const startKey = baseDate ? dayKey(baseDate) : null

        // Skip tasks that haven't started yet.
        if (baseDate && dayKey(baseDate) > dayKey(todayDate)) {
          continue
        }

        // If a due date exists, keep the task visible through the due date (inclusive).
        if (dueKey != null && startKey != null && dayKey(todayDate) > dueKey && !task.completed_at) {
          // It will already be listed under overdue from the API; avoid double‑adding here.
          continue
        }

        printedTaskIds.add(task.id)

        const isProject = Boolean(task.project_id)
        const project = task.project_id ? projects.find((p) => p.id === task.project_id) || null : null
        const projectLabel = project?.title || project?.name || "-"

        if (isProject) {
          projectRows.push({
            typeLabel: "PRJK",
            subtype: "-",
            period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at),
            title: `${projectLabel} - ${task.title || "-"}`,
            description: task.description || "-",
            status: taskStatusLabel(task),
            bz: "-",
            kohaBz: "-",
            tyo: getTyoLabel(baseDate, task.completed_at, todayDate),
            comment: task.user_comment ?? null,
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
              title: task.title || "-",
              description: task.description || "-",
              status: taskStatusLabel(task),
              bz: "-",
              kohaBz: "-",
              tyo: getTyoLabel(baseDate, task.completed_at, todayDate),
              comment: task.user_comment ?? null,
              taskId: task.id,
            },
          })
          fastIndex += 1
        }
      }

      // Include in-progress tasks that fall between start_date and due_date (inclusive) but
      // are missing from the API payload, so they appear every day of their active window.
      const rangeTasks = visibleDepartmentTasks.filter((task) => {
        const assigned =
          task.assigned_to === userId ||
          (task.assignees && task.assignees.some((a) => a.id === userId))
        if (!assigned) return false

        const startDate = toDate(task.start_date || task.created_at)
        const dueDate = toDate(task.due_date || task.start_date || task.created_at)
        const todayKey = dayKey(todayDate)
        const startKey = startDate ? dayKey(startDate) : null
        const dueKey = dueDate ? dayKey(dueDate) : null

        if (startKey != null && todayKey < startKey) return false
        if (dueKey != null && todayKey > dueKey) return false
        return true
      })

      for (const task of rangeTasks) {
        if (printedTaskIds.has(task.id)) continue
        const startDate = toDate(task.start_date || task.created_at)
        const dueDate = toDate(task.due_date || task.start_date || task.created_at)
        const baseDate = startDate || dueDate || toDate(task.created_at)
        const isProject = Boolean(task.project_id)
        const project = task.project_id ? projects.find((p) => p.id === task.project_id) || null : null
        const projectLabel = project?.title || project?.name || "-"

        if (isProject) {
          projectRows.push({
            typeLabel: "PRJK",
            subtype: "-",
            period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at),
            title: `${projectLabel} - ${task.title || "-"}`,
            description: task.description || "-",
            status: taskStatusLabel(task),
            bz: "-",
            kohaBz: "-",
            tyo: getTyoLabel(baseDate, task.completed_at, todayDate),
            comment: task.user_comment ?? null,
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
              title: task.title || "-",
              description: task.description || "-",
              status: taskStatusLabel(task),
              bz: "-",
              kohaBz: "-",
              tyo: getTyoLabel(baseDate, task.completed_at, todayDate),
              comment: task.user_comment ?? null,
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
    [projects, systemTemplateById, todayDate, userMap]
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
  const printedAt = React.useMemo(() => new Date(), [])
  const printRangeLabel = React.useMemo(() => {
    if (printRange === "today") {
      const dateLabel = todayDate.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
      return `Today - ${dateLabel}`
    }
    return weekRangeLabel
  }, [printRange, todayDate, weekRangeLabel])
  const printInitials = initials(user?.full_name || user?.username || "")
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

  const setDailyReportCommentSaving = (key: string, value: boolean) => {
    setSavingDailyReportComments((prev) => ({ ...prev, [key]: value }))
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

      setDailyReport((prev) => {
        if (!prev) return prev
        return prev
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

  const handleDailyReportMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
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
    const container = dailyReportScrollRef.current
    if (!container || !dailyReportDragRef.current.isDragging) return
    event.preventDefault()
    const x = event.pageX - container.offsetLeft
    const walk = x - dailyReportDragRef.current.startX
    container.scrollLeft = dailyReportDragRef.current.startScrollLeft - walk
  }

  const handleDailyReportMouseEnd = () => {
    if (!dailyReportDragRef.current.isDragging) return
    dailyReportDragRef.current.isDragging = false
    setIsDraggingDailyReport(false)
  }

  const allTodayPrintBaseUsers = React.useMemo(() => {
    if (viewMode === "department") {
      if (selectedUserId !== "__all__") {
        const selected = departmentUsers.find((member) => member.id === selectedUserId)
        return selected ? [selected] : []
      }
      return departmentUsers
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
        const lookup = userMap.get(userId)
        return {
          id: userId,
          label: lookup?.full_name || lookup?.username || "Unknown",
        }
      })
      .filter((column) => column.label !== "Unknown")
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
        >((acc, category) => {
          acc[category] = []
          return acc
        }, {})
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
    [filteredProjects, visibleSystemTemplates, visibleNoProjectTasks, visibleGaNotes, visibleMeetings, todayProjectTasks, todayNoProjectTasks, todayOpenNotes, todaySystemTasks, todayMeetings]
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
    // In "My View" mode, automatically show daily report for printing
    if (viewMode === "mine" && !showDailyUserReport) {
      setShowDailyUserReport(true)
      setPrintRange("today")
      // Use setTimeout to ensure state updates before printing
      setTimeout(() => {
        window.print()
      }, 0)
      return
    }
    
    if (showAllTodayPrint && loadingAllUsersDailyReports) {
      setPendingPrint(true)
      return
    }
    window.print()
  }, [loadingAllUsersDailyReports, showAllTodayPrint, viewMode, showDailyUserReport])

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

  const canCreate =
    user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "STAFF" // All roles may create/manage
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
    // Deduplicate tasks by ID first, then by title+properties as fallback
    // This handles cases where backend creates separate task records per assignee
    const taskMapById = new Map<string, Task>()
    const taskMapByKey = new Map<string, Task>()
    
    // Helper to create a unique key for grouping similar tasks
    const getTaskKey = (task: Task): string => {
      return [
        task.title || "",
        task.department_id || "",
        task.is_bllok ? "bllok" : "",
        task.is_r1 ? "r1" : "",
        task.is_1h_report ? "1h" : "",
        task.is_personal ? "personal" : "",
        task.ga_note_origin_id || "",
        task.start_date || "",
        task.due_date || "",
      ].join("|")
    }
    
    for (const t of visibleNoProjectTasks) {
      // First try to deduplicate by ID
      const existingById = taskMapById.get(t.id)
      if (existingById) {
        // Merge assignees if task already exists with same ID
        const assigneeMap = new Map<string, TaskAssignee>()
        
        // Add existing assignees
        if (existingById.assigned_to && userMap.has(existingById.assigned_to)) {
          const user = userMap.get(existingById.assigned_to)!
          assigneeMap.set(existingById.assigned_to, {
            id: existingById.assigned_to,
            full_name: user.full_name || null,
            username: user.username || null,
            email: user.email || null,
            department_id: user.department_id || null,
          })
        }
        existingById.assignees?.forEach(a => {
          if (a.id) assigneeMap.set(a.id, a)
        })
        
        // Add new task's assignees
        if (t.assigned_to && userMap.has(t.assigned_to)) {
          const user = userMap.get(t.assigned_to)!
          assigneeMap.set(t.assigned_to, {
            id: t.assigned_to,
            full_name: user.full_name || null,
            username: user.username || null,
            email: user.email || null,
            department_id: user.department_id || null,
          })
        }
        t.assignees?.forEach(a => {
          if (a.id) assigneeMap.set(a.id, a)
        })
        
        // Update existing task with merged assignees
        existingById.assignees = Array.from(assigneeMap.values())
        if (!existingById.assigned_to && t.assigned_to) {
          existingById.assigned_to = t.assigned_to
        }
        continue
      }
      
      // If not found by ID, check if we have a similar task by key (title+properties)
      const taskKey = getTaskKey(t)
      const existingByKey = taskMapByKey.get(taskKey)
      if (existingByKey && existingByKey.id !== t.id) {
        // Found a similar task with different ID - merge assignees into the existing task
        // existingByKey should be the same reference as in taskMapById
        const assigneeMap = new Map<string, TaskAssignee>()
        
        // Add existing assignees
        if (existingByKey.assigned_to && userMap.has(existingByKey.assigned_to)) {
          const user = userMap.get(existingByKey.assigned_to)!
          assigneeMap.set(existingByKey.assigned_to, {
            id: existingByKey.assigned_to,
            full_name: user.full_name || null,
            username: user.username || null,
            email: user.email || null,
            department_id: user.department_id || null,
          })
        }
        existingByKey.assignees?.forEach(a => {
          if (a.id) assigneeMap.set(a.id, a)
        })
        
        // Add new task's assignees
        if (t.assigned_to && userMap.has(t.assigned_to)) {
          const user = userMap.get(t.assigned_to)!
          assigneeMap.set(t.assigned_to, {
            id: t.assigned_to,
            full_name: user.full_name || null,
            username: user.username || null,
            email: user.email || null,
            department_id: user.department_id || null,
          })
        }
        t.assignees?.forEach(a => {
          if (a.id) assigneeMap.set(a.id, a)
        })
        
        // Update existing task with merged assignees (this updates the same object in both maps)
        existingByKey.assignees = Array.from(assigneeMap.values())
        if (!existingByKey.assigned_to && t.assigned_to) {
          existingByKey.assigned_to = t.assigned_to
        }
        // Also add this task's ID to taskMapById so we don't process it again
        taskMapById.set(t.id, existingByKey)
        // Don't add this task to taskMapByKey, we've merged it into existingByKey
        continue
      }
      
      // New unique task - add it to both maps (same object reference)
      const taskCopy = { ...t }
      taskMapById.set(t.id, taskCopy)
      taskMapByKey.set(taskKey, taskCopy)
    }
    
    // Use tasks from ID map (they're the source of truth)
    // Use a Set to ensure we only get unique task objects (in case multiple IDs point to same object)
    const uniqueTasks = new Set<Task>(taskMapById.values())
    const deduplicatedTasks = Array.from(uniqueTasks)
    
    // Now categorize the deduplicated tasks
    for (const t of deduplicatedTasks) {
      if (t.is_bllok) {
        blocked.push(t)
      } else if (t.is_r1) {
        r1.push(t)
      } else if (t.is_1h_report) {
        oneHour.push(t)
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

  // Helper function for assignee summary
  const assigneeSummary = (list?: SystemTaskTemplate["assignees"]) => {
    if (!list || list.length === 0) return "-"
    if (list.length <= 2) {
      return list
        .map((person) => person.full_name || person.username || ("email" in person ? person.email : ""))
        .join(", ")
    }
    return `${list.length} people`
  }

  // Flattened and sorted list of all system tasks for table view
  const sortedSystemTasks = React.useMemo(() => {
    const frequencyOrder: Record<SystemTaskTemplate["frequency"], number> = {
      DAILY: 0,
      WEEKLY: 1,
      MONTHLY: 2,
      "3_MONTHS": 3,
      "6_MONTHS": 4,
      YEARLY: 5,
    }
    const priorityOrder: Record<TaskPriority, number> = {
      HIGH: 0,
      NORMAL: 1,
    }
    return [...visibleSystemTasks].sort((a, b) => {
      const aInactive = !a.is_active
      const bInactive = !b.is_active
      if (aInactive !== bInactive) return aInactive ? 1 : -1
      const aFrequency = frequencyOrder[a.frequency] ?? 999
      const bFrequency = frequencyOrder[b.frequency] ?? 999
      if (aFrequency !== bFrequency) return aFrequency - bFrequency
      const aPriority = priorityOrder[normalizePriority(a.priority)]
      const bPriority = priorityOrder[normalizePriority(b.priority)]
      if (aPriority !== bPriority) return aPriority - bPriority
      const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0
      const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0
      if (aCreated !== bCreated) return bCreated - aCreated
      return a.title.localeCompare(b.title)
    })
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
        current_phase: projectType === "MST" ? "PLANNING" : "MEETINGS", // Automatically set to first phase
        status: projectStatus,
      }
      
      // Add due_date if provided
      if (projectDueDate.trim()) {
        const normalized = normalizeDueDateInput(projectDueDate.trim())
        if (normalized) {
          payload.due_date = new Date(normalized).toISOString()
        }
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
      setProjectDueDate("")
      toast.success("Project created")
    } finally {
      setCreatingProject(false)
    }
  }

  const submitNoProjectTask = async () => {
    if (!noProjectTitle.trim() || !noProjectStartDate || !department) return
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
        // If GA note creation failed or was skipped, still tag the task as GA so it shows in GA bucket.
        if (!gaNoteId) {
          gaNoteId = "__ga__"
        }
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
        const res = await apiFetch("/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, assigned_to: assigneeId }) })
        if (res.ok) {
          const created = (await res.json()) as Task
          // Ensure boolean flags are set correctly based on type
          if (noProjectType === "personal") {
            created.is_personal = true
          }
          // Ensure the task has the correct properties for filtering
          if (noProjectType === "normal") {
            created.is_bllok = false
            created.is_1h_report = false
            created.is_r1 = false
            created.is_personal = false
            created.priority = created.priority || "NORMAL"
          }
          createdTasks.push(created)
        }
      }
      if (createdTasks.length) {
        // Add all non-project tasks to noProjectTasks (they'll be categorized into buckets)
        // For normal tasks, ensure they pass isNoProjectTask by verifying properties
        const nonProjectTasks = createdTasks.filter((t) => {
          // Double-check that normal tasks are included
          if (noProjectType === "normal" && !t.project_id && !t.system_template_origin_id && !t.ga_note_origin_id) {
            return true
          }
          return isNoProjectTask(t)
        })
        if (nonProjectTasks.length) {
          setNoProjectTasks((prev) => [...nonProjectTasks, ...prev])
        }
        // Also add to departmentTasks for consistency
        setDepartmentTasks((prev) => [...createdTasks, ...prev])
        toast.success(`Created ${createdTasks.length} task${createdTasks.length > 1 ? "s" : ""}`)
      }
      setNoProjectOpen(false)
      setNoProjectTitle("")
      setNoProjectDescription("")
      setNoProjectAssignees([])
      setNoProjectStartDate("")
      setNoProjectDueDate("")
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
          // Add to noProjectTasks if it is a no-project task (GA notes can create these)
          if (isNoProjectTask(createdTask)) {
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
      // Add to noProjectTasks if it is a no-project task (GA notes can create these)
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
                        <DialogHeader>
                          <DialogTitle>Add Project</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="space-y-2">
                            <Label>Template</Label>
                            <Select
                              value={projectType}
                              onValueChange={(value) => {
                                setProjectType(value as (typeof PROJECT_TYPES)[number]["id"])
                                if (value !== "MST") {
                                  setMstTemplateId("__auto__")
                                }
                              }}
                            >
                              <SelectTrigger className="rounded-xl">
                                <SelectValue placeholder="Select template" />
                              </SelectTrigger>
                              <SelectContent>
                                {PROJECT_TYPES.map((type) => (
                                  <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Title</Label>
                            <Input
                              className="rounded-xl"
                              value={projectTitle}
                              onChange={(e) => setProjectTitle(e.target.value)}
                              placeholder="Enter project shortcut (e.g., ABC, XYZ)"
                            />
                            <div className="text-xs text-muted-foreground">
                              Use a shortcut/abbreviation, not the full client name (e.g., "ABC" instead of "ABC Company").
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                              className="rounded-xl"
                              value={projectDescription}
                              onChange={(e) => setProjectDescription(e.target.value)}
                              placeholder="Enter the project description..."
                            />
                          </div>
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
                          {projectType === "MST" && (
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
                          )}
                          <div className="space-y-2">
                            <Label>Due Date</Label>
                            <Input
                              type="date"
                              value={projectDueDate}
                              onChange={(e) => setProjectDueDate(e.target.value)}
                              className="rounded-xl"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => setCreateProjectOpen(false)} className="rounded-xl">
                            Cancel
                          </Button>
                          <Button
                            disabled={!projectTitle.trim() || creatingProject}
                            onClick={() => void submitProject()}
                            className="rounded-xl"
                          >
                            {creatingProject ? "Saving..." : "Save"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                      <div key={project.id} className="group flex flex-col gap-4 justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{formatProjectTitleWithProducts(project)}</h3>
                              {/* Single Phase Badge */}
                              <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 text-xs">
                                {PHASE_LABELS[phase]}
                              </Badge>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Tasks</div>
                              <div className="text-lg font-semibold text-slate-900 dark:text-white">{tasks.length}</div>
                            </div>
                          </div>

                          {/* Description */}
                          <p className="text-xs leading-relaxed text-slate-600 line-clamp-2 dark:text-slate-400">
                            {project.description
                              ? project.description.split(".").slice(0, 3).join(".").trim() + (project.description.includes(".") ? "." : "")
                              : "No description provided."}
                          </p>

                          {/* Taskbar: Horizontal list of tasks */}
                          {tasks.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Task Summary</div>
                              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                                {tasks.slice(0, 4).map(t => (
                                  <div key={t.id} className="flex-shrink-0 max-w-[120px] truncate rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                    {t.title}
                                  </div>
                                ))}
                                {tasks.length > 4 && <div className="flex-shrink-0 rounded-md bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">+{tasks.length - 4}</div>}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
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

                          <Link href={`/projects/design/${project.id}`} className="flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400">
                            View →
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
                      <>
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
                        <Button
                          variant="outline"
                          className="h-9 rounded-xl border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm hover:bg-slate-50"
                          onClick={handlePrint}
                        >
                          <Printer className="mr-2 h-4 w-4" />
                          Print
                        </Button>
                        <Button
                          variant="outline"
                          className="h-9 rounded-xl border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm hover:bg-slate-50"
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
                    { label: "PROJECT TASKS", value: todayProjectTasks.length },
                    { label: "GA NOTES", value: todayOpenNotes.length },
                    { label: "FAST TASKS", value: visibleNoProjectTasks.length },
                    { label: "SYSTEM TASKS", value: todaySystemTasks.length },
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
                      <div className="flex items-center gap-3">
                        {loadingDailyReport ? <div className="text-xs text-slate-500">Loading...</div> : null}
                        <Button
                          variant="outline"
                          className="h-8 rounded-lg border-slate-300 bg-white px-3 text-xs text-slate-900 shadow-sm hover:bg-slate-50"
                          onClick={exportDailyReport}
                          disabled={exportingDailyReport}
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
                            <th className="border border-slate-200 px-2 py-2 text-left text-xs uppercase whitespace-normal">NLL</th>
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
                <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Daily Report (Overdue)</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Shows overdue items for the selected user (not for “All users”).
                      </div>
                    </div>
                    {loadingDailyReport ? <div className="text-xs text-slate-500">Loading…</div> : null}
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
                    <div className="relative w-full rounded-xl bg-white border border-slate-200 border-l-4 border-sky-500 p-4 text-slate-700 md:w-48 md:shrink-0">
                      <div className="text-sm font-semibold">GA NOTES</div>
                      <span className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {todayOpenNotes.length}
                      </span>
                      <div className="mt-2 text-xs text-slate-500">Quick notes</div>
                    </div>
                    <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 flex flex-col">
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

                  <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row">
                    <div className="relative w-full rounded-xl bg-white border border-slate-200 border-l-4 border-blue-500 p-4 text-slate-700 md:w-48 md:shrink-0">
                      <div className="text-sm font-semibold">FAST TASKS</div>
                      <span className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {visibleNoProjectTasks.length}
                      </span>
                      <div className="mt-2 text-xs text-slate-500">Ad-hoc tasks</div>
                    </div>
                    <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 flex flex-col max-h-[300px] overflow-y-auto">
                      {visibleNoProjectTasks.length ? (
                        <div className="space-y-2">
                          {visibleNoProjectTasks.map((task) => {
                            const typeLabel = noProjectTypeLabel(task)
                            // Collect all assignees: from assigned_to and assignees array
                            const assigneeIds = new Set<string>()
                            if (task.assigned_to) {
                              assigneeIds.add(task.assigned_to)
                            }
                            if (task.assignees) {
                              for (const assignee of task.assignees) {
                                if (assignee.id) {
                                  assigneeIds.add(assignee.id)
                                }
                              }
                            }
                            return (
                              <Link
                                key={task.id}
                                href={`/tasks/${task.id}`}
                                className="block rounded-lg border border-slate-200 border-l-4 border-blue-500 bg-white px-3 py-2 text-sm transition hover:bg-slate-50"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs">
                                      {typeLabel}
                                    </Badge>
                                    <div className="font-medium text-slate-800">{task.title}</div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {Array.from(assigneeIds).map((userId) => {
                                      const userFromMap = userMap.get(userId)
                                      const assigneeFromArray = task.assignees?.find(a => a.id === userId)
                                      const label = userFromMap 
                                        ? assigneeLabel(userFromMap)
                                        : (assigneeFromArray?.full_name || assigneeFromArray?.username || "-")
                                      return (
                                        <div
                                          key={userId}
                                          className="h-6 w-6 rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600 flex items-center justify-center"
                                          title={label}
                                        >
                                          {initials(label)}
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              </Link>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500">No tasks.</div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row">
                    <div className="relative w-full rounded-xl bg-white border border-slate-200 border-l-4 border-blue-500 p-4 text-slate-700 md:w-48 md:shrink-0">
                      <div className="text-sm font-semibold">SYSTEM TASKS</div>
                      <span className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {todaySystemTasks.length}
                      </span>
                      <div className="mt-2 text-xs text-slate-500">Scheduled</div>
                    </div>
                    <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 flex flex-col">
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

                  <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row">
                    <div className="relative w-full rounded-xl bg-white border border-slate-200 border-l-4 border-slate-500 p-4 text-slate-700 md:w-48 md:shrink-0">
                      <div className="text-sm font-semibold">EXTERNAL MEETINGS</div>
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
                <div className="relative w-full rounded-lg border bg-white shadow-sm">
                  <div className="max-h-[calc(100vh-var(--system-tasks-sticky-offset)-1.5rem)] overflow-auto overscroll-contain">
                    <div className="min-w-[1000px] xl:min-w-0">
                      <div className="sticky top-0 z-30">
                        <div className="border-b bg-slate-50/95 backdrop-blur py-3 px-4">
                          <div className={GRID_CLASS + " text-[11px] font-bold uppercase tracking-wider text-slate-500"}>
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

                      <div className="p-4 space-y-2 bg-slate-50">
                        {sortedSystemTasks.length ? (
                          (() => {
                            let globalIndex = 0
                            return sortedSystemTasks.map((template) => {
                              const taskNumber = globalIndex + 1
                              globalIndex++
                              const priorityValue = normalizePriority(template.priority)
                              const departmentLabel = department ? formatDepartmentName(department.name) : "-"
                              const ownerLabel = assigneeSummary(template.assignees) || 
                                (template.default_assignee_id ? users.find((u) => u.id === template.default_assignee_id)?.full_name || users.find((u) => u.id === template.default_assignee_id)?.username || "-" : "-")
                              const frequencyLabel = FREQUENCY_LABELS[template.frequency] || template.frequency
                              const statusValue = template.status || "TODO"
                              const isClosed = statusValue === "DONE"
                              const isAssigned =
                                Boolean(user?.id) &&
                                (template.default_assignee_id === user?.id ||
                                  template.assignees?.some((assignee) => assignee.id === user?.id))
                              const isInactive = template.is_active === false

                              return (
                                <div
                                  key={template.id}
                                  className={[
                                    GRID_CLASS,
                                    "py-3 bg-white border border-slate-200 border-l-4 transition-colors hover:bg-slate-50",
                                    PRIORITY_BORDER_STYLES[priorityValue],
                                    isInactive && "opacity-60 grayscale"
                                  ].join(" ")}
                                >
                                  <div className="text-sm font-semibold text-slate-600">
                                    {taskNumber}
                                  </div>
                                  <div className="min-w-0 pr-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="text-[15px] font-semibold leading-tight text-slate-900 break-words" title={template.title}>
                                        {template.title}
                                      </div>
                                      <Badge variant="secondary" className="h-5 text-[10px] uppercase">
                                        {statusValue}
                                      </Badge>
                                    </div>
                                  </div>
                                  <div className="truncate text-sm text-slate-700 font-normal" title={departmentLabel}>
                                    {departmentLabel}
                                  </div>
                                  <div className="truncate text-sm text-slate-700 font-normal" title={ownerLabel !== "-" ? ownerLabel : ""}>
                                    {ownerLabel === "-" ? <span className="text-slate-400">-</span> : ownerLabel}
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
                                      className={["px-2 py-0.5 text-[13px] border", PRIORITY_BADGE_STYLES[priorityValue]].join(" ")}
                                    >
                                      {PRIORITY_LABELS[priorityValue]}
                                    </Badge>
                                  </div>
                                  <div className="text-right">
                                    <div className="flex flex-col items-end gap-2">
                                      {viewMode === "mine" && isAssigned && !isClosed && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          disabled={systemStatusUpdatingId === template.id}
                                          onClick={() => void updateSystemTaskStatus(template.id, "DONE")}
                                          className="h-7 text-xs"
                                        >
                                          {systemStatusUpdatingId === template.id
                                            ? "Updating..."
                                            : "Mark done"}
                                        </Button>
                                      )}
                                      {isClosed && (
                                        <span className="text-xs text-emerald-700">Done</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })
                          })()
                        ) : (
                          <div className="py-12 text-center text-sm text-muted-foreground">
                            No system tasks yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "no-project" ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xl font-semibold text-slate-900">Tasks (No Project)</div>
                    <div className="text-sm text-slate-600">
                      Use these buckets to track non-project tasks and special cases.
                    </div>
                  </div>
                  {!isReadOnly ? (
                    <Dialog open={noProjectOpen} onOpenChange={setNoProjectOpen}>
                      <DialogTrigger asChild>
                        <Button className="bg-blue-500 hover:bg-blue-600 text-white border-0 shadow-sm rounded-xl px-6">
                          + Add Task
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-lg bg-white border-slate-200 rounded-2xl z-[110]">
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
                                    {users.length ? (
                                      users.map((u) => {
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
                                      <div className="text-sm text-slate-600">No users available.</div>
                                    )}
                                  </div>
                                  <div className="mt-4 flex justify-end gap-2">
                                    <Button variant="outline" onClick={() => setNoProjectAssignees([])}>
                                      Clear
                                    </Button>
                                    <Button
                                      variant="outline"
                                      onClick={() => setNoProjectAssignees(users.map((u) => u.id))}
                                      disabled={!users.length}
                                    >
                                      All users
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
                </div>
                {!isReadOnly ? (
                <Dialog open={Boolean(editingTaskId)} onOpenChange={(open) => { if (!open) cancelEditTask() }}>
                  <DialogContent className="sm:max-w-lg bg-white border-slate-200 rounded-2xl z-[110]">
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
                        {row.items.map((t) => (
                          <Link
                            key={t.id}
                            href={`/tasks/${t.id}?returnTo=${encodeURIComponent(returnToTasks)}`}
                            className={`block rounded-lg border border-slate-200 border-l-4 ${row.borderClass} bg-white px-3 py-2 text-sm transition hover:bg-slate-50`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium text-slate-800 text-xs">{t.title}</div>
                              <div className="flex items-center gap-2">
                                <Badge className={`border text-[11px] ${row.itemBadgeClass}`}>
                                  {row.itemBadge}
                                </Badge>
                                {(() => {
                                  // Collect all assignees: from assigned_to and assignees array
                                  const assigneeIds = new Set<string>()
                                  if (t.assigned_to) {
                                    assigneeIds.add(t.assigned_to)
                                  }
                                  if (t.assignees) {
                                    for (const assignee of t.assignees) {
                                      if (assignee.id) {
                                        assigneeIds.add(assignee.id)
                                      }
                                    }
                                  }
                                  
                                  // Render all assignee initials
                                  const assigneeChips = Array.from(assigneeIds).map((userId) => {
                                    // Try to get user from userMap first, then from assignees array
                                    const userFromMap = userMap.get(userId)
                                    const assigneeFromArray = t.assignees?.find(a => a.id === userId)
                                    // Get label from userMap or assignees array
                                    const label = userFromMap 
                                      ? assigneeLabel(userFromMap)
                                      : (assigneeFromArray?.full_name || assigneeFromArray?.username || "-")
                                    return (
                                      <div
                                        key={userId}
                                        className="h-6 w-6 rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600 flex items-center justify-center"
                                        title={label}
                                      >
                                        {initials(label)}
                                      </div>
                                    )
                                  })
                                  
                                  return assigneeChips.length > 0 ? assigneeChips : null
                                })()}
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
                        ))}
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
                <div className="rounded-md border-2 border-slate-700 max-h-[75vh] overflow-x-auto overflow-y-auto relative bg-white w-full">
                  <div className="w-full min-w-[1050px]">
                    <table className="w-full caption-bottom text-sm min-w-[1050px]">
                      <thead className="sticky top-0 z-50 bg-white shadow-md" style={{ position: 'sticky', top: 0, zIndex: 50 }}>
                        <tr className="bg-white" style={{ borderBottom: '1px solid rgb(51 65 85)' }}>
                          <th className="w-[40px] border border-slate-600 border-l-2 border-l-slate-800 bg-white text-foreground h-10 px-2 text-left align-middle font-medium" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)', whiteSpace: 'normal' }}>Nr</th>
                          <th className="w-[450px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>SHENIMI</th>
                          <th className="w-[140px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>DATA,ORA</th>
                          <th className="w-[60px] border border-slate-600 bg-white text-foreground h-10 px-1.5 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>NGA</th>
                          <th className="w-[60px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>DEP</th>
                          <th className="w-[120px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>PRJK</th>
                          <th className="w-[80px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>KRIJO DETYRE</th>
                          <th className="w-[80px] border border-slate-600 border-r-2 border-r-slate-800 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>MBYLL SHENIM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleGaNotes.length ? (
                          [...visibleGaNotes]
                            .sort((a, b) => {
                              // First, sort by status: open notes first, closed notes last
                              const aIsClosed = a.status === "CLOSED"
                              const bIsClosed = b.status === "CLOSED"
                              if (aIsClosed !== bIsClosed) {
                                return aIsClosed ? 1 : -1 // Closed notes go to the end
                              }
                              // Then sort by priority: HIGH first, then NORMAL
                              const order = ["HIGH", "NORMAL"]
                              const aRank = a.priority ? order.indexOf(a.priority) : order.length
                              const bRank = b.priority ? order.indexOf(b.priority) : order.length
                              if (aRank !== bRank) return aRank - bRank
                              // Finally sort by creation date (newest first)
                              const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
                              const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
                              return bTime - aTime
                            })
                            .map((note, idx) => {
                              const author = users.find((u) => u.id === note.created_by) || null
                              const project = note.project_id ? projects.find((p) => p.id === note.project_id) : null
                              const linkedTask = gaNoteTaskMap.get(note.id) || null
                              const creatorLabel = author?.full_name || author?.username || "Unknown user"
                              const creatorInitials = getInitials(creatorLabel)
                              const creatorBadgeClasses =
                                creatorInitials === "GA"
                                  ? "bg-rose-100 text-rose-800 border border-rose-200"
                                  : creatorInitials === "KA"
                                    ? "bg-blue-100 text-blue-800 border border-blue-200"
                                    : "bg-slate-200 text-slate-700"
                              // Use the current department if the note's department_id matches, otherwise show nothing
                              const noteDepartment = note.department_id === department?.id ? department : null

                              return (
                                <tr key={note.id} className="hover:bg-muted/50 border-b transition-colors">
                                  <td className="font-bold text-muted-foreground border border-slate-600 border-l-2 border-l-slate-800 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>{idx + 1}</td>
                                  <td className="whitespace-pre-wrap break-words w-[450px] border border-slate-600 p-2 align-middle" style={{ verticalAlign: 'bottom' }}>
                                    <div className="flex flex-col gap-1">
                                      <span className="text-sm">{note.content}</span>
                                      <div className="flex items-center gap-2">
                                        {note.priority ? (
                                          <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_BADGE[note.priority as "NORMAL" | "HIGH"]}`}>
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
                                    {noteDepartment ? (
                                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 whitespace-normal text-left">
                                        {abbreviateDepartmentName(noteDepartment.name)}
                                      </Badge>
                                    ) : null}
                                  </td>
                                  <td className="border border-slate-600 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>
                                    {project ? (
                                      <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200 whitespace-normal text-left">
                                        {project.title || project.name || "Project"}
                                      </Badge>
                                    ) : null}
                                  </td>
                                  <td className="border border-slate-600 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>
                                    <div className="flex justify-center">
                                      {linkedTask ? (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200 h-7 flex items-center">
                                          Task Created
                                        </Badge>
                                      ) : !isReadOnly && note.status !== "CLOSED" ? (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
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
                                    </div>
                                  </td>
                                  <td className="border border-slate-600 border-r-2 border-r-slate-800 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>
                                    <div className="flex justify-center">
                                      {note.status !== "CLOSED" ? (
                                        !isReadOnly ? (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                            onClick={() => void closeGaNote(note.id)}
                                          >
                                            Close
                                          </Button>
                                        ) : (
                                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200 h-7 flex items-center">
                                            Open
                                          </Badge>
                                        )
                                      ) : (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200 h-7 flex items-center">
                                          Closed
                                        </Badge>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })
                        ) : (
                          <tr>
                            <td colSpan={8} className="border border-slate-600 p-4 text-center text-sm text-muted-foreground">
                              No GA/KA notes yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* MEETINGS */}
            {activeTab === "meetings" && (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-medium tracking-tight text-slate-900 dark:text-white">Meetings</h2>
                </div>

                <div className="grid gap-8">
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
                      <col className="w-[28px]" />
                      <col className="w-[36px]" />
                      <col className="w-[34px]" />
                      <col className="w-[34px]" />
                      <col className="w-[140px]" />
                      <col className="w-[52px]" />
                      <col className="w-[28px]" />
                      <col className="w-[50px]" />
                      <col className="w-[34px]" />
                      <col className="w-[120px]" />
                      <col className="w-[44px]" />
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
                            <td className="border border-slate-900 px-2 py-2 align-top">{row.userInitials}</td>
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
              PUNOI: <span className="print-signature-line" />
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
        .daily-report-table thead tr {
          border-top: 2px solid #e2e8f0;
          border-bottom: 2px solid #e2e8f0;
        }
        .daily-report-table thead th {
          border-width: 2px;
          border-color: #cbd5e1;
        }
        .weekly-report-table thead th {
          border-width: 2px;
          border-color: #0f172a;
        }
        .print-nr-cell {
          font-weight: 700;
        }
        @media print {
          body {
            background: white;
          }
          aside {
            display: none !important;
          }
          @page {
            margin: 0.36in 0.1in 0.51in 0.1in;
          }
          .print-page {
            position: relative;
            padding-bottom: 0.6in;
          }
          .print-header {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            margin-top: 0.15in;
            margin-bottom: 0.15in;
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
          .print-page-measure {
            position: absolute;
            top: 0;
            left: 0;
            height: calc(11in - 0.36in - 0.51in);
            width: 1px;
            visibility: hidden;
            pointer-events: none;
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
          .print-footer {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0.1in;
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            padding-left: 0.1in;
            padding-right: 0.1in;
            font-size: 10px;
            color: #334155;
          }
          .print-page-count {
            grid-column: 2;
            text-align: center;
          }
          .print-signature-line {
            display: inline-block;
            min-width: 1.2in;
            border-bottom: 1px solid #334155;
            height: 0.6em;
            margin-left: 0.1in;
            vertical-align: bottom;
          }
          .print-initials {
            grid-column: 3;
            text-align: right;
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
            border-width: 2px;
            border-color: #0f172a;
          }
          .daily-report-table thead tr {
            border-top: 2px solid #0f172a;
            border-bottom: 2px solid #0f172a;
          }
          .weekly-report-table {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  )
}
