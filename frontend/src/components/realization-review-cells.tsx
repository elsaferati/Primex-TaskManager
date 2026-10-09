"use client"

import * as React from "react"
import { ChevronRight, Loader2 } from "lucide-react"
import { RealizationWeeklyDays } from "@/components/realization-weekly-days"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import { manualChecklistBooleanKeys, weeklyChecklistLabels } from "@/lib/realization-checklist"
import type { RealizationLevel, RealizationManagerReviewResponse, RealizationManagerReviewRating, RealizationPersonResult, RealizationQuestion } from "@/lib/types"
import { cn } from "@/lib/utils"

const RATINGS: Record<RealizationManagerReviewRating, string> = {
  GOOD: "Mirë", VERY_GOOD: "Shumë mirë", ACTION_REQUIRED: "Kërkon veprim", BAD: "Keq",
}
type QuestionDraft = { values: string[]; comment: string; touched: boolean }

const FACT_LABELS: Record<string, string> = {
  yes: "Përgjigjja", frequent: "Të shpeshta", threshold: "Pragu i vonesave",
  answer: "Përgjigjja", planned: "Planifikuar", completed: "Kryer", remaining: "Mbetur",
  count: "Numri", total: "Gjithsej", in_progress: "Në progres", no_progress: "Pa progres", todo: "To do", postponed: "Shtyrë",
  approved: "Aprovuar", unapproved: "Pa aprovim", closed: "Mbyllur",
  all_closed: "Të gjitha të mbyllura", attendance_tardiness: "Vonesa",
  missed_meeting_evidence: "Evidenca për takime të humbura",
}

function automaticValue(value: unknown): string {
  if (value == null) return "Pa të dhëna"
  if (typeof value === "boolean") return value ? "Po" : "Jo"
  if (typeof value !== "object") return String(value)
  if (Array.isArray(value)) return value.length ? value.map(automaticValue).join(", ") : "Asnjë"
  return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${FACT_LABELS[key] || key.replaceAll("_", " ")}: ${automaticValue(item)}`)
    .join(" · ")
}

function savedQuestionValues(question: RealizationQuestion): string[] {
  const value = question.final_value
  if (manualChecklistBooleanKeys.has(question.key)) {
    if (value === true) return ["YES"]
    if (value === false) return ["NO"]
    return ["NO"]
  }
  if (question.source_status !== "MANUAL_ANSWERED" || typeof value !== "string" || !value.trim()) return []
  return value.split(" • ").map((item) => item.trim()).filter(Boolean)
}

function automaticAnswer(question: RealizationQuestion): { answer: string; detail: string } {
  const value = question.final_value ?? question.auto_value
  if (value == null) return { answer: "Pa të dhëna", detail: "" }
  const facts = typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const number = (key: string) => typeof facts[key] === "number" ? facts[key] : "—"
  const yesNo = (answer: unknown) => answer === true ? "Po" : answer === false ? "Jo" : "Pa të dhëna"
  switch (question.key) {
    case "plan_completed":
      return { answer: yesNo(facts.answer), detail: `${number("completed")} nga ${number("planned")} detyra të kryera. Mbeten ${number("remaining")}.` }
    case "no_progress_tasks":
      return { answer: yesNo(facts.answer), detail: `${number("count")} detyra pa progres të regjistruar.` }
    case "in_progress_tasks":
      return { answer: yesNo(facts.answer), detail: `${number("count")} detyra janë ende në progres.` }
    case "new_tasks_added":
      return { answer: yesNo(facts.yes), detail: `${number("total")} detyra të reja: ${number("completed")} të kryera, ${number("in_progress")} në progres, ${number("todo")} pa filluar dhe ${number("postponed")} të shtyra.` }
    case "closed_tasks":
      return { answer: yesNo(facts.all_closed), detail: `${number("closed")} nga ${number("planned")} detyra të mbyllura. Mbeten ${number("remaining")}.` }
    case "frequent_delays":
      return { answer: yesNo(facts.answer ?? facts.frequent), detail: `${number("attendance_tardiness")} vonesa të regjistruara. Konsiderohen të shpeshta nga ${number("threshold")} vonesa.` }
    case "unexpected_absences":
      if (typeof value === "number") return { answer: value > 0 ? "Po" : "Jo", detail: `${value} mungesa të papritura të regjistruara.` }
  }
  return { answer: typeof value === "boolean" ? yesNo(value) : "Përmbledhje", detail: typeof value === "boolean" ? "" : automaticValue(value) }
}

function ManualQuestion({ label, draft, disabled, onChange, onSaveComment }: {
  label: string; draft: QuestionDraft; disabled: boolean; onChange: (next: QuestionDraft) => void; onSaveComment: () => void
}) {
  return <div className="border-b border-slate-200 px-3 py-2 last:border-b-0">
    <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
      </div>
      <select aria-label={label} disabled={disabled} value={draft.values[0] || ""} onChange={event => onChange({ ...draft, values: event.target.value ? [event.target.value] : [], touched: true })} className="h-8 rounded border bg-white px-2 text-xs">
        <option value="">E paplotësuar</option><option value="YES">Po</option><option value="NO">Jo</option>
      </select>
    </div>
    {draft.values.length ? <div className="mt-2 flex flex-col items-stretch gap-1"><Textarea aria-label={`Komenti për ${label}`} className="min-h-8 resize-y bg-slate-50 px-2 py-1.5 text-xs" rows={1} maxLength={1000} value={draft.comment} disabled={disabled} onChange={(event) => onChange({ ...draft, comment: event.target.value, touched: true })} placeholder="Shto koment (opsional)…" /><Button type="button" size="sm" variant="outline" className="h-7 self-end px-3 text-xs" disabled={disabled} onClick={onSaveComment}>Ruaj përgjigjen</Button></div> : null}
  </div>
}

export function RealizationReviewCells({ periodId, userId, userName, result: initialResult, scope = "weekly", locked = false, compactTable = false, onSaved, onPrepareResult, refreshKey, commentCell }: {
  periodId: string; userId: string; userName: string; result?: RealizationPersonResult; scope?: "daily" | "weekly"; locked?: boolean; compactTable?: boolean; onSaved?: () => void; onPrepareResult?: () => Promise<void>; refreshKey?: unknown
  commentCell?: React.ReactNode
}) {
  const { apiFetch } = useAuth()
  const [updatedResult, setUpdatedResult] = React.useState<RealizationPersonResult | null>(null)
  const result = updatedResult || initialResult
  const [data, setData] = React.useState<RealizationManagerReviewResponse | null>(null)
  const [rating, setRating] = React.useState<RealizationManagerReviewRating | "">("")
  const [level, setLevel] = React.useState<RealizationLevel | "">("")
  const [comment, setComment] = React.useState("")
  const [drafts, setDrafts] = React.useState<Record<string, QuestionDraft>>({})
  const [savedAnswersFor, setSavedAnswersFor] = React.useState<RealizationPersonResult | null>(null)
  const proposalRef = React.useRef<HTMLElement | null>(null)
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [preparing, setPreparing] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  // The API answers for the week that contains periodId, so its period_id is
  // the weekly one and cannot be compared against periodId directly.
  const [loadedFor, setLoadedFor] = React.useState("")
  const draftsRef = React.useRef(drafts)
  const generatedQuestionLines = React.useRef<string[]>([])
  draftsRef.current = drafts
  const endpoint = `/realization/periods/${periodId}/users/${userId}/manager-review`
  const manualQuestions = React.useMemo(() => (result?.facts_json.questions || []).filter((question) => question.source_status.startsWith("MANUAL")), [result])
  const automaticQuestions = React.useMemo(() => (result?.facts_json.questions || []).filter((question) => question.source_status.startsWith("AUTO") && question.key !== "extra_engagement"), [result])
  const weeklySnapshotDays = scope === "weekly" ? Number(result?.facts_json.weekly_snapshot_days || 0) : 0
  const questionLabel = React.useCallback((question: RealizationQuestion) => {
    const label = weeklyChecklistLabels[question.key] || question.label
    return scope === "daily" ? label.replace("këtë javë", "këtë ditë") : label
  }, [scope])
  const initializeDrafts = React.useCallback(() => {
    const nextDrafts = Object.fromEntries(manualQuestions.map((question) => [question.key, {
      values: savedQuestionValues(question), comment: question.source_status === "MANUAL_ANSWERED" ? question.manager_comment || "" : "", touched: manualChecklistBooleanKeys.has(question.key) && question.final_value !== true && question.final_value !== false,
    }]))
    generatedQuestionLines.current = manualQuestions.flatMap((question) => {
      const text = nextDrafts[question.key]?.comment.trim()
      return text ? [`- ${questionLabel(question)}: ${text}`] : []
    })
    setDrafts(nextDrafts)
  }, [manualQuestions, questionLabel])
  const load = React.useCallback(async () => {
    if (!periodId) return
    try {
      const response = await apiFetch(endpoint)
      if (!response.ok) throw new Error()
      const payload = await response.json() as RealizationManagerReviewResponse
      setData(payload)
      setLoadedFor(periodId)
      setRating(payload.realization?.rating ?? "")
      setLevel(payload.realization?.level ?? "")
      setComment(payload.realization?.comment ?? "")
      setFailed(false)
    } catch { setFailed(true) }
  }, [apiFetch, endpoint, periodId])
  React.useEffect(() => { queueMicrotask(() => void load()) }, [load, refreshKey])
  React.useEffect(() => {
    if (open && Object.keys(draftsRef.current).length > 0) return
    queueMicrotask(initializeDrafts)
  }, [initializeDrafts, open])
  const canEdit = Boolean(data?.can_edit && loadedFor === periodId && data.user_id === userId && !locked && periodId)
  const savedRating = data?.realization?.rating ?? ""
  const savedComment = data?.realization?.comment ?? ""
  const savedLevel = data?.realization?.level ?? ""
  const suggestion = result?.facts_json.weekly_evaluation
  const reviewDirty = rating !== savedRating || comment !== savedComment || level !== savedLevel
  const questionsDirty = Object.values(drafts).some((draft) => draft.touched)
  const answersComplete = Boolean(result?.facts_json.manual_question_completeness?.complete)
  const proposalReady = answersComplete && !questionsDirty && savedAnswersFor !== result
  React.useEffect(() => {
    if (open && proposalReady) proposalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [open, proposalReady])
  const hasUnsavedChanges = reviewDirty || questionsDirty
  const ratingLabel = failed ? "Gabim ngarkimi" : !data ? "Duke ngarkuar…" : scope === "weekly" && !answersComplete ? "Plotëso përgjigjet" : scope === "weekly" && (savedLevel || suggestion?.level) ? `${savedLevel || suggestion?.level} · ${savedLevel ? "Konfirmuar" : "Propozim"}` : savedRating ? RATINGS[savedRating] : "Pa vlerësim"

  const syncQuestionComment = (nextDrafts: Record<string, QuestionDraft>) => {
    const previousLines = generatedQuestionLines.current
    const nextLines = manualQuestions.flatMap((question) => {
      const text = nextDrafts[question.key]?.comment.trim()
      return text ? [`- ${questionLabel(question)}: ${text}`] : []
    })
    setComment((current) => {
      const remaining = current.split("\n").filter((line) => !previousLines.includes(line.trim()))
      const base = remaining.join("\n").trim()
      return [...(base ? [base] : []), ...nextLines].join("\n")
    })
    generatedQuestionLines.current = nextLines
  }
  const updateQuestionDraft = (key: string, next: QuestionDraft) => {
    const nextDrafts = { ...drafts, [key]: next }
    setDrafts(nextDrafts)
    syncQuestionComment(nextDrafts)
  }

  const openReview = async () => {
    initializeDrafts()
    setOpen(true)
    if (result || !onPrepareResult) return
    setPreparing(true)
    try {
      await onPrepareResult()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checklist-a nuk u ngarkua")
    } finally {
      setPreparing(false)
    }
  }

  const save = async ({ closeDialog = true, saveQuestions = true, confirmLevel }: { closeDialog?: boolean; saveQuestions?: boolean; confirmLevel?: RealizationLevel } = {}) => {
    if (!hasUnsavedChanges && !confirmLevel) return
    setSaving(true)
    try {
      if (saveQuestions) {
        for (const question of manualQuestions) {
          const draft = drafts[question.key] || { values: [], comment: "", touched: false }
          if (!draft.touched) continue
          const value = draft.values.includes("YES")
          const response = await apiFetch(`/realization/periods/${periodId}/users/${userId}/questions/${question.key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value, clear: draft.values.length === 0, comment: draft.comment.trim() || null, evidence_ids: [] }) })
          if (!response.ok) throw new Error(`Nuk u ruajt përgjigjja: ${question.label}`)
        }
      }
      if (scope === "weekly" && saveQuestions && questionsDirty) {
        setSavedAnswersFor(result || null)
        const weekStart = result?.facts_json.daily_timeline?.[0]?.date
        if (!weekStart || !result?.department_id) throw new Error("Mungon java ose departamenti për propozimin.")
        const refreshed = await apiFetch(`/realization/weekly?department_id=${result.department_id}&week_start=${weekStart}`)
        if (!refreshed.ok) throw new Error("Përgjigjet u ruajtën, por propozimi nuk u ngarkua. Provo përsëri.")
        const report = await refreshed.json() as { people: RealizationPersonResult[] }
        const next = report.people.find(person => person.user_id === userId)
        if (!next) throw new Error("Propozimi për këtë person nuk u gjet.")
        setUpdatedResult(next)
        setDrafts(current => Object.fromEntries(Object.entries(current).map(([key, draft]) => [key, { ...draft, touched: false }])))
        toast.success("Përgjigjet u ruajtën dhe propozimi u përditësua.")
        return
      }
      const marker = rating ? (["GOOD", "VERY_GOOD"].includes(rating) ? "POSITIVE" : "NEGATIVE") : data?.realization?.marker || "POSITIVE"
      const response = await apiFetch(`${endpoint}/REALIZATION`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: rating || null, marker, comment: comment.trim() || null, ...(scope === "weekly" && proposalReady ? { level: confirmLevel || level || null } : {}) }) })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { detail?: string }
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Vlerësimi nuk u ruajt")
      }
      const payload = await response.json() as RealizationManagerReviewResponse
      setData(payload)
      setLevel(payload.realization?.level ?? "")
      setComment(payload.realization?.comment ?? comment.trim())
      setDrafts((current) => Object.fromEntries(Object.entries(current).map(([key, draft]) => [key, { ...draft, touched: false }])))
      if (closeDialog) {
        setOpen(false)
      }
      onSaved?.()
      toast.success(saveQuestions ? "Vlerësimi dhe përgjigjet u ruajtën" : "Komenti i përgjegjësit u ruajt")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Vlerësimi nuk u ruajt") }
    finally { setSaving(false) }
  }

  return <>
    {compactTable ? <td className="p-1" onClick={(event) => event.stopPropagation()}>
      <Button type="button" variant="outline" size="sm" className="h-8 w-full min-w-32 justify-between px-2 text-[13px]" onClick={() => void openReview()} disabled={failed}>{ratingLabel}<ChevronRight className="h-3.5 w-3.5" /></Button>
      <p className={cn("mt-0.5 line-clamp-1 text-[11px]", savedComment ? "text-slate-500" : "text-slate-400")}>{savedComment || "Pa koment"}</p>
    </td> : <><td className="p-1" onClick={(event) => event.stopPropagation()}><Button type="button" variant="outline" size="sm" className="h-8 w-full min-w-32 justify-between px-2 text-[13px]" onClick={() => void openReview()} disabled={failed}>{ratingLabel}<ChevronRight className="h-3.5 w-3.5" /></Button></td>
    {commentCell ?? <td className="p-1" onClick={(event) => event.stopPropagation()}>
      <div className="flex min-w-64 flex-col items-stretch gap-1">
        <Textarea aria-label={`Komenti i përgjegjësit për ${userName}`} className="min-h-20 w-full resize-y bg-white px-2 py-1.5 text-[13px] leading-5" rows={3} maxLength={4000} value={comment} disabled={!canEdit || saving} onChange={(event) => setComment(event.target.value)} placeholder="Shkruaj komentin e përgjegjësit…" />
        {canEdit && reviewDirty ? <Button type="button" size="sm" className="h-8 self-end px-3" disabled={saving} title="Ruaj komentin" onClick={() => void save({ closeDialog: false, saveQuestions: false })}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ruaj komentin"}</Button> : null}
      </div>
    </td>}</>}
    <Dialog open={open} onOpenChange={(next) => { if (!saving) { setOpen(next); if (!next && updatedResult) onSaved?.() } }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader><DialogTitle>{scope === "weekly" ? "Vlerësimi javor" : "Përgjigjet ditore"} — {userName}</DialogTitle><DialogDescription>{scope === "weekly" ? "Përmbledhje nga ditët e javës. Shkronja propozohet nga sistemi; përgjegjësi mund ta konfirmojë ose ta ndryshojë." : "Përgjigjet ruhen për ditën e zgjedhur dhe përmblidhen në javor. Vlerësimi i përgjegjësit dhe përmbledhja e tij mbeten javore."}</DialogDescription></DialogHeader>
      {scope === "weekly" && !proposalReady ? <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">1. Plotëso dhe ruaj 9 përgjigjet. 2. Shiko propozimin. 3. Konfirmo ose ndrysho shkronjën.</p> : null}
      {scope === "weekly" && proposalReady ? <section ref={proposalRef} className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
        <p className="font-semibold">Propozimi: {suggestion?.level || "Pa të dhëna"}{suggestion?.provisional ? " · Paraprak" : ""}</p>
        {suggestion?.reasons.map(reason => <p key={reason} className="mt-1 text-xs text-slate-600">{reason}</p>)}
        {suggestion?.provisional ? <p className="mt-1 text-xs text-amber-800">Ka ditë ose përgjigje që duhen plotësuar. Propozimi përditësohet me të dhënat e javës.</p> : null}
        <label className="mt-3 block text-xs font-semibold">Shkronja e përgjegjësit
          <select aria-label="Shkronja e përgjegjësit" className="ml-2 rounded border bg-white p-2" value={level} disabled={!canEdit || saving} onChange={event => setLevel(event.target.value as RealizationLevel | "")}><option value="">Përdor propozimin</option>{(["A+", "A", "B", "C", "M", "D", "E"] as const).map(value => <option key={value}>{value}</option>)}</select>
        </label>
        {canEdit && suggestion?.level ? <Button className="mt-3" size="sm" disabled={saving} onClick={() => void save({ confirmLevel: level || suggestion.level! })}>{level ? `Konfirmo shkronjën ${level}` : `Prano propozimin ${suggestion.level}`}</Button> : null}
        {savedLevel ? <p className="mt-1 text-xs text-slate-500">Ruajtur nga {data?.realization?.created_by_name}. Ndryshimet e të dhënave nuk e mbishkruajnë këtë zgjedhje.</p> : null}
        {data?.history.some(item => item.level) ? <details className="mt-2 text-xs"><summary className="cursor-pointer">Historiku i shkronjës</summary>{data.history.filter(item => item.dimension === "REALIZATION" && item.level).map(item => <p key={item.id}>{new Date(item.created_at).toLocaleString("sq-AL")} · {item.created_by_name}: {item.level}{item.active ? " · Aktuale" : ""}</p>)}</details> : null}
      </section> : null}
      {scope === "weekly" && result ? <section><p className="mb-2 text-sm font-semibold">Ditët dhe komentet e javës</p><RealizationWeeklyDays result={result} /></section> : null}
      {scope !== "weekly" || proposalReady ? <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-[11px] font-bold uppercase tracking-wide text-slate-600">Vlerësimi i përgjegjësit</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={!canEdit || saving}
              onClick={() => setRating("")}
              className={cn(
                "h-8 rounded-md border px-3 text-xs font-semibold",
                rating === "" ? "border-slate-400 bg-slate-100 text-slate-700" : "border-slate-200 bg-white text-slate-500"
              )}
            >
              Pa vlerësim
            </button>
            {(Object.entries(RATINGS) as Array<[RealizationManagerReviewRating, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={!canEdit || saving}
                onClick={() => setRating(value)}
                className={cn(
                  "h-8 rounded-md border px-3 text-xs font-semibold",
                  rating === value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Textarea
          className="mt-2 min-h-32 resize-y bg-white text-xs"
          rows={5}
          value={comment}
          disabled={!canEdit || saving}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Përmbledhja e vlerësimit të përgjegjësit…"
          maxLength={4000}
        />
        {canEdit && hasUnsavedChanges ? <div className="mt-2 flex items-center justify-end gap-3"><Button type="button" size="sm" onClick={() => void save()} disabled={saving || preparing || Boolean(onPrepareResult && !result)}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Ruaj vlerësimin</Button></div> : null}
      </section> : null}
      {automaticQuestions.length ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Përgjigjet automatike">
          <h3 className="px-4 py-3 text-sm font-semibold text-slate-700">
            {automaticQuestions.length} përgjigje automatike nga sistemi
            {scope === "weekly" ? ` · Totali i ${weeklySnapshotDays} ditëve` : ""}
          </h3>
          <div className="border-t border-slate-200">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <span>Pyetja</span>
              <span>Përgjigjja</span>
            </div>
            {automaticQuestions.map((question) => {
              const answer = automaticAnswer(question)
              return <div key={question.key} className="grid grid-cols-1 gap-2 border-b border-slate-200 px-3 py-3 text-sm last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
                <p className="font-medium text-slate-800">{question.label}</p>
                <div><span className="inline-flex rounded-md bg-blue-50 px-2 py-0.5 text-sm font-semibold text-blue-900">{answer.answer}</span>{answer.detail ? <p className="mt-1.5 break-words text-xs leading-5 text-slate-600">{answer.detail}</p> : null}</div>
              </div>
            })}
          </div>
        </section>
      ) : null}
      {result ? (
        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-800">Checklist-a</p>
              <p className="text-xs text-slate-500">{scope === "weekly" ? "Kontrollo 9 përgjigjet dhe ruaji për të marrë propozimin e shkronjës. Përgjigjet nga ditët përfshihen automatikisht; kur mungojnë, formulari nis me Jo." : "Pyetjet pa përgjigje nisin me Jo. Ndrysho në Po kur vlen dhe kliko Ruaj vlerësimin."}</p>
            </div>
            <Badge variant="outline">{manualQuestions.length} pyetje</Badge>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <span>Pyetja</span>
              <span className="min-w-16 text-center">Po / Jo</span>
            </div>
            {manualQuestions.map((question) => (
              <ManualQuestion
                key={question.key}
                label={questionLabel(question)}
                draft={drafts[question.key] || { values: [], comment: "", touched: false }}
                disabled={!canEdit || saving}
                onChange={(next) => updateQuestionDraft(question.key, next)}
                onSaveComment={() => void save({ closeDialog: false })}
              />
            ))}
          </div>
          {scope === "weekly" && canEdit && (!proposalReady || questionsDirty) ? <div className="mt-3 flex justify-end"><Button disabled={saving || preparing || !questionsDirty} onClick={() => void save({ closeDialog: false })}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Ruaj përgjigjet dhe shfaq propozimin</Button></div> : null}
        </section>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
          <span>{preparing ? "Duke përgatitur checklistën për këtë person…" : "Checklist-a nuk është përgatitur ende për këtë person."}</span>
          {preparing ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : onPrepareResult ? <Button type="button" size="sm" variant="outline" onClick={() => void openReview()}>Provo përsëri</Button> : null}
        </div>
      )}
      <DialogFooter><Button variant="outline" onClick={() => { setOpen(false); if (updatedResult) onSaved?.() }} disabled={saving || preparing}>Mbyll</Button></DialogFooter>
    </DialogContent></Dialog>
  </>
}
