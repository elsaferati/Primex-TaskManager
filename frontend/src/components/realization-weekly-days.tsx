"use client"

import type { RealizationPersonResult } from "@/lib/types"
import { weeklyChecklistLabels } from "@/lib/realization-checklist"

type Props = { result: RealizationPersonResult; compact?: boolean }
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
        ...(day.tasks || []).filter(task => task.daily_report_comment).map(task => ({ label: task.title, text: task.daily_report_comment! })),
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
          {(day.tasks || []).length ? <details><summary className="cursor-pointer text-blue-700">Detyrat e ditës ({day.tasks!.length})</summary><ul className="mt-1 space-y-1">{day.tasks!.map((task, index) => <li key={index}>{task.title}{taskStates[task.classification?.toUpperCase() || ""] ? ` · ${taskStates[task.classification!.toUpperCase()]}` : ""}</li>)}</ul></details> : null}
        </div>
      </details>
    })}
  </div>
}
