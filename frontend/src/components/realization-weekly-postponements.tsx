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
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[600px] table-fixed text-left text-xs">
        <colgroup><col className="w-[40%]" /><col className="w-32" /><col /></colgroup>
        <thead className="bg-slate-100"><tr><th className="p-3" scope="col">Detyra</th><th className="p-3" scope="col">Afati</th><th className="p-3" scope="col">Aprovimi</th></tr></thead>
        <tbody>{rows.map(({ task, event, date }) => {
          const title = parseMarkedNoteContent(task.title).text.split(/\r?\n/).find(line => line.trim())?.trim() || "Pa titull"
          const approved = task.adjustment_status === "APPROVED"
          return <tr key={task.task_id} className="border-t align-top even:bg-slate-50">
            <th scope="row" className="p-3 text-left font-medium"><p className="truncate" title={title}>{title}</p><p className="mt-1 font-normal text-slate-500">{dateLabel(date)}</p></th>
            <td className="p-3">{dateLabel(event.old_value)} → {dateLabel(event.new_value)}</td>
            <td className="space-y-2 p-3">
              <p className={approved ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>{approved ? "Aprovuar" : task.adjustment_status === "REJECTED" ? "Refuzuar" : "Pret aprovim"}</p>
              {task.manager_decision?.decided_by_name ? <p className="text-slate-500">Nga {task.manager_decision.decided_by_name}</p> : null}
              {task.manager_decision?.reason ? <p className="text-slate-600">{task.manager_decision.reason}</p> : null}
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
