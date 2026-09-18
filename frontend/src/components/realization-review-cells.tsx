"use client"

import * as React from "react"
import { Check, ChevronRight, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import { dailyChecklistLabels, manualChecklistBooleanKeys } from "@/lib/realization-checklist"
import type { RealizationManagerReviewResponse, RealizationManagerReviewRating, RealizationPersonResult, RealizationQuestion } from "@/lib/types"
import { cn } from "@/lib/utils"

const RATINGS: Record<RealizationManagerReviewRating, string> = {
  GOOD: "Mirë", VERY_GOOD: "Shumë mirë", ACTION_REQUIRED: "Kërkon veprim", BAD: "Keq",
}
type QuestionDraft = { values: string[]; comment: string; touched: boolean }

const FACT_LABELS: Record<string, string> = {
  answer: "Përgjigjja", planned: "Planifikuar", completed: "Kryer", remaining: "Mbetur",
  count: "Numri", approved: "Aprovuar", unapproved: "Pa aprovim", closed: "Mbyllur",
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
    if (question.source_status === "MANUAL_DAILY_PARTIAL") return []
    if (value === true) return ["YES"]
    if (value === false) return ["NO"]
    return []
  }
  if (question.source_status !== "MANUAL_ANSWERED" || typeof value !== "string" || !value.trim()) return []
  return value.split(" • ").map((item) => item.trim()).filter(Boolean)
}

function ManualQuestion({ question, label, draft, disabled, onChange }: {
  question: RealizationQuestion; label: string; draft: QuestionDraft; disabled: boolean; onChange: (next: QuestionDraft) => void
}) {
  const summary = question.daily_summary
  const checked = draft.values.includes("YES")
  return <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-200 px-3 py-2 last:border-b-0">
    <div className="min-w-0">
      <p className="text-sm font-medium text-slate-800">{label}</p>
      {summary ? <p className="mt-0.5 text-[10px] text-slate-500">Java: Po {summary.yes_days} · Jo {summary.no_days} · Pa përgjigje {summary.missing_dates.length}</p> : null}
    </div>
    <button type="button" role="checkbox" aria-checked={checked} aria-label={`${label}: ${checked ? "Po" : "Jo"}`} disabled={disabled} onClick={() => onChange({ ...draft, values: checked ? ["NO"] : ["YES"], touched: true })} className={cn("flex h-7 min-w-16 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-semibold", checked ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-white text-slate-500", disabled && "cursor-not-allowed opacity-60")}>
      <span className={cn("flex h-4 w-4 items-center justify-center rounded border", checked ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white")}>{checked ? <Check className="h-3 w-3" /> : null}</span>
      {checked ? "Po" : "Jo"}
    </button>
  </div>
}

export function RealizationReviewCells({ periodId, userId, userName, result, scope = "weekly", locked = false, onSaved, onPrepareResult, refreshKey }: {
  periodId: string; userId: string; userName: string; result?: RealizationPersonResult; scope?: "daily" | "weekly"; locked?: boolean; onSaved?: () => void; onPrepareResult?: () => Promise<void>; refreshKey?: unknown
}) {
  const { apiFetch } = useAuth()
  const [data, setData] = React.useState<RealizationManagerReviewResponse | null>(null)
  const [rating, setRating] = React.useState<RealizationManagerReviewRating | "">("")
  const [comment, setComment] = React.useState("")
  const [drafts, setDrafts] = React.useState<Record<string, QuestionDraft>>({})
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [preparing, setPreparing] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const endpoint = `/realization/periods/${periodId}/users/${userId}/manager-review`
  const manualQuestions = React.useMemo(() => (result?.facts_json.questions || []).filter((question) => question.source_status.startsWith("MANUAL")), [result])
  const automaticQuestions = React.useMemo(() => (result?.facts_json.questions || []).filter((question) => question.source_status.startsWith("AUTO")), [result])
  const weeklySnapshotDays = scope === "weekly" ? Number(result?.facts_json.weekly_snapshot_days || 0) : 0
  const initializeDrafts = React.useCallback(() => setDrafts(Object.fromEntries(manualQuestions.map((question) => [question.key, {
    values: savedQuestionValues(question), comment: question.source_status === "MANUAL_ANSWERED" ? question.manager_comment || "" : "", touched: false,
  }]))), [manualQuestions])
  const load = React.useCallback(async () => {
    if (!periodId) return
    try {
      const response = await apiFetch(endpoint)
      if (!response.ok) throw new Error()
      const payload = await response.json() as RealizationManagerReviewResponse
      setData(payload)
      setRating(payload.realization?.rating ?? (payload.realization ? payload.realization.marker === "POSITIVE" ? "GOOD" : "ACTION_REQUIRED" : ""))
      setComment(payload.realization?.comment ?? "")
      setFailed(false)
    } catch { setFailed(true) }
  }, [apiFetch, endpoint, periodId])
  React.useEffect(() => { queueMicrotask(() => void load()) }, [load, refreshKey])
  React.useEffect(() => { queueMicrotask(initializeDrafts) }, [initializeDrafts])
  const canEdit = Boolean(data?.can_edit && data.period_id === periodId && data.user_id === userId && !locked && periodId)
  const savedRating = data?.realization?.rating ?? (data?.realization ? data.realization.marker === "POSITIVE" ? "GOOD" : "ACTION_REQUIRED" : "")
  const savedComment = data?.realization?.comment ?? ""
  const reviewDirty = rating !== savedRating || comment !== savedComment
  const ratingLabel = savedRating ? RATINGS[savedRating] : failed ? "Gabim ngarkimi" : data ? "Pa vlerësim" : "Duke ngarkuar…"

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

  const save = async ({ closeDialog = true, saveQuestions = true }: { closeDialog?: boolean; saveQuestions?: boolean } = {}) => {
    if (!rating || !comment.trim()) return toast.error("Zgjidh vlerësimin dhe shkruaj komentin")
    setSaving(true)
    try {
      if (saveQuestions) {
        for (const question of manualQuestions) {
          const draft = drafts[question.key] || { values: [], comment: "", touched: false }
          if (scope !== "daily" && !draft.touched) continue
          const value = draft.values.includes("YES")
          const response = await apiFetch(`/realization/periods/${periodId}/results/${result!.id}/questions/${question.key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value, clear: false, comment: null, evidence_ids: [] }) })
          if (!response.ok) throw new Error(`Nuk u ruajt përgjigjja: ${question.label}`)
        }
      }
      const response = await apiFetch(`${endpoint}/REALIZATION`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, marker: ["GOOD", "VERY_GOOD"].includes(rating) ? "POSITIVE" : "NEGATIVE", comment: comment.trim() }) })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { detail?: string }
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Vlerësimi nuk u ruajt")
      }
      const payload = await response.json() as RealizationManagerReviewResponse
      setData(payload)
      setComment(payload.realization?.comment ?? comment.trim())
      if (closeDialog) setOpen(false)
      onSaved?.()
      toast.success(saveQuestions ? "Vlerësimi dhe përgjigjet u ruajtën" : "Komenti i përgjegjësit u ruajt")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Vlerësimi nuk u ruajt") }
    finally { setSaving(false) }
  }

  return <>
    <td className="p-1.5" onClick={(event) => event.stopPropagation()}><Button type="button" variant="outline" size="sm" className="h-8 w-full min-w-32 justify-between px-2 text-xs" onClick={() => void openReview()} disabled={failed}>{ratingLabel}<ChevronRight className="h-3.5 w-3.5" /></Button></td>
    <td className="p-1.5" onClick={(event) => event.stopPropagation()}>
      <div className="flex min-w-64 items-start gap-1.5">
        <Textarea aria-label={`Komenti i përgjegjësit për ${userName}`} className="min-h-14 min-w-52 resize-y bg-white text-xs" rows={2} maxLength={4000} value={comment} disabled={!canEdit || saving} onChange={(event) => setComment(event.target.value)} placeholder="Shkruaj komentin e përgjegjësit…" />
        {canEdit && reviewDirty ? <Button type="button" size="sm" className="h-8 shrink-0 px-2" disabled={saving || !rating || !comment.trim()} title={!rating ? "Zgjidh fillimisht vlerësimin" : "Ruaj komentin"} onClick={() => void save({ closeDialog: false, saveQuestions: false })}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ruaj"}</Button> : null}
      </div>
      {comment !== savedComment && !rating ? <p className="mt-1 text-[10px] text-amber-700">Zgjidh vlerësimin para ruajtjes.</p> : data?.realization ? <p className="mt-1 text-[10px] text-slate-400">{data.realization.created_by_name} · {new Date(data.realization.created_at).toLocaleDateString("sq-AL")}</p> : null}
    </td>
    <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next) }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader><DialogTitle>Vlerësimi {scope === "daily" ? "ditor" : "javor"} — {userName}</DialogTitle><DialogDescription>{scope === "daily" ? "Zgjidh vlerësimin dhe pikat që vlejnë sot. Përgjigjet ruhen në ditor dhe mblidhen automatikisht në javë." : "Zgjidh vlerësimin dhe pikat që vlejnë për këtë person. Përgjigjet ditore shfaqen si bazë dhe mund të konfirmohen ose ndryshohen këtu."}</DialogDescription></DialogHeader>
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-[11px] font-bold uppercase tracking-wide text-slate-600">Vlerësimi i përgjegjësit</p>
          <div className="flex flex-wrap gap-1.5">
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
          className="mt-2 min-h-14 resize-y bg-white text-xs"
          rows={2}
          value={comment}
          disabled={!canEdit || saving}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Përmbledhja e vlerësimit të përgjegjësit…"
          maxLength={4000}
        />
      </section>
      {automaticQuestions.length ? (
        <details className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">
            {automaticQuestions.length} përgjigje automatike nga sistemi
            {scope === "weekly" ? ` · Totali i ${weeklySnapshotDays} ditëve` : ""}
          </summary>
          <div className="border-t border-slate-200">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <span>Pyetja</span>
              <span>Përgjigjja</span>
            </div>
            {automaticQuestions.map((question) => (
              <div key={question.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-slate-200 px-3 py-2 text-xs last:border-b-0">
                <p className="font-medium text-slate-800">{question.label}</p>
                <p className="break-words text-slate-600">{automaticValue(question.final_value ?? question.auto_value)}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {result ? (
        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-800">Checklist-a</p>
              <p className="text-xs text-slate-500">Pa tick = Jo. Vendos tick vetëm kur përgjigjja është Po.</p>
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
                question={question}
                label={scope === "daily" ? dailyChecklistLabels[question.key] || question.label : question.label}
                draft={drafts[question.key] || { values: [], comment: "", touched: false }}
                disabled={!canEdit || saving}
                onChange={(next) => setDrafts((current) => ({ ...current, [question.key]: next }))}
              />
            ))}
          </div>
        </section>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
          <span>{preparing ? "Duke përgatitur checklistën për këtë person…" : "Checklist-a nuk është përgatitur ende për këtë person."}</span>
          {preparing ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : onPrepareResult ? <Button type="button" size="sm" variant="outline" onClick={() => void openReview()}>Provo përsëri</Button> : null}
        </div>
      )}
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={saving || preparing}>Mbyll</Button>{canEdit ? <Button onClick={() => void save()} disabled={saving || preparing || Boolean(onPrepareResult && !result) || !rating || !comment.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Ruaj vlerësimin</Button> : null}</DialogFooter>
    </DialogContent></Dialog>
  </>
}
