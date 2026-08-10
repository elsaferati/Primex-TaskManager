"use client"

import * as React from "react"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarCheck,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Download,
  FileCheck2,
  Loader2,
  LockKeyhole,
  MessageSquare,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  UserCheck,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"
import type {
  Department,
  RealizationAIAnalysis,
  RealizationLevel,
  RealizationPersonResult,
  RealizationQuestion,
  RealizationTaskFact,
  RealizationWeeklyResponse,
} from "@/lib/types"

const LEVEL_STYLE: Record<RealizationLevel, string> = {
  "A+": "border-emerald-600 bg-emerald-600 text-white",
  A: "border-lime-600 bg-lime-600 text-white",
  B: "border-emerald-200 bg-emerald-100 text-emerald-900",
  C: "border-amber-300 bg-amber-200 text-amber-950",
  M: "border-orange-300 bg-orange-200 text-orange-950",
  D: "border-red-300 bg-red-300 text-red-950",
  E: "border-red-700 bg-red-700 text-white",
}

const LEVEL_SYMBOL: Record<RealizationLevel, "+" | "+/-" | "-"> = {
  "A+": "+",
  A: "+",
  B: "+",
  C: "+/-",
  M: "+/-",
  D: "-",
  E: "-",
}

const LEVEL_GUIDE: Array<{ level: RealizationLevel; description: string }> = [
  { level: "A+", description: "Plani i realizuar dhe të paktën 2 angazhime pozitive shtesë të verifikuara." },
  { level: "A", description: "Plani i realizuar dhe të paktën 1 angazhim pozitiv shtesë i verifikuar." },
  { level: "B", description: "Të gjitha obligimet e planit janë përfunduar në kohë." },
  { level: "C", description: "Ka përfundime me vonesë, vonesa të shpeshta ose ndikim negativ të vogël." },
  { level: "M", description: "Mungesë personale e aprovuar dhe obligimet e mbetura janë të mbuluara." },
  { level: "D", description: "Ka obligime të pambyllura, shtyrje pa aprovim ose evidencë negative." },
  { level: "E", description: "Nuk ka progres real ose ka mungesa të papritura mbi pragun e politikës." },
]

const TASK_SOURCE_LABEL: Record<string, string> = {
  system: "Sistem",
  project: "Projekt",
  fast: "Fast task",
}

const TASK_STATUS_LABEL: Record<string, string> = {
  planned: "Planifikuar",
  completed: "Mbyllur",
  completed_on_time: "Mbyllur në kohë",
  completed_late: "Mbyllur me vonesë",
  completed_outside_plan: "Mbyllur këtë javë jashtë planit bazë",
  in_progress: "Në progres",
  no_progress: "Pa progres",
  pending_confirmation: "Në pritje të konfirmimit",
}

function taskIsCompleted(task: RealizationTaskFact) {
  return ["completed", "completed_on_time", "completed_late", "additional_completed"].includes(
    task.classification
  ) || task.status?.toUpperCase() === "DONE"
}

function taskPalette(task: RealizationTaskFact) {
  const isAdditional = task.attribution === "added_after_weekly_plan"
  if (taskIsCompleted(task)) {
    return isAdditional
      ? "border-l-4 border-l-emerald-500 border-y border-r border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-l-4 border-l-emerald-600 border-y border-r border-emerald-200 bg-emerald-50/70 text-emerald-900"
  }
  if (task.classification === "in_progress" || task.status?.toUpperCase() === "IN_PROGRESS") {
    return "border-l-4 border-l-amber-500 border-y border-r border-amber-200 bg-amber-50 text-amber-900"
  }
  if (
    task.classification === "pending_confirmation"
    || task.status?.toUpperCase() === "WAITING_CONFIRMATION"
  ) {
    return "border-l-4 border-l-orange-500 border-y border-r border-orange-200 bg-orange-50 text-orange-900"
  }
  if (isAdditional) return "border-l-4 border-l-blue-500 border-y border-r border-blue-200 bg-blue-50 text-blue-900"
  return "border-l-4 border-l-rose-500 border-y border-r border-rose-200 bg-rose-50 text-rose-900"
}

function DayTaskCard({
  task,
  onComment,
}: {
  task: RealizationTaskFact
  onComment: (task: RealizationTaskFact) => void
}) {
  const additional = task.attribution === "added_after_weekly_plan"
  const completedOutsidePlan = task.attribution === "completed_outside_weekly_plan"
  return (
    <div className={cn("rounded-lg border px-2.5 py-2 text-xs shadow-sm", taskPalette(task))}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 font-semibold leading-4">{cleanTaskTitle(task.title)}</p>
        <div className="flex shrink-0 items-center gap-1">
          {additional ? (
            <span className="rounded-full border border-current/25 bg-white/50 px-1.5 py-0.5 text-[9px] font-bold uppercase">E re</span>
          ) : null}
          {completedOutsidePlan ? (
            <span className="rounded-full border border-current/25 bg-white/50 px-1.5 py-0.5 text-[9px] font-bold uppercase">Jashtë planit</span>
          ) : null}
          {task.task_id ? (
            <button
              type="button"
              aria-label={`Komento detyrën ${cleanTaskTitle(task.title)}`}
              title={task.user_comment ? "Ndrysho komentin" : "Shto koment"}
              onClick={() => onComment(task)}
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-md border border-current/20 bg-white/60 transition hover:bg-white",
                task.user_comment && "ring-1 ring-current/30"
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      {task.user_comment ? (
        <div className="mt-2 flex items-start gap-1.5 rounded-md border border-current/15 bg-white/55 px-2 py-1.5 text-[11px] font-medium leading-4">
          <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
          <p className="min-w-0 whitespace-pre-wrap break-words">{task.user_comment}</p>
        </div>
      ) : null}
    </div>
  )
}

function groupDayTasks(tasks: RealizationTaskFact[]) {
  const project: RealizationTaskFact[] = []
  const fast: RealizationTaskFact[] = []
  const system: RealizationTaskFact[] = []
  for (const task of tasks) {
    if (task.source_type === "system") system.push(task)
    else if (task.source_type === "project" || task.project_title) project.push(task)
    else fast.push(task)
  }
  return [
    { key: "project", label: "Detyra projekti", tasks: project },
    { key: "fast", label: "Fast Tasks · pa projekt", tasks: fast },
    { key: "system", label: "Detyra sistemi", tasks: system },
  ].filter((group) => group.tasks.length)
}

const QUESTION_SECTIONS = [
  {
    title: "1. Detyrat",
    keys: ["task_status", "new_tasks_added", "approved_postponement"],
  },
  {
    title: "2. Angazhimi",
    keys: ["requested_extra_tasks", "helped_colleague", "extra_engagement", "gave_proposal"],
  },
  {
    title: "3. Disiplina dhe përgjegjësia",
    keys: ["respected_meetings", "closed_tasks", "frequent_delays", "unexpected_absences"],
  },
  {
    title: "4. Ndikimi pozitiv / negativ",
    keys: ["week_positive", "week_problems", "affected_other_plan", "repeated_after_clarification"],
  },
] as const

const WEEK_DAYS = ["Hënë", "Martë", "Mërkurë", "Enjte", "Premte"]

function isoLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function mondayOf(value: Date) {
  const date = new Date(value)
  const weekday = date.getDay() || 7
  date.setDate(date.getDate() - weekday + 1)
  return isoLocalDate(date)
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return isoLocalDate(date)
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return value ? "Po" : "Jo"
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (Array.isArray(value)) return value.length ? value.map(displayValue).join("; ") : "—"
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key.replaceAll("_", " ")}: ${displayValue(item)}`)
      .join(" · ")
  }
  return String(value)
}

function weeklyPlanned(person: RealizationPersonResult) {
  return person.facts_json.weekly_planned_count ?? person.planned_count
}

function weeklyCompleted(person: RealizationPersonResult) {
  return (
    person.facts_json.weekly_completed_count
    ?? person.completed_on_time_count + person.completed_late_count
  )
}

function weeklyAdditional(person: RealizationPersonResult) {
  return person.facts_json.weekly_additional_count ?? person.additional_count
}

function weeklyAllCompleted(person: RealizationPersonResult) {
  return person.facts_json.weekly_all_completed_count ?? weeklyCompleted(person)
}

function cleanTaskTitle(value: string) {
  const firstLine = value.replace(/\[\[\/?[a-z_]+\]\]/gi, "").split(/\r?\n/, 1)[0].trim()
  const detailStart = firstLine.search(/\s+\d+[.)]\s+/)
  const title = detailStart > 0 ? firstLine.slice(0, detailStart) : firstLine
  return title.replace(/\s+/g, " ").trim()
}

async function errorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { detail?: string }
    return payload.detail || "Veprimi dështoi"
  } catch {
    return "Veprimi dështoi"
  }
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const safe = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-all",
          safe >= 80 ? "bg-emerald-500" : safe >= 40 ? "bg-amber-500" : "bg-red-500"
        )}
        style={{ width: `${safe}%` }}
      />
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  note: string
}) {
  return (
    <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
      <CardContent className="flex items-start justify-between gap-3 py-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{note}</p>
        </div>
        <Icon className="h-8 w-8 shrink-0 text-slate-400" />
      </CardContent>
    </Card>
  )
}

function QuestionRow({ question }: { question: RealizationQuestion }) {
  const finalValue = question.final_value ?? question.auto_value
  const needsConfirmation = ["AUTO_NEEDS_CONFIRMATION", "MISSING_EVIDENCE"].includes(
    question.source_status
  )
  const visibleValue = needsConfirmation && finalValue == null
    ? "Për konfirmim nga menaxheri"
    : displayValue(finalValue)
  return (
    <div className="grid gap-2 border-b border-slate-100 py-4 last:border-b-0 md:grid-cols-[minmax(220px,0.9fr)_minmax(260px,1.4fr)]">
      <div>
        <p className="text-sm font-medium text-slate-900">{question.label}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge variant={needsConfirmation ? "destructive" : "secondary"} className="text-[10px]">
            {needsConfirmation ? "Kërkon konfirmim" : question.source_status}
          </Badge>
          {question.evidence_ids?.length ? (
            <span className="text-[11px] text-slate-500">
              {question.evidence_ids.length} evidencë/a
            </span>
          ) : null}
        </div>
      </div>
      <div>
        <p className={cn("text-sm leading-6", needsConfirmation && finalValue == null ? "font-medium text-amber-700" : "text-slate-700")}>{visibleValue}</p>
        {question.explanation ? (
          <p className="mt-1 text-xs leading-5 text-slate-500">{question.explanation}</p>
        ) : null}
      </div>
    </div>
  )
}

export default function RealizationPage() {
  const { apiFetch, loading: authLoading, user } = useAuth()
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [departmentId, setDepartmentId] = React.useState("")
  const [weekStart, setWeekStart] = React.useState(() => mondayOf(new Date()))
  const [data, setData] = React.useState<RealizationWeeklyResponse | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [action, setAction] = React.useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = React.useState(false)
  const [evidenceOpen, setEvidenceOpen] = React.useState(false)
  const [taskCommentOpen, setTaskCommentOpen] = React.useState(false)
  const [commentTask, setCommentTask] = React.useState<RealizationTaskFact | null>(null)
  const [taskComment, setTaskComment] = React.useState("")
  const [reviewLevel, setReviewLevel] = React.useState<RealizationLevel>("B")
  const [managerComment, setManagerComment] = React.useState("")
  const [overrideReason, setOverrideReason] = React.useState("")
  const [answerDrafts, setAnswerDrafts] = React.useState<Record<string, string>>({})
  const [evidenceCategory, setEvidenceCategory] = React.useState("QUALITY")
  const [evidenceComment, setEvidenceComment] = React.useState("")
  const [evidenceDate, setEvidenceDate] = React.useState(() => isoLocalDate(new Date()))
  const [absenceClass, setAbsenceClass] = React.useState("UNEXCUSED")
  const [relatedId, setRelatedId] = React.useState("")
  const [impactLevel, setImpactLevel] = React.useState("MINOR")
  const [taskId, setTaskId] = React.useState("")
  const reportRequestRef = React.useRef(0)

  const selected = React.useMemo(
    () => data?.people.find((person) => person.id === selectedId) || data?.people[0] || null,
    [data, selectedId]
  )

  const loadDepartments = React.useCallback(async () => {
    const response = await apiFetch("/departments")
    if (!response.ok) return
    const rows = (await response.json()) as Department[]
    setDepartments(rows)
    // A manager's own department is only the initial default — every
    // manager can switch to and manage any department in Realization.
    const preferred = departmentId || (user?.role === "MANAGER" ? user.department_id : "")
    const next = rows.find((row) => row.id === preferred)?.id || rows[0]?.id || ""
    if (!departmentId) setDepartmentId(next)
  }, [apiFetch, departmentId, user])

  const loadReport = React.useCallback(async () => {
    if (!departmentId) return
    const requestId = ++reportRequestRef.current
    setLoading(true)
    try {
      const params = new URLSearchParams({ department_id: departmentId, week_start: weekStart })
      let response = await apiFetch(`/realization/weekly?${params}`)
      if (!response.ok) throw new Error(await errorMessage(response))
      let payload = (await response.json()) as RealizationWeeklyResponse

      const currentWeek = mondayOf(new Date())
      const canRefreshLive = (
        weekStart === currentWeek
        && payload.has_planned_snapshot
        && !payload.has_final_snapshot
        && ["OPEN", "CALCULATED"].includes(payload.period.status)
      )
      if (canRefreshLive) {
        const todayParams = new URLSearchParams({
          department_id: departmentId,
          day: isoLocalDate(new Date()),
        })
        const liveResponse = await apiFetch(`/realization/daily/calculate?${todayParams}`, {
          method: "POST",
        })
        if (liveResponse.ok) {
          response = await apiFetch(`/realization/weekly?${params}`)
          if (!response.ok) throw new Error(await errorMessage(response))
          payload = (await response.json()) as RealizationWeeklyResponse
        } else {
          toast.warning("Gjendja live nuk u rifreskua", {
            description: await errorMessage(liveResponse),
          })
        }
      }

      if (requestId !== reportRequestRef.current) return
      setData(payload)
      setSelectedId((current) =>
        payload.people.some((person) => person.id === current) ? current : payload.people[0]?.id || null
      )
    } catch (error) {
      if (requestId !== reportRequestRef.current) return
      toast.error("Raporti nuk u ngarkua", { description: error instanceof Error ? error.message : undefined })
      setData(null)
    } finally {
      if (requestId === reportRequestRef.current) setLoading(false)
    }
  }, [apiFetch, departmentId, weekStart])

  React.useEffect(() => {
    // Data loading is asynchronous; state updates happen only after the request resolves.
    if (!authLoading && user && ["ADMIN", "MANAGER"].includes(user.role)) void loadDepartments()
  }, [authLoading, loadDepartments, user])

  React.useEffect(() => {
    // Data loading is asynchronous; state updates happen only after the request resolves.
    if (departmentId) void loadReport()
  }, [departmentId, loadReport])

  React.useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible" && departmentId) void loadReport()
    }
    document.addEventListener("visibilitychange", refreshWhenVisible)
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible)
  }, [departmentId, loadReport])

  const run = React.useCallback(
    async (key: string, path: string, options: RequestInit = {}) => {
      setAction(key)
      try {
        const response = await apiFetch(path, options)
        if (!response.ok) throw new Error(await errorMessage(response))
        toast.success("U përditësua me sukses")
        await loadReport()
        return response
      } catch (error) {
        toast.error("Veprimi dështoi", { description: error instanceof Error ? error.message : undefined })
        return null
      } finally {
        setAction(null)
      }
    },
    [apiFetch, loadReport]
  )

  const calculateWeekly = () => {
    const params = new URLSearchParams({ department_id: departmentId, week_start: weekStart })
    return run("calculate", `/realization/weekly/calculate?${params}`, { method: "POST" })
  }

  const calculateToday = async () => {
    setAction("daily")
    await loadReport()
    setAction(null)
  }

  const downloadExcel = async (allDepartments = false) => {
    setAction(allDepartments ? "export-all" : "export")
    try {
      const params = new URLSearchParams({ week_start: weekStart })
      if (!allDepartments) params.set("department_id", departmentId)
      const response = await apiFetch(`/realization/export.xlsx?${params}`)
      if (!response.ok) throw new Error(await errorMessage(response))
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `REALIZIMI_JAVOR_${weekStart}.xlsx`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 500)
    } catch (error) {
      toast.error("Eksporti dështoi", { description: error instanceof Error ? error.message : undefined })
    } finally {
      setAction(null)
    }
  }

  const openReview = () => {
    if (!selected) return
    setReviewLevel(selected.final_level || selected.suggested_level || "B")
    setManagerComment(selected.manager_comment || "")
    setOverrideReason(selected.override_reason || "")
    setAnswerDrafts(
      Object.fromEntries(
        (selected.facts_json.questions || [])
          .filter((question) => ["AUTO_NEEDS_CONFIRMATION", "MISSING_EVIDENCE"].includes(question.source_status))
          .map((question) => [question.key, question.final_value == null ? "" : displayValue(question.final_value)])
      )
    )
    setReviewOpen(true)
  }

  const saveReview = async () => {
    if (!selected || !data) return
    const changed = reviewLevel !== selected.suggested_level
    if (changed && !overrideReason.trim()) {
      toast.error("Shëno arsyen kur ndryshon vlerësimin automatik")
      return
    }
    const questionValues = Object.fromEntries(
      Object.entries(answerDrafts).filter(([, value]) => value.trim())
    )
    const response = await run(
      "review",
      `/realization/periods/${data.period.id}/results/${selected.id}/review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          final_level: reviewLevel,
          final_symbol: LEVEL_SYMBOL[reviewLevel],
          manager_comment: managerComment || null,
          override_reason: overrideReason || null,
          question_values: questionValues,
        }),
      }
    )
    if (response) setReviewOpen(false)
  }

  const evidenceMarker = React.useMemo(() => {
    if (["QUALITY", "PROPOSAL", "HELPED_COLLEAGUE", "TIME_SAVED", "EXTRA_TASK", "REQUESTED_EXTRA_TASK"].includes(evidenceCategory)) {
      return "POSITIVE"
    }
    if (["REPEATED_PROBLEM", "MISSED_MEETING", "BLOCKER"].includes(evidenceCategory)) return "NEGATIVE"
    if (evidenceCategory === "ABSENCE") return absenceClass === "UNEXCUSED" ? "NEGATIVE" : "NEUTRAL"
    return "NEUTRAL"
  }, [absenceClass, evidenceCategory])

  const addEvidence = async () => {
    if (!selected || !data) return
    const evidenceJson: Record<string, unknown> = {}
    let scopeType = "PERSON"
    let apiCategory = evidenceCategory
    if (evidenceCategory === "ABSENCE") {
      evidenceJson.classification = absenceClass
      evidenceJson.date = evidenceDate
    } else if (evidenceCategory === "REPEATED_PROBLEM") {
      evidenceJson.clarified_before = true
    } else if (evidenceCategory === "MISSED_MEETING") {
      evidenceJson.occurrence_date = evidenceDate
    } else if (evidenceCategory === "BLOCKER") {
      evidenceJson.affected_user_id = relatedId
      evidenceJson.impact_level = impactLevel
    } else if (evidenceCategory === "HELPED_COLLEAGUE") {
      evidenceJson.helped_user_id = relatedId
    } else if (evidenceCategory === "EXTRA_TASK") {
      evidenceJson.kind = "COMPLETED_EXTRA_TASK"
      evidenceJson.replaces_unfinished_planned_task = false
      evidenceJson.duplicate = false
      scopeType = "TASK"
    } else if (evidenceCategory === "REQUESTED_EXTRA_TASK") {
      apiCategory = "EXTRA_TASK"
      evidenceJson.kind = "REQUESTED_EXTRA_TASK"
    }
    if (evidenceCategory === "REPEATED_PROBLEM" && !relatedId.trim()) {
      toast.error("Vendos çelësin e problemit të përsëritur")
      return
    }
    if (["BLOCKER", "HELPED_COLLEAGUE"].includes(evidenceCategory) && !relatedId.trim()) {
      toast.error("Zgjidh personin")
      return
    }
    if (evidenceCategory === "EXTRA_TASK" && !taskId.trim()) {
      toast.error("Zgjidh detyrën shtesë")
      return
    }
    setAction("evidence")
    try {
      const create = await apiFetch("/realization/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period_id: data.period.id,
          scope_type: scopeType,
          task_id: scopeType === "TASK" ? taskId : null,
          user_id: selected.user_id,
          department_id: departmentId,
          marker: evidenceMarker,
          category: apiCategory,
          repeat_key: evidenceCategory === "REPEATED_PROBLEM" ? relatedId : null,
          comment: evidenceComment || null,
          evidence_json: evidenceJson,
          source_type: "manager_manual",
          visibility: "PERSON_AND_MANAGER",
        }),
      })
      if (!create.ok) throw new Error(await errorMessage(create))
      const observation = (await create.json()) as { id: string }
      const verify = await apiFetch(`/realization/observations/${observation.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: "Konfirmuar gjatë rishikimit menaxherial" }),
      })
      if (!verify.ok) throw new Error(await errorMessage(verify))
      toast.success("Evidenca u shtua, u verifikua dhe raporti u rikalkulua")
      setEvidenceOpen(false)
      setEvidenceComment("")
      setRelatedId("")
      setTaskId("")
      await loadReport()
    } catch (error) {
      toast.error("Evidenca nuk u ruajt", { description: error instanceof Error ? error.message : undefined })
    } finally {
      setAction(null)
    }
  }

  const runAI = async () => {
    if (!selected || !data) return
    setAction("ai")
    try {
      const response = await apiFetch(
        `/realization/periods/${data.period.id}/results/${selected.id}/ai-analysis`,
        { method: "POST" }
      )
      if (!response.ok) throw new Error(await errorMessage(response))
      const analysis = (await response.json()) as RealizationAIAnalysis
      setData((current) => current ? {
        ...current,
        people: current.people.map((person) => person.id === selected.id ? {
          ...person,
          facts_json: {
            ...person.facts_json,
            ai_analysis: analysis,
            ai_analysis_history: [...(person.facts_json.ai_analysis_history || []), analysis],
          },
        } : person),
      } : current)
      toast.success("Analiza inteligjente u gjenerua", {
        description: `Sugjerimi ${analysis.suggested_level}, siguria ${Math.round(analysis.confidence * 100)}%`,
      })
      await loadReport()
    } catch (error) {
      toast.error("Analiza nuk u gjenerua", { description: error instanceof Error ? error.message : undefined })
    } finally {
      setAction(null)
    }
  }

  const openTaskComment = (task: RealizationTaskFact) => {
    if (!task.task_id) return
    setCommentTask(task)
    setTaskComment(task.user_comment || "")
    setTaskCommentOpen(true)
  }

  const saveTaskComment = async () => {
    if (!commentTask?.task_id) return
    setAction("task-comment")
    try {
      const response = await apiFetch(`/tasks/${commentTask.task_id}/comment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: taskComment.trim() || null }),
      })
      if (!response.ok) throw new Error(await errorMessage(response))
      const savedTask = (await response.json()) as { user_comment?: string | null }
      const savedComment = savedTask.user_comment ?? (taskComment.trim() || null)
      setData((current) => current ? {
        ...current,
        people: current.people.map((person) => ({
          ...person,
          facts_json: {
            ...person.facts_json,
            tasks: person.facts_json.tasks?.map((task) =>
              task.task_id === commentTask.task_id ? { ...task, user_comment: savedComment } : task
            ),
            daily_timeline: person.facts_json.daily_timeline?.map((day) => ({
              ...day,
              tasks: day.tasks?.map((task) =>
                task.task_id === commentTask.task_id ? { ...task, user_comment: savedComment } : task
              ),
            })),
          },
        })),
      } : current)
      toast.success(savedComment ? "Komenti u ruajt" : "Komenti u largua")
      setTaskCommentOpen(false)
      setCommentTask(null)
      await loadReport()
    } catch (error) {
      toast.error("Komenti nuk u ruajt", {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setAction(null)
    }
  }

  if (authLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  if (!user || !["ADMIN", "MANAGER"].includes(user.role)) {
    return (
      <div className="mx-auto max-w-2xl py-16">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Qasje e kufizuar</CardTitle>
            <CardDescription>Raportin e realizimit mund ta përdorin vetëm adminët dhe menaxherët e departamenteve.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const people = data?.people || []
  const colleagueOptions = people.filter((person) => person.id !== selected?.id)
  const extraTaskOptions = Array.from(
    new Map(
      (selected?.facts_json.tasks || [])
        .filter((task) => task.task_id)
        .map((task) => [task.task_id, task])
    ).values()
  )
  const grade = selected?.final_level || selected?.suggested_level || null
  const selectedQuestions = selected?.facts_json.questions || []
  const aiAnalysis = selected?.facts_json.ai_analysis
  const aiHistory = [...(selected?.facts_json.ai_analysis_history || [])].reverse()
  const selectedWeeklyPlanned = selected ? weeklyPlanned(selected) : 0
  const selectedWeeklyCompleted = selected ? weeklyCompleted(selected) : 0
  const selectedWeeklyAllCompleted = selected ? weeklyAllCompleted(selected) : 0
  const selectedWeeklyAdditional = selected ? weeklyAdditional(selected) : 0
  const isLive = data ? !data.has_final_snapshot : true
  const selectedTimeline = WEEK_DAYS.map((label, index) => {
    const date = addDays(weekStart, index)
    const snapshot = selected?.facts_json.daily_timeline?.find((item) => item.date === date)
    const tasks = snapshot?.tasks || []
    const plannedTasks = tasks.filter((task) => task.attribution === "planned_today")
    const additionalTasks = tasks.filter((task) => task.attribution === "added_after_weekly_plan")
    const systemTasks = tasks.filter((task) => task.attribution === "system_schedule")
    const completionOnlyTasks = tasks.filter((task) =>
      ["completed_from_weekly_plan", "completed_outside_weekly_plan"].includes(task.attribution || "")
    )
    const completedTasks = tasks.filter(taskIsCompleted)
    const groups = groupDayTasks([...plannedTasks, ...additionalTasks, ...systemTasks, ...completionOnlyTasks])
    return {
      label,
      date,
      snapshot,
      plannedTasks,
      additionalTasks,
      systemTasks,
      completionOnlyTasks,
      completedTasks,
      remainingTasks: plannedTasks.filter((task) => !taskIsCompleted(task)),
      groups,
    }
  })

  return (
    <div className="mx-auto w-full max-w-[1720px] space-y-6 pb-12">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Realizimi javor</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-500">
            Barazimi i planit të javës me atë çka u realizua faktikisht, ditë pas dite, për çdo person.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {data ? (
            <Badge variant="outline" className="border-slate-300 text-slate-600">
              Statusi: {data.period.status}
            </Badge>
          ) : null}
          {isLive ? (
            <Badge variant="outline" className="border-slate-300 text-slate-600">
              <Clock3 className="mr-1 h-3 w-3" /> Snapshot ditor, ora 16:20
            </Badge>
          ) : (
            <Badge variant="secondary">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Raport final
            </Badge>
          )}
        </div>
      </div>

      <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardContent className="flex flex-col gap-3 py-4 xl:flex-row xl:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Departamenti</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Zgjidh departamentin" /></SelectTrigger>
                <SelectContent>
                  {departments.map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Java (zgjedhja normalizohet në të hënë)</Label>
              <Input type="date" value={weekStart} onChange={(event) => setWeekStart(mondayOf(new Date(`${event.target.value}T12:00:00`)))} />
            </div>
            <div className="space-y-1.5">
              <Label>Personi</Label>
              <Select value={selected?.id || ""} onValueChange={setSelectedId} disabled={loading || !people.length}>
                <SelectTrigger className="w-full"><SelectValue placeholder={loading ? "Duke ngarkuar…" : "Zgjidh personin"} /></SelectTrigger>
                <SelectContent>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.user_name} · {weeklyAllCompleted(person)} kryer · {weeklyCompleted(person)}/{weeklyPlanned(person)} plan
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void loadReport()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Rifresko
            </Button>
            <Button variant="outline" onClick={() => void calculateToday()} disabled={!!action}>
              {action === "daily" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />} Përditëso tani
            </Button>
            <Button onClick={() => void calculateWeekly()} disabled={!data?.can_calculate || !!action}>
              {action === "calculate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />} {data?.has_final_snapshot ? "Rikalkulo javën" : "Finalizo dhe vlerëso"}
            </Button>
            <Button variant="outline" onClick={() => void downloadExcel()} disabled={!people.length || !!action}>
              {action === "export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Excel
            </Button>
            {["ADMIN", "MANAGER"].includes(user.role) ? (
              <Button variant="outline" onClick={() => void downloadExcel(true)} disabled={!!action}>
                {action === "export-all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Excel gjithë
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {data?.message ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {data.message}
        </div>
      ) : null}

      <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3 text-xs">
          <span className="font-semibold text-slate-500">Ngjyrat e Weekly Planner-it:</span>
          {[
            ["bg-rose-50 border-rose-500", "Pa filluar"],
            ["bg-amber-50 border-amber-500", "Në progres"],
            ["bg-orange-50 border-orange-500", "Në konfirmim"],
            ["bg-emerald-50 border-emerald-500", "Përfunduar"],
            ["bg-blue-50 border-blue-500", "Shtuar gjatë javës"],
          ].map(([color, label]) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-slate-600"><span className={cn("h-3 w-3 rounded-sm border-l-2", color)} />{label}</span>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Target} label="Realizimi i personit" value={`${selected?.facts_json.weekly_progress_percent || 0}%`} note={selected?.user_name || "Zgjidh personin"} />
        <MetricCard icon={CalendarCheck} label="Në planin javor" value={selectedWeeklyPlanned} note="Plani bazë i ruajtur në PLANNED" />
        <MetricCard icon={UserCheck} label="Të përfunduara këtë javë" value={selectedWeeklyAllCompleted} note={`${selectedWeeklyCompleted} nga plani bazë · ${Math.max(0, selectedWeeklyAllCompleted - selectedWeeklyCompleted)} jashtë planit`} />
        <MetricCard icon={Sparkles} label="Shtuar gjatë javës" value={selectedWeeklyAdditional} note="Raportohen veç nga plani bazë" />
      </div>

      <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900">
          Kriteret e vlerësimit automatik A+–E
        </summary>
        <div className="grid gap-2 border-t border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-4">
          {LEVEL_GUIDE.map((item) => (
            <div key={item.level} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
              <Badge className={cn("min-w-10 justify-center border", LEVEL_STYLE[item.level])}>
                {item.level}
              </Badge>
              <p className="text-xs leading-5 text-slate-500">{item.description}</p>
            </div>
          ))}
        </div>
        <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          Rregullat zbatohen automatikisht sipas rendit E → D → M → C → A+ → A → B; evidenca më kufizuese ka përparësi.
        </p>
      </details>

      <div className="min-h-[680px]">
        <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
          {selected ? (
            <>
              <CardHeader className="border-b border-slate-200 bg-slate-50">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-2xl text-slate-900">{selected.user_name}</CardTitle>
                      {grade ? <Badge className={cn("border px-3 py-1 text-sm", LEVEL_STYLE[grade])}>{grade} · {selected.final_symbol || selected.suggested_symbol}</Badge> : null}
                      {selected.reviewed_at ? <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3 w-3" /> Rishikuar</Badge> : null}
                    </div>
                    <CardDescription className="mt-2 max-w-3xl text-slate-500">{selected.auto_narrative || "Rezultati do të argumentohet nga taskat, prezenca dhe evidenca e verifikuar."}</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEvidenceOpen(true)} disabled={data?.period.status === "LOCKED"}><Plus className="h-4 w-4" /> Evidencë</Button>
                    <Button size="sm" variant="outline" onClick={() => void runAI()} disabled={!!action || !data || data.period.status === "LOCKED"}>{action === "ai" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />} Gjenero analizën</Button>
                    <Button size="sm" onClick={openReview} disabled={data?.period.status !== "CALCULATED"}><FileCheck2 className="h-4 w-4" /> Rishiko</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-7 py-6">
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Barazimi javor</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold text-slate-900">{selectedWeeklyPlanned} të planifikuara</span>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                        <span className="font-semibold text-emerald-700">{selectedWeeklyCompleted} të përfunduara</span>
                        <span className="text-slate-400">·</span>
                        <span className="font-semibold text-rose-700">{Math.max(0, selectedWeeklyPlanned - selectedWeeklyCompleted)} të mbetura</span>
                        <span className="text-slate-400">·</span>
                        <span className="font-semibold text-blue-700">+{selectedWeeklyAdditional} shtesë</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">Detyrat shtesë paraqiten veçmas; nuk e rrisin artificialisht përqindjen e planit bazë.</p>
                    </div>
                    <div className="min-w-52 rounded-xl border border-slate-200 bg-white px-4 py-3">
                      <div className="flex items-end justify-between"><span className="text-xs text-slate-500">Realizimi i planit</span><span className="text-2xl font-semibold text-slate-900">{selected.facts_json.weekly_progress_percent || 0}%</span></div>
                      <ProgressBar value={selected.facts_json.weekly_progress_percent || 0} className="mt-2 h-2.5" />
                    </div>
                  </div>
                </section>

                <section>
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Planifikuar kundrejt realizuar, ditë pas dite</h2>
                      <p className="mt-1 text-xs text-slate-500">Secila kolonë ruan planin e asaj dite dhe gjendjen në snapshot-in e orës 16:20.</p>
                    </div>
                    {isLive ? <Badge variant="outline"><Clock3 className="mr-1 h-3 w-3" /> Raport operativ</Badge> : <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3 w-3" /> Raport final</Badge>}
                  </div>
                  <div className="grid gap-3 xl:grid-cols-5">
                    {selectedTimeline.map((day) => (
                      <div key={day.date} className="flex min-h-64 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div><p className="font-semibold text-slate-900">{day.label}</p><p className="text-[11px] text-slate-500">{day.date.split("-").reverse().join(".")}</p></div>
                            {day.snapshot?.has_snapshot ? (
                              <Badge variant="secondary" className="text-[10px]">{day.snapshot.daily_progress_percent}%</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">Në pritje</Badge>
                            )}
                          </div>
                          <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px]">
                            <div className="rounded bg-white px-1 py-1 text-slate-600"><strong className="block text-sm text-slate-900">{day.plannedTasks.length}</strong>Plan</div>
                            <div className="rounded bg-emerald-50 px-1 py-1 text-emerald-800"><strong className="block text-sm">{day.completedTasks.length}</strong>Kryer</div>
                            <div className="rounded bg-blue-50 px-1 py-1 text-blue-800"><strong className="block text-sm">{day.additionalTasks.length}</strong>Shtesë</div>
                            <div className="rounded bg-violet-50 px-1 py-1 text-violet-800"><strong className="block text-sm">{day.systemTasks.length}</strong>Sistem</div>
                          </div>
                        </div>
                        <div className="flex-1 space-y-2 p-2.5">
                          {day.groups.map((group) => (
                            <div key={`${day.date}-${group.key}`} className="space-y-1.5">
                              <div className="flex items-center gap-2 px-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                <span>{group.label}</span><span className="h-px flex-1 bg-slate-200" /><span>{group.tasks.length}</span>
                              </div>
                              {group.tasks.map((task) => (
                                <DayTaskCard
                                  key={`${group.key}-${day.date}-${task.match_key}`}
                                  task={task}
                                  onComment={openTaskComment}
                                />
                              ))}
                            </div>
                          ))}
                          {!day.plannedTasks.length && !day.additionalTasks.length && !day.systemTasks.length && !day.completionOnlyTasks.length ? (
                            <div className="flex min-h-24 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-500">
                              <CircleDashed className="mb-2 h-5 w-5" />Nuk ka detyra për këtë ditë
                            </div>
                          ) : null}
                        </div>
                        <div className={cn("border-t px-3 py-2 text-[11px]", day.remainingTasks.length ? "border-rose-100 bg-rose-50 text-rose-800" : "border-emerald-100 bg-emerald-50 text-emerald-800")}>
                          {day.remainingTasks.length ? `${day.remainingTasks.length} nga plani mbetën pa u përfunduar` : day.plannedTasks.length ? "Plani i ditës është përfunduar" : "Pa obligime të planifikuara"}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {selected.facts_json.project_progress?.length ? (
                  <section><h2 className="mb-3 font-semibold text-slate-900">Projektet MST / TT</h2><div className="grid gap-3 md:grid-cols-2">{selected.facts_json.project_progress.map((project) => <div key={project.project_id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex justify-between gap-3"><div><p className="font-medium text-slate-900">{project.project_title}</p><p className="text-xs text-slate-500">{project.task_count} detyra · mesatare e progresit real</p></div><span className="font-semibold text-slate-900">{project.progress_percent}%</span></div><ProgressBar value={project.progress_percent} className="mt-3" /></div>)}</div></section>
                ) : null}

                {aiAnalysis ? (
                  <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-4xl">
                        <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Bot className="h-4 w-4 text-indigo-600" /> Analiza inteligjente — vetëm këshilluese</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{aiAnalysis.summary}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2"><Badge variant="outline">Sugjerimi {aiAnalysis.suggested_level}</Badge><Badge variant="secondary">Siguria {Math.round(aiAnalysis.confidence * 100)}%</Badge></div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Pozitive</p><ul className="mt-2 space-y-1 text-xs text-emerald-950">{aiAnalysis.positives.length ? aiAnalysis.positives.map((item) => <li key={item}>• {item}</li>) : <li>• Nuk ka evidencë pozitive të verifikuar.</li>}</ul></div>
                      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-rose-800">Për vëmendje</p><ul className="mt-2 space-y-1 text-xs text-rose-950">{aiAnalysis.problems.length ? aiAnalysis.problems.map((item) => <li key={item}>• {item}</li>) : <li>• Nuk ka problem të provuar.</li>}</ul></div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Duhet konfirmuar</p><ul className="mt-2 space-y-1 text-xs text-amber-950">{aiAnalysis.missing_evidence.length ? aiAnalysis.missing_evidence.map((item) => <li key={item}>• {item}</li>) : <li>• Evidenca është e plotë.</li>}</ul></div>
                    </div>
                    <p className="mt-3 text-[10px] text-slate-500">Burimi: {aiAnalysis.model}. Analiza përdor vetëm detyrat, snapshot-et dhe evidencat e verifikuara; vendimi final mbetet njerëzor.</p>
                  </section>
                ) : null}

                {aiHistory.length > 1 ? (
                  <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <summary className="cursor-pointer list-none bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                      Historiku i analizave AI ({aiHistory.length})
                    </summary>
                    <div className="divide-y divide-slate-100 px-4">
                      {aiHistory.map((entry, index) => (
                        <div key={`${entry.generated_at}-${index}`} className="py-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="font-medium text-slate-700">
                              {entry.generated_at ? new Date(entry.generated_at).toLocaleString() : "—"}
                            </span>
                            <Badge variant="outline" className="text-[10px]">Sugjerimi {entry.suggested_level}</Badge>
                            <Badge variant="secondary" className="text-[10px]">Siguria {Math.round(entry.confidence * 100)}%</Badge>
                          </div>
                          <p className="mt-1.5 text-sm leading-6 text-slate-700">{entry.summary}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}

                <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                    <span>Detajet e vlerësimit dhe argumentimit</span>
                    <Badge variant="outline">{selectedQuestions.length} pika</Badge>
                  </summary>
                  <div className="p-4">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h2 className="font-semibold text-slate-900">Pyetjet dhe argumentimi</h2>
                      <p className="mt-1 text-xs text-slate-500">Të 15 pyetjet e barazimit: automatike kur ka prova; për konfirmim kur kërkohet gjykim njerëzor.</p>
                    </div>
                    <Badge variant="outline">
                      {selectedQuestions.filter((question) => !["AUTO_NEEDS_CONFIRMATION", "MISSING_EVIDENCE"].includes(question.source_status)).length} automatike · {selectedQuestions.filter((question) => ["AUTO_NEEDS_CONFIRMATION", "MISSING_EVIDENCE"].includes(question.source_status)).length} për konfirmim
                    </Badge>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {QUESTION_SECTIONS.map((section) => {
                      const questions = section.keys
                        .map((key) => selectedQuestions.find((question) => question.key === key))
                        .filter((question): question is RealizationQuestion => Boolean(question))
                      return (
                        <div key={section.title} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <div className="border-b border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">{section.title}</div>
                          <div className="px-4">
                            {questions.map((question) => <QuestionRow key={question.key} question={question} />)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  </div>
                </details>

                <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><summary className="cursor-pointer list-none bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">Evidenca teknike e detyrave ({selected.facts_json.tasks?.length || 0})</summary><div className="max-h-72 overflow-y-auto border-t border-slate-200"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50"><tr><th className="px-3 py-2 font-medium text-slate-700">Detyra</th><th className="px-3 py-2 font-medium text-slate-700">Burimi</th><th className="px-3 py-2 font-medium text-slate-700">Statusi</th></tr></thead><tbody>{(selected.facts_json.tasks || []).map((task) => <tr key={`${task.match_key}-${task.attribution}`} className="border-t border-slate-200"><td className="px-3 py-2"><p className="font-medium text-slate-900">{cleanTaskTitle(task.title)}</p><p className="text-[11px] text-slate-500">{task.task_id || task.match_key}</p></td><td className="px-3 py-2 text-slate-700">{TASK_SOURCE_LABEL[task.source_type] || task.source_type}</td><td className="px-3 py-2"><Badge variant="outline">{TASK_STATUS_LABEL[task.classification] || task.classification}</Badge></td></tr>)}</tbody></table></div></details>

                {user.role === "ADMIN" && data ? <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-5">{data.period.status === "REVIEWED" ? <Button variant="outline" onClick={() => void run("approve", `/realization/periods/${data.period.id}/approve`, { method: "POST" })} disabled={!!action}><ShieldCheck className="h-4 w-4" /> Aprovo raportin</Button> : null}{data.period.status === "APPROVED" ? <Button variant="destructive" onClick={() => void run("lock", `/realization/periods/${data.period.id}/lock`, { method: "POST" })} disabled={!!action}><LockKeyhole className="h-4 w-4" /> Blloko përfundimisht</Button> : null}</div> : null}
              </CardContent>
            </>
          ) : <div className="flex min-h-[500px] items-center justify-center text-sm text-slate-500">Zgjidh një person nga ekipi.</div>}
        </Card>
      </div>

      <Dialog open={taskCommentOpen} onOpenChange={setTaskCommentOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Komento detyrën</DialogTitle>
            <DialogDescription>{commentTask ? cleanTaskTitle(commentTask.title) : "Komenti lidhet me detyrën e zgjedhur."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="realization-task-comment">Komenti</Label>
            <Textarea
              id="realization-task-comment"
              value={taskComment}
              onChange={(event) => setTaskComment(event.target.value)}
              rows={5}
              placeholder="Shëno sqarimin, pengesën, rezultatin ose çfarë duhet ndjekur…"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Komenti ruhet te detyra reale dhe shfaqet sa herë që ajo paraqitet në raport.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskCommentOpen(false)}>Anulo</Button>
            <Button onClick={() => void saveTaskComment()} disabled={action === "task-comment"}>
              {action === "task-comment" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />} Ruaj komentin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Rishikimi menaxherial — {selected?.user_name}</DialogTitle><DialogDescription>Konfirmo përgjigjet që nuk mund të provohen automatikisht. Çdo ndryshim nga sugjerimi kërkon arsye.</DialogDescription></DialogHeader>
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label>Vlerësimi final</Label><Select value={reviewLevel} onValueChange={(value) => setReviewLevel(value as RealizationLevel)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{(["A+", "A", "B", "C", "M", "D", "E"] as RealizationLevel[]).map((level) => <SelectItem key={level} value={level}>{level} · {LEVEL_SYMBOL[level]}</SelectItem>)}</SelectContent></Select></div><div className="rounded-lg border bg-muted/30 p-3 text-sm"><p className="text-xs text-muted-foreground">Sugjerimi automatik</p><p className="mt-1 font-semibold">{selected?.suggested_level || "—"} · {selected?.suggested_symbol || "—"}</p></div></div>
            {selectedQuestions.filter((question) => ["AUTO_NEEDS_CONFIRMATION", "MISSING_EVIDENCE"].includes(question.source_status)).map((question) => <div key={question.key} className="space-y-1.5"><Label>{question.label}</Label><Input value={answerDrafts[question.key] || ""} onChange={(event) => setAnswerDrafts((current) => ({ ...current, [question.key]: event.target.value }))} placeholder="Përgjigjja e menaxherit" /><p className="text-xs text-muted-foreground">{question.explanation}</p></div>)}
            <div className="space-y-1.5"><Label>Komenti i menaxherit</Label><Textarea value={managerComment} onChange={(event) => setManagerComment(event.target.value)} rows={3} placeholder="Përmbledhje e shkurtër dhe faktike..." /></div>
            <div className="space-y-1.5"><Label>Arsyeja e ndryshimit {reviewLevel !== selected?.suggested_level ? "(e detyrueshme)" : "(opsionale)"}</Label><Textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} rows={2} placeholder="Cila evidencë justifikon ndryshimin?" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setReviewOpen(false)}>Anulo</Button><Button onClick={() => void saveReview()} disabled={action === "review"}>{action === "review" && <Loader2 className="h-4 w-4 animate-spin" />} Ruaj rishikimin</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Shto evidencë të verifikueshme</DialogTitle><DialogDescription>Evidenca verifikohet menjëherë nga llogaria menaxheriale dhe rikalkulon automatikisht raportin.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Kategoria</Label><Select value={evidenceCategory} onValueChange={setEvidenceCategory}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{[["QUALITY", "Cilësi / angazhim ekstra"], ["PROPOSAL", "Propozim"], ["REQUESTED_EXTRA_TASK", "Kërkoi detyra shtesë"], ["HELPED_COLLEAGUE", "Ndihmoi koleg"], ["EXTRA_TASK", "Detyrë shtesë e përfunduar"], ["REPEATED_PROBLEM", "Problem i përsëritur"], ["BLOCKER", "I prishi planin kolegut"], ["MISSED_MEETING", "Takim i humbur"], ["ABSENCE", "Mungesë / pushim"]].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            {evidenceCategory === "ABSENCE" ? <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Klasifikimi</Label><Select value={absenceClass} onValueChange={setAbsenceClass}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="UNEXCUSED">E papritur / pa aprovim</SelectItem><SelectItem value="APPROVED_PERSONAL">Personale e aprovuar</SelectItem><SelectItem value="ANNUAL_LEAVE">Pushim vjetor</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label>Data</Label><Input type="date" value={evidenceDate} onChange={(event) => setEvidenceDate(event.target.value)} /></div></div> : null}
            {evidenceCategory === "MISSED_MEETING" ? <div className="space-y-1.5"><Label>Data e takimit</Label><Input type="date" value={evidenceDate} onChange={(event) => setEvidenceDate(event.target.value)} /><p className="text-xs text-muted-foreground">Përshkruaj takimin te komenti më poshtë — nuk kërkohet ID.</p></div> : null}
            {evidenceCategory === "BLOCKER" ? <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Kolegu i prekur</Label><Select value={relatedId} onValueChange={setRelatedId}><SelectTrigger className="w-full"><SelectValue placeholder="Zgjidh personin" /></SelectTrigger><SelectContent>{colleagueOptions.map((person) => <SelectItem key={person.id} value={person.user_id}>{person.user_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>Ndikimi</Label><Select value={impactLevel} onValueChange={setImpactLevel}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MINOR">I vogël</SelectItem><SelectItem value="MAJOR">I madh</SelectItem><SelectItem value="MULTIPLE_PEOPLE">Disa persona</SelectItem></SelectContent></Select></div></div> : null}
            {evidenceCategory === "HELPED_COLLEAGUE" ? <div className="space-y-1.5"><Label>Kolegu i ndihmuar</Label><Select value={relatedId} onValueChange={setRelatedId}><SelectTrigger className="w-full"><SelectValue placeholder="Zgjidh personin" /></SelectTrigger><SelectContent>{colleagueOptions.map((person) => <SelectItem key={person.id} value={person.user_id}>{person.user_name}</SelectItem>)}</SelectContent></Select></div> : null}
            {evidenceCategory === "REPEATED_PROBLEM" ? <div className="space-y-1.5"><Label>Çelësi i problemit të përsëritur</Label><Input value={relatedId} onChange={(event) => setRelatedId(event.target.value)} placeholder="p.sh. kontrolli-final-produktit" /><p className="text-xs text-muted-foreground">Përdor të njëjtin çelës çdo herë që ky problem përsëritet, që të lidhen automatikisht rastet e njëpasnjëshme.</p></div> : null}
            {evidenceCategory === "EXTRA_TASK" ? <div className="space-y-1.5"><Label>Detyra shtesë</Label><Select value={taskId} onValueChange={setTaskId}><SelectTrigger className="w-full"><SelectValue placeholder="Zgjidh detyrën" /></SelectTrigger><SelectContent>{extraTaskOptions.map((task) => <SelectItem key={task.task_id} value={task.task_id as string}>{cleanTaskTitle(task.title)}</SelectItem>)}</SelectContent></Select></div> : null}
            <div className="space-y-1.5"><Label>Argumenti / komenti</Label><Textarea value={evidenceComment} onChange={(event) => setEvidenceComment(event.target.value)} rows={4} placeholder="Përshkruaj çfarë ndodhi dhe si mund të verifikohet..." /></div>
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Marker automatik: <strong>{evidenceMarker}</strong>. Nota ndryshon vetëm sipas rregullave dhe evidencës së verifikuar.</div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEvidenceOpen(false)}>Anulo</Button><Button onClick={() => void addEvidence()} disabled={action === "evidence"}>{action === "evidence" && <Loader2 className="h-4 w-4 animate-spin" />} Ruaj & rikalkulo</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
