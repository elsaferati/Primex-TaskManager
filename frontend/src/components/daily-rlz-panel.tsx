"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, Save } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth"
import type { DailyReportResponse } from "@/lib/types"

export const DAILY_RLZ_REASONS = [
  ["TOOK_LONGER", "Mori më shumë kohë"],
  ["OTHER_URGENCY", "Urgjencë tjetër"],
  ["WAITING_CLIENT", "Në pritje të klientit"],
  ["PRIORITY_CHANGE", "Ndryshim prioriteti"],
  ["TECHNICAL_PROBLEM", "Problem teknik"],
  ["MISSING_INFORMATION", "Mungesë informacioni"],
  ["REQUEST_CHANGE", "Ndryshim kërkese"],
  ["NEW_REQUESTS", "Kerkesa te reja"],
  ["ABSENCE", "Mungesë"],
  ["OTHER", "Tjetër"],
] as const

const DAILY_RLZ_EMPTY_REASON = "__EMPTY__"
const pendingDailyRlzSaves = new Set<Promise<void>>()

function trackDailyRlzSave(operation: Promise<void>) {
  pendingDailyRlzSaves.add(operation)
  void operation.finally(() => pendingDailyRlzSaves.delete(operation))
  return operation
}

async function waitForPendingDailyRlzSaves() {
  while (pendingDailyRlzSaves.size) {
    await Promise.allSettled([...pendingDailyRlzSaves])
  }
}

export type DailyRlzTaskState = NonNullable<DailyReportResponse["tasks_today"][number]["rlz_daily_state"]>
type Blocker = { task_id: string; title: string; status: string; minimum_due_date?: string | null;
  issues: Array<{ code: string; message: string }> }

function blockerTitle(title: string) {
  return title.split(/\r?\n/).map(line => line.trim()).find(Boolean) || title
}

export function dailyRlzStateByTask(report: DailyReportResponse | null) {
  const map = new Map<string, DailyRlzTaskState>()
  for (const item of [...(report?.tasks_today || []), ...(report?.tasks_overdue || [])]) {
    if (item.rlz_daily_state) map.set(item.task.id, item.rlz_daily_state)
  }
  for (const item of [...(report?.system_today || []), ...(report?.system_overdue || [])]) {
    if (item.rlz_daily_state) map.set(item.task.id, item.rlz_daily_state)
  }
  return map
}

export function DailyRlzReasonCell({ taskId, day, state, onSaved }: {
  taskId?: string | null
  day: string
  state?: DailyRlzTaskState | null
  onSaved: () => Promise<void> | void
}) {
  const { apiFetch } = useAuth()
  const [saving, setSaving] = React.useState(false)
  if (!taskId) return <span>—</span>
  return <Select value={state?.reason_code || ""} disabled={!state?.is_editable || saving}
    onValueChange={async reasonCode => {
      setSaving(true)
      try {
        const response = await apiFetch(`/reports/daily-rlz-state/${taskId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            day,
            reason_code: reasonCode === DAILY_RLZ_EMPTY_REASON ? null : reasonCode,
            // Preserve whatever comment was already saved for this day — never wipe it
            // just because the reason dropdown changed.
            comment: state?.comment ?? null,
          }),
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload?.detail?.message || payload?.detail || "Arsyeja nuk u ruajt")
        }
        await onSaved()
      } catch (error) { toast.error(error instanceof Error ? error.message : "Arsyeja nuk u ruajt") }
      finally { setSaving(false) }
    }}>
    <SelectTrigger className="h-7 min-w-[150px] bg-white text-[11px]"><SelectValue placeholder="Zgjidh arsyen"/></SelectTrigger>
    <SelectContent>
      <SelectItem value={DAILY_RLZ_EMPTY_REASON}>Empty</SelectItem>
      {DAILY_RLZ_REASONS.map(([code,label]) => <SelectItem key={code} value={code}>{label}</SelectItem>)}
    </SelectContent>
  </Select>
}

// Day-scoped comment field for the RLZ Daily Report table. Writes into the same
// TaskDailyRlzState row as DailyRlzReasonCell (via /reports/daily-rlz-state/{taskId}),
// so the comment is actually part of the daily RLZ evidence instead of overwriting the
// task's single, non-dated Task.comment field.
export function DailyRlzCommentField({ taskId, day, state, onSaved }: {
  taskId?: string | null
  day: string
  state?: DailyRlzTaskState | null
  onSaved: () => Promise<void> | void
}) {
  const { apiFetch } = useAuth()
  const [value, setValue] = React.useState(state?.comment ?? "")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => { setValue(state?.comment ?? "") }, [state?.comment, taskId])

  if (!taskId) return <span>—</span>

  const save = async () => {
    const trimmed = value.trim()
    if (trimmed === (state?.comment ?? "").trim()) return
    setSaving(true)
    try {
      const response = await apiFetch(`/reports/daily-rlz-state/${taskId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day,
          reason_code: state?.reason_code || null,
          comment: trimmed || null,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.detail?.message || payload?.detail || "Komenti nuk u ruajt")
      }
      await onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Komenti nuk u ruajt")
      setValue(state?.comment ?? "")
    } finally { setSaving(false) }
  }

  return <div className="flex items-center gap-2">
    <input type="text" aria-label="Koment" className="h-4 w-full border-b border-slate-300 bg-transparent"
      value={value} disabled={!state?.is_editable || saving}
      onChange={e => setValue(e.target.value)}
      onBlur={() => void trackDailyRlzSave(save())} />
    <button type="button" className="print:hidden text-[10px] font-semibold uppercase text-slate-500 hover:text-slate-700 disabled:text-slate-300"
      disabled={!state?.is_editable || saving} onClick={() => void trackDailyRlzSave(save())}>
      {saving ? "Saving" : "Save"}
    </button>
  </div>
}

export function DailyRlzSaveButton({ day, report, onSaved }: {
  day: string
  report: DailyReportResponse | null
  onSaved: () => Promise<void> | void
}) {
  const { apiFetch, user } = useAuth()
  const [saving, setSaving] = React.useState(false)
  const [blockers, setBlockers] = React.useState<Blocker[]>([])
  const state = report?.rlz_close_state

  const save = async () => {
    if (!user?.id || !user.department_id) return
    setSaving(true)
    try {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      await waitForPendingDailyRlzSaves()
      const checkResponse = await apiFetch(`/reports/daily-rlz-compliance?day=${day}`)
      const check = await checkResponse.json().catch(() => ({}))
      if (!checkResponse.ok || check.blockers?.length) {
        setBlockers(check.blockers || check.detail?.blockers || [])
        return
      }
      const dailyResponse = await apiFetch(`/realization/daily?department_id=${user.department_id}&day=${day}`)
      if (!dailyResponse.ok) throw new Error("Realization Daily nuk është gati")
      const daily = await dailyResponse.json()
      const person = daily.people?.find((entry: { user_id: string }) => entry.user_id === user.id)
      if (!person) throw new Error("Rezultati yt ditor i Realization nuk u gjet")
      const response = await apiFetch(`/realization/periods/${daily.period.id}/results/${person.id}/close-day`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daily_comment: "Daily Report My View", confirmed_pulse: person.facts_json?.pulse?.pulse || null }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (payload?.detail?.code === "RLZ_DAILY_REPORT_VALIDATION_FAILED") {
          setBlockers(payload.detail.blockers || [])
          return
        }
        throw new Error(payload?.detail?.message || payload?.detail || "Gjendja nuk u ruajt")
      }
      toast.success("Ruajtur për RLZ")
      await onSaved()
    } catch (error) { toast.error(error instanceof Error ? error.message : "Gjendja nuk u ruajt") }
    finally { setSaving(false) }
  }

  return <>
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2 print:hidden">
      {state?.status === "SAVED" ? <span className="text-xs font-medium text-emerald-700"><CheckCircle2 className="mr-1 inline h-4 w-4"/>Ruajtur për RLZ</span> : null}
      {state?.status === "STALE" ? <span className="max-w-[310px] text-xs font-medium text-amber-700"><AlertTriangle className="mr-1 inline h-4 w-4"/>Ka ndryshime pas ruajtjes. Ruaje përsëri për RLZ.</span> : null}
      <Button type="button" className="h-8 bg-blue-600 px-3 text-xs hover:bg-blue-700" onClick={() => void save()}
        disabled={saving || !state?.is_editable}>
        <Save className="mr-1 h-4 w-4"/>{saving ? "Duke ruajtur..." : "Ruaj gjendjen për RLZ"}
      </Button>
    </div>
    <Dialog open={blockers.length > 0} onOpenChange={open => { if (!open) setBlockers([]) }}><DialogContent>
      <DialogHeader><DialogTitle>Nuk mund ta ruash gjendjen për RLZ</DialogTitle></DialogHeader>
      <p className="text-sm">Plotëso pikat e mëposhtme para se të vazhdosh.</p>
      <div className="max-h-[55vh] space-y-3 overflow-y-auto">{blockers.map(blocker => <div key={blocker.task_id} className="rounded border border-red-200 bg-red-50 p-3">
        <p className="font-semibold">{blockerTitle(blocker.title)}</p><ul className="mt-1 list-disc pl-5 text-sm">{blocker.issues.map(issue => <li key={issue.code}>{issue.message}{issue.code === "DUE_DATE_NOT_MOVED" && blocker.minimum_due_date ? ` · Shtyje në ${blocker.minimum_due_date} ose më vonë` : ""}</li>)}</ul>
      </div>)}</div>
    </DialogContent></Dialog>
  </>
}
