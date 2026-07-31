"use client"

import * as React from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Clock3,
  ExternalLink,
  FileClock,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import type {
  Department,
  RealizationLevel,
  RealizationPersonResult,
  RealizationQuestion,
  RealizationSymbol,
  RealizationTaskFact,
  RealizationWeeklyResponse,
} from "@/lib/types"
import { cn } from "@/lib/utils"

const WORKFLOW = ["OPEN", "CALCULATED", "REVIEWED", "APPROVED", "LOCKED"] as const

const CLASSIFICATION_LABELS: Record<string, string> = {
  completed_on_time: "Përfunduar në kohë",
  completed_late: "Përfunduar me vonesë",
  in_progress: "Në progres",
  pending_confirmation: "Në pritje të konfirmimit",
  no_progress: "Pa progres",
  late_open: "E hapur me vonesë",
  needs_review: "Kërkon shqyrtim",
  removed_or_canceled_approved: "Hequr / anuluar me aprovim",
  removed_or_canceled_unapproved: "Hequr / anuluar pa aprovim",
  additional_completed: "Shtesë e përfunduar",
  additional_in_progress: "Shtesë në progres",
  additional_pending: "Shtesë në pritje",
  additional_no_progress: "Shtesë pa progres",
}

const QUESTION_SECTIONS = [
  { title: "1. Detyrat", keys: ["task_status", "new_tasks_added", "approved_postponement"] },
  {
    title: "2. Angazhimi",
    keys: ["requested_extra_tasks", "helped_colleague", "extra_engagement", "gave_proposal"],
  },
  {
    title: "3. Disiplina",
    keys: ["respected_meetings", "closed_tasks", "frequent_delays", "unexpected_absences"],
  },
  {
    title: "4. Vështrim shtesë i javës",
    keys: ["week_positive", "week_problems", "affected_other_plan", "repeated_after_clarification"],
  },
  {
    title: "5. Vlerësimi",
    keys: [
      "current_level",
      "suggested_evaluation_level",
      "weekly_bonus",
      "evaluation",
      "comments",
    ],
  },
]

function dateValue(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function currentWeekStart() {
  const today = new Date()
  const day = today.getDay()
  today.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  return dateValue(today)
}

function formatWeek(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("sq-AL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
  return `${formatter.format(new Date(`${start}T12:00:00`))} – ${formatter.format(
    new Date(`${end}T12:00:00`)
  )}`
}

function errorDetail(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail?: unknown }).detail
    if (typeof detail === "string") return detail
  }
  return fallback
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return value ? "Po" : "Jo"
  if (Array.isArray(value)) return value.length ? value.map(displayValue).join(", ") : "—"
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key.replaceAll("_", " ")}: ${displayValue(item)}`)
      .join(" · ")
  }
  return String(value)
}

function statusTone(status: string) {
  if (status === "MISSING_EVIDENCE") return "border-amber-200 bg-amber-50 text-amber-800"
  if (status === "AUTO_NEEDS_CONFIRMATION") return "border-orange-200 bg-orange-50 text-orange-800"
  if (status === "MANAGER_CONFIRMED") return "border-emerald-200 bg-emerald-50 text-emerald-800"
  return "border-slate-200 bg-slate-50 text-slate-700"
}

function classificationTone(classification: string) {
  if (classification.includes("completed")) return "border-emerald-200 bg-emerald-50 text-emerald-800"
  if (classification.includes("additional")) return "border-cyan-200 bg-cyan-50 text-cyan-800"
  if (classification.includes("late") || classification.includes("no_progress"))
    return "border-rose-200 bg-rose-50 text-rose-800"
  if (classification.includes("review")) return "border-amber-200 bg-amber-50 text-amber-800"
  return "border-slate-200 bg-slate-50 text-slate-700"
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: number | string
  detail: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="rounded-2xl border bg-slate-50 p-3 text-slate-700">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function WorkflowStrip({ status }: { status: string }) {
  const current = WORKFLOW.indexOf(status as (typeof WORKFLOW)[number])
  return (
    <div className="grid gap-2 sm:grid-cols-5">
      {WORKFLOW.map((step, index) => (
        <div
          key={step}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold",
            index <= current
              ? "border-cyan-300 bg-cyan-50 text-cyan-900"
              : "border-slate-200 bg-white text-slate-400"
          )}
        >
          {index < current ? <Check className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
          {step}
        </div>
      ))}
    </div>
  )
}

function TaskEvidence({ task }: { task: RealizationTaskFact }) {
  const plannedSlots = (task.planned_occurrences || [])
    .map((item) => [item.day, item.time_slot].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ")
  const progressDays = (task.daily_progress || [])
    .map(
      (item) =>
        `${item.day} ${item.finish_period || "—"}: +${item.completed_delta} (${item.daily_status})`
    )
    .join(", ")
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{task.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {task.project_title || task.source_type}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {task.effective_deadline ? <span>Afati: {task.effective_deadline}</span> : null}
          {plannedSlots ? <span>Plan: {plannedSlots}</span> : null}
          {progressDays ? <span>Progres: {progressDays}</span> : null}
          {task.postponement ? <span>Shtyrje: {task.postponement}</span> : null}
          {task.reassignment ? <span>Ka ndryshim të assignee-ve</span> : null}
          {task.attribution === "actual_worker" ? <span>Kredit pune faktike</span> : null}
        </div>
      </div>
      <Badge variant="outline" className={cn("shrink-0", classificationTone(task.classification))}>
        {CLASSIFICATION_LABELS[task.classification] || task.classification}
      </Badge>
      {task.task_id ? <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
    </>
  )
  return task.task_id ? (
    <Link
      href={`/tasks/${task.task_id}`}
      className="flex items-center gap-3 rounded-lg border bg-background p-3 hover:bg-muted/50"
    >
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-3 rounded-lg border bg-background p-3">{body}</div>
  )
}

function QuestionRow({
  question,
  canReview,
  managerValue,
  onManagerValueChange,
}: {
  question: RealizationQuestion
  canReview: boolean
  managerValue?: unknown
  onManagerValueChange: (value: unknown) => void
}) {
  const value = managerValue ?? question.final_value ?? question.auto_value
  const needsConfirmation =
    question.source_status === "MISSING_EVIDENCE" ||
    question.source_status === "AUTO_NEEDS_CONFIRMATION"
  return (
    <div className="grid gap-3 border-b py-3 last:border-b-0 md:grid-cols-[minmax(220px,0.8fr)_1.4fr_auto]">
      <div>
        <p className="text-sm font-medium">{question.label}</p>
        {question.explanation ? (
          <p className="mt-1 text-xs text-muted-foreground">{question.explanation}</p>
        ) : null}
        {question.evidence_ids.length ? (
          <p className="mt-1 break-all text-[11px] text-muted-foreground">
            Evidencë: {question.evidence_ids.join(", ")}
          </p>
        ) : null}
      </div>
      <p className="text-sm leading-6">{displayValue(value)}</p>
      <div className="space-y-2">
        <Badge variant="outline" className={cn("h-fit w-fit", statusTone(question.source_status))}>
          {managerValue !== undefined ? "MANAGER_CONFIRMED" : question.source_status}
        </Badge>
        {canReview && needsConfirmation ? (
          question.answer_type === "boolean" ? (
            <Select
              value={
                managerValue === true ? "true" : managerValue === false ? "false" : "__unset__"
              }
              onValueChange={(next) =>
                onManagerValueChange(next === "__unset__" ? undefined : next === "true")
              }
            >
              <SelectTrigger className="h-8 min-w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__unset__">Pa konfirmim</SelectItem>
                <SelectItem value="true">Po</SelectItem>
                <SelectItem value="false">Jo</SelectItem>
              </SelectContent>
            </Select>
          ) : question.answer_type === "integer" ? (
            <Input
              className="h-8 w-32"
              type="number"
              min={0}
              placeholder="Konfirmo"
              value={typeof managerValue === "number" ? managerValue : ""}
              onChange={(event) =>
                onManagerValueChange(
                  event.target.value === "" ? undefined : Number(event.target.value)
                )
              }
            />
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onManagerValueChange(question.auto_value)}
            >
              Konfirmo vlerën
            </Button>
          )
        ) : null}
      </div>
    </div>
  )
}

function PersonDetail({
  person,
  canReview,
  canVerify,
  canMutateObservations,
  onReload,
  apiFetch,
  people,
}: {
  person: RealizationPersonResult
  canReview: boolean
  canVerify: boolean
  canMutateObservations: boolean
  onReload: () => Promise<void>
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
  people: RealizationPersonResult[]
}) {
  const [level, setLevel] = React.useState<RealizationLevel>(person.suggested_level || "B")
  const [symbol, setSymbol] = React.useState<RealizationSymbol>(person.suggested_symbol || "+")
  const [bonus, setBonus] = React.useState(String(person.suggested_bonus ?? 0))
  const [managerComment, setManagerComment] = React.useState(person.manager_comment || "")
  const [overrideReason, setOverrideReason] = React.useState(person.override_reason || "")
  const [saving, setSaving] = React.useState(false)
  const [observationCategory, setObservationCategory] = React.useState("EXTRA_TASK")
  const [observationMarker, setObservationMarker] = React.useState("POSITIVE")
  const [observationComment, setObservationComment] = React.useState("")
  const [observationKind, setObservationKind] = React.useState("")
  const [observationTaskId, setObservationTaskId] = React.useState("")
  const [relatedUserId, setRelatedUserId] = React.useState("")
  const [impactLevel, setImpactLevel] = React.useState("")
  const [impactMinutes, setImpactMinutes] = React.useState("")
  const [repeatKey, setRepeatKey] = React.useState("")
  const [highImpact, setHighImpact] = React.useState(false)
  const [replacementAnswer, setReplacementAnswer] = React.useState("")
  const [duplicateAnswer, setDuplicateAnswer] = React.useState("")
  const [observationVisibility, setObservationVisibility] = React.useState("PERSON_AND_MANAGER")
  const [questionValues, setQuestionValues] = React.useState<Record<string, unknown>>({})
  const questions = person.facts_json.questions || []
  const tasks = person.facts_json.tasks || []
  const observations = person.facts_json.observations || []
  const overridden =
    level !== person.suggested_level ||
    symbol !== person.suggested_symbol ||
    Number(bonus) !== person.suggested_bonus
  const additionalTasks = tasks.filter(
    (task) => task.classification.startsWith("additional_") && task.task_id
  )

  React.useEffect(() => {
    setLevel(person.final_level || person.suggested_level || "B")
    setSymbol(person.final_symbol || person.suggested_symbol || "+")
    setBonus(String(person.final_bonus ?? person.suggested_bonus ?? 0))
    setManagerComment(person.manager_comment || "")
    setOverrideReason(person.override_reason || "")
    setQuestionValues({})
  }, [
    person.final_bonus,
    person.final_level,
    person.final_symbol,
    person.id,
    person.manager_comment,
    person.override_reason,
    person.suggested_bonus,
    person.suggested_level,
    person.suggested_symbol,
  ])

  const submitReview = async () => {
    if (overridden && !overrideReason.trim()) {
      toast.error("Arsyeja e override është e detyrueshme.")
      return
    }
    setSaving(true)
    try {
      const response = await apiFetch(
        `/realization/periods/${person.period_id}/results/${person.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            final_level: level,
            final_symbol: symbol,
            final_bonus: Number(bonus),
            manager_comment: managerComment || null,
            override_reason: overridden ? overrideReason : null,
            question_values: questionValues,
          }),
        }
      )
      if (!response.ok) throw new Error(errorDetail(await response.json(), "Review dështoi."))
      toast.success("Rezultati u shqyrtua.")
      await onReload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review dështoi.")
    } finally {
      setSaving(false)
    }
  }

  const addObservation = async () => {
    if (!observationComment.trim()) {
      toast.error("Shkruaj evidencën ose komentin.")
      return
    }
    if (observationCategory === "EXTRA_TASK" && !observationKind) {
      toast.error("Zgjidh llojin e evidencës shtesë.")
      return
    }
    if (observationCategory === "EXTRA_TASK" && observationKind === "COMPLETED_EXTRA_TASK") {
      if (!observationTaskId || replacementAnswer === "" || duplicateAnswer === "") {
        toast.error("Zgjidh detyrën dhe konfirmo nëse është zëvendësim ose duplikat.")
        return
      }
    }
    if (observationCategory === "HELPED_COLLEAGUE" && !relatedUserId) {
      toast.error("Zgjidh kolegun e ndihmuar.")
      return
    }
    if (observationCategory === "BLOCKER" && (!relatedUserId || !impactLevel)) {
      toast.error("Zgjidh personin e prekur dhe nivelin e ndikimit.")
      return
    }
    if (observationCategory === "TIME_SAVED" && Number(impactMinutes) <= 0) {
      toast.error("Shkruaj minutat e kursyera.")
      return
    }
    if (observationCategory === "REPEATED_PROBLEM" && !repeatKey.trim()) {
      toast.error("Shkruaj repeat key.")
      return
    }
    const evidenceJson: Record<string, unknown> = {}
    if (observationKind) evidenceJson.kind = observationKind
    if (observationCategory === "HELPED_COLLEAGUE") evidenceJson.helped_user_id = relatedUserId
    if (observationCategory === "BLOCKER") {
      evidenceJson.affected_user_id = relatedUserId
      evidenceJson.impact_level = impactLevel
    }
    if (highImpact) evidenceJson.high_impact = true
    if (observationKind === "COMPLETED_EXTRA_TASK") {
      evidenceJson.replaces_unfinished_planned_task = replacementAnswer === "true"
      evidenceJson.duplicate = duplicateAnswer === "true"
    }
    const response = await apiFetch("/realization/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        period_id: person.period_id,
        scope_type: observationKind === "COMPLETED_EXTRA_TASK" ? "TASK" : "PERSON",
        task_id: observationKind === "COMPLETED_EXTRA_TASK" ? observationTaskId : null,
        user_id: person.user_id,
        department_id: person.department_id,
        marker: observationMarker,
        category: observationCategory,
        comment: observationComment,
        impact_minutes:
          observationCategory === "TIME_SAVED" ? Number(impactMinutes) : null,
        repeat_key:
          observationCategory === "REPEATED_PROBLEM" ? repeatKey.trim() : null,
        evidence_json: evidenceJson,
        visibility: observationVisibility,
      }),
    })
    if (!response.ok) {
      toast.error(errorDetail(await response.json(), "Evidenca nuk u ruajt."))
      return
    }
    setObservationComment("")
    setObservationKind("")
    setObservationTaskId("")
    setRelatedUserId("")
    setImpactLevel("")
    setImpactMinutes("")
    setRepeatKey("")
    setHighImpact(false)
    setReplacementAnswer("")
    setDuplicateAnswer("")
    toast.success("Evidenca u shtua. Verifikimi kërkohet para se të ndikojë në rezultat.")
    await onReload()
  }

  const verifyObservation = async (id: string) => {
    const response = await apiFetch(`/realization/observations/${id}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    if (!response.ok) {
      toast.error(errorDetail(await response.json(), "Verifikimi dështoi."))
      return
    }
    toast.success("Evidenca u verifikua. Rikalkulo për ta përfshirë në sugjerim.")
    await onReload()
  }

  return (
    <div className="space-y-5 border-t bg-slate-50/50 p-5">
      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Task evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tasks.length ? tasks.map((task) => <TaskEvidence key={task.match_key} task={task} />) : (
              <p className="text-sm text-muted-foreground">Nuk ka task evidence për këtë person.</p>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Narrativa automatike</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6">{person.auto_narrative || "—"}</p>
            {Object.entries(person.facts_json.attendance || {}).length ? (
              <div className="mt-4 space-y-1 rounded-lg border bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prezenca</p>
                {Object.entries(person.facts_json.attendance || {}).map(([id, entry]) => (
                  <p key={id} className="text-xs">
                    {entry.date} · {entry.type}{entry.details ? ` · ${entry.details}` : ""}
                  </p>
                ))}
              </div>
            ) : null}
            {person.facts_json.needs_review?.length ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p>{person.facts_json.needs_review.length} çështje kërkojnë shqyrtim manual.</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                  {person.facts_json.needs_review.map((item, index) => (
                    <li key={`${String(item.kind)}-${index}`}>{displayValue(item)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Pyetjet automatike</CardTitle>
        </CardHeader>
        <CardContent>
          {QUESTION_SECTIONS.map((section) => {
            const sectionQuestions = section.keys
              .map((key) => questions.find((item) => item.key === key))
              .filter((item): item is RealizationQuestion => Boolean(item))
            if (!sectionQuestions.length) return null
            return (
              <section key={section.title} className="mb-5 last:mb-0">
                <h3 className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700">
                  {section.title}
                </h3>
                {sectionQuestions.map((question) => (
                  <QuestionRow
                    key={question.key}
                    question={question}
                    canReview={canReview}
                    managerValue={questionValues[question.key]}
                    onManagerValueChange={(value) =>
                      setQuestionValues((current) => {
                        if (value === undefined) {
                          const next = { ...current }
                          delete next[question.key]
                          return next
                        }
                        return { ...current, [question.key]: value }
                      })
                    }
                  />
                ))}
              </section>
            )
          })}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Observime</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {observations.map((observation) => (
              <div key={observation.id} className="rounded-lg border bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{observation.category}</Badge>
                  <Badge
                    variant="outline"
                    className={observation.verified ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}
                  >
                    {observation.verified ? "VERIFIED" : "UNVERIFIED"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm">{observation.comment || "Pa koment"}</p>
                {Object.keys(observation.evidence_json || {}).length ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {displayValue(observation.evidence_json)}
                  </p>
                ) : null}
                {!observation.verified && canVerify ? (
                  <Button className="mt-3" size="sm" variant="outline" onClick={() => void verifyObservation(observation.id)}>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Verifiko
                  </Button>
                ) : null}
              </div>
            ))}
            {!observations.length ? <p className="text-sm text-muted-foreground">Nuk ka observime.</p> : null}
            {canMutateObservations ? (
            <div className="grid gap-3 rounded-lg border border-dashed p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  value={observationCategory}
                  onValueChange={(value) => {
                    setObservationCategory(value)
                    if (["EXTRA_TASK", "HELPED_COLLEAGUE", "PROPOSAL", "TIME_SAVED"].includes(value)) {
                      setObservationMarker("POSITIVE")
                    } else if (["DELAY", "ABSENCE", "MISSED_MEETING", "BLOCKER", "REPEATED_PROBLEM"].includes(value)) {
                      setObservationMarker("NEGATIVE")
                    }
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[
                      "EXTRA_TASK",
                      "HELPED_COLLEAGUE",
                      "PROPOSAL",
                      "TIME_SAVED",
                      "QUALITY",
                      ...(canVerify
                        ? [
                            "DELAY",
                            "ABSENCE",
                            "MISSED_MEETING",
                            "BLOCKER",
                            "REPEATED_PROBLEM",
                            "PRIORITY_CHANGE",
                          ]
                        : []),
                      "OTHER",
                    ].map((value) => (
                      <SelectItem key={value} value={value}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={observationMarker} onValueChange={setObservationMarker}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["POSITIVE", "NEUTRAL", ...(canVerify ? ["NEGATIVE", "DIAMOND"] : [])].map((value) => (
                      <SelectItem key={value} value={value}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {observationCategory === "EXTRA_TASK" ? (
                <Select value={observationKind} onValueChange={setObservationKind}>
                  <SelectTrigger><SelectValue placeholder="Lloji i detyrës shtesë" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REQUESTED_EXTRA_TASK">Kërkoi detyrë shtesë</SelectItem>
                    <SelectItem value="COMPLETED_EXTRA_TASK">Përfundoi detyrë shtesë</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
              {observationKind === "COMPLETED_EXTRA_TASK" ? (
                <div className="grid gap-3">
                  <Select value={observationTaskId} onValueChange={setObservationTaskId}>
                    <SelectTrigger><SelectValue placeholder="Zgjidh detyrën additional" /></SelectTrigger>
                    <SelectContent>
                      {additionalTasks.map((task) => (
                        <SelectItem key={task.task_id} value={task.task_id!}>{task.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select value={replacementAnswer} onValueChange={setReplacementAnswer}>
                      <SelectTrigger><SelectValue placeholder="Zëvendëson obligim?" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="false">Nuk zëvendëson obligim</SelectItem>
                        <SelectItem value="true">Po, zëvendëson obligim</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={duplicateAnswer} onValueChange={setDuplicateAnswer}>
                      <SelectTrigger><SelectValue placeholder="Është duplikat?" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="false">Nuk është duplikat</SelectItem>
                        <SelectItem value="true">Po, është duplikat</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
              {observationCategory === "HELPED_COLLEAGUE" || observationCategory === "BLOCKER" ? (
                <Select value={relatedUserId} onValueChange={setRelatedUserId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        observationCategory === "BLOCKER" ? "Personi i prekur" : "Kolegu i ndihmuar"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {people
                      .filter((item) => item.user_id !== person.user_id)
                      .map((item) => (
                        <SelectItem key={item.user_id} value={item.user_id}>{item.user_name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : null}
              {observationCategory === "BLOCKER" ? (
                <Select value={impactLevel} onValueChange={setImpactLevel}>
                  <SelectTrigger><SelectValue placeholder="Niveli i ndikimit" /></SelectTrigger>
                  <SelectContent>
                    {["MINOR", "MAJOR", "MULTIPLE_PEOPLE"].map((value) => (
                      <SelectItem key={value} value={value}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {observationCategory === "TIME_SAVED" ? (
                <Input
                  type="number"
                  min={1}
                  value={impactMinutes}
                  onChange={(event) => setImpactMinutes(event.target.value)}
                  placeholder="Minutat e kursyera"
                />
              ) : null}
              {observationCategory === "REPEATED_PROBLEM" ? (
                <Input
                  value={repeatKey}
                  onChange={(event) => setRepeatKey(event.target.value)}
                  placeholder="Repeat key i qëndrueshëm"
                />
              ) : null}
              {["EXTRA_TASK", "QUALITY"].includes(observationCategory) ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={highImpact}
                    onCheckedChange={(checked) => setHighImpact(checked === true)}
                  />
                  Ndikim i lartë (kërkon koment)
                </label>
              ) : null}
              {canVerify ? (
                <Select value={observationVisibility} onValueChange={setObservationVisibility}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERSON_AND_MANAGER">Personi dhe menaxheri</SelectItem>
                    <SelectItem value="PRIVATE_MANAGER">Vetëm menaxheri</SelectItem>
                    <SelectItem value="TEAM_AGGREGATE">Vetëm agregat i ekipit</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}
              <Textarea
                value={observationComment}
                onChange={(event) => setObservationComment(event.target.value)}
                placeholder="Përshkruaj evidencën pa supozime…"
              />
              <Button variant="outline" onClick={() => void addObservation()}>Shto observim</Button>
            </div>
            ) : (
              <p className="text-sm text-muted-foreground">Periudha e mbyllur nuk pranon observime të reja.</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Manager review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Niveli final</Label>
                <Select value={level} onValueChange={(value) => setLevel(value as RealizationLevel)} disabled={!canReview}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["A+", "A", "B", "C", "M", "D", "E"].map((value) => (
                      <SelectItem key={value} value={value}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vlerësimi</Label>
                <Select value={symbol} onValueChange={(value) => setSymbol(value as RealizationSymbol)} disabled={!canReview}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["+", "+/-", "-"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Bonusi (€)</Label>
                <Input type="number" min={0} value={bonus} onChange={(event) => setBonus(event.target.value)} disabled={!canReview} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Komenti i menaxherit</Label>
              <Textarea value={managerComment} onChange={(event) => setManagerComment(event.target.value)} disabled={!canReview} />
            </div>
            {overridden ? (
              <div className="space-y-2">
                <Label>Arsyeja e override *</Label>
                <Textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} disabled={!canReview} />
              </div>
            ) : null}
            {canReview ? (
              <Button onClick={() => void submitReview()} disabled={saving}>
                {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Ruaj review
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                {person.reviewed_at ? "Ky rezultat është shqyrtuar." : "Review nuk është i hapur në këtë fazë."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function RealizationPage() {
  const { apiFetch, user } = useAuth()
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [departmentId, setDepartmentId] = React.useState("")
  const [weekStart, setWeekStart] = React.useState(currentWeekStart)
  const [data, setData] = React.useState<RealizationWeeklyResponse | null>(null)
  const [selectedPersonId, setSelectedPersonId] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [acting, setActing] = React.useState(false)

  const visibleDepartments = React.useMemo(
    () =>
      user?.role === "ADMIN" || !user?.department_id
        ? departments
        : departments.filter((item) => item.id === user.department_id),
    [departments, user?.department_id, user?.role]
  )

  React.useEffect(() => {
    let cancelled = false
    void apiFetch("/departments").then(async (response) => {
      if (!response.ok || cancelled) return
      const payload = (await response.json()) as Department[]
      if (cancelled) return
      setDepartments(payload)
      const accessible =
        user?.role === "ADMIN" || !user?.department_id
          ? payload
          : payload.filter((item) => item.id === user.department_id)
      setDepartmentId((current) => current || accessible[0]?.id || "")
    })
    return () => {
      cancelled = true
    }
  }, [apiFetch, user?.department_id, user?.role])

  const load = React.useCallback(async () => {
    if (!departmentId || !weekStart) return
    setLoading(true)
    try {
      const query = new URLSearchParams({ department_id: departmentId, week_start: weekStart })
      const response = await apiFetch(`/realization/weekly?${query.toString()}`)
      if (!response.ok) throw new Error(errorDetail(await response.json(), "Realizimi nuk mund të ngarkohej."))
      setData((await response.json()) as RealizationWeeklyResponse)
    } catch (error) {
      setData(null)
      toast.error(error instanceof Error ? error.message : "Realizimi nuk mund të ngarkohej.")
    } finally {
      setLoading(false)
    }
  }, [apiFetch, departmentId, weekStart])

  React.useEffect(() => {
    void load()
  }, [load])

  const mutate = async (path: string, success: string) => {
    setActing(true)
    try {
      const response = await apiFetch(path, { method: "POST" })
      if (!response.ok) throw new Error(errorDetail(await response.json(), "Veprimi dështoi."))
      toast.success(success)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Veprimi dështoi.")
    } finally {
      setActing(false)
    }
  }

  const calculate = () => {
    const query = new URLSearchParams({ department_id: departmentId, week_start: weekStart })
    return mutate(`/realization/weekly/calculate?${query.toString()}`, "Realizimi u kalkulua.")
  }

  const people = React.useMemo(() => data?.people || [], [data?.people])
  const uniqueTaskFacts = React.useMemo(() => {
    const facts = new Map<string, RealizationTaskFact>()
    for (const person of people) {
      for (const task of person.facts_json.tasks || []) {
        if (task.attribution === "actual_worker") continue
        if (!facts.has(task.match_key)) facts.set(task.match_key, task)
      }
    }
    return [...facts.values()]
  }, [people])
  const plannedTasks = uniqueTaskFacts.filter((task) => task.attribution === "planned_owner")
  const additionalTasks = uniqueTaskFacts.filter((task) => task.classification.startsWith("additional_"))
  const planned = plannedTasks.length
  const completed = plannedTasks.filter((task) =>
    ["completed_on_time", "completed_late"].includes(task.classification)
  ).length
  const open = plannedTasks.filter((task) =>
    ["in_progress", "pending_confirmation", "no_progress", "late_open", "needs_review"].includes(
      task.classification
    )
  ).length
  const late = plannedTasks.filter((task) =>
    ["completed_late", "late_open"].includes(task.classification)
  ).length
  const additional = additionalTasks.length
  const canManage = user?.role === "MANAGER" || user?.role === "ADMIN"
  const status = data?.period.status

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-2 md:p-4">
      <section className="relative overflow-hidden rounded-2xl border bg-slate-950 px-5 py-6 text-white md:px-7">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
              PrimeFlow automatic weekly realization
            </p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Realizimi</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              PLANNED dhe FINAL janë baseline zyrtar; detyrat, progresi, prezenca dhe observimet
              shfaqen si evidence e riprodhueshme.
            </p>
          </div>
          {data ? (
            <div className="flex flex-wrap gap-2">
              <Badge className="border border-white/15 bg-white/10 text-white hover:bg-white/10">
                <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                {formatWeek(data.period.start_date, data.period.end_date)}
              </Badge>
              <Badge className="border border-cyan-300/30 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/15">
                {data.period.status}
              </Badge>
            </div>
          ) : null}
        </div>
      </section>

      <Card className="shadow-none">
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="realization-week">Java</Label>
            <Input id="realization-week" type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Departamenti</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger><SelectValue placeholder="Zgjidh departamentin" /></SelectTrigger>
              <SelectContent>
                {visibleDepartments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/weekly-planner?week=${weekStart}&department_id=${departmentId}`}>
                Weekly Planner <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
              Rifresko
            </Button>
          </div>
        </CardContent>
      </Card>

      {data ? (
        <Card className="shadow-none">
          <CardContent className="space-y-4 p-5">
            <WorkflowStrip status={data.period.status} />
            <div className="flex flex-wrap justify-end gap-2">
              {data.can_calculate && canManage ? (
                <Button onClick={() => void calculate()} disabled={acting}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {status === "CALCULATED" ? "Rikalkulo" : "Kalkulo automatikisht"}
                </Button>
              ) : null}
              {user?.role === "ADMIN" && status === "REVIEWED" ? (
                <Button onClick={() => void mutate(`/realization/periods/${data.period.id}/approve`, "Periudha u aprovua.")} disabled={acting}>
                  <ShieldCheck className="mr-2 h-4 w-4" /> Aprovo
                </Button>
              ) : null}
              {user?.role === "ADMIN" && status === "APPROVED" ? (
                <Button onClick={() => void mutate(`/realization/periods/${data.period.id}/lock`, "Periudha u mbyll dhe u bë immutable.")} disabled={acting}>
                  <Lock className="mr-2 h-4 w-4" /> Lock
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Plan" value={planned} detail="Detyra unike në PLANNED" icon={Target} />
        <Metric label="Completed" value={completed} detail="Në kohë dhe me vonesë" icon={CheckCircle2} />
        <Metric label="Open" value={open} detail="Në progres, pending ose pa progres" icon={Clock3} />
        <Metric label="Late" value={late} detail="Të përfunduara ose të hapura me vonesë" icon={AlertTriangle} />
        <Metric label="Additional" value={additional} detail="Të futura pas baseline-it" icon={Sparkles} />
        <Metric label="Bonus total" value={`€${data?.department_result?.total_bonus ?? 0}`} detail="Nga policy version i fiksuar" icon={ShieldCheck} />
      </div>

      <Card className="overflow-hidden shadow-none">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5" /> Rezultatet sipas personit</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Po ngarkohet…
            </div>
          ) : !data?.has_planned_snapshot ? (
            <MissingState
              title="Nuk ka PLANNED snapshot"
              detail="Ruaje planin zyrtar për këtë javë në Weekly Planner."
              href={`/weekly-planner?week=${weekStart}&department_id=${departmentId}`}
            />
          ) : !data.has_final_snapshot ? (
            <MissingState
              title="Plani ekziston; FINAL snapshot mungon"
              detail="Kalkulimi është i çaktivizuar derisa të ruhet This Week (Final)."
              href={`/weekly-planner?week=${weekStart}&department_id=${departmentId}`}
            />
          ) : !people.length ? (
            <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground">
              {status === "OPEN" ? "Kliko “Kalkulo automatikisht” për të gjeneruar sugjerimet." : "Nuk ka rezultate për këtë scope."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>Personi</TableHead>
                  <TableHead className="text-center">Plan</TableHead>
                  <TableHead className="text-center">Në kohë</TableHead>
                  <TableHead className="text-center">Late</TableHead>
                  <TableHead className="text-center">Open</TableHead>
                  <TableHead className="text-center">Additional</TableHead>
                  <TableHead>Suggested</TableHead>
                  <TableHead>Final</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((person) => {
                  const expanded = selectedPersonId === person.id
                  return (
                    <React.Fragment key={person.id}>
                      <TableRow className={cn("cursor-pointer", expanded && "bg-cyan-50/60")} onClick={() => setSelectedPersonId(expanded ? null : person.id)}>
                        <TableCell>
                          <p className="font-semibold">{person.user_name}</p>
                          <p className="text-xs text-muted-foreground">{person.reviewed_at ? "Reviewed" : "Awaiting review"}</p>
                        </TableCell>
                        <TableCell className="text-center">{person.planned_count}</TableCell>
                        <TableCell className="text-center">{person.completed_on_time_count}</TableCell>
                        <TableCell className="text-center">{person.completed_late_count}</TableCell>
                        <TableCell className="text-center">{person.in_progress_count + person.pending_count + person.no_progress_count}</TableCell>
                        <TableCell className="text-center">{person.additional_count}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{person.suggested_level} · {person.suggested_symbol} · €{person.suggested_bonus}</Badge>
                        </TableCell>
                        <TableCell>
                          {person.final_level ? (
                            <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                              {person.final_level} · {person.final_symbol} · €{person.final_bonus}
                            </Badge>
                          ) : <span className="text-xs text-muted-foreground">Pa final</span>}
                        </TableCell>
                        <TableCell>{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</TableCell>
                      </TableRow>
                      {expanded ? (
                        <TableRow>
                          <TableCell colSpan={9} className="p-0">
                            <PersonDetail
                              person={person}
                              canReview={canManage && status === "CALCULATED" && !person.reviewed_at}
                              canVerify={Boolean(canManage && status !== "LOCKED")}
                              canMutateObservations={status !== "LOCKED"}
                              onReload={load}
                              apiFetch={apiFetch}
                              people={people}
                            />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {data?.unassigned.length ? (
        <Card className="border-amber-200 shadow-none">
          <CardHeader><CardTitle className="text-base">Unassigned evidence</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.unassigned.map((task) => <TaskEvidence key={task.match_key} task={task} />)}
          </CardContent>
        </Card>
      ) : null}

      {data?.message ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {data.message}
        </div>
      ) : null}
    </div>
  )
}

function MissingState({ title, detail, href }: { title: string; detail: string; href: string }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
      <div className="rounded-full bg-amber-50 p-4 text-amber-700"><FileClock className="h-7 w-7" /></div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 max-w-lg text-sm text-muted-foreground">{detail}</p>
      <Button className="mt-5" variant="outline" asChild>
        <Link href={href}>Hap Weekly Planner <ArrowRight className="ml-2 h-4 w-4" /></Link>
      </Button>
    </div>
  )
}
