"use client"

import { ArrowDownUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RealizationReviewCells } from "@/components/realization-review-cells"
import { RealizationQuantityDelta } from "@/components/realization-quantity"
import { RealizationDeadlineStatusGrid, RealizationExtraStatusGrid, RealizationPlanStatusGrid, RealizationStatusLegend, metricBand, metricCell, metricHeadline } from "@/components/realization-plan-status-grid"
import { RealizationDeadlineTasksPopover, criticalDeadlineCounts, criticalDeadlineSummary, deadlineAlarmCount } from "@/components/realization-deadline-tasks"
import { realizationDepartmentTag } from "@/lib/department-name"
import type { ExtraTaskState } from "@/lib/realization-extras"
import type { DailyRealizationPerson, Department, RealizationPersonResult } from "@/lib/types"
import { cn } from "@/lib/utils"

export function DailyStaffTable({ people, filterPeople, departments, departmentId, personFilter, onDepartmentFilter, onPersonFilter, periodIds, results, sort, onSort, onSelect, onSelectExtra, onSelectDeadline, reviewVersion, onReviewSaved, onPrepareResult }: {
  people: DailyRealizationPerson[]; departments: Department[]; periodIds: Record<string, string>
  results: Record<string, RealizationPersonResult>
  filterPeople: DailyRealizationPerson[]; departmentId: string; personFilter: string
  onDepartmentFilter: (value: string) => void; onPersonFilter: (value: string) => void
  sort: string; onSort: (value: string) => void; onSelect: (userId: string) => void; reviewVersion: number
  onReviewSaved: () => void
  onPrepareResult: (departmentId: string, userId: string) => Promise<void>
  onSelectExtra: (userId: string, state: ExtraTaskState | "all") => void
  onSelectDeadline: (userId: string, state: "all" | "completed" | "not-completed" | "critical-all" | "critical-completed" | "critical-not-completed") => void
}) {
  const deadlineTotals = people.reduce((totals, person) => ({
    completed: totals.completed + person.metrics.deadlines_completed_count,
    total: totals.total + person.metrics.deadlines_today_count,
    criticalCompleted: totals.criticalCompleted + person.metrics.critical_deadlines_completed_count,
    criticalTotal: totals.criticalTotal + person.metrics.critical_deadlines_today_count,
  }), { completed: 0, total: 0, criticalCompleted: 0, criticalTotal: 0 })

  return <Card className="gap-0 rounded-md py-0 shadow-sm">
    <CardHeader className="flex-row items-center justify-between border-b px-3 py-2">
      <div className="flex min-w-0 items-center gap-4"><CardTitle className="text-xs uppercase tracking-wider">Stafi</CardTitle><RealizationStatusLegend /></div>
      <Select value={sort} onValueChange={onSort}>
        <SelectTrigger className="h-8 w-52 text-xs"><ArrowDownUp className="h-4 w-4" /><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="planner">Renditja e Weekly Planner</SelectItem>
          <SelectItem value="lowest">Realizimi më i ulët</SelectItem><SelectItem value="postponed">Më shumë shtyrje</SelectItem>
          <SelectItem value="no-progress">Më shumë pa progres</SelectItem><SelectItem value="name">Emri</SelectItem>
        </SelectContent>
      </Select>
    </CardHeader>
    <CardContent className="overflow-x-auto p-0">
      <Table style={{ width: "100%", minWidth: 1500 }} className="table-fixed text-[13px] [&_th]:border [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-1.5 [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1">
        <colgroup>
          <col style={{ width: "3%" }} /><col style={{ width: "8%" }} /><col style={{ width: "4%" }} />
          <col style={{ width: "21%" }} /><col style={{ width: "10%" }} /><col style={{ width: "7%" }} />
          <col style={{ width: "13%" }} /><col style={{ width: "6%" }} /><col style={{ width: "10%" }} /><col style={{ width: "18%" }} />
        </colgroup>
        <TableHeader className="sticky top-0 z-20 bg-slate-100">
          <TableRow className="bg-white">
            <TableHead className="w-11" />
            <TableHead><Select value={personFilter} onValueChange={onPersonFilter}><SelectTrigger size="sm" aria-label="Filtro personin" className="w-full min-w-0 gap-1 bg-white px-2 text-[11px] [&_[data-slot=select-value]]:min-w-0"><SelectValue placeholder="Të gjithë" /></SelectTrigger><SelectContent><SelectItem value="ALL">Të gjithë</SelectItem>{[...new Map(filterPeople.map(person => [person.user_id, person])).values()].sort((a, b) => a.user_name.localeCompare(b.user_name)).map(person => <SelectItem key={person.user_id} value={person.user_id}>{person.user_name}</SelectItem>)}</SelectContent></Select></TableHead>
            <TableHead><Select value={departmentId} onValueChange={onDepartmentFilter}><SelectTrigger size="sm" aria-label="Filtro departamentin" className="w-full min-w-0 gap-1 bg-white px-1 text-[11px] [&_[data-slot=select-value]]:min-w-0"><SelectValue placeholder="DEP" /></SelectTrigger><SelectContent><SelectItem value="ALL">Të gjitha</SelectItem>{departments.map(department => <SelectItem key={department.id} value={department.id}>{realizationDepartmentTag(department)}</SelectItem>)}</SelectContent></Select></TableHead>
            <TableHead colSpan={3} />
            <TableHead className="bg-orange-50 px-2 text-[10px] normal-case">
              <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                <span className="font-semibold text-slate-600">Due date</span>
                <span className="font-bold tabular-nums text-emerald-700">{deadlineTotals.completed}/{deadlineTotals.total}</span>
              </div>
              {deadlineTotals.criticalTotal > 0 ? <div className="mt-0.5 flex items-center justify-between gap-2 whitespace-nowrap text-red-700"><span>Deadline important</span><span className="font-bold tabular-nums">{deadlineTotals.criticalCompleted}/{deadlineTotals.criticalTotal}</span></div> : null}
            </TableHead>
            <TableHead colSpan={3} />
          </TableRow>
          <TableRow>
            <TableHead className="w-11 text-center text-[11px] uppercase">Nr.</TableHead>
            <TableHead className="text-[11px] uppercase">Punonjësi</TableHead>
            <TableHead className="text-center text-[11px] uppercase">DEP</TableHead>
            <TableHead className="text-[11px] uppercase">Plan · realizimi</TableHead>
            <TableHead className="bg-blue-100 text-[11px] uppercase">Ekstra Kryer / Totali</TableHead>
            <TableHead className="bg-teal-100 text-[11px] uppercase">Kryer / Totali</TableHead>
            <TableHead className="bg-orange-100 text-[11px] uppercase">Due date / Deadline Kryer/Totali</TableHead>
            <TableHead className="text-center text-[11px] uppercase">Plan RLZ</TableHead>
            <TableHead className="text-[11px] uppercase">Vlerësimi</TableHead>
            <TableHead className="text-[11px] uppercase">Komenti nga përgjegjësi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {people.map((person, index) => {
            const metrics = person.metrics
            const completePlan = metrics.original_planned_count + metrics.additional_count
            const realization = metrics.raw_plan_realization == null ? null : Math.min(100, metrics.raw_plan_realization)
            const department = departments.find(item => item.id === person.department_id)
            if (person.availability_status) {
              const statusLabel = person.availability_status === "PV" ? "PV · Pushim vjetor" : person.availability_status === "MUNGESE" ? "Mungesë" : "PV / Mungesë"
              return <TableRow key={`${person.department_id}:${person.user_id}`} className="bg-slate-50/80 align-middle">
                <TableCell className="text-center tabular-nums text-slate-500">{index + 1}</TableCell>
                <TableCell><span className="block whitespace-nowrap text-[15px] font-bold leading-5 text-slate-800">{person.user_name}</span></TableCell>
                <TableCell className="text-center text-xs font-bold uppercase text-slate-600" title={department?.name}>{realizationDepartmentTag(department)}</TableCell>
                <TableCell colSpan={7} className="bg-slate-100/80 text-center"><span className="inline-flex rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-bold text-slate-700">{statusLabel}</span></TableCell>
              </TableRow>
            }
            return <TableRow key={`${person.department_id}:${person.user_id}`} className="align-middle hover:bg-slate-50/70">
              <TableCell className="text-center tabular-nums text-slate-500">{index + 1}</TableCell>
              <TableCell>
                <button type="button" onClick={() => onSelect(person.user_id)} className="block max-w-full whitespace-nowrap text-left text-[15px] font-bold leading-5 text-blue-800 hover:underline">{person.user_name}</button>
              </TableCell>
              <TableCell className="text-center text-xs font-bold uppercase text-slate-600" title={department?.name}>{realizationDepartmentTag(department)}</TableCell>
              <TableCell className={cn(metricCell, metrics.no_progress_count > 0 && "bg-rose-50/60")}>
                <p className={cn(metricHeadline, "font-semibold text-slate-900")}><span className="tabular-nums">Plan {metrics.original_planned_count}</span> <span className="text-slate-400">+</span> <span className="tabular-nums text-blue-800">Ekstra {metrics.additional_count}</span> <span className="text-slate-400">=</span> <span className="text-base font-bold tabular-nums">{completePlan} total</span></p>
                <RealizationPlanStatusGrid completed={metrics.total_completed_today_count} progress={metrics.in_progress_count} postponed={metrics.postponed_count} noProgress={metrics.no_progress_count} />
              </TableCell>
              <TableCell className={cn(metricCell, "bg-blue-50/70")}>
                <div className={cn(metricHeadline, "justify-center")}>
                  <button type="button" className="font-semibold text-blue-900 hover:underline" title="Shfaq të gjitha detyrat jashtë planit fillestar" onClick={() => onSelectExtra(person.user_id, "all")}><span className="text-lg tabular-nums">{metrics.additional_completed_count}/{metrics.additional_count}</span></button>
                </div>
                <RealizationExtraStatusGrid progress={metrics.additional_in_progress_count} noProgress={metrics.additional_no_progress_count} onProgress={() => onSelectExtra(person.user_id, "progress")} onNoProgress={() => onSelectExtra(person.user_id, "no-progress")} />
              </TableCell>
              <TableCell className={cn(metricCell, "bg-teal-50/60", metrics.quantity_task_count > 0 && metrics.quantity_delta < 0 && "bg-rose-50/60")}>
                {metrics.quantity_task_count
                  ? <><p className={cn(metricHeadline, "font-semibold")}><span className="text-xl font-bold tabular-nums">{metrics.quantity_completed_count}/{metrics.quantity_planned_count}</span></p><div className={cn(metricBand, "text-base font-bold")}><RealizationQuantityDelta value={metrics.quantity_delta} /></div></>
                  : <p className={cn(metricHeadline, "text-slate-400")}>Pa sasi</p>}
              </TableCell>
              <TableCell className={cn(metricCell, "bg-orange-50/70", metrics.deadlines_no_progress_count > 0 && "bg-pink-50/80", deadlineAlarmCount(metrics.deadline_tasks ?? []) > 0 && "!border-2 !border-red-600")}>
                <div className={cn(metricHeadline, "justify-between gap-2")}>
                  <button type="button" className="font-semibold hover:underline" title={metrics.critical_deadlines_today_count > 0 ? `${metrics.critical_deadlines_today_count} deadline me prioritet` : "Shfaq detyrat që kishin deadline këtë ditë"} onClick={() => onSelectDeadline(person.user_id, "all")}><span className="text-base tabular-nums text-emerald-700">{metrics.deadlines_completed_count}/{metrics.deadlines_today_count}</span></button>
                  {metrics.critical_deadlines_today_count > 0 ? <button type="button" className="rounded border border-red-600 bg-red-200 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-red-950 hover:underline" title={criticalDeadlineSummary(metrics.deadline_tasks ?? [])} onClick={() => onSelectDeadline(person.user_id, "critical-all")}>{metrics.critical_deadlines_completed_count}/{metrics.critical_deadlines_today_count}</button> : null}
                </div>
                <RealizationDeadlineTasksPopover tasks={metrics.deadline_tasks ?? []} title={`Afatet e ditës · ${person.user_name}`}>
                  <RealizationDeadlineStatusGrid completed={metrics.deadlines_completed_count} progress={metrics.deadlines_in_progress_count} postponed={metrics.deadlines_postponed_count} noProgress={metrics.deadlines_no_progress_count} critical={criticalDeadlineCounts(metrics.deadline_tasks ?? [])} />
                </RealizationDeadlineTasksPopover>
              </TableCell>
              <TableCell className={cn(metricCell, "text-center")}>
                <p className={cn(metricHeadline, "justify-center text-base font-bold tabular-nums", realization == null ? "text-slate-400" : realization >= 100 ? "text-emerald-700" : realization >= 50 ? "text-amber-700" : "text-rose-700")}>{realization == null ? "—" : `${realization}%`}</p>
                {realization != null ? <div className="mx-auto mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-slate-200"><div className={cn("h-full rounded-full", realization >= 100 ? "bg-emerald-500" : realization >= 50 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${realization}%` }} /></div> : null}
              </TableCell>
              <RealizationReviewCells periodId={periodIds[person.department_id] || ""} userId={person.user_id} userName={person.user_name} result={results[`${person.department_id}:${person.user_id}`]} scope="daily" refreshKey={reviewVersion} onSaved={onReviewSaved} onPrepareResult={() => onPrepareResult(person.department_id, person.user_id)} />
            </TableRow>
          })}
          {!people.length && <TableRow><TableCell colSpan={10} className="text-center text-slate-500">Nuk ka aktivitet për këtë ditë.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <div className="grid gap-px border-t bg-slate-200 text-[11px] text-slate-500 md:grid-cols-3">
        <p className="bg-white px-3 py-2"><b className="text-slate-700">Plan:</b> plani fillestar + ekstra = ngarkesa totale. Poshtë shfaqen të kryera, në progres, të shtyra dhe pa progres.</p>
        <p className="bg-white px-3 py-2"><b className="text-slate-700">Sasia:</b> kryer / planifikuar. Diferenca tregon mungesën ose tejkalimin e produkteve/pikëve.</p>
        <p className="bg-white px-3 py-2"><b className="text-slate-700">Deadline:</b> kryer / gjithsej. Kutia me unazë të kuqe mban sipër numrin e kuq të atyre që janë deadline important. Kliko kutitë për të parë cilat detyra kishin afat dhe çfarë ndodhi me secilën.</p>
      </div>
    </CardContent>
  </Card>
}
