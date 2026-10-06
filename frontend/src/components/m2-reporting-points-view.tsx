"use client"

import * as React from "react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { reportDate, type TaskRow } from "@/components/m3-reporting-points-view"

export { reportDate, reportTime } from "@/components/m3-reporting-points-view"
export const MANUAL_POINTS = { reorganization: "1. RIORGANIZIM? (PARA PAUZES)- PAS PAUZES ,TAKIM INT, NDARJE E DET?" } as const
export type ManualKey = "reorganization" | `delivery:${string}` | `delivery_choice:${string}` | `postponed_comment:${string}`
export type ManualAnswers = Partial<Record<ManualKey, string>>
export type ReportingPointsReport = {
  id: string; report_date: string; subject: string; status: string
  manual_answers: ManualAnswers; data: { postponed?: TaskRow[]; delivery?: TaskRow[] }
  generated_at: string | null; sent_at: string | null; last_error: string | null
}

function text(row: TaskRow, key: keyof TaskRow) { return String(row[key] ?? "—") }
function dateChange(row: TaskRow, old: boolean) {
  if (row.postponement_kind === "start_due") {
    return `START: ${reportDate(old ? row.old_start_date : row.start_date)}\nDUE: ${reportDate(old ? row.old_due_date : row.due_date)}`
  }
  return reportDate(row.postponement_kind === "start" ? old ? row.old_start_date : row.start_date : old ? row.old_due_date : row.due_date)
}

export function M2ReportingPointsView({ report, answers, disabled, onAnswerChange }: {
  report: ReportingPointsReport; answers: ManualAnswers; disabled: boolean
  onAnswerChange: (key: ManualKey, value: string) => void
}) {
  const deliveryRows = report.data.delivery || []
  const deliveredCount = deliveryRows.filter((row) => answers[`delivery_choice:${row.task_id}`] === "PO").length
  const common: [keyof TaskRow, string][] = [["assignees", "KUSH"], ["department", "DEP"], ["project", "PRJK"], ["am_pm", "AM/PM"], ["task_type", "LLOJI"]]
  const renderTable = (rows: TaskRow[], delivery: boolean) => <div className="overflow-x-auto border">
    <table className="w-full min-w-[1150px] border-collapse text-xs">
      <thead className="bg-slate-100"><tr>
        {["NR", ...common.map(([, title]) => title), ...(delivery ? ["SIMBOLI", "TITULLI", "PO/JO", "PËRGJIGJJA MANUALE"] : ["NGA", "NË", "TITULLI / SIMBOLI", "VLERËSIMI", "KOMENT MANUAL"])].map((title, columnIndex) => <th key={title} className={`border py-2 text-left ${delivery && (columnIndex === 6 || columnIndex === 8) ? "px-1" : "px-2"}${(delivery ? columnIndex < 7 || columnIndex === 8 : columnIndex < 8) ? " w-px whitespace-nowrap" : ""}`}>{title}</th>)}
      </tr></thead>
      <tbody>{rows.map((row, index) => {
        const key: ManualKey = `delivery:${row.task_id}`
        const choiceKey: ManualKey = `delivery_choice:${row.task_id}`
        const commentKey: ManualKey = `postponed_comment:${row.task_id}`
        const colors: Record<string, string> = { TODO: "#FFC4ED", IN_PROGRESS: "#FFFF00", DONE: "#C4FDC4", WAITING_CLIENT: "#E2C15B", WAITING_CONFIRMATION: "#FFEDD5" }
        return <tr key={row.task_id} style={{ background: row.deadline_important ? "#dc2626" : colors[row.status] || "white", color: row.deadline_important ? "white" : "black" }}>
          <td className="w-px whitespace-nowrap border p-2 align-top">{index + 1}</td>
          {common.map(([field]) => <td key={field} className="w-px whitespace-nowrap border p-2 align-top">{text(row, field)}</td>)}
          {!delivery ? <><td className="w-px whitespace-pre border p-2 align-top">{dateChange(row, true)}</td><td className="w-px whitespace-pre border p-2 align-top">{dateChange(row, false)}</td></> : null}
          {delivery ? <td className="w-px whitespace-nowrap border px-1 py-2 align-top font-bold">{row.marker || "—"}</td> : null}
          <td className="min-w-[280px] border p-2 align-top">{!delivery ? <strong className="mr-1">{row.marker}</strong> : null}{row.title}</td>
          {delivery ? <><td className="w-px whitespace-nowrap border px-1 py-2 align-top">
            <select aria-label={`PO/JO për ${row.title}`} value={answers[choiceKey] || ""} disabled={disabled}
              className={`w-14 rounded border px-1 py-2 ${answers[choiceKey] === "PO" ? "border-green-700 bg-green-600 font-bold text-white" : answers[choiceKey] === "JO" ? "border-red-800 bg-red-600 font-bold text-white" : "bg-white text-black"}`} onChange={(event) => onAnswerChange(choiceKey, event.target.value)}>
              <option value="">—</option><option value="PO">PO</option><option value="JO">JO</option>
            </select>
          </td><td className="min-w-[240px] border p-2 align-top">
            <Textarea aria-label={`Përgjigjja manuale për ${row.title}`} value={answers[key] || ""} disabled={disabled} maxLength={10000}
              className="min-h-20 bg-white text-black" placeholder="A është dorëzuar? Shëno përgjigjjen." onChange={(event) => onAnswerChange(key, event.target.value)} />
          </td></> : <><td className="border p-2 align-top font-bold" style={{ background: row.risk === "RREZIK" ? "#fee2e2" : "#dcfce7", color: row.risk === "RREZIK" ? "#7f1d1d" : "#14532d" }}>{row.risk}</td><td className="min-w-[240px] border p-2 align-top">
            <Textarea aria-label={`Koment manual për ${row.title}`} value={answers[commentKey] || ""} disabled={disabled} maxLength={10000}
              className="min-h-20 bg-white text-black" placeholder="Shëno komentin." onChange={(event) => onAnswerChange(commentKey, event.target.value)} />
          </td></>}
        </tr>
      })}</tbody>
    </table>
    {!rows.length ? <p className="p-5 text-sm text-muted-foreground">Asnjë detyrë.</p> : null}
  </div>

  return <div className="space-y-7">
    <section className="space-y-3" aria-labelledby="m2-reorganization"><Label id="m2-reorganization" htmlFor="reorganization" className="text-lg font-bold">{MANUAL_POINTS.reorganization}</Label>
      <Textarea id="reorganization" value={answers.reorganization || ""} disabled={disabled} maxLength={10000} className="min-h-28" placeholder="Shëno përgjigjjen për riorganizimin." onChange={(event) => onAnswerChange("reorganization", event.target.value)} />
    </section>
    <section className="space-y-3" aria-labelledby="m2-postponed"><h2 id="m2-postponed" className="text-lg font-bold">2. A KA DET QË SHTYHEN (SOT/SOT) OSE DEADLINE?</h2>
      <p className="text-sm text-muted-foreground">Shtyrjet e bëra sot për detyrat Deadline Important ose të krijuara, filluara dhe planifikuara për sot.</p>
      <p className="text-sm font-bold">Shtyrjet e bëra gjatë ditës. <span className="rounded bg-green-100 px-1 py-0.5 text-green-900">Brenda javës: OK.</span>{" "}<span className="rounded bg-red-100 px-1 py-0.5 text-red-900">Për të premten ose javën tjetër: RREZIK.</span></p>
      {[["start_due", "SHTYRË START DHE DUE DATE"], ["due", "SHTYRË DUE DATE"], ["start", "SHTYRË START DATE"]].map(([kind, title]) => <div key={kind} className="space-y-2"><h3 className="text-sm font-semibold">{title}</h3>{renderTable((report.data.postponed || []).filter((row) => row.postponement_kind === kind), false)}</div>)}
    </section>
    <section className="space-y-3" aria-labelledby="m2-delivery"><div className="flex flex-wrap items-center gap-3"><h2 id="m2-delivery" className="text-lg font-bold">3. A JANË DORËZUAR TË GJITHA ÇKA ËSHTË DASHUR M2?</h2>
      <span className="inline-flex items-center gap-2 rounded bg-slate-100 px-2 py-1 text-sm font-bold text-slate-900" aria-live="polite">TOTALI/DËRGUAR: <span className="text-2xl font-extrabold tabular-nums">{deliveryRows.length}/{deliveredCount}</span></span></div>
      <p className="text-sm text-muted-foreground">Detyrat me simbolet M2 dhe M2/3, kur data e raportit është brenda intervalit start–due. Përgjigju për secilën detyrë në kolonën e fundit.</p>
      {renderTable(deliveryRows, true)}
    </section>
  </div>
}
