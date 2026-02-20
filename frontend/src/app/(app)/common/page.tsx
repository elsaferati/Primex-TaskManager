"use client"

import * as React from "react"
import { useAuth } from "@/lib/auth"
import { COMMON_VIEW_AGGREGATE_ENABLED } from "@/lib/config"
import { formatDateTimeDMY } from "@/lib/dates"
import type { User, Task, CommonEntry, Project, Meeting, Department, SystemTaskTemplate } from "@/lib/types"

type CommonType =
  | "late"
  | "absent"
  | "leave"
  | "blocked"
  | "oneH"
  | "personal"
  | "external"
  | "internal"
  | "r1"
  | "problem"
  | "feedback"
  | "priority"
  | "bz"

type LateItem = { entryId?: string; person: string; date: string; until: string; start?: string; note?: string }
type AbsentItem = { entryId?: string; person: string; date: string; from: string; to: string; note?: string }
type LeaveItem = {
  entryId?: string
  person: string
  startDate: string
  endDate: string
  fullDay: boolean
  from?: string
  to?: string
  note?: string
  isAllUsers?: boolean
  userId?: string
}
type BlockedItem = { title: string; person: string; date: string; note?: string; assignees?: string[] }
type OneHItem = { title: string; person: string; date: string; note?: string; assignees?: string[] }
type PersonalItem = { title: string; person: string; date: string; note?: string; assignees?: string[] }
type ExternalItem = { title: string; date: string; time: string; platform: string; owner: string; assignees?: string[]; department?: string }
type InternalItem = { title: string; date: string; time: string; platform: string; owner: string; assignees?: string[]; department?: string }
type R1Item = { title: string; date: string; owner: string; note?: string; assignees?: string[] }
type ProblemItem = { entryId?: string; title: string; person: string; date: string; note?: string }
type FeedbackItem = { entryId?: string; title: string; person: string; date: string; note?: string }
type PriorityItem = {
  project: string
  date: string
  assignees: string[]
  department_id?: string | null
  department_name?: string | null
}
type BzItem = {
  title: string
  date: string
  time: string
  assignees?: string[]
  bzWithLabel?: string
}

type CommonBucket =
  | "late"
  | "absent"
  | "leave"
  | "blocked"
  | "oneH"
  | "personal"
  | "external"
  | "internal"
  | "r1"
  | "problems"
  | "feedback"
  | "priority"
  | "bz"
type CommonViewCounts = Record<CommonBucket, number>
type CommonViewGuardrails = {
  max_items_per_bucket: number
  truncated: Record<CommonBucket, boolean>
}
type CommonViewPayload = {
  schema_version: number
  generated_at: string
  week_start: string
  week_end: string
  requested: string[]
  included: string[]
  missing: string[]
  counts: CommonViewCounts
  items: {
    late: LateItem[]
    absent: AbsentItem[]
    leave: LeaveItem[]
    blocked: BlockedItem[]
    oneH: OneHItem[]
    personal: PersonalItem[]
    external: ExternalItem[]
    internal: InternalItem[]
    r1: R1Item[]
    problems: ProblemItem[]
    feedback: FeedbackItem[]
    priority: PriorityItem[]
    bz: BzItem[]
  }
  guardrails: CommonViewGuardrails
  trace_id: string
  timings_ms?: Record<string, number> | null
  users?: User[]
  departments?: Department[]
}

const COMMON_VIEW_CACHE = new Map<
  string,
  { etag: string | null; payload: CommonViewPayload; cachedAt: number }
>()

type SwimlaneCell = {
  title: string
  subtitle?: string
  dateLabel?: string
  accentClass?: string
  assignees?: string[]
  assigneeLabels?: string[]
  placeholder?: boolean
  entryId?: string
  number?: number
  entryDate?: string
}
type SwimlaneRow = {
  id: CommonType
  label: string
  count: number
  headerClass: string
  badgeClass: string
  items: SwimlaneCell[]
}

type MeetingColumnKey = "nr" | "day" | "topic" | "check" | "owner" | "time"
type MeetingColumn = { key: MeetingColumnKey; label: string; width?: string }
type MeetingRow = {
  id: string
  nr: number
  day?: string
  topic: string
  owner?: string
  time?: string
  isChecked?: boolean
}
type MeetingTemplate = {
  id: string
  title: string
  note?: string
  groupKey?: string
  columns: MeetingColumn[]
  rows: MeetingRow[]
  defaultOwner?: string
  defaultTime?: string
}

type MeetingChecklist = {
  id: string
  title: string
  note?: string | null
  default_owner?: string | null
  default_time?: string | null
  group_key?: string | null
  columns?: MeetingColumn[] | null
  position?: number | null
  items?: {
    id: string
    position: number
    title?: string | null
    day?: string | null
    owner?: string | null
    time?: string | null
    is_checked?: boolean | null
  }[]
}


const ALL_USERS_VALUE = "__all__"
const ALL_USERS_LABEL = "All users"
const ALL_USERS_INITIALS = "ALL"
const ALL_USERS_MARKER = "[ALL_USERS]"

const initials = (name: string) => {
  const cleaned = name.trim()
  if (!cleaned) return "?"
  const parts = cleaned.split(/\s+/)
  const first = parts[0]?.[0] || ""
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : ""
  return `${first}${last}`.toUpperCase()
}
const stripInitialsPrefix = (value: string) => {
  return value
}

export default function CommonViewPage() {
  const { apiFetch, user } = useAuth()
  const isAdmin = user?.role === "ADMIN"
  const isManager = user?.role === "MANAGER"
  const isStaff = user?.role === "STAFF"
  const canDeleteCommon = Boolean(isAdmin || isManager || isStaff)
  // Common view should show all data for all roles (same as admin)
  const commonDepartmentId = ""
  const printedAt = React.useMemo(() => new Date(), [])
  const printInitials = initials(user?.full_name || user?.username || "")

  // Utils
  const pad2 = (n: number) => String(n).padStart(2, "0")
  const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  const fromISODate = (s: string) => {
    const [y, m, d] = s.split("-").map(Number)
    return new Date(y, m - 1, d)
  }
  const parseDateOnly = (value?: string | null) => {
    if (!value) return null
    const raw = String(value).trim()
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
    if (match) {
      const year = Number(match[1])
      const month = Number(match[2])
      const day = Number(match[3])
      if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null
      const parsed = new Date(year, month - 1, day)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return null
    // Use local calendar date to avoid UTC date shifts for ISO timestamps.
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  }
  // Convert ISO date (YYYY-MM-DD) to DD/MM/YYYY
  const toDDMMYYYY = (isoDate: string) => {
    if (!isoDate) return ""
    const [y, m, d] = isoDate.split("-").map(Number)
    return `${pad2(d)}/${pad2(m)}/${y}`
  }
  // Convert DD/MM/YYYY to ISO date (YYYY-MM-DD)
  const fromDDMMYYYY = (ddmmyyyy: string) => {
    if (!ddmmyyyy) return ""
    const parts = ddmmyyyy.split("/")
    if (parts.length !== 3) return ""
    const [d, m, y] = parts.map(Number)
    if (isNaN(d) || isNaN(m) || isNaN(y)) return ""
    if (d < 1 || d > 31 || m < 1 || m > 12) return ""
    return `${y}-${pad2(m)}-${pad2(d)}`
  }
  const toDDMMYYYYDot = (isoDate: string) => toDDMMYYYY(isoDate).replaceAll("/", ".")
  const addDays = (d: Date, n: number) => {
    const x = new Date(d)
    x.setDate(x.getDate() + n)
    return x
  }
  const getMonday = (d: Date) => {
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const day = date.getDay()
    const diff = (day === 0 ? -6 : 1) - day
    date.setDate(date.getDate() + diff)
    return date
  }
  const getWeekdays = (monday: Date) => [0, 1, 2, 3, 4].map((i) => addDays(monday, i))
  const formatDateHuman = (s: string) => {
    const d = fromISODate(s)
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`
  }
  const formatTime = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
  const formatAlignmentTime = (value?: string | null) => {
    if (!value) return "TBD"
    const match = String(value).match(/^(\d{2}:\d{2})/)
    return match ? match[1] : String(value)
  }
  const parseTimeValue = (value: string) => {
    const match = /^(\d{2}):(\d{2})$/.exec(value)
    if (!match) return null
    const hours = Number(match[1])
    const minutes = Number(match[2])
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
    return { hours, minutes }
  }
  const parseTimeToMinutes = React.useCallback((value?: string | null) => {
    if (!value) return null
    let normalized = value.trim()
    if (!normalized) return null
    normalized = normalized.replace(/[()]/g, "").trim()
    const lower = normalized.toLowerCase()
    if (lower === "tbd" || lower === "n/a" || lower === "na") return null
    if (normalized.includes("–") || normalized.includes("—") || normalized.includes("-")) {
      const separator = normalized.includes("–") ? "–" : normalized.includes("—") ? "—" : "-"
      normalized = normalized.split(separator)[0].trim()
    }
    const amPmMatch = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(normalized)
    if (amPmMatch) {
      let hours = Number(amPmMatch[1])
      const minutes = Number(amPmMatch[2] ?? "0")
      if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
      if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null
      const isPm = amPmMatch[3].toLowerCase() === "pm"
      hours = hours % 12
      if (isPm) hours += 12
      return hours * 60 + minutes
    }
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(normalized)
    if (!timeMatch) return null
    const hours = Number(timeMatch[1])
    const minutes = Number(timeMatch[2])
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
    return hours * 60 + minutes
  }, [])
  const toMeetingTimeValue = (value?: string | null) => {
    if (!value) return ""
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""
    const pad2 = (n: number) => String(n).padStart(2, "0")
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  }
  const formatTimeLabel = (value?: string) => {
    if (!value) return ""
    const normalized = value.trim()
    if (!normalized || normalized.toLowerCase() === "tbd") return normalized
    if (/am|pm/i.test(normalized)) return normalized
    if (normalized.includes("-")) {
      const [startRaw, endRaw] = normalized.split("-").map((part) => part.trim())
      const startLabel = formatTimeLabel(startRaw)
      const endLabel = formatTimeLabel(endRaw)
      if (startLabel && endLabel) return `${startLabel} - ${endLabel}`
      return normalized
    }
    const parsed = parseTimeValue(normalized)
    if (!parsed) return normalized
    const temp = new Date()
    temp.setHours(parsed.hours, parsed.minutes, 0, 0)
    return formatTime(temp)
  }
  const computeNextOccurrenceDate = (params: {
    recurrenceType: "weekly" | "monthly" | "yearly"
    daysOfWeek: number[]
    daysOfMonth: number[]
    timeValue: string
    monthOfYear?: number
  }) => {
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

    if (params.recurrenceType === "yearly") {
      const day = params.daysOfMonth[0]
      const month = params.monthOfYear ?? 0
      if (!day || month < 0 || month > 11) return null
      const makeCandidate = (year: number) => {
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        if (day < 1 || day > daysInMonth) return null
        return new Date(year, month, day, hours, minutes, 0, 0)
      }
      const current = makeCandidate(now.getFullYear())
      if (current && current.getTime() >= now.getTime()) return current
      return makeCandidate(now.getFullYear() + 1)
    }

    return null
  }
  const computeNextMeetingOccurrence = (meeting: Meeting) => {
    const recurrenceType = meeting.recurrence_type
    if (!recurrenceType || recurrenceType === "none") return null
    const timeValue = toMeetingTimeValue(meeting.starts_at)
    if (!timeValue) return null
    return computeNextOccurrenceDate({
      recurrenceType: recurrenceType as "weekly" | "monthly" | "yearly",
      daysOfWeek: meeting.recurrence_days_of_week || [],
      daysOfMonth: meeting.recurrence_days_of_month || [],
      timeValue,
      monthOfYear: meeting.starts_at ? new Date(meeting.starts_at).getMonth() : undefined,
    })
  }
  const resolveExternalMeetingDate = (meeting: Meeting) => {
    const next = computeNextMeetingOccurrence(meeting)
    if (next) return next
    if (!meeting.starts_at) return null
    const date = new Date(meeting.starts_at)
    if (Number.isNaN(date.getTime())) return null
    return date
  }
  const formatExternalMeetingWhen = (meeting: Meeting) => {
    const resolvedDate = resolveExternalMeetingDate(meeting)
    const source = resolvedDate ? resolvedDate.toISOString() : meeting.created_at
    if (!source) return "Date TBD"
    const date = resolvedDate ?? new Date(source)
    if (Number.isNaN(date.getTime())) return "Date TBD"
    const dateLabel = formatDateHuman(toISODate(date))
    const timeLabel = resolvedDate ? formatTime(date) : meeting.starts_at ? formatTime(date) : "TBD"
    return `${dateLabel} ${timeLabel}`
  }
  const alWeekdayShort = (d: Date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    return days[d.getDay()]
  }
  const getDayCode = (d: Date) => {
    const codes = ["H", "M", "MR", "E", "P", "S", "D"] // H=Monday, M=Tuesday, MR=Wednesday, E=Thursday, P=Friday
    return codes[d.getDay() === 0 ? 6 : d.getDay() - 1] || ""
  }

  // State
  const [users, setUsers] = React.useState<User[]>([])
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [commonData, setCommonData] = React.useState({
    late: [] as LateItem[],
    absent: [] as AbsentItem[],
    leave: [] as LeaveItem[],
    blocked: [] as BlockedItem[],
    oneH: [] as OneHItem[],
    personal: [] as PersonalItem[],
    external: [] as ExternalItem[],
    internal: [] as InternalItem[],
    r1: [] as R1Item[],
    problems: [] as ProblemItem[],
    feedback: [] as FeedbackItem[],
    priority: [] as PriorityItem[],
    bz: [] as BzItem[],
  })
  const [dataLoaded, setDataLoaded] = React.useState(false)
  const [commonViewMeta, setCommonViewMeta] = React.useState<{
    requested: string[]
    included: string[]
    missing: string[]
    guardrails: CommonViewGuardrails | null
  } | null>(null)

  const [weekStart, setWeekStart] = React.useState<Date>(() => getMonday(new Date()))
  const [selectedDates, setSelectedDates] = React.useState<Set<string>>(new Set())
  const [multiMode, setMultiMode] = React.useState(false)
  const [typeFilters, setTypeFilters] = React.useState<Set<CommonType>>(new Set())
  const [typeMultiMode, setTypeMultiMode] = React.useState(false)
  const [printTotalPages, setPrintTotalPages] = React.useState<number>(1)

  // Modal state
  const [modalOpen, setModalOpen] = React.useState(false)
  const [formType, setFormType] = React.useState<"late" | "absent" | "leave" | "problem" | "feedback">("late")
  const [formPerson, setFormPerson] = React.useState("")
  const [formDate, setFormDate] = React.useState(toISODate(new Date()))
  const [formDateDisplay, setFormDateDisplay] = React.useState(toDDMMYYYY(toISODate(new Date())))
  const [formDelayStart, setFormDelayStart] = React.useState("08:00")
  const [formUntil, setFormUntil] = React.useState("09:00")
  const [formFrom, setFormFrom] = React.useState("08:00")
  const [formTo, setFormTo] = React.useState("12:00")
  const [formEndDate, setFormEndDate] = React.useState("")
  const [formEndDateDisplay, setFormEndDateDisplay] = React.useState("")
  const [formFullDay, setFormFullDay] = React.useState(false)
  const [formTitle, setFormTitle] = React.useState("")
  const [formNote, setFormNote] = React.useState("")
  const [formError, setFormError] = React.useState("")
  const [meetingPanelOpen, setMeetingPanelOpen] = React.useState(false)
  const [meetingTemplates, setMeetingTemplates] = React.useState<MeetingTemplate[]>([])
  const [activeMeetingId, setActiveMeetingId] = React.useState("")
  const [externalMeetingsOpen, setExternalMeetingsOpen] = React.useState(false)
  const [externalMeetings, setExternalMeetings] = React.useState<Meeting[]>([])
  const [externalMeetingTitle, setExternalMeetingTitle] = React.useState("")
  const [externalMeetingPlatform, setExternalMeetingPlatform] = React.useState("")
  const [externalMeetingStartsAt, setExternalMeetingStartsAt] = React.useState("")
  const [externalMeetingStartTime, setExternalMeetingStartTime] = React.useState("")
  const [externalMeetingRecurrenceType, setExternalMeetingRecurrenceType] = React.useState<"none" | "weekly" | "monthly" | "yearly">("none")
  const [externalMeetingRecurrenceDaysOfWeek, setExternalMeetingRecurrenceDaysOfWeek] = React.useState<number[]>([])
  const [externalMeetingRecurrenceDaysOfMonth, setExternalMeetingRecurrenceDaysOfMonth] = React.useState<number[]>([])
  const [externalMeetingRecurrenceMonth, setExternalMeetingRecurrenceMonth] = React.useState("1")
  const [externalMeetingRecurrenceDay, setExternalMeetingRecurrenceDay] = React.useState("1")
  const [externalMeetingDepartmentId, setExternalMeetingDepartmentId] = React.useState("")
  const [internalMeetingsOpen, setInternalMeetingsOpen] = React.useState(false)
  const [internalMeetings, setInternalMeetings] = React.useState<Meeting[]>([])
  const [internalMeetingTitle, setInternalMeetingTitle] = React.useState("")
  const [internalMeetingPlatform, setInternalMeetingPlatform] = React.useState("")
  const [internalMeetingStartsAt, setInternalMeetingStartsAt] = React.useState("")
  const [internalMeetingStartTime, setInternalMeetingStartTime] = React.useState("")
  const [internalMeetingRecurrenceType, setInternalMeetingRecurrenceType] = React.useState<"none" | "weekly" | "monthly" | "yearly">("none")
  const [internalMeetingRecurrenceDaysOfWeek, setInternalMeetingRecurrenceDaysOfWeek] = React.useState<number[]>([])
  const [internalMeetingRecurrenceDaysOfMonth, setInternalMeetingRecurrenceDaysOfMonth] = React.useState<number[]>([])
  const [internalMeetingRecurrenceMonth, setInternalMeetingRecurrenceMonth] = React.useState("1")
  const [internalMeetingRecurrenceDay, setInternalMeetingRecurrenceDay] = React.useState("1")
  const [internalMeetingDepartmentId, setInternalMeetingDepartmentId] = React.useState("")
  const commonViewAggregateEnabled = COMMON_VIEW_AGGREGATE_ENABLED
  const commonViewIncludeStages = React.useMemo(
    () => [
      ["users", "departments", "entries"],
      ["meetings", "system_tasks", "tasks"],
    ],
    []
  )
  const includeToBuckets: Record<string, CommonBucket[]> = React.useMemo(
    () => ({
      entries: ["late", "absent", "leave", "problems", "feedback"],
      meetings: ["external", "internal"],
      system_tasks: ["bz"],
      tasks: ["blocked", "oneH", "personal", "r1", "priority"],
    }),
    []
  )
  const [showWeekendDays, setShowWeekendDays] = React.useState(false)
  const [creatingExternalMeeting, setCreatingExternalMeeting] = React.useState(false)
  const [editingExternalMeetingId, setEditingExternalMeetingId] = React.useState<string | null>(null)
  const [editingExternalMeetingTitle, setEditingExternalMeetingTitle] = React.useState("")
  const [editingExternalMeetingPlatform, setEditingExternalMeetingPlatform] = React.useState("")
  const [editingExternalMeetingStartsAt, setEditingExternalMeetingStartsAt] = React.useState("")
  const [editingExternalMeetingStartTime, setEditingExternalMeetingStartTime] = React.useState("")
  const [editingExternalMeetingRecurrenceType, setEditingExternalMeetingRecurrenceType] = React.useState<"none" | "weekly" | "monthly" | "yearly">("none")
  const [editingExternalMeetingRecurrenceDaysOfWeek, setEditingExternalMeetingRecurrenceDaysOfWeek] = React.useState<number[]>([])
  const [editingExternalMeetingRecurrenceDaysOfMonth, setEditingExternalMeetingRecurrenceDaysOfMonth] = React.useState<number[]>([])
  const [editingExternalMeetingRecurrenceMonth, setEditingExternalMeetingRecurrenceMonth] = React.useState("1")
  const [editingExternalMeetingRecurrenceDay, setEditingExternalMeetingRecurrenceDay] = React.useState("1")
  const [editingExternalMeetingDepartmentId, setEditingExternalMeetingDepartmentId] = React.useState("")
  const [showEditWeekendDays, setShowEditWeekendDays] = React.useState(false)
  const [updatingExternalMeeting, setUpdatingExternalMeeting] = React.useState(false)
  const [deletingExternalMeetingId, setDeletingExternalMeetingId] = React.useState<string | null>(null)
  const [showInternalWeekendDays, setShowInternalWeekendDays] = React.useState(false)
  const [creatingInternalMeeting, setCreatingInternalMeeting] = React.useState(false)
  const [editingInternalMeetingId, setEditingInternalMeetingId] = React.useState<string | null>(null)
  const [editingInternalMeetingTitle, setEditingInternalMeetingTitle] = React.useState("")
  const [editingInternalMeetingPlatform, setEditingInternalMeetingPlatform] = React.useState("")
  const [editingInternalMeetingStartsAt, setEditingInternalMeetingStartsAt] = React.useState("")
  const [editingInternalMeetingStartTime, setEditingInternalMeetingStartTime] = React.useState("")
  const [editingInternalMeetingRecurrenceType, setEditingInternalMeetingRecurrenceType] = React.useState<"none" | "weekly" | "monthly" | "yearly">("none")
  const [editingInternalMeetingRecurrenceDaysOfWeek, setEditingInternalMeetingRecurrenceDaysOfWeek] = React.useState<number[]>([])
  const [editingInternalMeetingRecurrenceDaysOfMonth, setEditingInternalMeetingRecurrenceDaysOfMonth] = React.useState<number[]>([])
  const [editingInternalMeetingRecurrenceMonth, setEditingInternalMeetingRecurrenceMonth] = React.useState("1")
  const [editingInternalMeetingRecurrenceDay, setEditingInternalMeetingRecurrenceDay] = React.useState("1")
  const [editingInternalMeetingDepartmentId, setEditingInternalMeetingDepartmentId] = React.useState("")
  const [showInternalEditWeekendDays, setShowInternalEditWeekendDays] = React.useState(false)
  const [updatingInternalMeeting, setUpdatingInternalMeeting] = React.useState(false)
  const [deletingInternalMeetingId, setDeletingInternalMeetingId] = React.useState<string | null>(null)
  const [externalMeetingChecklist, setExternalMeetingChecklist] = React.useState<MeetingChecklist | null>(null)
  const [externalMeetingChecklistItems, setExternalMeetingChecklistItems] = React.useState<
    Map<string, boolean>
  >(new Map())
  const [externalMeetingChecklistOpen, setExternalMeetingChecklistOpen] = React.useState(false)
  const [externalMeetingChecklistLoading, setExternalMeetingChecklistLoading] = React.useState(false)
  const [externalChecklistEditingId, setExternalChecklistEditingId] = React.useState<string | null>(null)
  const [externalChecklistEditTitle, setExternalChecklistEditTitle] = React.useState("")
  const [externalChecklistEditPrefix, setExternalChecklistEditPrefix] = React.useState<string>("")
  const [externalChecklistSavingId, setExternalChecklistSavingId] = React.useState<string | null>(null)
  const [externalChecklistDeletingId, setExternalChecklistDeletingId] = React.useState<string | null>(null)
  const [externalChecklistAddTitle, setExternalChecklistAddTitle] = React.useState("")
  const [externalChecklistAddOrder, setExternalChecklistAddOrder] = React.useState("")
  const [externalChecklistAdding, setExternalChecklistAdding] = React.useState(false)
  const [externalChecklistImageError, setExternalChecklistImageError] = React.useState(false)
  const [editingRowId, setEditingRowId] = React.useState<string | null>(null)
  const [editDraft, setEditDraft] = React.useState({
    day: "",
    topic: "",
    owner: "",
    time: "",
  })
  const [addDraft, setAddDraft] = React.useState({
    nr: "",
    day: "",
    topic: "",
    owner: "",
    time: "",
  })
  const [isSavingEntry, setIsSavingEntry] = React.useState(false)
  const [editingMeetingTitle, setEditingMeetingTitle] = React.useState(false)
  const [meetingTitleDraft, setMeetingTitleDraft] = React.useState("")
  const [savingMeetingTitle, setSavingMeetingTitle] = React.useState(false)
  const [exportingExcel, setExportingExcel] = React.useState(false)

  // Derived
  const weekISOs = React.useMemo(() => getWeekdays(weekStart).map(toISODate), [weekStart])
  const allDaysSelected = React.useMemo(() => {
    if (selectedDates.size !== weekISOs.length) return false
    return weekISOs.every((iso) => selectedDates.has(iso))
  }, [selectedDates, weekISOs])
  const activeMeeting = React.useMemo(
    () => meetingTemplates.find((template) => template.id === activeMeetingId) || null,
    [activeMeetingId, meetingTemplates]
  )
  const boardMeetingIds = React.useMemo(
    () => meetingTemplates.filter((m) => m.groupKey === "board").map((m) => m.id),
    [meetingTemplates]
  )
  const staffMeetingIds = React.useMemo(
    () => meetingTemplates.filter((m) => m.groupKey === "staff").map((m) => m.id),
    [meetingTemplates]
  )
  const mergeOwnerColumn = React.useMemo(() => {
    if (!activeMeeting) return false
    const hasOwner = Boolean(activeMeeting.defaultOwner) || activeMeeting.rows.some((row) => row.owner)
    if (!hasOwner) return false
    return activeMeeting.rows.every((row, idx) => !row.owner || idx === 0)
  }, [activeMeeting])

  const startEditMeetingTitle = React.useCallback(() => {
    if (!activeMeeting) return
    setMeetingTitleDraft(activeMeeting.title || "")
    setEditingMeetingTitle(true)
  }, [activeMeeting])

  const cancelEditMeetingTitle = React.useCallback(() => {
    setEditingMeetingTitle(false)
    setMeetingTitleDraft("")
  }, [])

  const saveMeetingTitle = React.useCallback(async () => {
    if (!activeMeeting || !meetingTitleDraft.trim()) return
    setSavingMeetingTitle(true)
    try {
      const res = await apiFetch(`/checklists/${activeMeeting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: meetingTitleDraft.trim() }),
      })
      if (!res.ok) {
        let detail = "Failed to update meeting title"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // If response is not JSON, try to get status text
          if (res.status === 404) {
            detail = "Meeting template not found. Please refresh the page."
          } else if (res.status === 403) {
            detail = "Only admins can update meeting templates."
          } else {
            detail = `Failed to update meeting title (${res.status})`
          }
        }
        alert(detail)
        return
      }
      const updated = (await res.json()) as { id: string; title: string; [key: string]: unknown }
      setMeetingTemplates((prev) =>
        prev.map((meeting) => (meeting.id === activeMeeting.id ? { ...meeting, title: updated.title } : meeting))
      )
      setEditingMeetingTitle(false)
      setMeetingTitleDraft("")
    } catch (err) {
      console.error("Error updating meeting title:", err)
      alert("Failed to update meeting title. Please try again.")
    } finally {
      setSavingMeetingTitle(false)
    }
  }, [activeMeeting, meetingTitleDraft, apiFetch])

  const canSelectExternalDepartment = user?.role !== "STAFF"
  const externalMeetingDepartment = React.useMemo(
    () => departments.find((d) => d.id === externalMeetingDepartmentId) || null,
    [departments, externalMeetingDepartmentId]
  )
  const internalMeetingDepartment = React.useMemo(
    () => departments.find((d) => d.id === internalMeetingDepartmentId) || null,
    [departments, internalMeetingDepartmentId]
  )
  const externalMeetingsSorted = React.useMemo(() => {
    return [...externalMeetings].sort((a, b) => {
      const aResolved = resolveExternalMeetingDate(a)
      const bResolved = resolveExternalMeetingDate(b)
      const aFallback = a.starts_at || a.created_at
      const bFallback = b.starts_at || b.created_at
      const aDate = aResolved ?? (aFallback ? new Date(aFallback) : null)
      const bDate = bResolved ?? (bFallback ? new Date(bFallback) : null)
      const aValid = aDate && !Number.isNaN(aDate.getTime())
      const bValid = bDate && !Number.isNaN(bDate.getTime())
      if (!aValid && !bValid) return a.title.localeCompare(b.title)
      if (!aValid) return 1
      if (!bValid) return -1
      const diff = aDate!.getTime() - bDate!.getTime()
      if (diff !== 0) return diff
      return a.title.localeCompare(b.title)
    })
  }, [externalMeetings])
  const internalMeetingsSorted = React.useMemo(() => {
    return [...internalMeetings].sort((a, b) => {
      const aResolved = resolveExternalMeetingDate(a)
      const bResolved = resolveExternalMeetingDate(b)
      const aFallback = a.starts_at || a.created_at
      const bFallback = b.starts_at || b.created_at
      const aDate = aResolved ?? (aFallback ? new Date(aFallback) : null)
      const bDate = bResolved ?? (bFallback ? new Date(bFallback) : null)
      const aValid = aDate && !Number.isNaN(aDate.getTime())
      const bValid = bDate && !Number.isNaN(bDate.getTime())
      if (!aValid && !bValid) return a.title.localeCompare(b.title)
      if (!aValid) return 1
      if (!bValid) return -1
      const diff = aDate!.getTime() - bDate!.getTime()
      if (diff !== 0) return diff
      return a.title.localeCompare(b.title)
    })
  }, [internalMeetings])
  const userById = React.useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  
  const reloadExternalChecklist = React.useCallback(async () => {
    setExternalMeetingChecklistLoading(true)
    try {
      const res = await apiFetch("/checklists?group_key=external&include_items=true")
      if (!res?.ok) return
      const data = (await res.json()) as MeetingChecklist[]
      const checklist = data.length > 0 ? data[0] : null
      setExternalMeetingChecklist(checklist)
      const itemsMap = new Map<string, boolean>()
      if (checklist?.items) {
        for (const item of checklist.items) {
          itemsMap.set(item.id, item.is_checked ?? false)
        }
      }
      setExternalMeetingChecklistItems(itemsMap)
    } catch (err) {
      console.error("Failed to load external meeting checklist", err)
    } finally {
      setExternalMeetingChecklistLoading(false)
    }
  }, [apiFetch])

  // Load external meeting checklist when panel opens
  React.useEffect(() => {
    if (!externalMeetingsOpen) return
    void reloadExternalChecklist()
  }, [externalMeetingsOpen, reloadExternalChecklist])

  const startEditExternalChecklistItem = React.useCallback(
    (itemId: string, currentTitle: string) => {
      const match = (currentTitle || "").match(/^(\d+(?:\.\d+)*)\.\s*(.*)$/)
      const prefix = match?.[1] || ""
      const titleOnly = (match?.[2] ?? currentTitle ?? "").trim()
      setExternalChecklistEditingId(itemId)
      setExternalChecklistEditPrefix(prefix)
      setExternalChecklistEditTitle(titleOnly)
    },
    []
  )

  const cancelEditExternalChecklistItem = React.useCallback(() => {
    setExternalChecklistEditingId(null)
    setExternalChecklistEditTitle("")
    setExternalChecklistEditPrefix("")
  }, [])

  const saveExternalChecklistItemTitle = React.useCallback(
    async (itemId: string) => {
      if (!isAdmin) return
      const nextTitle = externalChecklistEditTitle.trim()
      if (!nextTitle) return
      setExternalChecklistSavingId(itemId)
      try {
        const patchedTitle = externalChecklistEditPrefix ? `${externalChecklistEditPrefix}. ${nextTitle}` : nextTitle
        const res = await apiFetch(`/checklist-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: patchedTitle }),
        })
        if (!res?.ok) return
        await reloadExternalChecklist()
        setExternalChecklistEditingId(null)
        setExternalChecklistEditTitle("")
        setExternalChecklistEditPrefix("")
      } finally {
        setExternalChecklistSavingId(null)
      }
    },
    [apiFetch, externalChecklistEditPrefix, externalChecklistEditTitle, isAdmin, reloadExternalChecklist]
  )

  const deleteExternalChecklistItem = React.useCallback(
    async (itemId: string) => {
      if (!isAdmin) return
      const confirmed = window.confirm("Delete this checklist item?")
      if (!confirmed) return
      setExternalChecklistDeletingId(itemId)
      try {
        const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
        if (!res?.ok) return
        await reloadExternalChecklist()
      } finally {
        setExternalChecklistDeletingId(null)
      }
    },
    [apiFetch, isAdmin, reloadExternalChecklist]
  )

  const addExternalChecklistItem = React.useCallback(async () => {
    if (!isAdmin) return
    const checklistId = externalMeetingChecklist?.id
    const title = externalChecklistAddTitle.trim()
    if (!checklistId || !title) return
    setExternalChecklistAdding(true)
    try {
      const orderNum = Number(externalChecklistAddOrder)
      const hasOrder = externalChecklistAddOrder.trim() !== "" && Number.isFinite(orderNum) && orderNum > 0
      let position: number | undefined
      if (hasOrder && externalMeetingChecklist?.items?.length) {
        // Translate "Order #" (1-based, main items only) into DB integer position (which includes subpoints).
        const sorted = externalMeetingChecklist.items
          .slice()
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        const isSubpoint = (t: string) => /^\d+\.\d+/.test((t || "").trim())
        const mainItems = sorted.filter((it) => !isSubpoint(it.title || ""))
        const insertIdx = Math.floor(orderNum) - 1
        if (insertIdx <= 0) {
          position = (mainItems[0]?.position ?? 0)
        } else if (insertIdx >= mainItems.length) {
          const maxPos = sorted.reduce((m, it) => Math.max(m, it.position ?? 0), 0)
          position = maxPos + 1
        } else {
          position = (mainItems[insertIdx]?.position ?? 0)
        }
      }
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklist_id: checklistId,
          item_type: "CHECKBOX",
          position,
          title,
          is_checked: false,
        }),
      })
      if (!res?.ok) return
      setExternalChecklistAddTitle("")
      setExternalChecklistAddOrder("")
      await reloadExternalChecklist()
    } finally {
      setExternalChecklistAdding(false)
    }
  }, [
    apiFetch,
    externalChecklistAddOrder,
    externalChecklistAddTitle,
    externalMeetingChecklist?.id,
    externalMeetingChecklist?.items,
    isAdmin,
    reloadExternalChecklist,
  ])

  // Reset checklist when panel closes
  React.useEffect(() => {
    if (!externalMeetingsOpen) {
      setExternalMeetingChecklist(null)
      setExternalMeetingChecklistItems(new Map())
      setExternalMeetingChecklistOpen(false)
      setExternalMeetingChecklistLoading(false)
    }
  }, [externalMeetingsOpen])

  const canCreateExternalMeeting = Boolean(externalMeetingTitle.trim()) && Boolean(externalMeetingDepartmentId)
  const canCreateInternalMeeting = Boolean(internalMeetingTitle.trim()) && Boolean(internalMeetingDepartmentId)

  React.useEffect(() => {
    let mounted = true
    async function loadMeetings() {
      try {
        // Common view should only show the official meeting templates:
        // - group_key=board (BORD/GA)
        // - group_key=staff (STAFF/GA)
        const [boardRes, staffRes] = await Promise.all([
          apiFetch("/checklists?group_key=board&include_items=true"),
          apiFetch("/checklists?group_key=staff&include_items=true"),
        ])
        if (!boardRes?.ok && !staffRes?.ok) return
        let boardData = boardRes?.ok ? ((await boardRes.json()) as MeetingChecklist[]) : []
        let staffData = staffRes?.ok ? ((await staffRes.json()) as MeetingChecklist[]) : []
        let data = [...boardData, ...staffData]

        const checklistIds = data.map((checklist) => checklist.id)
        if (checklistIds.length) {
          await Promise.allSettled(
            checklistIds.map((checklistId) =>
              apiFetch("/internal-meeting-sessions/ensure", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ checklist_id: checklistId }),
              })
            )
          )

          const [boardResRefresh, staffResRefresh] = await Promise.all([
            apiFetch("/checklists?group_key=board&include_items=true"),
            apiFetch("/checklists?group_key=staff&include_items=true"),
          ])
          if (boardResRefresh?.ok || staffResRefresh?.ok) {
            boardData = boardResRefresh?.ok
              ? ((await boardResRefresh.json()) as MeetingChecklist[])
              : boardData
            staffData = staffResRefresh?.ok
              ? ((await staffResRefresh.json()) as MeetingChecklist[])
              : staffData
            data = [...boardData, ...staffData]
          }
        }

        const templates = data
          .slice()
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((checklist) => {
            const rows = (checklist.items || [])
              .slice()
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
              .map((item) => ({
                id: item.id,
                nr: item.position ?? 0,
                day: item.day || undefined,
                topic: item.title || "",
                owner: item.owner || undefined,
                time: item.time || undefined,
                isChecked: item.is_checked ?? false,
              }))
            return {
              id: checklist.id,
              title: checklist.title,
              note: checklist.note || undefined,
              groupKey: checklist.group_key || undefined,
              columns: checklist.columns?.length
                ? checklist.columns
                : [
                    { key: "nr", label: "NR", width: "52px" },
                    { key: "topic", label: "M1 PIKAT" },
                    { key: "check", label: "", width: "48px" },
                    { key: "owner", label: "WHO", width: "90px" },
                    { key: "time", label: "WHEN", width: "90px" },
                  ],
              rows,
              defaultOwner: checklist.default_owner || undefined,
              defaultTime: checklist.default_time || undefined,
            }
          })
        if (mounted) {
          setMeetingTemplates(templates)
        }
      } catch (err) {
        console.error("Failed to load meeting checklists", err)
      }
    }
    void loadMeetings()
    return () => {
      mounted = false
    }
  }, [apiFetch])

  React.useEffect(() => {
    if (!meetingTemplates.length) return
    if (!activeMeetingId || !meetingTemplates.some((meeting) => meeting.id === activeMeetingId)) {
      setActiveMeetingId(meetingTemplates[0].id)
    }
  }, [activeMeetingId, meetingTemplates])

  React.useEffect(() => {
    setEditingRowId(null)
    setEditDraft({ day: "", topic: "", owner: "", time: "" })
    setAddDraft({ nr: "", day: "", topic: "", owner: "", time: "" })
  }, [activeMeetingId])

  React.useEffect(() => {
    if (externalMeetingDepartmentId) return
    if (user?.department_id) {
      setExternalMeetingDepartmentId(user.department_id)
      return
    }
    if (departments.length) {
      setExternalMeetingDepartmentId(departments[0].id)
    }
  }, [departments, externalMeetingDepartmentId, user?.department_id])
  React.useEffect(() => {
    if (internalMeetingDepartmentId) return
    if (user?.department_id) {
      setInternalMeetingDepartmentId(user.department_id)
      return
    }
    if (departments.length) {
      setInternalMeetingDepartmentId(departments[0].id)
    }
  }, [departments, internalMeetingDepartmentId, user?.department_id])

  const applyCommonViewPayload = React.useCallback(
    (payload: CommonViewPayload) => {
      if (payload.users) setUsers(payload.users)
      if (payload.departments) setDepartments(payload.departments)
      setCommonViewMeta({
        requested: payload.requested,
        included: payload.included,
        missing: payload.missing,
        guardrails: payload.guardrails || null,
      })
      setCommonData((prev) => {
        let next = { ...prev }
        for (const includeKey of payload.included) {
          const buckets = includeToBuckets[includeKey] || []
          for (const bucket of buckets) {
            next = { ...next, [bucket]: payload.items[bucket] }
          }
        }
        return next
      })
    },
    [includeToBuckets]
  )

  const fetchCommonViewStage = React.useCallback(
    async (weekStartIso: string, includeList: string[]) => {
      const includeKey = includeList.join(",")
      const cacheKey = `${weekStartIso}|${includeKey}|${user?.role || "anon"}|${user?.department_id || ""}`
      const cached = COMMON_VIEW_CACHE.get(cacheKey)
      if (cached) {
        applyCommonViewPayload(cached.payload)
      }
      const headers: Record<string, string> = {}
      if (cached?.etag) headers["If-None-Match"] = cached.etag
      const deptParam = commonDepartmentId
        ? `&department_id=${encodeURIComponent(commonDepartmentId)}`
        : "&include_all_departments=true"
      const res = await apiFetch(
        `/common-view?week_start=${encodeURIComponent(weekStartIso)}&include=${encodeURIComponent(includeKey)}${deptParam}`,
        { headers }
      )
      if (res?.status === 304 && cached) {
        applyCommonViewPayload(cached.payload)
        return
      }
      if (!res?.ok) {
        throw new Error(`common_view_failed_${res?.status}`)
      }
      const payload = (await res.json()) as CommonViewPayload
      const etag = res.headers.get("ETag")
      COMMON_VIEW_CACHE.set(cacheKey, { etag, payload, cachedAt: Date.now() })
      applyCommonViewPayload(payload)
    },
    [apiFetch, applyCommonViewPayload, user?.department_id, user?.role, commonDepartmentId]
  )

  // Load data on mount
  React.useEffect(() => {
    let mounted = true
    async function load() {
      try {
        if (mounted) setDataLoaded(false)
        if (commonViewAggregateEnabled) {
          const weekStartIso = toISODate(weekStart)
          try {
            if (mounted) {
              setCommonViewMeta(null)
              setCommonData({
                late: [],
                absent: [],
                leave: [],
                blocked: [],
                oneH: [],
                personal: [],
                external: [],
                internal: [],
                r1: [],
                problems: [],
                feedback: [],
                priority: [],
                bz: [],
              })
            }
            for (const includeList of commonViewIncludeStages) {
              await fetchCommonViewStage(weekStartIso, includeList)
            }
            if (mounted) {
              if (selectedDates.size === 0) {
                setSelectedDates(new Set([toISODate(new Date())]))
              }
              setDataLoaded(true)
            }
            return
          } catch (err) {
            console.error("Failed to load aggregate common view data", err)
          }
        }
        const weekStartIso = toISODate(weekStart)
        const weekEndIso = toISODate(addDays(weekStart, 6))
        const weekDates = getWeekdays(weekStart).map(toISODate)
        // Initialize all data buckets
        const allData = {
          late: [] as LateItem[],
          absent: [] as AbsentItem[],
          leave: [] as LeaveItem[],
          blocked: [] as BlockedItem[],
          oneH: [] as OneHItem[],
          personal: [] as PersonalItem[],
          external: [] as ExternalItem[],
          internal: [] as InternalItem[],
          r1: [] as R1Item[],
          problems: [] as ProblemItem[],
          feedback: [] as FeedbackItem[],
          priority: [] as PriorityItem[],
          bz: [] as BzItem[],
        }

        // Load primary datasets in parallel (week scoped)
        // Use lookup endpoint so STAFF can load all users
        const usersEndpoint = "/users/lookup?include_inactive=false"
        const commonEntriesEndpoint = `/common-entries?from=${encodeURIComponent(weekStartIso)}&to=${encodeURIComponent(weekEndIso)}`
        let tasksEndpoint = commonDepartmentId
          ? `/tasks?include_done=true&department_id=${encodeURIComponent(commonDepartmentId)}`
          : "/tasks?include_done=true&include_all_departments=true"
        const tasksEndpointWithWindow = `${tasksEndpoint}&window_from=${encodeURIComponent(weekStartIso)}&window_to=${encodeURIComponent(weekEndIso)}`
        const meetingsEndpointBase = commonDepartmentId
          ? `/meetings?department_id=${encodeURIComponent(commonDepartmentId)}`
          : "/meetings?include_all_departments=true"

        const systemTasksRequests = weekDates.map((dateStr) => {
          const qs = new URLSearchParams()
          qs.set("occurrence_date", dateStr)
          if (commonDepartmentId) qs.set("department_id", commonDepartmentId)
          return apiFetch(`/system-tasks?${qs.toString()}`)
        })

        const [
          uRes,
          depRes,
          ceRes,
          initialTasksRes,
          externalMeetingsRes,
          internalMeetingsRes,
          ...systemTasksResponses
        ] = await Promise.all([
          apiFetch(usersEndpoint),
          apiFetch("/departments"),
          apiFetch(commonEntriesEndpoint),
          apiFetch(tasksEndpointWithWindow),
          apiFetch(`${meetingsEndpointBase}&meeting_type=external`),
          apiFetch(`${meetingsEndpointBase}&meeting_type=internal`),
          ...systemTasksRequests,
        ])

        let loadedUsers: User[] = []
        if (uRes?.ok) {
          const lookup = (await uRes.json()) as {
            id: string
            username?: string | null
            full_name?: string | null
            role: string
            department_id?: string | null
            is_active: boolean
          }[]
          loadedUsers = lookup.map((u) => ({
            id: u.id,
            email: u.username || u.full_name || "",
            username: u.username,
            full_name: u.full_name,
            role: u.role as any,
            department_id: u.department_id,
            is_active: u.is_active,
          }))
          if (mounted) setUsers(loadedUsers)
        }
        let loadedDepartments: Department[] = []
        if (depRes?.ok) {
          loadedDepartments = (await depRes.json()) as Department[]
          if (mounted) setDepartments(loadedDepartments)
        }
        const normalizeDepartmentName = (name: string) => {
          const trimmed = name.trim()
          const lower = trimmed.toLowerCase()
          if (lower.includes("project content manager")) return "Product Content"
          return trimmed
        }
        const departmentNameById = new Map<string, string>(
          loadedDepartments
            .map((d) => (d.id && d.name ? [d.id, normalizeDepartmentName(d.name)] as [string, string] : null))
            .filter((entry): entry is [string, string] => entry !== null)
        )
        
        // Find Product Content Manager department ID
        let productContentDeptId: string | null = null
        if (loadedDepartments.length > 0) {
          const pcmDept = loadedDepartments.find(
            (d) => d.name?.toLowerCase().includes("project content") || 
                   d.name?.toLowerCase().includes("content manager") ||
                   d.code === "PCM"
          )
          productContentDeptId = pcmDept?.id || null
        }

        // Load common entries
        if (ceRes?.ok) {
          const entries = (await ceRes.json()) as CommonEntry[]

          for (const e of entries) {
            // Prioritize assigned user, fallback to creator, then title
            let user = loadedUsers.find((u) => u.id === e.assigned_to_user_id)
            if (!user) {
              user = loadedUsers.find((u) => u.id === e.created_by_user_id)
            }
            if (commonDepartmentId && user?.department_id && user.department_id !== commonDepartmentId) {
              continue
            }
            const personName = user?.full_name || user?.username || e.title || "Unknown"
            
            // Use entry_date if available, otherwise parse from description or fallback to created_at
            let date = e.entry_date || null
            if (!date) {
              // Try to parse date from description
              const descDateMatch = (e.description || "").match(/Date:\s*(\d{4}-\d{2}-\d{2})/i)
              if (descDateMatch) {
                date = descDateMatch[1]
              } else {
                date = toISODate(new Date(e.created_at))
              }
            }

            if (e.category === "Delays") {
              // Parse until time from description
              let until = "09:00"
              let start = "08:00"
              let note = e.description || ""
              const startMatch = note.match(/Start:\s*(\d{1,2}:\d{2})/i)
              if (startMatch) {
                start = startMatch[1]
                note = note.replace(/Start:\s*\d{1,2}:\d{2}/i, "").trim()
              }
              const untilMatch = note.match(/Until:\s*(\d{1,2}:\d{2})/i)
              if (untilMatch) {
                until = untilMatch[1]
                note = note.replace(/Until:\s*\d{1,2}:\d{2}/i, "").trim()
              }
              // Remove date from note if present
              note = note.replace(/Date:\s*\d{4}-\d{2}-\d{2}/i, "").trim()
              
              allData.late.push({
                entryId: e.id,
                person: personName,
                date,
                until,
                start,
                note: note || undefined,
              })
            } else if (e.category === "Absences") {
              // Parse from/to times from description
              let from = "08:00"
              let to = "23:00"
              let note = e.description || ""
              const fromToMatch = note.match(/From:\s*(\d{1,2}:\d{2})\s*-\s*To:\s*(\d{1,2}:\d{2})/i)
              if (fromToMatch) {
                from = fromToMatch[1]
                to = fromToMatch[2]
                note = note.replace(/From:\s*\d{1,2}:\d{2}\s*-\s*To:\s*\d{1,2}:\d{2}/i, "").trim()
              }
              // Remove date from note if present
              note = note.replace(/Date:\s*\d{4}-\d{2}-\d{2}/i, "").trim()
              
              allData.absent.push({
                entryId: e.id,
                person: personName,
                date,
                from,
                to,
                note: note || undefined,
              })
            } else if (e.category === "Annual Leave") {
              // Parse leave information from description
              let startDate = date
              let endDate = date
              let fullDay = true
              let from = ""
              let to = ""
              let note = e.description || ""
              const isAllUsers = note.includes(ALL_USERS_MARKER)
              if (isAllUsers) {
                note = note.replace(ALL_USERS_MARKER, "").trim()
              }
              const dateMatches = note.match(/\d{4}-\d{2}-\d{2}/g) || []
              
              // Parse date range
              const dateRangeMatch = note.match(/Date range:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i)
              if (dateRangeMatch) {
                startDate = dateRangeMatch[1]
                endDate = dateRangeMatch[2]
                note = note.replace(/Date range:\s*\d{4}-\d{2}-\d{2}\s+to\s+\d{4}-\d{2}-\d{2}/i, "").trim()
              } else {
                const dateMatch = note.match(/Date:\s*(\d{4}-\d{2}-\d{2})/i)
                if (dateMatch) {
                  startDate = dateMatch[1]
                  endDate = dateMatch[1]
                  note = note.replace(/Date:\s*\d{4}-\d{2}-\d{2}/i, "").trim()
                } else if (dateMatches.length) {
                  const firstDate = dateMatches[0] ?? date
                  const secondDate = dateMatches[1] ?? firstDate
                  startDate = firstDate
                  endDate = secondDate
                }
              }
              
              // Parse full day or time range
              if (note.includes("Full day")) {
                fullDay = true
                note = note.replace(/\(Full day\)/i, "").trim()
              } else {
                const timeMatch = note.match(/\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\)/i)
                if (timeMatch) {
                  fullDay = false
                  from = timeMatch[1]
                  to = timeMatch[2]
                  note = note.replace(/\(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\)/i, "").trim()
                }
              }
              
              allData.leave.push({
                entryId: e.id,
                person: personName,
                startDate,
                endDate,
                fullDay,
                from: from || undefined,
                to: to || undefined,
                note: note || undefined,
                isAllUsers,
                userId: e.assigned_to_user_id || e.created_by_user_id,
              })
            } else if (e.category === "Blocks") {
              allData.blocked.push({
                title: e.title,
                person: personName,
                date,
                note: e.description || undefined,
              })
            } else if (e.category === "External Tasks") {
              allData.external.push({
                title: e.title,
                date,
                time: "14:00",
                platform: "Zoom",
                owner: personName,
              })
            } else if (e.category === "Problems") {
              allData.problems.push({
                entryId: e.id,
                title: e.title,
                person: personName,
                date,
                note: e.description || undefined,
              })
            } else if (e.category === "Complaints" || e.category === "Requests" || e.category === "Proposals") {
              allData.feedback.push({
                entryId: e.id,
                title: e.title,
                person: personName,
                date,
                note: e.description || undefined,
              })
            }
          }
        }

        let projectNameById = new Map<string, string>()
        const projectInfoById = new Map<string, Project>()

        // Load tasks for blocked, 1H, R1, external, and priority
        // For priority items (PRJK), we want everyone to see the same projects,
        // so try to fetch all tasks first, fallback to user's tasks if 403
        let tasksRes = initialTasksRes
        if (!tasksRes?.ok && tasksRes?.status === 403 && !commonDepartmentId) {
          tasksRes = await apiFetch(`/tasks?include_done=true&window_from=${encodeURIComponent(weekStartIso)}&window_to=${encodeURIComponent(weekEndIso)}`)
        }

        if (tasksRes?.ok) {
          const tasks = (await tasksRes.json()) as Task[]

          const chunk = <T,>(items: T[], size: number): T[][] => {
            if (size <= 0) return [items]
            const out: T[][] = []
            for (let i = 0; i < items.length; i += size) {
              out.push(items.slice(i, i + size))
            }
            return out
          }
          const fetchProjectLookup = async (ids: string[]) => {
            const uniqueIds = Array.from(new Set(ids.filter(Boolean)))
            const out = new Map<string, Project>()
            for (const batch of chunk(uniqueIds, 50)) {
              const qs = new URLSearchParams()
              for (const id of batch) qs.append("ids", id)
              const res = await apiFetch(`/projects/lookup?${qs.toString()}`)
              if (!res.ok) continue
              const data = (await res.json()) as Array<Project>
              for (const item of data) {
                if (item?.id) out.set(item.id, item)
              }
            }
            return out
          }

          const projectIds = Array.from(
            new Set(tasks.map((t) => t.project_id).filter((id): id is string => Boolean(id)))
          )
          if (projectIds.length) {
            const lookupMap = await fetchProjectLookup(projectIds)
            for (const project of lookupMap.values()) {
              const baseTitle = (project.title || project.name || "").trim()
              if (!baseTitle) continue
              const projectName =
                project.project_type === "MST" && project.total_products != null && project.total_products > 0
                  ? `${baseTitle} - ${project.total_products}`
                  : baseTitle
              projectNameById.set(project.id, projectName)
              projectInfoById.set(project.id, project)
            }
          }
          
          const today = toISODate(new Date())
          // Group priority items by project_id, tracking assignees per date
          // Participants must be resolved per day only.
          const priorityMap = new Map<string, { 
            project: string; 
            assigneesByDate: Map<string, Set<string>>; // Track assignees per date
            dates: Set<string>;
          }>()

          // Second pass: process active tasks for date-specific data and other categories
          for (const t of tasks) {
            // Only show tasks that are in progress (not completed)
            // Skip tasks that are done (have completed_at set or status is "Done")
            if (t.completed_at) {
              continue
            }
            // Also skip if status is explicitly "Done"
            if (t.status && (t.status.toLowerCase() === "done" || t.status.toLowerCase() === "completed")) {
              continue
            }

            const assigneeId = t.assigned_to || t.assignees?.[0]?.id || t.assigned_to_user_id || null
            const assignee = t.assignees?.[0] || (assigneeId ? loadedUsers.find((u) => u.id === assigneeId) : null)
            const ownerName = assignee?.full_name || assignee?.username || null
            const assigneeNames = t.assignees?.length
              ? t.assignees.map((a) => a.full_name || a.username || a.email || "Unknown")
              : ownerName
              ? [ownerName]
              : []
            const assigneeLabel = assigneeNames.length ? assigneeNames.join(", ") : "Unknown"
            
            const phaseValue = (t.phase || "").toUpperCase()
            const isCheckPhase = phaseValue === "CHECK" || phaseValue === "CONTROL"

            // Helper function to generate dates from start_date to due_date
            // Check/Control phase tasks should be treated as single-day assignments.
            const getTaskDates = (task: Task, singleDayOnly: boolean): string[] => {
              if (singleDayOnly) {
                const dateOnly = parseDateOnly(task.planned_for || task.due_date || task.start_date)
                const resolved = dateOnly ?? (task.created_at ? new Date(task.created_at) : null)
                return resolved ? [toISODate(resolved)] : [today]
              }
              const startDate = parseDateOnly(task.start_date)
              const dueDate = parseDateOnly(task.due_date)
              
              // If both start and due dates exist and are different, generate range
              if (startDate && dueDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(dueDate.getTime())) {
                const start = new Date(startDate)
                start.setHours(0, 0, 0, 0)
                const end = new Date(dueDate)
                end.setHours(0, 0, 0, 0)
                
                // If start is after end, swap them
                if (start > end) {
                  const temp = start
                  start.setTime(end.getTime())
                  end.setTime(temp.getTime())
                }
                
                const dates: string[] = []
                const current = new Date(start)
                while (current <= end) {
                  const dayOfWeek = current.getDay()
                  // Only include weekdays (Monday=1 to Friday=5)
                  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                    dates.push(toISODate(current))
                  }
                  current.setDate(current.getDate() + 1)
                }
                return dates.length > 0 ? dates : [toISODate(start)]
              }
              
              // Fallback to single date
              const dateOnly = parseDateOnly(task.planned_for || task.due_date || task.start_date)
              const resolved = dateOnly ?? (task.created_at ? new Date(task.created_at) : null)
              return resolved ? [toISODate(resolved)] : [today]
            }
            
            const taskDates = getTaskDates(t, isCheckPhase).filter(
              (dateStr) => dateStr >= weekStartIso && dateStr <= weekEndIso
            )
            if (!taskDates.length) {
              continue
            }

            // Create entries for each date in the range
            for (const taskDate of taskDates) {
              if (t.is_bllok) {
                allData.blocked.push({
                  title: t.title,
                  person: assigneeLabel,
                  assignees: assigneeNames,
                  date: taskDate,
                  note: t.description || undefined,
                })
              }
              if (t.is_1h_report) {
                allData.oneH.push({
                  title: t.title,
                  person: assigneeLabel,
                  assignees: assigneeNames,
                  date: taskDate,
                  note: t.description || undefined,
                })
              }
              if (t.is_personal) {
                allData.personal.push({
                  title: t.title,
                  person: assigneeLabel,
                  assignees: assigneeNames,
                  date: taskDate,
                  note: t.description || undefined,
                })
              }
              if (t.is_r1) {
                allData.r1.push({
                  title: t.title,
                  date: taskDate,
                  owner: assigneeLabel,
                  assignees: assigneeNames,
                  note: t.description || undefined,
                })
              }
            }
            if (t.task_type === "adhoc" && t.project_id) {
              // External tasks use the first date from the range
              const externalDate = taskDates[0] || today
              allData.external.push({
                title: t.title,
                date: externalDate,
                time: "14:00",
                platform: "Zoom",
                owner: assigneeLabel,
                assignees: assigneeNames,
              })
            }

            // Priority items - track dates and date-specific assignees for active tasks
            if (t.project_id) {
              const projectName = projectNameById.get(t.project_id)
              // Skip if project name is not found (project might be deleted or inaccessible)
              if (!projectName) {
                continue
              }
              
              // Use project_id as the key (not project_id-date)
              const projectKey = t.project_id
              
              // Initialize entry if it doesn't exist
              if (!priorityMap.has(projectKey)) {
                priorityMap.set(projectKey, {
                  project: projectName,
                  assigneesByDate: new Map<string, Set<string>>(),
                  dates: new Set<string>(),
                })
              }
              
              const entry = priorityMap.get(projectKey)!
              
              // Add all task dates to the project's dates
              for (const taskDate of taskDates) {
                entry.dates.add(taskDate)
                
                // Track assignees for this specific date
                if (!entry.assigneesByDate.has(taskDate)) {
                  entry.assigneesByDate.set(taskDate, new Set<string>())
                }
                const dateAssignees = entry.assigneesByDate.get(taskDate)!
                
                // Add assignees to this date only
                for (const name of assigneeNames) {
                  dateAssignees.add(name)
                }
              }
            }
          }
          // Expand priority items: create one entry per project-date combination
          // For MST and VS/VL projects in Product Content, show only dates within the selected week
          const expandedPriority: PriorityItem[] = []
          const isInWeek = (dateStr: string) => dateStr >= weekStartIso && dateStr <= weekEndIso
          for (const [projectKey, entry] of priorityMap.entries()) {
            const project = projectInfoById.get(projectKey)
            if (!project) continue // Skip if project info not available
            
            // Check if this is MST or VS/VL project in Product Content Manager
            const isMstByType = project.project_type === "MST"
            const titleUpper = (project.title || "").toUpperCase()
            const isMstByTitle = titleUpper.includes("MST")
            const isMst = isMstByType || isMstByTitle
            const isVsVl = titleUpper.includes("VS") || titleUpper.includes("VL")
            const isProductContent = project.department_id === productContentDeptId
            
            let datesToUse: string[] = []
            
            if ((isMst || isVsVl) && isProductContent) {
              if (project.due_date) {
                // For MST/VS/VL in Product Content with due_date, generate dates within the selected week
                const weekStartDate = fromISODate(weekStartIso)
                const weekEndDate = fromISODate(weekEndIso)
                const dueDate = parseDateOnly(project.due_date)
                if (!dueDate) {
                  continue
                }
                dueDate.setHours(0, 0, 0, 0)
                const startDate = new Date(weekStartDate)
                const endDate = new Date(weekEndDate)

                if (dueDate >= startDate) {
                  if (dueDate < endDate) {
                    endDate.setTime(dueDate.getTime())
                  }
                  const currentDate = new Date(startDate)
                  while (currentDate <= endDate) {
                    const dayOfWeek = currentDate.getDay()
                    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                      datesToUse.push(toISODate(currentDate))
                    }
                    currentDate.setDate(currentDate.getDate() + 1)
                  }
                }
              } else if (entry.dates.size > 0) {
                // MST/VS/VL without due_date but with tasks - use task dates
                datesToUse = Array.from(entry.dates).sort()
              } else {
                // MST/VS/VL without due_date and no tasks - show on today
                datesToUse = [weekStartIso]
              }
            } else {
              // For other projects, use dates from tasks
              // Only show projects that have actual task dates
              if (entry.dates.size > 0) {
                datesToUse = Array.from(entry.dates).sort()
              } else {
                // Skip projects with no tasks/dates - don't show them
                continue
              }
            }

            // Always include actual task dates to ensure assignees show on their real days.
            if (entry.dates.size > 0) {
              const merged = new Set(datesToUse)
              for (const d of entry.dates) merged.add(d)
              datesToUse = Array.from(merged).sort()
            }
            datesToUse = datesToUse.filter(isInWeek)
            if (!datesToUse.length) {
              continue
            }
            // Create one priority entry per date for this project
            // Participants are derived strictly from tasks on that specific date.
            for (const date of datesToUse) {
              // Get assignees who have tasks specifically on this date
              const dateAssignees = entry.assigneesByDate.get(date) || new Set<string>()
              const departmentId = project.department_id ?? null
              const departmentName = departmentId ? departmentNameById.get(departmentId) || "Other" : "Other"

              expandedPriority.push({
                project: entry.project,
                date: date,
                assignees: Array.from(dateAssignees),
                department_id: departmentId,
                department_name: departmentName,
              })
            }
          }
          
          allData.priority = expandedPriority
        }

        if (externalMeetingsRes?.ok) {
          const meetings = (await externalMeetingsRes.json()) as Meeting[]
          if (mounted) setExternalMeetings(meetings)
          for (const meeting of meetings) {
            const resolvedDate = resolveExternalMeetingDate(meeting)
            const createdAt = new Date(meeting.created_at)
            const validCreatedAt = Number.isNaN(createdAt.getTime()) ? null : createdAt
            const dateSource = resolvedDate ?? validCreatedAt
            if (!dateSource) continue

            const ownerUser = meeting.created_by
              ? loadedUsers.find((u) => u.id === meeting.created_by)
              : null
            const ownerName = ownerUser?.full_name || ownerUser?.username || "Unknown"

            allData.external.push({
              title: meeting.title || "External meeting",
              date: toISODate(dateSource),
              time: resolvedDate ? formatTime(resolvedDate) : "TBD",
              platform: meeting.platform?.trim() || "TBD",
              owner: ownerName,
            })
          }
        }

        if (internalMeetingsRes?.ok) {
          const meetings = (await internalMeetingsRes.json()) as Meeting[]
          if (mounted) setInternalMeetings(meetings)
          for (const meeting of meetings) {
            const resolvedDate = resolveExternalMeetingDate(meeting)
            const createdAt = new Date(meeting.created_at)
            const validCreatedAt = Number.isNaN(createdAt.getTime()) ? null : createdAt
            const dateSource = resolvedDate ?? validCreatedAt
            if (!dateSource) continue

            const ownerUser = meeting.created_by
              ? loadedUsers.find((u) => u.id === meeting.created_by)
              : null
            const ownerName = ownerUser?.full_name || ownerUser?.username || "Unknown"

            allData.internal.push({
              title: meeting.title || "Internal meeting",
              date: toISODate(dateSource),
              time: resolvedDate ? formatTime(resolvedDate) : "TBD",
              platform: meeting.platform?.trim() || "TBD",
              owner: ownerName,
            })
          }
        }

        const userMap = new Map(loadedUsers.map((u) => [u.id, u]))
        const ganeUserId =
          loadedUsers.find((u) => u.username?.toLowerCase() === "gane.arifaj")?.id || null
        const bzItems: BzItem[] = []
        for (let i = 0; i < systemTasksResponses.length; i += 1) {
          const res = systemTasksResponses[i]
          const dateStr = weekDates[i]
          if (!res?.ok || !dateStr) continue
          const templates = (await res.json()) as SystemTaskTemplate[]
          for (const tmpl of templates) {
            if (tmpl.occurrence_date && tmpl.occurrence_date !== dateStr) continue
            const alignmentEnabled = Boolean(
              tmpl.requires_alignment ||
              tmpl.alignment_time ||
              (tmpl.alignment_user_ids && tmpl.alignment_user_ids.length) ||
              (tmpl.alignment_roles && tmpl.alignment_roles.length)
            )
            if (!alignmentEnabled) continue
            const alignmentUserIds = tmpl.alignment_user_ids ?? []
            if (!ganeUserId || !alignmentUserIds.includes(ganeUserId)) continue
            const bzWithNames = alignmentUserIds
              .map((id) => {
                const person = userMap.get(id)
                return person?.full_name || person?.username || ""
              })
              .filter(Boolean)
            const bzWithInitials = bzWithNames.map(initials).filter(Boolean)
            const bzWithLabel =
              bzWithInitials.length > 0
                ? bzWithInitials.join(", ")
                : tmpl.alignment_roles?.length
                  ? tmpl.alignment_roles.join(", ")
                  : ""
            const taskAssignees =
              tmpl.assignees?.map((a) => a.full_name || a.username || a.email || "Unknown").filter(Boolean) || []
            bzItems.push({
              title: tmpl.title || "-",
              date: dateStr,
              time: formatAlignmentTime(tmpl.alignment_time),
              assignees: taskAssignees,
              bzWithLabel,
            })
          }
        }
        allData.bz = bzItems

        // Single state update with all data
        if (mounted) {
          setCommonData(allData)
        }

        // Select today by default
        if (mounted && selectedDates.size === 0) {
          setSelectedDates(new Set([toISODate(new Date())]))
        }
        
        // Mark data as loaded
        if (mounted) {
          setDataLoaded(true)
        }
      } catch (err) {
        console.error("Failed to load common view data", err)
      }
    }
    void load()
    return () => {
      mounted = false
    }
  }, [apiFetch, user?.role, user?.department_id, weekStart, commonViewAggregateEnabled, commonViewIncludeStages, fetchCommonViewStage])

  React.useEffect(() => {
    if (!externalMeetingsOpen) return
    const run = async () => {
      const meetingsBase = commonDepartmentId
        ? `/meetings?department_id=${encodeURIComponent(commonDepartmentId)}`
        : "/meetings?include_all_departments=true"
      const meetingsRes = await apiFetch(`${meetingsBase}&meeting_type=external`)
      if (meetingsRes?.ok) {
        const meetings = (await meetingsRes.json()) as Meeting[]
        setExternalMeetings(meetings)
      }
    }
    void run()
  }, [externalMeetingsOpen, apiFetch, commonDepartmentId])

  React.useEffect(() => {
    if (!internalMeetingsOpen) return
    const run = async () => {
      const meetingsBase = commonDepartmentId
        ? `/meetings?department_id=${encodeURIComponent(commonDepartmentId)}`
        : "/meetings?include_all_departments=true"
      const meetingsRes = await apiFetch(`${meetingsBase}&meeting_type=internal`)
      if (meetingsRes?.ok) {
        const meetings = (await meetingsRes.json()) as Meeting[]
        setInternalMeetings(meetings)
      }
    }
    void run()
  }, [internalMeetingsOpen, apiFetch, commonDepartmentId])

  // Filter helpers
  const inSelectedDates = (dateStr: string) => !selectedDates.size || selectedDates.has(dateStr)
  const leaveCovers = (leave: LeaveItem, dateStr: string) => {
    return dateStr >= leave.startDate && dateStr <= leave.endDate
  }
  const isDateFullyCovered = (dateStr: string) => {
    const activeUserIds = users.filter((u) => u.is_active).map((u) => u.id)
    if (!activeUserIds.length) return false
    const coveredUsers = new Set(
      commonData.leave
        .filter((x) => x.userId && leaveCovers(x, dateStr))
        .map((x) => x.userId as string)
    )
    return coveredUsers.size >= activeUserIds.length
  }

  // Filtered data
  const filtered = React.useMemo(() => {
    const datesToUse = selectedDates.size ? Array.from(selectedDates) : weekISOs
    const activeUserIds = users.filter((u) => u.is_active).map((u) => u.id)
    const fullyCoveredDates = new Set<string>()
    if (activeUserIds.length) {
      for (const dateStr of datesToUse) {
        const coveredUsers = new Set(
          commonData.leave
            .filter((x) => x.userId && leaveCovers(x, dateStr))
            .map((x) => x.userId as string)
        )
        if (coveredUsers.size >= activeUserIds.length) {
          fullyCoveredDates.add(dateStr)
        }
      }
    }

    const late = commonData.late.filter((x) => inSelectedDates(x.date) && !fullyCoveredDates.has(x.date))
    const absent = commonData.absent.filter((x) => inSelectedDates(x.date) && !fullyCoveredDates.has(x.date))
    const leave = commonData.leave.filter((x) => {
      const visibleDates = datesToUse.filter((d) => d >= x.startDate && d <= x.endDate)
      if (!visibleDates.length) return false
      return visibleDates.some((d) => !fullyCoveredDates.has(d))
    })
    const blocked = commonData.blocked.filter((x) => inSelectedDates(x.date) && !fullyCoveredDates.has(x.date))
    const oneH = commonData.oneH.filter((x) => inSelectedDates(x.date) && !fullyCoveredDates.has(x.date))
    const personal = commonData.personal.filter((x) => inSelectedDates(x.date) && !fullyCoveredDates.has(x.date))
    const external = commonData.external.filter((x) => inSelectedDates(x.date) && !fullyCoveredDates.has(x.date))
    const internal = commonData.internal.filter((x) => inSelectedDates(x.date) && !fullyCoveredDates.has(x.date))
    const r1 = commonData.r1.filter((x) => inSelectedDates(x.date) && !fullyCoveredDates.has(x.date))
    const problems = commonData.problems.filter((x) => inSelectedDates(x.date) && !fullyCoveredDates.has(x.date))
    const feedback = commonData.feedback.filter((x) => inSelectedDates(x.date) && !fullyCoveredDates.has(x.date))
    const bz = commonData.bz.filter((x) => inSelectedDates(x.date) && !fullyCoveredDates.has(x.date))
    const priority = commonData.priority.filter((p) =>
      selectedDates.size ? Array.from(selectedDates).includes(p.date) : true
    )

    const filteredPriority = priority.filter((p) => !fullyCoveredDates.has(p.date))

    return {
      late,
      absent,
      leave,
      blocked,
      oneH,
      personal,
      external,
      internal,
      r1,
      problems,
      feedback,
      bz,
      priority: filteredPriority,
      fullyCoveredDates,
    }
  }, [commonData, selectedDates, users, weekISOs])

  // Common people for priority (from users)
  const commonPeople = React.useMemo(() => {
    return users
      .filter((u) => u.role !== "STAFF" || u.department_id)
      .slice(0, 4)
      .map((u) => u.full_name || u.username || "Unknown")
  }, [users])

  const isMultiDate = selectedDates.size > 1

  const sortByDate = React.useCallback(
    <T,>(
      items: T[],
      getDateKey: (item: T) => string,
      getTitle: (item: T) => string
    ) => {
      return [...items].sort((a, b) => {
        const aDate = getDateKey(a)
        const bDate = getDateKey(b)
        if (aDate !== bDate) return aDate.localeCompare(bDate)
        return getTitle(a).localeCompare(getTitle(b))
      })
    },
    []
  )
  const sortByTime = React.useCallback(
    <T,>(
      items: T[],
      getTimeKey: (item: T) => string | null | undefined,
      getTitle: (item: T) => string
    ) => {
      return [...items].sort((a, b) => {
        const aMinutes = parseTimeToMinutes(getTimeKey(a))
        const bMinutes = parseTimeToMinutes(getTimeKey(b))
        if (aMinutes === null && bMinutes === null) return getTitle(a).localeCompare(getTitle(b))
        if (aMinutes === null) return 1
        if (bMinutes === null) return -1
        if (aMinutes !== bMinutes) return aMinutes - bMinutes
        return getTitle(a).localeCompare(getTitle(b))
      })
    },
    [parseTimeToMinutes]
  )
  const sortByDateTime = React.useCallback(
    <T,>(
      items: T[],
      getDateKey: (item: T) => string,
      getTimeKey: (item: T) => string | null | undefined,
      getTitle: (item: T) => string
    ) => {
      return [...items].sort((a, b) => {
        const aDate = getDateKey(a)
        const bDate = getDateKey(b)
        if (aDate !== bDate) return aDate.localeCompare(bDate)
        const aMinutes = parseTimeToMinutes(getTimeKey(a))
        const bMinutes = parseTimeToMinutes(getTimeKey(b))
        if (aMinutes === null && bMinutes === null) return getTitle(a).localeCompare(getTitle(b))
        if (aMinutes === null) return 1
        if (bMinutes === null) return -1
        if (aMinutes !== bMinutes) return aMinutes - bMinutes
        return getTitle(a).localeCompare(getTitle(b))
      })
    },
    [parseTimeToMinutes]
  )

  // Handlers
  const toggleDay = (iso: string) => {
    setSelectedDates((prev) => {
      const s = new Set(prev)
      if (!multiMode) {
        s.clear()
      }
      if (s.has(iso)) {
        if (s.size === 1) return s
        s.delete(iso)
      } else {
        s.add(iso)
      }
      return s
    })
  }

  const setTypeFilter = (type: CommonType | "all") => {
    if (type === "all") {
      setTypeFilters(new Set())
    } else if (!typeMultiMode) {
      setTypeFilters(new Set([type]))
    } else {
      setTypeFilters((prev) => {
        const s = new Set(prev)
        if (s.has(type)) {
          s.delete(type)
        } else {
          s.add(type)
        }
        return s
      })
    }
  }

  const selectAll = () => {
    if (!multiMode) {
      setMultiMode(true)
    }
    setSelectedDates(new Set(weekISOs))
  }

  const selectToday = () => {
    const today = new Date()
    setWeekStart(getMonday(today))
    setSelectedDates(new Set([toISODate(today)]))
  }

  const handlePrint = () => {
    window.print()
  }

  // Calculate total pages for print footer
  React.useEffect(() => {
    const handleBeforePrint = () => {
      const dpi = 96
      const pageHeightPx = 11 * dpi - (0.36 + 0.51) * dpi
      const bodyHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight
      )
      const totalPages = Math.max(1, Math.ceil(bodyHeight / pageHeightPx))
      setPrintTotalPages(totalPages)
    }
    const handleAfterPrint = () => {
      setPrintTotalPages(1)
    }
    window.addEventListener("beforeprint", handleBeforePrint)
    window.addEventListener("afterprint", handleAfterPrint)
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint)
      window.removeEventListener("afterprint", handleAfterPrint)
    }
  }, [])

  const handleExportExcel = async () => {
    if (exportingExcel) return
    setExportingExcel(true)
    try {
      const weekStartIso = toISODate(weekStart)
      const res = await apiFetch(`/exports/common.xlsx?week_start=${encodeURIComponent(weekStartIso)}`)
      if (!res?.ok) {
        const detail = await res.text()
        alert(detail || "Failed to export Excel.")
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      const dd = String(weekStart.getDate()).padStart(2, "0")
      const mm = String(weekStart.getMonth() + 1).padStart(2, "0")
      const yy = String(weekStart.getFullYear()).slice(-2)
      const initialsValue = (printInitials || "USER").toUpperCase()
      link.download = `COMMON VIEW ${dd}_${mm}_${yy}_EF (${initialsValue}).xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Failed to export common view Excel", err)
      alert("Failed to export Excel.")
    } finally {
      setExportingExcel(false)
    }
  }

  const setWeek = (dateStr: string) => {
    const base = dateStr ? fromISODate(dateStr) : new Date()
    const monday = getMonday(base)
    setWeekStart(monday)
    const weekISO = getWeekdays(monday).map(toISODate)
    setSelectedDates((prev) => {
      const filtered = Array.from(prev).filter((d) => weekISO.includes(d))
      return filtered.length ? new Set(filtered) : new Set([weekISO[0]])
    })
  }

  const openModal = () => {
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    // Reset form
    setFormType("late")
    setFormPerson("")
    setFormDate(toISODate(new Date()))
    setFormDateDisplay(toDDMMYYYY(toISODate(new Date())))
    setFormDelayStart("08:00")
    setFormUntil("09:00")
    setFormFrom("08:00")
    setFormTo("12:00")
    setFormEndDate("")
    setFormEndDateDisplay("")
    setFormFullDay(false)
    setFormTitle("")
    setFormNote("")
    setFormError("")
  }

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSavingEntry) return
    setIsSavingEntry(true)

    try {
      setFormError("")
      if ((formType === "late" || formType === "absent") && formDate && isDateFullyCovered(formDate)) {
        setFormError("All users are on leave for this date, so VONS/MUNG entries are hidden.")
        return
      }
      let category: string
      if (formType === "late") category = "Delays"
      else if (formType === "absent") category = "Absences"
      else if (formType === "leave") category = "Annual Leave"
      else if (formType === "problem") category = "Problems"
      else category = "Requests"

      const isAllUsersLeave = formType === "leave" && formPerson === ALL_USERS_VALUE

      // Find the user by name if person is selected
      let assignedUserId: string | null = null
      if (formPerson && formType !== "feedback" && !isAllUsersLeave) {
        const selectedUser = users.find(
          (u) =>
            u.full_name === formPerson ||
            u.username === formPerson ||
            u.email === formPerson ||
            `${u.full_name || ""}`.trim() === formPerson
        )
        if (selectedUser) {
          assignedUserId = selectedUser.id
        }
      }

      // Build description with all relevant information
      let description = formNote || ""
      
      // Add time/date information based on type
      if (formType === "late") {
        const startTime = formDelayStart || "08:00"
        const startLine = `Start: ${startTime}`
        const endLine = formUntil ? `Until: ${formUntil}` : ""
        const delayLines = endLine ? `${startLine}\n${endLine}` : startLine
        description = description ? `${description}\n\n${delayLines}` : delayLines
      } else if (formType === "absent" && formFrom && formTo) {
        description = description ? `${description}\n\nFrom: ${formFrom} - To: ${formTo}` : `From: ${formFrom} - To: ${formTo}`
        } else if (formType === "leave") {
          const leaveInfo =
            formEndDate && formEndDate !== formDate
              ? `Date range: ${formDate} to ${formEndDate}`
              : `Date: ${formDate}`
          const timeInfo = formFullDay ? "(Full day)" : `(${formFrom || "--:--"} - ${formTo || "--:--"})`
          const combinedLeaveInfo = `${leaveInfo} ${timeInfo}`.trim()
          description = description ? `${description}\n\n${combinedLeaveInfo}` : combinedLeaveInfo
      }
      
      // Add date information
      if (formDate && formType !== "leave") {
        description = description ? `${description}\nDate: ${formDate}` : `Date: ${formDate}`
      }

      if (isAllUsersLeave) {
        const activeUsers = users.filter((u) => u.is_active)
        const descriptionWithMarker = description
          ? `${description}\n${ALL_USERS_MARKER}`
          : ALL_USERS_MARKER
        const payloadBase = {
          category,
          description: descriptionWithMarker || null,
          entry_date: formDate || null,
        }
        const results = await Promise.all(
          activeUsers.map((u) =>
            apiFetch("/common-entries", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...payloadBase,
                title: u.full_name || u.username || u.email || "Untitled",
                assigned_to_user_id: u.id,
              }),
            })
          )
        )
        if (results.every((r) => r.ok)) {
          // Trigger a reload
          window.location.reload()
        }
      } else {
        // Create the entry
        const res = await apiFetch("/common-entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            title: formType === "feedback" || formType === "problem" ? formTitle : formPerson || "Untitled",
            description: description || null,
            entry_date: formDate || null,
            assigned_to_user_id: assignedUserId || null,
          }),
        })

        if (res.ok) {
          // Trigger a reload
          window.location.reload()
        }
      }
      closeModal()
    } catch (err) {
      console.error("Failed to submit form", err)
    } finally {
      setIsSavingEntry(false)
    }
  }

  const showCard = (type: CommonType) => {
    if (typeFilters.size === 0) return true
    return typeFilters.has(type)
  }

  const deleteCommonEntry = React.useCallback(
    async (entryId: string) => {
      if (!canDeleteCommon) return
      const confirmed = window.confirm("Delete this common entry? This action cannot be undone.")
      if (!confirmed) return
      try {
        const res = await apiFetch(`/common-entries/${entryId}`, { method: "DELETE" })
        if (!res?.ok) {
          console.error("Failed to delete common entry", res?.status)
          return
        }
        window.location.reload()
      } catch (err) {
        console.error("Failed to delete common entry", err)
      }
    },
    [apiFetch, isAdmin]
  )

  const deleteAllUsersLeaveForDay = React.useCallback(
    async (dayIso: string) => {
      if (!isAdmin) return
      const confirmed = window.confirm(
        "Delete ALL annual leave entries for this day? This removes annual leave for every user on this day."
      )
      if (!confirmed) return
      try {
        const entryIdsMarked = Array.from(
          new Set(
            commonData.leave
              .filter((x) => x.isAllUsers && x.entryId && leaveCovers(x, dayIso))
              .map((x) => x.entryId as string)
          )
        )
        const entryIdsFallback = Array.from(
          new Set(
            commonData.leave
              .filter((x) => x.entryId && leaveCovers(x, dayIso))
              .map((x) => x.entryId as string)
          )
        )
        const entryIds = entryIdsMarked.length ? entryIdsMarked : entryIdsFallback
        if (!entryIds.length) return
        const results = await Promise.all(
          entryIds.map((entryId) => apiFetch(`/common-entries/${entryId}`, { method: "DELETE" }))
        )
        if (results.every((r) => r?.ok)) {
          window.location.reload()
        }
      } catch (err) {
        console.error("Failed to delete all-users annual leave entries", err)
      }
    },
    [apiFetch, commonData.leave, isAdmin]
  )

  const toggleChecklistItem = React.useCallback(
    async (itemId: string) => {
      const currentChecked = externalMeetingChecklistItems.get(itemId) ?? false
      const newChecked = !currentChecked
      
      // Optimistically update UI
      setExternalMeetingChecklistItems((prev) => {
        const next = new Map(prev)
        next.set(itemId, newChecked)
        return next
      })

      try {
        const res = await apiFetch(`/checklist-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_checked: newChecked }),
        })
        if (!res?.ok) {
          // Revert on error
          setExternalMeetingChecklistItems((prev) => {
            const next = new Map(prev)
            next.set(itemId, currentChecked)
            return next
          })
          console.error("Failed to update checklist item", res?.status)
        }
      } catch (err) {
        // Revert on error
        setExternalMeetingChecklistItems((prev) => {
          const next = new Map(prev)
          next.set(itemId, currentChecked)
          return next
        })
        console.error("Failed to update checklist item", err)
      }
    },
    [apiFetch, externalMeetingChecklistItems]
  )

  const submitExternalMeeting = React.useCallback(async () => {
    if (!externalMeetingTitle.trim()) return
    const departmentId = externalMeetingDepartmentId || user?.department_id
    if (!departmentId) {
      console.error("Department is required to create a meeting.")
      return
    }
    setCreatingExternalMeeting(true)
    try {
      let startsAt: string | null = null
      if (externalMeetingRecurrenceType === "none") {
        startsAt = externalMeetingStartsAt ? new Date(externalMeetingStartsAt).toISOString() : null
      } else {
        if (!externalMeetingStartTime) {
          alert("Time is required for recurring meetings.")
          return
        }
        if (externalMeetingRecurrenceType === "weekly" && externalMeetingRecurrenceDaysOfWeek.length === 0) {
          alert("Select at least one day.")
          return
        }
        if (externalMeetingRecurrenceType === "monthly" && externalMeetingRecurrenceDaysOfMonth.length === 0) {
          alert("Select at least one day.")
          return
        }
        if (externalMeetingRecurrenceType === "yearly") {
          if (!externalMeetingRecurrenceMonth || !externalMeetingRecurrenceDay) {
            alert("Select month and date.")
            return
          }
        }
        const next = computeNextOccurrenceDate({
          recurrenceType: externalMeetingRecurrenceType,
          daysOfWeek: externalMeetingRecurrenceDaysOfWeek,
          daysOfMonth:
            externalMeetingRecurrenceType === "yearly"
              ? [Number(externalMeetingRecurrenceDay)]
              : externalMeetingRecurrenceDaysOfMonth,
          timeValue: externalMeetingStartTime,
          monthOfYear:
            externalMeetingRecurrenceType === "yearly"
              ? Math.max(0, Math.min(11, Number(externalMeetingRecurrenceMonth) - 1))
              : undefined,
        })
        if (!next) {
          alert("Failed to compute next occurrence.")
          return
        }
        startsAt = next.toISOString()
      }
      const payload = {
        title: externalMeetingTitle.trim(),
        platform: externalMeetingPlatform.trim() || null,
        starts_at: startsAt,
        meeting_type: "external",
        recurrence_type: externalMeetingRecurrenceType === "none" ? null : externalMeetingRecurrenceType,
        recurrence_days_of_week:
          externalMeetingRecurrenceType === "weekly" && externalMeetingRecurrenceDaysOfWeek.length > 0
            ? externalMeetingRecurrenceDaysOfWeek
            : null,
        recurrence_days_of_month:
          externalMeetingRecurrenceType === "monthly" && externalMeetingRecurrenceDaysOfMonth.length > 0
            ? externalMeetingRecurrenceDaysOfMonth
            : externalMeetingRecurrenceType === "yearly" && externalMeetingRecurrenceDay
              ? [Number(externalMeetingRecurrenceDay)]
              : null,
        department_id: departmentId,
        project_id: null,
      }
      const res = await apiFetch("/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res?.ok) {
        console.error("Failed to create meeting", res?.status)
        return
      }
      const created = (await res.json()) as Meeting
      setExternalMeetings((prev) => [created, ...prev])
      const ownerName = user?.full_name || user?.username || user?.email || "Unknown"
      const dateSource = created.starts_at ? new Date(created.starts_at) : new Date(created.created_at)
      const safeDate = Number.isNaN(dateSource.getTime()) ? new Date() : dateSource
      setCommonData((prev) => ({
        ...prev,
        external: [
          ...prev.external,
          {
            title: created.title || "External meeting",
            date: toISODate(safeDate),
            time: created.starts_at ? formatTime(safeDate) : "TBD",
            platform: created.platform?.trim() || "TBD",
            owner: ownerName,
          },
        ],
      }))
      setExternalMeetingTitle("")
      setExternalMeetingPlatform("")
      setExternalMeetingStartsAt("")
      setExternalMeetingStartTime("")
      setExternalMeetingRecurrenceType("none")
      setExternalMeetingRecurrenceDaysOfWeek([])
      setExternalMeetingRecurrenceDaysOfMonth([])
      setExternalMeetingRecurrenceMonth("1")
      setExternalMeetingRecurrenceDay("1")
      // Reset checklist after successful creation
      if (externalMeetingChecklist?.items) {
        const resetMap = new Map<string, boolean>()
        for (const item of externalMeetingChecklist.items) {
          resetMap.set(item.id, false)
        }
        setExternalMeetingChecklistItems(resetMap)
      }
    } finally {
      setCreatingExternalMeeting(false)
    }
  }, [
    apiFetch,
    externalMeetingTitle,
    externalMeetingPlatform,
    externalMeetingStartsAt,
    externalMeetingStartTime,
    externalMeetingRecurrenceType,
    externalMeetingRecurrenceDaysOfWeek,
    externalMeetingRecurrenceDaysOfMonth,
    externalMeetingRecurrenceMonth,
    externalMeetingRecurrenceDay,
    externalMeetingDepartmentId,
    user?.department_id,
    user?.email,
    user?.full_name,
    user?.username,
    formatTime,
    toISODate,
    externalMeetingChecklist,
  ])

  const canEditExternalMeeting = React.useCallback((meeting: Meeting) => {
    if (!user) return false
    // Allow admin, manager, or the person that created it
    if (isAdmin || isManager) return true
    if (meeting.created_by && meeting.created_by === user.id) return true
    return false
  }, [user, isAdmin, isManager])

  const startEditExternalMeeting = React.useCallback((meeting: Meeting) => {
    if (!canEditExternalMeeting(meeting)) return
    setEditingExternalMeetingId(meeting.id)
    setEditingExternalMeetingTitle(meeting.title || "")
    setEditingExternalMeetingPlatform(meeting.platform || "")
    if (meeting.starts_at) {
      const date = new Date(meeting.starts_at)
      const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
      setEditingExternalMeetingStartsAt(localDateTime)
      setEditingExternalMeetingStartTime(toMeetingTimeValue(meeting.starts_at))
    } else {
      setEditingExternalMeetingStartsAt("")
      setEditingExternalMeetingStartTime("")
    }
    setEditingExternalMeetingRecurrenceType(
      (meeting.recurrence_type as "none" | "weekly" | "monthly" | "yearly") || "none"
    )
    setEditingExternalMeetingRecurrenceDaysOfWeek(meeting.recurrence_days_of_week || [])
    setEditingExternalMeetingRecurrenceDaysOfMonth(meeting.recurrence_days_of_month || [])
    if (meeting.starts_at) {
      const startDate = new Date(meeting.starts_at)
      if (!Number.isNaN(startDate.getTime())) {
        setEditingExternalMeetingRecurrenceMonth(String(startDate.getMonth() + 1))
        setEditingExternalMeetingRecurrenceDay(String(startDate.getDate()))
      }
    }
    setShowEditWeekendDays(
      (meeting.recurrence_days_of_week || []).some((day) => day >= 5)
    )
    setEditingExternalMeetingDepartmentId(meeting.department_id || "")
  }, [canEditExternalMeeting])

  const cancelEditExternalMeeting = React.useCallback(() => {
    setEditingExternalMeetingId(null)
    setEditingExternalMeetingTitle("")
    setEditingExternalMeetingPlatform("")
    setEditingExternalMeetingStartsAt("")
    setEditingExternalMeetingStartTime("")
    setEditingExternalMeetingRecurrenceType("none")
    setEditingExternalMeetingRecurrenceDaysOfWeek([])
    setEditingExternalMeetingRecurrenceDaysOfMonth([])
    setEditingExternalMeetingRecurrenceMonth("1")
    setEditingExternalMeetingRecurrenceDay("1")
    setEditingExternalMeetingDepartmentId("")
    setShowEditWeekendDays(false)
  }, [])

  const saveExternalMeeting = React.useCallback(async () => {
    if (!editingExternalMeetingId || !editingExternalMeetingTitle.trim()) return
    setUpdatingExternalMeeting(true)
    try {
      let startsAt: string | null = null
      if (editingExternalMeetingRecurrenceType === "none") {
        startsAt = editingExternalMeetingStartsAt
          ? new Date(editingExternalMeetingStartsAt).toISOString()
          : null
      } else {
        if (!editingExternalMeetingStartTime) {
          alert("Time is required for recurring meetings.")
          return
        }
        if (editingExternalMeetingRecurrenceType === "weekly" && editingExternalMeetingRecurrenceDaysOfWeek.length === 0) {
          alert("Select at least one day.")
          return
        }
        if (editingExternalMeetingRecurrenceType === "monthly" && editingExternalMeetingRecurrenceDaysOfMonth.length === 0) {
          alert("Select at least one day.")
          return
        }
        if (editingExternalMeetingRecurrenceType === "yearly") {
          if (!editingExternalMeetingRecurrenceMonth || !editingExternalMeetingRecurrenceDay) {
            alert("Select month and date.")
            return
          }
        }
        const next = computeNextOccurrenceDate({
          recurrenceType: editingExternalMeetingRecurrenceType,
          daysOfWeek: editingExternalMeetingRecurrenceDaysOfWeek,
          daysOfMonth:
            editingExternalMeetingRecurrenceType === "yearly"
              ? [Number(editingExternalMeetingRecurrenceDay)]
              : editingExternalMeetingRecurrenceDaysOfMonth,
          timeValue: editingExternalMeetingStartTime,
          monthOfYear:
            editingExternalMeetingRecurrenceType === "yearly"
              ? Math.max(0, Math.min(11, Number(editingExternalMeetingRecurrenceMonth) - 1))
              : undefined,
        })
        if (!next) {
          alert("Failed to compute next occurrence.")
          return
        }
        startsAt = next.toISOString()
      }
      const payload = {
        title: editingExternalMeetingTitle.trim(),
        platform: editingExternalMeetingPlatform.trim() || null,
        starts_at: startsAt,
        meeting_type: "external",
        recurrence_type: editingExternalMeetingRecurrenceType === "none" ? null : editingExternalMeetingRecurrenceType,
        recurrence_days_of_week:
          editingExternalMeetingRecurrenceType === "weekly" && editingExternalMeetingRecurrenceDaysOfWeek.length > 0
            ? editingExternalMeetingRecurrenceDaysOfWeek
            : null,
        recurrence_days_of_month:
          editingExternalMeetingRecurrenceType === "monthly" && editingExternalMeetingRecurrenceDaysOfMonth.length > 0
            ? editingExternalMeetingRecurrenceDaysOfMonth
            : editingExternalMeetingRecurrenceType === "yearly" && editingExternalMeetingRecurrenceDay
              ? [Number(editingExternalMeetingRecurrenceDay)]
              : null,
        department_id: editingExternalMeetingDepartmentId || null,
      }
      const res = await apiFetch(`/meetings/${editingExternalMeetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res?.ok) {
        console.error("Failed to update meeting", res?.status)
        alert("Failed to update meeting. Only admins, managers, and the meeting creator can edit meetings.")
        return
      }
      const updated = (await res.json()) as Meeting
      setExternalMeetings((prev) =>
        prev.map((m) => (m.id === editingExternalMeetingId ? updated : m))
      )
      cancelEditExternalMeeting()
      // Reload external meetings to update the list
      const meetingsBase = commonDepartmentId
        ? `/meetings?department_id=${encodeURIComponent(commonDepartmentId)}`
        : "/meetings?include_all_departments=true"
      const meetingsRes = await apiFetch(`${meetingsBase}&meeting_type=external`)
      if (meetingsRes?.ok) {
        const meetings = (await meetingsRes.json()) as Meeting[]
        setExternalMeetings(meetings)
      }
    } catch (err) {
      console.error("Error updating meeting:", err)
      alert("Failed to update meeting. Please try again.")
    } finally {
      setUpdatingExternalMeeting(false)
    }
  }, [
    editingExternalMeetingId,
    editingExternalMeetingTitle,
    editingExternalMeetingPlatform,
    editingExternalMeetingStartsAt,
    editingExternalMeetingStartTime,
    editingExternalMeetingRecurrenceType,
    editingExternalMeetingRecurrenceDaysOfWeek,
    editingExternalMeetingRecurrenceDaysOfMonth,
    editingExternalMeetingRecurrenceMonth,
    editingExternalMeetingRecurrenceDay,
    editingExternalMeetingDepartmentId,
    commonDepartmentId,
    apiFetch,
    cancelEditExternalMeeting,
  ])

  const deleteExternalMeeting = React.useCallback(
    async (meetingId: string) => {
      if (!isAdmin) return
      const confirmed = window.confirm("Delete this external meeting? This action cannot be undone.")
      if (!confirmed) return
      setDeletingExternalMeetingId(meetingId)
      try {
        const res = await apiFetch(`/meetings/${meetingId}`, {
          method: "DELETE",
        })
        if (!res?.ok) {
          console.error("Failed to delete meeting", res?.status)
          alert("Failed to delete meeting. Only admins can delete meetings.")
          return
        }
        setExternalMeetings((prev) => prev.filter((m) => m.id !== meetingId))
        // Reload external meetings to update the list
        const meetingsBase = commonDepartmentId
          ? `/meetings?department_id=${encodeURIComponent(commonDepartmentId)}`
          : "/meetings?include_all_departments=true"
        const meetingsRes = await apiFetch(`${meetingsBase}&meeting_type=external`)
        if (meetingsRes?.ok) {
          const meetings = (await meetingsRes.json()) as Meeting[]
          setExternalMeetings(meetings)
        }
      } catch (err) {
        console.error("Error deleting meeting:", err)
        alert("Failed to delete meeting. Please try again.")
      } finally {
        setDeletingExternalMeetingId(null)
      }
    },
    [isAdmin, apiFetch, commonDepartmentId]
  )

  const submitInternalMeeting = React.useCallback(async () => {
    if (!internalMeetingTitle.trim()) return
    const departmentId = internalMeetingDepartmentId || user?.department_id
    if (!departmentId) {
      console.error("Department is required to create a meeting.")
      return
    }
    setCreatingInternalMeeting(true)
    try {
      let startsAt: string | null = null
      if (internalMeetingRecurrenceType === "none") {
        startsAt = internalMeetingStartsAt ? new Date(internalMeetingStartsAt).toISOString() : null
      } else {
        if (!internalMeetingStartTime) {
          alert("Time is required for recurring meetings.")
          return
        }
        if (internalMeetingRecurrenceType === "weekly" && internalMeetingRecurrenceDaysOfWeek.length === 0) {
          alert("Select at least one day.")
          return
        }
        if (internalMeetingRecurrenceType === "monthly" && internalMeetingRecurrenceDaysOfMonth.length === 0) {
          alert("Select at least one day.")
          return
        }
        if (internalMeetingRecurrenceType === "yearly") {
          if (!internalMeetingRecurrenceMonth || !internalMeetingRecurrenceDay) {
            alert("Select month and date.")
            return
          }
        }
        const next = computeNextOccurrenceDate({
          recurrenceType: internalMeetingRecurrenceType,
          daysOfWeek: internalMeetingRecurrenceDaysOfWeek,
          daysOfMonth:
            internalMeetingRecurrenceType === "yearly"
              ? [Number(internalMeetingRecurrenceDay)]
              : internalMeetingRecurrenceDaysOfMonth,
          timeValue: internalMeetingStartTime,
          monthOfYear:
            internalMeetingRecurrenceType === "yearly"
              ? Math.max(0, Math.min(11, Number(internalMeetingRecurrenceMonth) - 1))
              : undefined,
        })
        if (!next) {
          alert("Failed to compute next occurrence.")
          return
        }
        startsAt = next.toISOString()
      }
      const payload = {
        title: internalMeetingTitle.trim(),
        platform: internalMeetingPlatform.trim() || null,
        starts_at: startsAt,
        meeting_type: "internal",
        recurrence_type: internalMeetingRecurrenceType === "none" ? null : internalMeetingRecurrenceType,
        recurrence_days_of_week:
          internalMeetingRecurrenceType === "weekly" && internalMeetingRecurrenceDaysOfWeek.length > 0
            ? internalMeetingRecurrenceDaysOfWeek
            : null,
        recurrence_days_of_month:
          internalMeetingRecurrenceType === "monthly" && internalMeetingRecurrenceDaysOfMonth.length > 0
            ? internalMeetingRecurrenceDaysOfMonth
            : internalMeetingRecurrenceType === "yearly" && internalMeetingRecurrenceDay
              ? [Number(internalMeetingRecurrenceDay)]
              : null,
        department_id: departmentId,
        project_id: null,
      }
      const res = await apiFetch("/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res?.ok) {
        console.error("Failed to create meeting", res?.status)
        return
      }
      const created = (await res.json()) as Meeting
      setInternalMeetings((prev) => [created, ...prev])
      const ownerName = user?.full_name || user?.username || user?.email || "Unknown"
      const dateSource = created.starts_at ? new Date(created.starts_at) : new Date(created.created_at)
      const safeDate = Number.isNaN(dateSource.getTime()) ? new Date() : dateSource
      setCommonData((prev) => ({
        ...prev,
        internal: [
          ...prev.internal,
          {
            title: created.title || "Internal meeting",
            date: toISODate(safeDate),
            time: created.starts_at ? formatTime(safeDate) : "TBD",
            platform: created.platform?.trim() || "TBD",
            owner: ownerName,
          },
        ],
      }))
      setInternalMeetingTitle("")
      setInternalMeetingPlatform("")
      setInternalMeetingStartsAt("")
      setInternalMeetingStartTime("")
      setInternalMeetingRecurrenceType("none")
      setInternalMeetingRecurrenceDaysOfWeek([])
      setInternalMeetingRecurrenceDaysOfMonth([])
      setInternalMeetingRecurrenceMonth("1")
      setInternalMeetingRecurrenceDay("1")
    } finally {
      setCreatingInternalMeeting(false)
    }
  }, [
    apiFetch,
    internalMeetingTitle,
    internalMeetingPlatform,
    internalMeetingStartsAt,
    internalMeetingStartTime,
    internalMeetingRecurrenceType,
    internalMeetingRecurrenceDaysOfWeek,
    internalMeetingRecurrenceDaysOfMonth,
    internalMeetingRecurrenceMonth,
    internalMeetingRecurrenceDay,
    internalMeetingDepartmentId,
    user?.department_id,
    user?.email,
    user?.full_name,
    user?.username,
    formatTime,
    toISODate,
  ])

  const canEditInternalMeeting = React.useCallback((meeting: Meeting) => {
    if (!user) return false
    if (isAdmin || isManager) return true
    if (meeting.created_by && meeting.created_by === user.id) return true
    return false
  }, [user, isAdmin, isManager])

  const startEditInternalMeeting = React.useCallback((meeting: Meeting) => {
    if (!canEditInternalMeeting(meeting)) return
    setEditingInternalMeetingId(meeting.id)
    setEditingInternalMeetingTitle(meeting.title || "")
    setEditingInternalMeetingPlatform(meeting.platform || "")
    if (meeting.starts_at) {
      const date = new Date(meeting.starts_at)
      const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
      setEditingInternalMeetingStartsAt(localDateTime)
      setEditingInternalMeetingStartTime(toMeetingTimeValue(meeting.starts_at))
    } else {
      setEditingInternalMeetingStartsAt("")
      setEditingInternalMeetingStartTime("")
    }
    setEditingInternalMeetingRecurrenceType(
      (meeting.recurrence_type as "none" | "weekly" | "monthly" | "yearly") || "none"
    )
    setEditingInternalMeetingRecurrenceDaysOfWeek(meeting.recurrence_days_of_week || [])
    setEditingInternalMeetingRecurrenceDaysOfMonth(meeting.recurrence_days_of_month || [])
    if (meeting.starts_at) {
      const startDate = new Date(meeting.starts_at)
      if (!Number.isNaN(startDate.getTime())) {
        setEditingInternalMeetingRecurrenceMonth(String(startDate.getMonth() + 1))
        setEditingInternalMeetingRecurrenceDay(String(startDate.getDate()))
      }
    }
    setShowInternalEditWeekendDays(
      (meeting.recurrence_days_of_week || []).some((day) => day >= 5)
    )
    setEditingInternalMeetingDepartmentId(meeting.department_id || "")
  }, [canEditInternalMeeting])

  const cancelEditInternalMeeting = React.useCallback(() => {
    setEditingInternalMeetingId(null)
    setEditingInternalMeetingTitle("")
    setEditingInternalMeetingPlatform("")
    setEditingInternalMeetingStartsAt("")
    setEditingInternalMeetingStartTime("")
    setEditingInternalMeetingRecurrenceType("none")
    setEditingInternalMeetingRecurrenceDaysOfWeek([])
    setEditingInternalMeetingRecurrenceDaysOfMonth([])
    setEditingInternalMeetingRecurrenceMonth("1")
    setEditingInternalMeetingRecurrenceDay("1")
    setEditingInternalMeetingDepartmentId("")
    setShowInternalEditWeekendDays(false)
  }, [])

  const saveInternalMeeting = React.useCallback(async () => {
    if (!editingInternalMeetingId || !editingInternalMeetingTitle.trim()) return
    setUpdatingInternalMeeting(true)
    try {
      let startsAt: string | null = null
      if (editingInternalMeetingRecurrenceType === "none") {
        startsAt = editingInternalMeetingStartsAt
          ? new Date(editingInternalMeetingStartsAt).toISOString()
          : null
      } else {
        if (!editingInternalMeetingStartTime) {
          alert("Time is required for recurring meetings.")
          return
        }
        if (editingInternalMeetingRecurrenceType === "weekly" && editingInternalMeetingRecurrenceDaysOfWeek.length === 0) {
          alert("Select at least one day.")
          return
        }
        if (editingInternalMeetingRecurrenceType === "monthly" && editingInternalMeetingRecurrenceDaysOfMonth.length === 0) {
          alert("Select at least one day.")
          return
        }
        if (editingInternalMeetingRecurrenceType === "yearly") {
          if (!editingInternalMeetingRecurrenceMonth || !editingInternalMeetingRecurrenceDay) {
            alert("Select month and date.")
            return
          }
        }
        const next = computeNextOccurrenceDate({
          recurrenceType: editingInternalMeetingRecurrenceType,
          daysOfWeek: editingInternalMeetingRecurrenceDaysOfWeek,
          daysOfMonth:
            editingInternalMeetingRecurrenceType === "yearly"
              ? [Number(editingInternalMeetingRecurrenceDay)]
              : editingInternalMeetingRecurrenceDaysOfMonth,
          timeValue: editingInternalMeetingStartTime,
          monthOfYear:
            editingInternalMeetingRecurrenceType === "yearly"
              ? Math.max(0, Math.min(11, Number(editingInternalMeetingRecurrenceMonth) - 1))
              : undefined,
        })
        if (!next) {
          alert("Failed to compute next occurrence.")
          return
        }
        startsAt = next.toISOString()
      }
      const payload = {
        title: editingInternalMeetingTitle.trim(),
        platform: editingInternalMeetingPlatform.trim() || null,
        starts_at: startsAt,
        meeting_type: "internal",
        recurrence_type: editingInternalMeetingRecurrenceType === "none" ? null : editingInternalMeetingRecurrenceType,
        recurrence_days_of_week:
          editingInternalMeetingRecurrenceType === "weekly" && editingInternalMeetingRecurrenceDaysOfWeek.length > 0
            ? editingInternalMeetingRecurrenceDaysOfWeek
            : null,
        recurrence_days_of_month:
          editingInternalMeetingRecurrenceType === "monthly" && editingInternalMeetingRecurrenceDaysOfMonth.length > 0
            ? editingInternalMeetingRecurrenceDaysOfMonth
            : editingInternalMeetingRecurrenceType === "yearly" && editingInternalMeetingRecurrenceDay
              ? [Number(editingInternalMeetingRecurrenceDay)]
              : null,
        department_id: editingInternalMeetingDepartmentId || null,
      }
      const res = await apiFetch(`/meetings/${editingInternalMeetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res?.ok) {
        console.error("Failed to update meeting", res?.status)
        alert("Failed to update meeting. Only admins, managers, and the meeting creator can edit meetings.")
        return
      }
      const updated = (await res.json()) as Meeting
      setInternalMeetings((prev) =>
        prev.map((m) => (m.id === editingInternalMeetingId ? updated : m))
      )
      cancelEditInternalMeeting()
      const meetingsBase = commonDepartmentId
        ? `/meetings?department_id=${encodeURIComponent(commonDepartmentId)}`
        : "/meetings?include_all_departments=true"
      const meetingsRes = await apiFetch(`${meetingsBase}&meeting_type=internal`)
      if (meetingsRes?.ok) {
        const meetings = (await meetingsRes.json()) as Meeting[]
        setInternalMeetings(meetings)
      }
    } catch (err) {
      console.error("Error updating meeting:", err)
      alert("Failed to update meeting. Please try again.")
    } finally {
      setUpdatingInternalMeeting(false)
    }
  }, [
    editingInternalMeetingId,
    editingInternalMeetingTitle,
    editingInternalMeetingPlatform,
    editingInternalMeetingStartsAt,
    editingInternalMeetingStartTime,
    editingInternalMeetingRecurrenceType,
    editingInternalMeetingRecurrenceDaysOfWeek,
    editingInternalMeetingRecurrenceDaysOfMonth,
    editingInternalMeetingRecurrenceMonth,
    editingInternalMeetingRecurrenceDay,
    editingInternalMeetingDepartmentId,
    commonDepartmentId,
    apiFetch,
    cancelEditInternalMeeting,
  ])

  const deleteInternalMeeting = React.useCallback(
    async (meetingId: string) => {
      if (!isAdmin) return
      const confirmed = window.confirm("Delete this internal meeting? This action cannot be undone.")
      if (!confirmed) return
      setDeletingInternalMeetingId(meetingId)
      try {
        const res = await apiFetch(`/meetings/${meetingId}`, {
          method: "DELETE",
        })
        if (!res?.ok) {
          console.error("Failed to delete meeting", res?.status)
          alert("Failed to delete meeting. Only admins can delete meetings.")
          return
        }
        setInternalMeetings((prev) => prev.filter((m) => m.id !== meetingId))
        const meetingsBase = commonDepartmentId
          ? `/meetings?department_id=${encodeURIComponent(commonDepartmentId)}`
          : "/meetings?include_all_departments=true"
        const meetingsRes = await apiFetch(`${meetingsBase}&meeting_type=internal`)
        if (meetingsRes?.ok) {
          const meetings = (await meetingsRes.json()) as Meeting[]
          setInternalMeetings(meetings)
        }
      } catch (err) {
        console.error("Error deleting meeting:", err)
        alert("Failed to delete meeting. Please try again.")
      } finally {
        setDeletingInternalMeetingId(null)
      }
    },
    [isAdmin, apiFetch, commonDepartmentId]
  )

  const buildSwimlaneCells = (items: SwimlaneCell[], targetCount: number) => {
    const baseItems = items.length ? items : [{ title: "No data available.", placeholder: true }]
    const minimumCells = Math.max(3, Math.ceil(baseItems.length / 3) * 3)
    const totalCells = Math.max(minimumCells, targetCount)
    return [
      ...baseItems,
      ...Array.from({ length: totalCells - baseItems.length }, () => null),
    ]
  }


  const swimlaneRows = React.useMemo<SwimlaneRow[]>(() => {
    const lateSource = isMultiDate
      ? sortByDate(filtered.late, (x) => x.date, (x) => x.person)
      : filtered.late
    const lateItems: SwimlaneCell[] = lateSource.map((x) => ({
      title: x.person,
      subtitle: `${toDDMMYYYYDot(x.date)} - ${x.start || "08:00"}-${x.until}${x.note ? ` - ${x.note}` : ""}`,
      dateLabel: formatDateHuman(x.date),
      accentClass: "swimlane-accent delay",
      entryId: x.entryId,
    }))

    const absentSource = isMultiDate
      ? sortByDate(filtered.absent, (x) => x.date, (x) => x.person)
      : filtered.absent
    const absentItems: SwimlaneCell[] = absentSource.map((x) => ({
      title: x.person,
      subtitle: `${toDDMMYYYYDot(x.date)} - ${x.from}-${x.to}${x.note ? ` - ${x.note}` : ""}`,
      dateLabel: formatDateHuman(x.date),
      accentClass: "swimlane-accent absence",
      entryId: x.entryId,
    }))
    const rawLeaveSource = isMultiDate
      ? sortByDate(filtered.leave, (x) => x.startDate, (x) => x.person)
      : filtered.leave
    const leaveAllUsersSeen = new Set<string>()
    const leaveSource: LeaveItem[] = rawLeaveSource.reduce((acc, x) => {
      if (!x.isAllUsers) {
        acc.push(x)
        return acc
      }
      const key = [
        x.startDate,
        x.endDate,
        x.fullDay ? "1" : "0",
        x.from || "",
        x.to || "",
        x.note || "",
      ].join("|")
      if (leaveAllUsersSeen.has(key)) {
        return acc
      }
      leaveAllUsersSeen.add(key)
      acc.push({
        ...x,
        person: ALL_USERS_INITIALS,
        entryId: undefined,
      })
      return acc
    }, [] as LeaveItem[])
    const datesToUse = selectedDates.size ? Array.from(selectedDates) : weekISOs
    const syntheticAllUsers = datesToUse
      .filter((d) => filtered.fullyCoveredDates.has(d))
      .map((d) => ({
        person: ALL_USERS_INITIALS,
        startDate: d,
        endDate: d,
        fullDay: true,
        isAllUsers: true,
      }))
    const syntheticKeys = new Set<string>(
      leaveSource.map((x) =>
        [x.startDate, x.endDate, x.fullDay ? "1" : "0", x.from || "", x.to || "", x.note || "", x.person].join("|")
      )
    )
    for (const item of syntheticAllUsers) {
      const key = [item.startDate, item.endDate, "1", "", "", "", item.person].join("|")
      if (syntheticKeys.has(key)) continue
      syntheticKeys.add(key)
      leaveSource.push(item)
    }
    const leaveItems: SwimlaneCell[] = leaveSource.map((x) => {
      const isRange = x.endDate && x.endDate !== x.startDate
      const dateLabel = isRange
        ? `${toDDMMYYYYDot(x.startDate)} - ${toDDMMYYYYDot(x.endDate)}`
        : toDDMMYYYYDot(x.startDate)
      const timeLabel = x.fullDay
        ? "Full day"
        : `${x.from || ""}${x.from && x.to ? "-" : ""}${x.to || ""}`.trim()
      return {
        title: x.person,
        subtitle: `${dateLabel} - ${timeLabel}${x.note ? ` - ${x.note}` : ""}`,
        dateLabel,
        accentClass: "swimlane-accent leave",
        entryId: x.entryId,
        entryDate: x.startDate,
      }
    })

    const blockedSource = isMultiDate
      ? sortByDate(filtered.blocked, (x) => x.date, (x) => x.title)
      : filtered.blocked
    const blockedItems: SwimlaneCell[] = blockedSource.map((x) => ({
      title: x.title,
      assignees: x.assignees || (x.person ? [x.person] : []),
      subtitle: `${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      dateLabel: formatDateHuman(x.date),
      accentClass: "swimlane-accent blocked",
    }))

    const oneHSource = isMultiDate
      ? sortByDate(filtered.oneH, (x) => x.date, (x) => x.title)
      : filtered.oneH
    const oneHItems: SwimlaneCell[] = oneHSource.map((x) => ({
      title: x.title,
      assignees: x.assignees || (x.person ? [x.person] : []),
      subtitle: `${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      dateLabel: formatDateHuman(x.date),
      accentClass: "swimlane-accent oneh",
    }))

    const personalSource = isMultiDate
      ? sortByDate(filtered.personal, (x) => x.date, (x) => x.title)
      : filtered.personal
    const personalItems: SwimlaneCell[] = personalSource.map((x) => ({
      title: x.title,
      assignees: x.assignees || (x.person ? [x.person] : []),
      subtitle: `${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      dateLabel: formatDateHuman(x.date),
      accentClass: "swimlane-accent personal",
    }))

    const externalSource = isMultiDate
      ? sortByDateTime(filtered.external, (x) => x.date, (x) => x.time, (x) => x.title)
      : sortByTime(filtered.external, (x) => x.time, (x) => x.title)
    const externalItems: SwimlaneCell[] = externalSource.map((x) => ({
      title: `${x.title} ${formatTimeLabel(x.time)}`.trim(),
      subtitle: x.department || "Department TBD",
      dateLabel: formatDateHuman(x.date),
      accentClass: "swimlane-accent external",
    }))
    const internalSource = isMultiDate
      ? sortByDateTime(filtered.internal, (x) => x.date, (x) => x.time, (x) => x.title)
      : sortByTime(filtered.internal, (x) => x.time, (x) => x.title)
    const internalItems: SwimlaneCell[] = internalSource.map((x) => ({
      title: `${x.title} ${formatTimeLabel(x.time)}`.trim(),
      subtitle: x.department || "Department TBD",
      dateLabel: formatDateHuman(x.date),
      accentClass: "swimlane-accent internal",
    }))

    const bzSource = isMultiDate
      ? sortByDate(filtered.bz, (x) => x.date, (x) => x.title)
      : filtered.bz
    const bzItems: SwimlaneCell[] = bzSource.map((x) => ({
      title: x.title,
      subtitle: `${formatTimeLabel(x.time)}${x.bzWithLabel ? ` - BZ: ${x.bzWithLabel}` : ""}`.trim(),
      dateLabel: formatDateHuman(x.date),
      accentClass: "swimlane-accent bz",
      assignees: x.assignees,
    }))

    const r1Source = isMultiDate
      ? sortByDate(filtered.r1, (x) => x.date, (x) => x.title)
      : filtered.r1
    const r1Items: SwimlaneCell[] = r1Source.map((x) => ({
      title: x.title,
      assignees: x.assignees || (x.owner ? [x.owner] : []),
      subtitle: `${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      dateLabel: formatDateHuman(x.date),
      accentClass: "swimlane-accent r1",
    }))

    const problemSource = isMultiDate
      ? sortByDate(filtered.problems, (x) => x.date, (x) => x.title)
      : filtered.problems
    const problemItems: SwimlaneCell[] = problemSource.map((x) => ({
      title: x.title,
      subtitle: `${x.person} - ${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      dateLabel: formatDateHuman(x.date),
      accentClass: "swimlane-accent problem",
      entryId: x.entryId,
    }))

    const feedbackSource = isMultiDate
      ? sortByDate(filtered.feedback, (x) => x.date, (x) => x.title)
      : filtered.feedback
    const feedbackItems: SwimlaneCell[] = feedbackSource.map((x) => ({
      title: x.title,
      subtitle: `${x.person} - ${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      dateLabel: formatDateHuman(x.date),
      accentClass: "swimlane-accent feedback",
      entryId: x.entryId,
    }))

    const prioritySource = isMultiDate
      ? sortByDate(filtered.priority, (x) => x.date, (x) => x.project)
      : filtered.priority
    const priorityItems: SwimlaneCell[] = prioritySource.map((p, idx) => ({
      title: p.project,
      assignees: p.assignees,
      accentClass: "swimlane-accent priority",
      number: idx + 1,
      dateLabel: formatDateHuman(p.date),
    }))

    return [
      {
        id: "late",
        label: "VONS",
        count: filtered.late.length,
        headerClass: "swimlane-header delay",
        badgeClass: "swimlane-badge delay",
        items: lateItems,
      },
      {
        id: "absent",
        label: "MUNG",
        count: filtered.absent.length,
        headerClass: "swimlane-header absence",
        badgeClass: "swimlane-badge absence",
        items: absentItems,
      },
      {
        id: "leave",
        label: "PV/FESTE",
        count: leaveSource.length,
        headerClass: "swimlane-header leave",
        badgeClass: "swimlane-badge leave",
        items: leaveItems,
      },
      {
        id: "external",
        label: "TAK EXT",
        count: filtered.external.length,
        headerClass: "swimlane-header external",
        badgeClass: "swimlane-badge external",
        items: externalItems,
      },
      {
        id: "internal",
        label: "TAK INT",
        count: filtered.internal.length,
        headerClass: "swimlane-header internal",
        badgeClass: "swimlane-badge internal",
        items: internalItems,
      },
      {
        id: "bz",
        label: "BZ GA",
        count: filtered.bz.length,
        headerClass: "swimlane-header bz",
        badgeClass: "swimlane-badge bz",
        items: bzItems,
      },
      {
        id: "blocked",
        label: "BLL",
        count: filtered.blocked.length,
        headerClass: "swimlane-header blocked",
        badgeClass: "swimlane-badge blocked",
        items: blockedItems,
      },
      {
        id: "oneH",
        label: "1H",
        count: filtered.oneH.length,
        headerClass: "swimlane-header oneh",
        badgeClass: "swimlane-badge oneh",
        items: oneHItems,
      },
      {
        id: "personal",
        label: "P:",
        count: filtered.personal.length,
        headerClass: "swimlane-header personal",
        badgeClass: "swimlane-badge personal",
        items: personalItems,
      },
      {
        id: "r1",
        label: "R1",
        count: filtered.r1.length,
        headerClass: "swimlane-header r1",
        badgeClass: "swimlane-badge r1",
        items: r1Items,
      },
      {
        id: "priority",
        label: "PRJK",
        count: filtered.priority.length,
        headerClass: "swimlane-header priority",
        badgeClass: "swimlane-badge priority",
        items: priorityItems,
      },
      {
        id: "problem",
        label: "PRBL",
        count: filtered.problems.length,
        headerClass: "swimlane-header problem",
        badgeClass: "swimlane-badge problem",
        items: problemItems,
      },
      {
        id: "feedback",
        label: "ANK/KRK/PRZ",
        count: filtered.feedback.length,
        headerClass: "swimlane-header feedback",
        badgeClass: "swimlane-badge feedback",
        items: feedbackItems,
      },
    ]
  }, [filtered, isMultiDate, sortByDate, sortByDateTime, sortByTime, selectedDates, weekISOs])

  const swimlaneColumnCount = React.useMemo(() => {
    if (!swimlaneRows.length) return 3
    const counts = swimlaneRows.map((row) => {
      const length = row.items.length || 1
      return Math.max(3, Math.ceil(length / 3) * 3)
    })
    return Math.max(...counts)
  }, [swimlaneRows])

  // Organize data by day for table view
  const tableDataByDay = React.useMemo(() => {
    if (!allDaysSelected) return null
    
    const dataByDay: Record<string, {
      late: LateItem[]
      absent: AbsentItem[]
      leave: LeaveItem[]
      blocked: BlockedItem[]
      oneH: OneHItem[]
      personal: PersonalItem[]
      external: ExternalItem[]
      internal: InternalItem[]
      bz: BzItem[]
      r1: R1Item[]
      problems: ProblemItem[]
      feedback: FeedbackItem[]
      priority: PriorityItem[]
    }> = {}
    
    weekISOs.forEach((iso) => {
      if (filtered.fullyCoveredDates.has(iso)) {
        dataByDay[iso] = {
          late: [],
          absent: [],
          leave: [
            {
              person: ALL_USERS_INITIALS,
              startDate: iso,
              endDate: iso,
              fullDay: true,
              isAllUsers: true,
            },
          ],
          blocked: [],
          oneH: [],
          personal: [],
          external: [],
          internal: [],
          bz: [],
          r1: [],
          problems: [],
          feedback: [],
          priority: [],
        }
        return
      }
      dataByDay[iso] = {
        late: filtered.late.filter((x) => x.date === iso),
        absent: filtered.absent.filter((x) => x.date === iso),
        leave: filtered.leave.filter((x) => iso >= x.startDate && iso <= x.endDate),
        blocked: filtered.blocked.filter((x) => x.date === iso),
        oneH: filtered.oneH.filter((x) => x.date === iso),
        personal: filtered.personal.filter((x) => x.date === iso),
        external: filtered.external.filter((x) => x.date === iso),
        internal: filtered.internal.filter((x) => x.date === iso),
        bz: filtered.bz.filter((x) => x.date === iso),
        r1: filtered.r1.filter((x) => x.date === iso),
        problems: filtered.problems.filter((x) => x.date === iso),
        feedback: filtered.feedback.filter((x) => x.date === iso),
        priority: filtered.priority.filter((x) => x.date === iso),
      }
    })
    
    return dataByDay
  }, [allDaysSelected, weekISOs, filtered])

  const swimlaneRowRefs = React.useRef<Record<string, HTMLDivElement | null>>({})
  const scrollSwimlaneRow = React.useCallback((rowId: CommonType, direction: "left" | "right") => {
    const node = swimlaneRowRefs.current[rowId]
    if (!node) return
    const delta = direction === "left" ? -320 : 320
    node.scrollBy({ left: delta, behavior: "smooth" })
  }, [])

  const updateMeetingChecked = React.useCallback((meetingId: string, itemId: string, nextChecked: boolean) => {
    setMeetingTemplates((prev) =>
      prev.map((meeting) => {
        if (meeting.id !== meetingId) return meeting
        return {
          ...meeting,
          rows: meeting.rows.map((row) =>
            row.id === itemId ? { ...row, isChecked: nextChecked } : row
          ),
        }
      })
    )
  }, [])

  const toggleMeetingItem = React.useCallback(
    async (meetingId: string, itemId: string, nextChecked: boolean) => {
      const currentChecked =
        meetingTemplates
          .find((meeting) => meeting.id === meetingId)
          ?.rows.find((row) => row.id === itemId)?.isChecked ?? false
      updateMeetingChecked(meetingId, itemId, nextChecked)
      try {
        const res = await apiFetch(`/checklist-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_checked: nextChecked }),
        })
        if (!res.ok) {
          updateMeetingChecked(meetingId, itemId, currentChecked)
        }
      } catch (err) {
        updateMeetingChecked(meetingId, itemId, currentChecked)
      }
    },
    [apiFetch, meetingTemplates, updateMeetingChecked]
  )

  const startEditMeetingRow = React.useCallback((row: MeetingRow) => {
    setEditingRowId(row.id)
    setEditDraft({
      day: row.day || "",
      topic: row.topic || "",
      owner: row.owner || "",
      time: row.time || "",
    })
  }, [])

  const cancelEditMeetingRow = React.useCallback(() => {
    setEditingRowId(null)
    setEditDraft({ day: "", topic: "", owner: "", time: "" })
  }, [])

  const saveMeetingRow = React.useCallback(
    async (meetingId: string, rowId: string) => {
      const payload = {
        title: editDraft.topic.trim().toUpperCase(),
        day: editDraft.day.trim() || null,
        owner: editDraft.owner.trim() || null,
        time: editDraft.time.trim() || null,
      }
      if (!payload.title) return
      const previous = meetingTemplates
        .find((meeting) => meeting.id === meetingId)
        ?.rows.find((row) => row.id === rowId)
      setMeetingTemplates((prev) =>
        prev.map((meeting) => {
          if (meeting.id !== meetingId) return meeting
          return {
            ...meeting,
            rows: meeting.rows.map((row) =>
              row.id === rowId
                ? {
                    ...row,
                    day: payload.day ?? undefined,
                    topic: payload.title,
                    owner: payload.owner ?? undefined,
                    time: payload.time ?? undefined,
                  }
                : row
            ),
          }
        })
      )
      setEditingRowId(null)
      try {
        const res = await apiFetch(`/checklist-items/${rowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          if (previous) {
            setMeetingTemplates((prev) =>
              prev.map((meeting) => {
                if (meeting.id !== meetingId) return meeting
                return {
                  ...meeting,
                  rows: meeting.rows.map((row) =>
                    row.id === rowId
                      ? {
                          ...row,
                          day: previous.day,
                          topic: previous.topic,
                          owner: previous.owner,
                          time: previous.time,
                        }
                      : row
                  ),
                }
              })
            )
          }
        }
      } catch (err) {
        if (previous) {
          setMeetingTemplates((prev) =>
            prev.map((meeting) => {
              if (meeting.id !== meetingId) return meeting
              return {
                ...meeting,
                rows: meeting.rows.map((row) =>
                  row.id === rowId
                    ? {
                        ...row,
                        day: previous.day,
                        topic: previous.topic,
                        owner: previous.owner,
                        time: previous.time,
                      }
                    : row
                ),
              }
            })
          )
        }
      }
    },
    [apiFetch, editDraft, meetingTemplates]
  )

  const resequenceMeetingRows = React.useCallback(
    async (meetingId: string, rowsOverride?: MeetingRow[]) => {
      const meeting = meetingTemplates.find((template) => template.id === meetingId)
      const rows = rowsOverride || meeting?.rows || []
      if (!rows.length) return
      const sortedRows = rows.slice().sort((a, b) => a.nr - b.nr || a.id.localeCompare(b.id))
      const resequencedRows = sortedRows.map((row, index) => ({
        ...row,
        nr: index + 1,
      }))
      const updates = resequencedRows
        .map((row) => ({ row, nextNr: row.nr }))
        .filter(({ row, nextNr }) => (rows.find((r) => r.id === row.id)?.nr ?? 0) !== nextNr)
      if (!updates.length) return

      setMeetingTemplates((prev) =>
        prev.map((template) => {
          if (template.id !== meetingId) return template
          if (rowsOverride) {
            return { ...template, rows: resequencedRows }
          }
          const updatedRows = template.rows.map((row) => {
            const next = updates.find((entry) => entry.row.id === row.id)
            return next ? { ...row, nr: next.nextNr } : row
          })
          return { ...template, rows: updatedRows }
        })
      )

      try {
        await Promise.all(
          updates.map(({ row, nextNr }) =>
            apiFetch(`/checklist-items/${row.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ position: nextNr }),
            })
          )
        )
      } catch (err) {
        console.error("Failed to resequence meeting items", err)
      }
    },
    [apiFetch, meetingTemplates]
  )

  const deleteMeetingRow = React.useCallback(
    async (meetingId: string, rowId: string) => {
      const confirmed = window.confirm(
        "Delete this checklist item? This action cannot be undone."
      )
      if (!confirmed) return
      const previousRows = meetingTemplates.find((meeting) => meeting.id === meetingId)?.rows || []
      setMeetingTemplates((prev) =>
        prev.map((meeting) => {
          if (meeting.id !== meetingId) return meeting
          return {
            ...meeting,
            rows: meeting.rows.filter((row) => row.id !== rowId),
          }
        })
      )
      try {
        const res = await apiFetch(`/checklist-items/${rowId}`, {
          method: "DELETE",
        })
        if (!res.ok) {
          setMeetingTemplates((prev) =>
            prev.map((meeting) => {
              if (meeting.id !== meetingId) return meeting
              return {
                ...meeting,
                rows: previousRows,
              }
            })
          )
          return
        }
        const remainingRows = previousRows.filter((row) => row.id !== rowId)
        await resequenceMeetingRows(meetingId, remainingRows)
      } catch (err) {
        setMeetingTemplates((prev) =>
          prev.map((meeting) => {
            if (meeting.id !== meetingId) return meeting
            return {
              ...meeting,
              rows: previousRows,
            }
          })
        )
      }
    },
    [apiFetch, meetingTemplates, resequenceMeetingRows]
  )

  const addMeetingRow = React.useCallback(
    async (meetingId: string) => {
      const topic = addDraft.topic.trim().toUpperCase()
      if (!topic) return
      const meeting = meetingTemplates.find((template) => template.id === meetingId)
      if (!meeting) return
      const parsedNr = Number(addDraft.nr)
      const requestedNr = Number.isFinite(parsedNr) && parsedNr > 0 ? Math.floor(parsedNr) : null
      const nextPosition =
        requestedNr || Math.max(0, ...meeting.rows.map((row) => row.nr || 0)) + 1
      const payload = {
        checklist_id: meetingId,
        item_type: "CHECKBOX",
        position: nextPosition,
        title: topic,
        day: addDraft.day.trim() || null,
        owner: null,
        time: null,
        is_checked: false,
      }
      try {
        const res = await apiFetch("/checklist-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) return
        const created = await res.json()
        const createdRow: MeetingRow = {
          id: created.id,
          nr: requestedNr || created.position || nextPosition,
          day: created.day || undefined,
          topic: created.title || topic,
          owner: created.owner || undefined,
          time: created.time || undefined,
          isChecked: created.is_checked ?? false,
        }
        const baseRows = meeting?.rows || []
        const nextRows = requestedNr
          ? baseRows.map((row) =>
              row.nr >= requestedNr ? { ...row, nr: row.nr + 1 } : row
            ).concat(createdRow)
          : baseRows.concat(createdRow)
        setMeetingTemplates((prev) =>
          prev.map((template) => {
            if (template.id !== meetingId) return template
            return {
              ...template,
              rows: nextRows,
            }
          })
        )
        setAddDraft({ nr: "", day: "", topic: "", owner: "", time: "" })
        await resequenceMeetingRows(meetingId, nextRows)
      } catch (err) {
        console.error("Failed to add meeting item", err)
      }
    },
    [addDraft, apiFetch, meetingTemplates, resequenceMeetingRows]
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#ffffff" }}>
      <style>{`
        * { box-sizing: border-box; }
        :root {
          --swim-border: #d7dbe3;
          --swim-text: #0f172a;
          --swim-muted: #6b7280;
          --delay-bg: #fff4e6;
          --delay-accent: #f59e0b;
          --absence-bg: #ffe9e9;
          --absence-accent: #ef4444;
          --leave-bg: #e9f9ef;
          --leave-accent: #22c55e;
          --blocked-bg: #ffe7ea;
          --blocked-accent: #be123c;
          --oneh-bg: #e0f2fe;
          --oneh-accent: #0ea5e9;
          --personal-bg: #f3e8ff;
          --personal-accent: #a855f7;
          --external-bg: #e0f2fe;
          --external-accent: #0284c7;
          --internal-bg: #f1f5f9;
          --internal-accent: #475569;
          --bz-bg: #e6fffb;
          --bz-accent: #14b8a6;
          --r1-bg: #dcfce7;
          --r1-accent: #16a34a;
          --problem-bg: #ecfeff;
          --problem-accent: #0891b2;
          --feedback-bg: #e2e8f0;
          --feedback-accent: #64748b;
          --priority-bg: #fef3c7;
          --priority-accent: #d97706;
          --cell-bg: #ffffff;
          --cell-tint: #f9fafb;
          --swim-col-width: 280px;
        }
        
        /* Modern Header */
        .common-sticky {
          position: sticky;
          top: 0;
          z-index: 20;
          background: #ffffff;
        }
        .top-header { 
          background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
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
        
        /* Modern Buttons */
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

        /* Button style for light panels (dark text on light background) */
        .btn-surface {
          background: #f8fafc;
          color: #0f172a;
          border: 1px solid #cbd5e1;
          padding: 8px 12px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-surface:hover:not(:disabled) {
          background: #f1f5f9;
          border-color: #94a3b8;
        }
        .btn-surface:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .external-checklist-media {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #ffffff;
          padding: 10px;
          margin-bottom: 12px;
        }
        .external-checklist-media-title {
          font-size: 12px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 8px;
        }
        .external-checklist-media img {
          width: 100%;
          height: auto;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          display: block;
          background: #f8fafc;
        }
        .external-checklist-media-hint {
          font-size: 12px;
          color: #64748b;
          margin-top: 8px;
          line-height: 1.4;
        }

        .no-print { display: inline-flex; }
        .hide-in-print { display: none !important; }
        .hide-when-all-days { display: none !important; }
        .print-header,
        .print-footer {
          display: none;
        }
        @media print {
          @page {
            margin: 0.45in 0.35in 0.51in 0.35in;
            size: landscape;
          }
          .no-print { display: none !important; }
          .hide-in-print { display: none !important; }
          .swimlane-delete { display: none !important; }
          .week-table-delete { display: none !important; }
          aside, header, .command-palette, .top-header, .common-toolbar, .meeting-panel, .modal {
            display: none !important;
          }
          *, *::before, *::after { 
            box-sizing: border-box;
          }
          body, html { 
            background: white;
            margin: 0;
            padding: 0;
            width: 100%;
            overflow: visible;
          }
          main { 
            padding: 0 !important;
            margin: 0 !important;
          }
          .view-container { 
            padding: 0 !important;
            margin: 0 !important;
            background: white;
            overflow: visible !important;
          }
          .print-page {
            position: relative;
            padding-top: 0;
            padding-bottom: 0.35in;
            margin: 0;
            width: 100%;
            max-width: 100%;
            overflow: visible;
            page-break-before: auto;
          }
          .week-table-view { 
            display: block !important; 
            padding-top: 0;
            padding-bottom: 0.35in; 
            margin: 0;
            width: 100%;
            max-width: 100%;
            overflow: visible;
            page-break-before: auto;
          }
          .print-header {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            margin-bottom: 8px;
            margin-top: 0;
            padding-top: 0;
            position: static !important;
            transform: none !important;
            page-break-after: avoid;
          }
          .week-table {
            page-break-inside: avoid;
            margin-top: 0;
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
          .print-footer {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0.2in;
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
          .print-initials {
            grid-column: 3;
            text-align: right;
          }
          .swimlane-board { gap: 12px; }
          .swimlane-row { break-inside: avoid; page-break-inside: avoid; }
          .swimlane-row-nav { display: none !important; }
          .swimlane-content-scroll { overflow: visible !important; padding-right: 0; }
          .swimlane-content {
            grid-auto-flow: row !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            grid-auto-columns: auto !important;
            min-width: 0 !important;
            width: 100% !important;
          }
          .swimlane-board {
            border: 1px solid #111827 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          .swimlane-row + .swimlane-row {
            border-top: 2px solid #111827 !important;
          }
          .swimlane-row {
            margin-top: 6px;
          }
            .swimlane-header,
            .swimlane-cell {
              padding-top: 18px;
              padding-bottom: 18px;
            }
            .swimlane-cell {
              background: #ffffff !important;
              color: #111827 !important;
              position: relative !important;
              padding-right: 60px !important;
              overflow: visible !important;
              min-width: 0 !important;
            }
          .swimlane-header,
          .swimlane-badge {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .swimlane-header.delay { background: var(--delay-bg) !important; color: #c2410c !important; }
          .swimlane-header.absence { background: var(--absence-bg) !important; color: #b91c1c !important; }
          .swimlane-header.leave { background: var(--leave-bg) !important; color: #15803d !important; }
          .swimlane-header.blocked { background: var(--blocked-bg) !important; color: #9f1239 !important; }
          .swimlane-header.oneh { background: var(--oneh-bg) !important; color: #0369a1 !important; }
          .swimlane-header.personal { background: var(--personal-bg) !important; color: #7e22ce !important; }
          .swimlane-header.external { background: var(--external-bg) !important; color: #0369a1 !important; }
          .swimlane-header.internal { background: var(--internal-bg) !important; color: #334155 !important; }
          .swimlane-header.bz { background: var(--bz-bg) !important; color: #0f766e !important; }
          .swimlane-header.r1 { background: var(--r1-bg) !important; color: #15803d !important; }
          .swimlane-header.problem { background: var(--problem-bg) !important; color: #0e7490 !important; }
          .swimlane-header.feedback { background: var(--feedback-bg) !important; color: #475569 !important; }
          .swimlane-header.priority { background: var(--priority-bg) !important; color: #b45309 !important; }
          .swimlane-badge.delay { border-color: var(--delay-accent) !important; color: #c2410c !important; }
          .swimlane-badge.absence { border-color: var(--absence-accent) !important; color: #b91c1c !important; }
          .swimlane-badge.leave { border-color: var(--leave-accent) !important; color: #15803d !important; }
          .swimlane-badge.blocked { border-color: var(--blocked-accent) !important; color: #9f1239 !important; }
          .swimlane-badge.oneh { border-color: var(--oneh-accent) !important; color: #0369a1 !important; }
          .swimlane-badge.personal { border-color: var(--personal-accent) !important; color: #7e22ce !important; }
          .swimlane-badge.external { border-color: var(--external-accent) !important; color: #0369a1 !important; }
          .swimlane-badge.internal { border-color: var(--internal-accent) !important; color: #334155 !important; }
          .swimlane-badge.bz { border-color: var(--bz-accent) !important; color: #0f766e !important; }
          .swimlane-badge.r1 { border-color: var(--r1-accent) !important; color: #15803d !important; }
          .swimlane-badge.problem { border-color: var(--problem-accent) !important; color: #0e7490 !important; }
          .swimlane-badge.feedback { border-color: var(--feedback-accent) !important; color: #475569 !important; }
          .swimlane-badge.priority { border-color: var(--priority-accent) !important; color: #b45309 !important; }
          .swimlane-header,
          .swimlane-cell {
            border-color: #111827 !important;
          }
            .swimlane-title-row {
              display: flex !important;
              flex-direction: column !important;
              align-items: flex-start !important;
              gap: 6px !important;
              width: 100% !important;
              padding-right: 0 !important;
            }
            .swimlane-title {
              flex: 1 1 auto !important;
              min-width: 0 !important;
              width: 100% !important;
            }
            .swimlane-date {
              font-size: 12px !important;
              color: var(--swim-muted) !important;
              line-height: 1.2 !important;
            }
            .swimlane-assignees {
              display: flex !important;
              gap: 6px !important;
              flex-wrap: wrap !important;
              align-items: center !important;
              justify-content: flex-start !important;
              margin-left: 0 !important;
              flex-shrink: 0 !important;
              z-index: 2 !important;
            }
            .swimlane-avatar {
              display: inline-flex !important;
              align-items: center !important;
              justify-content: center !important;
              min-width: 24px !important;
              height: 20px !important;
              padding: 0 5px !important;
              font-size: 9px !important;
              line-height: 1 !important;
              white-space: nowrap !important;
              word-break: keep-all !important;
              overflow-wrap: normal !important;
              flex-shrink: 0 !important;
            }
          }
        
        /* View Container */
        .view-container { 
          padding: 16px 24px; 
          overflow: visible; 
          flex-grow: 1; 
          min-height: 0;
          background: linear-gradient(to bottom, #f8f9fa 0%, #ffffff 100%);
        }
        .meeting-panel {
          margin: 16px 24px 0;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 16px 18px;
          box-shadow: 0 10px 20px rgba(15, 23, 42, 0.06);
        }
        .external-meetings-panel {
          margin-top: 12px;
        }
        .meeting-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .meeting-title {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
        }
        .meeting-subtitle {
          font-size: 12px;
          color: #64748b;
          margin-top: 2px;
        }
        .meeting-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 12px;
        }
        .meeting-dropdown {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 220px;
        }
        .meeting-dropdown label {
          font-size: 12px;
          font-weight: 700;
          color: #475569;
        }
        .meeting-dropdown select {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px 10px;
          background: #ffffff;
          color: #0f172a;
          font-size: 12px;
          font-weight: 600;
        }
        .meeting-chip {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          color: #334155;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .meeting-chip.active {
          background: #2563eb;
          border-color: #2563eb;
          color: #ffffff;
        }
        .meeting-table-card {
          margin-top: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
          background: #ffffff;
        }
        .meeting-table-header {
          padding: 10px 12px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .meeting-table-title {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
        }
        .meeting-table-meta {
          font-size: 12px;
          color: #64748b;
        }
        .meeting-note {
          padding: 8px 10px;
          background: #fff1f2;
          color: #b91c1c;
          font-size: 12px;
          font-weight: 700;
          border-bottom: 1px solid #fecdd3;
        }
        .meeting-table-wrap {
          overflow-x: auto;
        }
        .meeting-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .external-meetings-grid {
          display: grid;
          /* Make the left panel wider so checklist titles have room */
          grid-template-columns: minmax(360px, 640px) minmax(0, 1fr);
          gap: 16px;
          margin-top: 14px;
        }
        .external-meeting-form-title {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 8px;
        }
        .external-meeting-fields {
          display: grid;
          gap: 10px;
        }
        .external-meeting-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .external-meeting-hint {
          font-size: 12px;
          color: #64748b;
        }
        .external-meeting-cards {
          display: grid;
          gap: 10px;
        }
        .external-meeting-card {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 10px 12px;
          background: #ffffff;
          box-shadow: 0 6px 14px rgba(15, 23, 42, 0.04);
        }
        .external-meeting-title {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
        }
        .external-meeting-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 12px;
          font-size: 12px;
          color: #64748b;
          margin-top: 4px;
        }
        .external-meeting-empty {
          border: 1px dashed #cbd5e1;
          border-radius: 12px;
          padding: 12px;
          font-size: 12px;
          color: #94a3b8;
        }
        @media (max-width: 900px) {
          .external-meetings-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 720px) {
          .external-meeting-row {
            grid-template-columns: 1fr;
          }
        }
        .meeting-table th {
          background: #e2e8f0;
          text-align: left;
          padding: 8px 10px;
          font-weight: 700;
          color: #1f2937;
          border-bottom: 1px solid #cbd5e1;
          white-space: nowrap;
        }
        .meeting-table td {
          border-top: 1px solid #e2e8f0;
          padding: 8px 10px;
          vertical-align: top;
          color: #0f172a;
          white-space: nowrap;
        }
        .meeting-check-cell {
          text-align: center;
          vertical-align: middle;
        }
        .meeting-check-cell input {
          accent-color: #64748b;
          width: 16px;
          height: 16px;
        }
        .btn-icon {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #475569;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .btn-icon:hover {
          background: #f1f5f9;
          color: #334155;
        }
        .btn-icon.danger {
          color: #b91c1c;
          border-color: #fecaca;
          background: #fff1f2;
        }
        .btn-icon.danger:hover {
          background: #ffe4e6;
          color: #991b1b;
        }
        .meeting-owner-cell {
          text-align: center;
          font-weight: 600;
          color: #1f2937;
        }
        .meeting-empty {
          margin-top: 12px;
          font-size: 12px;
          color: #94a3b8;
        }

        .swimlane-board {
          border: 1px solid var(--swim-border);
          border-radius: 12px;
          overflow: hidden;
          background: #ffffff;
          box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
          width: 100%;
        }
        .swimlane-row {
          display: flex;
        }
        .swimlane-row + .swimlane-row {
          border-top: 1px solid var(--swim-border);
        }
        .swimlane-header {
          width: 150px;
          padding: 10px 10px;
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          column-gap: 8px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.2px;
          border-right: 1px solid var(--swim-border);
          color: var(--swim-text);
          line-height: 1.1;
          font-size: 12px;
          word-break: break-word;
          background: #f8f9fa;
        }
        .swimlane-badge {
          min-width: 24px;
          height: 24px;
          padding: 0 6px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          border: 1px solid rgba(15, 23, 42, 0.12);
        }
        .swimlane-content-shell {
          position: relative;
          flex: 1;
          min-width: 0;
        }
        .swimlane-row-nav {
          position: absolute;
          top: 8px;
          right: 8px;
          display: flex;
          gap: 4px;
          z-index: 10;
        }
        .swimlane-row-nav button {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #64748b;
          border-radius: 8px;
          width: 24px;
          height: 24px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: none;
          font-size: 12px;
          opacity: 0.75;
          transition: all 0.2s ease;
        }
        .swimlane-row-nav button:hover {
          color: #334155;
          background: #e2e8f0;
          opacity: 1;
        }
        .swimlane-content-scroll {
          overflow-x: auto;
          padding-bottom: 6px;
          scroll-behavior: smooth;
          scrollbar-gutter: stable;
          padding-right: 70px;
          scrollbar-width: none;
          -ms-overflow-style: none;
          position: relative;
          z-index: 1;
        }
        .swimlane-content-scroll::-webkit-scrollbar {
          display: none;
        }
        .swimlane-content {
          flex: 1;
          display: grid;
          grid-template-columns: repeat(3, var(--swim-col-width));
          grid-auto-flow: column;
          grid-auto-columns: var(--swim-col-width);
          min-width: calc(var(--swim-col-width) * 3);
          width: max-content;
        }
        .swimlane-delete {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 22px;
          height: 22px;
          border-radius: 8px;
          background: #ffffff;
          color: #dc2626;
          border: 1px solid #e2e8f0;
          font-weight: 900;
          line-height: 1;
          cursor: pointer;
          box-shadow: none;
          transition: transform 0.1s ease, box-shadow 0.2s ease, background 0.2s ease;
        }
        .swimlane-delete:hover {
          transform: translateY(-1px);
          background: #fee2e2;
          border-color: #fecaca;
        }
        .swimlane-delete:active {
          transform: translateY(0);
          box-shadow: none;
        }
        .swimlane-cell {
          padding: 12px 44px 12px 14px;
          border-right: 1px solid var(--swim-border);
          border-bottom: 1px solid var(--swim-border);
          min-height: 68px;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          gap: 4px;
          color: var(--swim-text);
          background: linear-gradient(180deg, var(--cell-bg) 0%, var(--cell-tint) 100%);
          position: relative;
        }
        .swimlane-cell:nth-child(3n) {
          border-right: 0;
        }
        .swimlane-cell.empty {
          background: #ffffff;
        }
        .swimlane-cell.placeholder {
          color: var(--swim-muted);
          font-style: italic;
        }
        .swimlane-title-row {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
          width: 100%;
          padding-right: 0;
        }
        .swimlane-title {
          flex: 1 1 auto;
          min-width: 0;
          font-weight: 700;
          font-size: 14px;
          width: 100%;
        }
        .swimlane-date {
          font-size: 12px;
          color: var(--swim-muted);
          line-height: 1.2;
        }
        .swimlane-subtitle {
          font-size: 12px;
          color: var(--swim-muted);
        }
        .swimlane-delete {
          position: absolute;
          top: 6px;
          right: 6px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #dc2626;
          width: 22px;
          height: 22px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          opacity: 0.9;
          transition: all 0.2s ease;
        }
        .swimlane-delete:hover {
          background: #fee2e2;
          border-color: #fecaca;
          opacity: 1;
        }
        .swimlane-assignees {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          justify-content: flex-start;
          margin-left: 0;
          z-index: 2;
        }
        .swimlane-avatar {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 24px;
          height: 24px;
          padding: 0 6px;
          border-radius: 999px;
          background: #e2e8f0;
          color: #0f172a;
          font-weight: 700;
          font-size: 10px;
          letter-spacing: 0.02em;
          border: 1px solid #cbd5e1;
          line-height: 1;
          white-space: nowrap;
          word-break: keep-all;
          overflow-wrap: normal;
          position: relative;
          z-index: 1;
        }
        
        /* Week Table View - Shows when all days are selected */
        .week-table-view {
          display: block;
          width: 100%;
          margin-bottom: 20px;
        }
        .week-table {
          width: 100%;
          border-collapse: collapse;
          border: 2px solid #111827;
          font-size: 11px;
          direction: ltr;
        }
        .week-table th {
          border: 1px solid #111827;
          background: #dbeafe;
          padding: 8px 6px;
          text-align: left;
          font-weight: 700;
          vertical-align: bottom;
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .week-table thead tr:first-child th {
          border-top-width: 2px;
        }
        .week-table thead tr:last-child th {
          border-bottom-width: 2px;
        }
        .week-table thead th:first-child {
          border-left-width: 2px;
        }
        .week-table thead th:last-child {
          border-right-width: 2px;
        }
        .week-table thead tr:nth-child(2) th {
          top: 30px;
          z-index: 1;
        }
        .week-table-date-header {
          background: #bfdbfe !important;
          font-size: 10px;
        }
        .week-table-subheader {
          background: #dbeafe !important;
          font-size: 9px;
          font-weight: 600;
        }
        .week-table td {
          border: 1px solid #dee2e6;
          padding: 6px 8px;
          vertical-align: bottom;
          font-size: 10px;
          text-align: left;
        }
        .week-table-number {
          text-align: center;
          font-weight: 700;
          background: #f8f9fa;
        }
        .week-table-label {
          font-weight: 700;
          background: #f8f9fa;
        }
        .week-table-row.delay .week-table-label {
          background: var(--delay-bg);
        }
        .week-table-row.absence .week-table-label {
          background: var(--absence-bg);
        }
        .week-table-row.leave .week-table-label {
          background: var(--leave-bg);
        }
        .week-table-row.blocked .week-table-label {
          background: var(--blocked-bg);
        }
        .week-table-row.oneh .week-table-label {
          background: var(--oneh-bg);
        }
        .week-table-row.personal .week-table-label {
          background: var(--personal-bg);
        }
        .week-table-row.external .week-table-label {
          background: var(--external-bg);
        }
        .week-table-row.internal .week-table-label {
          background: var(--internal-bg);
        }
        .week-table-row.bz .week-table-label {
          background: var(--bz-bg);
        }
        .week-table-row.r1 .week-table-label {
          background: var(--r1-bg);
        }
        .week-table-row.problem .week-table-label {
          background: var(--problem-bg);
        }
        .week-table-row.feedback .week-table-label {
          background: var(--feedback-bg);
        }
        .week-table-row.priority .week-table-label {
          background: var(--priority-bg);
        }
        .week-table-cell {
          min-height: 30px;
        }
        .week-table-entries {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .week-table-entry {
          font-size: 10px;
          line-height: 1.4;
          display: flex;
          align-items: center;
          gap: 6px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 4px 6px;
          background: #ffffff;
          margin-bottom: 2px;
        }
        .week-table-prjk-divider {
          border-top: 1px solid #64748b;
          margin: 1px 0;
        }
        .week-table-entry span {
          flex: 1;
        }
        .week-table-delete {
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #dc2626;
          width: 18px;
          height: 18px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 12px;
          line-height: 1;
          padding: 0;
        }
        .week-table-delete:hover {
          background: #fee2e2;
          border-color: #fecaca;
        }
        .week-table-avatars {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 2px;
        }
        .week-table-avatar {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: #e2e8f0;
          color: #0f172a;
          font-weight: 700;
          font-size: 9px;
          border: 1px solid #cbd5e1;
        }
        .week-table-empty {
          color: #adb5bd;
          font-style: italic;
        }
        .form-error {
          color: #b91c1c;
          font-size: 12px;
          font-weight: 600;
        }
        @media print {
          .week-table-view {
            display: block !important;
            page-break-inside: avoid;
            page-break-after: auto;
          }
          .week-table-view .print-header {
            page-break-after: avoid;
            margin-bottom: 8px;
          }
          .week-table {
            page-break-inside: avoid;
            table-layout: fixed;
            width: 100%;
            font-size: 9px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            margin-top: 0;
          }
          .week-table thead {
            display: table-header-group;
          }
          .week-table th,
          .week-table td {
            border: 1px solid #111827 !important;
            position: static !important;
            top: auto !important;
            z-index: auto !important;
            padding: 4px 5px;
            white-space: normal;
            overflow-wrap: anywhere;
            word-break: break-word;
          }
          .week-table thead tr:nth-child(2) th {
            top: auto !important;
          }
          .week-table-number {
            width: 36px !important;
          }
          .week-table-label {
            width: 100px !important;
          }
          .week-table-cell,
          .week-table-entry span {
            white-space: normal;
          }
          .week-table-entry {
            border: 1px solid #111827 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            page-break-inside: avoid;
            margin-bottom: 3px;
            font-size: 9px;
            padding: 2px 4px;
          }
          .week-table-entries {
            gap: 2px;
          }
        }
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 999px;
          border: 1px solid var(--swim-border);
          background: #ffffff;
          color: #475569;
          font-size: 10px;
          font-weight: 700;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
        }
        .swimlane-header.delay { background: var(--delay-bg); color: #c2410c; }
        .swimlane-header.absence { background: var(--absence-bg); color: #b91c1c; }
        .swimlane-header.leave { background: var(--leave-bg); color: #15803d; }
        .swimlane-header.blocked { background: var(--blocked-bg); color: #9f1239; }
        .swimlane-header.oneh { background: var(--oneh-bg); color: #0369a1; }
        .swimlane-header.personal { background: var(--personal-bg); color: #7e22ce; }
        .swimlane-header.external { background: var(--external-bg); color: #0369a1; }
        .swimlane-header.internal { background: var(--internal-bg); color: #334155; }
        .swimlane-header.bz { background: var(--bz-bg); color: #0f766e; }
        .swimlane-header.r1 { background: var(--r1-bg); color: #15803d; }
        .swimlane-header.problem { background: var(--problem-bg); color: #0e7490; }
        .swimlane-header.feedback { background: var(--feedback-bg); color: #475569; }
        .swimlane-header.priority { background: var(--priority-bg); color: #b45309; }
        .swimlane-badge.delay { border-color: var(--delay-accent); color: #c2410c; }
        .swimlane-badge.absence { border-color: var(--absence-accent); color: #b91c1c; }
        .swimlane-badge.leave { border-color: var(--leave-accent); color: #15803d; }
        .swimlane-badge.blocked { border-color: var(--blocked-accent); color: #9f1239; }
        .swimlane-badge.oneh { border-color: var(--oneh-accent); color: #0369a1; }
        .swimlane-badge.personal { border-color: var(--personal-accent); color: #7e22ce; }
        .swimlane-badge.external { border-color: var(--external-accent); color: #0369a1; }
        .swimlane-badge.internal { border-color: var(--internal-accent); color: #334155; }
        .swimlane-badge.bz { border-color: var(--bz-accent); color: #0f766e; }
        .swimlane-badge.r1 { border-color: var(--r1-accent); color: #15803d; }
        .swimlane-badge.problem { border-color: var(--problem-accent); color: #0e7490; }
        .swimlane-badge.feedback { border-color: var(--feedback-accent); color: #475569; }
        .swimlane-badge.priority { border-color: var(--priority-accent); color: #b45309; }
        .swimlane-accent.delay { border-left: 4px solid var(--delay-accent); }
        .swimlane-accent.absence { border-left: 4px solid var(--absence-accent); }
        .swimlane-accent.leave { border-left: 4px solid var(--leave-accent); }
        .swimlane-accent.blocked { border-left: 4px solid var(--blocked-accent); }
        .swimlane-accent.oneh { border-left: 4px solid var(--oneh-accent); }
        .swimlane-accent.personal { border-left: 4px solid var(--personal-accent); }
        .swimlane-accent.external { border-left: 4px solid var(--external-accent); }
        .swimlane-accent.internal { border-left: 4px solid var(--internal-accent); }
        .swimlane-accent.bz { border-left: 4px solid var(--bz-accent); }
        .swimlane-accent.r1 { border-left: 4px solid var(--r1-accent); }
        .swimlane-accent.problem { border-left: 4px solid var(--problem-accent); }
        .swimlane-accent.feedback { border-left: 4px solid var(--feedback-accent); }
        .swimlane-accent.priority { border-left: 4px solid var(--priority-accent); }
        
        /* Modern Toolbar */
        .common-toolbar { 
          background: white; 
          padding: 8px 24px; 
          border-bottom: 1px solid #e5e7eb; 
          display: flex; 
          flex-wrap: wrap; 
          gap: 8px; 
          align-items: center; 
          flex-shrink: 0;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        .toolbar-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .toolbar-group .chip-row {
          margin-right: 0;
        }
        
        /* Elegant Chips */
        .chip-row { 
          display: inline-flex; 
          gap: 4px; 
          padding: 4px; 
          background: #f1f5f9; 
          border-radius: 8px; 
          margin-right: 8px; 
        }
        .chip { 
          border: none; 
          padding: 4px 10px; 
          font-size: 11px; 
          border-radius: 6px; 
          cursor: pointer; 
          background: transparent; 
          color: #64748b; 
          font-weight: 600; 
          display: inline-flex; 
          align-items: center; 
          gap: 4px;
          transition: all 0.2s ease;
        }
        .chip:hover { 
          background: #e2e8f0; 
          color: #475569;
        }
        .chip.active { 
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white; 
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
        }
        .day-chip.active {
          background: #2563eb;
          box-shadow: none;
        }
        
        /* Week Navigation Buttons - Different style from day chips */
        .week-nav-buttons {
          display: inline-flex;
          gap: 6px;
          margin-right: 12px;
          align-items: center;
        }
        .week-nav-btn {
          border: 2px solid #cbd5e1;
          padding: 6px 14px;
          font-size: 12px;
          font-weight: 700;
          border-radius: 8px;
          cursor: pointer;
          background: white;
          color: #475569;
          transition: all 0.2s ease;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .week-nav-btn:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
          color: #334155;
        }
        .week-nav-btn.active {
          background: #3b82f6;
          border-color: #3b82f6;
          color: white;
          box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
        }
        
        /* Input & Switch */
        .input { 
          border: 2px solid #e2e8f0; 
          border-radius: 8px; 
          padding: 10px 14px; 
          font-size: 14px; 
          width: 100%;
          transition: all 0.2s ease;
        }
        .input:focus {
          outline: none;
          border-color: #64748b;
          box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.1);
        }
        .switch { 
          display: inline-flex; 
          align-items: center; 
          gap: 8px; 
          font-size: 13px; 
          color: #475569; 
          cursor: pointer;
          font-weight: 500;
        }
        .switch input { 
          width: 18px; 
          height: 18px; 
          accent-color: #64748b; 
        }
        
        /* Modern Badges */
        .badge { 
          padding: 4px 12px; 
          border-radius: 6px; 
          font-size: 11px; 
          font-weight: 700; 
          border: none;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .bg-gray { background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); color: #475569; }
        .bg-blue { background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); color: #1e40af; }
        .bg-red-light { background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); color: #991b1b; }
        .bg-purple { background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%); color: #0369a1; }
        .bg-orange { background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%); color: #9a3412; }
        .bg-green { background: linear-gradient(135deg, #bbf7d0 0%, #86efac 100%); color: #166534; }
        
        /* Elegant Grid */
        .common-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
          gap: 12px; 
          align-content: start; 
        }
        
        /* Beautiful Cards */
        .common-card { 
          background: white; 
          border: none;
          border-radius: 12px; 
          overflow: hidden; 
          display: flex; 
          flex-direction: column; 
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          transition: all 0.3s ease;
        }
        .common-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .common-card-header { 
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
          gap: 8px; 
          padding: 10px 14px; 
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border-bottom: 1px solid #e2e8f0; 
          cursor: pointer; 
          flex-shrink: 0;
          border-radius: 12px 12px 0 0;
          transition: all 0.2s ease;
        }
        .common-card-header:hover { 
          background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
        }
        .common-card-title { 
          font-size: 11px; 
          font-weight: 800; 
          color: #1e293b; 
          text-transform: uppercase; 
          letter-spacing: 0.3px; 
          display: inline-flex; 
          align-items: center; 
          gap: 6px; 
        }
        .common-card-count { 
          padding: 2px 8px; 
          border-radius: 12px; 
          font-size: 10px; 
          font-weight: 800; 
          background: white;
          color: #475569;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }
        .common-card-body { 
          padding: 12px 14px; 
          overflow: visible;
          flex: 1;
          min-height: 0;
        }
        .common-card[data-common-type="ga"] .common-card-body {
          max-height: 320px;
          overflow-y: auto;
        }
        
        /* Elegant List Items */
        .common-list { 
          list-style: none; 
          margin: 0; 
          padding: 0; 
          display: grid; 
          gap: 6px; 
        }
        .common-item { 
          border: 1px solid #e2e8f0; 
          border-radius: 8px; 
          padding: 8px 10px; 
          background: linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%);
          transition: all 0.2s ease;
        }
        .common-item:hover {
          border-color: #cbd5e1;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
        }
        .common-item-title { 
          font-weight: 700; 
          color: #0f172a; 
          font-size: 12px;
          margin-bottom: 4px;
          line-height: 1.3;
        }
        .common-item-meta { 
          margin-top: 4px; 
          font-size: 10px; 
          color: #64748b; 
          display: flex; 
          flex-wrap: wrap; 
          gap: 6px; 
          align-items: center; 
        }
        .common-item-meta b { 
          color: #1e293b; 
          font-weight: 700;
        }
        .common-empty { 
          color: #94a3b8; 
          font-size: 11px; 
          padding: 16px 12px; 
          border: 1px dashed #cbd5e1; 
          border-radius: 8px; 
          background: #f8fafc; 
          text-align: center;
          font-style: italic;
        }
        
        /* Priority Section */
        .common-priority { 
          grid-column: 1 / -1; 
        }
        .common-person-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
          gap: 12px; 
        }
        .common-person { 
          background: white; 
          border: 1px solid #e2e8f0; 
          border-radius: 12px; 
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
          max-height: 100%;
        }
        .common-person:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .common-person-header { 
          padding: 10px 14px; 
          border-bottom: 1px solid #e2e8f0; 
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
          gap: 8px;
          flex-shrink: 0;
        }
        .common-person-name { 
          font-weight: 800; 
          color: #0f172a; 
          font-size: 12px; 
        }
        .common-person-body { 
          padding: 12px 14px;
          overflow-y: auto;
          flex: 1;
          min-height: 0;
        }
        .common-person-body ul { 
          margin: 0; 
          padding-left: 16px; 
          color: #1e293b; 
          font-size: 11px; 
        }
        .common-person-body li { 
          margin-bottom: 6px;
          line-height: 1.4;
        }
        .common-person-body li:last-child { 
          margin-bottom: 0; 
        }
        .common-person-body small { 
          color: #64748b; 
          font-weight: 600; 
          font-size: 10px; 
        }
        
        /* Modern Modal */
        .modal { 
          position: fixed; 
          inset: 0; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          z-index: 9999; 
        }
        .modal.hidden { 
          display: none; 
        }
        .modal-backdrop { 
          position: absolute; 
          inset: 0; 
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
        }
        .modal-card { 
          position: relative; 
          width: min(720px, calc(100vw - 32px)); 
          background: white; 
          border-radius: 20px; 
          border: none;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); 
          overflow: hidden; 
        }
        .modal-header { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          padding: 24px 28px; 
          border-bottom: 2px solid #e2e8f0; 
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        }
        .modal-header h4 { 
          font-size: 18px; 
          color: #0f172a; 
          margin: 0;
          font-weight: 700;
        }
        .modal-body { 
          padding: 28px; 
        }
        .modal-footer { 
          display: flex; 
          justify-content: flex-end; 
          gap: 16px; 
          padding: 24px 28px; 
          border-top: 2px solid #e2e8f0; 
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        }
        .modal-footer .btn-primary {
            background: #2563eb;
            color: white;
            border: none;
            padding: 10px 20px;
            font-size: 14px;
            font-weight: 700;
            border-radius: 8px;
            box-shadow: 0 3px 10px rgba(37, 99, 235, 0.25);
            min-width: 108px;
            transition: all 0.2s ease;
          }
        .modal-footer .btn-primary:hover:not(:disabled) {
          background: #1d4ed8;
          box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
          transform: translateY(-1px);
        }
        .modal-footer .btn-primary:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
        }
        .modal-footer .btn-outline {
            background: white;
            color: #475569;
            border: 1.5px solid #cbd5e1;
            padding: 10px 20px;
            font-size: 14px;
            font-weight: 700;
            border-radius: 8px;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
            min-width: 108px;
            transition: all 0.2s ease;
          }
        .modal-footer .btn-outline:hover:not(:disabled) {
          background: #f8fafc;
          border-color: #94a3b8;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          transform: translateY(-1px);
        }
        .modal-footer .btn-outline:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .btn-primary:disabled,
        .btn-outline:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .form-grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 16px; 
          }
        .form-row { 
          display: flex; 
          flex-direction: column; 
          gap: 8px; 
        }
        .form-row label { 
          font-size: 13px; 
          color: #475569; 
          font-weight: 700; 
        }
        .form-row textarea { 
          min-height: 100px; 
          resize: vertical; 
        }
          .span-2 { 
            grid-column: 1 / -1; 
          }
          .leave-inline {
            display: flex;
            align-items: flex-end;
            gap: 16px;
          }
          .leave-inline .leave-checkbox {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin: 0;
            min-width: 180px;
            font-weight: 600;
          }
          .leave-inline .leave-times {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
            width: 100%;
          }
          .leave-inline .mini-row {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .leave-inline .mini-row label {
            font-size: 13px;
            color: #475569;
            font-weight: 700;
          }
      `}</style>

      <div className="common-sticky">
        <header className="top-header">
          <div className="page-title">
            <h1>Common View</h1>
            <p>Daily/weekly view for key statuses and team priorities.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-outline no-print"
              type="button"
              onClick={handleExportExcel}
              disabled={exportingExcel}
            >
              {exportingExcel ? "Exporting..." : "Export Excel"}
            </button>
            <button className="btn-primary no-print" type="button" onClick={handlePrint}>
              Print
            </button>
            <button
              className={`btn-outline no-print ${meetingPanelOpen ? "active" : ""}`}
              type="button"
              aria-pressed={meetingPanelOpen}
              onClick={() => setMeetingPanelOpen((prev) => !prev)}
            >
              Meeting
            </button>
            <button
              className={`btn-outline no-print ${externalMeetingsOpen ? "active" : ""}`}
              type="button"
              aria-pressed={externalMeetingsOpen}
              onClick={() => setExternalMeetingsOpen((prev) => !prev)}
            >
              External Meetings
            </button>
            <button
              className={`btn-outline no-print ${internalMeetingsOpen ? "active" : ""}`}
              type="button"
              aria-pressed={internalMeetingsOpen}
              onClick={() => setInternalMeetingsOpen((prev) => !prev)}
            >
              Internal Meetings
            </button>
            <button className="btn-outline no-print" type="button" onClick={() => openModal()}>
              + Add
            </button>
          </div>
        </header>

        <div className="common-toolbar no-print">
          <div className="toolbar-group">
            <div className="chip-row">
            {weekISOs.map((iso) => {
              const d = fromISODate(iso)
              const label = `${alWeekdayShort(d)} ${formatDateHuman(iso)}`
              const isActive = selectedDates.has(iso)
              return (
                <button
                  key={iso}
                  className={`chip day-chip ${isActive ? "active" : ""}`}
                  type="button"
                  onClick={() => toggleDay(iso)}
                >
                  {label}
                </button>
              )
            })}
            </div>
            <div className="week-nav-buttons">
              <button className="week-nav-btn" type="button" onClick={selectAll}>
                Select All Days
              </button>
              <button
                className={`week-nav-btn ${toISODate(weekStart) === toISODate(getMonday(new Date())) ? "active" : ""}`}
                type="button"
                onClick={() => {
                  const thisWeekMonday = getMonday(new Date())
                  setWeekStart(thisWeekMonday)
                  setSelectedDates(new Set([toISODate(thisWeekMonday)]))
                }}
              >
                This Week
              </button>
              <button
                className={`week-nav-btn ${toISODate(weekStart) === toISODate(addDays(getMonday(new Date()), 7)) ? "active" : ""}`}
                type="button"
                onClick={() => {
                  const nextWeekMonday = addDays(getMonday(new Date()), 7)
                  setWeekStart(nextWeekMonday)
                  setSelectedDates(new Set([toISODate(nextWeekMonday)]))
                }}
              >
                Next Week
              </button>
            </div>
            <label className="switch" title="When OFF: select only one. When ON: select multiple.">
              <input type="checkbox" checked={multiMode} onChange={(e) => setMultiMode(e.target.checked)} />
              Multi-select (Days)
            </label>
          </div>
          <div className="toolbar-group">
            <div className="chip-row">
            <button
              className={`chip ${typeFilters.size === 0 ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("all")}
            >
              All
            </button>
            <button
              className={`chip ${typeFilters.has("late") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("late")}
            >
              VONS
            </button>
            <button
              className={`chip ${typeFilters.has("absent") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("absent")}
            >
              MUNG
            </button>
            <button
              className={`chip ${typeFilters.has("leave") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("leave")}
            >
              PV/FEST
            </button>
            <button
              className={`chip ${typeFilters.has("external") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("external")}
            >
              TAK EXT
            </button>
            <button
              className={`chip ${typeFilters.has("internal") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("internal")}
            >
              TAK INT
            </button>
            <button
              className={`chip ${typeFilters.has("bz") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("bz")}
            >
              BZ
            </button>
            <button
              className={`chip ${typeFilters.has("blocked") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("blocked")}
            >
              BLL
            </button>
            <button
              className={`chip ${typeFilters.has("oneH") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("oneH")}
            >
              1H
            </button>
            <button
              className={`chip ${typeFilters.has("personal") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("personal")}
            >
              P:
            </button>
            <button
              className={`chip ${typeFilters.has("r1") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("r1")}
            >
              R1
            </button>
            <button
              className={`chip ${typeFilters.has("priority") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("priority")}
            >
              PRJK
            </button>
            <button
              className={`chip ${typeFilters.has("problem") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("problem")}
            >
              PRBL
            </button>
            <button
              className={`chip ${typeFilters.has("feedback") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("feedback")}
            >
              ANK/KRK/PRZ
            </button>
            </div>
            <label className="switch" title="When OFF: select only one. When ON: select multiple.">
              <input type="checkbox" checked={typeMultiMode} onChange={(e) => setTypeMultiMode(e.target.checked)} />
              Multi-select (Types)
            </label>
          </div>
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center", width: "auto" }}>
            <input
              className="input"
              type="text"
              placeholder="DD/MM/YYYY"
              value={toDDMMYYYY(toISODate(weekStart))}
              onChange={(e) => {
                const value = e.target.value
                const isoDate = fromDDMMYYYY(value)
                if (isoDate) {
                  setWeek(isoDate)
                }
              }}
              pattern="\d{2}/\d{2}/\d{4}"
              style={{ width: "140px", paddingRight: "35px" }}
            />
            <input
              type="date"
              value={toISODate(weekStart)}
              onChange={(e) => setWeek(e.target.value)}
              style={{
                position: "absolute",
                right: "8px",
                opacity: 0,
                width: "24px",
                height: "24px",
                cursor: "pointer",
                zIndex: 1
              }}
              title="Open calendar"
            />
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                position: "absolute",
                right: "10px",
                pointerEvents: "none",
                color: "#666"
              }}
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </div>
          <button className="btn-outline" type="button" onClick={selectAll}>
            All days
          </button>
          <button className="btn-outline" type="button" onClick={selectToday}>
            Today
          </button>
        </div>
      </div>

      {meetingPanelOpen ? (
        <section className="meeting-panel">
          <div className="meeting-panel-header">
            <div>
              <div className="meeting-title">Meetings</div>
              <div className="meeting-subtitle">Select a meeting to view the checklist table.</div>
            </div>
            <button className="btn-outline" type="button" onClick={() => setMeetingPanelOpen(false)}>
              Close
            </button>
          </div>
          <div className="meeting-tabs">
            <div className="meeting-dropdown">
              <label htmlFor="meeting-board-ga">BORD/GA</label>
              <select
                id="meeting-board-ga"
                value={boardMeetingIds.includes(activeMeetingId) ? activeMeetingId : ""}
                onChange={(e) => setActiveMeetingId(e.target.value)}
              >
                <option value="" disabled>
                  Select meeting
                </option>
                {meetingTemplates.filter((t) => boardMeetingIds.includes(t.id)).map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="meeting-dropdown">
              <label htmlFor="meeting-staff-ga">STAFF/GA</label>
              <select
                id="meeting-staff-ga"
                value={staffMeetingIds.includes(activeMeetingId) ? activeMeetingId : ""}
                onChange={(e) => setActiveMeetingId(e.target.value)}
              >
                <option value="" disabled>
                  Select meeting
                </option>
                {meetingTemplates.filter((t) => staffMeetingIds.includes(t.id)).map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {activeMeeting ? (
            <div className="meeting-table-card">
              <div className="meeting-table-header">
                {editingMeetingTitle ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                    <input
                      type="text"
                      value={meetingTitleDraft}
                      onChange={(e) => setMeetingTitleDraft(e.target.value)}
                      className="input"
                      style={{ flex: 1, fontSize: "inherit", fontWeight: "inherit" }}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          void saveMeetingTitle()
                        } else if (e.key === "Escape") {
                          cancelEditMeetingTitle()
                        }
                      }}
                    />
                    <button
                      className="btn-primary"
                      type="button"
                      onClick={() => void saveMeetingTitle()}
                      disabled={savingMeetingTitle || !meetingTitleDraft.trim()}
                    >
                      {savingMeetingTitle ? "Saving..." : "Save"}
                    </button>
                    <button className="btn-outline" type="button" onClick={cancelEditMeetingTitle}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div
                    className="meeting-table-title"
                    style={isAdmin ? { cursor: "pointer", userSelect: "none" } : undefined}
                    onClick={isAdmin ? startEditMeetingTitle : undefined}
                    title={isAdmin ? "Click to edit" : undefined}
                  >
                    {activeMeeting.title}
                  </div>
                )}
                {activeMeeting.defaultOwner || activeMeeting.defaultTime ? (
                  <div className="meeting-table-meta">
                    {activeMeeting.defaultOwner ? `WHO: ${activeMeeting.defaultOwner}` : null}
                    {activeMeeting.defaultOwner && activeMeeting.defaultTime ? " | " : null}
                    {activeMeeting.defaultTime ? `WHEN: ${activeMeeting.defaultTime}` : null}
                  </div>
                ) : null}
              </div>
              {activeMeeting.note ? <div className="meeting-note">{activeMeeting.note}</div> : null}
              <div className="meeting-table-wrap">
                <table className="meeting-table">
                  <thead>
                    <tr>
                      {activeMeeting.columns.map((col) => (
                        <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                          {col.label}
                        </th>
                      ))}
                      {isAdmin ? <th style={{ width: "120px" }}>Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {activeMeeting.rows
                      .slice()
                      .sort((a, b) => a.nr - b.nr || a.id.localeCompare(b.id))
                      .map((row, rowIndex) => (
                      <tr key={row.id}>
                        {activeMeeting.columns.map((col) => {
                          let value = ""
                          if (col.key === "nr") value = String(row.nr)
                          if (col.key === "day") value = row.day || ""
                          if (col.key === "topic") value = row.topic
                          if (col.key === "owner") {
                            value = row.owner || (rowIndex === 0 ? activeMeeting.defaultOwner || "" : "")
                          }
                          if (col.key === "time") {
                            value = row.time || (rowIndex === 0 ? activeMeeting.defaultTime || "" : "")
                          }
                          const isEditing = isAdmin && editingRowId === row.id

                          if (col.key === "owner" && mergeOwnerColumn) {
                            if (rowIndex !== 0) return null
                            return (
                              <td
                                key={`${activeMeeting.id}-${row.nr}-${col.key}`}
                                rowSpan={activeMeeting.rows.length}
                                className="meeting-owner-cell"
                                style={col.width ? { width: col.width } : undefined}
                              >
                                {value}
                              </td>
                            )
                          }

                          if (col.key === "check") {
                            return (
                              <td key={`${activeMeeting.id}-${row.nr}-${col.key}`} className="meeting-check-cell">
                                <input
                                  type="checkbox"
                                  aria-label={`Mark ${row.topic}`}
                                  checked={Boolean(row.isChecked)}
                                  onChange={(e) => toggleMeetingItem(activeMeeting.id, row.id, e.target.checked)}
                                />
                              </td>
                            )
                          }

                          if (col.key === "topic") {
                            return (
                              <td key={`${activeMeeting.id}-${row.nr}-${col.key}`} style={col.width ? { width: col.width } : undefined}>
                                {isEditing ? (
                                  <input
                                    className="input"
                                    type="text"
                                    value={editDraft.topic}
                                    onChange={(e) => setEditDraft((prev) => ({ ...prev, topic: e.target.value.toUpperCase() }))}
                                    style={{ textTransform: "uppercase" }}
                                  />
                                ) : (
                                  value
                                )}
                              </td>
                            )
                          }

                          if (col.key === "day") {
                            return (
                              <td key={`${activeMeeting.id}-${row.nr}-${col.key}`} style={col.width ? { width: col.width } : undefined}>
                                {isEditing ? (
                                  <input
                                    className="input"
                                    type="text"
                                    value={editDraft.day}
                                    onChange={(e) => setEditDraft((prev) => ({ ...prev, day: e.target.value }))}
                                  />
                                ) : (
                                  value
                                )}
                              </td>
                            )
                          }

                          if (col.key === "owner") {
                            return (
                              <td key={`${activeMeeting.id}-${row.nr}-${col.key}`} style={col.width ? { width: col.width } : undefined}>
                                {isEditing ? (
                                  <input
                                    className="input"
                                    type="text"
                                    value={editDraft.owner}
                                    onChange={(e) => setEditDraft((prev) => ({ ...prev, owner: e.target.value }))}
                                  />
                                ) : (
                                  value
                                )}
                              </td>
                            )
                          }

                          if (col.key === "time") {
                            return (
                              <td key={`${activeMeeting.id}-${row.nr}-${col.key}`} style={col.width ? { width: col.width } : undefined}>
                                {isEditing ? (
                                  <input
                                    className="input"
                                    type="text"
                                    value={editDraft.time}
                                    onChange={(e) => setEditDraft((prev) => ({ ...prev, time: e.target.value }))}
                                  />
                                ) : (
                                  value
                                )}
                              </td>
                            )
                          }

                          return (
                            <td key={`${activeMeeting.id}-${row.nr}-${col.key}`} style={col.width ? { width: col.width } : undefined}>
                              {value}
                            </td>
                          )
                        })}
                        {isAdmin ? (
                          <td>
                            {editingRowId === row.id ? (
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button className="btn-primary" type="button" onClick={() => saveMeetingRow(activeMeeting.id, row.id)}>
                                  Save
                                </button>
                                <button className="btn-outline" type="button" onClick={cancelEditMeetingRow}>
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button className="btn-icon" type="button" onClick={() => startEditMeetingRow(row)} aria-label="Edit row">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path
                                      d="M4 20h4l10.5-10.5a2.121 2.121 0 0 0-3-3L5 17v3z"
                                      stroke="currentColor"
                                      strokeWidth="1.6"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </button>
                                <button
                                  className="btn-icon danger"
                                  type="button"
                                  onClick={() => deleteMeetingRow(activeMeeting.id, row.id)}
                                  aria-label="Delete row"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path
                                      d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"
                                      stroke="currentColor"
                                      strokeWidth="1.6"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isAdmin ? (
                <div style={{ padding: "12px", borderTop: "1px solid #e2e8f0" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr)) auto", gap: "8px" }}>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      placeholder="Nr"
                      value={addDraft.nr}
                      onChange={(e) => setAddDraft((prev) => ({ ...prev, nr: e.target.value }))}
                    />
                    {activeMeeting.columns.some((col) => col.key === "day") ? (
                      <input
                        className="input"
                        type="text"
                        placeholder="Day"
                        value={addDraft.day}
                        onChange={(e) => setAddDraft((prev) => ({ ...prev, day: e.target.value }))}
                      />
                    ) : (
                      <span />
                    )}
                    <input
                      className="input"
                      type="text"
                      placeholder="Topic"
                      value={addDraft.topic}
                      onChange={(e) => setAddDraft((prev) => ({ ...prev, topic: e.target.value.toUpperCase() }))}
                      style={{ textTransform: "uppercase" }}
                    />
                    <button className="btn-primary" type="button" onClick={() => addMeetingRow(activeMeeting.id)}>
                      Add meeting point
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="meeting-empty">No meeting selected.</div>
          )}
        </section>
      ) : null}

      {externalMeetingsOpen ? (
        <section className="meeting-panel external-meetings-panel">
          <div className="meeting-panel-header">
            <div>
              <div className="meeting-title">External Meetings</div>
              <div className="meeting-subtitle">Show all external meetings and add new ones.</div>
            </div>
            <button className="btn-outline" type="button" onClick={() => setExternalMeetingsOpen(false)}>
              Close
            </button>
          </div>
          <div className="external-meetings-grid">
            <div className="external-meeting-form">
              <div className="external-meeting-form-title">Add meeting</div>
              <div className="external-meeting-fields">
                <input
                  className="input"
                  type="text"
                  placeholder="Meeting title"
                  value={externalMeetingTitle}
                  onChange={(e) => setExternalMeetingTitle(e.target.value)}
                />
                <div className="external-meeting-row">
                  <input
                    className="input"
                    type="text"
                    placeholder="Platform (Zoom, Meet, Office...)"
                    value={externalMeetingPlatform}
                    onChange={(e) => setExternalMeetingPlatform(e.target.value)}
                  />
                  {externalMeetingRecurrenceType === "none" ? (
                    <input
                      className="input"
                      type="datetime-local"
                      value={externalMeetingStartsAt}
                      onChange={(e) => setExternalMeetingStartsAt(e.target.value)}
                    />
                  ) : (
                    <input
                      className="input"
                      type="time"
                      value={externalMeetingStartTime}
                      onChange={(e) => setExternalMeetingStartTime(e.target.value)}
                    />
                  )}
                </div>
                <div className="external-meeting-row">
                  <select
                    className="input"
                    value={externalMeetingRecurrenceType}
                    onChange={(e) => setExternalMeetingRecurrenceType(e.target.value as "none" | "weekly" | "monthly" | "yearly")}
                  >
                    <option value="none">One time</option>
                    <option value="weekly">Every week</option>
                    <option value="monthly">Every month</option>
                    <option value="yearly">Every year</option>
                  </select>
                </div>
                {externalMeetingRecurrenceType === "weekly" ? (
                  <>
                    <div className="external-meeting-row" style={{ justifyContent: "flex-start" }}>
                      <button
                        className="btn-surface"
                        type="button"
                        onClick={() => setShowWeekendDays((prev) => !prev)}
                        style={{
                          padding: "4px 10px",
                          fontSize: "12px",
                          fontWeight: 600,
                          backgroundColor: showWeekendDays ? "#1d4ed8" : "#eef2ff",
                          borderColor: "#3b82f6",
                          color: showWeekendDays ? "#ffffff" : "#1d4ed8",
                        }}
                      >
                        {showWeekendDays ? "Hide weekend days" : "Show weekend days"}
                      </button>
                    </div>
                    <div className="external-meeting-row" style={{ flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                      {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                        .map((day, idx) => ({ day, idx }))
                        .filter(({ idx }) => showWeekendDays || idx < 5)
                        .map(({ day, idx }) => (
                          <label key={day} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                            <input
                              type="checkbox"
                              checked={externalMeetingRecurrenceDaysOfWeek.includes(idx)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setExternalMeetingRecurrenceDaysOfWeek((prev) => [...prev, idx])
                                } else {
                                  setExternalMeetingRecurrenceDaysOfWeek((prev) => prev.filter((d) => d !== idx))
                                }
                              }}
                            />
                            {day}
                          </label>
                        ))}
                    </div>
                  </>
                ) : null}
                {externalMeetingRecurrenceType === "monthly" ? (
                  <div
                    className="external-meeting-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                      gap: "6px",
                    }}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <label
                        key={day}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "12px",
                          padding: "4px 6px",
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          backgroundColor: externalMeetingRecurrenceDaysOfMonth.includes(day) ? "#eef2ff" : "#ffffff",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={externalMeetingRecurrenceDaysOfMonth.includes(day)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setExternalMeetingRecurrenceDaysOfMonth((prev) => [...prev, day])
                            } else {
                              setExternalMeetingRecurrenceDaysOfMonth((prev) => prev.filter((d) => d !== day))
                            }
                          }}
                        />
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{day}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
                {externalMeetingRecurrenceType === "yearly" ? (
                  <div className="external-meeting-row" style={{ gap: "8px" }}>
                    <select
                      className="input"
                      value={externalMeetingRecurrenceMonth}
                      onChange={(e) => setExternalMeetingRecurrenceMonth(e.target.value)}
                    >
                      {[
                        "January",
                        "February",
                        "March",
                        "April",
                        "May",
                        "June",
                        "July",
                        "August",
                        "September",
                        "October",
                        "November",
                        "December",
                      ].map((label, idx) => (
                        <option key={label} value={String(idx + 1)}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input"
                      value={externalMeetingRecurrenceDay}
                      onChange={(e) => setExternalMeetingRecurrenceDay(e.target.value)}
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <option key={day} value={String(day)}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="external-meeting-row">
                  <select
                    className="input"
                    value={externalMeetingDepartmentId}
                    onChange={(e) => setExternalMeetingDepartmentId(e.target.value)}
                    disabled={!canSelectExternalDepartment}
                  >
                    <option value="">
                      {canSelectExternalDepartment ? "Select department" : "Department"}
                    </option>
                    {departments.map((dep) => (
                      <option key={dep.id} value={dep.id}>
                        {dep.name === "Project Content Manager" ? "Product Content" : dep.name}
                      </option>
                    ))}
                  </select>
                </div>
                {!canSelectExternalDepartment && externalMeetingDepartment ? (
                  <div className="external-meeting-hint">
                    Department: {externalMeetingDepartment.name === "Project Content Manager" ? "Product Content" : externalMeetingDepartment.name}
                  </div>
                ) : null}
                <div style={{ marginTop: "16px" }}>
                  <button
                    className="btn-surface"
                    type="button"
                    onClick={() => setExternalMeetingChecklistOpen((prev) => !prev)}
                    disabled={externalMeetingChecklistLoading}
                    style={{ width: "100%", marginBottom: externalMeetingChecklistOpen ? "12px" : "0" }}
                  >
                    {externalMeetingChecklistLoading
                      ? "Loading Checklist..."
                      : externalMeetingChecklistOpen
                        ? "Hide Checklist"
                        : "Show Checklist"}
                    {/* Checklist is optional for creating meetings; no blocking warning here. */}
                  </button>
                  {externalMeetingChecklistOpen && !externalMeetingChecklistLoading && (
                    <>
                      {externalMeetingChecklist && externalMeetingChecklist.items && externalMeetingChecklist.items.length > 0 ? (
                        <div style={{ padding: "16px", border: "1px solid #e2e8f0", borderRadius: "8px", backgroundColor: "#f8fafc" }}>
                          <div style={{ marginBottom: "12px", fontWeight: "600", fontSize: "14px", color: "#1e293b" }}>
                            {externalMeetingChecklist.title || "Checklist"}
                          </div>
                          <div className="external-checklist-media">
                            <div className="external-checklist-media-title">Meeting options (reference)</div>
                            {!externalChecklistImageError ? (
                              <a href="/external-meeting-options.png" target="_blank" rel="noreferrer">
                                <img
                                  src="/external-meeting-options.png"
                                  alt="Teams meeting options reference"
                                  onError={() => setExternalChecklistImageError(true)}
                                />
                              </a>
                            ) : (
                              <div className="external-checklist-media-hint">
                                Add the image file to: <code>frontend/public/external-meeting-options.png</code>
                                <br />
                                Then refresh the page.
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {(() => {
                              const sorted = externalMeetingChecklist.items
                                .slice()
                                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                              let mainCounter = 0
                              return sorted.map((item, idx) => {
                                const isChecked = externalMeetingChecklistItems.get(item.id) ?? false
                                const rawTitle = item.title || ""
                                const match = rawTitle.match(/^(\d+(?:\.\d+)*)\.\s*(.*)$/)
                                const prefix = match?.[1] || ""
                                const titleOnly = (match?.[2] ?? rawTitle).trim()
                                const isSubpoint = /^\d+\.\d+/.test(prefix)
                                if (!isSubpoint) mainCounter += 1
                                // Always anchor numbering to the current mainCounter:
                                // - main items: 1,2,3...
                                // - subpoints: <current-main>.<sub> (so 9.1 becomes 10.1 if a new main item was inserted)
                                const displayNr = isSubpoint
                                  ? `${mainCounter}${prefix.replace(/^\d+/, "")}`
                                  : String(mainCounter)
                                const displayTitle = titleOnly
                                return (
                                  <div
                                    key={item.id}
                                    style={{
                                      display: "flex",
                                      alignItems: "flex-start",
                                      gap: "8px",
                                      padding: "8px",
                                      borderRadius: "4px",
                                      backgroundColor: isChecked ? "#f0fdf4" : "transparent",
                                      transition: "background-color 0.2s",
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: "22px",
                                        flexShrink: 0,
                                        fontSize: "12px",
                                        fontWeight: 700,
                                        color: "#475569",
                                        textAlign: "right",
                                        marginTop: "2px",
                                      }}
                                    >
                                      {displayNr}.
                                    </span>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => void toggleChecklistItem(item.id)}
                                      style={{ marginTop: "2px", cursor: "pointer" }}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {isAdmin && externalChecklistEditingId === item.id ? (
                                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                          <input
                                            className="input"
                                            type="text"
                                            value={externalChecklistEditTitle}
                                            onChange={(e) => setExternalChecklistEditTitle(e.target.value)}
                                            style={{ flex: 1 }}
                                          />
                                          <button
                                            className="btn-surface"
                                            type="button"
                                            onClick={() => void saveExternalChecklistItemTitle(item.id)}
                                            disabled={externalChecklistSavingId === item.id || !externalChecklistEditTitle.trim()}
                                          >
                                            Save
                                          </button>
                                          <button
                                            className="btn-surface"
                                            type="button"
                                            onClick={() => cancelEditExternalChecklistItem()}
                                            disabled={externalChecklistSavingId === item.id}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <span style={{ fontSize: "13px", lineHeight: "1.5", color: "#334155" }}>
                                          {displayTitle}
                                        </span>
                                      )}
                                    </div>
                                    {isAdmin ? (
                                      <div style={{ display: "flex", gap: "6px", marginLeft: "8px" }}>
                                        <button
                                          className="btn-surface"
                                          type="button"
                                          onClick={() => startEditExternalChecklistItem(item.id, `${displayNr}. ${displayTitle}`)}
                                          disabled={externalChecklistDeletingId === item.id || externalChecklistSavingId === item.id}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          className="btn-surface"
                                          type="button"
                                          onClick={() => void deleteExternalChecklistItem(item.id)}
                                          disabled={externalChecklistDeletingId === item.id || externalChecklistSavingId === item.id}
                                        >
                                          {externalChecklistDeletingId === item.id ? "Deleting..." : "Delete"}
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })
                            })()}
                          </div>
                          {isAdmin ? (
                            <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
                              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                <input
                                  className="input"
                                  type="number"
                                  min={1}
                                  placeholder="Order #"
                                  value={externalChecklistAddOrder}
                                  onChange={(e) => setExternalChecklistAddOrder(e.target.value)}
                                  style={{ width: "110px" }}
                                />
                                <input
                                  className="input"
                                  type="text"
                                  placeholder="Add new checklist item..."
                                  value={externalChecklistAddTitle}
                                  onChange={(e) => setExternalChecklistAddTitle(e.target.value)}
                                  style={{ flex: 1 }}
                                />
                                <button
                                  className="btn-surface"
                                  type="button"
                                  onClick={() => void addExternalChecklistItem()}
                                  disabled={
                                    externalChecklistAdding ||
                                    !externalChecklistAddTitle.trim() ||
                                    !externalMeetingChecklist?.id ||
                                    (externalChecklistAddOrder.trim() !== "" &&
                                      (!Number.isFinite(Number(externalChecklistAddOrder)) || Number(externalChecklistAddOrder) <= 0))
                                  }
                                >
                                  {externalChecklistAdding ? "Adding..." : "Add"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div style={{ padding: "12px", textAlign: "center", color: "#dc2626", fontSize: "13px", border: "1px solid #fecaca", borderRadius: "4px", backgroundColor: "#fef2f2" }}>
                          Checklist not found. Please run the database migration to create the external meetings checklist.
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="external-meeting-row" style={{ marginTop: "16px" }}>
                  <button
                    className="btn-primary"
                    type="button"
                    disabled={!canCreateExternalMeeting || creatingExternalMeeting}
                    onClick={() => void submitExternalMeeting()}
                    style={{
                      width: "100%",
                      fontWeight: 600,
                      fontSize: "13px",
                      padding: "8px 12px",
                      backgroundColor: "#2563eb",
                      borderColor: "#1d4ed8",
                      boxShadow: "0 6px 14px rgba(37, 99, 235, 0.25)",
                      color: "#ffffff",
                    }}
                  >
                    {creatingExternalMeeting ? "Saving..." : "Add"}
                  </button>
                </div>
              </div>
            </div>
            <div className="external-meeting-list">
              <div className="external-meeting-form-title">All external meetings</div>
              {externalMeetingsSorted.length ? (
                <div className="external-meeting-cards">
                  {externalMeetingsSorted.map((meeting) => {
                    const department = departments.find((d) => d.id === meeting.department_id) || null
                    const owner = meeting.created_by ? userById.get(meeting.created_by) : null
                    const ownerName = owner?.full_name || owner?.username || "Unknown"
                    const isEditing = editingExternalMeetingId === meeting.id
                    return (
                      <div key={meeting.id} className="external-meeting-card">
                        {isEditing ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            <input
                              className="input"
                              type="text"
                              placeholder="Meeting title"
                              value={editingExternalMeetingTitle}
                              onChange={(e) => setEditingExternalMeetingTitle(e.target.value)}
                            />
                            <div className="external-meeting-row">
                              <input
                                className="input"
                                type="text"
                                placeholder="Platform (Zoom, Meet, Office...)"
                                value={editingExternalMeetingPlatform}
                                onChange={(e) => setEditingExternalMeetingPlatform(e.target.value)}
                              />
                              {editingExternalMeetingRecurrenceType === "none" ? (
                                <input
                                  className="input"
                                  type="datetime-local"
                                  value={editingExternalMeetingStartsAt}
                                  onChange={(e) => setEditingExternalMeetingStartsAt(e.target.value)}
                                />
                              ) : (
                                <input
                                  className="input"
                                  type="time"
                                  value={editingExternalMeetingStartTime}
                                  onChange={(e) => setEditingExternalMeetingStartTime(e.target.value)}
                                />
                              )}
                            </div>
                            <div className="external-meeting-row">
                              <select
                                className="input"
                                value={editingExternalMeetingRecurrenceType}
                                onChange={(e) => setEditingExternalMeetingRecurrenceType(e.target.value as "none" | "weekly" | "monthly" | "yearly")}
                              >
                                <option value="none">One time</option>
                                <option value="weekly">Every week</option>
                                <option value="monthly">Every month</option>
                                <option value="yearly">Every year</option>
                              </select>
                            </div>
                            {editingExternalMeetingRecurrenceType === "weekly" ? (
                              <>
                                <div className="external-meeting-row" style={{ justifyContent: "flex-start" }}>
                                  <button
                                    className="btn-surface"
                                    type="button"
                                    onClick={() => setShowEditWeekendDays((prev) => !prev)}
                                    style={{
                                      padding: "4px 10px",
                                      fontSize: "12px",
                                      fontWeight: 600,
                                      backgroundColor: showEditWeekendDays ? "#1d4ed8" : "#eef2ff",
                                      borderColor: "#3b82f6",
                                      color: showEditWeekendDays ? "#ffffff" : "#1d4ed8",
                                    }}
                                  >
                                    {showEditWeekendDays ? "Hide weekend days" : "Show weekend days"}
                                  </button>
                                </div>
                                <div className="external-meeting-row" style={{ flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                                  {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                                    .map((day, idx) => ({ day, idx }))
                                    .filter(({ idx }) => showEditWeekendDays || idx < 5)
                                    .map(({ day, idx }) => (
                                      <label key={day} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                                        <input
                                          type="checkbox"
                                          checked={editingExternalMeetingRecurrenceDaysOfWeek.includes(idx)}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setEditingExternalMeetingRecurrenceDaysOfWeek((prev) => [...prev, idx])
                                            } else {
                                              setEditingExternalMeetingRecurrenceDaysOfWeek((prev) => prev.filter((d) => d !== idx))
                                            }
                                          }}
                                        />
                                        {day}
                                      </label>
                                    ))}
                                </div>
                              </>
                            ) : null}
                            {editingExternalMeetingRecurrenceType === "monthly" ? (
                              <div
                                className="external-meeting-row"
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                                  gap: "6px",
                                }}
                              >
                                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                                  <label
                                    key={day}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      fontSize: "12px",
                                      padding: "4px 6px",
                                      border: "1px solid #e2e8f0",
                                      borderRadius: "8px",
                                      backgroundColor: editingExternalMeetingRecurrenceDaysOfMonth.includes(day) ? "#eef2ff" : "#ffffff",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={editingExternalMeetingRecurrenceDaysOfMonth.includes(day)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setEditingExternalMeetingRecurrenceDaysOfMonth((prev) => [...prev, day])
                                        } else {
                                          setEditingExternalMeetingRecurrenceDaysOfMonth((prev) => prev.filter((d) => d !== day))
                                        }
                                      }}
                                    />
                                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{day}</span>
                                  </label>
                                ))}
                              </div>
                            ) : null}
                            {editingExternalMeetingRecurrenceType === "yearly" ? (
                              <div className="external-meeting-row" style={{ gap: "8px" }}>
                                <select
                                  className="input"
                                  value={editingExternalMeetingRecurrenceMonth}
                                  onChange={(e) => setEditingExternalMeetingRecurrenceMonth(e.target.value)}
                                >
                                  {[
                                    "January",
                                    "February",
                                    "March",
                                    "April",
                                    "May",
                                    "June",
                                    "July",
                                    "August",
                                    "September",
                                    "October",
                                    "November",
                                    "December",
                                  ].map((label, idx) => (
                                    <option key={label} value={String(idx + 1)}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  className="input"
                                  value={editingExternalMeetingRecurrenceDay}
                                  onChange={(e) => setEditingExternalMeetingRecurrenceDay(e.target.value)}
                                >
                                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                                    <option key={day} value={String(day)}>
                                      {day}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : null}
                            <div className="external-meeting-row">
                              <select
                                className="input"
                                value={editingExternalMeetingDepartmentId}
                                onChange={(e) => setEditingExternalMeetingDepartmentId(e.target.value)}
                              >
                                <option value="">Select department</option>
                                {departments.map((dep) => (
                                  <option key={dep.id} value={dep.id}>
                                    {dep.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div style={{ display: "flex", gap: "8px" }}>
                              <button
                                className="btn-surface"
                                type="button"
                                onClick={() => void saveExternalMeeting()}
                                disabled={updatingExternalMeeting || !editingExternalMeetingTitle.trim()}
                                style={{ flex: 1 }}
                              >
                                {updatingExternalMeeting ? "Saving..." : "Save"}
                              </button>
                              <button
                                className="btn-surface"
                                type="button"
                                onClick={cancelEditExternalMeeting}
                                disabled={updatingExternalMeeting}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div style={{ flex: 1 }}>
                                <div className="external-meeting-title">{meeting.title || "External meeting"}</div>
                                <div className="external-meeting-meta">
                                  <span>{formatExternalMeetingWhen(meeting)}</span>
                                  <span>{meeting.platform || "Platform TBD"}</span>
                                </div>
                                <div className="external-meeting-meta">
                                  <span>{department?.name || "Department TBD"}</span>
                                  <span>Owner: {ownerName}</span>
                                </div>
                              </div>
                              {canEditExternalMeeting(meeting) ? (
                                <div style={{ display: "flex", gap: "6px", marginLeft: "12px" }}>
                                  <button
                                    className="btn-surface"
                                    type="button"
                                    onClick={() => startEditExternalMeeting(meeting)}
                                    disabled={deletingExternalMeetingId === meeting.id || updatingExternalMeeting}
                                    title="Edit meeting"
                                  >
                                    Edit
                                  </button>
                                  {isAdmin ? (
                                    <button
                                      className="btn-surface"
                                      type="button"
                                      onClick={() => void deleteExternalMeeting(meeting.id)}
                                      disabled={deletingExternalMeetingId === meeting.id || updatingExternalMeeting}
                                      title="Delete meeting"
                                      style={{ color: "#dc2626", borderColor: "#fecaca" }}
                                    >
                                      {deletingExternalMeetingId === meeting.id ? "Deleting..." : "Delete"}
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="external-meeting-empty">No external meetings yet.</div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {internalMeetingsOpen ? (
        <section className="meeting-panel internal-meetings-panel">
          <div className="meeting-panel-header">
            <div>
              <div className="meeting-title">Internal Meetings</div>
              <div className="meeting-subtitle">Show all internal meetings and add new ones.</div>
            </div>
            <button className="btn-outline" type="button" onClick={() => setInternalMeetingsOpen(false)}>
              Close
            </button>
          </div>
          <div className="external-meetings-grid">
            <div className="external-meeting-form">
              <div className="external-meeting-form-title">Add meeting</div>
              <div className="external-meeting-fields">
                <input
                  className="input"
                  type="text"
                  placeholder="Meeting title"
                  value={internalMeetingTitle}
                  onChange={(e) => setInternalMeetingTitle(e.target.value)}
                />
                <div className="external-meeting-row">
                  <input
                    className="input"
                    type="text"
                    placeholder="Platform (Zoom, Meet, Office...)"
                    value={internalMeetingPlatform}
                    onChange={(e) => setInternalMeetingPlatform(e.target.value)}
                  />
                  {internalMeetingRecurrenceType === "none" ? (
                    <input
                      className="input"
                      type="datetime-local"
                      value={internalMeetingStartsAt}
                      onChange={(e) => setInternalMeetingStartsAt(e.target.value)}
                    />
                  ) : (
                    <input
                      className="input"
                      type="time"
                      value={internalMeetingStartTime}
                      onChange={(e) => setInternalMeetingStartTime(e.target.value)}
                    />
                  )}
                </div>
                <div className="external-meeting-row">
                  <select
                    className="input"
                    value={internalMeetingRecurrenceType}
                    onChange={(e) => setInternalMeetingRecurrenceType(e.target.value as "none" | "weekly" | "monthly" | "yearly")}
                  >
                    <option value="none">One time</option>
                    <option value="weekly">Every week</option>
                    <option value="monthly">Every month</option>
                    <option value="yearly">Every year</option>
                  </select>
                </div>
                {internalMeetingRecurrenceType === "weekly" ? (
                  <>
                    <div className="external-meeting-row" style={{ justifyContent: "flex-start" }}>
                      <button
                        className="btn-surface"
                        type="button"
                        onClick={() => setShowInternalWeekendDays((prev) => !prev)}
                        style={{
                          padding: "4px 10px",
                          fontSize: "12px",
                          fontWeight: 600,
                          backgroundColor: showInternalWeekendDays ? "#1d4ed8" : "#eef2ff",
                          borderColor: "#3b82f6",
                          color: showInternalWeekendDays ? "#ffffff" : "#1d4ed8",
                        }}
                      >
                        {showInternalWeekendDays ? "Hide weekend days" : "Show weekend days"}
                      </button>
                    </div>
                    <div className="external-meeting-row" style={{ flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                      {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                        .map((day, idx) => ({ day, idx }))
                        .filter(({ idx }) => showInternalWeekendDays || idx < 5)
                        .map(({ day, idx }) => (
                          <label key={day} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                            <input
                              type="checkbox"
                              checked={internalMeetingRecurrenceDaysOfWeek.includes(idx)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setInternalMeetingRecurrenceDaysOfWeek((prev) => [...prev, idx])
                                } else {
                                  setInternalMeetingRecurrenceDaysOfWeek((prev) => prev.filter((d) => d !== idx))
                                }
                              }}
                            />
                            {day}
                          </label>
                        ))}
                    </div>
                  </>
                ) : null}
                {internalMeetingRecurrenceType === "monthly" ? (
                  <div
                    className="external-meeting-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                      gap: "6px",
                    }}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <label
                        key={day}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "12px",
                          padding: "4px 6px",
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          backgroundColor: internalMeetingRecurrenceDaysOfMonth.includes(day) ? "#eef2ff" : "#ffffff",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={internalMeetingRecurrenceDaysOfMonth.includes(day)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setInternalMeetingRecurrenceDaysOfMonth((prev) => [...prev, day])
                            } else {
                              setInternalMeetingRecurrenceDaysOfMonth((prev) => prev.filter((d) => d !== day))
                            }
                          }}
                        />
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{day}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
                {internalMeetingRecurrenceType === "yearly" ? (
                  <div className="external-meeting-row" style={{ gap: "8px" }}>
                    <select
                      className="input"
                      value={internalMeetingRecurrenceMonth}
                      onChange={(e) => setInternalMeetingRecurrenceMonth(e.target.value)}
                    >
                      {[
                        "January",
                        "February",
                        "March",
                        "April",
                        "May",
                        "June",
                        "July",
                        "August",
                        "September",
                        "October",
                        "November",
                        "December",
                      ].map((label, idx) => (
                        <option key={label} value={String(idx + 1)}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input"
                      value={internalMeetingRecurrenceDay}
                      onChange={(e) => setInternalMeetingRecurrenceDay(e.target.value)}
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <option key={day} value={String(day)}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="external-meeting-row">
                  <select
                    className="input"
                    value={internalMeetingDepartmentId}
                    onChange={(e) => setInternalMeetingDepartmentId(e.target.value)}
                    disabled={!canSelectExternalDepartment}
                  >
                    {canSelectExternalDepartment ? (
                      <option value="">Select department</option>
                    ) : (
                      <option value="">Department</option>
                    )}
                    {departments.map((dep) => (
                      <option key={dep.id} value={dep.id}>
                        {dep.name}
                      </option>
                    ))}
                  </select>
                </div>
                {!canSelectExternalDepartment && internalMeetingDepartment ? (
                  <div className="external-meeting-hint">
                    Department: {internalMeetingDepartment.name === "Project Content Manager" ? "Product Content" : internalMeetingDepartment.name}
                  </div>
                ) : null}
                <div className="external-meeting-row" style={{ marginTop: "16px" }}>
                  <button
                    className="btn-primary"
                    type="button"
                    disabled={!canCreateInternalMeeting || creatingInternalMeeting}
                    onClick={() => void submitInternalMeeting()}
                    style={{
                      width: "100%",
                      fontWeight: 600,
                      fontSize: "13px",
                      padding: "8px 12px",
                      backgroundColor: "#2563eb",
                      borderColor: "#1d4ed8",
                      boxShadow: "0 6px 14px rgba(37, 99, 235, 0.25)",
                      color: "#ffffff",
                    }}
                  >
                    {creatingInternalMeeting ? "Saving..." : "Add"}
                  </button>
                </div>
              </div>
            </div>
            <div className="external-meeting-list">
              <div className="external-meeting-form-title">All internal meetings</div>
              {internalMeetingsSorted.length ? (
                <div className="external-meeting-cards">
                  {internalMeetingsSorted.map((meeting) => {
                    const department = departments.find((d) => d.id === meeting.department_id) || null
                    const owner = meeting.created_by ? userById.get(meeting.created_by) : null
                    const ownerName = owner?.full_name || owner?.username || "Unknown"
                    const isEditing = editingInternalMeetingId === meeting.id
                    return (
                      <div key={meeting.id} className="external-meeting-card">
                        {isEditing ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            <input
                              className="input"
                              type="text"
                              placeholder="Meeting title"
                              value={editingInternalMeetingTitle}
                              onChange={(e) => setEditingInternalMeetingTitle(e.target.value)}
                            />
                            <div className="external-meeting-row">
                              <input
                                className="input"
                                type="text"
                                placeholder="Platform (Zoom, Meet, Office...)"
                                value={editingInternalMeetingPlatform}
                                onChange={(e) => setEditingInternalMeetingPlatform(e.target.value)}
                              />
                              {editingInternalMeetingRecurrenceType === "none" ? (
                                <input
                                  className="input"
                                  type="datetime-local"
                                  value={editingInternalMeetingStartsAt}
                                  onChange={(e) => setEditingInternalMeetingStartsAt(e.target.value)}
                                />
                              ) : (
                                <input
                                  className="input"
                                  type="time"
                                  value={editingInternalMeetingStartTime}
                                  onChange={(e) => setEditingInternalMeetingStartTime(e.target.value)}
                                />
                              )}
                            </div>
                            <div className="external-meeting-row">
                              <select
                                className="input"
                                value={editingInternalMeetingRecurrenceType}
                                onChange={(e) => setEditingInternalMeetingRecurrenceType(e.target.value as "none" | "weekly" | "monthly" | "yearly")}
                              >
                                <option value="none">One time</option>
                                <option value="weekly">Every week</option>
                                <option value="monthly">Every month</option>
                                <option value="yearly">Every year</option>
                              </select>
                            </div>
                            {editingInternalMeetingRecurrenceType === "weekly" ? (
                              <>
                                <div className="external-meeting-row" style={{ justifyContent: "flex-start" }}>
                                  <button
                                    className="btn-surface"
                                    type="button"
                                    onClick={() => setShowInternalEditWeekendDays((prev) => !prev)}
                                    style={{
                                      padding: "4px 10px",
                                      fontSize: "12px",
                                      fontWeight: 600,
                                      backgroundColor: showInternalEditWeekendDays ? "#1d4ed8" : "#eef2ff",
                                      borderColor: "#3b82f6",
                                      color: showInternalEditWeekendDays ? "#ffffff" : "#1d4ed8",
                                    }}
                                  >
                                    {showInternalEditWeekendDays ? "Hide weekend days" : "Show weekend days"}
                                  </button>
                                </div>
                                <div className="external-meeting-row" style={{ flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                                  {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                                    .map((day, idx) => ({ day, idx }))
                                    .filter(({ idx }) => showInternalEditWeekendDays || idx < 5)
                                    .map(({ day, idx }) => (
                                      <label key={day} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                                        <input
                                          type="checkbox"
                                          checked={editingInternalMeetingRecurrenceDaysOfWeek.includes(idx)}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setEditingInternalMeetingRecurrenceDaysOfWeek((prev) => [...prev, idx])
                                            } else {
                                              setEditingInternalMeetingRecurrenceDaysOfWeek((prev) => prev.filter((d) => d !== idx))
                                            }
                                          }}
                                        />
                                        {day}
                                      </label>
                                    ))}
                                </div>
                              </>
                            ) : null}
                            {editingInternalMeetingRecurrenceType === "monthly" ? (
                              <div
                                className="external-meeting-row"
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                                  gap: "6px",
                                }}
                              >
                                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                                  <label
                                    key={day}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      fontSize: "12px",
                                      padding: "4px 6px",
                                      border: "1px solid #e2e8f0",
                                      borderRadius: "8px",
                                      backgroundColor: editingInternalMeetingRecurrenceDaysOfMonth.includes(day) ? "#eef2ff" : "#ffffff",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={editingInternalMeetingRecurrenceDaysOfMonth.includes(day)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setEditingInternalMeetingRecurrenceDaysOfMonth((prev) => [...prev, day])
                                        } else {
                                          setEditingInternalMeetingRecurrenceDaysOfMonth((prev) => prev.filter((d) => d !== day))
                                        }
                                      }}
                                    />
                                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{day}</span>
                                  </label>
                                ))}
                              </div>
                            ) : null}
                            {editingInternalMeetingRecurrenceType === "yearly" ? (
                              <div className="external-meeting-row" style={{ gap: "8px" }}>
                                <select
                                  className="input"
                                  value={editingInternalMeetingRecurrenceMonth}
                                  onChange={(e) => setEditingInternalMeetingRecurrenceMonth(e.target.value)}
                                >
                                  {[
                                    "January",
                                    "February",
                                    "March",
                                    "April",
                                    "May",
                                    "June",
                                    "July",
                                    "August",
                                    "September",
                                    "October",
                                    "November",
                                    "December",
                                  ].map((label, idx) => (
                                    <option key={label} value={String(idx + 1)}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  className="input"
                                  value={editingInternalMeetingRecurrenceDay}
                                  onChange={(e) => setEditingInternalMeetingRecurrenceDay(e.target.value)}
                                >
                                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                                    <option key={day} value={String(day)}>
                                      {day}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : null}
                            <div className="external-meeting-row">
                              <select
                                className="input"
                                value={editingInternalMeetingDepartmentId}
                                onChange={(e) => setEditingInternalMeetingDepartmentId(e.target.value)}
                              >
                                <option value="">Select department</option>
                                {departments.map((dep) => (
                                  <option key={dep.id} value={dep.id}>
                                    {dep.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div style={{ display: "flex", gap: "8px" }}>
                              <button
                                className="btn-surface"
                                type="button"
                                onClick={() => void saveInternalMeeting()}
                                disabled={updatingInternalMeeting || !editingInternalMeetingTitle.trim()}
                                style={{ flex: 1 }}
                              >
                                {updatingInternalMeeting ? "Saving..." : "Save"}
                              </button>
                              <button
                                className="btn-surface"
                                type="button"
                                onClick={cancelEditInternalMeeting}
                                disabled={updatingInternalMeeting}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div style={{ flex: 1 }}>
                                <div className="external-meeting-title">{meeting.title || "Internal meeting"}</div>
                                <div className="external-meeting-meta">
                                  <span>{formatExternalMeetingWhen(meeting)}</span>
                                  <span>{meeting.platform || "-"}</span>
                                </div>
                                <div className="external-meeting-meta">
                                  <span>{department?.name || "Department TBD"}</span>
                                  <span>Owner: {ownerName}</span>
                                </div>
                              </div>
                              {canEditInternalMeeting(meeting) ? (
                                <div style={{ display: "flex", gap: "6px", marginLeft: "12px" }}>
                                  <button
                                    className="btn-surface"
                                    type="button"
                                    onClick={() => startEditInternalMeeting(meeting)}
                                    disabled={deletingInternalMeetingId === meeting.id || updatingInternalMeeting}
                                    title="Edit meeting"
                                  >
                                    Edit
                                  </button>
                                  {isAdmin ? (
                                    <button
                                      className="btn-surface"
                                      type="button"
                                      onClick={() => void deleteInternalMeeting(meeting.id)}
                                      disabled={deletingInternalMeetingId === meeting.id || updatingInternalMeeting}
                                      title="Delete meeting"
                                      style={{ color: "#dc2626", borderColor: "#fecaca" }}
                                    >
                                      {deletingInternalMeetingId === meeting.id ? "Deleting..." : "Delete"}
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="external-meeting-empty">No internal meetings yet.</div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <div className="view-container">
        {allDaysSelected ? (
          <div className="week-table-view">
            <div className="print-header">
              <div />
              <div className="print-title">COMMON VIEW - WEEK PLAN</div>
              <div className="print-datetime">
                {formatDateTimeDMY(printedAt)}
              </div>
            </div>
            <table className="week-table">
              <thead>
                <tr>
                  <th rowSpan={2} style={{ width: "40px" }}>NR</th>
                  <th rowSpan={2} style={{ width: "110px" }}>LLOJI</th>
                  {weekISOs.map((iso) => {
                    const d = fromISODate(iso)
                    const dayCode = getDayCode(d)
                    return (
                      <th key={iso} colSpan={1} className="week-table-date-header">
                        <div>{dayCode} = {formatDateHuman(iso)}</div>
                      </th>
                    )
                  })}
                </tr>
                <tr>
                  {weekISOs.map((iso) => (
                    <th key={`sub-${iso}`} className="week-table-subheader">
                      KUSH/BZ ME/DET/SI/KUR/KUJT
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {swimlaneRows
                  .filter((row) => showCard(row.id))
                  .map((row, rowIndex) => {
                    const rowData = tableDataByDay?.[weekISOs[0]] || {}
                    let dayEntries: Record<string, any[]> = {}
                    weekISOs.forEach((iso) => {
                      const dayData = tableDataByDay?.[iso] || {}
                      if (row.id === "late") dayEntries[iso] = dayData.late || []
                      else if (row.id === "absent") dayEntries[iso] = dayData.absent || []
                      else if (row.id === "leave") dayEntries[iso] = dayData.leave || []
                      else if (row.id === "blocked") dayEntries[iso] = dayData.blocked || []
                      else if (row.id === "oneH") dayEntries[iso] = dayData.oneH || []
                      else if (row.id === "personal") dayEntries[iso] = dayData.personal || []
                      else if (row.id === "external") dayEntries[iso] = dayData.external || []
                      else if (row.id === "internal") dayEntries[iso] = dayData.internal || []
                      else if (row.id === "bz") dayEntries[iso] = dayData.bz || []
                      else if (row.id === "r1") dayEntries[iso] = dayData.r1 || []
                      else if (row.id === "problem") dayEntries[iso] = dayData.problems || []
                      else if (row.id === "feedback") dayEntries[iso] = dayData.feedback || []
                      else if (row.id === "priority") dayEntries[iso] = dayData.priority || []
                    })

                    const getWeekRowClass = (rowId: string) => {
                      if (rowId === "late") return "delay"
                      if (rowId === "absent") return "absence"
                      if (rowId === "leave") return "leave"
                      if (rowId === "blocked") return "blocked"
                      if (rowId === "oneH") return "oneh"
                      if (rowId === "personal") return "personal"
                      if (rowId === "external") return "external"
                      if (rowId === "internal") return "internal"
                      if (rowId === "bz") return "bz"
                      if (rowId === "r1") return "r1"
                      if (rowId === "problem") return "problem"
                      if (rowId === "feedback") return "feedback"
                      if (rowId === "priority") return "priority"
                      return ""
                    }
                    const weekRowClass = getWeekRowClass(row.id)

                    const getCellContent = (iso: string) => {
                      const entries = dayEntries[iso] || []
                      if (entries.length === 0) return null
                      const normalizeAssignees = (value?: string) =>
                        value
                          ? value
                              .split(",")
                              .map((v) => v.trim())
                              .filter(Boolean)
                          : []
                      const entryAssignees = (entry: any) =>
                        entry.assignees && entry.assignees.length
                          ? entry.assignees
                          : normalizeAssignees(entry.person || entry.owner || "")
                      
                      if (row.id === "late") {
        return entries.map((e: LateItem, idx: number) => (
          <div key={idx} className="week-table-entry">
            <span>{idx + 1}. {e.start || "08:00"}-{e.until}</span>
            <div className="week-table-avatars">
              {entryAssignees(e).map((name: string) => (
                <span key={`${e.start}-${name}`} className="week-table-avatar" title={name}>
                  {initials(name)}
                </span>
              ))}
            </div>
            {canDeleteCommon && e.entryId ? (
              <button
                type="button"
                className="week-table-delete week-table-delete-red"
                onClick={() => deleteCommonEntry(e.entryId)}
                aria-label="Delete entry"
                title="Delete"
              >
                ×
              </button>
            ) : null}
          </div>
        ))
                      } else if (row.id === "absent") {
                        return entries.map((e: AbsentItem, idx: number) => (
                          <div key={idx} className="week-table-entry">
                            <span>{idx + 1}. {e.from} - {e.to}</span>
                            <div className="week-table-avatars">
                              {entryAssignees(e).map((name: string) => (
                                <span key={`${e.from}-${name}`} className="week-table-avatar" title={name}>
                                  {initials(name)}
                                </span>
                              ))}
                            </div>
                            {canDeleteCommon && e.entryId ? (
                              <button
                                type="button"
                                className="week-table-delete week-table-delete-red"
                                onClick={() => deleteCommonEntry(e.entryId)}
                                aria-label="Delete entry"
                                title="Delete"
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                        ))
                      } else if (row.id === "leave") {
                        return entries.map((e: LeaveItem, idx: number) => {
                          const range = "" // hide date in table view
                          const isAllUsers = Boolean(e.isAllUsers || e.person === ALL_USERS_INITIALS)
                          const timeLabel = e.fullDay ? "08:00-16:30" : `${e.from}-${e.to}`
                          return (
                            <div key={idx} className="week-table-entry">
                              <span>
                                {idx + 1}. {isAllUsers ? `${timeLabel} ALL` : timeLabel}
                                {range ? ` ${range}` : ""}
                              </span>
                              {!isAllUsers ? (
                                <div className="week-table-avatars">
                                  {entryAssignees(e).map((name: string) => (
                                    <span key={`${e.from}-${name}`} className="week-table-avatar" title={name}>
                                      {initials(name)}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              {canDeleteCommon && e.entryId ? (
                                <button
                                  type="button"
                                  className="week-table-delete week-table-delete-red"
                                  onClick={() => deleteCommonEntry(e.entryId)}
                                  aria-label="Delete entry"
                                  title="Delete"
                                >
                                  ×
                                </button>
                              ) : null}
                              {isAdmin && e.isAllUsers ? (
                                <button
                                  type="button"
                                  className="week-table-delete week-table-delete-red"
                                  onClick={() => deleteAllUsersLeaveForDay(e.startDate)}
                                  aria-label="Delete all-users entries"
                                  title="Delete all users"
                                >
                                  ×
                                </button>
                              ) : null}
                            </div>
                          )
                        })
                      } else if (row.id === "blocked") {
                        return entries.map((e: BlockedItem, idx: number) => (
                          <div key={idx} className="week-table-entry">
                            <span>{idx + 1}. {stripInitialsPrefix(e.title)}</span>
                            <div className="week-table-avatars">
                              {entryAssignees(e).map((name: string) => (
                                <span key={`${e.title}-${name}`} className="week-table-avatar" title={name}>
                                  {initials(name)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      } else if (row.id === "problem" || row.id === "feedback") {
                        return entries.map((e: ProblemItem | FeedbackItem, idx: number) => (
                          <div key={idx} className="week-table-entry">
                            <span>{idx + 1}. {initials(e.person || e.title || "")}: {e.note || ""}</span>
                            {canDeleteCommon && e.entryId ? (
                              <button
                                type="button"
                                className="week-table-delete week-table-delete-red"
                                onClick={() => deleteCommonEntry(e.entryId)}
                                aria-label="Delete entry"
                                title="Delete"
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                        ))
                      } else if (row.id === "oneH" || row.id === "r1") {
                        return entries.map((e: any, idx: number) => (
                          <div key={idx} className="week-table-entry">
                            <span>{idx + 1}. {stripInitialsPrefix(e.title)}</span>
                            <div className="week-table-avatars">
                              {entryAssignees(e).map((name: string) => (
                                <span key={`${e.title}-${name}`} className="week-table-avatar" title={name}>
                                  {initials(name)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      } else if (row.id === "personal") {
                        return entries.map((e: PersonalItem, idx: number) => (
                          <div key={idx} className="week-table-entry">
                            <span>{idx + 1}. {stripInitialsPrefix(e.title)}</span>
                            <div className="week-table-avatars">
                              {entryAssignees(e).map((name: string) => (
                                <span key={`${e.title}-${name}`} className="week-table-avatar" title={name}>
                                  {initials(name)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      } else if (row.id === "external") {
                        return entries.map((e: ExternalItem, idx: number) => (
                          <div key={idx} className="week-table-entry">
                            <span>{idx + 1}. {stripInitialsPrefix(`${e.title} ${formatTimeLabel(e.time)}`.trim())}</span>
                            <div className="week-table-avatars">
                              {entryAssignees(e).map((name: string) => (
                                <span key={`${e.title}-${name}`} className="week-table-avatar" title={name}>
                                  {initials(name)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      } else if (row.id === "internal") {
                        return entries.map((e: InternalItem, idx: number) => (
                          <div key={idx} className="week-table-entry">
                            <span>{idx + 1}. {stripInitialsPrefix(`${e.title} ${formatTimeLabel(e.time)}`.trim())}</span>
                            <div className="week-table-avatars">
                              {entryAssignees(e).map((name: string) => (
                                <span key={`${e.title}-${name}`} className="week-table-avatar" title={name}>
                                  {initials(name)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      } else if (row.id === "bz") {
                        return entries.map((e: BzItem, idx: number) => (
                          <div key={idx} className="week-table-entry">
                            <span>
                              {idx + 1}. {stripInitialsPrefix(`${formatTimeLabel(e.time)} ${e.title}`.trim())}
                              {e.bzWithLabel ? ` - BZ: ${e.bzWithLabel}` : ""}
                            </span>
                            {e.assignees && e.assignees.length ? (
                              <div className="week-table-avatars">
                                {e.assignees.map((name: string) => (
                                  <span key={`${e.title}-${name}`} className="week-table-avatar" title={name}>
                                    {initials(name)}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))
                      } else if (row.id === "priority") {
                        const groupMap = new Map<string, PriorityItem[]>()
                        for (const item of entries as PriorityItem[]) {
                          const departmentName = item.department_name || "Other"
                          const existing = groupMap.get(departmentName) || []
                          existing.push(item)
                          groupMap.set(departmentName, existing)
                        }
                        const preferredOrder = ["DEVELOPMENT", "GRAPHIC DESIGN", "PRODUCT CONTENT"]
                        const orderIndex = new Map(preferredOrder.map((name, idx) => [name, idx]))
                        const normalizeDept = (value: string) => value.trim().toUpperCase()
                        const isOther = (value: string) => normalizeDept(value) === "OTHER"
                        const groupKeys = Array.from(groupMap.keys()).sort((a, b) => {
                          const aKey = normalizeDept(a)
                          const bKey = normalizeDept(b)
                          const aIdx = orderIndex.get(aKey)
                          const bIdx = orderIndex.get(bKey)
                          if (aIdx != null && bIdx != null) return aIdx - bIdx
                          if (aIdx != null) return -1
                          if (bIdx != null) return 1
                          if (isOther(a) && !isOther(b)) return 1
                          if (!isOther(a) && isOther(b)) return -1
                          return a.localeCompare(b)
                        })
                        let entryIndex = 0
                        return groupKeys.map((departmentName, groupIdx) => (
                          <React.Fragment key={departmentName}>
                            {(groupMap.get(departmentName) || []).map((e, idx) => (
                              <div key={`${departmentName}-${idx}`} className="week-table-entry">
                                <span>{++entryIndex}. {e.project}</span>
                                <div className="week-table-avatars">
                                  {e.assignees.map((name) => (
                                    <span key={`${e.project}-${name}`} className="week-table-avatar" title={name}>
                                      {initials(name)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                            {groupIdx < groupKeys.length - 1 ? (
                              <div className="week-table-prjk-divider" />
                            ) : null}
                          </React.Fragment>
                        ))
                      }
                      return null
                    }
                    
                    const rowLabel = row.label.toUpperCase()
                    
                    return (
                      <tr key={row.id} className={`week-table-row ${weekRowClass}`}>
                        <td className="week-table-number">{rowIndex + 1}</td>
                        <td className="week-table-label">{rowLabel}</td>
                        {weekISOs.map((iso) => {
                          const content = getCellContent(iso)
                          return (
                            <td key={iso} className="week-table-cell">
                              {content ? (
                                <div className="week-table-entries">
                                  {content}
                                </div>
                              ) : (
                                <span className="week-table-empty">—</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
              </tbody>
            </table>
            <div className="print-footer">
              <span />
              <div className="print-page-count">1/{printTotalPages}</div>
              <div className="print-initials">PUNOI: {printInitials}</div>
            </div>
          </div>
        ) : null}
        <div className={`print-page ${allDaysSelected ? "hide-when-all-days" : ""}`}>
          <div className="print-header">
            <div />
            <div className="print-title">COMMON VIEW</div>
            <div className="print-datetime">
              {formatDateTimeDMY(printedAt)}
            </div>
          </div>
          <div className={`swimlane-board ${allDaysSelected ? "hide-when-all-days" : ""}`}>
            {swimlaneRows
              .filter((row) => showCard(row.id))
              .map((row) => {
                const cells = buildSwimlaneCells(row.items, swimlaneColumnCount)
                return (
                  <div key={row.id} className="swimlane-row">
                    <div className={row.headerClass}>
                      <span>{row.label}</span>
                      <span className={row.badgeClass}>{row.count}</span>
                    </div>
                    <div className="swimlane-content-shell">
                      <div className="swimlane-row-nav">
                        <button type="button" onClick={() => scrollSwimlaneRow(row.id, "left")}>{"<"}</button>
                        <button type="button" onClick={() => scrollSwimlaneRow(row.id, "right")}>{">"}</button>
                      </div>
                      <div
                        className="swimlane-content-scroll"
                        ref={(node) => {
                          swimlaneRowRefs.current[row.id] = node
                        }}
                      >
                        <div className="swimlane-content">
                          {cells.map((cell, index) =>
                            cell ? (
                              <div
                                key={`${row.id}-${index}`}
                                className={[
                                  "swimlane-cell",
                                  cell.accentClass || "",
                                  cell.placeholder ? "placeholder" : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                {!cell.placeholder && canDeleteCommon && cell.entryId ? (
                                  <button
                                    type="button"
                                    className="swimlane-delete"
                                    onClick={() => deleteCommonEntry(cell.entryId)}
                                    aria-label="Delete entry"
                                    title="Delete"
                                  >
                                    ×
                                  </button>
                                ) : null}
                                {!cell.placeholder &&
                                row.id === "leave" &&
                                cell.title === ALL_USERS_INITIALS &&
                                cell.entryDate &&
                                isAdmin ? (
                                  <button
                                    type="button"
                                    className="swimlane-delete"
                                    onClick={() => deleteAllUsersLeaveForDay(cell.entryDate)}
                                    aria-label="Delete all-users entries"
                                    title="Delete all users"
                                  >
                                    ×
                                  </button>
                                ) : null}
                                <div className="swimlane-title-row">
                                  {!cell.placeholder && cell.assignees?.length ? (
                                    <div className="swimlane-assignees">
                                      {cell.assignees.map((name) => (
                                        <span key={`${cell.title}-${name}`} className="swimlane-avatar" title={name}>
                                          {initials(name)}
                                        </span>
                                      ))}
                                    </div>
                                  ) : !cell.placeholder && cell.assigneeLabels?.length ? (
                                    <div className="swimlane-assignees">
                                      {cell.assigneeLabels.map((label) => (
                                        <span key={`${cell.title}-${label}`} className="swimlane-avatar" title={label}>
                                          {label}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                  <div className="swimlane-title">
                                    {stripInitialsPrefix(cell.title)}
                                  </div>
                                  {(row.id === "external" ||
                                    row.id === "internal" ||
                                    row.id === "bz" ||
                                    row.id === "late" ||
                                    row.id === "absent" ||
                                    row.id === "leave") &&
                                  cell.subtitle ? (
                                    <div className="swimlane-subtitle">{cell.subtitle}</div>
                                  ) : null}
                                  {cell.dateLabel && !["late", "absent", "leave"].includes(row.id) ? (
                                    <div className="swimlane-date">{cell.dateLabel}</div>
                                  ) : null}
                                </div>
                              </div>
                            ) : (
                              <div key={`${row.id}-empty-${index}`} className="swimlane-cell empty" />
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
          <div className="print-footer">
            <span />
            <div className="print-page-count">1/{printTotalPages}</div>
            <div className="print-initials">PUNOI: {printInitials}</div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="modal">
          <div className="modal-backdrop" onClick={closeModal} />
          <div className="modal-card">
            <div className="modal-header">
            <h4>Add to Common View</h4>
              <button className="btn-outline" type="button" onClick={closeModal}>
                Close
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={submitForm}>
                <div className="form-grid">
            <div className="form-row">
              <label htmlFor="cv-type">Type</label>
              <select
                id="cv-type"
                className="input"
                value={formType}
                onChange={(e) => {
                  const nextType = e.target.value as any
                  setFormType(nextType)
                  setFormError("")
                  if (nextType !== "leave" && formPerson === ALL_USERS_VALUE) {
                    setFormPerson("")
                  }
                }}
                required
                >
                  <option value="late">Vonese</option>
                  <option value="absent">Mungese</option>
                  <option value="leave">Pushim Vjetor</option>
                  <option value="problem">Problem</option>
                  <option value="feedback">Ankese/Kerkese/Propozim</option>
            </select>
          </div>
                  <div className="form-row">
                    <label htmlFor="cv-person">Person</label>
                    <select
                      id="cv-person"
                      className="input"
                      value={formPerson}
                      onChange={(e) => {
                        setFormPerson(e.target.value)
                        setFormError("")
                      }}
                      required
                    >
                      <option value="">--</option>
                      {formType === "leave" ? (
                        <option value={ALL_USERS_VALUE}>{ALL_USERS_LABEL}</option>
                      ) : null}
                      {users.map((u) => (
                        <option key={u.id} value={u.full_name || u.username || u.email}>
                          {u.full_name || u.username || u.email}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(formType === "feedback" || formType === "problem") && (
                    <div className="form-row span-2">
                      <label htmlFor="cv-title">Title</label>
                      <input
                        id="cv-title"
                        className="input"
                        type="text"
                        placeholder="e.g. Issue: server access"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  <div className="form-row">
                    <label htmlFor="cv-date">Date (DD/MM/YYYY)</label>
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <input
                        id="cv-date"
                        className="input"
                        type="text"
                        placeholder="DD/MM/YYYY"
                        value={formDateDisplay}
                        onChange={(e) => {
                          const value = e.target.value
                          setFormDateDisplay(value)
                          setFormError("")
                          const isoDate = fromDDMMYYYY(value)
                          if (isoDate) {
                            setFormDate(isoDate)
                          }
                        }}
                        pattern="\d{2}/\d{2}/\d{4}"
                        required
                        style={{ flex: 1 }}
                      />
                      <input
                        type="date"
                        value={formDate}
                        onChange={(e) => {
                          const value = e.target.value
                          if (value) {
                            setFormDate(value)
                            setFormDateDisplay(toDDMMYYYY(value))
                            setFormError("")
                          }
                        }}
                        style={{
                          position: "absolute",
                          right: "8px",
                          opacity: 0,
                          width: "24px",
                          height: "24px",
                          cursor: "pointer",
                          zIndex: 1
                        }}
                        title="Open calendar"
                      />
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                          position: "absolute",
                          right: "10px",
                          pointerEvents: "none",
                          color: "#666"
                        }}
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                      </svg>
                    </div>
                  </div>

                  {formType === "late" && (
                    <>
                      <div className="form-row">
                        <label htmlFor="cv-start">Start time (delay)</label>
                        <input
                          id="cv-start"
                          className="input"
                          type="time"
                          value={formDelayStart}
                          onChange={(e) => setFormDelayStart(e.target.value)}
                        />
                      </div>
                      <div className="form-row">
                        <label htmlFor="cv-until">End time (delay)</label>
                        <input
                          id="cv-until"
                          className="input"
                          type="time"
                          value={formUntil}
                          onChange={(e) => setFormUntil(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {formType === "absent" && (
                    <>
                      <div className="form-row">
                        <label htmlFor="cv-from">From </label>
                        <input
                          id="cv-from"
                          className="input"
                          type="time"
                          value={formFrom}
                          onChange={(e) => setFormFrom(e.target.value)}
                        />
                      </div>
                      <div className="form-row">
                        <label htmlFor="cv-to">Until (</label>
                        <input
                          id="cv-to"
                          className="input"
                          type="time"
                          value={formTo}
                          onChange={(e) => setFormTo(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {formType === "leave" && (
                    <>
                      <div className="form-row">
                        <label htmlFor="cv-enddate">Until (optional) (DD/MM/YYYY)</label>
                        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                          <input
                            id="cv-enddate"
                            className="input"
                            type="text"
                            placeholder="DD/MM/YYYY"
                            value={formEndDateDisplay}
                            onChange={(e) => {
                              const value = e.target.value
                              setFormEndDateDisplay(value)
                              const isoDate = fromDDMMYYYY(value)
                              if (isoDate) {
                                setFormEndDate(isoDate)
                              } else if (!value) {
                                setFormEndDate("")
                              }
                            }}
                            pattern="\d{2}/\d{2}/\d{4}"
                            style={{ flex: 1 }}
                          />
                          <input
                            type="date"
                            value={formEndDate || ""}
                            onChange={(e) => {
                              const value = e.target.value
                              if (value) {
                                setFormEndDate(value)
                                setFormEndDateDisplay(toDDMMYYYY(value))
                              } else {
                                setFormEndDate("")
                                setFormEndDateDisplay("")
                              }
                            }}
                            style={{
                              position: "absolute",
                              right: "8px",
                              opacity: 0,
                              width: "24px",
                              height: "24px",
                              cursor: "pointer",
                              zIndex: 1
                            }}
                            title="Open calendar"
                          />
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                              position: "absolute",
                              right: "10px",
                              pointerEvents: "none",
                              color: "#666"
                            }}
                          >
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                          </svg>
                        </div>
                      </div>
                      <div className="form-row span-2 leave-inline">
                        <label className="checkbox leave-checkbox">
                          <input
                            type="checkbox"
                            checked={formFullDay}
                            onChange={(e) => setFormFullDay(e.target.checked)}
                          />
                          All day
                        </label>
                        {!formFullDay && (
                          <div className="leave-times">
                            <div className="mini-row">
                              <label htmlFor="cv-leave-from">From time</label>
                              <input
                                id="cv-leave-from"
                                className="input"
                                type="time"
                                value={formFrom}
                                onChange={(e) => setFormFrom(e.target.value)}
                                required={!formFullDay}
                              />
                            </div>
                            <div className="mini-row">
                              <label htmlFor="cv-leave-to">Until time</label>
                              <input
                                id="cv-leave-to"
                                className="input"
                                type="time"
                                value={formTo}
                                onChange={(e) => setFormTo(e.target.value)}
                                required={!formFullDay}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <div className="form-row span-2">
                    <label htmlFor="cv-note">Note</label>
                    <textarea
                      id="cv-note"
                      className="input"
                      placeholder="Optional..."
                      value={formNote}
                      onChange={(e) => setFormNote(e.target.value)}
                    />
                  </div>
                </div>
                {formError ? <div className="form-error">{formError}</div> : null}
                <div className="modal-footer">
                  <button className="btn-outline" type="button" onClick={closeModal} disabled={isSavingEntry}>
                    Cancel
                  </button>
                  <button className="btn-primary" type="submit" disabled={isSavingEntry}>
                    {isSavingEntry ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
              </div>
          </div>
        </div>
      )}
    </div>
  )
}
