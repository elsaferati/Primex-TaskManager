"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export const MANUAL_POINTS = {
  underload: "1. NËNNGARKESË",
  overload: "2. MBINGARKESË",
  reorganization: "3. RIORGANIZIM? (PARA PAUZËS) - PAS PAUZËS, TAKIM INT, NDARJE E DET?",
  ga_reorganization: "1. A KA NEVOJË PËR RIORGANIZIM?",
} as const

export type ManualKey = keyof typeof MANUAL_POINTS
export type ManualAnswers = Partial<Record<ManualKey, string>>
export type TaskRow = {
  task_id: string
  title: string
  assignees: string
  department: string
  project: string
  status: string
  progress: number
  created_date?: string | null
  start_date?: string | null
  due_date?: string | null
  old_start_date?: string | null
  old_due_date?: string | null
  comment?: string
  reason?: string
  risk?: "OK" | "RREZIK"
  category?: string
  completed_today?: number
  completed_value?: number | null
  total_value?: number | null
}

export type ReportingPointsReport = {
  id: string
  report_date: string
  subject: string
  status: string
  manual_answers: ManualAnswers
  data: Partial<Record<"postponed" | "untouched" | "same_day" | "ga_postponed", TaskRow[]>>
  realization: {
    percent: number | null
    employees: number
    comment: string
    baseline_available: boolean
    people: { user_id: string; name: string; percent: number | null }[]
  } | null
  realization_captured_at: string | null
  generated_at: string | null
  sent_at: string | null
  last_error: string | null
}

export function reportDate(value?: string | null) {
  if (!value) return "—"
  const [year, month, day] = value.slice(0, 10).split("-")
  return `${day}.${month}.${year}`
}

export function reportTime(value?: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("sq-AL", { timeZone: "Europe/Tirane", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

function Status({ value }: { value: string }) {
  const colors = value === "DONE" ? "bg-green-100 text-green-900" : value === "TODO" ? "bg-pink-100 text-pink-900" : value === "IN_PROGRESS" ? "bg-yellow-100 text-yellow-900" : "bg-slate-100 text-slate-900"
  return <Badge className={`border-0 ${colors}`}>{value}</Badge>
}

export function ReportingTaskTable({ rows, kind }: { rows: TaskRow[]; kind: "postponed" | "untouched" | "same_day" | "ga_postponed" }) {
  const moved = kind === "postponed" || kind === "ga_postponed"
  if (!rows.length) return <p className="px-5 py-6 text-sm text-muted-foreground">Asnjë detyrë për këtë pikë.</p>
  const th = "whitespace-nowrap border-b px-3 py-3 text-left text-xs font-semibold"
  const td = "border-b px-3 py-3 align-top text-sm"
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" aria-label={kind === "untouched" ? "Të gjitha detyrat TODO" : kind === "same_day" ? "Detyrat sot për sot" : "Detyrat e shtyra"}>
        <thead className="bg-muted/50"><tr>
          <th className={th}>Detyra</th><th className={th}>Personi</th><th className={th}>Departamenti / Projekti</th>
          <th className={th}>Statusi</th><th className={th}>Progresi</th>
          {moved ? <><th className={th}>Start para → pas</th><th className={th}>Due para → pas</th><th className={th}>Arsyeja</th><th className={th}>Komenti i user-it</th><th className={th}>Vlerësimi</th></> : null}
          {kind === "same_day" ? <><th className={th}>Creation / Start / Due</th><th className={th}>Progresi sot</th></> : null}
          {kind === "ga_postponed" ? <th className={th}>Lloji</th> : null}
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.task_id}>
          <td className={`${td} min-w-64 max-w-md whitespace-pre-wrap break-words font-medium`}>{row.title}</td>
          <td className={`${td} min-w-40`}>{row.assignees}</td>
          <td className={`${td} min-w-40`}><div>{row.department}</div><div className="mt-1 text-xs text-muted-foreground">{row.project}</div></td>
          <td className={td}><Status value={row.status} /></td><td className={td}>{row.progress}%</td>
          {moved ? <>
            <td className={`${td} whitespace-nowrap`}>{reportDate(row.old_start_date)}<br />→ {reportDate(row.start_date)}</td>
            <td className={`${td} whitespace-nowrap`}>{reportDate(row.old_due_date)}<br />→ {reportDate(row.due_date)}</td>
            <td className={`${td} min-w-36 whitespace-pre-wrap`}>{row.reason || "—"}</td>
            <td className={`${td} min-w-60 max-w-md whitespace-pre-wrap break-words`}>{row.comment || "Pa koment"}</td>
            <td className={`${td} font-bold ${row.risk === "RREZIK" ? "bg-red-100 text-red-900" : "bg-green-100 text-green-900"}`}>{row.risk}</td>
          </> : null}
          {kind === "same_day" ? <>
            <td className={`${td} whitespace-nowrap`}>{reportDate(row.created_date)}<br />{reportDate(row.start_date)}<br />{reportDate(row.due_date)}</td>
            <td className={td}>{row.completed_today ?? 0}{row.total_value ? <div className="mt-1 text-xs text-muted-foreground">{row.completed_value ?? 0} / {row.total_value} gjithsej</div> : null}</td>
          </> : null}
          {kind === "ga_postponed" ? <td className={`${td} whitespace-nowrap`}>{row.category}</td> : null}
        </tr>)}</tbody>
      </table>
    </div>
  )
}

function Point({ title, note, rows, kind }: { title: string; note: string; rows: TaskRow[]; kind: Parameters<typeof ReportingTaskTable>[0]["kind"] }) {
  return <section className="overflow-hidden rounded-xl border bg-card">
    <div className="border-b px-5 py-4"><div className="flex items-center gap-3"><h3 className="font-semibold">{title}</h3><Badge variant="secondary">{rows.length}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{note}</p></div>
    <ReportingTaskTable rows={rows} kind={kind} />
  </section>
}

export function M3ReportingPointsView({ report, answers, onAnswerChange, disabled = false }: {
  report: ReportingPointsReport
  answers: ManualAnswers
  onAnswerChange: (key: ManualKey, value: string) => void
  disabled?: boolean
}) {
  const data = report.data
  const realization = report.realization
  const manual = (key: ManualKey) => <div key={key} className="space-y-2">
    <Label htmlFor={`point-${key}`} className="text-sm leading-6">{MANUAL_POINTS[key]}</Label>
    <Textarea id={`point-${key}`} value={answers[key] || ""} onChange={(event) => onAnswerChange(key, event.target.value)}
      placeholder="Shkruaj përgjigjen…" disabled={disabled} maxLength={10000} autoResize className="min-h-24" />
  </div>
  return <div className="space-y-10">
    <section className="space-y-5" aria-labelledby="m3-points-title">
      <div><h2 id="m3-points-title" className="text-xl font-bold">PIKAT PËR RAPORTIM M3</h2><p className="mt-1 text-sm text-muted-foreground">Përgjigjet manuale dhe gjendja e detyrave për {reportDate(report.report_date)}.</p></div>
      <div className="grid gap-5 rounded-xl border bg-card p-5 md:grid-cols-2">
        {manual("underload")}{manual("overload")}<div className="md:col-span-2">{manual("reorganization")}</div>
      </div>
      <Point title="1. DET QË JANË SHTY NGA KJO JAVË NË JAVËN TJETËR / BRENDA JAVËS" note="Shtyrjet e bëra gjatë ditës. Brenda javës: OK. Për të premten ose javën tjetër: RREZIK." rows={data.postponed || []} kind="postponed" />
      <Point title="2. PSE PA PREK TËRË DITËN?" note="Të gjitha detyrat TODO llogariten të paprekura." rows={data.untouched || []} kind="untouched" />
      <Point title="3. SOT PËR SOT — PROGRESI?" note="Creation Date, Start Date dhe Due Date janë të tria në datën e këtij raporti." rows={data.same_day || []} kind="same_day" />
      <section className="rounded-xl border bg-card p-5" aria-labelledby="m3-realization-title">
        <h3 id="m3-realization-title" className="font-semibold">4. REALIZIMI — A MBËRRIHET?</h3>
        <p className="mt-1 text-xs text-muted-foreground">Realizimi ditor i gjithë stafit, i ruajtur në 16:15.</p>
        {realization ? <div className="mt-5 flex flex-wrap items-center gap-5">
          <div className={`rounded-xl px-5 py-3 text-3xl font-bold ${realization.percent == null ? "bg-muted" : realization.percent < 50 ? "bg-red-100 text-red-900" : "bg-green-100 text-green-900"}`}>
            {realization.percent == null ? "Pa të dhëna" : `${realization.percent}%`}
          </div>
          <div><p className="font-medium">{realization.comment}</p><p className="mt-1 text-xs text-muted-foreground">{realization.employees} persona · Marrë në {reportTime(report.realization_captured_at)}</p></div>
        </div> : <p className="mt-5 rounded-lg bg-muted px-4 py-3 text-sm">Nuk ka ende një vlerë të ruajtur për orën 16:15 të kësaj date.</p>}
      </section>
    </section>
    <section className="space-y-5" aria-labelledby="ga-points-title">
      <h2 id="ga-points-title" className="text-xl font-bold">PIKAT PËR RAPORTIM PËR GA</h2>
      <div className="rounded-xl border bg-card p-5">{manual("ga_reorganization")}</div>
      <Point title="1. A KA DET QË SHTYHET (SOT/SOT) OSE DEADLINE?" note="Detyrat e shtyra me Deadline Important, ose që para shtyrjes kishin Creation, Start dhe Due Date në datën e raportit." rows={data.ga_postponed || []} kind="ga_postponed" />
    </section>
  </div>
}
