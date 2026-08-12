"use client"

import * as React from "react"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, Clock3, Save } from "lucide-react"

import { useAuth } from "@/lib/auth"
import type { DailyReportResponse, DailyReportTaskItem } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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

type Blocker = { task_id: string; title: string; status: string; due_date?: string | null;
  minimum_due_date?: string | null; issues: Array<{ code: string; message: string }> }

function localDay() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tirane", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}

function allTasks(report: DailyReportResponse | null) {
  const seen = new Set<string>()
  return [...(report?.tasks_today || []), ...(report?.tasks_overdue || [])].filter(item => {
    if (seen.has(item.task.id)) return false
    seen.add(item.task.id)
    return true
  })
}

export function DailyRlzPanel() {
  const { user, apiFetch } = useAuth()
  const [report, setReport] = React.useState<DailyReportResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [blockers, setBlockers] = React.useState<Blocker[]>([])
  const day = React.useMemo(() => localDay(), [])

  const load = React.useCallback(async () => {
    if (!user?.id || user.role !== "STAFF") return
    setLoading(true)
    try {
      const response = await apiFetch(`/reports/daily?day=${day}&user_id=${user.id}`)
      if (!response.ok) throw new Error("Daily Report nuk u ngarkua")
      setReport(await response.json())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Daily Report nuk u ngarkua")
    } finally { setLoading(false) }
  }, [apiFetch, day, user])

  React.useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  const persist = React.useCallback(async (item: DailyReportTaskItem, values: { reason_code?: string | null; comment?: string | null }) => {
    const current = item.rlz_daily_state
    const response = await apiFetch(`/reports/daily-rlz-state/${item.task.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, reason_code: values.reason_code ?? current?.reason_code ?? null,
        comment: values.comment ?? current?.comment ?? null }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload?.detail?.message || payload?.detail || "Ndryshimi nuk u ruajt")
    }
    await load()
  }, [apiFetch, day, load])

  const close = React.useCallback(async () => {
    if (!user?.department_id) return
    setSaving(true)
    try {
      const check = await apiFetch(`/reports/daily-rlz-compliance?day=${day}`)
      const compliance = await check.json()
      if (!check.ok || compliance.blockers?.length) {
        setBlockers(compliance.blockers || compliance.detail?.blockers || [])
        return
      }
      const dailyResponse = await apiFetch(`/realization/daily?department_id=${user.department_id}&day=${day}`)
      if (!dailyResponse.ok) throw new Error("Realization Daily nuk është gati")
      const daily = await dailyResponse.json()
      const person = daily.people?.find((entry: { user_id: string }) => entry.user_id === user.id)
      if (!person) throw new Error("Rezultati yt ditor i Realization nuk u gjet")
      const pulse = person.facts_json?.pulse?.pulse
      const response = await apiFetch(`/realization/periods/${daily.period.id}/results/${person.id}/close-day`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daily_comment: "Daily Report My View", confirmed_pulse: pulse || null }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        if (payload?.detail?.code === "RLZ_DAILY_REPORT_VALIDATION_FAILED") {
          setBlockers(payload.detail.blockers || [])
          return
        }
        throw new Error(payload?.detail?.message || payload?.detail || "Gjendja nuk u ruajt")
      }
      toast.success("Ruajtur për RLZ javor")
      await load()
    } catch (error) { toast.error(error instanceof Error ? error.message : "Gjendja nuk u ruajt") }
    finally { setSaving(false) }
  }, [apiFetch, day, load, user])

  if (user?.role !== "STAFF") return null
  const tasks = allTasks(report)
  const state = report?.rlz_close_state
  return (
    <section className="my-4 rounded-xl border border-slate-300 bg-white p-4 print:border-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold">Daily Report · RLZ javor</h2>
          <p className="text-xs text-slate-500">Arsyeja dhe komenti mund të ndryshohen deri në 17:00 Europe/Tirane.</p></div>
        <div className="flex items-center gap-2">
          {state?.status === "SAVED" ? <span className="text-sm text-emerald-700"><CheckCircle2 className="mr-1 inline h-4 w-4"/>Ruajtur për RLZ javor</span> : null}
          {state?.status === "STALE" ? <span className="text-sm text-amber-700"><AlertTriangle className="mr-1 inline h-4 w-4"/>Ke ndryshime pas ruajtjes. Ruaje përsëri gjendjen për RLZ javor.</span> : null}
          {state?.status === "CLOSED_EDIT_WINDOW" ? <span className="text-sm text-slate-600"><Clock3 className="mr-1 inline h-4 w-4"/>Dritarja e editimit është mbyllur</span> : null}
          <Button onClick={() => void close()} disabled={loading || saving || !state?.is_editable}>
            <Save className="mr-2 h-4 w-4"/>Ruaj gjendjen për RLZ javor
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] table-fixed border-collapse text-xs">
        <colgroup><col className="w-8"/><col className="w-[260px]"/><col className="w-24"/><col className="w-24"/><col className="w-20"/><col className="w-[190px]"/><col className="w-[220px]"/></colgroup>
        <thead><tr>{["NR","TITULLI","STATUSI","DEADLINE","1H SLOT","ARSYEJA","KOMENT"].map(label => <th key={label} className="border bg-slate-50 p-2 text-left">{label}</th>)}</tr></thead>
        <tbody>{tasks.map((item, index) => {
          const editable = Boolean(item.rlz_daily_state?.is_editable)
          return <tr key={item.task.id} className="has-[select:invalid]:bg-red-50">
            <td className="border p-2">{index + 1}</td><td className="border p-2 whitespace-pre-wrap break-words">{item.task.title}</td>
            <td className="border p-2">{item.task.status}</td><td className="border p-2">{item.task.due_date?.slice(0,10) || "—"}</td>
            <td className="border p-2">{item.task.one_h_report_slot || "—"}</td>
            <td className="border p-2"><Select value={item.rlz_daily_state?.reason_code || ""} disabled={!editable}
              onValueChange={value => void persist(item, { reason_code: value }).catch(error => toast.error(error.message))}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Zgjidh"/></SelectTrigger><SelectContent>
                {DAILY_RLZ_REASONS.map(([code,label]) => <SelectItem key={code} value={code}>{label}</SelectItem>)}
              </SelectContent></Select></td>
            <td className="border p-2"><textarea className="min-h-8 w-full resize-y rounded border p-1 disabled:bg-slate-100" disabled={!editable}
              defaultValue={item.rlz_daily_state?.comment || ""} key={`${item.task.id}:${item.rlz_daily_state?.updated_at || ""}`}
              onBlur={event => void persist(item, { comment: event.currentTarget.value }).catch(error => toast.error(error.message))}/></td>
          </tr>})}</tbody>
      </table></div>
      <Dialog open={blockers.length > 0} onOpenChange={open => { if (!open) setBlockers([]) }}><DialogContent>
        <DialogHeader><DialogTitle>Nuk mund ta ruash gjendjen për RLZ javor</DialogTitle></DialogHeader>
        <p className="text-sm">Plotëso pikat e mëposhtme para se të vazhdosh.</p>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto">{blockers.map(blocker => <div key={blocker.task_id} className="rounded border border-red-200 bg-red-50 p-3">
          <p className="font-semibold">{blocker.title}</p><ul className="mt-1 list-disc pl-5 text-sm">{blocker.issues.map(issue => <li key={issue.code}>{issue.message}{issue.code === "DUE_DATE_NOT_MOVED" && blocker.minimum_due_date ? ` · Shtyje në ${blocker.minimum_due_date} ose më vonë` : ""}</li>)}</ul>
        </div>)}</div>
      </DialogContent></Dialog>
    </section>
  )
}
