"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { parseMarkedNoteContent } from "@/lib/note-markup"
import type { RealizationPersonResult, RealizationTaskFact } from "@/lib/types"

export function weeklyPostponements(result: RealizationPersonResult) {
  const entries = new Map<string, { task: RealizationTaskFact; event: NonNullable<RealizationTaskFact["timeline"]>[number]; date: string }>()
  for (const day of [...(result.facts_json.daily_timeline || [])].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const task of day.tasks || []) {
      const event = [...(task.timeline || [])].reverse().find(item => item.type === "POSTPONED" || item.type === "POSTPONED_AGAIN")
      if (!task.task_id || !event || !task.adjustment_status) continue
      entries.set(task.task_id, { task, event, date: day.date })
    }
  }
  return [...entries.values()]
}

export function RealizationWeeklyPostponements({ result, canEdit, busy, onDecide }: {
  result: RealizationPersonResult
  canEdit: boolean
  busy: boolean
  onDecide: (taskId: string, eventId: string, reason: string) => Promise<boolean>
}) {
  const [reasons, setReasons] = React.useState<Record<string, string>>({})
  const rows = weeklyPostponements(result)
  if (!rows.length) return null
  const dateLabel = (value: unknown) => typeof value === "string" ? value.slice(0, 10).split("-").reverse().join(".") : "—"
  return <section className="space-y-2" aria-label="Shtyrjet për aprovim">
    <h3 className="text-sm font-semibold">Shtyrjet për aprovim</h3>
    <p className="text-xs text-slate-500">Aprovo shtyrjen për secilën detyrë këtu. Vendimi ruhet edhe në realizimin ditor.</p>
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[740px] table-fixed text-left text-xs">
        <colgroup><col className="w-[32%]" /><col className="w-24" /><col className="w-24" /><col className="w-28" /><col /></colgroup>
        <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600"><tr className="divide-x divide-slate-200"><th className="px-3 py-2.5" scope="col">Detyra</th><th className="px-2 py-2.5" scope="col">Afati i mëparshëm</th><th className="px-2 py-2.5" scope="col">Afati i ri</th><th className="px-2 py-2.5" scope="col">Statusi</th><th className="px-3 py-2.5" scope="col">Aprovuesi / Arsyeja</th></tr></thead>
        <tbody>{rows.map(({ task, event, date }) => {
          const title = parseMarkedNoteContent(task.title).text.split(/\r?\n/).find(line => line.trim())?.trim() || "Pa titull"
          const approved = task.adjustment_status === "APPROVED"
          return <tr key={task.task_id} className="divide-x divide-slate-200 border-t border-slate-200 align-top even:bg-slate-50">
            <th scope="row" className="p-3 text-left font-medium"><p className="truncate" title={title}>{title}</p><p className="mt-1.5 text-[10px] font-normal text-slate-500">Dita: {dateLabel(date)}</p></th>
            <td className="px-2 py-3 tabular-nums text-slate-600">{dateLabel(event.old_value)}</td>
            <td className="px-2 py-3 font-semibold tabular-nums text-slate-800">{dateLabel(event.new_value)}</td>
            <td className="px-2 py-3">
              <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-semibold ${approved ? "bg-emerald-50 text-emerald-700" : task.adjustment_status === "REJECTED" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{approved ? "Aprovuar" : task.adjustment_status === "REJECTED" ? "Refuzuar" : "Pret aprovim"}</span>
            </td>
            <td className="space-y-2 p-3">
              {task.manager_decision?.decided_by_name ? <p className="font-medium text-slate-800">{task.manager_decision.decided_by_name}</p> : null}
              {task.manager_decision?.reason ? <p className="break-words leading-5 text-slate-600">{task.manager_decision.reason}</p> : null}
              {approved && !task.manager_decision?.decided_by_name && !task.manager_decision?.reason ? <span className="text-slate-400">—</span> : null}
              {!approved && canEdit ? <>
                <Textarea rows={1} className="min-h-9 bg-white text-xs" aria-label={`Arsyeja e aprovimit: ${title}`} placeholder="Arsyeja e aprovimit…" value={reasons[event.id] || ""} disabled={busy} onChange={e => setReasons(current => ({ ...current, [event.id]: e.target.value }))} />
                <Button type="button" size="sm" disabled={busy || !reasons[event.id]?.trim()} onClick={() => void onDecide(task.task_id!, event.id, reasons[event.id].trim())}>Aprovo shtyrjen</Button>
              </> : null}
            </td>
          </tr>
        })}</tbody>
      </table>
    </div>
  </section>
}
