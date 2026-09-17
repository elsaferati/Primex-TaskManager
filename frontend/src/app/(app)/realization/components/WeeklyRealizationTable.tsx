"use client"

import * as React from "react"
import { RealizationReviewCells } from "@/components/realization-review-cells"
import { RealizationPlanCount } from "@/components/realization-plan-count"
import type { RealizationPersonResult, RealizationWeeklyResponse } from "@/lib/types"
import { compareRealizationDepartments, realizationDepartmentTag } from "@/lib/department-name"
import { EXTRA_NO_PROGRESS_EXPLANATION } from "@/lib/realization-extras"

export function weeklyMetrics(person: RealizationPersonResult) {
  const facts = person.facts_json
  const planned = facts.weekly_planned_count ?? person.planned_count
  const plannedCompleted = facts.weekly_completed_count ?? person.completed_on_time_count + person.completed_late_count
  const completed = facts.weekly_all_completed_count ?? plannedCompleted + (facts.counters?.additional_completed_count ?? 0)
  const extra = Math.max(facts.weekly_additional_count ?? person.additional_count, completed - plannedCompleted)
  // Use the latest occurrence of each obligation, rather than counting repeated days.
  const tasks = new Map<string, NonNullable<typeof facts.tasks>[number]>()
  for (const task of facts.tasks ?? []) tasks.set(task.task_id || task.match_key || task.title, task)
  for (const day of facts.daily_timeline ?? []) {
    for (const task of day.tasks ?? []) {
      const key = task.task_id || task.match_key || task.title
      const previous = tasks.get(key)
      if (previous && isCompleted(previous)) continue
      tasks.set(key, { ...previous, ...task, postponement: task.postponement ?? previous?.postponement })
    }
  }
  const pending = [...tasks.values()].filter((task) => !isCompleted(task))
  const isPostponed = (task: typeof pending[number]) => /postpon/.test(task.classification) || Boolean(task.postponement)
  const postponed = pending.filter(isPostponed).length
  const progress = pending.filter((task) => !isPostponed(task) && (task.classification === "in_progress" || task.status === "IN_PROGRESS")).length
  const noProgress = pending.length - postponed - progress
  const expectedKeys = new Set<string>()
  const extraKeys = new Set<string>()
  for (const task of [...(facts.tasks ?? []), ...(facts.daily_timeline ?? []).flatMap(day => day.tasks ?? [])]) {
    const key = task.task_id || task.match_key || task.title
    if (["planned_owner", "planned_today", "system_schedule"].includes(task.attribution || "")) expectedKeys.add(key)
    if (["additional_owner", "completed_outside_weekly_plan", "added_after_weekly_plan"].includes(task.attribution || "")) extraKeys.add(key)
  }
  const extraCompleted = Math.max(0, completed - plannedCompleted)
  const extraProgress = Math.min(Math.max(0, extra - extraCompleted), pending.filter(task => {
    const key = task.task_id || task.match_key || task.title
    return extraKeys.has(key) && !expectedKeys.has(key) && (task.classification === "in_progress" || task.status === "IN_PROGRESS")
  }).length)
  const base = planned || extra
  return {
    planned, completed, extra,
    extraCompleted, extraProgress, extraNoProgress: Math.max(0, extra - extraCompleted - extraProgress),
    progress: tasks.size ? progress : person.in_progress_count,
    postponed: tasks.size ? postponed : person.approved_postponement_count + person.unapproved_postponement_count,
    noProgress: tasks.size ? noProgress : person.no_progress_count + person.pending_count,
    percent: base ? Math.min(100, Math.round(completed * 1000 / base) / 10) : 0,
  }
}

function isCompleted(task: NonNullable<RealizationPersonResult["facts_json"]["tasks"]>[number]) {
  return ["completed", "completed_on_time", "completed_late", "additional_completed"].includes(task.classification) || task.status === "DONE"
}


export function WeeklyRealizationTable({ reports, personId, onSelect, loading, onReviewSaved }: {
  reports: RealizationWeeklyResponse[]; personId: string; loading: boolean
  onReviewSaved: () => void
  onSelect: (report: RealizationWeeklyResponse, person: RealizationPersonResult) => void
}) {
  const rows = reports.flatMap((report) => report.people.map((person) => ({ report, person })))
    .filter(({ person }) => personId === "ALL" || person.user_id === personId)
    .filter(({ person }) => {
      const values = weeklyMetrics(person)
      return values.planned + values.extra + values.completed + values.progress + values.postponed + values.noProgress > 0
    })
    .sort((a, b) => compareRealizationDepartments({ name: a.report.department_name }, { name: b.report.department_name }) || a.person.user_name.localeCompare(b.person.user_name))
  const total = rows.reduce((sum, { person }) => {
    const values = weeklyMetrics(person)
    for (const key of ["planned", "completed", "extra", "extraCompleted", "extraProgress", "extraNoProgress", "progress", "postponed", "noProgress"] as const) sum[key] += values[key]
    return sum
  }, { planned: 0, completed: 0, extra: 0, extraCompleted: 0, extraProgress: 0, extraNoProgress: 0, progress: 0, postponed: 0, noProgress: 0 })
  const base = total.planned || total.extra
  const percent = base ? Math.min(100, Math.round(total.completed * 1000 / base) / 10) : 0
  const numbers = (values: ReturnType<typeof weeklyMetrics> | typeof total) => <>
    <td className="text-center tabular-nums"><RealizationPlanCount planned={values.planned} extra={values.extra} /></td><td className="bg-emerald-50 text-center tabular-nums text-emerald-800">{values.completed}</td>
    <td className="bg-amber-50 text-center tabular-nums">{values.progress}</td><td className="bg-violet-50 text-center tabular-nums">{values.postponed}</td>
    <td className="bg-rose-50 text-center tabular-nums">{values.noProgress}</td>
    <td className="bg-emerald-50 text-center tabular-nums text-emerald-800">{values.extraCompleted}</td>
    <td className="bg-amber-50 text-center tabular-nums">{values.extraProgress}</td>
    <td className="bg-rose-50 text-center tabular-nums" title={EXTRA_NO_PROGRESS_EXPLANATION}>{values.extraNoProgress}</td>
    <td className="bg-blue-50 text-center font-semibold tabular-nums text-blue-800">{values.extra}</td>
  </>
  return <section className="overflow-hidden rounded-md border border-slate-300 bg-white" aria-label="Tabela e realizimit javor">
    <div className="flex items-center justify-between border-b px-3 py-2 text-xs"><strong>Përmbledhje dhe realizimi sipas përdoruesve</strong><span className="text-slate-500">{rows.length} përdorues</span></div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1500px] border-collapse text-xs [&_th]:border [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-2 [&_td]:border [&_td]:border-slate-200">
        <thead className="bg-slate-100 text-left text-[10px] uppercase text-slate-700"><tr>
          {["Nr.", "Emri mbiemri", "DEP", "Plan", "Kryer gjithsej", "Në progres", "Shtyrë", "Pa progres"].map((label) => <th key={label} scope="col" rowSpan={2}>{label}</th>)}
          <th colSpan={4} scope="colgroup" className="bg-blue-100 text-center">Ekstra</th>
          {["Plan realizimi", "Vlerësimi", "Komenti nga përgjegjësi"].map((label) => <th key={label} scope="col" rowSpan={2}>{label}</th>)}
        </tr><tr>{["Të kryera", "Në progres", "Pa progres", "Gjithsej"].map(label => <th key={label} scope="col" className="bg-blue-50 text-center">{label}</th>)}</tr></thead>
        <tbody>
          <tr className="bg-slate-50 font-semibold"><td colSpan={3} className="px-2 py-2">Gjithsej · {personId === "ALL" ? "Të gjithë" : "Përdoruesi i filtruar"}</td>{numbers(total)}<td className="px-2 text-center tabular-nums">{percent}%</td><td colSpan={2} className="px-2 font-normal text-slate-500">{total.completed} kryer · {total.progress + total.postponed + total.noProgress} të pakryera</td></tr>
          {loading ? <tr><td colSpan={15} className="p-4 text-center text-slate-500">Duke ngarkuar…</td></tr> : rows.length ? rows.map(({ report, person }, index) => {
            const values = weeklyMetrics(person)
            return <tr key={`${person.period_id}:${person.user_id}`} className="hover:bg-slate-50">
              <td className="px-2 text-center">{index + 1}</td><td className="px-2 py-2"><button type="button" onClick={() => onSelect(report, person)} className="text-left font-semibold text-blue-800 hover:underline">{person.user_name}</button></td>
              <td className="px-2 text-center font-semibold" title={report.department_name || undefined}>{realizationDepartmentTag({ name: report.department_name })}</td>
              {numbers(values)}<td className="px-2 text-center font-semibold tabular-nums">{values.percent}%</td>
              <RealizationReviewCells periodId={person.period_id} userId={person.user_id} userName={person.user_name} refreshKey={person} locked={report.period.status === "LOCKED"} onSaved={onReviewSaved} />
            </tr>
          }) : <tr><td colSpan={15} className="p-4 text-center text-slate-500">Nuk ka të dhëna për filtrat e zgjedhur.</td></tr>}
        </tbody>
      </table>
    </div>
    <p className="border-t px-3 py-2 text-[11px] text-slate-500">Ekstra gjithsej = të kryera + në progres + pa progres. {EXTRA_NO_PROGRESS_EXPLANATION}</p>
    <p className="border-t px-3 py-2 text-[11px] text-slate-500">Ekstra janë detyrat jashtë planit fillestar të javës. “Ekstra gjithsej” përfshin çdo gjendje; “Ekstra të kryera” janë pjesë e “Kryer gjithsej”. Plan = të planifikuara + ekstra gjithsej.</p>
    <p className="border-t px-3 py-2 text-[11px] text-slate-500">Realizimi = të gjitha detyrat e kryera (përfshirë ekstra) / planifikuara × 100, maksimumi 100%. Kur nuk ka plan, llogaritet ndaj detyrave ekstra. Përmbledhja mbledh obligimet e secilit përdorues.</p>
  </section>
}
