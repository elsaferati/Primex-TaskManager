"use client"

import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/lib/auth"
import { useConfirm } from "@/components/providers/confirm-dialog-provider"
import { formatDateDMY, formatDateTimeDMY, toDateInputValue } from "@/lib/dates"
import { cn } from "@/lib/utils"
import { fetchUsersLookupCached } from "@/lib/users-cache"
import { getConfirmerCandidates, isWaitingConfirmation, validateWaitingConfirmation } from "@/lib/task-confirmation"
import { weeklyPlanStatusBgClass } from "@/lib/weekly-plan-status"
import { Pencil } from "lucide-react"
import type {
  DailyReportResponse,
  DailyReportSystemOccurrence,
  Department,
  SystemTaskOut,
  Task,
  TaskFinishPeriod,
  TaskPriority,
  User,
  UserLookup,
} from "@/lib/types"

const FINISH_PERIOD_NONE_VALUE = "__none__"
const PRIORITY_OPTIONS: TaskPriority[] = ["NORMAL", "HIGH", "BLLOK"]
const FINISH_PERIOD_OPTIONS: TaskFinishPeriod[] = ["AM", "PM"]
const FINISH_PERIOD_NONE_LABEL = "None (all day)"
const TASK_STATUS_OPTIONS = ["TODO", "IN_PROGRESS", "WAITING_CONFIRMATION", "DONE"] as const
const SYSTEM_STATUS_OPTIONS = ["OPEN", "DONE"] as const
const NO_PROJECT_TYPES = [
  { id: "normal", label: "Normal", description: "General tasks without a project." },
  { id: "personal", label: "Personal", description: "Personal tasks tracked only in this view." },
  { id: "blocked", label: "BLLOK", description: "Blocked all day by a single task." },
  { id: "hourly", label: "1H", description: "Hourly meeting/reporting task." },
  { id: "r1", label: "R1", description: "First case must be discussed with the manager." },
] as const

// Date utility functions
const pad2 = (n: number) => String(n).padStart(2, "0")
const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const toDDMMYYYY = (isoDate: string) => {
  if (!isoDate) return ""
  const [y, m, d] = isoDate.split("-").map(Number)
  return `${pad2(d)}/${pad2(m)}/${y}`
}
const fromDDMMYYYY = (ddmmyyyy: string) => {
  if (!ddmmyyyy) return ""
  const parts = ddmmyyyy.split("/")
  if (parts.length !== 3) return ""
  const [d, m, y] = parts.map(Number)
  if (isNaN(d) || isNaN(m) || isNaN(y)) return ""
  if (d < 1 || d > 31 || m < 1 || m > 12) return ""
  return `${y}-${pad2(m)}-${pad2(d)}`
}
const DAY_OPTIONS = [
  { value: "all", label: "All days" },
  { value: "0", label: "Monday" },
  { value: "1", label: "Tuesday" },
  { value: "2", label: "Wednesday" },
  { value: "3", label: "Thursday" },
  { value: "4", label: "Friday" },
  { value: "5", label: "Saturday" },
  { value: "6", label: "Sunday" },
]

// --- Bold-only editor (same behavior as System Tasks) ---
const BOLD_TAG_PATTERN = /<(strong|b|br|div|p)(\s|>|\/)/i

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function sanitizeBoldOnlyHtml(raw: string) {
  if (typeof document === "undefined") return raw
  const container = document.createElement("div")
  container.innerHTML = raw

  const unwrapBlockElements = (el: Element) => {
    const blocks = el.querySelectorAll("div, p")
    Array.from(blocks)
      .reverse()
      .forEach((block) => {
        const parent = block.parentNode
        if (!parent) return
        while (block.firstChild) {
          parent.insertBefore(block.firstChild, block)
        }
        parent.removeChild(block)
      })
  }
  unwrapBlockElements(container)

  const clean = document.createElement("div")

  const sanitizeNode = (node: Node): Node[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ""
      return text.length > 0 ? [document.createTextNode(text)] : []
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return []
    const el = node as HTMLElement
    const tag = el.tagName
    if (tag === "BR") return [document.createElement("br")]
    const children = Array.from(el.childNodes).flatMap(sanitizeNode)
    if (tag === "B" || tag === "STRONG") {
      const strong = document.createElement("strong")
      children.forEach((child) => strong.appendChild(child))
      return [strong]
    }
    if (tag === "SPAN") {
      const weight = el.style.fontWeight || el.getAttribute("data-weight") || ""
      const numericWeight = Number.parseInt(weight, 10)
      const isBold =
        weight.toLowerCase() === "bold" || (!Number.isNaN(numericWeight) && numericWeight >= 600)
      if (isBold) {
        const strong = document.createElement("strong")
        children.forEach((child) => strong.appendChild(child))
        return [strong]
      }
      return children
    }
    return children
  }

  Array.from(container.childNodes).forEach((node) => {
    sanitizeNode(node).forEach((child) => clean.appendChild(child))
  })

  clean.normalize()

  const text = clean.textContent?.replace(/\s+/g, "") ?? ""
  if (!text) return ""
  return clean.innerHTML
}

function normalizeBoldValue(value: string) {
  if (!value) return ""
  if (typeof document === "undefined") return value
  if (BOLD_TAG_PATTERN.test(value)) return sanitizeBoldOnlyHtml(value)
  const container = document.createElement("div")
  const lines = value.split(/\r?\n/)
  lines.forEach((line, index) => {
    container.appendChild(document.createTextNode(line))
    if (index < lines.length - 1) container.appendChild(document.createElement("br"))
  })
  return container.innerHTML
}

type BoldOnlyEditorProps = {
  value: string
  onChange: (value: string) => void
}

function BoldOnlyEditor({ value, onChange }: BoldOnlyEditorProps) {
  const editorRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!editorRef.current) return
    const normalized = normalizeBoldValue(value)
    if (editorRef.current.innerHTML !== normalized) {
      editorRef.current.innerHTML = normalized
    }
  }, [value])

  const commitChange = React.useCallback(() => {
    if (!editorRef.current) return
    const sanitized = sanitizeBoldOnlyHtml(editorRef.current.innerHTML)
    if (sanitized !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = sanitized
    }
    onChange(sanitized)
  }, [onChange])

  const handleInput = React.useCallback(() => {
    if (!editorRef.current) return
    onChange(editorRef.current.innerHTML)
  }, [onChange])

  const [isBold, setIsBold] = React.useState(false)

  const checkBoldState = React.useCallback(() => {
    if (typeof document !== "undefined") {
      setIsBold(document.queryCommandState("bold"))
    }
  }, [])

  const applyBold = React.useCallback(() => {
    if (!editorRef.current) return
    editorRef.current.focus()
    document.execCommand("bold", false)
    checkBoldState()
    commitChange()
  }, [commitChange, checkBoldState])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-semibold shadow-sm transition ${
            isBold
              ? "border-blue-500 bg-blue-100 text-blue-700"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={applyBold}
          aria-label="Bold"
          aria-pressed={isBold}
        >
          B
        </button>
        <span className="text-xs text-muted-foreground">Bold only</span>
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] md:text-sm whitespace-pre-wrap"
        onInput={handleInput}
        onBlur={commitChange}
        onSelect={checkBoldState}
        onKeyUp={checkBoldState}
        onMouseUp={checkBoldState}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            document.execCommand("insertLineBreak")
            handleInput()
            return
          }
          if (event.ctrlKey || event.metaKey) {
            const key = event.key.toLowerCase()
            if (key === "b") {
              event.preventDefault()
              applyBold()
              return
            }
            if (["i", "u"].includes(key)) {
              event.preventDefault()
            }
          }
        }}
        onPaste={(event) => {
          event.preventDefault()
          const text = event.clipboardData.getData("text/plain")
          if (!text) return
          const html = escapeHtml(text)
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .replace(/\n/g, "<br>")
          document.execCommand("insertHTML", false, html)
          commitChange()
        }}
        suppressContentEditableWarning
      />
    </div>
  )
}

function formatDateDayMonth(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("en-GB", { month: "2-digit", day: "2-digit" })
}

function getMondayBasedDay(date: Date) {
  return (date.getDay() + 6) % 7
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function initials(src: string) {
  return src
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

function dayKey(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function toDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function toDateOnlyIso(value?: string | null) {
  const date = toDate(value)
  if (!date) return ""
  return toISODate(new Date(date.getFullYear(), date.getMonth(), date.getDate()))
}

function systemTaskDisplayDate(task: SystemTaskOut): string | null {
  return task.effective_occurrence_date || task.next_occurrence_date || task.occurrence_date || null
}

function getTaskDateIso(task: Task): string {
  return toDateOnlyIso(task.due_date || task.start_date || null)
}

function formatTaskDateRangeDisplay(task: Pick<Task, "start_date" | "due_date">): string {
  const startIso = toDateOnlyIso(task.start_date || null)
  const dueIso = toDateOnlyIso(task.due_date || null)
  if (startIso && dueIso) {
    if (startIso === dueIso) return toDDMMYYYY(startIso)
    return `${toDDMMYYYY(startIso)} - ${toDDMMYYYY(dueIso)}`
  }
  if (dueIso) return toDDMMYYYY(dueIso)
  if (startIso) return toDDMMYYYY(startIso)
  return "-"
}

function isIsoWithinInclusiveRange(targetIso: string, startIso?: string | null, endIso?: string | null) {
  if (!targetIso) return false
  const normalizedStart = startIso || endIso || ""
  const normalizedEnd = endIso || startIso || ""
  if (!normalizedStart || !normalizedEnd) return false
  if (normalizedStart <= normalizedEnd) {
    return targetIso >= normalizedStart && targetIso <= normalizedEnd
  }
  return targetIso >= normalizedEnd && targetIso <= normalizedStart
}

function getSystemDateIso(task: SystemTaskOut): string {
  return toDateOnlyIso(systemTaskDisplayDate(task) || null)
}

function dayDiffInclusive(fromIso: string, toIso: string) {
  if (!fromIso || !toIso) return 0
  const fromDate = fromISODate(fromIso)
  const toDate = fromISODate(toIso)
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.max(0, Math.round((toDate.getTime() - fromDate.getTime()) / msPerDay))
}

function parseInternalNotes(notes?: string | null) {
  if (!notes) return {}
  const values: Record<string, string> = {}
  for (const raw of notes.split("\n")) {
    if (!raw.includes(":")) continue
    const [key, ...rest] = raw.split(":")
    const value = rest.join(":").trim()
    const normalizedKey = (key || "").trim().toUpperCase()
    if (!normalizedKey || !value) continue
    values[normalizedKey] = value
  }
  return values
}

function formatInternalDetails(notes?: string | null) {
  const values = parseInternalNotes(notes)
  const regj = values["REGJ"] || "-"
  const path = values["PATH"] || "-"
  const check = values["CHECKLISTA"] || values["CHECK"] || "-"
  const training = values["TRAINING"] || "-"
  const bzGroup = values["BZ GROUP"] || "-"
  if ([regj, path, check, training, bzGroup].every((value) => value === "-")) {
    return ""
  }
  return [
    `1.REGJ: ${regj}`,
    `2.PATH: ${path}`,
    `3.CHECKLISTA: ${check}`,
    `4.TRAINING: ${training}`,
    `5.BZ GROUP: ${bzGroup}`,
  ].join("\n")
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
  return "AM/PM"
}

function noProjectTypeLabel(task: Task) {
  if (task.is_bllok) return "BLLOK"
  if (task.is_1h_report) return "1H"
  if (task.is_r1) return "R1"
  if (task.is_personal) return "Personal"
  if (task.ga_note_origin_id) return "GA"
  return "Normal"
}

function fastReportSubtypeShort(task: Task) {
  const base = noProjectTypeLabel(task)
  if (base === "BLLOK") return "BLL"
  if (base === "Personal") return "P:"
  if (base === "Normal") return "N"
  return base
}

function getDisplayPriority(task: Task): TaskPriority {
  if (task.is_bllok) return "BLLOK"
  return (task.priority || "NORMAL") as TaskPriority
}

function reportStatusLabel(status?: Task["status"] | null) {
  if (!status) return "-"
  if (status === "IN_PROGRESS") return "In Progress"
  if (status === "WAITING_CONFIRMATION") return "Waiting Confirmation"
  if (status === "TODO") return "To Do"
  if (status === "DONE") return "Done"
  return status
}

function taskStatusLabel(task: Task) {
  if (task.status) return reportStatusLabel(task.status)
  if (task.completed_at) return "Done"
  return "-"
}

function formatSystemOccurrenceStatus(status?: string | null) {
  if (!status) return "-"
  if (status === "TODO") return "To Do"
  if (status === "IN_PROGRESS") return "In Progress"
  if (status === "WAITING_CONFIRMATION") return "Waiting Confirmation"
  if (status === "NOT_DONE") return "Not Done"
  if (status === "DONE") return "Done"
  if (status === "OPEN") return "Open"
  if (status === "SKIPPED") return "Skipped"
  return status
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

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

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
  | "det_ga"

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
type OneHItem = {
  title: string
  person: string
  date: string
  note?: string
  assignees?: string[]
  departmentId?: string
  isDone?: boolean
}
type PersonalItem = { title: string; person: string; date: string; note?: string; assignees?: string[] }
type ExternalItem = {
  title: string
  date: string
  time: string
  platform: string
  owner: string
  assignees?: string[]
  department?: string
}
type InternalItem = {
  title: string
  date: string
  time: string
  platform: string
  owner: string
  assignees?: string[]
  department?: string
}
type R1Item = {
  title: string
  date: string
  owner: string
  note?: string
  assignees?: string[]
  departmentId?: string
  isDone?: boolean
}
type ProblemItem = {
  entryId?: string
  title: string
  person: string
  date: string
  note?: string
  everyday?: boolean
  createdDate?: string
}
type FeedbackItem = {
  entryId?: string
  title: string
  person: string
  date: string
  note?: string
  everyday?: boolean
  createdDate?: string
}
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
  taskId?: string
  templateId?: string | null
  matchTitle?: string
}

type CommonGaTableEntry = {
  kind: "task" | "system"
  title: string
  assignees?: string[]
  time?: string
  bzWithLabel?: string
  taskId?: string
  templateId?: string | null
  matchTitle?: string
}

type GaTimeSlotEntry = {
  id: string
  user_id: string
  day_of_week: number
  start_time: string
  end_time: string
  content: string
  created_at: string
  updated_at: string
}

type GaTimeRow = {
  start: string
  end: string
  label: string
  nrLabel: string
  isSpecial?: boolean
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

const ALL_USERS_INITIALS = "ALL"
const FEEDBACK_DAILY_MARKER = "[EVERYDAY]"

const GA_TIME_ROWS: readonly GaTimeRow[] = [
  { start: "00:00", end: "00:01", label: "", nrLabel: "", isSpecial: true },
  { start: "00:01", end: "00:02", label: "", nrLabel: "", isSpecial: true },
  { start: "08:00", end: "09:00", label: "08:00 - 09:00", nrLabel: "1" },
  { start: "09:00", end: "10:00", label: "09:00 - 10:00", nrLabel: "2" },
  { start: "10:00", end: "11:00", label: "10:00 - 11:00", nrLabel: "3" },
  { start: "11:00", end: "12:00", label: "11:00 - 12:00", nrLabel: "4" },
  { start: "12:00", end: "13:00", label: "12:00 - 13:00", nrLabel: "5" },
  { start: "13:00", end: "13:30", label: "13:00 - 13:30", nrLabel: "6" },
  { start: "13:30", end: "14:00", label: "13:30 - 14:00", nrLabel: "7" },
  { start: "14:00", end: "15:00", label: "14:00 - 15:00", nrLabel: "8" },
  { start: "15:00", end: "16:00", label: "15:00 - 16:00", nrLabel: "9" },
  { start: "16:00", end: "16:30", label: "16:00 - 16:30", nrLabel: "10" },
  { start: "16:30", end: "17:00", label: "16:30 - 17:00", nrLabel: "11" },
  { start: "17:00", end: "18:00", label: "17:00 - 18:00", nrLabel: "12" },
  { start: "18:00", end: "19:00", label: "18:00 - 19:00", nrLabel: "13" },
  { start: "19:00", end: "20:00", label: "19:00 - 20:00", nrLabel: "14" },
  { start: "20:00", end: "21:00", label: "20:00 - 21:00", nrLabel: "15" },
  { start: "21:00", end: "22:00", label: "21:00 - 22:00", nrLabel: "16" },
] as const

const parseFeedbackNote = (note: string | null | undefined) => {
  const raw = note || ""
  const everyday = raw.includes(FEEDBACK_DAILY_MARKER)
  const cleaned = raw.split(FEEDBACK_DAILY_MARKER).join("").trim()
  return { note: cleaned || undefined, everyday }
}

const commonViewInitials = (name: string) => {
  const cleaned = name.trim()
  if (!cleaned) return "?"
  const parts = cleaned.split(/\s+/)
  const first = parts[0]?.[0] || ""
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : ""
  return `${first}${last}`.toUpperCase()
}

const stripInitialsPrefix = (value: string) => value
const normalizeCommonGaTitle = (value?: string | null) =>
  stripInitialsPrefix(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
const normalizeAssigneeList = (value?: string) =>
  value
    ? value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    : []
const entryAssignees = (entry: { assignees?: string[]; person?: string; owner?: string }) =>
  entry.assignees && entry.assignees.length
    ? entry.assignees
    : normalizeAssigneeList(entry.person || entry.owner || "")
const mergeTaskEntriesByVisibleTitle = <
  T extends { title: string; assignees?: string[]; person?: string; owner?: string }
>(
  entries: T[]
) => {
  const merged = new Map<string, T>()
  entries.forEach((entry) => {
    const visibleTitle = stripInitialsPrefix(entry.title).trim()
    const key = visibleTitle.toLowerCase()
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { ...entry, assignees: [...entryAssignees(entry)] })
      return
    }
    const combinedAssignees = Array.from(new Set([...entryAssignees(existing), ...entryAssignees(entry)]))
    merged.set(key, { ...existing, assignees: combinedAssignees })
  })
  return Array.from(merged.values())
}
const getCommonGaEntryMatchKeys = (entry: {
  templateId?: string | null
  matchTitle?: string | null
  title?: string | null
}) => {
  const keys: string[] = []
  if (entry.templateId) keys.push(`template:${entry.templateId}`)
  const titleKey = normalizeCommonGaTitle(entry.matchTitle || entry.title || "")
  if (titleKey) keys.push(`title:${titleKey}`)
  return keys
}
const mergeLabelList = (left?: string, right?: string) => {
  const labels = [...(left ? left.split(",") : []), ...(right ? right.split(",") : [])]
    .map((value) => value.trim())
    .filter(Boolean)
  return Array.from(new Set(labels)).join(", ")
}
const formatBzTimeDisplay = (value?: string | null) => formatTimeLabel(value || "").trim() || "-"

const fromISODate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
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
const parseTimeValue = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return { hours, minutes }
}
const parseTimeToMinutes = (value?: string | null) => {
  if (!value) return null
  let normalized = value.trim()
  if (!normalized) return null
  normalized = normalized.replace(/[()]/g, "").trim()
  const lower = normalized.toLowerCase()
  if (lower === "tbd" || lower === "n/a" || lower === "na") return null
  if (
    normalized.includes("–") ||
    normalized.includes("—") ||
    normalized.includes("â€“") ||
    normalized.includes("â€”") ||
    normalized.includes("-")
  ) {
    const separator = normalized.includes("–")
      ? "–"
      : normalized.includes("—")
        ? "—"
        : normalized.includes("â€“")
          ? "â€“"
          : normalized.includes("â€”")
            ? "â€”"
            : "-"
    const [firstPartRaw, secondPartRaw] = normalized.split(separator).map((part) => part.trim())
    const secondPart = secondPartRaw || ""
    const firstPart = firstPartRaw || ""
    const trailingMeridianMatch = /\b(am|pm)\b/i.exec(secondPart)
    const firstHasMeridian = /\b(am|pm)\b/i.test(firstPart)
    normalized =
      trailingMeridianMatch && firstPart && !firstHasMeridian
        ? `${firstPart} ${trailingMeridianMatch[1]}`
        : firstPart
  }
  const amPmMatch = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)\b/i.exec(normalized)
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
  const timeMatch = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(normalized)
  if (!timeMatch) return null
  const hours = Number(timeMatch[1])
  const minutes = Number(timeMatch[2])
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}
const formatTimeLabel = (value?: string) => {
  if (!value) return ""
  const normalized = value.trim()
  if (!normalized || normalized.toLowerCase() === "tbd") return normalized
  const amPmMatch = /^(\d{1,2}:\d{2})(?::\d{2})?\s*(am|pm)\b/i.exec(normalized)
  if (amPmMatch) {
    return `${amPmMatch[1]} ${amPmMatch[2].toUpperCase()}`
  }
  const secondsMatch = /^(\d{1,2}:\d{2}):\d{2}$/.exec(normalized)
  if (secondsMatch) {
    return secondsMatch[1]
  }
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
const getDayCode = (d: Date) => {
  const codes = ["H", "M", "MR", "E", "P", "S", "D"]
  return codes[d.getDay() === 0 ? 6 : d.getDay() - 1] || ""
}

export default function AdminTasksPage() {
  const { apiFetch, user } = useAuth()
  const confirm = useConfirm()
  type AssigneeUser = User | UserLookup
  const [tasks, setTasks] = React.useState<Task[]>([])
  const [systemTasks, setSystemTasks] = React.useState<SystemTaskOut[]>([])
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [users, setUsers] = React.useState<AssigneeUser[]>([])
  const [loadingTasks, setLoadingTasks] = React.useState(true)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [viewFilter, setViewFilter] = React.useState<"all" | "tasks" | "system">("all")
  const [priorityFilter, setPriorityFilter] = React.useState<"all" | TaskPriority>("all")
  const [dayFilter, setDayFilter] = React.useState<string>("all")
  const [dateFilter, setDateFilter] = React.useState("")

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [startDate, setStartDate] = React.useState("")
  const [startDateDisplay, setStartDateDisplay] = React.useState("")
  const [dueDate, setDueDate] = React.useState("")
  const [dueDateDisplay, setDueDateDisplay] = React.useState("")
  const [taskPriority, setTaskPriority] = React.useState<TaskPriority>("NORMAL")
  const [finishPeriod, setFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(
    FINISH_PERIOD_NONE_VALUE
  )
  const [fastTaskOpen, setFastTaskOpen] = React.useState(false)
  const [creatingFastTask, setCreatingFastTask] = React.useState(false)
  const [fastTaskTitle, setFastTaskTitle] = React.useState("")
  const [fastTaskDescription, setFastTaskDescription] = React.useState("")
  const [fastTaskType, setFastTaskType] = React.useState<(typeof NO_PROJECT_TYPES)[number]["id"]>("normal")
  const [fastTaskAssignees, setFastTaskAssignees] = React.useState<string[]>([])
  const [selectFastTaskAssigneesOpen, setSelectFastTaskAssigneesOpen] = React.useState(false)
  const [fastTaskStartDate, setFastTaskStartDate] = React.useState("")
  const [fastTaskDueDate, setFastTaskDueDate] = React.useState("")
  const [fastTaskDeadlineImportant, setFastTaskDeadlineImportant] = React.useState(false)
  const [fastTaskFinishPeriod, setFastTaskFinishPeriod] = React.useState<
    TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE
  >(FINISH_PERIOD_NONE_VALUE)

  // Edit task state
  const [editOpen, setEditOpen] = React.useState(false)
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null)
  const [editTitle, setEditTitle] = React.useState("")
  const [editDescription, setEditDescription] = React.useState("")
  const [editStartDate, setEditStartDate] = React.useState("")
  const [editStartDateDisplay, setEditStartDateDisplay] = React.useState("")
  const [editDueDate, setEditDueDate] = React.useState("")
  const [editDueDateDisplay, setEditDueDateDisplay] = React.useState("")
  const [editingTaskIsFast, setEditingTaskIsFast] = React.useState(false)
  const [editPriority, setEditPriority] = React.useState<TaskPriority>("NORMAL")
  const [editFinishPeriod, setEditFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(
    FINISH_PERIOD_NONE_VALUE
  )
  const [originalIsBllok, setOriginalIsBllok] = React.useState(false)
  const [savingEdit, setSavingEdit] = React.useState(false)
  const [deletingTaskId, setDeletingTaskId] = React.useState<string | null>(null)

  const printedAt = React.useMemo(() => new Date(), [])
  const printInitials = initials(user?.full_name || user?.username || "")
  const todayDate = React.useMemo(() => new Date(), [])
  const todayIso = React.useMemo(() => todayDate.toISOString().slice(0, 10), [todayDate])
  const [allTasksDateFrom, setAllTasksDateFrom] = React.useState(() => todayIso)
  const [allTasksDateTo, setAllTasksDateTo] = React.useState(() => todayIso)
  const [taskStatusUpdating, setTaskStatusUpdating] = React.useState<Record<string, boolean>>({})
  const [systemStatusOverrides, setSystemStatusOverrides] = React.useState<Record<string, string>>({})
  const [fastEditOpen, setFastEditOpen] = React.useState(false)
  const [fastEditTaskId, setFastEditTaskId] = React.useState<string | null>(null)
  const [fastEditTitle, setFastEditTitle] = React.useState("")
  const [fastEditStartDate, setFastEditStartDate] = React.useState("")
  const [fastEditDueDate, setFastEditDueDate] = React.useState("")
  const [fastEditPriority, setFastEditPriority] = React.useState<TaskPriority>("NORMAL")
  const [fastEditStatus, setFastEditStatus] = React.useState("TODO")
  const [fastEditConfirmationAssigneeId, setFastEditConfirmationAssigneeId] = React.useState("")
  const [fastEditOriginalIsBllok, setFastEditOriginalIsBllok] = React.useState(false)
  const [fastEditSaving, setFastEditSaving] = React.useState(false)
  const [pendingStatusTaskId, setPendingStatusTaskId] = React.useState<string | null>(null)
  const [pendingStatusValue, setPendingStatusValue] = React.useState("TODO")
  const [pendingConfirmationAssigneeId, setPendingConfirmationAssigneeId] = React.useState("")

  const [printTarget, setPrintTarget] = React.useState<"common" | "ga-time" | "all-tasks" | null>(null)
  const [printTotalPages, setPrintTotalPages] = React.useState(1)

  const [dailyReport, setDailyReport] = React.useState<DailyReportResponse | null>(null)
  const [loadingDailyReport, setLoadingDailyReport] = React.useState(false)
  const [showDailyUserReport, setShowDailyUserReport] = React.useState(true)
  const [dailyReportCommentEdits, setDailyReportCommentEdits] = React.useState<Record<string, string>>({})
  const [savingDailyReportComments, setSavingDailyReportComments] = React.useState<Record<string, boolean>>({})
  const [allTasksReportCommentEdits, setAllTasksReportCommentEdits] = React.useState<Record<string, string>>({})
  const [savingAllTasksReportComments, setSavingAllTasksReportComments] = React.useState<Record<string, boolean>>({})
  const [exportingDailyReport, setExportingDailyReport] = React.useState(false)
  const [showAllTasksReport, setShowAllTasksReport] = React.useState(false)
  const [exportingAllTasks, setExportingAllTasks] = React.useState(false)
  const [exportingCommonView, setExportingCommonView] = React.useState(false)
  const [exportingGaTime, setExportingGaTime] = React.useState(false)
  const dailyReportScrollRef = React.useRef<HTMLDivElement | null>(null)
  const dailyReportDragRef = React.useRef({ isDragging: false, startX: 0, startScrollLeft: 0 })
  const [isDraggingDailyReport, setIsDraggingDailyReport] = React.useState(false)

  const [commonWeekStart, setCommonWeekStart] = React.useState<Date>(() => getMonday(new Date()))
  const commonWeekISOs = React.useMemo(() => getWeekdays(commonWeekStart).map(toISODate), [commonWeekStart])
  const thisCommonWeekIso = React.useMemo(() => toISODate(getMonday(new Date())), [])
  const nextCommonWeekIso = React.useMemo(() => toISODate(addDays(getMonday(new Date()), 7)), [])
  const [commonUsers, setCommonUsers] = React.useState<User[]>([])
  const [commonDepartments, setCommonDepartments] = React.useState<Department[]>([])
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
  const [commonLoading, setCommonLoading] = React.useState(false)
  const [commonError, setCommonError] = React.useState<string | null>(null)
  const [gaSystemByDay, setGaSystemByDay] = React.useState<Record<string, DailyReportSystemOccurrence[]>>({})
  const [gaSystemLoading, setGaSystemLoading] = React.useState(false)
  const [gaSystemError, setGaSystemError] = React.useState<string | null>(null)
  const [gaTimeEntries, setGaTimeEntries] = React.useState<GaTimeSlotEntry[]>([])
  const [gaTimeLoading, setGaTimeLoading] = React.useState(false)
  const [gaTimeError, setGaTimeError] = React.useState<string | null>(null)
  const [gaTimeSaving, setGaTimeSaving] = React.useState<Record<string, boolean>>({})
  const [gaTimeDeleting, setGaTimeDeleting] = React.useState<Record<string, boolean>>({})
  const [gaTimeEditingId, setGaTimeEditingId] = React.useState<string | null>(null)
  const [gaTimeDrafts, setGaTimeDrafts] = React.useState<Record<string, string>>({})
  const [gaTimeAddingCell, setGaTimeAddingCell] = React.useState<string | null>(null)
  const [gaTimeAddDrafts, setGaTimeAddDrafts] = React.useState<Record<string, string>>({})
  const [secondarySectionsReady, setSecondarySectionsReady] = React.useState(false)
  const confirmerCandidates = React.useMemo(
    () => getConfirmerCandidates(users as UserLookup[]),
    [users]
  )

  const parseFilenameFromDisposition = React.useCallback((headerValue: string | null) => {
    if (!headerValue) return ""
    const match =
      /filename\*=(?:UTF-8'')?([^;]+)/i.exec(headerValue) || /filename=\"?([^\";]+)\"?/i.exec(headerValue)
    if (!match) return ""
    try {
      return decodeURIComponent(match[1].trim().replace(/^\"|\"$/g, ""))
    } catch {
      return match[1].trim().replace(/^\"|\"$/g, "")
    }
  }, [])

  const handleSectionPrint = React.useCallback((target: "common" | "ga-time" | "all-tasks") => {
    setPrintTarget(target)
    window.setTimeout(() => window.print(), 80)
  }, [])

  React.useEffect(() => {
    if (loadingTasks || secondarySectionsReady) return
    const timeoutId = window.setTimeout(() => {
      setSecondarySectionsReady(true)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [loadingTasks, secondarySectionsReady])

  const commonDepartmentsById = React.useMemo(
    () => new Map(commonDepartments.map((d) => [d.id, d])),
    [commonDepartments]
  )
  const getDepartmentMeta = React.useCallback(
    (departmentId?: string) => {
      const dept = departmentId ? commonDepartmentsById.get(departmentId) : undefined
      const name = (dept?.name || "").trim()
      const code = (dept?.code || "").trim().toUpperCase()
      const lower = name.toLowerCase()
      let rank = 3
      if (lower.includes("development")) rank = 0
      else if (lower.includes("graphic design")) rank = 1
      else if (code === "PCM" || lower.includes("project content") || lower.includes("content manager")) rank = 2
      const sortName = name || "ZZZ"
      return { rank, name: sortName }
    },
    [commonDepartmentsById]
  )
  const getPersonSortKey = React.useCallback(
    (item: { person?: string; owner?: string; assignees?: string[] }) => {
      const primary = (item.person || item.owner || "").trim()
      if (primary) return primary.toLowerCase()
      const assignees = (item.assignees || [])
        .map((name) => (name || "").trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
      const combined = assignees.join(", ")
      return (combined || "Unknown").trim().toLowerCase()
    },
    []
  )
  const compareTaskOrder = React.useCallback(
    (
      a: { isDone?: boolean; departmentId?: string; title?: string; person?: string; owner?: string; assignees?: string[] },
      b: { isDone?: boolean; departmentId?: string; title?: string; person?: string; owner?: string; assignees?: string[] }
    ) => {
      const doneA = a.isDone ? 1 : 0
      const doneB = b.isDone ? 1 : 0
      if (doneA !== doneB) return doneA - doneB
      const metaA = getDepartmentMeta(a.departmentId)
      const metaB = getDepartmentMeta(b.departmentId)
      if (metaA.rank !== metaB.rank) return metaA.rank - metaB.rank
      if (metaA.rank === 3) {
        const nameCmp = metaA.name.localeCompare(metaB.name)
        if (nameCmp) return nameCmp
      }
      const personA = getPersonSortKey(a)
      const personB = getPersonSortKey(b)
      if (personA !== personB) return personA.localeCompare(personB)
      return (a.title || "").localeCompare(b.title || "")
    },
    [getDepartmentMeta, getPersonSortKey]
  )
  const sortTasksByOrder = React.useCallback(
    <T extends { date: string; isDone?: boolean; departmentId?: string; title?: string; person?: string; owner?: string; assignees?: string[] }>(
      items: T[]
    ) => {
      const sorted = [...items]
      sorted.sort((a, b) => compareTaskOrder(a, b))
      return sorted
    },
    [compareTaskOrder]
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
    []
  )

  React.useEffect(() => {
    if (!secondarySectionsReady) return
    let mounted = true
    async function loadCommonWeek() {
      setCommonLoading(true)
      setCommonError(null)
      try {
        const weekStartIso = toISODate(commonWeekStart)
        const include = "users,departments,entries,meetings,system_tasks,tasks"
        const res = await apiFetch(
          `/common-view?week_start=${encodeURIComponent(weekStartIso)}&include=${encodeURIComponent(include)}&include_all_departments=true`
        )
        if (!res?.ok) {
          throw new Error(`common_view_failed_${res?.status}`)
        }
        const payload = (await res.json()) as CommonViewPayload
        const normalizedFeedback = payload.items.feedback.map((item) => {
          const parsed = parseFeedbackNote(item.note)
          return {
            ...item,
            note: parsed.note,
            everyday: parsed.everyday,
            date: parsed.everyday ? payload.week_start : item.date,
          }
        })
        const normalizedProblems = payload.items.problems.map((item) => {
          const parsed = parseFeedbackNote(item.note)
          return {
            ...item,
            note: parsed.note,
            everyday: parsed.everyday,
            date: parsed.everyday ? payload.week_start : item.date,
          }
        })
        const normalizedOneH = payload.items.oneH.map((item: any) => ({
          ...item,
          departmentId: item.departmentId || item.department_id || undefined,
          isDone: Boolean(item.isDone),
        }))
        const normalizedR1 = payload.items.r1.map((item: any) => ({
          ...item,
          departmentId: item.departmentId || item.department_id || undefined,
          isDone: Boolean(item.isDone),
        }))
        if (!mounted) return
        setCommonUsers(payload.users || [])
        setCommonDepartments(payload.departments || [])
        setCommonData({
          late: payload.items.late,
          absent: payload.items.absent,
          leave: payload.items.leave,
          blocked: payload.items.blocked,
          oneH: normalizedOneH,
          personal: payload.items.personal,
          external: payload.items.external,
          internal: payload.items.internal,
          r1: normalizedR1,
          problems: normalizedProblems,
          feedback: normalizedFeedback,
          priority: payload.items.priority,
          bz: payload.items.bz,
        })
      } catch (err) {
        console.error("Failed to load common view data", err)
        if (mounted) setCommonError("Failed to load common week table.")
      } finally {
        if (mounted) setCommonLoading(false)
      }
    }
    void loadCommonWeek()
    return () => {
      mounted = false
    }
  }, [apiFetch, commonWeekStart, secondarySectionsReady])

  const isAdmin = user?.role === "ADMIN"
  const ganeUser = React.useMemo(
    () =>
      users.find((person) => {
        const username = person.username?.toLowerCase()
        const email =
          "email" in person && typeof person.email === "string" ? person.email.toLowerCase() : null
        return username === "gane.arifaj" || email === "ga@primexeu.com"
      }) ?? null,
    [users]
  )
  const ganeUserId = ganeUser?.id ?? null

  const load = React.useCallback(async () => {
    setLoadingTasks(true)
    try {
      const [tasksRes, departmentsRes, systemTasksRes] = await Promise.all([
        apiFetch("/tasks?include_done=true"),
        apiFetch("/departments"),
        apiFetch("/system-tasks?only_active=false"),
      ])
      if (tasksRes.ok) {
        setTasks((await tasksRes.json()) as Task[])
      }
      if (departmentsRes.ok) {
        setDepartments((await departmentsRes.json()) as Department[])
      }
      if (systemTasksRes.ok) {
        setSystemTasks((await systemTasksRes.json()) as SystemTaskOut[])
      }
      if (user?.role === "STAFF") {
        const usersList = await fetchUsersLookupCached(apiFetch)
        if (usersList) setUsers(usersList as AssigneeUser[])
      } else {
        const usersRes = await apiFetch("/users")
        if (usersRes.ok) setUsers((await usersRes.json()) as AssigneeUser[])
      }
    } finally {
      setLoadingTasks(false)
    }
  }, [apiFetch, user?.role])

  const adminDepartmentId = React.useMemo(() => {
    const byCode = departments.find((dept) => dept.code?.toUpperCase() === "GA")
    if (byCode) return byCode.id
    const byName = departments.find((dept) => dept.name?.toUpperCase().includes("GA"))
    return byName?.id ?? null
  }, [departments])

  const fastTaskAssigneeLabel = React.useMemo(() => {
    if (fastTaskAssignees.length === 0) return "Unassigned"
    if (users.length && fastTaskAssignees.length === users.length) return "All users"
    if (fastTaskAssignees.length === 1) {
      const selected = users.find((u) => u.id === fastTaskAssignees[0])
      return selected?.full_name || selected?.username || "1 selected"
    }
    return `${fastTaskAssignees.length} selected`
  }, [fastTaskAssignees, users])

  React.useEffect(() => {
    if (!secondarySectionsReady) return
    let mounted = true
    async function loadGaTimeSlots() {
      setGaTimeLoading(true)
      setGaTimeError(null)
      try {
        const weekStartIso = toISODate(commonWeekStart)
        const res = await apiFetch(`/ga-time-slots?week_start=${encodeURIComponent(weekStartIso)}`)
        if (!res.ok) {
          throw new Error(`ga_time_slots_failed_${res.status}`)
        }
        const data = (await res.json()) as GaTimeSlotEntry[]
        if (!mounted) return
        setGaTimeEntries(data)
      } catch (err) {
        console.error("Failed to load GA time slots", err)
        if (mounted) setGaTimeError("Failed to load GA time slots.")
      } finally {
        if (mounted) setGaTimeLoading(false)
      }
    }
    void loadGaTimeSlots()
    return () => {
      mounted = false
    }
  }, [apiFetch, commonWeekStart, secondarySectionsReady])

  React.useEffect(() => {
    if (!secondarySectionsReady) return
    let mounted = true
    async function loadGaSystemByDay() {
      if (!ganeUserId) {
        setGaSystemByDay({})
        return
      }
      setGaSystemLoading(true)
      setGaSystemError(null)
      try {
        const results = await Promise.all(
          commonWeekISOs.map(async (iso) => {
            const params: Record<string, string> = { day: iso, user_id: ganeUserId }
            if (adminDepartmentId) params.department_id = adminDepartmentId
            const qs = new URLSearchParams(params)
            const res = await apiFetch(`/reports/daily?${qs.toString()}`)
            if (!res.ok) throw new Error(`daily_report_failed_${res.status}`)
            const payload = (await res.json()) as DailyReportResponse
            const occurrences = [...(payload.system_today || []), ...(payload.system_overdue || [])].filter(
              (occ) => occ.occurrence_date === iso
            )
            return [iso, occurrences] as const
          })
        )
        if (!mounted) return
        const nextMap: Record<string, DailyReportSystemOccurrence[]> = {}
        for (const [iso, occurrences] of results) {
          nextMap[iso] = occurrences
        }
        setGaSystemByDay(nextMap)
      } catch (err) {
        console.error("Failed to load GA system occurrences", err)
        if (mounted) setGaSystemError("Failed to load DET GA system tasks.")
      } finally {
        if (mounted) setGaSystemLoading(false)
      }
    }
    void loadGaSystemByDay()
    return () => {
      mounted = false
    }
  }, [adminDepartmentId, apiFetch, commonWeekISOs, ganeUserId, secondarySectionsReady])

  const loadDailyReport = React.useCallback(async () => {
    if (!user?.id) return
    setLoadingDailyReport(true)
    try {
      const targetUserId = ganeUserId ?? user.id
      const params: Record<string, string> = {
        day: todayIso,
        user_id: targetUserId,
      }
      if (adminDepartmentId) {
        params.department_id = adminDepartmentId
      }
      const qs = new URLSearchParams(params)
      const res = await apiFetch(`/reports/daily?${qs.toString()}`)
      if (!res.ok) {
        toast.error("Failed to load daily report")
        return
      }
      setDailyReport((await res.json()) as DailyReportResponse)
    } catch (error) {
      console.error("Failed to load daily report", error)
      toast.error("Failed to load daily report")
    } finally {
      setLoadingDailyReport(false)
    }
  }, [adminDepartmentId, apiFetch, ganeUserId, todayIso, user?.id])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    if (!showDailyUserReport) return
    void loadDailyReport()
  }, [loadDailyReport, showDailyUserReport])

  React.useEffect(() => {
    const handleBeforePrint = () => {
      if (printTarget === "ga-time" || printTarget === "common") {
        setPrintTotalPages(1)
        return
      }

      const printRoot = document.querySelector(`[data-print-target="${printTarget || ""}"]`) as HTMLElement | null
      const activeSection = printRoot?.querySelector(
        `.print-section[data-print-section="${printTarget}"]`
      ) as HTMLElement | null

      const dpi = 96
      const pageHeightPx = 11 * dpi - (0.36 + 0.51) * dpi
      const sectionHeight = activeSection?.scrollHeight || activeSection?.offsetHeight || 0
      const bodyHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight
      )
      const measuredHeight = sectionHeight || bodyHeight
      const totalPages = Math.max(1, Math.ceil(measuredHeight / pageHeightPx))
      setPrintTotalPages(totalPages)
    }
    const handleAfterPrint = () => setPrintTarget(null)
    window.addEventListener("beforeprint", handleBeforePrint)
    window.addEventListener("afterprint", handleAfterPrint)
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint)
      window.removeEventListener("afterprint", handleAfterPrint)
    }
  }, [printTarget])


  const submitTask = async () => {
    if (!title.trim()) {
      toast.error("Task title is required")
      return
    }
    if (!ganeUserId) {
      toast.error("Gane Arifaj user not found. Cannot assign task.")
      return
    }
    setCreating(true)
    try {
      const startDateValue = startDate ? new Date(startDate).toISOString() : null
      const dueDateValue = dueDate ? new Date(dueDate).toISOString() : null
      const isBllok = taskPriority === "BLLOK"
      const actualPriority: "NORMAL" | "HIGH" = isBllok ? "NORMAL" : (taskPriority === "HIGH" ? "HIGH" : "NORMAL")
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        status: "TODO",
        priority: actualPriority,
        finish_period: finishPeriod === FINISH_PERIOD_NONE_VALUE ? null : finishPeriod,
        start_date: startDateValue,
        due_date: dueDateValue,
        is_deadline_important: false,
        assigned_to: ganeUserId,
        ...(isBllok && { is_bllok: true }),
      }
      const res = await apiFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail = "Failed to create task"
        try {
          const data = (await res.json()) as { detail?: string | Array<{ msg?: string }> }
          if (data?.detail) {
            if (typeof data.detail === "string") {
              detail = data.detail
            } else if (Array.isArray(data.detail) && data.detail.length > 0) {
              detail = data.detail.map((e) => e.msg || "Validation error").join(", ")
            }
          }
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const created = (await res.json()) as Task
      setTasks((prev) => [created, ...prev])
      setCreateOpen(false)
      setTitle("")
      setDescription("")
      setStartDate("")
      setStartDateDisplay("")
      setDueDate("")
      setDueDateDisplay("")
      setTaskPriority("NORMAL")
      setFinishPeriod(FINISH_PERIOD_NONE_VALUE)
      toast.success("Task created")
    } finally {
      setCreating(false)
    }
  }

  const departmentMap = React.useMemo(() => new Map(departments.map((dept) => [dept.id, dept])), [departments])
  const userMap = React.useMemo(() => new Map(users.map((person) => [person.id, person])), [users])
  const taskAssigneeInitials = React.useCallback(
    (task: Task) => {
      const ids = new Set<string>()
      if (task.assigned_to) ids.add(task.assigned_to)
      if (task.assignees) {
        for (const assignee of task.assignees) {
          if (assignee.id) ids.add(assignee.id)
        }
      }
      if (!ids.size) return ""
      const labels = Array.from(ids)
        .map((userId) => {
          const userFromMap = userMap.get(userId)
          if (userFromMap) return userFromMap.full_name || userFromMap.username || ""
          const assigneeFromArray = task.assignees?.find((a) => a.id === userId)
          return assigneeFromArray?.full_name || assigneeFromArray?.username || ""
        })
        .filter(Boolean)
      if (!labels.length) return ""
      return labels.map((label) => initials(label)).join(", ")
    },
    [userMap]
  )
  const systemAssigneeInitials = React.useCallback(
    (task: SystemTaskOut) => {
      const ids = new Set<string>()
      if (task.default_assignee_id) ids.add(task.default_assignee_id)
      if (task.assignees) {
        for (const assignee of task.assignees) {
          if (assignee.id) ids.add(assignee.id)
        }
      }
      if (!ids.size) return ""
      const labels = Array.from(ids)
        .map((userId) => {
          const userFromMap = userMap.get(userId)
          if (userFromMap) return userFromMap.full_name || userFromMap.username || ""
          const assigneeFromArray = task.assignees?.find((a) => a.id === userId)
          return assigneeFromArray?.full_name || assigneeFromArray?.username || ""
        })
        .filter(Boolean)
      if (!labels.length) return ""
      return labels.map((label) => initials(label)).join(", ")
    },
    [userMap]
  )
  const taskAssigneeDepartments = React.useCallback(
    (task: Task) => {
      const ids = new Set<string>()
      if (task.assigned_to) ids.add(task.assigned_to)
      if (task.assignees) {
        for (const assignee of task.assignees) {
          if (assignee.id) ids.add(assignee.id)
        }
      }
      if (!ids.size) return ""
      const labels = Array.from(ids)
        .map((userId) => {
          const userFromMap = userMap.get(userId)
          const deptId =
            userFromMap?.department_id || task.assignees?.find((assignee) => assignee.id === userId)?.department_id
          if (!deptId) return ""
          const dept = departmentMap.get(deptId)
          if (!dept) return ""
          const code = (dept.code || "").trim().toUpperCase()
          return code || (dept.name || "").trim()
        })
        .filter(Boolean)
      if (!labels.length) return ""
      return Array.from(new Set(labels)).sort().join(", ")
    },
    [departmentMap, userMap]
  )
  const systemAssigneeDepartments = React.useCallback(
    (task: SystemTaskOut) => {
      const ids = new Set<string>()
      if (task.default_assignee_id) ids.add(task.default_assignee_id)
      if (task.assignees) {
        for (const assignee of task.assignees) {
          if (assignee.id) ids.add(assignee.id)
        }
      }
      if (!ids.size) return ""
      const labels = Array.from(ids)
        .map((userId) => {
          const userFromMap = userMap.get(userId)
          const deptId =
            userFromMap?.department_id || task.assignees?.find((assignee) => assignee.id === userId)?.department_id
          if (!deptId) return ""
          const dept = departmentMap.get(deptId)
          if (!dept) return ""
          const code = (dept.code || "").trim().toUpperCase()
          return code || (dept.name || "").trim()
        })
        .filter(Boolean)
      if (!labels.length) return ""
      return Array.from(new Set(labels)).sort().join(", ")
    },
    [departmentMap, userMap]
  )
  const taskAssigneeBadges = React.useCallback(
    (task: Task) => {
      const ids = new Set<string>()
      if (task.assigned_to) ids.add(task.assigned_to)
      if (task.assignees) {
        for (const assignee of task.assignees) {
          if (assignee.id) ids.add(assignee.id)
        }
      }
      if (!ids.size) return []
      const labels = Array.from(ids)
        .map((userId) => {
          const userFromMap = userMap.get(userId)
          if (userFromMap) return userFromMap.full_name || userFromMap.username || ""
          const assigneeFromArray = task.assignees?.find((a) => a.id === userId)
          return assigneeFromArray?.full_name || assigneeFromArray?.username || ""
        })
        .filter(Boolean)
      return labels.map((label, index) => ({
        id: `${task.id}-${index}`,
        value: initials(label),
        label,
      }))
    },
    [userMap]
  )
  const systemAssigneeBadges = React.useCallback(
    (task: SystemTaskOut) => {
      const ids = new Set<string>()
      if (task.default_assignee_id) ids.add(task.default_assignee_id)
      if (task.assignees) {
        for (const assignee of task.assignees) {
          if (assignee.id) ids.add(assignee.id)
        }
      }
      if (!ids.size) return []
      const labels = Array.from(ids)
        .map((userId) => {
          const userFromMap = userMap.get(userId)
          if (userFromMap) return userFromMap.full_name || userFromMap.username || ""
          const assigneeFromArray = task.assignees?.find((a) => a.id === userId)
          return assigneeFromArray?.full_name || assigneeFromArray?.username || ""
        })
        .filter(Boolean)
      return labels.map((label, index) => ({
        id: `${task.id}-${index}`,
        value: initials(label),
        label,
      }))
    },
    [userMap]
  )

  const adminTaskRows = React.useMemo(() => {
    const rows: Task[] = []
    const hasGane = Boolean(ganeUserId)

    for (const task of tasks) {
      const isSystem = Boolean(task.system_template_origin_id || task.task_type === "system")
      if (isSystem) continue
      if (task.is_active === false) continue

      const assignedToGane =
        hasGane &&
        (task.assigned_to === ganeUserId ||
          task.assignees?.some((assignee) => assignee.id === ganeUserId) ||
          task.alignment_user_ids?.includes(ganeUserId as string))
      const inGaDepartment = Boolean(adminDepartmentId && task.department_id === adminDepartmentId)
      if (!assignedToGane && !inGaDepartment) continue

      rows.push(task)
    }

    return rows
  }, [adminDepartmentId, ganeUserId, tasks])

  const filteredTasks = React.useMemo(() => {
    if (viewFilter === "system") return []
    let filtered = adminTaskRows
    if (priorityFilter !== "all") {
      filtered = filtered.filter(
        (task) => getDisplayPriority(task).toUpperCase() === priorityFilter
      )
    }
    if (dateFilter) {
      filtered = filtered.filter((task) => {
        if (!task.due_date) return false
        const iso = new Date(task.due_date).toISOString().slice(0, 10)
        return iso === dateFilter
      })
    }
    if (dayFilter !== "all") {
      const targetDay = Number(dayFilter)
      if (!Number.isNaN(targetDay)) {
        filtered = filtered.filter((task) => {
          if (!task.due_date) return false
          const day = getMondayBasedDay(new Date(task.due_date))
          return day === targetDay
        })
      }
    }
    return filtered
  }, [adminTaskRows, dateFilter, dayFilter, priorityFilter, viewFilter])

  const sortedTasks = React.useMemo(
    () =>
      [...filteredTasks].sort((a, b) => {
        const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0
        const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0
        return bCreated - aCreated
      }),
    [filteredTasks]
  )

  const taskCommentMap = React.useMemo(() => {
    const map = new Map<string, string | null>()
    for (const task of tasks) {
      map.set(task.id, task.user_comment ?? null)
    }
    return map
  }, [tasks])

  const systemTaskByTemplateId = React.useMemo(() => {
    const map = new Map<string, SystemTaskOut>()
    for (const task of systemTasks) {
      map.set(task.template_id, task)
    }
    return map
  }, [systemTasks])

  const allTasksTableRows = React.useMemo(() => {
    const rows: Array<{
      id: string
      ll: "SYS" | "FT"
      nll: string
      assigned: { id: string; value: string; label: string }[]
      startDateIso: string
      startDateLabel: string
      dateIso: string
      dateLabel: string
      period: string
      title: string
      bz: string
      kohaBz: string
      status: string
      priority: TaskPriority
      comment?: string | null
      taskId: string
      isFastTask?: boolean
      isTemplateAlignedSystem?: boolean
      needsGaneConfirmation?: boolean
      showInSystemTasksSection?: boolean
      isLateSystemTask?: boolean
      lateDays?: number
      isGaneAssigned?: boolean
      isBzOnly?: boolean
    }> = []

    if (!ganeUserId) return rows

    for (const task of tasks) {
      if (task.is_active === false) continue

      const isSystemTask = Boolean(task.system_template_origin_id || task.task_type === "system")
      const systemTemplate = task.system_template_origin_id
        ? systemTaskByTemplateId.get(task.system_template_origin_id)
        : undefined
      const hasTaskAlignment = Boolean(ganeUserId && task.alignment_user_ids?.includes(ganeUserId))
      const hasTemplateAlignment = Boolean(
        isSystemTask && ganeUserId && systemTemplate?.alignment_user_ids?.includes(ganeUserId)
      )
      const isAssigned =
        task.assigned_to === ganeUserId ||
        task.assignees?.some((assignee) => assignee.id === ganeUserId) ||
        hasTaskAlignment
      const needsGaneConfirmation =
        task.status === "WAITING_CONFIRMATION" && task.confirmation_assignee_id === ganeUserId

      const startDateIso = toDateOnlyIso(task.start_date || task.due_date || null)
      const dueDateIso = getTaskDateIso(task)
      const dateIso = dueDateIso || startDateIso
      const statusValue = task.status || (task.completed_at ? "DONE" : "TODO")
      const hasGaneBzToday = (hasTaskAlignment || hasTemplateAlignment) && dateIso === todayIso
      const computedLateDays =
        statusValue !== "DONE" && dueDateIso && dueDateIso < todayIso
          ? Math.max(task.late_days ?? 0, dayDiffInclusive(dueDateIso, todayIso))
          : 0
      const isLateSystemTask = Boolean(isSystemTask && (isAssigned || hasTemplateAlignment) && computedLateDays > 0)
      if (!isAssigned && !needsGaneConfirmation && !hasGaneBzToday) continue

      rows.push({
        id: `task:${task.id}`,
        ll: isSystemTask ? "SYS" : "FT",
        nll: isSystemTask ? "SYS" : task.project_id ? "-" : fastReportSubtypeShort(task),
        assigned: taskAssigneeBadges(task),
        startDateIso,
        startDateLabel: startDateIso ? formatDateDMY(startDateIso) : "-",
        dateIso,
        dateLabel: dateIso ? formatDateDayMonth(dateIso) : "-",
        period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at),
        title: task.title || "-",
        bz: hasTaskAlignment || hasTemplateAlignment ? "GA" : "-",
        kohaBz: hasTemplateAlignment ? formatTimeLabel(systemTemplate?.alignment_time || "") || "TPL" : "-",
        status: statusValue,
        priority: getDisplayPriority(task),
        comment: taskCommentMap.get(task.id) ?? null,
        taskId: task.id,
        isFastTask: !task.project_id && !isSystemTask,
        isTemplateAlignedSystem: hasTemplateAlignment,
        needsGaneConfirmation,
        showInSystemTasksSection: hasTemplateAlignment || isLateSystemTask,
        isLateSystemTask,
        lateDays: computedLateDays,
        isGaneAssigned: isAssigned,
        isBzOnly: !isAssigned && !needsGaneConfirmation && hasGaneBzToday,
      })
    }

    const dedupedRows = new Map<string, (typeof rows)[number]>()
    for (const row of rows) {
      const dedupeKey = [
        row.ll,
        row.nll,
        row.title.trim().toLowerCase(),
        row.startDateIso || "-",
        row.dateIso || "-",
        row.period || "-",
        row.kohaBz || "-",
      ].join("|")
      const existing = dedupedRows.get(dedupeKey)
      if (!existing) {
        dedupedRows.set(dedupeKey, row)
        continue
      }
      dedupedRows.set(dedupeKey, {
        ...existing,
        assigned: existing.assigned.length >= row.assigned.length ? existing.assigned : row.assigned,
        needsGaneConfirmation: Boolean(existing.needsGaneConfirmation || row.needsGaneConfirmation),
        showInSystemTasksSection: Boolean(existing.showInSystemTasksSection || row.showInSystemTasksSection),
        isLateSystemTask: Boolean(existing.isLateSystemTask || row.isLateSystemTask),
        lateDays: Math.max(existing.lateDays ?? 0, row.lateDays ?? 0) || undefined,
        isGaneAssigned: Boolean(existing.isGaneAssigned || row.isGaneAssigned),
        isBzOnly: Boolean(existing.isBzOnly && row.isBzOnly),
      })
    }

    const orderedRows = Array.from(dedupedRows.values())
    orderedRows.sort((a, b) => {
      const aFast = Boolean(a.isFastTask)
      const bFast = Boolean(b.isFastTask)
      if (aFast !== bFast) return aFast ? 1 : -1
      const aMinutes = parseTimeToMinutes(a.kohaBz)
      const bMinutes = parseTimeToMinutes(b.kohaBz)
      if (aMinutes !== null && bMinutes !== null && aMinutes !== bMinutes) return aMinutes - bMinutes
      if (aMinutes !== null && bMinutes === null) return -1
      if (aMinutes === null && bMinutes !== null) return 1
      const aLate = a.isLateSystemTask ? 1 : 0
      const bLate = b.isLateSystemTask ? 1 : 0
      if (aLate !== bLate) return bLate - aLate
      if (a.dateIso !== b.dateIso) return b.dateIso.localeCompare(a.dateIso)
      return a.title.localeCompare(b.title)
    })

    return orderedRows
  }, [
    tasks,
    ganeUserId,
    systemTaskByTemplateId,
    taskAssigneeBadges,
    taskCommentMap,
    todayIso,
  ])

  const filteredAllTasksRows = React.useMemo(() => {
    if (!allTasksDateFrom && !allTasksDateTo) return allTasksTableRows
    return allTasksTableRows.filter((row) => {
      if (row.isLateSystemTask && isIsoWithinInclusiveRange(todayIso, allTasksDateFrom, allTasksDateTo)) {
        return true
      }
      return isIsoWithinInclusiveRange(row.dateIso, allTasksDateFrom, allTasksDateTo)
    })
  }, [allTasksDateFrom, allTasksDateTo, allTasksTableRows, todayIso])

  const highlightedAllTasksRows = React.useMemo(
    () => filteredAllTasksRows.filter((row) => row.showInSystemTasksSection),
    [filteredAllTasksRows]
  )

  const regularAllTasksRows = React.useMemo(
    () => filteredAllTasksRows.filter((row) => !row.showInSystemTasksSection),
    [filteredAllTasksRows]
  )
  const waitingConfirmationRows = React.useMemo(
    () => filteredAllTasksRows.filter((row) => row.needsGaneConfirmation && !row.showInSystemTasksSection),
    [filteredAllTasksRows]
  )
  const regularNonConfirmationRows = React.useMemo(
    () => regularAllTasksRows.filter((row) => !row.needsGaneConfirmation),
    [regularAllTasksRows]
  )
  const combinedNonConfirmationRows = React.useMemo(
    () => [...highlightedAllTasksRows, ...regularNonConfirmationRows],
    [highlightedAllTasksRows, regularNonConfirmationRows]
  )

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

    if (!dailyReport) return rows

    const tasksToday = dailyReport.tasks_today || []
    const tasksOverdue = dailyReport.tasks_overdue || []
    const seenTaskIds = new Set<string>()

    const resolveDepartmentLabel = (
      departmentId?: string | null,
      scope?: SystemTaskScope | null,
      isGaNote?: boolean
    ) => {
      if (scope === "GA") return "GA"
      if (scope === "ALL") return "ALL"
      if (departmentId) {
        const dept = departments.find((d) => d.id === departmentId)
        return dept?.code || dept?.name || "-"
      }
      if (isGaNote) return "GA"
      return "-"
    }

    const pushTaskRow = (item: DailyReportResponse["tasks_today"][number]) => {
      const task = item.task
      if (ganeUserId) {
        const isAssigned =
          task.assigned_to === ganeUserId ||
          task.assignees?.some((assignee) => assignee.id === ganeUserId)
        if (!isAssigned) return
      }
      if (seenTaskIds.has(task.id)) return
      seenTaskIds.add(task.id)
      const baseDate = toDate(task.due_date || task.start_date || task.created_at)
      const isProject = Boolean(task.project_id)
      rows.push({
        typeLabel: isProject ? "PRJK" : "FT",
        subtype: isProject ? "-" : fastReportSubtypeShort(task),
        period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at),
        department: resolveDepartmentLabel(task.department_id, null, Boolean(task.ga_note_origin_id)),
        title: task.title || "-",
        projectTitle: isProject ? (item.project_title ?? null) : null,
        description: task.description || "-",
        status: taskStatusLabel(task),
        bz: "-",
        kohaBz: "-",
        tyo: getTyoLabel(baseDate, task.completed_at, todayDate),
        comment: taskCommentMap.get(task.id) ?? null,
        userInitials: taskAssigneeInitials(task),
        taskId: task.id,
      })
    }

    tasksToday.forEach(pushTaskRow)
    tasksOverdue.forEach(pushTaskRow)

    // Include fast tasks (no project) across their start->due date window
    for (const task of tasks) {
      if (!ganeUserId) continue
      const isAssigned =
        task.assigned_to === ganeUserId ||
        task.assignees?.some((assignee) => assignee.id === ganeUserId)
      if (!isAssigned) continue
      if (task.is_active === false) continue
      if (task.system_template_origin_id) continue

      const isProject = Boolean(task.project_id)
      if (isProject) continue // show only fast tasks here

      if (!task.due_date) continue
      const due = toDate(task.due_date)
      const start = toDate(task.start_date || task.due_date)
      if (!due || !start) continue

      // Show on any day within start -> due (inclusive)
      if (todayDate < start || todayDate > due) continue

      if (seenTaskIds.has(task.id)) continue
      seenTaskIds.add(task.id)

      const baseDate = toDate(task.due_date || task.start_date || task.created_at)
      rows.push({
        typeLabel: "FT",
        subtype: fastReportSubtypeShort(task),
        period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at),
        department: resolveDepartmentLabel(task.department_id, null, Boolean(task.ga_note_origin_id)),
        title: task.title || "-",
        description: task.description || "-",
        status: taskStatusLabel(task),
        bz: "-",
        kohaBz: "-",
        // Show as "T" for every day within start->due window
        tyo: "T",
        comment: taskCommentMap.get(task.id) ?? null,
        userInitials: taskAssigneeInitials(task),
        taskId: task.id,
      })
    }

    const systemToday = dailyReport.system_today || []
    const systemOverdue = dailyReport.system_overdue || []
    const seenSystemKeys = new Set<string>()
    const pushSystemRow = (occ: DailyReportResponse["system_today"][number]) => {
      const key = `${occ.template_id}:${occ.occurrence_date}`
      if (seenSystemKeys.has(key)) return
      seenSystemKeys.add(key)

      // Only include GA-scoped occurrences (scope GA or department GA)
      const isGaScope =
        occ.scope === "GA" ||
        (adminDepartmentId && occ.department_id === adminDepartmentId)
      if (!isGaScope) return

      const baseDate = toDate(occ.occurrence_date)
      const systemSubtype =
        occ.frequency === "DAILY"
          ? "D"
          : occ.frequency === "WEEKLY"
            ? "W"
            : occ.frequency === "MONTHLY"
              ? "M"
              : occ.frequency === "YEARLY"
                ? "Y"
                : occ.frequency === "3_MONTHS"
                  ? "3M"
                  : occ.frequency === "6_MONTHS"
                    ? "6M"
                    : "SYS"
      rows.push({
        typeLabel: "SYS",
        subtype: systemSubtype,
        period: "AM",
        department: resolveDepartmentLabel(occ.department_id, occ.scope || null, false),
        title: occ.title || "-",
        description: "-",
        status: formatSystemOccurrenceStatus(occ.status),
        bz: "-",
        kohaBz: "-",
        tyo: getTyoLabel(baseDate, occ.acted_at, todayDate),
        comment: occ.comment ?? null,
        userInitials: ganeUser ? initials(ganeUser.full_name || ganeUser.username || "") : "",
        systemTemplateId: occ.template_id,
        systemOccurrenceDate: occ.occurrence_date,
        systemStatus: occ.status,
      })
    }
    systemToday.forEach(pushSystemRow)
    systemOverdue.forEach(pushSystemRow)

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
    const orderedRows = rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const aIsProject = a.row.typeLabel === "PRJK"
        const bIsProject = b.row.typeLabel === "PRJK"
        if (aIsProject && bIsProject) {
          return sortByTyo(a.row, b.row)
        }
        return a.index - b.index
      })
      .map((entry) => entry.row)

    return orderedRows
  }, [dailyReport, departments, ganeUser, ganeUserId, taskAssigneeInitials, taskCommentMap, tasks, todayDate])

  const startEditTask = (task: Task) => {
    const isFastTask = !task.project_id && !task.system_template_origin_id && task.task_type !== "system"
    setEditingTaskId(task.id)
    setEditingTaskIsFast(isFastTask)
    setEditTitle(task.title || "")
    setEditDescription(task.description || "")
    const taskStartDate = toDateInputValue(task.start_date)
    setEditStartDate(taskStartDate)
    setEditStartDateDisplay(taskStartDate ? toDDMMYYYY(taskStartDate) : "")
    const taskDueDate = toDateInputValue(task.due_date || task.start_date)
    setEditDueDate(taskDueDate)
    setEditDueDateDisplay(taskDueDate ? toDDMMYYYY(taskDueDate) : "")
    setEditPriority((task.is_bllok ? "BLLOK" : (task.priority || "NORMAL")) as TaskPriority)
    setOriginalIsBllok(task.is_bllok || false)
    setEditFinishPeriod(task.finish_period || FINISH_PERIOD_NONE_VALUE)
    setEditOpen(true)
  }

  const saveEditTask = async () => {
    if (!editingTaskId || !editTitle.trim()) return
    setSavingEdit(true)
    try {
      let normalizedStartDate = editStartDate || ""
      let normalizedDueDate = editDueDate || ""
      if (editingTaskIsFast && normalizedStartDate && normalizedDueDate && normalizedStartDate > normalizedDueDate) {
        ;[normalizedStartDate, normalizedDueDate] = [normalizedDueDate, normalizedStartDate]
      }
      const startDateValue = normalizedStartDate ? new Date(normalizedStartDate).toISOString() : null
      const dueDateValue = normalizedDueDate ? new Date(normalizedDueDate).toISOString() : null
      const isBllok = editPriority === "BLLOK"
      const actualPriority: "NORMAL" | "HIGH" = isBllok ? "NORMAL" : (editPriority === "HIGH" ? "HIGH" : "NORMAL")
      const payload: Record<string, unknown> = {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        priority: actualPriority,
        start_date: startDateValue,
        due_date: dueDateValue,
        finish_period: editFinishPeriod === FINISH_PERIOD_NONE_VALUE ? null : editFinishPeriod,
      }
      // Only include is_bllok if it changed from the original value
      if (isBllok !== originalIsBllok) {
        payload.is_bllok = isBllok
      }
      const res = await apiFetch(`/tasks/${editingTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail = "Failed to update task"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const updated = (await res.json()) as Task
      if (editingTaskIsFast) {
        await load()
      } else {
        setTasks((prev) => prev.map((task) => (task.id === updated.id ? updated : task)))
      }
      setEditOpen(false)
      setEditingTaskId(null)
      setEditingTaskIsFast(false)
      toast.success("Task updated")
    } finally {
      setSavingEdit(false)
    }
  }

  const deleteTask = async (taskId: string) => {
    const confirmed = await confirm({
      title: "Delete task",
      description: "Are you sure you want to delete this task?",
      confirmLabel: "Delete",
      variant: "destructive",
    })
    if (!confirmed) return
    setDeletingTaskId(taskId)
    try {
      const res = await apiFetch(`/tasks/${taskId}`, { method: "DELETE" })
      if (!res?.ok) {
        if (res?.status === 405) {
          toast.error("Delete endpoint not active. Restart backend.")
        } else {
          toast.error("Failed to delete task")
        }
        return
      }
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
      toast.success("Task deleted")
    } finally {
      setDeletingTaskId(null)
    }
  }

  const updateTaskStatus = async (taskId: string, status: string) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    if (isWaitingConfirmation(status) && !task.confirmation_assignee_id) {
      setPendingStatusTaskId(taskId)
      setPendingStatusValue(status)
      setPendingConfirmationAssigneeId("")
      return
    }
    const key = `task:${taskId}`
    setTaskStatusUpdating((prev) => ({ ...prev, [key]: true }))
    try {
      const payload: Record<string, unknown> = { status }
      if (isWaitingConfirmation(status) && task.confirmation_assignee_id) {
        payload.confirmation_assignee_id = task.confirmation_assignee_id
      }
      const res = await apiFetch(`/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        toast.error("Failed to update task status")
        return
      }
      const updated = (await res.json()) as Task
      setTasks((prev) => prev.map((task) => (task.id === updated.id ? updated : task)))
    } catch (error) {
      console.error("Failed to update task status", error)
      toast.error("Failed to update task status")
    } finally {
      setTaskStatusUpdating((prev) => ({ ...prev, [key]: false }))
    }
  }

  const updateSystemOccurrenceStatus = async (
    templateId: string,
    occurrenceDate: string,
    status: string,
    comment?: string | null
  ) => {
    const key = `system:${templateId}:${occurrenceDate}`
    setTaskStatusUpdating((prev) => ({ ...prev, [key]: true }))
    try {
      const payload: { template_id: string; occurrence_date: string; status: string; comment?: string | null } = {
        template_id: templateId,
        occurrence_date: occurrenceDate,
        status,
      }
      if (typeof comment !== "undefined") {
        payload.comment = comment
      }
      const res = await apiFetch("/system-tasks/occurrences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        toast.error("Failed to update system task status")
        return
      }
      const overrideKey = `${templateId}:${occurrenceDate}`
      setSystemStatusOverrides((prev) => ({ ...prev, [overrideKey]: status }))
      setSystemTasks((prev) =>
        prev.map((task) =>
          task.template_id === templateId ? { ...task, status } : task
        )
      )
    } catch (error) {
      console.error("Failed to update system task status", error)
      toast.error("Failed to update system task status")
    } finally {
      setTaskStatusUpdating((prev) => ({ ...prev, [key]: false }))
    }
  }

  const startFastTaskEdit = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId)
    if (!task) return
    setFastEditTaskId(task.id)
    setFastEditTitle(task.title || "")
    setFastEditStartDate(toDateInputValue(task.start_date))
    setFastEditDueDate(toDateInputValue(task.due_date))
    setFastEditPriority((task.is_bllok ? "BLLOK" : (task.priority || "NORMAL")) as TaskPriority)
    setFastEditStatus(task.status || "TODO")
    setFastEditConfirmationAssigneeId(task.confirmation_assignee_id || "")
    setFastEditOriginalIsBllok(Boolean(task.is_bllok))
    setFastEditOpen(true)
  }

  const saveFastTaskEdit = async () => {
    if (!fastEditTaskId || !fastEditTitle.trim()) return
    const confirmationValidation = validateWaitingConfirmation(fastEditStatus, fastEditConfirmationAssigneeId)
    if (confirmationValidation) {
      toast.error(confirmationValidation)
      return
    }
    setFastEditSaving(true)
    try {
      const startDateValue = fastEditStartDate ? new Date(fastEditStartDate).toISOString() : null
      const dueDateValue = fastEditDueDate ? new Date(fastEditDueDate).toISOString() : null
      const isBllok = fastEditPriority === "BLLOK"
      const actualPriority: "NORMAL" | "HIGH" = isBllok ? "NORMAL" : (fastEditPriority === "HIGH" ? "HIGH" : "NORMAL")
      const payload: Record<string, unknown> = {
        title: fastEditTitle.trim(),
        start_date: startDateValue,
        due_date: dueDateValue,
        priority: actualPriority,
        status: fastEditStatus,
      }
      if (isWaitingConfirmation(fastEditStatus)) {
        payload.confirmation_assignee_id = fastEditConfirmationAssigneeId
      }
      if (isBllok !== fastEditOriginalIsBllok) {
        payload.is_bllok = isBllok
      }
      const res = await apiFetch(`/tasks/${fastEditTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        toast.error("Failed to update task")
        return
      }
      const updated = (await res.json()) as Task
      setTasks((prev) => prev.map((task) => (task.id === updated.id ? updated : task)))
      setFastEditOpen(false)
      setFastEditTaskId(null)
      setFastEditConfirmationAssigneeId("")
    } catch (error) {
      console.error("Failed to update task", error)
      toast.error("Failed to update task")
    } finally {
      setFastEditSaving(false)
    }
  }

  const updateTaskCommentState = (taskId: string, comment: string | null) => {
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, user_comment: comment } : task)))
  }

  const setDailyReportCommentSaving = (commentKey: string, isSaving: boolean) => {
    setSavingDailyReportComments((prev) => ({ ...prev, [commentKey]: isSaving }))
  }

  const setAllTasksReportCommentSaving = (commentKey: string, isSaving: boolean) => {
    setSavingAllTasksReportComments((prev) => ({ ...prev, [commentKey]: isSaving }))
  }

  const saveAllTasksReportTaskComment = async (
    taskId: string,
    nextValue: string,
    previousValue: string,
    commentKey: string
  ) => {
    const trimmed = nextValue.trim()
    const previousTrimmed = previousValue.trim()
    if (trimmed === previousTrimmed) return

    const payloadComment = trimmed.length ? trimmed : null
    setAllTasksReportCommentSaving(commentKey, true)
    try {
      const res = await apiFetch(`/tasks/${taskId}/comment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: payloadComment }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.detail || "Failed to save comment")
        setAllTasksReportCommentEdits((prev) => ({ ...prev, [commentKey]: previousValue }))
        return
      }
      updateTaskCommentState(taskId, payloadComment)
      setAllTasksReportCommentEdits((prev) => ({ ...prev, [commentKey]: trimmed }))
    } catch (error) {
      console.error("Failed to save comment", error)
      toast.error("Failed to save comment")
      setAllTasksReportCommentEdits((prev) => ({ ...prev, [commentKey]: previousValue }))
    } finally {
      setAllTasksReportCommentSaving(commentKey, false)
    }
  }

  const saveAllTasksReportSystemComment = async (
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
    setAllTasksReportCommentSaving(commentKey, true)
    try {
      const res = await apiFetch("/system-tasks/occurrences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: templateId,
          occurrence_date: occurrenceDate || todayIso,
          status: status || "OPEN",
          comment: payloadComment,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.detail || "Failed to save comment")
        setAllTasksReportCommentEdits((prev) => ({ ...prev, [commentKey]: previousValue }))
        return
      }
      setAllTasksReportCommentEdits((prev) => ({ ...prev, [commentKey]: trimmed }))
      // Update system tasks state
      setSystemTasks((prev) =>
        prev.map((st) =>
          st.template_id === templateId
            ? { ...st, user_comment: payloadComment }
            : st
        )
      )
    } catch (error) {
      console.error("Failed to save comment", error)
      toast.error("Failed to save comment")
      setAllTasksReportCommentEdits((prev) => ({ ...prev, [commentKey]: previousValue }))
    } finally {
      setAllTasksReportCommentSaving(commentKey, false)
    }
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
    if (!user?.id) return
    if (!ganeUserId) {
      toast.error("Gane Arifaj user not found. Cannot export.")
      return
    }
    setExportingDailyReport(true)
    try {
      const qs = new URLSearchParams({
        day: todayIso,
        user_id: ganeUserId,
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
      link.download = `daily_report_${todayIso}_${printInitials || "user"}.xlsx`
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

  // Convert all tasks to daily report row format
  const allTasksReportRows = React.useMemo(() => {
    const rows: Array<{
      typeLabel: string
      subtype: string
      period: string
      department: string
      title: string
      description: string
      details: string
      dateIso: string
      ditaLabel: string
      bzMe: string
      status: string
      bz: string
      kohaBz: string
      tyo: string
      comment?: string | null
      userInitials?: string
      taskId?: string
      startDateIso?: string
      isFastTask?: boolean
      isLateSystemTask?: boolean
      createdDate?: string
      systemTemplateId?: string
      systemOccurrenceDate?: string
      systemStatus?: string
    }> = []

    if (!ganeUserId) return rows

    const resolveDepartmentLabel = (
      departmentId?: string | null,
      scope?: string | null,
      isGaNote?: boolean
    ) => {
      if (scope === "GA") return "GA"
      if (scope === "ALL") return "ALL"
      if (departmentId) {
        const dept = departments.find((d) => d.id === departmentId)
        return dept?.code || dept?.name || "-"
      }
      if (isGaNote) return "GA"
      return "-"
    }

    // Process all tasks assigned to Gane
    for (const task of tasks) {
      const isAssigned =
        task.assigned_to === ganeUserId ||
        task.assignees?.some((assignee) => assignee.id === ganeUserId) ||
        task.alignment_user_ids?.includes(ganeUserId)
      if (!isAssigned) continue
      if (task.is_active === false) continue
      if (task.system_template_origin_id) continue // Skip system tasks (handled separately)

      const isProject = Boolean(task.project_id)
      const baseDate = toDate(task.due_date || task.start_date || task.created_at)
      const createdDate = task.created_at ? new Date(task.created_at).toISOString().slice(0, 10) : undefined
      const startDateIso = toDateOnlyIso(task.start_date || task.due_date || null)
      const dateIso = getTaskDateIso(task)
      const assigneeDepartments = taskAssigneeDepartments(task)
      rows.push({
        typeLabel: isProject ? "PRJK" : "FT",
        subtype: isProject ? "-" : fastReportSubtypeShort(task),
        period: resolvePeriod(task.finish_period, task.due_date || task.start_date || task.created_at),
        department: assigneeDepartments || resolveDepartmentLabel(task.department_id, null, Boolean(task.ga_note_origin_id)),
        title: task.title || "-",
        description: task.description || "",
        details: formatInternalDetails(task.internal_notes),
        dateIso,
        ditaLabel: dateIso ? formatDateDMY(dateIso) : "-",
        bzMe: (task.alignment_user_ids || [])
          .map((id) => {
            const userFromMap = userMap.get(id)
            return userFromMap ? initials(userFromMap.full_name || userFromMap.username || "") : ""
          })
          .filter(Boolean)
          .join(", "),
        status: taskStatusLabel(task),
        bz: "-",
        kohaBz: "-",
        tyo: baseDate ? getTyoLabel(baseDate, task.completed_at, todayDate) : "-",
        comment: taskCommentMap.get(task.id) ?? null,
        userInitials: taskAssigneeInitials(task),
        taskId: task.id,
        startDateIso,
        isFastTask: !isProject,
        createdDate,
      })
    }

    // Process all system tasks assigned to Gane or scoped to GA
    for (const systemTask of systemTasks) {
      const isAssignedToGane =
        systemTask.default_assignee_id === ganeUserId ||
        systemTask.assignees?.some((assignee) => assignee.id === ganeUserId)
      if (systemTask.is_active === false) continue

      const isGaScope =
        systemTask.scope === "GA" ||
        (adminDepartmentId && systemTask.department_id === adminDepartmentId)
      if (!isAssignedToGane && !isGaScope) continue

      const systemSubtype =
        systemTask.frequency === "DAILY"
          ? "D"
          : systemTask.frequency === "WEEKLY"
            ? "W"
            : systemTask.frequency === "MONTHLY"
              ? "M"
              : systemTask.frequency === "YEARLY"
                ? "Y"
                : systemTask.frequency === "3_MONTHS"
                  ? "3M"
                  : systemTask.frequency === "6_MONTHS"
                    ? "6M"
                    : "SYS"
      
      const createdDate = systemTask.created_at ? new Date(systemTask.created_at).toISOString().slice(0, 10) : undefined
      const baseDate = createdDate ? toDate(createdDate) : null

      const dateIso = getSystemDateIso(systemTask)
      const assigneeDepartments = systemAssigneeDepartments(systemTask)
      rows.push({
        typeLabel: "SYS",
        subtype: systemSubtype,
        period: systemTask.finish_period || "AM",
        department:
          assigneeDepartments || resolveDepartmentLabel(systemTask.department_id, systemTask.scope || null, false),
        title: systemTask.title || "-",
        description: systemTask.description || "",
        details: formatInternalDetails(systemTask.internal_notes),
        dateIso,
        ditaLabel: dateIso ? formatDateDMY(dateIso) : "-",
        bzMe: (systemTask.alignment_user_ids || [])
          .map((id) => {
            const userFromMap = userMap.get(id)
            return userFromMap ? initials(userFromMap.full_name || userFromMap.username || "") : ""
          })
          .filter(Boolean)
          .join(", "),
        status: formatSystemOccurrenceStatus(systemTask.status),
        bz: "-",
        kohaBz: "-",
        tyo: baseDate ? getTyoLabel(baseDate, null, todayDate) : "-",
        comment: systemTask.user_comment ?? null,
        userInitials: systemAssigneeInitials(systemTask),
        systemTemplateId: systemTask.template_id,
        isFastTask: false,
        createdDate,
      })
    }

    // Sort by created date (newest first)
    rows.sort((a, b) => {
      if (!a.createdDate && !b.createdDate) return 0
      if (!a.createdDate) return 1
      if (!b.createdDate) return -1
      return b.createdDate.localeCompare(a.createdDate)
    })

    return rows
  }, [
    tasks,
    systemTasks,
    ganeUserId,
    departments,
    taskAssigneeInitials,
    systemAssigneeInitials,
    taskAssigneeDepartments,
    systemAssigneeDepartments,
    taskCommentMap,
    todayDate,
    adminDepartmentId,
    userMap,
  ])

  const filteredAllTasksReportRows = React.useMemo(() => {
    if (!allTasksDateFrom && !allTasksDateTo) return allTasksReportRows
    return allTasksReportRows.filter((row) => {
      if (row.isLateSystemTask && isIsoWithinInclusiveRange(todayIso, allTasksDateFrom, allTasksDateTo)) {
        return true
      }
      return isIsoWithinInclusiveRange(row.dateIso, allTasksDateFrom, allTasksDateTo)
    })
  }, [allTasksDateFrom, allTasksDateTo, allTasksReportRows, todayIso])

  const exportAllTasks = async () => {
    if (!user?.id) return
    if (!ganeUserId) {
      toast.error("Gane Arifaj user not found. Cannot export.")
      return
    }
    setExportingAllTasks(true)
    try {
      const rowsPayload = filteredAllTasksReportRows.map((row) => {
        return {
          typeLabel: row.typeLabel,
          subtype: row.subtype,
          dateLabel: row.ditaLabel,
          bzMe: row.bzMe,
          kohaBz: row.kohaBz,
          department: row.department,
          period: row.period,
          title: row.title,
          description: row.description,
          details: row.details,
          status: row.status,
          userInitials: row.userInitials || "",
        }
      })

      const res = await apiFetch(`/exports/all-tasks-report.xlsx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "ALL ADMIN TASK REPORT",
          usersInitials: (() => {
            const unique = Array.from(
              new Set(
                rowsPayload
                  .map((r) => (r.userInitials || "").trim().toUpperCase())
                  .filter(Boolean)
              )
            ).sort()
            return unique.join("_")
          })(),
          rows: rowsPayload,
        }),
      })
      if (!res.ok) {
        toast.error("Failed to export all tasks")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      const filename = parseFilenameFromDisposition(res.headers.get("content-disposition"))
      link.download = filename || "ALL_ADMIN_TASK_REPORT.xlsx"
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Failed to export all tasks", error)
      toast.error("Failed to export all tasks")
    } finally {
      setExportingAllTasks(false)
    }
  }

  const submitPendingStatusUpdate = async () => {
    if (!pendingStatusTaskId) return
    const validation = validateWaitingConfirmation(pendingStatusValue, pendingConfirmationAssigneeId)
    if (validation) {
      toast.error(validation)
      return
    }
    const key = `task:${pendingStatusTaskId}`
    setTaskStatusUpdating((prev) => ({ ...prev, [key]: true }))
    try {
      const res = await apiFetch(`/tasks/${pendingStatusTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: pendingStatusValue,
          confirmation_assignee_id: pendingConfirmationAssigneeId,
        }),
      })
      if (!res.ok) {
        let detail = "Failed to update task status"
        try {
          const data = (await res.json()) as { detail?: string }
          if (typeof data?.detail === "string" && data.detail.trim()) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const updated = (await res.json()) as Task
      setTasks((prev) => prev.map((task) => (task.id === updated.id ? updated : task)))
      setPendingStatusTaskId(null)
      setPendingStatusValue("TODO")
      setPendingConfirmationAssigneeId("")
    } catch (error) {
      console.error("Failed to update task status", error)
      toast.error("Failed to update task status")
    } finally {
      setTaskStatusUpdating((prev) => ({ ...prev, [key]: false }))
    }
  }

  const resetFastTaskForm = React.useCallback(() => {
    setFastTaskTitle("")
    setFastTaskDescription("")
    setFastTaskType("normal")
    setFastTaskAssignees([])
    setFastTaskStartDate("")
    setFastTaskDueDate("")
    setFastTaskDeadlineImportant(false)
    setFastTaskFinishPeriod(FINISH_PERIOD_NONE_VALUE)
  }, [])

  const submitFastTask = async () => {
    if (!fastTaskTitle.trim()) {
      toast.error("Task title is required")
      return
    }
    if (!fastTaskStartDate) {
      toast.error("Start date is required")
      return
    }
    if (!adminDepartmentId) {
      toast.error("Department is required")
      return
    }
    setCreatingFastTask(true)
    try {
      const startDate = fastTaskStartDate ? new Date(fastTaskStartDate).toISOString() : null
      const dueDate = fastTaskDueDate ? new Date(fastTaskDueDate).toISOString() : null
      const payload = {
        title: fastTaskTitle.trim(),
        description: fastTaskDescription.trim() || null,
        project_id: null,
        department_id: adminDepartmentId,
        status: "TODO",
        priority: "NORMAL",
        finish_period: fastTaskFinishPeriod === FINISH_PERIOD_NONE_VALUE ? null : fastTaskFinishPeriod,
        is_deadline_important: fastTaskDeadlineImportant,
        is_bllok: fastTaskType === "blocked",
        is_1h_report: fastTaskType === "hourly",
        is_r1: fastTaskType === "r1",
        is_personal: fastTaskType === "personal",
        ga_note_origin_id: null,
        start_date: startDate,
        due_date: dueDate,
      }
      const assigneeIds = fastTaskAssignees.length > 0 ? fastTaskAssignees : null
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
      created.is_bllok = fastTaskType === "blocked" ? true : (created.is_bllok ?? false)
      created.is_1h_report = fastTaskType === "hourly" ? true : (created.is_1h_report ?? false)
      created.is_r1 = fastTaskType === "r1" ? true : (created.is_r1 ?? false)
      created.is_personal = fastTaskType === "personal" ? true : (created.is_personal ?? false)
      if (fastTaskType === "normal") {
        created.ga_note_origin_id = created.ga_note_origin_id || null
        created.priority = created.priority || "NORMAL"
      }
      setTasks((prev) => [created, ...prev])
      setFastTaskOpen(false)
      resetFastTaskForm()
      toast.success("Task created")
    } finally {
      setCreatingFastTask(false)
    }
  }

  const exportCommonView = async (payload: { title: string; columns: string[]; rows: string[][] }) => {
    if (exportingCommonView) return
    setExportingCommonView(true)
    try {
      const res = await apiFetch(`/exports/common-view.xlsx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res?.ok) {
        const detail = await res.text()
        toast.error(detail || "Failed to export common view.")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      const filename = parseFilenameFromDisposition(res.headers.get("content-disposition"))
      link.download = filename || "COMMON_VIEW.xlsx"
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Failed to export common view", error)
      toast.error("Failed to export common view")
    } finally {
      setExportingCommonView(false)
    }
  }

  const exportGaTime = async () => {
    if (exportingGaTime) return
    setExportingGaTime(true)
    try {
      const weekStartIso = toISODate(commonWeekStart)
      const res = await apiFetch(`/exports/ga-time.xlsx?week_start=${encodeURIComponent(weekStartIso)}`)
      if (!res?.ok) {
        const detail = await res.text()
        toast.error(detail || "Failed to export GA time.")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      const filename = parseFilenameFromDisposition(res.headers.get("content-disposition"))
      link.download = filename || "GA_TIME_TABLE.xlsx"
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Failed to export GA time", error)
      toast.error("Failed to export GA time")
    } finally {
      setExportingGaTime(false)
    }
  }

  const sectionCardClass = "rounded-xl border border-slate-200 bg-white shadow-sm"
  const sectionHeaderClass = "flex flex-wrap items-center justify-center gap-3"

  const AdminTasksSection = ({
    title,
    description,
    actions,
    children,
    headerClassName,
    contentClassName,
  }: {
    title: string
    description?: string
    actions?: React.ReactNode
    children?: React.ReactNode
    headerClassName?: string
    contentClassName?: string
  }) => (
    <Card className={sectionCardClass}>
      <CardHeader className={cn(sectionHeaderClass, headerClassName)}>
        <div>
          <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
          {description ? <div className="mt-1 text-xs text-slate-500">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </CardHeader>
      {children ? <CardContent className={contentClassName}>{children}</CardContent> : null}
    </Card>
  )

  const commonFiltered = React.useMemo(() => {
    const datesToUse = commonWeekISOs
    const activeUserIds = commonUsers.filter((u) => u.is_active).map((u) => u.id)
    const fullyCoveredDates = new Set<string>()
    if (activeUserIds.length) {
      for (const dateStr of datesToUse) {
        const coveredUsers = new Set(
          commonData.leave
            .filter((x) => x.userId && dateStr >= x.startDate && dateStr <= x.endDate)
            .map((x) => x.userId as string)
        )
        if (coveredUsers.size >= activeUserIds.length) {
          fullyCoveredDates.add(dateStr)
        }
      }
    }

    const inSelectedDates = (dateStr: string) => datesToUse.includes(dateStr)
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
    const problems = commonData.problems.filter(
      (x) => x.everyday || (inSelectedDates(x.date) && !fullyCoveredDates.has(x.date))
    )
    const feedback = commonData.feedback.filter(
      (x) => x.everyday || (inSelectedDates(x.date) && !fullyCoveredDates.has(x.date))
    )
    const bz = commonData.bz.filter((x) => inSelectedDates(x.date) && !fullyCoveredDates.has(x.date))
    const priority = commonData.priority.filter((p) => inSelectedDates(p.date))

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
  }, [commonData, commonUsers, commonWeekISOs])

  const allUsersLeaveByDate = React.useMemo(() => {
    const byDate = new Map<string, LeaveItem>()
    for (const iso of commonWeekISOs) {
      const matching = commonData.leave.find((x) => x.isAllUsers && iso >= x.startDate && iso <= x.endDate)
      if (!matching) continue
      byDate.set(iso, {
        ...matching,
        person: ALL_USERS_INITIALS,
        entryId: undefined,
        startDate: iso,
        endDate: iso,
      })
    }
    return byDate
  }, [commonData.leave, commonWeekISOs])

  const bzSystemTasksByDay = React.useMemo(() => {
    const byDay: Record<string, BzItem[]> = {}
    for (const iso of commonWeekISOs) {
      byDay[iso] = []
    }
    if (!ganeUserId) return byDay

    const assigneeLabelsForTask = (task: Task) => {
      const ids = new Set<string>()
      if (task.assigned_to) ids.add(task.assigned_to)
      if (task.assignees) {
        for (const assignee of task.assignees) {
          if (assignee.id) ids.add(assignee.id)
        }
      }
      return Array.from(ids)
        .map((userId) => {
          const userFromMap = userMap.get(userId)
          if (userFromMap) return userFromMap.full_name || userFromMap.username || ""
          const assigneeFromArray = task.assignees?.find((a) => a.id === userId)
          return assigneeFromArray?.full_name || assigneeFromArray?.username || ""
        })
        .filter(Boolean)
    }

    for (const task of tasks) {
      if (task.is_active === false) continue
      if (!task.system_template_origin_id) continue
      const template = systemTaskByTemplateId.get(task.system_template_origin_id)
      if (!template?.alignment_user_ids?.includes(ganeUserId)) continue

      const occurrenceDate = toDate(task.start_date || task.due_date || task.created_at)
      if (!occurrenceDate) continue
      const occurrenceIso = toISODate(occurrenceDate)
      if (!commonWeekISOs.includes(occurrenceIso)) continue

      const assigneeLabels = assigneeLabelsForTask(task)
      byDay[occurrenceIso].push({
        title: task.title || "-",
        date: occurrenceIso,
        time: template.alignment_time || "",
        assignees: assigneeLabels,
        bzWithLabel: "GA",
        taskId: task.id,
        templateId: task.system_template_origin_id,
        matchTitle: task.title || "-",
      })
    }

    for (const iso of commonWeekISOs) {
      byDay[iso] = sortByTime(byDay[iso], (item) => item.time, (item) => item.title)
    }

    return byDay
  }, [commonWeekISOs, ganeUserId, sortByTime, systemTaskByTemplateId, tasks, userMap])

  const tableDataByDay = React.useMemo(() => {
    const dataByDay: Record<
      string,
      {
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
      }
    > = {}
    const dailyFeedback = commonFiltered.feedback.filter((x) => x.everyday)
    const dailyProblems = commonFiltered.problems.filter((x) => x.everyday)

    commonWeekISOs.forEach((iso) => {
      if (commonFiltered.fullyCoveredDates.has(iso)) {
        const allUsersLeave = allUsersLeaveByDate.get(iso)
        dataByDay[iso] = {
          late: [],
          absent: [],
          leave: [
            allUsersLeave || {
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
          problems: dailyProblems,
          feedback: dailyFeedback,
          priority: [],
        }
        return
      }
      dataByDay[iso] = {
        late: commonFiltered.late.filter((x) => x.date === iso),
        absent: commonFiltered.absent.filter((x) => x.date === iso),
        leave: commonFiltered.leave.filter((x) => iso >= x.startDate && iso <= x.endDate),
        blocked: commonFiltered.blocked.filter((x) => x.date === iso),
        oneH: sortTasksByOrder(commonFiltered.oneH.filter((x) => x.date === iso)),
        personal: commonFiltered.personal.filter((x) => x.date === iso),
        external: sortByTime(commonFiltered.external.filter((x) => x.date === iso), (x) => x.time, (x) => x.title),
        internal: sortByTime(commonFiltered.internal.filter((x) => x.date === iso), (x) => x.time, (x) => x.title),
        bz: bzSystemTasksByDay[iso] || [],
        r1: sortTasksByOrder(commonFiltered.r1.filter((x) => x.date === iso)),
        problems: [
          ...commonFiltered.problems.filter((x) => !x.everyday && x.date === iso),
          ...dailyProblems,
        ],
        feedback: [
          ...commonFiltered.feedback.filter((x) => !x.everyday && x.date === iso),
          ...dailyFeedback,
        ],
        priority: commonFiltered.priority.filter((x) => x.date === iso),
      }
    })

    return dataByDay
  }, [bzSystemTasksByDay, commonFiltered, commonWeekISOs, sortByTime, sortTasksByOrder])

  const weekTableRows = React.useMemo(
    () => [
      { id: "leave", label: "PV/FESTE" },
      { id: "blocked", label: "BLL" },
      { id: "external", label: "TAK EXT" },
      { id: "internal", label: "TAK INT" },
      { id: "bz", label: "BZ GA" },
      { id: "det_ga", label: "DET GA" },
      { id: "oneH", label: "1H" },
      { id: "r1", label: "R1=1H" },
      { id: "personal", label: "P:" },
      { id: "priority", label: "PRJK" },
    ],
    []
  )

  const gaTasksByDay = React.useMemo(() => {
    const byDay: Record<string, Task[]> = {}
    commonWeekISOs.forEach((iso) => {
      byDay[iso] = []
    })
    if (!ganeUserId) return byDay
    for (const task of tasks) {
      const isSystem = Boolean(task.system_template_origin_id || task.task_type === "system")
      if (isSystem) continue
      const assignedToGane =
        task.assigned_to === ganeUserId ||
        task.assignees?.some((assignee) => assignee.id === ganeUserId) ||
        task.alignment_user_ids?.includes(ganeUserId)
      if (!assignedToGane) continue

      const startDate = toDate(task.start_date || task.due_date || task.created_at)
      const endDate = toDate(task.due_date || task.start_date || task.created_at)
      if (!startDate || !endDate) continue
      const startIso = toISODate(startDate)
      const endIso = toISODate(endDate)
      for (const iso of commonWeekISOs) {
        if (iso >= startIso && iso <= endIso) {
          byDay[iso].push(task)
        }
      }
    }
    return byDay
  }, [commonWeekISOs, ganeUserId, tasks])

  const commonGaRowsByDay = React.useMemo(() => {
    const byDay: Record<string, { bz: BzItem[]; detGa: CommonGaTableEntry[] }> = {}

    const appendBzEntry = (entries: BzItem[], candidate: BzItem) => {
      const candidateKeys = getCommonGaEntryMatchKeys(candidate)
      const existingIndex = entries.findIndex((entry) => {
        const existingKeys = getCommonGaEntryMatchKeys(entry)
        return candidateKeys.some((key) => existingKeys.includes(key))
      })
      if (existingIndex === -1) {
        entries.push({
          ...candidate,
          assignees: Array.from(new Set(candidate.assignees || [])),
          matchTitle: candidate.matchTitle || candidate.title,
        })
        return
      }

      const existing = entries[existingIndex]
      entries[existingIndex] = {
        ...existing,
        assignees: Array.from(new Set([...(existing.assignees || []), ...(candidate.assignees || [])])),
        time: existing.time || candidate.time || "",
        bzWithLabel: mergeLabelList(existing.bzWithLabel, candidate.bzWithLabel) || undefined,
        taskId: existing.taskId || candidate.taskId,
        templateId: existing.templateId || candidate.templateId,
        matchTitle: existing.matchTitle || candidate.matchTitle || existing.title,
      }
    }
    const appendDetGaEntry = (entries: CommonGaTableEntry[], candidate: CommonGaTableEntry) => {
      const candidateKeys = getCommonGaEntryMatchKeys(candidate)
      const existingIndex = entries.findIndex((entry) => {
        const existingKeys = getCommonGaEntryMatchKeys(entry)
        return candidateKeys.some((key) => existingKeys.includes(key))
      })
      if (existingIndex === -1) {
        entries.push(candidate)
        return
      }

      const existing = entries[existingIndex]
      entries[existingIndex] = {
        ...existing,
        assignees: Array.from(new Set([...(existing.assignees || []), ...(candidate.assignees || [])])),
        taskId: existing.taskId || candidate.taskId,
        templateId: existing.templateId || candidate.templateId,
        matchTitle: existing.matchTitle || candidate.matchTitle || existing.title,
      }
    }

    for (const iso of commonWeekISOs) {
      const bzEntries: BzItem[] = []

      for (const taskEntry of bzSystemTasksByDay[iso] || []) {
        appendBzEntry(bzEntries, taskEntry)
      }

      const bzMatchKeys = new Set(bzEntries.flatMap((entry) => getCommonGaEntryMatchKeys(entry)))
      const detGaEntries: CommonGaTableEntry[] = []

      for (const occurrence of gaSystemByDay[iso] || []) {
        const entry: CommonGaTableEntry = {
          kind: "system",
          title: occurrence.title || "-",
          templateId: occurrence.template_id,
          matchTitle: occurrence.title || "-",
        }
        const shouldHide = getCommonGaEntryMatchKeys(entry).some((key) => bzMatchKeys.has(key))
        if (!shouldHide) {
          appendDetGaEntry(detGaEntries, entry)
        }
      }

      for (const task of gaTasksByDay[iso] || []) {
        const entry: CommonGaTableEntry = {
          kind: "task",
          title: task.title || "-",
          taskId: task.id,
          matchTitle: task.title || "-",
        }
        const shouldHide = getCommonGaEntryMatchKeys(entry).some((key) => bzMatchKeys.has(key))
        if (!shouldHide) {
          appendDetGaEntry(detGaEntries, entry)
        }
      }

      byDay[iso] = {
        bz: sortByTime(bzEntries, (entry) => entry.time || "", (entry) => entry.title),
        detGa: detGaEntries,
      }
    }

    return byDay
  }, [
    bzSystemTasksByDay,
    commonWeekISOs,
    gaSystemByDay,
    gaTasksByDay,
    sortByTime,
  ])

  const canEditGaTimeSlots =
    isAdmin || (user?.username ? user.username.toLowerCase() === "gane.arifaj" : false)

  const normalizeSlotTime = (value: string) => (value ? value.slice(0, 5) : "")
  const toDayOfWeek = (iso: string) => getMondayBasedDay(fromISODate(iso))

  const gaTimeEntriesByCell = React.useMemo(() => {
    const map = new Map<string, GaTimeSlotEntry[]>()
    for (const entry of gaTimeEntries) {
      const day = entry.day_of_week
      const start = normalizeSlotTime(entry.start_time)
      const key = `${day}|${start}`
      const list = map.get(key) || []
      list.push(entry)
      map.set(key, list)
    }
    return map
  }, [gaTimeEntries])

  const createGaTimeEntry = React.useCallback(
    async (dayOfWeek: string, startTime: string, endTime: string, content: string) => {
      const trimmed = content.trim()
      if (!trimmed) return
      const key = `${dayOfWeek}|${startTime}`
      setGaTimeSaving((prev) => ({ ...prev, [key]: true }))
      try {
        const res = await apiFetch("/ga-time-slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            day_of_week: Number(dayOfWeek),
            start_time: startTime,
            end_time: endTime,
            content: trimmed,
          }),
        })
        if (!res.ok) {
          throw new Error(`ga_time_slot_create_failed_${res.status}`)
        }
        const created = (await res.json()) as GaTimeSlotEntry
        setGaTimeEntries((prev) => [...prev, created])
      } catch (err) {
        console.error("Failed to create GA time slot entry", err)
        toast.error("Failed to save time slot entry.")
      } finally {
        setGaTimeSaving((prev) => ({ ...prev, [key]: false }))
      }
    },
    [apiFetch]
  )

  const updateGaTimeEntry = React.useCallback(
    async (entryId: string, content: string) => {
      const trimmed = content.trim()
      if (!trimmed) return
      setGaTimeSaving((prev) => ({ ...prev, [entryId]: true }))
      try {
        const res = await apiFetch(`/ga-time-slots/${entryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed }),
        })
        if (!res.ok) {
          throw new Error(`ga_time_slot_update_failed_${res.status}`)
        }
        const updated = (await res.json()) as GaTimeSlotEntry
        setGaTimeEntries((prev) => prev.map((entry) => (entry.id === entryId ? updated : entry)))
      } catch (err) {
        console.error("Failed to update GA time slot entry", err)
        toast.error("Failed to update time slot entry.")
      } finally {
        setGaTimeSaving((prev) => ({ ...prev, [entryId]: false }))
      }
    },
    [apiFetch]
  )

  const deleteGaTimeEntry = React.useCallback(
    async (entryId: string) => {
      setGaTimeDeleting((prev) => ({ ...prev, [entryId]: true }))
      try {
        const res = await apiFetch(`/ga-time-slots/${entryId}`, { method: "DELETE" })
        if (!res.ok) {
          throw new Error(`ga_time_slot_delete_failed_${res.status}`)
        }
        setGaTimeEntries((prev) => prev.filter((entry) => entry.id !== entryId))
      } catch (err) {
        console.error("Failed to delete GA time slot entry", err)
        toast.error("Failed to delete time slot entry.")
      } finally {
        setGaTimeDeleting((prev) => ({ ...prev, [entryId]: false }))
      }
    },
    [apiFetch]
  )

  const AdminCommonWeekTable = () => {
    const weekTitleRange =
      commonWeekISOs.length >= 2
        ? `${formatDateHuman(commonWeekISOs[0])} - ${formatDateHuman(commonWeekISOs[commonWeekISOs.length - 1])}`
        : ""
    const exportPayload = React.useMemo(() => {
      const columns = ["NR", "LLOJI", ...commonWeekISOs.map((iso) => `${getDayCode(fromISODate(iso))} = ${formatDateHuman(iso)}`)]

      const assigneesSuffix = (entry: any) => {
        const initialsList = entryAssignees(entry).map((name: string) => commonViewInitials(name)).filter(Boolean)
        return initialsList.length ? ` (${initialsList.join(", ")})` : ""
      }

      const renderBzLines = (iso: string) => {
        const bzEntries = commonGaRowsByDay[iso]?.bz || []
        return bzEntries.map((e: BzItem, idx: number) => {
          const bzLabel = e.bzWithLabel ? ` - ${e.bzWithLabel}` : ""
          return `${idx + 1}. ${stripInitialsPrefix(`${formatBzTimeDisplay(e.time)} ${e.title}`.trim())}${bzLabel}${assigneesSuffix(e)}`
        })
      }

      const renderCellLines = (rowId: CommonType, iso: string) => {
        const dayData = tableDataByDay?.[iso]
        if (!dayData) return []
        if (rowId === "det_ga") {
          const combined = commonGaRowsByDay[iso]?.detGa || []
          if (!combined.length) return []
          return combined.map((entry, idx) => `${idx + 1}. ${entry.title}`)
        }

        const entries =
          rowId === "late"
            ? dayData.late
            : rowId === "absent"
              ? dayData.absent
              : rowId === "leave"
                ? dayData.leave
                : rowId === "blocked"
                  ? dayData.blocked
                  : rowId === "oneH"
                    ? dayData.oneH
                    : rowId === "r1"
                      ? dayData.r1
                      : rowId === "personal"
                        ? dayData.personal
                        : rowId === "external"
                          ? dayData.external
                          : rowId === "internal"
                            ? dayData.internal
                            : rowId === "bz"
                              ? dayData.bz
                              : rowId === "priority"
                                ? dayData.priority
                                : rowId === "problem"
                                  ? dayData.problems
                                  : rowId === "feedback"
                                    ? dayData.feedback
                                    : []

        if (rowId === "bz") {
          return renderBzLines(iso)
        }
        if (!entries.length) return []

        if (rowId === "late") {
          return entries.map((e: LateItem, idx: number) =>
            `${idx + 1}. ${e.start || "08:00"}-${e.until}${assigneesSuffix(e)}`
          )
        }
        if (rowId === "absent") {
          return entries.map((e: AbsentItem, idx: number) => `${idx + 1}. ${e.from} - ${e.to}${assigneesSuffix(e)}`)
        }
        if (rowId === "leave") {
          return entries.map((e: LeaveItem, idx: number) => {
            const isAllUsers = Boolean(e.isAllUsers || e.person === ALL_USERS_INITIALS)
            const timeLabel = e.fullDay ? "08:00-16:30" : `${e.from}-${e.to}`
            const label = isAllUsers ? `${timeLabel} ALL` : timeLabel
            const noteLabel = e.note ? ` - ${e.note}` : ""
            return `${idx + 1}. ${label}${noteLabel}${isAllUsers ? "" : assigneesSuffix(e)}`
          })
        }
        if (rowId === "blocked") {
          return entries.map((e: BlockedItem, idx: number) =>
            `${idx + 1}. ${stripInitialsPrefix(e.title)}${assigneesSuffix(e)}`
          )
        }
        if (rowId === "problem" || rowId === "feedback") {
          return entries.map((e: ProblemItem | FeedbackItem, idx: number) => {
            const dateLabel = e.createdDate ? formatDateHuman(e.createdDate) : formatDateHuman(e.date)
            const noteLabel = e.note ? ` - ${e.note}` : ""
            return `${idx + 1}. ${e.title} - ${dateLabel}${noteLabel}${assigneesSuffix(e)}`
          })
        }
        if (rowId === "oneH" || rowId === "r1") {
          return mergeTaskEntriesByVisibleTitle(entries as (OneHItem | R1Item)[]).map((e: any, idx: number) =>
            `${idx + 1}. ${stripInitialsPrefix(e.title)}${assigneesSuffix(e)}`
          )
        }
        if (rowId === "personal") {
          return mergeTaskEntriesByVisibleTitle(entries as PersonalItem[]).map((e: PersonalItem, idx: number) =>
            `${idx + 1}. ${stripInitialsPrefix(e.title)}${assigneesSuffix(e)}`
          )
        }
        if (rowId === "external") {
          return entries.map((e: ExternalItem, idx: number) =>
            `${idx + 1}. ${stripInitialsPrefix(`${e.title} ${formatTimeLabel(e.time)}`.trim())}${assigneesSuffix(e)}`
          )
        }
        if (rowId === "internal") {
          return entries.map((e: InternalItem, idx: number) =>
            `${idx + 1}. ${stripInitialsPrefix(`${e.title} ${formatTimeLabel(e.time)}`.trim())}${assigneesSuffix(e)}`
          )
        }
        if (rowId === "priority") {
          return entries.map((e: PriorityItem, idx: number) => `${idx + 1}. ${e.project}${assigneesSuffix(e)}`)
        }
        return []
      }

      const rows = weekTableRows.map((row, rowIndex) => {
        const cells = commonWeekISOs.map((iso) => renderCellLines(row.id as CommonType, iso).join("\n"))
        return [String(rowIndex + 1), row.label.toUpperCase(), ...cells]
      })

      return {
        title: `COMMON VIEW - GANE TASKS${weekTitleRange ? ` (${weekTitleRange})` : ""}`,
        columns,
        rows,
      }
    }, [commonGaRowsByDay, commonWeekISOs, tableDataByDay, weekTableRows, weekTitleRange])
    const renderCellContent = (rowId: CommonType, iso: string) => {
      const dayData = tableDataByDay?.[iso]
      if (!dayData) return null
      if (rowId === "det_ga") {
        const combined = commonGaRowsByDay[iso]?.detGa || []
        if (!combined.length) return null
        return combined.map((entry, idx) => (
          <div key={`${entry.kind}-${entry.templateId || entry.taskId || idx}`} className="week-table-entry">
            <span>{idx + 1}. {entry.title}</span>
          </div>
        ))
      }
      const renderBzContent = () => {
        const bzEntries = commonGaRowsByDay[iso]?.bz || []
        if (!bzEntries.length) return null

        return bzEntries.map((e: BzItem, idx: number) => (
          <div key={`bz-${e.templateId || e.taskId || idx}`} className="week-table-entry">
            <span>
              {idx + 1}. {stripInitialsPrefix(`${formatBzTimeDisplay(e.time)} ${e.title}`.trim())}
              {e.bzWithLabel ? ` - BZ: ${e.bzWithLabel}` : ""}
            </span>
            {e.assignees && e.assignees.length ? (
              <div className="week-table-avatars">
                {e.assignees.map((name: string) => (
                  <span key={`${e.title}-${name}`} className="week-table-avatar" title={name}>
                    {commonViewInitials(name)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))
      }
      const entries =
        rowId === "late"
          ? dayData.late
          : rowId === "absent"
            ? dayData.absent
            : rowId === "leave"
              ? dayData.leave
              : rowId === "blocked"
                ? dayData.blocked
                : rowId === "oneH"
                  ? dayData.oneH
                  : rowId === "r1"
                    ? dayData.r1
                    : rowId === "personal"
                      ? dayData.personal
                      : rowId === "external"
                        ? dayData.external
                        : rowId === "internal"
                          ? dayData.internal
                          : rowId === "bz"
                            ? dayData.bz
                            : rowId === "priority"
                              ? dayData.priority
                              : rowId === "problem"
                                ? dayData.problems
                                : rowId === "feedback"
                                  ? dayData.feedback
                                  : []

      if (rowId === "bz") {
        return renderBzContent()
      }
      if (!entries.length) return null

      if (rowId === "late") {
        return entries.map((e: LateItem, idx: number) => (
          <div key={idx} className="week-table-entry">
            <span>{idx + 1}. {e.start || "08:00"}-{e.until}</span>
            <div className="week-table-avatars">
              {entryAssignees(e).map((name: string) => (
                <span key={`${e.start}-${name}`} className="week-table-avatar" title={name}>
                  {commonViewInitials(name)}
                </span>
              ))}
            </div>
          </div>
        ))
      }
      if (rowId === "absent") {
        return entries.map((e: AbsentItem, idx: number) => (
          <div key={idx} className="week-table-entry">
            <span>{idx + 1}. {e.from} - {e.to}</span>
            <div className="week-table-avatars">
              {entryAssignees(e).map((name: string) => (
                <span key={`${e.from}-${name}`} className="week-table-avatar" title={name}>
                  {commonViewInitials(name)}
                </span>
              ))}
            </div>
          </div>
        ))
      }
      if (rowId === "leave") {
        return entries.map((e: LeaveItem, idx: number) => {
          const isAllUsers = Boolean(e.isAllUsers || e.person === ALL_USERS_INITIALS)
          const timeLabel = e.fullDay ? "08:00-16:30" : `${e.from}-${e.to}`
          const noteLabel = e.note ? ` - ${e.note}` : ""
          return (
            <div key={idx} className="week-table-entry">
              <span>
                {idx + 1}. {isAllUsers ? `${timeLabel} ALL` : timeLabel}
                {noteLabel}
              </span>
              {!isAllUsers ? (
                <div className="week-table-avatars">
                  {entryAssignees(e).map((name: string) => (
                    <span key={`${e.from}-${name}`} className="week-table-avatar" title={name}>
                      {commonViewInitials(name)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })
      }
      if (rowId === "blocked") {
        return entries.map((e: BlockedItem, idx: number) => (
          <div key={idx} className="week-table-entry">
            <span>{idx + 1}. {stripInitialsPrefix(e.title)}</span>
            <div className="week-table-avatars">
              {entryAssignees(e).map((name: string) => (
                <span key={`${e.title}-${name}`} className="week-table-avatar" title={name}>
                  {commonViewInitials(name)}
                </span>
              ))}
            </div>
          </div>
        ))
      }
      if (rowId === "problem" || rowId === "feedback") {
        return entries.map((e: ProblemItem | FeedbackItem, idx: number) => (
          <div key={idx} className="week-table-entry">
            <span>
              {idx + 1}. {e.title}
              {` - ${e.createdDate ? formatDateHuman(e.createdDate) : formatDateHuman(e.date)}`}
              {e.note ? ` - ${e.note}` : ""}
            </span>
            <div className="week-table-avatars">
              {entryAssignees(e).map((name: string) => (
                <span key={`${e.title}-${name}`} className="week-table-avatar" title={name}>
                  {commonViewInitials(name)}
                </span>
              ))}
            </div>
          </div>
        ))
      }
      if (rowId === "oneH" || rowId === "r1") {
        return mergeTaskEntriesByVisibleTitle(entries as (OneHItem | R1Item)[]).map((e: any, idx: number) => (
          <div key={idx} className="week-table-entry">
            <span>{idx + 1}. {stripInitialsPrefix(e.title)}</span>
            <div className="week-table-avatars">
              {entryAssignees(e).map((name: string) => (
                <span key={`${e.title}-${name}`} className="week-table-avatar" title={name}>
                  {commonViewInitials(name)}
                </span>
              ))}
            </div>
          </div>
        ))
      }
      if (rowId === "personal") {
        return mergeTaskEntriesByVisibleTitle(entries as PersonalItem[]).map((e: PersonalItem, idx: number) => (
          <div key={idx} className="week-table-entry">
            <span>{idx + 1}. {stripInitialsPrefix(e.title)}</span>
            <div className="week-table-avatars">
              {entryAssignees(e).map((name: string) => (
                <span key={`${e.title}-${name}`} className="week-table-avatar" title={name}>
                  {commonViewInitials(name)}
                </span>
              ))}
            </div>
          </div>
        ))
      }
      if (rowId === "external") {
        return entries.map((e: ExternalItem, idx: number) => (
          <div key={idx} className="week-table-entry">
            <span>{idx + 1}. {stripInitialsPrefix(`${e.title} ${formatTimeLabel(e.time)}`.trim())}</span>
            <div className="week-table-avatars">
              {entryAssignees(e).map((name: string) => (
                <span key={`${e.title}-${name}`} className="week-table-avatar" title={name}>
                  {commonViewInitials(name)}
                </span>
              ))}
            </div>
          </div>
        ))
      }
      if (rowId === "internal") {
        return entries.map((e: InternalItem, idx: number) => (
          <div key={idx} className="week-table-entry">
            <span>{idx + 1}. {stripInitialsPrefix(`${e.title} ${formatTimeLabel(e.time)}`.trim())}</span>
            <div className="week-table-avatars">
              {entryAssignees(e).map((name: string) => (
                <span key={`${e.title}-${name}`} className="week-table-avatar" title={name}>
                  {commonViewInitials(name)}
                </span>
              ))}
            </div>
          </div>
        ))
      }
      if (rowId === "priority") {
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
                      {commonViewInitials(name)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {groupIdx < groupKeys.length - 1 ? <div className="week-table-prjk-divider" /> : null}
          </React.Fragment>
        ))
      }
      return null
    }

    const renderAssignedBadges = (badges: { id: string; value: string; label: string }[]) => {
      if (!badges.length) return <span className="text-slate-500">-</span>
      return (
        <div className="flex items-center gap-1">
          {badges.map((item) => (
            <div
              key={item.id}
              className="h-6 w-6 rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600 flex items-center justify-center"
              title={item.label}
            >
              {item.value}
            </div>
          ))}
        </div>
      )
    }

    const renderAllTasksTable = (
      rows: typeof filteredAllTasksRows,
      options?: { accent?: boolean; emptyLabel?: string }
    ) => {
      const headers = [
        "NR",
        "LL",
        "DATE",
        "AM/PM",
        "TITLE",
        "KOHA BZ",
        "STATUS",
        "PRIORITY",
        "KOMENT",
        "ACTIONS",
      ]
      return (
      <Table
        containerClassName="mt-3 rounded-lg border border-slate-200 bg-white"
        className="min-w-[760px] text-[10px] sm:min-w-[940px]"
      >
        <TableHeader>
          <TableRow className="bg-slate-50">
            {headers.map((label) => (
              <TableHead
                key={label}
                className={`h-8 border-r border-slate-200 px-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 last:border-r-0 ${
                  label === "NR"
                    ? "w-[26px] px-1 text-center"
                    : label === "LL"
                      ? "w-[30px] px-1 text-center"
                      : label === "DATE"
                        ? "w-[42px] max-w-[42px] px-0.5 sm:w-[74px] sm:max-w-none sm:px-1"
                        : label === "AM/PM"
                          ? "w-[54px]"
                          : label === "TITLE"
                            ? "min-w-[160px] sm:min-w-[220px]"
                            : label === "KOHA BZ"
                              ? "hidden w-[70px] sm:table-cell"
                              : label === "STATUS"
                                ? "w-[86px]"
                                : label === "PRIORITY"
                                  ? "w-[70px]"
                                  : label === "KOMENT"
                                    ? "min-w-[120px]"
                                    : label === "ACTIONS"
                                      ? "w-[82px]"
                                      : ""
                }`}
              >
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row, index) => {
              const statusValue = TASK_STATUS_OPTIONS.includes(row.status as (typeof TASK_STATUS_OPTIONS)[number])
                ? row.status
                : "TODO"
              const statusLabel = reportStatusLabel(statusValue)
              const statusClass = weeklyPlanStatusBgClass(statusValue)
              const actionKey = `task:${row.taskId || "na"}`
              const isUpdating = Boolean(taskStatusUpdating[actionKey])
              const commentKey = `all-task:${row.taskId}`
              const previousValue = row.comment ?? ""
              const commentValue = commentKey ? (allTasksReportCommentEdits[commentKey] ?? previousValue) : ""
              const isSaving = commentKey ? Boolean(savingAllTasksReportComments[commentKey]) : false
              const canMarkDone = statusValue !== "DONE" && !row.isBzOnly
              const actionLabel =
                row.needsGaneConfirmation && statusValue === "WAITING_CONFIRMATION" ? "Confirm" : "Done"
              const rowTask = tasks.find((task) => task.id === row.taskId) || null
              return (
                <TableRow key={row.id}>
                  <TableCell className="w-[26px] border-r border-slate-200 px-1 py-1 text-center align-middle font-semibold text-slate-700 last:border-r-0">{index + 1}</TableCell>
                  <TableCell className="w-[30px] border-r border-slate-200 px-1 py-1 text-center align-middle font-semibold last:border-r-0">{row.ll}</TableCell>
                  <TableCell className="w-[42px] max-w-[42px] border-r border-slate-200 px-0.5 py-1 align-middle last:border-r-0 sm:w-[74px] sm:max-w-none sm:px-1">
                    <div className="flex flex-col items-start gap-0.5 leading-none">
                      <span>{row.dateLabel}</span>
                      {row.isLateSystemTask ? (
                        <Badge
                          variant="destructive"
                          className="w-fit rounded-sm px-1 py-0 text-[8px] uppercase leading-tight sm:px-1.5 sm:text-[10px]"
                        >
                          {row.lateDays ? `Late ${row.lateDays}` : "Late"}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="w-[54px] border-r border-slate-200 px-1.5 py-1 align-middle last:border-r-0">{row.period || "-"}</TableCell>
                  <TableCell
                    className="min-w-[160px] border-r border-slate-200 px-1.5 py-1 align-middle whitespace-normal break-words font-medium text-slate-800 last:border-r-0 sm:min-w-[220px]"
                    title={row.title}
                  >
                    <div className="flex items-start gap-1.5 sm:block">
                      {row.kohaBz !== "-" ? (
                        <span className="inline-flex shrink-0 rounded-sm bg-slate-100 px-1 py-0.5 text-[9px] font-semibold text-slate-600 sm:hidden">
                          {row.kohaBz}
                        </span>
                      ) : null}
                      <span>{row.title}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden w-[70px] border-r border-slate-200 px-1.5 py-1 align-middle last:border-r-0 sm:table-cell">
                    {row.kohaBz}
                  </TableCell>
                  <TableCell className={`w-[86px] border-r border-slate-200 px-1.5 py-1 align-middle uppercase last:border-r-0 ${statusClass}`}>
                    {statusLabel}
                  </TableCell>
                  <TableCell className="w-[70px] border-r border-slate-200 px-1.5 py-1 align-middle uppercase last:border-r-0">{row.priority}</TableCell>
                  <TableCell className="min-w-[120px] border-r border-slate-200 px-1.5 py-1 align-middle last:border-r-0">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        aria-label="Koment"
                        className="h-4 w-full min-w-0 border-b border-slate-300 bg-transparent"
                        value={commentValue}
                        onChange={(e) => {
                          if (!commentKey) return
                          setAllTasksReportCommentEdits((prev) => ({ ...prev, [commentKey]: e.target.value }))
                        }}
                        onBlur={(e) => {
                          const nextValue = e.target.value
                          void saveAllTasksReportTaskComment(row.taskId, nextValue, previousValue, commentKey)
                        }}
                        disabled={!commentKey}
                      />
                      <span className="text-[10px] text-slate-400">{isSaving ? "Saving" : ""}</span>
                    </div>
                  </TableCell>
                  <TableCell className="w-[82px] px-1.5 py-1 align-middle">
                    <div className="flex items-center gap-1">
                      {canMarkDone ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          disabled={isUpdating}
                          onClick={() => void updateTaskStatus(row.taskId, "DONE")}
                        >
                          {isUpdating ? "Updating..." : actionLabel}
                        </Button>
                      ) : row.isBzOnly && statusValue !== "DONE" ? (
                        <span className="text-[10px] text-amber-700">You&apos;re not assigned</span>
                      ) : (
                        <span className="text-xs text-emerald-700">Done</span>
                      )}
                      {rowTask ? (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-5 w-5 border-slate-200 text-slate-500 hover:border-blue-200 hover:text-blue-600"
                          title={row.isFastTask ? "Edit task dates" : "Edit due date"}
                          aria-label={`Edit ${row.title}`}
                          onClick={() => startEditTask(rowTask)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })
          ) : (
            <TableRow>
              <TableCell colSpan={headers.length} className="py-8 text-center text-sm text-muted-foreground">
                {options?.emptyLabel || "No tasks available."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      )
    }

    return (
      <div className="admin-week-table">
        <div className="print-section" data-print-section="all-tasks">
          <AdminTasksSection
            title="ALL TASKS"
            description=""
            headerClassName="px-3 sm:px-6"
            contentClassName="px-3 sm:px-6"
            actions={
              <div className="flex items-center gap-2 print:hidden">
                <Button variant="outline" size="sm" onClick={() => setFastTaskOpen(true)}>
                  + Add Fast Task
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleSectionPrint("all-tasks")}>
                  Print
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void exportAllTasks()}
                  disabled={exportingAllTasks}
                >
                  {exportingAllTasks ? "Exporting..." : "Export"}
                </Button>
              </div>
            }
          >
          <div className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>Total: {filteredAllTasksRows.length}</div>
            <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:hidden">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-8 w-fit px-3 ${allTasksDateFrom || allTasksDateTo ? "" : "border-blue-500 bg-blue-50 text-blue-700"}`}
                onClick={() => {
                  setAllTasksDateFrom("")
                  setAllTasksDateTo("")
                }}
              >
                All dates
              </Button>
              <span />
              <span>From</span>
              <Input
                type="date"
                className="h-8 w-full min-w-0 text-xs"
                value={allTasksDateFrom || ""}
                onChange={(event) => setAllTasksDateFrom(event.target.value)}
              />
              <span>To</span>
              <Input
                type="date"
                className="h-8 w-full min-w-0 text-xs"
                value={allTasksDateTo || ""}
                onChange={(event) => setAllTasksDateTo(event.target.value)}
              />
            </div>
            <div className="hidden sm:flex sm:items-center sm:gap-2">
              <span>Date</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-8 px-3 ${allTasksDateFrom || allTasksDateTo ? "" : "border-blue-500 bg-blue-50 text-blue-700"}`}
                onClick={() => {
                  setAllTasksDateFrom("")
                  setAllTasksDateTo("")
                }}
              >
                All
              </Button>
              <span>From</span>
              <Input
                type="date"
                className="h-8 w-[160px] text-xs"
                value={allTasksDateFrom || ""}
                onChange={(event) => setAllTasksDateFrom(event.target.value)}
              />
              <span>To</span>
              <Input
                type="date"
                className="h-8 w-[160px] text-xs"
                value={allTasksDateTo || ""}
                onChange={(event) => setAllTasksDateTo(event.target.value)}
              />
            </div>
          </div>
          <div className="mt-4">
            {renderAllTasksTable(combinedNonConfirmationRows, {
              emptyLabel: "No tasks available.",
            })}
          </div>
          {waitingConfirmationRows.length ? (
            <div className="mt-5">
              <div className="text-sm font-semibold uppercase tracking-wide text-slate-800">
                Waiting Confirmation For Gane
              </div>
              <div className="mt-1 text-xs text-slate-500">
                
              </div>
              {renderAllTasksTable(waitingConfirmationRows, {
                emptyLabel: "No waiting confirmation tasks.",
              })}
            </div>
          ) : null}
          </AdminTasksSection>
        </div>
        <div className="print-section" data-print-section="common">
          <div className="print-only week-table-view">
            <div className="print-page">
              <div className="print-header">
                <div />
                <div className="print-title">COMMON VIEW - WEEK PLAN</div>
                <div className="print-datetime">{formatDateTimeDMY(printedAt)}</div>
              </div>
              <table className="week-table">
                <thead>
                <tr>
                  <th style={{ width: "40px" }}>NR</th>
                  <th style={{ width: "110px" }}>LLOJI</th>
                  {commonWeekISOs.map((iso) => {
                    const d = fromISODate(iso)
                    const dayCode = getDayCode(d)
                    return (
                      <th key={iso} colSpan={1} className="week-table-date-header">
                        <div>{dayCode} = {formatDateHuman(iso)}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
                <tbody>
                  {weekTableRows.map((row, rowIndex) => {
                    const rowLabel = row.label.toUpperCase()
                    const weekRowClass =
                      row.id === "late"
                        ? "delay"
                        : row.id === "absent"
                          ? "absence"
                          : row.id === "oneH"
                            ? "oneh"
                            : row.id
                    return (
                      <tr key={`print-${row.id}`} className={`week-table-row ${weekRowClass}`}>
                        <td className="week-table-number">{rowIndex + 1}</td>
                        <td className="week-table-label">{rowLabel}</td>
                        {commonWeekISOs.map((iso) => {
                          const content = renderCellContent(row.id as CommonType, iso)
                          return (
                            <td key={`print-${row.id}-${iso}`} className="week-table-cell">
                              {content ? (
                                <div className="week-table-entries">{content}</div>
                              ) : (
                                <span className="week-table-empty">-</span>
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
          </div>
          <div className="print:hidden">
            <AdminTasksSection
              title={`COMMON VIEW - GANE TASKS${weekTitleRange ? ` (${weekTitleRange})` : ""}`}
              description=""
              actions={
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  <Button
                    variant={toISODate(commonWeekStart) === thisCommonWeekIso ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCommonWeekStart(getMonday(new Date()))}
                  >
                    This Week
                  </Button>
                  <Button
                    variant={toISODate(commonWeekStart) === nextCommonWeekIso ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCommonWeekStart(addDays(getMonday(new Date()), 7))}
                  >
                    Next Week
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleSectionPrint("common")}>
                    Print
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void exportCommonView(exportPayload)}
                    disabled={exportingCommonView}
                  >
                    {exportingCommonView ? "Exporting..." : "Export"}
                  </Button>
                </div>
              }
            >
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 print:hidden">
                {commonLoading ? <span>Loading...</span> : null}
                {commonError ? <span className="text-red-600">{commonError}</span> : null}
                {gaSystemLoading ? <span>Loading DET GA...</span> : null}
                {gaSystemError ? <span className="text-red-600">{gaSystemError}</span> : null}
              </div>
              <div className="mt-3 overflow-x-auto print:hidden">
                <table className="week-table">
                  <thead>
                  <tr>
                    <th style={{ width: "40px" }}>NR</th>
                    <th style={{ width: "110px" }}>LLOJI</th>
                    {commonWeekISOs.map((iso) => {
                      const d = fromISODate(iso)
                      const dayCode = getDayCode(d)
                      return (
                        <th key={iso} colSpan={1} className="week-table-date-header">
                          <div>{dayCode} = {formatDateHuman(iso)}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                  <tbody>
                    {weekTableRows.map((row, rowIndex) => {
                      const rowLabel = row.label.toUpperCase()
                      const weekRowClass =
                        row.id === "late"
                          ? "delay"
                          : row.id === "absent"
                            ? "absence"
                            : row.id === "oneH"
                              ? "oneh"
                              : row.id
                      return (
                        <tr key={row.id} className={`week-table-row ${weekRowClass}`}>
                          <td className="week-table-number">{rowIndex + 1}</td>
                          <td className="week-table-label">{rowLabel}</td>
                          {commonWeekISOs.map((iso) => {
                            const content = renderCellContent(row.id as CommonType, iso)
                            return (
                              <td key={iso} className="week-table-cell">
                                {content ? (
                                  <div className="week-table-entries">{content}</div>
                                ) : (
                                  <span className="week-table-empty">-</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </AdminTasksSection>
          </div>
        </div>
        <div className="print-section" data-print-section="ga-time">
          <div className="print-only">
            <div className="print-page">
              <div className="print-header">
                <div />
                <div className="print-title">GA TIME TABLE{weekTitleRange ? ` (${weekTitleRange})` : ""}</div>
                <div className="print-datetime">{formatDateTimeDMY(printedAt)}</div>
              </div>
              <div className="ga-time-table">
                <table className="ga-time-table-table">
                  <thead>
                    <tr>
                      <th className="ga-time-header ga-time-nr">NR</th>
                      <th className="ga-time-header">Time</th>
                      {commonWeekISOs.map((iso) => {
                        const d = fromISODate(iso)
                        const dayCode = getDayCode(d)
                        return (
                          <th key={`ga-print-${iso}`} className="ga-time-header">
                            <div>{dayCode} = {formatDateHuman(iso)}</div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {GA_TIME_ROWS.map((slot) => (
                      <tr
                        key={`ga-print-${slot.start}`}
                        className={
                          slot.isSpecial
                            ? "ga-time-row ga-time-row-custom"
                            : slot.start === "08:00"
                            ? "ga-time-row ga-time-row-secondary"
                            : slot.start < "14:00"
                              ? "ga-time-row ga-time-row-primary"
                              : "ga-time-row ga-time-row-secondary"
                        }
                      >
                        <td className="ga-time-slot-label ga-time-nr">{slot.nrLabel}</td>
                        <td className="ga-time-slot-label">{slot.label || "\u00A0"}</td>
                        {commonWeekISOs.map((iso) => {
                          const dayOfWeek = toDayOfWeek(iso)
                          const cellKey = `${dayOfWeek}|${slot.start}`
                          const entries = gaTimeEntriesByCell.get(cellKey) || []
                          return (
                            <td key={`ga-print-${cellKey}`} className="ga-time-cell">
                              <div className="ga-time-cell-content">
                                {entries.length ? (
                                  entries.map((entry) => (
                                    <div key={`ga-print-${entry.id}`} className="ga-time-entry">
                                      <span>{entry.content}</span>
                                    </div>
                                  ))
                                ) : slot.isSpecial ? null : (
                                  <span className="week-table-empty">-</span>
                                )}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="print-footer">
                <span />
                <div className="print-page-count">1/{printTotalPages}</div>
                <div className="print-initials">PUNOI: {printInitials}</div>
              </div>
            </div>
          </div>
          <div className="print:hidden">
          <AdminTasksSection
            title={`GA TIME TABLE${weekTitleRange ? ` (${weekTitleRange})` : ""}`}
            description=""
            actions={
              <div className="flex items-center gap-2 print:hidden">
                <Button variant="outline" size="sm" onClick={() => handleSectionPrint("ga-time")}>
                  Print
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void exportGaTime()}
                  disabled={exportingGaTime}
                >
                  {exportingGaTime ? "Exporting..." : "Export"}
                </Button>
              </div>
            }
          >
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            {gaTimeLoading ? <span>Loading GA time slots...</span> : null}
            {gaTimeError ? <span className="text-red-600">{gaTimeError}</span> : null}
          </div>
          <div className="mt-3 overflow-x-auto ga-time-table">
            <table className="ga-time-table-table">
              <thead>
                <tr>
                  <th className="ga-time-header ga-time-nr">NR</th>
                  <th className="ga-time-header">Time</th>
                  {commonWeekISOs.map((iso) => {
                    const d = fromISODate(iso)
                    const dayCode = getDayCode(d)
                    return (
                      <th key={`ga-${iso}`} className="ga-time-header">
                        <div>{dayCode} = {formatDateHuman(iso)}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {GA_TIME_ROWS.map((slot) => (
                  <tr key={slot.start} className={slot.isSpecial ? "ga-time-row-custom" : undefined}>
                    <td className="ga-time-slot-label ga-time-nr">{slot.nrLabel}</td>
                    <td className="ga-time-slot-label">{slot.label || "\u00A0"}</td>
                    {commonWeekISOs.map((iso) => {
                      const dayOfWeek = toDayOfWeek(iso)
                      const cellKey = `${dayOfWeek}|${slot.start}`
                      const entries = gaTimeEntriesByCell.get(cellKey) || []
                      const addDraft = gaTimeAddDrafts[cellKey] ?? ""
                      return (
                        <td key={`${cellKey}`} className="ga-time-cell">
                          <div className="ga-time-cell-content">
                            {entries.map((entry) => {
                              const isEditing = gaTimeEditingId === entry.id
                              const draft = gaTimeDrafts[entry.id] ?? entry.content
                              return (
                                <div key={entry.id} className="ga-time-entry">
                                  {isEditing ? (
                                    <input
                                      className="ga-time-input"
                                      value={draft}
                                      onChange={(event) =>
                                        setGaTimeDrafts((prev) => ({
                                          ...prev,
                                          [entry.id]: event.target.value,
                                        }))
                                      }
                                      onBlur={async () => {
                                        const nextValue = (gaTimeDrafts[entry.id] ?? entry.content).trim()
                                        setGaTimeEditingId(null)
                                        if (!nextValue || nextValue === entry.content) return
                                        await updateGaTimeEntry(entry.id, nextValue)
                                      }}
                                      onKeyDown={async (event) => {
                                        if (event.key === "Enter") {
                                          event.preventDefault()
                                          const nextValue = (gaTimeDrafts[entry.id] ?? entry.content).trim()
                                          setGaTimeEditingId(null)
                                          if (!nextValue || nextValue === entry.content) return
                                          await updateGaTimeEntry(entry.id, nextValue)
                                        }
                                        if (event.key === "Escape") {
                                          setGaTimeEditingId(null)
                                        }
                                      }}
                                      autoFocus
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      className="ga-time-entry-text"
                                      onClick={() => {
                                        if (!canEditGaTimeSlots) return
                                        setGaTimeEditingId(entry.id)
                                        setGaTimeDrafts((prev) => ({ ...prev, [entry.id]: entry.content }))
                                      }}
                                    >
                                      {entry.content}
                                    </button>
                                  )}
                                  {canEditGaTimeSlots ? (
                                    <button
                                      type="button"
                                      className="ga-time-delete"
                                      disabled={gaTimeDeleting[entry.id]}
                                      onClick={() => void deleteGaTimeEntry(entry.id)}
                                      title="Delete entry"
                                    >
                                      {gaTimeDeleting[entry.id] ? "..." : "×"}
                                    </button>
                                  ) : null}
                                </div>
                              )
                            })}
                            {canEditGaTimeSlots && (!slot.isSpecial || entries.length === 0) ? (
                              gaTimeAddingCell === cellKey ? (
                                <input
                                  className="ga-time-input"
                                  value={addDraft}
                                  onChange={(event) =>
                                    setGaTimeAddDrafts((prev) => ({ ...prev, [cellKey]: event.target.value }))
                                  }
                                  onBlur={async () => {
                                    const nextValue = (gaTimeAddDrafts[cellKey] ?? "").trim()
                                    setGaTimeAddingCell(null)
                                    setGaTimeAddDrafts((prev) => ({ ...prev, [cellKey]: "" }))
                                    if (!nextValue) return
                                    await createGaTimeEntry(String(dayOfWeek), slot.start, slot.end, nextValue)
                                  }}
                                  onKeyDown={async (event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault()
                                      const nextValue = (gaTimeAddDrafts[cellKey] ?? "").trim()
                                      setGaTimeAddingCell(null)
                                      setGaTimeAddDrafts((prev) => ({ ...prev, [cellKey]: "" }))
                                      if (!nextValue) return
                                      await createGaTimeEntry(String(dayOfWeek), slot.start, slot.end, nextValue)
                                    }
                                    if (event.key === "Escape") {
                                      setGaTimeAddingCell(null)
                                      setGaTimeAddDrafts((prev) => ({ ...prev, [cellKey]: "" }))
                                    }
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="ga-time-add"
                                  onClick={() => {
                                    setGaTimeAddingCell(cellKey)
                                    setGaTimeAddDrafts((prev) => ({ ...prev, [cellKey]: "" }))
                                  }}
                                >
                                  {slot.isSpecial ? "Add" : "+"}
                                </button>
                              )
                            ) : null}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </AdminTasksSection>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-50/30" data-print-target={printTarget || ""}>
      <div className="mx-auto max-w-none space-y-6 px-0 py-4 md:px-6 xl:px-16">
        <div className="space-y-8">
          <AdminCommonWeekTable />
        </div>
      </div>
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open)
          if (!open) {
            setEditingTaskId(null)
            setEditingTaskIsFast(false)
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTaskIsFast ? "Edit Fast Task Dates" : "Edit Task Due Date"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Task</Label>
              <Input value={editTitle} readOnly className="bg-slate-50 text-slate-600" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {editingTaskIsFast ? (
                <>
                  <div className="space-y-2">
                    <Label>Start date</Label>
                    <Input
                      type="date"
                      value={editStartDate}
                      onChange={(event) => {
                        const value = event.target.value
                        setEditStartDate(value)
                        setEditStartDateDisplay(value ? toDDMMYYYY(value) : "")
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Due date</Label>
                    <Input
                      type="date"
                      value={editDueDate}
                      onChange={(event) => {
                        const value = event.target.value
                        setEditDueDate(value)
                        setEditDueDateDisplay(value ? toDDMMYYYY(value) : "")
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Current due date</Label>
                    <Input value={editDueDateDisplay} readOnly className="bg-slate-50 text-slate-600" />
                  </div>
                  <div className="space-y-2">
                    <Label>New due date</Label>
                    <Input
                      type="date"
                      value={editDueDate}
                      onChange={(event) => {
                        const value = event.target.value
                        setEditDueDate(value)
                        setEditDueDateDisplay(value ? toDDMMYYYY(value) : "")
                      }}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="text-xs text-slate-500">
              {editingTaskIsFast
                ? "This updates the fast task date range for the active generated task copies."
                : "This updates only this generated task row. The system task template stays unchanged."}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={savingEdit || !editingTaskId || (editingTaskIsFast ? !editStartDate || !editDueDate : !editDueDate)}
                onClick={() => void saveEditTask()}
              >
                {savingEdit ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={fastTaskOpen}
        onOpenChange={(open) => {
          setFastTaskOpen(open)
          if (!open) resetFastTaskForm()
        }}
      >
        <DialogContent className="sm:max-w-lg bg-white border-slate-200 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-slate-800">New Fast Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-700">Type</Label>
              <Select
                value={fastTaskType}
                onValueChange={(v) => setFastTaskType(v as (typeof NO_PROJECT_TYPES)[number]["id"])}
              >
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
                {NO_PROJECT_TYPES.find((opt) => opt.id === fastTaskType)?.description}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700">Title</Label>
              <Input
                value={fastTaskTitle}
                onChange={(e) => setFastTaskTitle(e.target.value)}
                className="border-slate-200 focus:border-slate-400 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700">Description</Label>
              <BoldOnlyEditor value={fastTaskDescription} onChange={setFastTaskDescription} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-slate-700">Assign to</Label>
                <Dialog open={selectFastTaskAssigneesOpen} onOpenChange={setSelectFastTaskAssigneesOpen}>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start border-slate-200 focus:border-slate-400 rounded-xl"
                    onClick={() => setSelectFastTaskAssigneesOpen(true)}
                  >
                    {fastTaskAssigneeLabel}
                  </Button>
                  <DialogContent className="sm:max-w-md z-[110]">
                    <DialogHeader>
                      <DialogTitle>Select Assignees</DialogTitle>
                    </DialogHeader>
                    <div className="mt-4 max-h-[400px] overflow-y-auto space-y-2">
                      {users.length ? (
                        users.map((u) => {
                          const isSelected = fastTaskAssignees.includes(u.id)
                          return (
                            <div
                              key={u.id}
                              className="flex items-center space-x-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                              onClick={() => {
                                if (isSelected) {
                                  setFastTaskAssignees((prev) => prev.filter((id) => id !== u.id))
                                } else {
                                  setFastTaskAssignees((prev) => [...prev, u.id])
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
                      <Button variant="outline" onClick={() => setFastTaskAssignees([])}>
                        Clear
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setFastTaskAssignees(users.map((u) => u.id))}
                        disabled={!users.length}
                      >
                        All users
                      </Button>
                      <Button onClick={() => setSelectFastTaskAssigneesOpen(false)}>
                        Done
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700">Finish by (optional)</Label>
                <Select
                  value={fastTaskFinishPeriod}
                  onValueChange={(value) =>
                    setFastTaskFinishPeriod(value as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)
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
                  value={fastTaskStartDate}
                  onChange={(e) => setFastTaskStartDate(e.target.value)}
                  className="border-slate-200 focus:border-slate-400 rounded-xl w-full"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700">Due date (optional)</Label>
                <Input
                  type="date"
                  value={fastTaskDueDate}
                  onChange={(e) => setFastTaskDueDate(e.target.value)}
                  className="border-slate-200 focus:border-slate-400 rounded-xl w-full"
                />
              </div>
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
              <Checkbox
                checked={fastTaskDeadlineImportant}
                onCheckedChange={(checked) => setFastTaskDeadlineImportant(checked === true)}
              />
              <span className="text-sm font-medium text-slate-700">Deadline important</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFastTaskOpen(false)} className="rounded-xl border-slate-200">
                Cancel
              </Button>
              <Button
                disabled={!fastTaskTitle.trim() || !fastTaskStartDate || creatingFastTask}
                onClick={() => void submitFastTask()}
                className="bg-blue-500 hover:bg-blue-600 text-white border-0 shadow-sm rounded-xl"
              >
                {creatingFastTask ? "Creating..." : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={fastEditOpen}
        onOpenChange={(open) => {
          setFastEditOpen(open)
          if (!open) setFastEditTaskId(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Fast Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={fastEditTitle} onChange={(event) => setFastEditTitle(event.target.value)} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={fastEditStartDate}
                  onChange={(event) => setFastEditStartDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Due date</Label>
                <Input
                  type="date"
                  value={fastEditDueDate}
                  onChange={(event) => setFastEditDueDate(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={fastEditPriority} onValueChange={(value) => setFastEditPriority(value as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={fastEditStatus} onValueChange={setFastEditStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUS_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {reportStatusLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isWaitingConfirmation(fastEditStatus) ? (
              <div className="space-y-2">
                <Label>Confirm by (Manager/Admin)</Label>
                <Select
                  value={fastEditConfirmationAssigneeId || "__none__"}
                  onValueChange={(value) => setFastEditConfirmationAssigneeId(value === "__none__" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select confirmer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select confirmer</SelectItem>
                    {confirmerCandidates.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.full_name || candidate.username || "-"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFastEditOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={
                  fastEditSaving ||
                  !fastEditTitle.trim() ||
                  (isWaitingConfirmation(fastEditStatus) && !fastEditConfirmationAssigneeId)
                }
                onClick={() => void saveFastTaskEdit()}
              >
                {fastEditSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(pendingStatusTaskId)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingStatusTaskId(null)
            setPendingStatusValue("TODO")
            setPendingConfirmationAssigneeId("")
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Confirmer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-slate-600">
              This task is moving to Waiting Confirmation. Select the manager/admin who will confirm it.
            </div>
            <div className="space-y-2">
              <Label>Confirm by (Manager/Admin)</Label>
              <Select
                value={pendingConfirmationAssigneeId || "__none__"}
                onValueChange={(value) => setPendingConfirmationAssigneeId(value === "__none__" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select confirmer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select confirmer</SelectItem>
                  {confirmerCandidates.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.full_name || candidate.username || "-"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPendingStatusTaskId(null)
                  setPendingStatusValue("TODO")
                  setPendingConfirmationAssigneeId("")
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={!pendingConfirmationAssigneeId}
                onClick={() => void submitPendingStatusUpdate()}
              >
                Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <style jsx global>{`
        .daily-report-table th,
        .daily-report-table td {
          vertical-align: bottom;
          padding-bottom: 0;
          padding-top: 15px;
        }
        .daily-report-table {
          border-collapse: collapse !important;
          border-spacing: 0 !important;
        }
        .daily-report-table thead {
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .daily-report-table thead th {
          border-width: 2px !important;
          border-color: #475569 !important;
          background-color: #f8fafc !important;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        .daily-report-table thead th:first-child {
          border-left: 3px solid #475569 !important;
          position: sticky;
          left: 0;
          z-index: 30;
          box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1);
        }
        .daily-report-table thead th:last-child {
          border-right: 3px solid #475569 !important;
        }
        .daily-report-table thead tr {
          border-top: 3px solid #475569 !important;
          border-bottom: 3px solid #475569 !important;
          border-left: 2px solid #475569 !important;
          border-right: 2px solid #475569 !important;
        }
        .admin-week-table {
          --delay-bg: #fff4e6;
          --absence-bg: #ffe9e9;
          --leave-bg: #e9f9ef;
          --blocked-bg: #ffe7ea;
          --oneh-bg: #e0f2fe;
          --personal-bg: #f3e8ff;
          --external-bg: #e0f2fe;
          --internal-bg: #f1f5f9;
          --bz-bg: #e6fffb;
          --r1-bg: #dcfce7;
          --problem-bg: #ecfeff;
          --feedback-bg: #e2e8f0;
          --priority-bg: #fef3c7;
        }
        .admin-week-table .week-table {
          width: 100%;
          border-collapse: collapse;
          border: 2px solid #111827;
          font-size: 11px;
          direction: ltr;
          table-layout: fixed;
        }
        .admin-week-table .week-table th {
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
        .admin-week-table .week-table thead tr:first-child th {
          border-top-width: 2px;
        }
        .admin-week-table .week-table thead tr:last-child th {
          border-bottom-width: 2px;
        }
        .admin-week-table .week-table thead th:first-child {
          border-left-width: 2px;
        }
        .admin-week-table .week-table thead th:last-child {
          border-right-width: 2px;
        }
        .admin-week-table .week-table thead tr:nth-child(2) th {
          top: 30px;
          z-index: 1;
        }
        .admin-week-table .week-table-date-header {
          background: #bfdbfe !important;
          font-size: 10px;
        }
        .admin-week-table .week-table-subheader {
          background: #dbeafe !important;
          font-size: 9px;
          font-weight: 600;
        }
        .admin-week-table .week-table td {
          border: 1px solid #dee2e6;
          padding: 6px 8px;
          vertical-align: bottom;
          font-size: 10px;
          text-align: left;
        }
        .admin-week-table .week-table-number {
          width: 40px;
          text-align: center;
          font-weight: 700;
          background: #f8f9fa;
        }
        .admin-week-table .week-table-label {
          width: 110px;
          font-weight: 700;
          background: #f8f9fa;
        }
        .admin-week-table .week-table-row.delay .week-table-label {
          background: var(--delay-bg);
        }
        .admin-week-table .week-table-row.absence .week-table-label {
          background: var(--absence-bg);
        }
        .admin-week-table .week-table-row.leave .week-table-label {
          background: var(--leave-bg);
        }
        .admin-week-table .week-table-row.blocked .week-table-label {
          background: var(--blocked-bg);
        }
        .admin-week-table .week-table-row.oneh .week-table-label {
          background: var(--oneh-bg);
        }
        .admin-week-table .week-table-row.personal .week-table-label {
          background: var(--personal-bg);
        }
        .admin-week-table .week-table-row.external .week-table-label {
          background: var(--external-bg);
        }
        .admin-week-table .week-table-row.internal .week-table-label {
          background: var(--internal-bg);
        }
        .admin-week-table .week-table-row.bz .week-table-label {
          background: var(--bz-bg);
        }
        .admin-week-table .week-table-row.r1 .week-table-label {
          background: var(--r1-bg);
        }
        .admin-week-table .week-table-row.problem .week-table-label {
          background: var(--problem-bg);
        }
        .admin-week-table .week-table-row.feedback .week-table-label {
          background: var(--feedback-bg);
        }
        .admin-week-table .week-table-row.priority .week-table-label {
          background: var(--priority-bg);
        }
        .admin-week-table .week-table-cell {
          min-height: 30px;
        }
        .admin-week-table .week-table-entries {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .admin-week-table .week-table-entry {
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
        .admin-week-table .week-table-prjk-divider {
          border-top: 1px solid #64748b;
          margin: 1px 0;
        }
        .admin-week-table .week-table-entry span {
          flex: 1;
        }
        .admin-week-table .week-table-avatars {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 2px;
        }
        .admin-week-table .week-table-avatar {
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
        .admin-week-table .week-table-empty {
          color: #adb5bd;
          font-style: italic;
        }
        .admin-week-table .ga-time-table-table {
          width: 100%;
          border-collapse: collapse;
          border: 1px solid #e2e8f0;
          font-size: 11px;
        }
        .admin-week-table .ga-time-header {
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          padding: 8px 6px;
          text-align: left;
          font-weight: 700;
          font-size: 10px;
          vertical-align: bottom;
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .admin-week-table .ga-time-nr {
          width: 30px;
          text-align: center;
        }
        .admin-week-table .ga-time-slot-label {
          border: 1px solid #e2e8f0;
          background: #f1f5f9;
          font-weight: 700;
          font-size: 10px;
          text-align: left;
          padding: 6px;
          white-space: nowrap;
          direction: ltr;
          vertical-align: bottom;
        }
        .admin-week-table .ga-time-row-custom .ga-time-slot-label {
          background: #f8fafc;
        }
        .admin-week-table .ga-time-cell {
          border: 1px solid #e2e8f0;
          padding: 6px;
          vertical-align: bottom;
          min-width: 140px;
        }
        .admin-week-table .ga-time-cell-content {
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          gap: 6px;
          min-height: 100%;
        }
        .admin-week-table .ga-time-entry {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 4px 6px;
          font-size: 11px;
        }
        .admin-week-table .ga-time-entry-text {
          background: transparent;
          border: none;
          text-align: left;
          padding: 0;
          font-size: 11px;
          color: #0f172a;
          flex: 1;
          cursor: pointer;
        }
        .admin-week-table .ga-time-entry-text:disabled {
          cursor: default;
        }
        .admin-week-table .ga-time-input {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 4px 6px;
          font-size: 11px;
          color: #0f172a;
          background: #ffffff;
        }
        .admin-week-table .ga-time-delete {
          border: 1px solid #fecaca;
          background: #fff1f2;
          color: #b91c1c;
          width: 20px;
          height: 20px;
          border-radius: 6px;
          font-weight: 700;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .admin-week-table .ga-time-add {
          align-self: flex-start;
          border: 1px dashed #cbd5e1;
          background: #f8fafc;
          color: #475569;
          font-size: 10px;
          font-weight: 600;
          padding: 4px 8px;
          border-radius: 6px;
          cursor: pointer;
        }
        .print-header,
        .print-footer {
          display: none;
        }
        .print-only {
          display: none;
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
            margin: 0;
            padding: 0;
          }
          aside, header, nav {
            display: none !important;
          }
          @page {
            margin: 4mm;
            size: A4 landscape;
          }
          .print-only {
            display: block !important;
          }
          .print-page {
            position: relative;
            padding: 0.12in 0.12in 0.14in 0.12in;
            margin: 0;
            width: 100%;
            max-width: 100%;
            overflow: visible;
            page-break-before: auto;
          }
          .print-section[data-print-section="ga-time"] .print-page {
            display: flex;
            flex-direction: column;
            height: 184mm;
            min-height: 184mm;
            max-height: 184mm;
            overflow: hidden;
            padding: 0.04in 0.02in 0.08in 0.02in;
          }
          .print-section[data-print-section="ga-time"] .print-header {
            margin-bottom: 4px;
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
          .admin-week-table .week-table-view {
            display: block !important;
            page-break-inside: avoid;
            page-break-after: auto;
            padding-top: 0;
            padding-bottom: 0.35in;
            padding-left: 0;
            padding-right: 0;
            margin: 0;
            width: 100%;
            max-width: 100%;
            overflow: visible;
            page-break-before: auto;
          }
          .admin-week-table .week-table {
            page-break-inside: avoid;
            margin-top: 0;
            table-layout: fixed;
            width: 100%;
            font-size: 9px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .admin-week-table .week-table thead {
            display: table-header-group;
          }
          .admin-week-table .week-table th,
          .admin-week-table .week-table td {
            border: 1px solid #111827 !important;
            position: static !important;
            top: auto !important;
            z-index: auto !important;
            padding: 4px 5px;
            white-space: normal;
            overflow-wrap: anywhere;
            word-break: break-word;
          }
          .admin-week-table .week-table thead tr:nth-child(2) th {
            top: auto !important;
          }
          .admin-week-table .week-table-number {
            width: 36px !important;
          }
          .admin-week-table .week-table-label {
            width: 100px !important;
          }
          .admin-week-table .week-table-cell,
          .admin-week-table .week-table-entry span {
            white-space: normal;
          }
          .admin-week-table .week-table-date-header,
          .admin-week-table .week-table-subheader {
            background: #e5e7eb !important;
            color: #111827 !important;
          }
          .admin-week-table .week-table thead th {
            background: #e5e7eb !important;
          }
          .admin-week-table .week-table-entry {
            border: 1px solid #111827 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            page-break-inside: avoid;
            margin-bottom: 3px;
            font-size: 9px;
            padding: 2px 4px;
          }
          .admin-week-table .week-table-entries {
            gap: 2px;
          }
          .admin-week-table .ga-time-table-table {
            table-layout: fixed;
            width: 100%;
            height: 100%;
            font-size: 9px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            border: 1px solid #111827 !important;
          }
          .print-section[data-print-section="ga-time"] .ga-time-table {
            flex: 1;
            display: flex;
            min-height: 0;
            overflow: hidden;
          }
          .print-section[data-print-section="ga-time"] .ga-time-table-table tbody .ga-time-row-primary {
            height: 13.8%;
          }
          .print-section[data-print-section="ga-time"] .ga-time-table-table tbody .ga-time-row-secondary {
            height: 6.2%;
          }
          .print-section[data-print-section="ga-time"] .ga-time-table-table tbody .ga-time-row-secondary > td {
            height: 6.2%;
          }
          .admin-week-table .ga-time-table-table th,
          .admin-week-table .ga-time-table-table td {
            border: 1px solid #111827 !important;
            position: static !important;
            top: auto !important;
            z-index: auto !important;
            padding: 4px 5px;
            white-space: normal;
            overflow-wrap: anywhere;
            word-break: break-word;
          }
          .admin-week-table .ga-time-header {
            background: #e5e7eb !important;
            color: #111827 !important;
          }
          .admin-week-table .ga-time-nr {
            width: 26px !important;
          }
          .admin-week-table .ga-time-header:nth-child(2),
          .admin-week-table .ga-time-slot-label:nth-child(2) {
            width: 78px !important;
          }
          .admin-week-table .ga-time-slot-label {
            background: #f3f4f6 !important;
            text-align: left !important;
            direction: ltr;
            vertical-align: bottom !important;
          }
          .print-section[data-print-section="ga-time"] .ga-time-slot-label,
          .print-section[data-print-section="ga-time"] .ga-time-cell {
            height: inherit;
            vertical-align: bottom;
          }
          .print-section[data-print-section="ga-time"] .ga-time-cell-content {
            min-height: 100%;
            justify-content: flex-end;
          }
          .print-section[data-print-section="ga-time"] .ga-time-table-table tbody {
            height: 100%;
          }
          .admin-week-table .ga-time-entry {
            border: 1px solid #111827 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            page-break-inside: avoid;
            margin-bottom: 3px;
            font-size: 11px;
            padding: 3px 5px;
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
            bottom: 0.08in;
            left: 0.12in;
            right: 0.12in;
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            padding-left: 0;
            padding-right: 0;
            font-size: 10px;
            color: #334155;
          }
          .print-section[data-print-section="ga-time"] .print-footer {
            bottom: 0.04in;
            left: 0.04in;
            right: 0.04in;
          }
          .print-page-count {
            grid-column: 2;
            text-align: center;
          }
          .print-initials {
            grid-column: 3;
            text-align: right;
          }
          [data-print-target]:not([data-print-target=""]) .print-section {
            display: none !important;
          }
          [data-print-target="common"] .print-section[data-print-section="common"],
          [data-print-target="ga-time"] .print-section[data-print-section="ga-time"],
          [data-print-target="all-tasks"] .print-section[data-print-section="all-tasks"] {
            display: block !important;
          }
          .daily-report-table thead {
            display: table-header-group;
          }
          .daily-report-table th,
          .daily-report-table td {
            vertical-align: bottom !important;
            border: 1px solid #0f172a !important;
          }
          .daily-report-table {
            table-layout: fixed;
            border-width: 2px;
            border-color: #0f172a;
            border-collapse: collapse !important;
            border-spacing: 0 !important;
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
          .print-nr-cell {
            font-weight: 700;
          }
        }
      `}</style>
    </div>
  )
}
