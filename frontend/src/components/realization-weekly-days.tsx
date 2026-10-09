"use client"

import type { RealizationPersonResult } from "@/lib/types"
import { weeklyChecklistLabels } from "@/lib/realization-checklist"
import { parseMarkedNoteContent } from "@/lib/note-markup"

type Props = { result: RealizationPersonResult; compact?: boolean }
const firstTaskLine = (title: string) => parseMarkedNoteContent(title).text.split(/\r?\n/).find(line => line.trim())?.trim() || "Pa titull"
const weekdays = ["Di", "Hën", "Mar", "Mër", "Enj", "Pre", "Sht"]
const taskStates: Record<string, string> = {
  COMPLETED: "Kryer", COMPLETED_ON_TIME: "Kryer në kohë", COMPLETED_LATE: "Kryer me vonesë",
  COMPLETED_EARLY: "Kryer para afatit", REALIZED_AS_PLANNED: "Kryer sipas planit",
  ADDITIONAL_COMPLETED: "Ekstra e kryer", IN_PROGRESS: "Në progres", ADDITIONAL_IN_PROGRESS: "Ekstra në progres",
  POSTPONED: "Shtyrë", POSTPONED_APPROVED: "Shtyrë me konfirmim", POSTPONED_UNAPPROVED: "Shtyrë pa konfirmim",
  NO_PROGRESS: "Pa progres", PENDING: "Në pritje", TODO: "Pa filluar",
}

export function RealizationWeeklyDays({ result, compact = false }: Props) {
  const days = result.facts_json.daily_timeline || []
  if (!days.length) return <p className="text-xs text-slate-400">Pa të dhëna ditore</p>
  return <div className={compact ? "mt-2 flex flex-wrap gap-1" : "space-y-2"}>
    {days.map(day => {
      const comments = [
        ...(day.person_comment ? [{ label: `Komenti ditor${day.person_comment.author ? ` · ${day.person_comment.author}` : ""}`, text: day.person_comment.comment }] : []),
        ...Object.entries(day.manual_answers || {}).filter(([, answer]) => answer.comment).map(([key, answer]) => ({ label: weeklyChecklistLabels[key] || key, text: answer.comment! })),
        ...(day.close_event?.daily_comment ? [{ label: "Mbyllja ditore", text: day.close_event.daily_comment }] : []),
        ...(day.tasks || []).filter(task => task.daily_report_comment).map(task => ({ label: firstTaskLine(task.title), text: task.daily_report_comment! })),
      ]
      const label = day.on_leave ? "Pushim" : day.future ? "Në vijim" : day.daily_progress_percent == null ? "Pa të dhëna" : `${day.daily_progress_percent}%`
      const dateLabel = day.date.split("-").reverse().join(".")
      return <details key={day.date} className={compact ? "rounded border bg-white p-1 text-[11px]" : "rounded-lg border bg-white p-3 text-xs"}>
        <summary className="cursor-pointer font-semibold" title={`${dateLabel} · ${comments.length} komente`}>
          {compact ? weekdays[new Date(`${day.date}T12:00:00`).getDay()] : dateLabel} · {label}{comments.length ? ` · ${comments.length} komente` : ""}
        </summary>
        <div className="mt-2 min-w-48 space-y-2 text-left font-normal">
          {compact ? <p className="font-semibold">{dateLabel}</p> : null}
          <p>Plan: {day.planned_count} · Kryer gjithsej: {day.completed_count} · Ekstra: {day.additional_count}</p>
          {comments.map((comment, index) => <div key={index} className="border-l-2 border-blue-200 pl-2"><p className="font-medium text-slate-600">{comment.label}</p><p className="whitespace-pre-wrap break-words">{comment.text}</p></div>)}
          {!comments.length ? <p className="text-slate-400">Pa komente të regjistruara.</p> : null}
          {(day.tasks || []).length ? <details>
            <summary className="cursor-pointer text-blue-700">Detyrat e ditës ({day.tasks!.length})</summary>
            <ol className="mt-2 overflow-hidden rounded-md border border-slate-200">
              {day.tasks!.map((task, index) => {
                const title = firstTaskLine(task.title)
                const status = taskStates[task.classification?.toUpperCase() || ""]
                return <li key={index} className="flex min-w-0 items-center gap-2 border-b border-slate-200 px-3 py-2 last:border-b-0 even:bg-slate-50">
                  <span className="w-5 shrink-0 text-slate-400">{index + 1}.</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-700" title={title}>{title}</span>
                  {status ? <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{status}</span> : null}
                </li>
              })}
            </ol>
          </details> : null}
        </div>
      </details>
    })}
  </div>
}
