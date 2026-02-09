"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { toast } from "sonner"
import { Check, Pencil, Printer, RotateCcw, Trash2 } from "lucide-react"

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
import { weeklyPlanStatusBgClass } from "@/lib/weekly-plan-status"
import { fetchProjectTitlesById } from "@/lib/project-title-lookup"
import type {
  ChecklistItem,
  DailyReportGaEntry,
  DailyReportGaTableResponse,
  DailyReportResponse,
  Department,
  GaNote,
  InternalNote,
  Meeting,
  Project,
  SystemTaskTemplate,
  Task, TaskAssignee,
  TaskFinishPeriod,
  TaskPriority,
  UserLookup,
} from "@/lib/types"

const TABS = [
  { id: "all", label: "All", tone: "neutral" },
  { id: "projects", label: "Projects", tone: "neutral" },
  { id: "system", label: "System Tasks", tone: "blue" },
  { id: "no-project", label: "Fast Tasks", tone: "blue" },
  { id: "ga-ka", label: "GA/KA Notes", tone: "neutral" },
  { id: "internal-notes", label: "Internal Notes", tone: "neutral" },
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
        "Detyrat e secilit per sot (secili hap RD/Trello side-by-side dhe diskuton detyrat).",
        "A ka e-mails te reja ne IT?",
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

function todayInputValue() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000)
  return local.toISOString().slice(0, 10)
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

type GaNoteTaskType = "NORMAL" | "HIGH" | "BLLOK" | "1H" | "R1" | "GA"
const GA_NOTE_TASK_TYPE_OPTIONS_PROJECT: Array<{ value: GaNoteTaskType; label: string }> = [
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
]
const GA_NOTE_TASK_TYPE_OPTIONS_FAST: Array<{ value: GaNoteTaskType; label: string }> = [
  { value: "NORMAL", label: "Normal" },
  { value: "BLLOK", label: "BLLOK" },
  { value: "1H", label: "1H" },
  { value: "R1", label: "R1" },
  { value: "GA", label: "GA" },
]

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

function findPreviousOccurrenceDate(t: SystemTaskTemplate, fromDate: Date) {
  const candidate = new Date(fromDate)
  for (let i = 0; i < 370; i += 1) {
    if (shouldShowTemplate(t, candidate)) return candidate
    candidate.setDate(candidate.getDate() - 1)
  }
  return fromDate
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
  const date = resolveMeetingDisplayDate(meeting)
  if (!date) return `${meeting.title}${platformLabel}`
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

function formatMeetingDateTime(meeting: Meeting): string {
  const date = resolveMeetingDisplayDate(meeting)
  if (!date) return "-"
  if (Number.isNaN(date.getTime())) return "-"
  const today = new Date()
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  const dateLabel = sameDay
    ? "Today"
    : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
  const timeLabel = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  return `${dateLabel} ${timeLabel}`
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

function toMeetingTimeInputValue(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(11, 16)
}

function parseTimeValue(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return { hours, minutes }
}

function computeNextOccurrenceDate(params: {
  recurrenceType: "weekly" | "monthly"
  daysOfWeek: number[]
  daysOfMonth: number[]
  timeValue: string
}) {
  const parsedTime = parseTimeValue(params.timeValue)
  if (!parsedTime) return null
  const now = new Date()
  const { hours, minutes } = parsedTime

  if (params.recurrenceType === "weekly") {
    if (!params.daysOfWeek.length) return null
    const daySet = new Set(params.daysOfWeek.map((d) => (d + 1) % 7))
    for (let offset = 0; offset < 14; offset++) {
      const candidate = new Date(now)
      candidate.setDate(now.getDate() + offset)
      candidate.setHours(hours, minutes, 0, 0)
      if (!daySet.has(candidate.getDay())) continue
      if (offset === 0 && candidate.getTime() < now.getTime()) continue
      return candidate
    }
    return null
  }

  if (params.recurrenceType === "monthly") {
    if (!params.daysOfMonth.length) return null
    const sortedDays = [...new Set(params.daysOfMonth)].sort((a, b) => a - b)
    for (let monthOffset = 0; monthOffset < 12; monthOffset++) {
      const base = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
      const year = base.getFullYear()
      const month = base.getMonth()
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      for (const day of sortedDays) {
        if (day < 1 || day > daysInMonth) continue
        if (monthOffset === 0 && day < now.getDate()) continue
        const candidate = new Date(year, month, day, hours, minutes, 0, 0)
        if (monthOffset === 0 && day === now.getDate() && candidate.getTime() < now.getTime()) {
          continue
        }
        return candidate
      }
    }
  }

  return null
}

function resolveMeetingDisplayDate(meeting: Meeting) {
  const recurrenceType = meeting.recurrence_type
  if (recurrenceType && recurrenceType !== "none" && meeting.starts_at) {
    const timeValue = toMeetingTimeInputValue(meeting.starts_at)
    if (timeValue) {
      const next = computeNextOccurrenceDate({
        recurrenceType: recurrenceType as "weekly" | "monthly",
        daysOfWeek: meeting.recurrence_days_of_week || [],
        daysOfMonth: meeting.recurrence_days_of_month || [],
        timeValue,
      })
      if (next) return next
    }
  }
  if (!meeting.starts_at) return null
  return new Date(meeting.starts_at)
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

function taskStatusValue(task: Task): Task["status"] {
  if (task.status === "DONE" || task.completed_at) return "DONE"
  if (task.status === "IN_PROGRESS") return "IN_PROGRESS"
  return "TODO"
}

function statusBadgeClasses(status: Task["status"]) {
  if (status === "DONE") return "bg-green-100 text-green-700 border-green-200"
  if (status === "IN_PROGRESS") return "bg-amber-100 text-amber-800 border-amber-200"
  return "bg-slate-100 text-slate-700 border-slate-200"
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

type DailyReportTyoMode = "range" | "dueOnly"

function getDailyReportTyo({
  reportDate,
  startDate,
  dueDate,
  mode,
}: {
  reportDate: Date
  startDate?: Date | null
  dueDate?: Date | null
  mode: DailyReportTyoMode
}) {
  if (!dueDate) return "-"
  const reportKey = dayKey(reportDate)
  const dueKey = dayKey(dueDate)

  if (mode === "range") {
    if (startDate) {
      const startKey = dayKey(startDate)
      if (reportKey < startKey) return "-"
      if (reportKey <= dueKey) return "T"
    } else if (reportKey <= dueKey) {
      return reportKey === dueKey ? "T" : "-"
    }
  } else {
    if (reportKey < dueKey) return "-"
    if (reportKey === dueKey) return "T"
  }

  const lateDays = Math.floor((reportKey - dueKey) / MS_PER_DAY)
  if (lateDays === 1) return "Y"
  if (lateDays >= 2) return String(lateDays)
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
  const date = resolveMeetingDisplayDate(meeting)
  if (!date) return meeting.title || "Meeting"
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
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [projects, setProjects] = React.useState<Project[]>([])
  const [projectTitleLookup, setProjectTitleLookup] = React.useState<Map<string, string>>(new Map())
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
  const [taskToCloseTemplate, setTaskToCloseTemplate] = React.useState<SystemTaskTemplate | null>(null)
  const [closeTaskComment, setCloseTaskComment] = React.useState("")
  const [closingTask, setClosingTask] = React.useState(false)
  const [departmentTasks, setDepartmentTasks] = React.useState<Task[]>([])
  const [noProjectTasks, setNoProjectTasks] = React.useState<Task[]>([])
  const [users, setUsers] = React.useState<UserLookup[]>([])
  const [gaNotes, setGaNotes] = React.useState<GaNote[]>([])
  const [internalNotes, setInternalNotes] = React.useState<InternalNote[]>([])
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
  const [allRange, setAllRange] = React.useState<"today" | "week">("today")
  const [selectedUserId, setSelectedUserId] = React.useState<string>("__all__")
  const [dailyReport, setDailyReport] = React.useState<DailyReportResponse | null>(null)
  const [loadingDailyReport, setLoadingDailyReport] = React.useState(false)
  const [dailyReportCommentEdits, setDailyReportCommentEdits] = React.useState<Record<string, string>>({})
  const [savingDailyReportComments, setSavingDailyReportComments] = React.useState<Record<string, boolean>>({})
  const [exportingDailyReport, setExportingDailyReport] = React.useState(false)
  const [gaTableEntry, setGaTableEntry] = React.useState<DailyReportGaEntry | null>(null)
  const [gaTableInput, setGaTableInput] = React.useState("")
  const [savingGaTable, setSavingGaTable] = React.useState(false)
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
  const [editTaskAssignees, setEditTaskAssignees] = React.useState<string[]>([])
  const [selectEditTaskAssigneesOpen, setSelectEditTaskAssigneesOpen] = React.useState(false)
  const [updatingTask, setUpdatingTask] = React.useState(false)
  const [showTitleWarning, setShowTitleWarning] = React.useState(false)
  const [pendingProjectTitle, setPendingProjectTitle] = React.useState("")
  const [meetingTitle, setMeetingTitle] = React.useState("")
  const [meetingPlatform, setMeetingPlatform] = React.useState("")
  const [meetingStartsAt, setMeetingStartsAt] = React.useState("")
  const [meetingStartTime, setMeetingStartTime] = React.useState("")
  const [meetingUrl, setMeetingUrl] = React.useState("")
  const [meetingRecurrenceType, setMeetingRecurrenceType] = React.useState<"none" | "weekly" | "monthly">("none")
  const [meetingRecurrenceDaysOfWeek, setMeetingRecurrenceDaysOfWeek] = React.useState<number[]>([])
  const [meetingRecurrenceDaysOfMonth, setMeetingRecurrenceDaysOfMonth] = React.useState<number[]>([])
  const [meetingParticipantIds, setMeetingParticipantIds] = React.useState<string[]>([])
  const [meetingProjectId, setMeetingProjectId] = React.useState("__none__")
  const [creatingMeeting, setCreatingMeeting] = React.useState(false)
  const [showAddMeetingForm, setShowAddMeetingForm] = React.useState(false)
  const [editingMeetingId, setEditingMeetingId] = React.useState<string | null>(null)
  const [editMeetingTitle, setEditMeetingTitle] = React.useState("")
  const [editMeetingPlatform, setEditMeetingPlatform] = React.useState("")
  const [editMeetingStartsAt, setEditMeetingStartsAt] = React.useState("")
  const [editMeetingStartTime, setEditMeetingStartTime] = React.useState("")
  const [editMeetingUrl, setEditMeetingUrl] = React.useState("")
  const [editMeetingRecurrenceType, setEditMeetingRecurrenceType] = React.useState<"none" | "weekly" | "monthly">("none")
  const [editMeetingRecurrenceDaysOfWeek, setEditMeetingRecurrenceDaysOfWeek] = React.useState<number[]>([])
  const [editMeetingRecurrenceDaysOfMonth, setEditMeetingRecurrenceDaysOfMonth] = React.useState<number[]>([])
  const [editMeetingParticipantIds, setEditMeetingParticipantIds] = React.useState<string[]>([])
  const [editMeetingProjectId, setEditMeetingProjectId] = React.useState("__none__")
  const [savingMeeting, setSavingMeeting] = React.useState(false)
  const [showParticipantDialog, setShowParticipantDialog] = React.useState(false)
  const [showEditParticipantDialog, setShowEditParticipantDialog] = React.useState(false)
  const [internalSlot, setInternalSlot] = React.useState<keyof typeof INTERNAL_MEETING.slots>("M1")
  const [internalMeetingChecklistId, setInternalMeetingChecklistId] = React.useState<string | null>(null)
  const [internalMeetingItems, setInternalMeetingItems] = React.useState<ChecklistItem[]>([])
  const [newInternalMeetingItem, setNewInternalMeetingItem] = React.useState("")
  const [addingInternalMeetingItem, setAddingInternalMeetingItem] = React.useState(false)
  const [editingInternalMeetingItemId, setEditingInternalMeetingItemId] = React.useState<string | null>(null)
  const [editingInternalMeetingItem, setEditingInternalMeetingItem] = React.useState("")
  const [savingInternalMeetingItem, setSavingInternalMeetingItem] = React.useState(false)
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
  const [gaNoteTaskPriority, setGaNoteTaskPriority] = React.useState<GaNoteTaskType>("NORMAL")
  const [gaNoteTaskHasProject, setGaNoteTaskHasProject] = React.useState(false)
  const [gaNoteTaskStartDate, setGaNoteTaskStartDate] = React.useState(todayInputValue())
  const [gaNoteTaskDueDate, setGaNoteTaskDueDate] = React.useState("")
  const [gaNoteTaskFinishPeriod, setGaNoteTaskFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(
    FINISH_PERIOD_NONE_VALUE
  )
  const [internalNoteOpen, setInternalNoteOpen] = React.useState(false)
  const [addingInternalNote, setAddingInternalNote] = React.useState(false)
  const [internalNoteTitle, setInternalNoteTitle] = React.useState("")
  const [internalNoteDescription, setInternalNoteDescription] = React.useState("")
  const [internalNoteDepartmentId, setInternalNoteDepartmentId] = React.useState("")
  const [internalNoteProjectId, setInternalNoteProjectId] = React.useState("")
  const [internalNoteProjects, setInternalNoteProjects] = React.useState<Project[]>([])
  const [loadingInternalNoteProjects, setLoadingInternalNoteProjects] = React.useState(false)
  const [internalNoteToUserIds, setInternalNoteToUserIds] = React.useState<string[]>([])
  const [showDoneInternalNotes, setShowDoneInternalNotes] = React.useState(false)
  const [updatingInternalNoteIds, setUpdatingInternalNoteIds] = React.useState<string[]>([])
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
        setDepartments(deps)
        const dep = deps.find((d) => d.name === departmentName) || null
        setDepartment(dep)
        if (!dep) {
          setLoading(false)
          return
        }

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

        const [projRes, sysRes, tasksRes, gaRes, internalRes, meetingsRes] = await Promise.all([
          apiFetch(`/projects?department_id=${dep.id}`),
          apiFetch(`/system-tasks?department_id=${dep.id}&occurrence_date=${formatDateInput(systemDate)}`),
          // Remove department_id filter to get all tasks, then filter client-side
          apiFetch(`/tasks?include_done=true`),
          apiFetch(`/ga-notes?department_id=${dep.id}`),
          apiFetch(`/internal-notes?department_id=${dep.id}`),
          apiFetch(`/meetings?department_id=${dep.id}`),
        ])
        if (projRes.ok) setProjects((await projRes.json()) as Project[])
        if (sysRes.ok) setSystemTasks((await sysRes.json()) as SystemTaskTemplate[])
        if (tasksRes.ok) {
          const taskRows = (await tasksRes.json()) as Task[]
          // Filter tasks: include if task belongs to this department OR any assignee belongs to this department
          const nonSystemTasks = taskRows.filter((t) => {
            // Exclude system tasks
            if (t.system_template_origin_id) return false
            // Include if task belongs to this department
            if (t.department_id === dep.id) return true
            // Include if primary assignee belongs to this department
            if (t.assigned_to && departmentUserIds.has(t.assigned_to)) return true
            // Include if any assignee in the assignees array belongs to this department
            // Check both string and direct ID matching
            if (t.assignees?.some((a) => {
              const assigneeId = a.id
              if (!assigneeId) return false
              return departmentUserIds.has(assigneeId)
            })) return true
            return false
          })
          setDepartmentTasks(nonSystemTasks)
          setNoProjectTasks(nonSystemTasks.filter(isNoProjectTask))
        }
        if (gaRes.ok) setGaNotes((await gaRes.json()) as GaNote[])
        if (internalRes.ok) setInternalNotes((await internalRes.json()) as InternalNote[])
        if (meetingsRes.ok) setMeetings((await meetingsRes.json()) as Meeting[])

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
    if (!department?.id) return
    const loadSystemTasks = async () => {
      const res = await apiFetch(
        `/system-tasks?department_id=${department.id}&occurrence_date=${formatDateInput(systemDate)}`
      )
      if (res.ok) {
        setSystemTasks((await res.json()) as SystemTaskTemplate[])
      }
    }
    void loadSystemTasks()
  }, [apiFetch, department?.id, systemDate])

  React.useEffect(() => {
    if (!internalNoteDepartmentId && department?.id) {
      setInternalNoteDepartmentId(department.id)
    }
  }, [department?.id, internalNoteDepartmentId])

  React.useEffect(() => {
    const loadProjects = async () => {
      if (!internalNoteDepartmentId) {
        setInternalNoteProjects([])
        return
      }
      setLoadingInternalNoteProjects(true)
      try {
        const res = await apiFetch(`/projects?department_id=${internalNoteDepartmentId}`)
        if (!res.ok) {
          console.error("Failed to load department projects:", res.status)
          setInternalNoteProjects([])
          return
        }
        setInternalNoteProjects((await res.json()) as Project[])
      } catch (error) {
        console.error("Error loading department projects:", error)
        setInternalNoteProjects([])
      } finally {
        setLoadingInternalNoteProjects(false)
      }
    }
    void loadProjects()
  }, [apiFetch, internalNoteDepartmentId])

  React.useEffect(() => {
    projectMembersRef.current = projectMembers
  }, [projectMembers])

  React.useEffect(() => {
    if (gaNoteTaskHasProject && gaNoteTaskPriority !== "NORMAL" && gaNoteTaskPriority !== "HIGH") {
      setGaNoteTaskPriority("NORMAL")
    }
    if (!gaNoteTaskHasProject && gaNoteTaskPriority === "HIGH") {
      setGaNoteTaskPriority("NORMAL")
    }
  }, [gaNoteTaskHasProject, gaNoteTaskPriority])

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
        
        // Delete only the test item "dssdgsdg" if it exists
        const itemsToDelete = ["dssdgsdg"]
        const deletePromises: Promise<Response>[] = []
        for (const item of items) {
          const itemTitle = (item.title || "").trim()
          if (itemsToDelete.some((toDelete) => itemTitle.toLowerCase() === toDelete.toLowerCase())) {
            deletePromises.push(apiFetch(`/checklist-items/${item.id}`, { method: "DELETE" }))
          }
        }
        if (deletePromises.length > 0) {
          await Promise.all(deletePromises)
          // Reload items after deletion
          const reloadRes = await apiFetch(`/checklist-items?checklist_id=${selected.id}`)
          if (reloadRes.ok) {
            items = (await reloadRes.json()) as ChecklistItem[]
          }
        }
        
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
  const taskAssigneeLabels = React.useCallback(
    (task: Task) => {
      const ids = new Set<string>()
      if (task.assigned_to) ids.add(task.assigned_to)
      if (task.assignees) {
        for (const assignee of task.assignees) {
          if (assignee.id) ids.add(assignee.id)
        }
      }
      if (!ids.size) return ["Unassigned"]
      return Array.from(ids).map((userId) => {
        const userFromMap = userMap.get(userId)
        if (userFromMap) return assigneeLabel(userFromMap)
        const assigneeFromArray = task.assignees?.find((a) => a.id === userId)
        return assigneeFromArray?.full_name || assigneeFromArray?.username || "Unknown"
      })
    },
    [userMap]
  )
  const departmentUsers = React.useMemo(
    () => (department ? users.filter((u) => u.department_id === department.id) : []),
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
  const editTaskAssigneeLabel = React.useMemo(() => {
    if (editTaskAssignees.length === 0) return "Unassigned"
    if (users.length && editTaskAssignees.length === users.length) return "All users"
    if (editTaskAssignees.length === 1) {
      const selected = users.find((u) => u.id === editTaskAssignees[0])
      return selected?.full_name || selected?.username || "1 selected"
    }
    return `${editTaskAssignees.length} selected`
  }, [users, editTaskAssignees])
  const todayDate = React.useMemo(() => new Date(), [])
  const todayIso = React.useMemo(() => todayDate.toISOString().slice(0, 10), [todayDate])
  const weekStart = React.useMemo(() => startOfWeekMonday(todayDate), [todayDate])
  const weekEnd = React.useMemo(
    () => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 4),
    [weekStart]
  )
  const weekDates = React.useMemo(() => {
    const start = startOfWeekMonday(todayDate)
    return Array.from({ length: 5 }, (_, index) => {
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    })
  }, [todayDate])
  const isMineView = viewMode === "mine" && Boolean(user?.id)
  const isTaskAssignedToUser = React.useCallback(
    (task: Task, userId?: string | null) => {
      if (!userId) return false
      if (task.assigned_to === userId) return true
      return Boolean(task.assignees?.some((assignee) => assignee.id === userId))
    },
    []
  )
  const isTaskActiveForDate = React.useCallback((task: Task, targetDate: Date) => {
    const targetKey = dayKey(targetDate)
    const start = toDate(task.start_date || task.created_at || task.due_date)
    const due = toDate(task.due_date || task.start_date || task.created_at)
    const startKey = start ? dayKey(start) : null
    const dueKey = due ? dayKey(due) : startKey

    if (startKey != null && targetKey < startKey) return false
    if (dueKey != null && targetKey > dueKey) return false
    return true
  }, [])
  const isTaskOverlappingWeek = React.useCallback(
    (task: Task) => {
      const start = task.start_date ? toDate(task.start_date) : null
      const due = task.due_date ? toDate(task.due_date) : null
      if (!start && !due) return false
      const rangeStart = start ?? due
      const rangeEnd = due ?? start
      if (!rangeStart || !rangeEnd) return false
      return dayKey(rangeStart) <= dayKey(weekEnd) && dayKey(rangeEnd) >= dayKey(weekStart)
    },
    [weekEnd, weekStart]
  )
  const filteredProjects = React.useMemo(() => {
    let filtered = projects
    if (viewMode === "mine" && user?.id) {
      filtered = projects.filter((p) => {
        const members = projectMembers[p.id] || []
        return members.some((m) => m.id === user.id)
      })
    }
    // Sort: closed projects at the end, active projects first
    return [...filtered].sort((a, b) => {
      const aIsClosed = (a.current_phase || "").toUpperCase() === "CLOSED"
      const bIsClosed = (b.current_phase || "").toUpperCase() === "CLOSED"
      if (aIsClosed && !bIsClosed) return 1
      if (!aIsClosed && bIsClosed) return -1
      return 0
    })
  }, [projects, projectMembers, user?.id, viewMode])

  const visibleDepartmentTasks = React.useMemo(
    () => (isMineView && user?.id ? departmentTasks.filter((t) => isTaskAssignedToUser(t, user.id)) : departmentTasks),
    [departmentTasks, isMineView, isTaskAssignedToUser, user?.id]
  )
  const visibleNoProjectTasks = React.useMemo(() => {
    const base =
      isMineView && user?.id ? noProjectTasks.filter((t) => isTaskAssignedToUser(t, user.id)) : noProjectTasks
    const filtered = base.filter(isNoProjectTask)
    
    // Deduplicate only exact duplicates by ID.
    // Fast tasks can intentionally exist as per-user copies (same title, different IDs),
    // so we must NOT merge by title/properties. Otherwise users can end up opening/editing
    // someone else's copy from "My view" / "All users" lists.
    const taskMapById = new Map<string, Task>()
    
    for (const t of filtered) {
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
      
      const taskCopy = { ...t }
      taskMapById.set(t.id, taskCopy)
    }
    
    return Array.from(taskMapById.values())
  }, [noProjectTasks, isMineView, user?.id, userMap])
  const visibleGaNotes = React.useMemo(
    () => (isMineView && user?.id ? gaNotes.filter((n) => n.created_by === user.id) : gaNotes),
    [gaNotes, isMineView, user?.id]
  )
  const visibleInternalNotes = React.useMemo(() => {
    const base = isMineView && user?.id ? internalNotes.filter((n) => n.to_user_id === user.id) : internalNotes
    const filteredByUser =
      !isMineView && selectedUserId !== "__all__"
        ? base.filter((n) => n.to_user_id === selectedUserId)
        : base
    if (showDoneInternalNotes) return filteredByUser.filter((n) => n.is_done)
    return filteredByUser.filter((n) => !n.is_done)
  }, [internalNotes, isMineView, selectedUserId, showDoneInternalNotes, user?.id])
  const groupedInternalNotes = React.useMemo(() => {
    const normalizeTime = (value?: string | null) => {
      if (!value) return ""
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return value
      return date.toISOString().slice(0, 16)
    }
    const groups = new Map<
      string,
      { note: InternalNote; toUserIds: string[]; notes: InternalNote[] }
    >()
    for (const note of internalNotes) {
      const key = [
        note.title?.trim() || "",
        (note.description || "").trim(),
        note.from_user_id,
        note.department_id || note.to_department_id || "",
        note.project_id || "",
        normalizeTime(note.created_at),
      ].join("|")
      const existing = groups.get(key)
      if (existing) {
        if (!existing.toUserIds.includes(note.to_user_id)) {
          existing.toUserIds.push(note.to_user_id)
        }
        existing.notes.push(note)
      } else {
        groups.set(key, { note, toUserIds: [note.to_user_id], notes: [note] })
      }
    }
    let grouped = Array.from(groups.values())
    if (isMineView && user?.id) {
      grouped = grouped.filter((group) => group.toUserIds.includes(user.id))
    }
    if (!isMineView && selectedUserId !== "__all__") {
      grouped = grouped.filter((group) => group.toUserIds.includes(selectedUserId))
    }
    grouped = showDoneInternalNotes
      ? grouped.filter((group) => group.notes.length > 0 && group.notes.every((n) => n.is_done))
      : grouped.filter((group) => group.notes.some((n) => !n.is_done))
    return grouped.sort((a, b) => {
      const aTime = a.note.created_at ? new Date(a.note.created_at).getTime() : 0
      const bTime = b.note.created_at ? new Date(b.note.created_at).getTime() : 0
      return bTime - aTime
    })
  }, [internalNotes, isMineView, selectedUserId, showDoneInternalNotes, user?.id])
  const visibleMeetings = React.useMemo(
    () => (isMineView && user?.id ? meetings.filter((m) => m.created_by === user.id) : meetings),
    [meetings, isMineView, user?.id]
  )
  const visibleSystemTemplates = React.useMemo(
    () => {
      const depTasks = department
        ? systemTasks.filter((t) => {
            if (t.department_id === department.id) return true
            if (t.department_ids?.includes(department.id)) return true
            return false
          })
        : []
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
  const openNotes = React.useMemo(() => visibleGaNotes.filter((n) => n.status !== "CLOSED" && !n.is_converted_to_task), [visibleGaNotes])
  const todayProjectTasks = React.useMemo(() => {
    return projectTasks.filter((task) => {
      const matchesRange =
        allRange === "week" ? isTaskOverlappingWeek(task) : isTaskActiveForDate(task, todayDate)
      if (!matchesRange) return false
      if (selectedUserId !== "__all__") {
        return isTaskAssignedToUser(task, selectedUserId)
      }
      return true
    })
  }, [
    projectTasks,
    todayDate,
    selectedUserId,
    allRange,
    isTaskActiveForDate,
    isTaskAssignedToUser,
    isTaskOverlappingWeek,
  ])
  const todayNoProjectTasks = React.useMemo(() => {
    return visibleNoProjectTasks.filter((task) => {
      const matchesRange =
        allRange === "week" ? isTaskOverlappingWeek(task) : isTaskActiveForDate(task, todayDate)
      if (!matchesRange) return false
      if (selectedUserId !== "__all__") {
        return isTaskAssignedToUser(task, selectedUserId)
      }
      return true
    })
  }, [
    visibleNoProjectTasks,
    todayDate,
    selectedUserId,
    allRange,
    isTaskActiveForDate,
    isTaskAssignedToUser,
    isTaskOverlappingWeek,
  ])
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
  const todayInternalNotes = React.useMemo(() => {
    return visibleInternalNotes.filter((note) => {
      const date = toDate(note.created_at)
      return date ? isSameDay(date, todayDate) : false
    })
  }, [todayDate, visibleInternalNotes])
  const todayGroupedInternalNotes = React.useMemo(() => {
    return groupedInternalNotes.filter((group) => {
      const date = toDate(group.note.created_at)
      return date ? isSameDay(date, todayDate) : false
    })
  }, [groupedInternalNotes, todayDate])
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
      const completedDate = task.completed_at ? toDate(task.completed_at) : null
      const completedToday = completedDate ? isSameDay(completedDate, todayDate) : false
      if (completedDate && !completedToday) return false
      if (completedToday) return true

      const startDate = task.start_date ? toDate(task.start_date) : null
      const dueDate = task.due_date ? toDate(task.due_date) : null
      if (startDate && dueDate) {
        return todayKey >= dayKey(startDate)
      }

      const baseDate = toDate(task.due_date || task.start_date || task.planned_for || task.created_at)
      if (!baseDate) return false
      return dayKey(baseDate) <= todayKey
    })
  }, [todayDate, visibleNoProjectTasks])
  const dailyReportProjectTasks = React.useMemo(() => {
    const todayKey = dayKey(todayDate)
    return projectTasks.filter((task) => {
      const completedDate = task.completed_at ? toDate(task.completed_at) : null
      const completedToday = completedDate ? isSameDay(completedDate, todayDate) : false
      
      // Show completed tasks if completed today
      if (completedToday) return true
      // Don't show tasks completed on other days
      if (completedDate && !completedToday) return false
      
      // Show project tasks from start_date through due_date (and after for late)
      const startDate = task.start_date ? toDate(task.start_date) : null
      const dueDate = task.due_date ? toDate(task.due_date) : null
      const createdDate = task.created_at ? toDate(task.created_at) : null
      
      // If we have both start and due dates, show if today is on/after start
      if (startDate && dueDate) {
        const startKey = dayKey(startDate)
        return todayKey >= startKey
      }
      
      // If only due date, show if due today or before
      if (dueDate) {
        const dueKey = dayKey(dueDate)
        return todayKey >= dueKey
      }
      
      // If only start date, show if started today or before
      if (startDate) {
        const startKey = dayKey(startDate)
        return todayKey >= startKey
      }
      
      // Fallback to created_at if no dates
      if (!createdDate) return false
      const createdKey = dayKey(createdDate)
      return createdKey <= todayKey
    })
  }, [projectTasks, todayDate])

  React.useEffect(() => {
    const existingTitles = new Map<string, string>()
    for (const p of projects) {
      const title = p.title || p.name
      if (title) {
        existingTitles.set(p.id, title)
      }
    }
    const missingIds = Array.from(
      new Set(
        dailyReportProjectTasks
          .map((task) => task.project_id)
          .filter((pid): pid is string => typeof pid === "string" && pid.trim().length > 0)
      )
    ).filter((pid) => !existingTitles.has(pid) && !projectTitleLookup.has(pid))

    if (!missingIds.length) return

    void (async () => {
      const data = await fetchProjectTitlesById(apiFetch, missingIds)
      if (!data.length) return
      setProjectTitleLookup((prev) => {
        const next = new Map(prev)
        for (const item of data) {
          if (item?.id && item?.title) next.set(item.id, item.title)
        }
        return next
      })
    })()
  }, [apiFetch, dailyReportProjectTasks, projectTitleLookup, projects])
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
      projectTitle?: string | null
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
    const projectTitleByTaskId = new Map<string, string>()
    for (const item of [...(dailyReport?.tasks_today || []), ...(dailyReport?.tasks_overdue || [])]) {
      if (item.project_title) {
        projectTitleByTaskId.set(item.task.id, item.project_title)
      }
    }

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
      const startDate = task.start_date ? toDate(task.start_date) : null
      const dueDate = task.due_date ? toDate(task.due_date) : null
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
          tyo: getDailyReportTyo({
            reportDate: todayDate,
            startDate,
            dueDate,
            mode: startDate && dueDate ? "range" : "dueOnly",
          }),
          comment: task.user_comment ?? null,
          userInitials: printInitials,
          taskId: task.id,
        },
      })
      fastIndex += 1
    }

    for (const task of dailyReportProjectTasks) {
      const startDate = task.start_date ? toDate(task.start_date) : null
      const dueDate = task.due_date ? toDate(task.due_date) : null
      const project = task.project_id ? projects.find((p) => p.id === task.project_id) || null : null
      const projectLabel =
        project?.title ||
        project?.name ||
        (task.project_id ? projectTitleLookup.get(task.project_id) : null) ||
        projectTitleByTaskId.get(task.id) ||
        null
      projectRows.push({
        typeLabel: "PRJK",
        subtype: "-",
        period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at),
        department: departmentCode,
        title: task.title || "-",
        projectTitle: projectLabel,
        description: task.description || "-",
        status: taskStatusLabel(task),
        bz: "-",
        kohaBz: "-",
        tyo: getDailyReportTyo({
          reportDate: todayDate,
          startDate,
          dueDate,
          mode: startDate && dueDate ? "range" : "dueOnly",
        }),
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
    projectTitleLookup,
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
      projectTitle?: string | null
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
      const allTaskItems = [
        ...(report.tasks_today || []),
        ...(report.tasks_overdue || []),
      ]

      for (const item of allTaskItems) {
        const task = item.task
        const baseDate = toDate(task.due_date || task.start_date || task.created_at)
        if (baseDate && dayKey(baseDate) > dayKey(todayDate)) {
          continue
        }
        const isProject = Boolean(task.project_id)
        const project = task.project_id ? projects.find((p) => p.id === task.project_id) || null : null
        const projectLabel = project?.title || project?.name || item.project_title || null

        if (isProject) {
          projectRows.push({
            typeLabel: "PRJK",
            subtype: "-",
            period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at),
            department: departmentCode,
            title: task.title || "-",
            projectTitle: projectLabel,
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
      category: "PRJK" | "FT" | "SYS" | "EXM" | "GA" | "IN"
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
    for (const note of todayInternalNotes) {
      const period = periodFromDate(note.created_at)
      const userId = note.to_user_id || "__unassigned__"
      items.push({
        userId,
        period,
        label: `IN: ${note.title || "Internal note"}`,
        category: "IN",
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
  }, [
    projects,
    todayInternalNotes,
    todayMeetings,
    todayNoProjectTasks,
    todayOpenNotes,
    todayProjectTasks,
    todaySystemTasks,
  ])

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
    const categories = ["PRJK", "FT", "SYS", "EXM", "GA", "IN"] as const
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
      "internal-notes": visibleInternalNotes.length,
      meetings: visibleMeetings.length,
    }),
    [
      filteredProjects.length,
      visibleSystemTemplates.length,
      visibleNoProjectTasks.length,
      visibleGaNotes,
      visibleInternalNotes.length,
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
  const gaTableDirty = gaTableInput !== (gaTableEntry?.content ?? "")

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

  React.useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (activeTab !== "all" || viewMode !== "mine") {
        setGaTableEntry(null)
        setGaTableInput("")
        return
      }
      if (!department?.id || !user?.id) {
        setGaTableEntry(null)
        setGaTableInput("")
        return
      }
      try {
        const qs = new URLSearchParams({
          day: todayIso,
          department_id: department.id,
          user_id: user.id,
        })
        const res = await apiFetch(`/reports/daily-ga-table?${qs.toString()}`)
        if (!res.ok) {
          if (!cancelled) {
            setGaTableEntry(null)
            setGaTableInput("")
          }
          return
        }
        const payload = (await res.json()) as DailyReportGaTableResponse
        if (cancelled) return
        setGaTableEntry(payload.entry ?? null)
        setGaTableInput(payload.entry?.content ?? "")
      } catch {
        if (!cancelled) {
          setGaTableEntry(null)
          setGaTableInput("")
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [activeTab, apiFetch, department?.id, todayIso, user?.id, viewMode])

  const saveGaTableEntry = React.useCallback(
    async (nextValue: string) => {
      if (!department?.id || !user?.id) return
      setSavingGaTable(true)
      try {
        const res = await apiFetch("/reports/daily-ga-entry", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            day: todayIso,
            department_id: department.id,
            content: nextValue,
          }),
        })
        if (!res.ok) return
        const payload = (await res.json()) as DailyReportGaEntry
        setGaTableEntry(payload)
        setGaTableInput(payload.content ?? "")
      } finally {
        setSavingGaTable(false)
      }
    },
    [apiFetch, department?.id, todayIso, user?.id]
  )

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
      { id: "IN", label: "IN" },
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

  const handleCloseTaskClick = (task: SystemTaskTemplate) => {
    const templateId = task.template_id ?? task.id
    setTaskToCloseId(templateId)
    setTaskToCloseTemplate(task)
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
    const occurrenceBaseDate = taskToCloseTemplate
      ? findPreviousOccurrenceDate(taskToCloseTemplate, systemDate)
      : systemDate
    const occurrenceDate = formatDateInput(occurrenceBaseDate)

    try {
      const res = await apiFetch("/system-tasks/occurrences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: taskToCloseId,
          occurrence_date: occurrenceDate,
          status: "DONE",
          comment: closeTaskComment.trim(),
        }),
      })
      if (!res.ok) {
        toast.error("Failed to close system task")
        setClosingTask(false)
        return
      }

      setSystemTasks((prev) =>
        prev.map((task) => {
          const templateId = task.template_id ?? task.id
          return templateId === taskToCloseId
            ? { ...task, status: "DONE", user_comment: closeTaskComment.trim() }
            : task
        })
      )
      
      // Reload system tasks
      const sysRes = await apiFetch(
        `/system-tasks?department_id=${department?.id || ""}&occurrence_date=${formatDateInput(systemDate)}`
      )
      if (sysRes.ok) {
        setSystemTasks((await sysRes.json()) as SystemTaskTemplate[])
      }
      
      setCloseTaskDialogOpen(false)
      setTaskToCloseId(null)
      setTaskToCloseTemplate(null)
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
    // Get assignees from assignees array, fallback to assigned_to for backward compatibility
    const assigneeIds = task.assignees && task.assignees.length > 0
      ? task.assignees.map(a => a.id).filter((id): id is string => Boolean(id))
      : (task.assigned_to ? [task.assigned_to] : [])
    setEditTaskAssignees(assigneeIds)
  }

  const cancelEditTask = () => {
    setEditingTaskId(null)
    setEditTaskTitle("")
    setEditTaskDescription("")
    setEditTaskStartDate("")
    setEditTaskDueDate("")
    setEditTaskFinishPeriod(FINISH_PERIOD_NONE_VALUE)
    setEditTaskAssignees([])
  }

  const updateNoProjectTask = async () => {
    if (!editingTaskId || !editTaskTitle.trim() || !editTaskStartDate) return
    setUpdatingTask(true)
    try {
      const startDateValue = editTaskStartDate ? new Date(editTaskStartDate).toISOString() : null
      const dueDateValue = editTaskDueDate ? new Date(editTaskDueDate).toISOString() : null
      // Use first assignee for backward compatibility, or null if no assignees
      const assignedToValue = editTaskAssignees.length > 0 ? editTaskAssignees[0] : null
      const res = await apiFetch(`/tasks/${editingTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTaskTitle.trim(),
          description: editTaskDescription.trim() || null,
          start_date: startDateValue,
          due_date: dueDateValue,
          finish_period: editTaskFinishPeriod === FINISH_PERIOD_NONE_VALUE ? null : editTaskFinishPeriod,
          assigned_to: assignedToValue,
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
      // Create one task with multiple assignees instead of multiple tasks
      const assigneeIds = noProjectAssignees.length > 0 ? noProjectAssignees : null
      const res = await apiFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          assigned_to: assigneeIds && assigneeIds.length > 0 ? assigneeIds[0] : null,
          assignees: assigneeIds,
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
      // Add all non-project tasks to noProjectTasks (they'll be categorized into buckets)
      const nonProjectTasks = isNoProjectTask(created) ? [created] : []
      if (nonProjectTasks.length) {
        setNoProjectTasks((prev) => [...nonProjectTasks, ...prev])
      }
      setDepartmentTasks((prev) => [created, ...prev])
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
      let startsAt: string | null = null
      if (meetingRecurrenceType === "none") {
        startsAt = meetingStartsAt ? new Date(meetingStartsAt).toISOString() : null
      } else {
        if (!meetingStartTime) {
          toast.error("Time is required for recurring meetings")
          return
        }
        if (meetingRecurrenceType === "weekly" && meetingRecurrenceDaysOfWeek.length === 0) {
          toast.error("Select at least one day")
          return
        }
        if (meetingRecurrenceType === "monthly" && meetingRecurrenceDaysOfMonth.length === 0) {
          toast.error("Select at least one day")
          return
        }
        const next = computeNextOccurrenceDate({
          recurrenceType: meetingRecurrenceType,
          daysOfWeek: meetingRecurrenceDaysOfWeek,
          daysOfMonth: meetingRecurrenceDaysOfMonth,
          timeValue: meetingStartTime,
        })
        if (!next) {
          toast.error("Failed to compute next occurrence")
          return
        }
        startsAt = next.toISOString()
      }
      const payload = {
        title: meetingTitle.trim(),
        platform: meetingPlatform.trim() || null,
        starts_at: startsAt,
        meeting_url: meetingUrl.trim() || null,
        recurrence_type: meetingRecurrenceType === "none" ? null : meetingRecurrenceType,
        recurrence_days_of_week: meetingRecurrenceType === "weekly" && meetingRecurrenceDaysOfWeek.length > 0 ? meetingRecurrenceDaysOfWeek : null,
        recurrence_days_of_month: meetingRecurrenceType === "monthly" && meetingRecurrenceDaysOfMonth.length > 0 ? meetingRecurrenceDaysOfMonth : null,
        department_id: department.id,
        project_id: meetingProjectId === "__none__" ? null : meetingProjectId,
        participant_ids: meetingParticipantIds,
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
      setMeetingStartTime("")
      setMeetingUrl("")
      setMeetingRecurrenceType("none")
      setMeetingRecurrenceDaysOfWeek([])
      setMeetingRecurrenceDaysOfMonth([])
      setMeetingParticipantIds([])
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
    setEditMeetingStartTime(toMeetingTimeInputValue(meeting.starts_at))
    setEditMeetingUrl(meeting.meeting_url || "")
    setEditMeetingRecurrenceType((meeting.recurrence_type as "none" | "weekly" | "monthly") || "none")
    setEditMeetingRecurrenceDaysOfWeek(meeting.recurrence_days_of_week || [])
    setEditMeetingRecurrenceDaysOfMonth(meeting.recurrence_days_of_month || [])
    setEditMeetingParticipantIds(meeting.participant_ids || [])
    setEditMeetingProjectId(meeting.project_id || "__none__")
  }

  const cancelEditMeeting = () => {
    setEditingMeetingId(null)
    setEditMeetingTitle("")
    setEditMeetingPlatform("")
    setEditMeetingStartsAt("")
    setEditMeetingStartTime("")
    setEditMeetingUrl("")
    setEditMeetingRecurrenceType("none")
    setEditMeetingRecurrenceDaysOfWeek([])
    setEditMeetingRecurrenceDaysOfMonth([])
    setEditMeetingParticipantIds([])
    setEditMeetingProjectId("__none__")
  }

  const saveMeeting = async (meetingId: string) => {
    if (!editMeetingTitle.trim()) {
      toast.error("Meeting title is required")
      return
    }
    if (!department) return
    setSavingMeeting(true)
    try {
      let startsAt: string | null = null
      if (editMeetingRecurrenceType === "none") {
        startsAt = editMeetingStartsAt ? new Date(editMeetingStartsAt).toISOString() : null
      } else {
        if (!editMeetingStartTime) {
          toast.error("Time is required for recurring meetings")
          return
        }
        if (editMeetingRecurrenceType === "weekly" && editMeetingRecurrenceDaysOfWeek.length === 0) {
          toast.error("Select at least one day")
          return
        }
        if (editMeetingRecurrenceType === "monthly" && editMeetingRecurrenceDaysOfMonth.length === 0) {
          toast.error("Select at least one day")
          return
        }
        const next = computeNextOccurrenceDate({
          recurrenceType: editMeetingRecurrenceType,
          daysOfWeek: editMeetingRecurrenceDaysOfWeek,
          daysOfMonth: editMeetingRecurrenceDaysOfMonth,
          timeValue: editMeetingStartTime,
        })
        if (!next) {
          toast.error("Failed to compute next occurrence")
          return
        }
        startsAt = next.toISOString()
      }
      const payload = {
        title: editMeetingTitle.trim(),
        platform: editMeetingPlatform.trim() || null,
        starts_at: startsAt,
        meeting_url: editMeetingUrl.trim() || null,
        recurrence_type: editMeetingRecurrenceType === "none" ? null : editMeetingRecurrenceType,
        recurrence_days_of_week: editMeetingRecurrenceType === "weekly" && editMeetingRecurrenceDaysOfWeek.length > 0 ? editMeetingRecurrenceDaysOfWeek : null,
        recurrence_days_of_month: editMeetingRecurrenceType === "monthly" && editMeetingRecurrenceDaysOfMonth.length > 0 ? editMeetingRecurrenceDaysOfMonth : null,
        project_id: editMeetingProjectId === "__none__" ? null : editMeetingProjectId,
        participant_ids: editMeetingParticipantIds,
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
      console.log("Updated meeting from API:", updated)
      // Reload meetings to ensure we have the latest data including participants and recurrence
      const meetingsRes = await apiFetch(`/meetings?department_id=${department.id}`)
      if (meetingsRes.ok) {
        const refreshedMeetings = (await meetingsRes.json()) as Meeting[]
        console.log("Refreshed meetings:", refreshedMeetings)
        const updatedMeeting = refreshedMeetings.find(m => m.id === meetingId)
        console.log("Updated meeting in refreshed list:", updatedMeeting)
        setMeetings(refreshedMeetings)
      } else {
        console.warn("Failed to reload meetings, using updated meeting:", updated)
        // Fallback to updating just the one meeting if reload fails
        setMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      }
      cancelEditMeeting()
      toast.success("Meeting updated successfully")
    } finally {
      setSavingMeeting(false)
    }
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
    if (!title) {
      toast.error("Checklist item title is required")
      return
    }
    setSavingInternalMeetingItem(true)
    try {
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
      toast.success("Checklist item updated")
    } finally {
      setSavingInternalMeetingItem(false)
    }
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
        const startDateValue = gaNoteTaskStartDate ? new Date(gaNoteTaskStartDate).toISOString() : null
        const taskPayload = {
          title: gaNoteTaskDefaultTitle(newGaNote),
          description: newGaNote.trim(),
          project_id: created.project_id ?? null,
          department_id: department.id,
          assigned_to: gaNoteTaskAssignee === "__unassigned__" ? null : gaNoteTaskAssignee,
          status: "TODO",
          priority: newGaNotePriority === "__none__" ? "NORMAL" : newGaNotePriority,
          ga_note_origin_id: created.id,
          start_date: startDateValue,
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

  const submitInternalNote = async () => {
    const title = internalNoteTitle.trim()
    const description = internalNoteDescription.trim()
    if (!title || internalNoteToUserIds.length === 0) {
      return
    }
    setAddingInternalNote(true)
    try {
      const res = await apiFetch("/internal-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          departmentId: internalNoteDepartmentId || null,
          projectId: internalNoteProjectId || null,
          toUserIds: internalNoteToUserIds,
        }),
      })
      if (!res.ok) {
        let detail = "Failed to add internal note"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const created = (await res.json()) as InternalNote[]
      const departmentId = department?.id
      const visibleCreated = departmentId
        ? created.filter((note) => (note.department_id || note.to_department_id) === departmentId)
        : created
      setInternalNotes((prev) => [...visibleCreated, ...prev])
      setInternalNoteTitle("")
      setInternalNoteDescription("")
      setInternalNoteProjectId("")
      setInternalNoteToUserIds([])
      setInternalNoteOpen(false)
      toast.success("Internal note added")
    } finally {
      setAddingInternalNote(false)
    }
  }

  const deleteInternalNote = async (noteIds: string[] | string) => {
    const ids = Array.isArray(noteIds) ? noteIds : [noteIds]
    if (!ids.length) return
    if (!window.confirm("Are you sure you want to delete this internal note?")) return
    let failed = false
    for (const noteId of ids) {
      const res = await apiFetch(`/internal-notes/${noteId}`, { method: "DELETE" })
      if (!res.ok) {
        failed = true
      }
    }
    if (failed) {
      toast.error("Failed to delete internal note")
      return
    }
    setInternalNotes((prev) => prev.filter((note) => !ids.includes(note.id)))
    toast.success("Internal note deleted")
  }

  const updateInternalNoteDone = async (noteIds: string[] | string, isDone: boolean) => {
    const ids = Array.isArray(noteIds) ? noteIds : [noteIds]
    if (!ids.length) return
    const previous = internalNotes
    setUpdatingInternalNoteIds((prev) => [...new Set([...prev, ...ids])])
    const nowIso = new Date().toISOString()
    setInternalNotes((prev) =>
      prev.map((note) =>
        ids.includes(note.id)
          ? {
            ...note,
            is_done: isDone,
            done_at: isDone ? nowIso : null,
            done_by_user_id: isDone ? (user?.id || null) : null,
          }
          : note
      )
    )
    let failed = false
    for (const noteId of ids) {
      const res = await apiFetch(`/internal-notes/${noteId}/done`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDone }),
      })
      if (!res.ok) {
        failed = true
      }
    }
    if (failed) {
      setInternalNotes(previous)
      toast.error("Failed to update internal note status")
    } else {
      toast.success(isDone ? "Internal note marked as done" : "Internal note reopened")
    }
    setUpdatingInternalNoteIds((prev) => prev.filter((id) => !ids.includes(id)))
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
      const startDateValue = gaNoteTaskStartDate ? new Date(gaNoteTaskStartDate).toISOString() : null
      const dueDateValue = gaNoteTaskDueDate ? new Date(gaNoteTaskDueDate).toISOString() : null
      const isProjectLinked = gaNoteTaskHasProject
      const priorityValue: TaskPriority = isProjectLinked && gaNoteTaskPriority === "HIGH" ? "HIGH" : "NORMAL"
      const isBllok = !isProjectLinked && gaNoteTaskPriority === "BLLOK"
      const is1hReport = !isProjectLinked && gaNoteTaskPriority === "1H"
      const isR1 = !isProjectLinked && gaNoteTaskPriority === "R1"
      const taskPayload = {
        title: gaNoteTaskTitle.trim() || gaNoteTaskDefaultTitle(note.content || ""),
        description: gaNoteTaskDescription.trim() || null,
        project_id: note.project_id ?? null,
        department_id: department.id,
        assigned_to: gaNoteTaskAssigneeId === "__unassigned__" ? null : gaNoteTaskAssigneeId,
        status: "TODO",
        priority: priorityValue,
        ga_note_origin_id: note.id,
        start_date: startDateValue,
        due_date: dueDateValue,
        finish_period: gaNoteTaskFinishPeriod === FINISH_PERIOD_NONE_VALUE ? null : gaNoteTaskFinishPeriod,
        is_bllok: isBllok,
        is_1h_report: is1hReport,
        is_r1: isR1,
        is_personal: false,
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
      setGaNoteTaskStartDate(todayInputValue())
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
      <style jsx>{`
        .common-sticky {
          position: sticky;
          top: 0;
          z-index: 20;
          background: #ffffff;
        }
        .top-header { 
          background: linear-gradient(135deg, #93c5fd 0%, #60a5fa 100%);
          padding: 12px 24px; 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          flex-shrink: 0;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .page-title h1 { 
          font-size: 20px; 
          margin-bottom: 2px; 
          color: white;
          font-weight: 700;
          letter-spacing: -0.5px;
        }
        .page-title p { 
          font-size: 11px; 
          color: rgba(255, 255, 255, 0.9); 
          margin: 0; 
        }
        .btn-primary { 
          background: white; 
          color: #475569; 
          border: none; 
          padding: 6px 14px; 
          border-radius: 6px; 
          font-size: 12px; 
          font-weight: 600;
          cursor: pointer; 
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .btn-primary:hover { 
          background: #f8f9fa;
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
        }
        .btn-outline { 
          background: rgba(255, 255, 255, 0.2); 
          color: white; 
          border: 1px solid rgba(255, 255, 255, 0.3); 
          padding: 6px 14px; 
          border-radius: 6px; 
          font-size: 12px; 
          font-weight: 600;
          cursor: pointer; 
          transition: all 0.2s ease;
        }
        .btn-outline:hover { 
          background: rgba(255, 255, 255, 0.3);
          border-color: rgba(255, 255, 255, 0.5);
        }
        .btn-outline.active {
          background: #ffffff;
          color: #0f172a;
          border-color: #ffffff;
          box-shadow: 0 4px 10px rgba(15, 23, 42, 0.2);
        }
        .common-toolbar {
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          padding: 12px 24px;
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          align-items: center;
        }
        .toolbar-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .chip {
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #cbd5e1;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .chip:hover {
          background: #e2e8f0;
          border-color: #94a3b8;
        }
        .chip.active {
          background: #475569;
          color: white;
          border-color: #475569;
        }
        .switch {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #64748b;
          cursor: pointer;
        }
        .switch input[type="checkbox"] {
          cursor: pointer;
        }
      `}</style>
      <div className="common-sticky print:hidden">
        <header className="top-header">
          <div className="page-title">
            <h1>{departmentName}</h1>
            <p>Manage projects and daily tasks.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-outline no-print"
              type="button"
              onClick={() => setViewMode("department")}
            >
              Department
            </button>
            <button
              className={`btn-outline no-print ${viewMode === "mine" ? "active" : ""}`}
              type="button"
              onClick={() => setViewMode("mine")}
            >
              My View
            </button>
          </div>
        </header>

        <div className="common-toolbar no-print">
          <div className="toolbar-group">
            <div className="chip-row">
              {TABS.map((tab) => {
                const isActive = tab.id === activeTab
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`chip ${isActive ? "active" : ""}`}
                  >
                    {tab.label} ({counts[tab.id]})
                  </button>
                )
              })}
            </div>
            {activeTab === "all" ? (
              <div className="chip-row">
                <button
                  type="button"
                  onClick={() => setAllRange("today")}
                  className={`chip ${allRange === "today" ? "active" : ""}`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setAllRange("week")}
                  className={`chip ${allRange === "week" ? "active" : ""}`}
                >
                  This Week
                </button>
              </div>
            ) : null}
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
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
              {filteredProjects.map((project) => {
                const manager = project.manager_id ? userMap.get(project.manager_id) : null
                const creator = project.created_by ? userMap.get(project.created_by) : null
                const badgeUser = creator || manager
                const badgeTitle = creator
                  ? `Creator: ${creator.full_name || creator.username || "-"}`
                  : manager
                    ? `Manager: ${manager.full_name || manager.username || "-"}`
                    : "No creator"
                const membersForProject = projectMembers[project.id] || []
                const combinedMembers = manager ? [...membersForProject, manager] : membersForProject
                const uniqueMembers = Array.from(new Map(combinedMembers.map((m) => [m.id, m])).values())
                const visibleMembers = uniqueMembers.slice(0, 4)
                const remainingMembers = uniqueMembers.length - visibleMembers.length
                const phase = project.current_phase || "MEETINGS"
                const isClosed = phase.toUpperCase() === "CLOSED"
                
                // Count tasks for this project
                const taskCount = departmentTasks.filter(t => t.project_id === project.id).length
                
                // Count GA notes for this project
                const gaNoteCount = gaNotes.filter(n => n.project_id === project.id).length
                
                // Format deadline
                const formatDeadline = (dateStr?: string | null) => {
                  if (!dateStr) return "-"
                  const date = new Date(dateStr)
                  if (Number.isNaN(date.getTime())) return "-"
                  return date.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" })
                }
                
                return (
                  <Link key={project.id} href={`/projects/${project.id}`} className="group block">
                    <Card className={`bg-white border rounded-lg p-2.5 transition-all ${isClosed ? "border-slate-300 opacity-60 hover:opacity-80" : "border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1"}`}>
                      {/* Header: Title and Delete button */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-semibold truncate ${isClosed ? "text-slate-500" : "text-slate-900 dark:text-slate-100"}`}>
                            {project.title || project.name}
                            {isClosed && <span className="ml-1.5 text-xs font-normal text-slate-400">(Closed)</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {badgeUser ? (
                            <div
                              className="h-6 w-6 rounded-full bg-amber-100 text-[10px] font-semibold text-amber-800 flex items-center justify-center shadow-sm"
                              title={badgeTitle}
                            >
                              {initials(badgeUser.full_name || badgeUser.username || "-")}
                            </div>
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500 flex items-center justify-center">
                              -
                            </div>
                          )}
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
                              className="h-5 w-5 rounded-full border-red-200 p-0 text-xs text-red-600 hover:bg-red-50 flex-shrink-0 flex items-center justify-center"
                            >
                              {deletingProjectId === project.id ? "..." : "×"}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      
                      {/* Current Phase */}
                      <div className="mb-2">
                        <Badge className={`text-xs whitespace-nowrap px-2 py-0.5 ${isClosed ? "bg-slate-200 text-slate-500 border border-slate-300" : "bg-blue-100 text-blue-700 border border-blue-200"}`}>
                          {PHASE_LABELS[phase] || "Meetings"}
                        </Badge>
                      </div>
                      
                      {/* Stats Grid: Tasks, GA Notes, Deadline */}
                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        <div className="text-center p-1.5 bg-slate-50 dark:bg-slate-800 rounded-md">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-0.5">Tasks</div>
                          <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{taskCount}</div>
                        </div>
                        <div className="text-center p-1.5 bg-slate-50 dark:bg-slate-800 rounded-md">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-0.5">GA Notes</div>
                          <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{gaNoteCount}</div>
                        </div>
                        <div className="text-center p-1.5 bg-slate-50 dark:bg-slate-800 rounded-md">
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-0.5">Deadline</div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">{formatDeadline(project.due_date)}</div>
                        </div>
                      </div>
                      
                      {/* Members */}
                      <div className="mb-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Members</div>
                        <div className="flex items-center gap-1.5">
                          {visibleMembers.length > 0 ? (
                            <div className="flex -space-x-1.5">
                              {visibleMembers.map((member) => (
                                <div
                                  key={member.id}
                                  title={member.full_name || member.username || "-"}
                                  className="h-6 w-6 rounded-full border-2 border-white bg-slate-100 text-xs font-semibold text-slate-600 flex items-center justify-center shadow-sm dark:border-slate-800 dark:bg-slate-700 dark:text-slate-300"
                                >
                                  {initials(member.full_name || member.username || "-")}
                                </div>
                              ))}
                              {remainingMembers > 0 && (
                                <div className="h-6 w-6 rounded-full border-2 border-white bg-slate-100 text-[10px] font-semibold text-slate-600 flex items-center justify-center shadow-sm dark:border-slate-800 dark:bg-slate-700 dark:text-slate-300">
                                  +{remainingMembers}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400 dark:text-slate-500">No members</div>
                          )}
                        </div>
                      </div>
                      
                      {/* View Details Link */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 transition-colors group-hover:text-blue-700 dark:group-hover:text-blue-300 group-hover:underline">
                          View details →
                        </span>
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
                  {viewMode === "department"
                    ? `All (${allRange === "week" ? "This Week" : "Today"}) - Department`
                    : `All (${allRange === "week" ? "This Week" : "Today"})`}
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
            <div className="grid gap-4 md:grid-cols-5">
              {[
                { label: "PROJECT TASKS", value: todayProjectTasks.length, color: "sky" },
                { label: "GA NOTES", value: todayOpenNotes.length, color: "sky" },
                { label: "INTERNAL NOTES", value: todayGroupedInternalNotes.length, color: "indigo" },
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
                              <td className="border border-slate-200 px-2 py-2 align-top uppercase">
                                {row.typeLabel === "PRJK" && row.projectTitle ? (
                                  <>
                                    <span className="font-semibold">{row.projectTitle}</span>
                                    <span> : {row.title}</span>
                                  </>
                                ) : (
                                  row.title
                                )}
                              </td>
                              <td
                                className={`border border-slate-200 px-2 py-2 align-top uppercase ${weeklyPlanStatusBgClass(row.status)}`}
                              >
                                {row.status}
                              </td>
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
                <div className="mt-4">
                  <table className="min-w-[900px] w-[80%] border border-slate-200 text-[11px] daily-report-table">
                    <colgroup>
                      <col className="w-[180px]" />
                      <col />
                    </colgroup>
                    <tbody>
                      <tr>
                        <td className="border border-slate-200 px-2 py-2 text-xs font-semibold uppercase align-top">
                          GA/KUR/SI/KUJT/PRBL
                        </td>
                        <td className="border border-slate-200 px-2 py-2">
                          <div className="flex items-start gap-2">
                            <Textarea
                              value={gaTableInput}
                              onChange={(e) => setGaTableInput(e.target.value)}
                              onBlur={(e) => {
                                const nextValue = e.target.value
                                if (nextValue === (gaTableEntry?.content ?? "")) return
                                void saveGaTableEntry(nextValue)
                              }}
                              placeholder="Add GA/KUR/SI/KUJT/PRBL..."
                              className="min-h-[60px] text-xs"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8 rounded-lg border-slate-300 bg-white px-3 text-[11px] text-slate-900 shadow-sm hover:bg-slate-50"
                              disabled={savingGaTable || !gaTableDirty}
                              onClick={() => void saveGaTableEntry(gaTableInput)}
                            >
                              {savingGaTable ? "Saving..." : "Save"}
                            </Button>
                          </div>
                        </td>
                      </tr>
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
                              const assigneeList = taskAssigneeLabels(task)
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
                                    {assigneeList.join(", ")}
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
                <div className="relative w-full rounded-xl bg-white border border-slate-200 border-l-4 border-indigo-500 p-4 text-slate-700 md:w-48 md:shrink-0">
                  <div className="text-sm font-semibold">INTERNAL NOTES</div>
                  <span className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {todayGroupedInternalNotes.length}
                  </span>
                  <div className="mt-2 text-xs text-slate-500">Team updates</div>
                </div>
                <div className="flex-1 rounded-xl border border-slate-200 bg-white p-3 flex flex-col max-h-[300px] overflow-y-auto">
                  {todayGroupedInternalNotes.length ? (
                    <div className="space-y-2">
                      {todayGroupedInternalNotes.map((group) => {
                        const note = group.note
                        const fromUser = users.find((u) => u.id === note.from_user_id) || null
                        const fromLabel = fromUser?.full_name || fromUser?.username || "Unknown user"
                        const toInitials = group.toUserIds
                          .map((id) => {
                            const toUser = userMap.get(id)
                            const toLabel = toUser?.full_name || toUser?.username || "Unknown user"
                            return initials(toLabel)
                          })
                          .join(", ")
                        return (
                          <div
                            key={note.id}
                            className="rounded-lg border border-slate-200 border-l-4 border-indigo-500 bg-white px-3 py-2 text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <div className="font-medium text-slate-800">{note.title}</div>
                              {group.notes.every((n) => n.is_done) ? (
                                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                                  Done
                                </Badge>
                              ) : null}
                            </div>
                            <div className="mt-1 text-xs text-slate-600">{note.description || "-"}</div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              From {initials(fromLabel)} to {toInitials || "-"}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">No internal notes today.</div>
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
                        const typeLabel = noProjectTypeLabel(task)
                        const taskPriority = (task.priority as "HIGH" | "NORMAL") || "NORMAL"
                        const isHighPriority = taskPriority === "HIGH"
                        const statusValue = taskStatusValue(task)
                        const isCompleted = statusValue === "DONE"
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
                            className={`block rounded-lg border border-slate-200 border-l-4 px-3 py-2 text-sm transition hover:bg-slate-50 ${
                              isCompleted 
                                ? "border-green-500 bg-green-50/30 opacity-75" 
                                : "border-blue-500 bg-white"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {task.ga_note_origin_id && (task.is_bllok || task.is_1h_report || task.is_r1 || task.is_personal) && (
                                  <Badge className="bg-red-500 text-white border-0 text-[9px] px-1.5 py-0.5 font-semibold">
                                    GA
                                  </Badge>
                                )}
                                <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs">
                                  {typeLabel}
                                </Badge>
                                <div className={`font-medium ${isCompleted ? "text-slate-500" : "text-slate-800"}`}>
                                  {task.title}
                                </div>
                                <Badge className={`border text-xs ${statusBadgeClasses(statusValue)}`}>
                                  {reportStatusLabel(statusValue)}
                                </Badge>
                                {isHighPriority && (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs bg-red-100 text-red-700 border-red-200"
                                  >
                                    {taskPriority}
                                  </Badge>
                                )}
                                {task.finish_period && (
                                  <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                                    {task.finish_period}
                                  </Badge>
                                )}
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
                          const departmentLabel =
                            template.scope === "GA"
                              ? "GA"
                              : template.scope === "ALL"
                                ? "ALL"
                                : department
                                  ? formatDepartmentName(department.name)
                                  : "-"
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
                                  {showSystemActions && isAssigned && !isClosed && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={closingTask}
                                      onClick={() => handleCloseTaskClick(template)}
                                      className="h-7 text-xs"
                                    >
                                      {closingTask ? "Updating..." : "Mark done"}
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
                      <div className="space-y-2">
                        <Label className="text-slate-700">Assign to</Label>
                        <Dialog open={selectEditTaskAssigneesOpen} onOpenChange={setSelectEditTaskAssigneesOpen}>
                          <DialogTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full justify-start border-slate-200 focus:border-slate-400 rounded-xl"
                            >
                              {editTaskAssigneeLabel}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md z-[110]">
                            <DialogHeader>
                              <DialogTitle>Select Assignees</DialogTitle>
                            </DialogHeader>
                            <div className="mt-4 max-h-[400px] overflow-y-auto space-y-2">
                              {users.length ? (
                                users.map((u) => {
                                  const isSelected = editTaskAssignees.includes(u.id)
                                  return (
                                    <div
                                      key={u.id}
                                      className="flex items-center space-x-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                                      onClick={() => {
                                        if (isSelected) {
                                          setEditTaskAssignees((prev) => prev.filter((id) => id !== u.id))
                                        } else {
                                          setEditTaskAssignees((prev) => [...prev, u.id])
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
                              <Button variant="outline" onClick={() => setEditTaskAssignees([])}>
                                Clear
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => setEditTaskAssignees(users.map((u) => u.id))}
                                disabled={!users.length}
                              >
                                All users
                              </Button>
                              <Button onClick={() => setSelectEditTaskAssigneesOpen(false)}>
                                Done
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
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
                          const statusValue = taskStatusValue(t)
                          const isCompleted = statusValue === "DONE"
                          return (
                          <Link
                            key={t.id}
                            id={`task-${t.id}`}
                            href={`/tasks/${t.id}?returnTo=${encodeURIComponent(`${returnToTasks}#task-${t.id}`)}`}
                            className={`block rounded-lg border border-slate-200 border-l-4 px-3 py-2 text-sm transition hover:bg-slate-50 ${
                              isCompleted 
                                ? "border-green-500 bg-green-50/30 opacity-75" 
                                : `${row.borderClass} bg-white`
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {t.ga_note_origin_id && (t.is_bllok || t.is_1h_report || t.is_r1 || t.is_personal) && (
                                  <Badge className="bg-red-500 text-white border-0 text-[9px] px-1.5 py-0.5 font-semibold">
                                    GA
                                  </Badge>
                                )}
                                <div className={`font-medium text-xs ${isCompleted ? "text-slate-500" : "text-slate-800"}`}>
                                  {t.title}
                                </div>
                                <Badge className={`border text-[10px] ${statusBadgeClasses(statusValue)}`}>
                                  {reportStatusLabel(statusValue)}
                                </Badge>
                                {isHighPriority && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[11px] bg-red-100 text-red-700 border-red-200"
                                  >
                                    {taskPriority}
                                  </Badge>
                                )}
                              </div>
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
                if (!open) {
                  setGaNoteTaskOpenId(null)
                  setGaNoteTaskStartDate(todayInputValue())
                  setGaNoteTaskHasProject(false)
                }
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
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={gaNoteTaskPriority} onValueChange={(v) => setGaNoteTaskPriority(v as GaNoteTaskType)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {(gaNoteTaskHasProject ? GA_NOTE_TASK_TYPE_OPTIONS_PROJECT : GA_NOTE_TASK_TYPE_OPTIONS_FAST).map((option) => (
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
                      <Label>Start date</Label>
                      <Input
                        type="date"
                        value={gaNoteTaskStartDate}
                        onChange={(e) => setGaNoteTaskStartDate(normalizeDueDateInput(e.target.value))}
                      />
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
            <div className="rounded-md border-2 border-slate-700 max-h-[75vh] overflow-x-auto overflow-y-auto relative bg-white w-full">
              <div className="w-full min-w-[1050px]">
                <table className="w-full caption-bottom text-sm min-w-[1050px]">
                  <thead className="sticky top-0 z-50 bg-white shadow-md" style={{ position: 'sticky', top: 0, zIndex: 50 }}>
                    <tr className="bg-white" style={{ borderBottom: '1px solid rgb(51 65 85)' }}>
                      <th className="w-[40px] border border-slate-600 border-l-2 border-l-slate-800 bg-white text-foreground h-10 px-2 text-left align-middle font-medium" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)', whiteSpace: 'normal' }}>Nr</th>
                      <th className="w-[450px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>SHENIMI</th>
                      <th className="w-[140px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>DATA,ORA</th>
                      <th className="w-[60px] border border-slate-600 bg-white text-foreground h-10 px-1.5 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>NGA</th>
                      <th className="w-[60px] border border-slate-600 bg-white text-foreground h-10 px-1.5 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>PER</th>
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
                          const project = note.project_id ? projects.find((p) => p.id === note.project_id) || null : null
                          const projectDepartment = project?.department_id
                            ? departments.find((d) => d.id === project.department_id) || null
                            : null
                          const projectDepartmentCode = projectDepartment?.code?.toUpperCase() || ""
                          const isManualOnlyProject = projectDepartmentCode === "PCM" || projectDepartmentCode === "GDS"
                          const linkedTask = gaNoteTaskMap.get(note.id) || null
                          const creatorLabel = author?.full_name || author?.username || "Unknown user"
                          const creatorInitials = getInitials(creatorLabel)
                          const creatorBadgeClasses =
                            creatorInitials === "GA"
                              ? "bg-rose-100 text-rose-800 border border-rose-200"
                              : creatorInitials === "KA"
                                ? "bg-blue-100 text-blue-800 border border-blue-200"
                                : "bg-slate-200 text-slate-700"
                          const linkedAssignees = linkedTask?.assignees && linkedTask.assignees.length > 0
                            ? linkedTask.assignees
                            : (() => {
                                const assignedId = linkedTask?.assigned_to || null
                                if (!assignedId) return []
                                const assignedUser = userMap.get(assignedId)
                                return assignedUser
                                  ? [{ id: assignedId, full_name: assignedUser.full_name, username: assignedUser.username, email: assignedUser.email }]
                                  : []
                              })()
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
                              <td className="w-[60px] border border-slate-600 p-1.5 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>
                                {linkedAssignees.length === 0 ? (
                                  <span className="text-xs text-slate-500">-</span>
                                ) : (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {linkedAssignees.map((assignee, assigneeIdx) => {
                                      const assigneeLabel = assignee.full_name || assignee.username || assignee.email || "Unknown"
                                      const assigneeInitials = getInitials(assigneeLabel)
                                      const assigneeBadgeClasses =
                                        assigneeInitials === "GA"
                                          ? "bg-rose-100 text-rose-800 border border-rose-200"
                                          : assigneeInitials === "KA"
                                            ? "bg-blue-100 text-blue-800 border border-blue-200"
                                            : "bg-slate-200 text-slate-700"
                                      return (
                                        <div
                                          key={assignee.id || assigneeIdx}
                                          className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${assigneeBadgeClasses}`}
                                          title={assigneeLabel}
                                        >
                                          {assigneeInitials}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
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
                                  ) : isManualOnlyProject ? (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 text-slate-600 border-slate-200 h-7 flex items-center">
                                      Manual only
                                    </Badge>
                                  ) : canCreate && !isReadOnly && note.status !== "CLOSED" ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                      onClick={() => {
                                        setGaNoteTaskOpenId(note.id)
                                        setGaNoteTaskTitle(gaNoteTaskDefaultTitle(note.content || ""))
                                        setGaNoteTaskDescription(note.content || "")
                                        setGaNoteTaskPriority("NORMAL")
                                        setGaNoteTaskHasProject(Boolean(note.project_id))
                                        setGaNoteTaskStartDate(todayInputValue())
                                        setGaNoteTaskDueDate("")
                                        setGaNoteTaskAssigneeId("__unassigned__")
                                        setGaNoteTaskFinishPeriod(FINISH_PERIOD_NONE_VALUE)
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
        ) : null}

        {activeTab === "internal-notes" ? (
          <div className="space-y-3 sm:space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-base sm:text-lg font-semibold">Internal Notes</div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={showDoneInternalNotes}
                    onChange={(e) => setShowDoneInternalNotes(e.target.checked)}
                  />
                  <span>Show Done</span>
                </label>
                {viewMode === "department" ? (
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
                ) : null}
                <Dialog open={internalNoteOpen} onOpenChange={setInternalNoteOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-auto">Create Internal Note</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Create Internal Note</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input
                          value={internalNoteTitle}
                          onChange={(e) => setInternalNoteTitle(e.target.value)}
                          placeholder="Enter title"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                          value={internalNoteDescription}
                          onChange={(e) => setInternalNoteDescription(e.target.value)}
                          placeholder="Enter description"
                          rows={4}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Department</Label>
                        <Select
                          value={internalNoteDepartmentId}
                          onValueChange={(value) => {
                            setInternalNoteDepartmentId(value)
                            setInternalNoteProjectId("")
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map((dep) => (
                              <SelectItem key={dep.id} value={dep.id}>
                                {dep.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Project</Label>
                        <Select
                          value={internalNoteProjectId}
                          onValueChange={setInternalNoteProjectId}
                          disabled={!internalNoteDepartmentId || loadingInternalNoteProjects}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                !internalNoteDepartmentId
                                  ? "Select a department first"
                                  : loadingInternalNoteProjects
                                    ? "Loading projects..."
                                    : "Select project"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {internalNoteProjects.map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                {project.title || project.name || "Untitled project"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>User (To)</Label>
                        <div className="rounded-md border border-slate-200 p-2 max-h-56 overflow-y-auto space-y-2">
                          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                            <Checkbox
                              checked={users.length > 0 && users.every((u) => internalNoteToUserIds.includes(u.id))}
                              onCheckedChange={(value) => {
                                const next = Boolean(value)
                                setInternalNoteToUserIds(next ? users.map((u) => u.id) : [])
                              }}
                            />
                            <span>Select all users</span>
                          </label>
                          {users.map((member) => {
                            const label = member.full_name || member.username || "-"
                            const checked = internalNoteToUserIds.includes(member.id)
                            return (
                              <label key={member.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(value) => {
                                    const next = Boolean(value)
                                    setInternalNoteToUserIds((prev) =>
                                      next ? [...prev, member.id] : prev.filter((id) => id !== member.id)
                                    )
                                  }}
                                />
                                <span>{label}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setInternalNoteOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          disabled={
                            !internalNoteTitle.trim() ||
                            internalNoteToUserIds.length === 0 ||
                            addingInternalNote
                          }
                          onClick={() => void submitInternalNote()}
                        >
                          {addingInternalNote ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="rounded-md border-2 border-slate-700 max-h-[75vh] overflow-x-auto overflow-y-auto relative bg-white w-full">
              <div className="w-full min-w-[900px]">
                <table className="w-full caption-bottom text-sm min-w-[900px]">
                  <thead className="sticky top-0 z-50 bg-white shadow-md" style={{ position: "sticky", top: 0, zIndex: 50 }}>
                    <tr className="bg-white" style={{ borderBottom: "1px solid rgb(51 65 85)" }}>
                      <th className="w-[40px] border border-slate-600 border-l-2 border-l-slate-800 bg-white text-foreground h-10 px-2 text-left align-middle font-medium" style={{ verticalAlign: "bottom", borderBottom: "1px solid rgb(51 65 85)", whiteSpace: "normal" }}>Nr</th>
                      <th className="w-[300px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: "bottom", borderBottom: "1px solid rgb(51 65 85)" }}>NOTE</th>
                      <th className="w-[360px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: "bottom", borderBottom: "1px solid rgb(51 65 85)" }}>DESCRIPTION</th>
                      <th className="w-[180px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: "bottom", borderBottom: "1px solid rgb(51 65 85)" }}>DEPARTMENT</th>
                      <th className="w-[200px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: "bottom", borderBottom: "1px solid rgb(51 65 85)" }}>PROJECT</th>
                      <th className="w-[140px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: "bottom", borderBottom: "1px solid rgb(51 65 85)" }}>DATE, TIME</th>
                      <th className="w-[80px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: "bottom", borderBottom: "1px solid rgb(51 65 85)" }}>FROM</th>
                      <th className="w-[160px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: "bottom", borderBottom: "1px solid rgb(51 65 85)" }}>TO</th>
                      <th className="w-[80px] border border-slate-600 border-r-2 border-r-slate-800 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: "bottom", borderBottom: "1px solid rgb(51 65 85)" }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedInternalNotes.length ? (
                      groupedInternalNotes.map((group, idx) => {
                        const note = group.note
                        const fromUser = users.find((u) => u.id === note.from_user_id) || null
                        const fromLabel = fromUser?.full_name || fromUser?.username || "Unknown user"
                        const toInitials = group.toUserIds
                          .map((id) => {
                            const toUser = userMap.get(id)
                            const toLabel = toUser?.full_name || toUser?.username || "Unknown user"
                            return initials(toLabel)
                          })
                          .join(", ")
                        const departmentLabel =
                          departments.find((d) => d.id === (note.department_id || note.to_department_id))?.name || "-"
                        const projectLabel =
                          projects.find((p) => p.id === note.project_id)?.title ||
                          projects.find((p) => p.id === note.project_id)?.name ||
                          "-"
                        const canDeleteNote =
                          user?.role === "ADMIN" ||
                          user?.role === "MANAGER" ||
                          (user?.id ? group.toUserIds.includes(user.id) : false)
                        const groupIsDone = group.notes.length > 0 && group.notes.every((n) => n.is_done)
                        const noteIdsForAction = (() => {
                          const isAdminOrManager = user?.role === "ADMIN" || user?.role === "MANAGER"
                          if (isAdminOrManager) return group.notes.map((n) => n.id)
                          return user?.id ? group.notes.filter((n) => n.to_user_id === user.id).map((n) => n.id) : []
                        })()
                        const canUpdateDone = noteIdsForAction.length > 0

                          return (
                            <tr
                              key={note.id}
                              className={`hover:bg-muted/50 border-b transition-colors ${groupIsDone ? "bg-slate-50/70 opacity-70" : ""}`}
                            >
                              <td className="font-bold text-muted-foreground border border-slate-600 border-l-2 border-l-slate-800 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: "bottom" }}>{idx + 1}</td>
                              <td className="whitespace-pre-wrap break-words w-[300px] border border-slate-600 p-2 align-middle" style={{ verticalAlign: "bottom" }}>
                                <div className="flex flex-col gap-1">
                                  <span className={`text-sm font-semibold ${groupIsDone ? "line-through text-slate-500" : ""}`}>{note.title}</span>
                                </div>
                              </td>
                              <td className="whitespace-pre-wrap break-words w-[360px] border border-slate-600 p-2 align-middle" style={{ verticalAlign: "bottom" }}>
                                <span className="text-sm">{note.description || "-"}</span>
                              </td>
                              <td className="border border-slate-600 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: "bottom" }}>{departmentLabel}</td>
                              <td className="border border-slate-600 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: "bottom" }}>{projectLabel}</td>
                              <td className="border border-slate-600 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: "bottom" }}>{formatDate(note.created_at)}</td>
                              <td className="border border-slate-600 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: "bottom" }}>{initials(fromLabel)}</td>
                              <td className="border border-slate-600 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: "bottom" }}>{toInitials}</td>
                              <td className="border border-slate-600 border-r-2 border-r-slate-800 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: "bottom" }}>
                                <div className="flex items-center justify-center gap-2">
                                  {!groupIsDone ? (
                                    canUpdateDone ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                      disabled={noteIdsForAction.some((id) => updatingInternalNoteIds.includes(id))}
                                      onClick={() => void updateInternalNoteDone(noteIdsForAction, true)}
                                    >
                                      <Check className="h-3.5 w-3.5 mr-1" />
                                      Mark as done
                                    </Button>
                                    ) : null
                                  ) : (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-emerald-700">Done</span>
                                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                                      {canUpdateDone ? (
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          className="h-7 w-7 border-slate-200 text-slate-500 hover:border-amber-200 hover:text-amber-600"
                                          title="Undo"
                                          aria-label={`Undo done for ${note.title}`}
                                          disabled={noteIdsForAction.some((id) => updatingInternalNoteIds.includes(id))}
                                          onClick={() => void updateInternalNoteDone(noteIdsForAction, false)}
                                        >
                                          <RotateCcw className="h-3.5 w-3.5" />
                                        </Button>
                                      ) : null}
                                    </div>
                                  )}
                                  {canDeleteNote ? (
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-7 w-7 border-slate-200 text-slate-500 hover:border-red-200 hover:text-red-600"
                                      title="Delete"
                                      aria-label={`Delete ${note.title}`}
                                      onClick={() => void deleteInternalNote(noteIdsForAction)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          )
                      })
                    ) : (
                      <tr>
                        <td colSpan={9} className="border border-slate-600 p-4 text-center text-sm text-muted-foreground">
                          No internal notes yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
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
                {visibleMeetings.length ? (
                  <div className="rounded-md border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[20%] uppercase">Title</TableHead>
                          <TableHead className="w-[12%] uppercase">Platform</TableHead>
                          <TableHead className="w-[18%] uppercase">Date & Time</TableHead>
                          <TableHead className="w-[15%] uppercase">Project</TableHead>
                          <TableHead className="w-[10%] uppercase">Link</TableHead>
                          <TableHead className="w-[10%] uppercase">Repeat</TableHead>
                          <TableHead className="w-[10%] uppercase">Users</TableHead>
                          {!isReadOnly ? <TableHead className="w-[5%] text-right uppercase">Actions</TableHead> : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleMeetings.map((meeting) => {
                          const project = meeting.project_id
                            ? projects.find((p) => p.id === meeting.project_id) || null
                            : null
                          const isEditing = !isReadOnly && editingMeetingId === meeting.id
                          return (
                            <TableRow key={meeting.id}>
                              {isEditing ? (
                                <>
                                  <TableCell colSpan={!isReadOnly ? 8 : 7}>
                                    <div className="space-y-3">
                                      <Input
                                        value={editMeetingTitle}
                                        onChange={(e) => setEditMeetingTitle(e.target.value)}
                                        placeholder="Meeting title"
                                      />
                                      <div className="grid gap-3 md:grid-cols-2">
                                        <Input
                                          value={editMeetingPlatform}
                                          onChange={(e) => setEditMeetingPlatform(e.target.value)}
                                          placeholder="Platform"
                                        />
                                        {editMeetingRecurrenceType === "none" ? (
                                          <Input
                                            type="datetime-local"
                                            value={editMeetingStartsAt}
                                            onChange={(e) => setEditMeetingStartsAt(e.target.value)}
                                          />
                                        ) : (
                                          <Input
                                            type="time"
                                            value={editMeetingStartTime}
                                            onChange={(e) => setEditMeetingStartTime(e.target.value)}
                                            placeholder="Time (HH:MM)"
                                          />
                                        )}
                                      </div>
                                      <Input
                                        type="url"
                                        placeholder="Meeting URL (optional)"
                                        value={editMeetingUrl}
                                        onChange={(e) => setEditMeetingUrl(e.target.value)}
                                      />
                                      <div className="grid gap-3">
                                        <Label>Recurrence</Label>
                                        <Select value={editMeetingRecurrenceType} onValueChange={(v) => setEditMeetingRecurrenceType(v as "none" | "weekly" | "monthly")}>
                                          <SelectTrigger>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="none">One time</SelectItem>
                                            <SelectItem value="weekly">Every week</SelectItem>
                                            <SelectItem value="monthly">Every month</SelectItem>
                                          </SelectContent>
                                        </Select>
                                        {editMeetingRecurrenceType === "weekly" && (
                                          <div className="space-y-2">
                                            <Label>Days of week</Label>
                                            <div className="flex flex-wrap gap-2">
                                              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, idx) => (
                                                <div key={idx} className="flex items-center space-x-2">
                                                  <Checkbox
                                                    checked={editMeetingRecurrenceDaysOfWeek.includes(idx)}
                                                    onCheckedChange={(checked) => {
                                                      if (checked) {
                                                        setEditMeetingRecurrenceDaysOfWeek([...editMeetingRecurrenceDaysOfWeek, idx])
                                                      } else {
                                                        setEditMeetingRecurrenceDaysOfWeek(editMeetingRecurrenceDaysOfWeek.filter(d => d !== idx))
                                                      }
                                                    }}
                                                  />
                                                  <Label className="text-sm">{day}</Label>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {editMeetingRecurrenceType === "monthly" && (
                                          <div className="space-y-2">
                                            <Label>Days of month (1-31)</Label>
                                            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                                              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                                                <div key={day} className="flex items-center space-x-2">
                                                  <Checkbox
                                                    checked={editMeetingRecurrenceDaysOfMonth.includes(day)}
                                                    onCheckedChange={(checked) => {
                                                      if (checked) {
                                                        setEditMeetingRecurrenceDaysOfMonth([...editMeetingRecurrenceDaysOfMonth, day])
                                                      } else {
                                                        setEditMeetingRecurrenceDaysOfMonth(editMeetingRecurrenceDaysOfMonth.filter(d => d !== day))
                                                      }
                                                    }}
                                                  />
                                                  <Label className="text-sm">{day}</Label>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Participants</Label>
                                        <Dialog open={showEditParticipantDialog} onOpenChange={setShowEditParticipantDialog}>
                                          <DialogTrigger asChild>
                                            <Button variant="outline" className="w-full justify-between">
                                              {editMeetingParticipantIds.length > 0 
                                                ? `${editMeetingParticipantIds.length} participant${editMeetingParticipantIds.length > 1 ? 's' : ''} selected`
                                                : "Select participants"}
                                            </Button>
                                          </DialogTrigger>
                                          <DialogContent className="sm:max-w-md">
                                            <DialogHeader>
                                              <DialogTitle>Select Participants</DialogTitle>
                                            </DialogHeader>
                                            <div className="mt-4 max-h-[400px] overflow-y-auto space-y-2">
                                              {users.map((u) => {
                                                const isSelected = editMeetingParticipantIds.includes(u.id)
                                                return (
                                                  <div
                                                    key={u.id}
                                                    className="flex items-center space-x-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                                                    onClick={() => {
                                                      if (isSelected) {
                                                        setEditMeetingParticipantIds((prev) => prev.filter((id) => id !== u.id))
                                                      } else {
                                                        setEditMeetingParticipantIds((prev) => [...prev, u.id])
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
                                          </DialogContent>
                                        </Dialog>
                                      </div>
                                      <div className="grid gap-3 md:grid-cols-2">
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
                                        <div className="flex gap-2">
                                          <Button 
                                            variant="outline" 
                                            onClick={cancelEditMeeting} 
                                            className="flex-1"
                                            type="button"
                                            disabled={savingMeeting}
                                          >
                                            Cancel
                                          </Button>
                                          <Button 
                                            onClick={() => void saveMeeting(meeting.id)} 
                                            className="flex-1"
                                            type="button"
                                            disabled={!editMeetingTitle.trim() || savingMeeting}
                                          >
                                            {savingMeeting ? "Saving..." : "Save"}
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  </TableCell>
                                </>
                              ) : (
                                <>
                                  <TableCell className="font-medium">{meeting.title}</TableCell>
                                  <TableCell>{meeting.platform || "-"}</TableCell>
                                  <TableCell>{formatMeetingDateTime(meeting)}</TableCell>
                                  <TableCell>{project ? project.title || project.name : "-"}</TableCell>
                                  <TableCell>
                                    {meeting.meeting_url ? (
                                      <a
                                        href={meeting.meeting_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline text-sm"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        🔗 Join
                                      </a>
                                    ) : (
                                      <span className="text-slate-400 text-sm">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {meeting.recurrence_type && meeting.recurrence_type !== "none" ? (
                                      <span className="text-slate-600 text-sm">
                                        {meeting.recurrence_type === "weekly" && meeting.recurrence_days_of_week && meeting.recurrence_days_of_week.length > 0
                                          ? `W: ${meeting.recurrence_days_of_week.map(d => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d]).join(", ")}`
                                          : meeting.recurrence_type === "monthly" && meeting.recurrence_days_of_month && meeting.recurrence_days_of_month.length > 0
                                          ? `M: ${meeting.recurrence_days_of_month.join(", ")}`
                                          : meeting.recurrence_type === "weekly" ? "W" : meeting.recurrence_type === "monthly" ? "M" : "-"}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 text-sm">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {meeting.participant_ids && Array.isArray(meeting.participant_ids) && meeting.participant_ids.length > 0 ? (
                                      <div className="text-xs font-semibold text-slate-700">
                                        {meeting.participant_ids
                                          .map(pid => {
                                            const participant = users.find(u => u.id === pid)
                                            if (!participant) return null
                                            const name = participant.full_name || participant.username || "-"
                                            return { pid, name, initials: initials(name) }
                                          })
                                          .filter(Boolean)
                                          .map((item, index, array) => (
                                            <span key={item.pid} title={item.name}>
                                              {item.initials}
                                              {index < array.length - 1 && ", "}
                                            </span>
                                          ))}
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 text-sm">-</span>
                                    )}
                                  </TableCell>
                                  {!isReadOnly ? (
                                    <TableCell className="text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          onClick={() => startEditMeeting(meeting)}
                                          aria-label="Edit meeting"
                                          title="Edit"
                                          className="h-7 w-7"
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          onClick={() => void deleteMeeting(meeting.id)}
                                          aria-label="Delete meeting"
                                          title="Delete"
                                          className="h-7 w-7 text-red-600 border-red-200 hover:bg-red-50"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  ) : null}
                                </>
                              )}
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No external meetings yet.</div>
                )}
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
                            {meetingRecurrenceType === "none" ? (
                              <Input
                                type="datetime-local"
                                value={meetingStartsAt}
                                onChange={(e) => setMeetingStartsAt(e.target.value)}
                              />
                            ) : (
                              <Input
                                type="time"
                                value={meetingStartTime}
                                onChange={(e) => setMeetingStartTime(e.target.value)}
                                placeholder="Time (HH:MM)"
                              />
                            )}
                          </div>
                          <Input
                            type="url"
                            placeholder="Meeting URL (optional)"
                            value={meetingUrl}
                            onChange={(e) => setMeetingUrl(e.target.value)}
                          />
                          <div className="grid gap-3">
                            <Label>Recurrence</Label>
                            <Select value={meetingRecurrenceType} onValueChange={(v) => setMeetingRecurrenceType(v as "none" | "weekly" | "monthly")}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">One time</SelectItem>
                                <SelectItem value="weekly">Every week</SelectItem>
                                <SelectItem value="monthly">Every month</SelectItem>
                              </SelectContent>
                            </Select>
                            {meetingRecurrenceType === "weekly" && (
                              <div className="space-y-2">
                                <Label>Days of week</Label>
                                <div className="flex flex-wrap gap-2">
                                  {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, idx) => (
                                    <div key={idx} className="flex items-center space-x-2">
                                      <Checkbox
                                        checked={meetingRecurrenceDaysOfWeek.includes(idx)}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            setMeetingRecurrenceDaysOfWeek([...meetingRecurrenceDaysOfWeek, idx])
                                          } else {
                                            setMeetingRecurrenceDaysOfWeek(meetingRecurrenceDaysOfWeek.filter(d => d !== idx))
                                          }
                                        }}
                                      />
                                      <Label className="text-sm">{day}</Label>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {meetingRecurrenceType === "monthly" && (
                              <div className="space-y-2">
                                <Label>Days of month (1-31)</Label>
                                <div className="flex flex-wrap gap-2">
                                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                                    <div key={day} className="flex items-center space-x-2">
                                      <Checkbox
                                        checked={meetingRecurrenceDaysOfMonth.includes(day)}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            setMeetingRecurrenceDaysOfMonth([...meetingRecurrenceDaysOfMonth, day])
                                          } else {
                                            setMeetingRecurrenceDaysOfMonth(meetingRecurrenceDaysOfMonth.filter(d => d !== day))
                                          }
                                        }}
                                      />
                                      <Label className="text-sm">{day}</Label>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label>Participants</Label>
                            <Dialog open={showParticipantDialog} onOpenChange={setShowParticipantDialog}>
                              <DialogTrigger asChild>
                                <Button variant="outline" className="w-full justify-between">
                                  {meetingParticipantIds.length > 0 
                                    ? `${meetingParticipantIds.length} participant${meetingParticipantIds.length > 1 ? 's' : ''} selected`
                                    : "Select participants"}
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                  <DialogTitle>Select Participants</DialogTitle>
                                </DialogHeader>
                                <div className="mt-4 max-h-[400px] overflow-y-auto space-y-2">
                                  {users.map((u) => {
                                    const isSelected = meetingParticipantIds.includes(u.id)
                                    return (
                                      <div
                                        key={u.id}
                                        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                                        onClick={() => {
                                          if (isSelected) {
                                            setMeetingParticipantIds((prev) => prev.filter((id) => id !== u.id))
                                          } else {
                                            setMeetingParticipantIds((prev) => [...prev, u.id])
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
                              </DialogContent>
                            </Dialog>
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
                                type="button"
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
                                  setMeetingStartTime("")
                                  setMeetingUrl("")
                                  setMeetingRecurrenceType("none")
                                  setMeetingRecurrenceDaysOfWeek([])
                                  setMeetingRecurrenceDaysOfMonth([])
                                  setMeetingParticipantIds([])
                                  setMeetingProjectId("__none__")
                                }}
                                type="button"
                                disabled={creatingMeeting}
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
                        type="button"
                      >
                        {addingInternalMeetingItem ? "Adding..." : "Add"}
                      </Button>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    {internalMeetingItems
                      .filter((item) => (item.day || internalSlot) === internalSlot)
                      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                      .map((item, idx) => {
                        const isEditing = editingInternalMeetingItemId === item.id
                        const displayTitle = (internalSlot === "M2" || internalSlot === "M3") 
                          ? (item.title || "").toUpperCase() 
                          : (item.title || "")
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
                                  {idx + 1}. {displayTitle}
                                </div>
                              )}
                            </div>
                            {!isReadOnly ? (
                              <div className="flex items-center gap-2">
                                {isEditing ? (
                                  <>
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      onClick={() => void saveInternalMeetingItem()}
                                      type="button"
                                      disabled={!editingInternalMeetingItem.trim() || savingInternalMeetingItem}
                                    >
                                      {savingInternalMeetingItem ? "Saving..." : "Save"}
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="ghost" 
                                      onClick={cancelEditInternalMeetingItem}
                                      type="button"
                                      disabled={savingInternalMeetingItem}
                                    >
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
                            <td className="border border-slate-900 px-2 py-2 align-top uppercase">
                              {row.typeLabel === "PRJK" && row.projectTitle ? (
                                <>
                                  <span className="font-semibold">{row.projectTitle}</span>
                                  <span> : {row.title}</span>
                                </>
                              ) : (
                                row.title
                              )}
                            </td>
                            <td
                              className={`border border-slate-900 px-2 py-2 align-top uppercase ${weeklyPlanStatusBgClass(row.status)}`}
                            >
                              {row.status}
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
            <>
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
                        <td className="border border-slate-900 px-2 py-2 align-top uppercase">
                          {row.typeLabel === "PRJK" && row.projectTitle ? (
                            <>
                              <span className="font-semibold">{row.projectTitle}</span>
                              <span> : {row.title}</span>
                            </>
                          ) : (
                            row.title
                          )}
                        </td>
                        <td
                          className={`border border-slate-900 px-2 py-2 align-top uppercase ${weeklyPlanStatusBgClass(row.status)}`}
                        >
                          {row.status}
                        </td>
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
              <div className="mt-4">
                <table className="w-full border border-slate-900 text-[11px] daily-report-table print:table-fixed">
                  <colgroup>
                    <col className="w-[180px]" />
                    <col />
                  </colgroup>
                  <tbody>
                    <tr>
                      <td className="border border-slate-900 px-2 py-2 text-xs font-semibold uppercase align-top">
                        GA/KUR/SI/KUJT/PRBL
                      </td>
                      <td className="border border-slate-900 px-2 py-2">
                        {gaTableInput || "-"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
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
                      <td className="border border-slate-900 px-2 py-2 align-top uppercase">
                        {row.typeLabel === "PRJK" && row.projectTitle ? (
                          <>
                            <span className="font-semibold">{row.projectTitle}</span>
                            <span> : {row.title}</span>
                          </>
                        ) : (
                          row.title
                        )}
                      </td>
                      <td className="border border-slate-900 px-2 py-2 align-top">{row.description}</td>
                      <td
                        className={`border border-slate-900 px-2 py-2 align-top uppercase ${weeklyPlanStatusBgClass(row.status)}`}
                      >
                        {row.status}
                      </td>
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
