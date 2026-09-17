"use client"

import { ArrowDownUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RealizationReviewCells } from "@/components/realization-review-cells"
import { RealizationPlanCount } from "@/components/realization-plan-count"
import type { DailyRealizationPerson, Department } from "@/lib/types"
import { realizationDepartmentTag } from "@/lib/department-name"
import { RealizationQuantityDelta } from "@/components/realization-quantity"
import { EXTRA_NO_PROGRESS_EXPLANATION, type ExtraTaskState } from "@/lib/realization-extras"

export function DailyStaffTable({ people, filterPeople, departments, departmentId, personFilter, onDepartmentFilter, onPersonFilter, periodIds, sort, onSort, onSelect, onSelectExtra, onSelectDeadline, reviewVersion }: {
  people: DailyRealizationPerson[]; departments: Department[]; periodIds: Record<string, string>
  filterPeople: DailyRealizationPerson[]; departmentId: string; personFilter: string
  onDepartmentFilter: (value: string) => void; onPersonFilter: (value: string) => void
  sort: string; onSort: (value: string) => void; onSelect: (userId: string) => void; reviewVersion: number
  onSelectExtra: (userId: string, state: ExtraTaskState | "all") => void
  onSelectDeadline: (userId: string, state: "all" | "completed" | "not-completed") => void
}) {
  return <Card className="gap-0 rounded-md py-0 shadow-sm">
    <CardHeader className="flex-row items-center justify-between border-b px-3 py-2">
      <CardTitle className="text-xs uppercase tracking-wider">Stafi</CardTitle>
      <Select value={sort} onValueChange={onSort}>
        <SelectTrigger className="h-8 w-52 text-xs"><ArrowDownUp className="h-4 w-4" /><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="lowest">Realizimi më i ulët</SelectItem><SelectItem value="postponed">Më shumë shtyrje</SelectItem>
          <SelectItem value="no-progress">Më shumë pa progres</SelectItem><SelectItem value="name">Emri</SelectItem>
        </SelectContent>
      </Select>
    </CardHeader>
    <CardContent className="overflow-x-auto p-0">
      <Table className="min-w-[1700px] text-xs [&_th]:border [&_th]:border-slate-200 [&_th]:px-2 [&_th]:py-2 [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1.5">
        <TableHeader className="bg-slate-100"><TableRow className="bg-white">
          <TableHead />
          <TableHead>
            <Select value={personFilter} onValueChange={onPersonFilter}>
              <SelectTrigger size="sm" aria-label="Filtro personin" className="w-28 min-w-0 gap-1 bg-white px-2 text-[11px] [&_[data-slot=select-value]]:min-w-0"><SelectValue placeholder="Të gjithë" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Të gjithë</SelectItem>
                {[...new Map(filterPeople.map(person => [person.user_id, person])).values()].sort((a, b) => a.user_name.localeCompare(b.user_name)).map(person => <SelectItem key={person.user_id} value={person.user_id}>{person.user_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </TableHead>
          <TableHead>
            <Select value={departmentId} onValueChange={onDepartmentFilter}>
              <SelectTrigger size="sm" aria-label="Filtro departamentin" className="w-20 min-w-0 gap-1 bg-white px-2 text-[11px] [&_[data-slot=select-value]]:min-w-0"><SelectValue placeholder="Të gjitha" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Të gjitha</SelectItem>
                {departments.map(department => <SelectItem key={department.id} value={department.id}>{realizationDepartmentTag(department)}</SelectItem>)}
              </SelectContent>
            </Select>
          </TableHead>
          <TableHead colSpan={18} />
        </TableRow><TableRow>
          {["Nr.", "Emri mbiemri", "DEP", "Plan", "Kryer gjithsej", "Në progres", "Shtyrë", "Pa progres"].map(label => <TableHead key={label} rowSpan={2} className="text-[10px] uppercase">{label}</TableHead>)}
          <TableHead colSpan={4} className="bg-blue-100 text-center text-[10px] uppercase">Ekstra</TableHead>
          <TableHead colSpan={3} className="bg-teal-100 text-center text-[10px] uppercase">Sasi · produkte / pika</TableHead>
          <TableHead colSpan={3} className="bg-orange-100 text-center text-[10px] uppercase">Deadline</TableHead>
          {["Plan RLZ", "Vlerësimi", "Komenti nga përgjegjësi"].map(label => <TableHead key={label} rowSpan={2} className="text-[10px] uppercase">{label}</TableHead>)}
        </TableRow><TableRow>
          {["Të kryera", "Në progres", "Pa progres", "Gjithsej"].map(label => <TableHead key={label} className="bg-blue-50 text-center text-[10px] uppercase">{label}</TableHead>)}
          {["Planifikuar", "Kryer", "+ / −"].map(label => <TableHead key={`quantity:${label}`} className="bg-teal-50 text-center text-[10px] uppercase">{label}</TableHead>)}
          {["Afat sot", "Kryer", "Pa kryer"].map(label => <TableHead key={`deadline:${label}`} className="bg-orange-50 text-center text-[10px] uppercase">{label}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          {people.map((person, index) => <TableRow key={`${person.department_id}:${person.user_id}`}>
            <TableCell className="text-center tabular-nums">{index + 1}</TableCell>
            <TableCell>
              <button type="button" onClick={() => onSelect(person.user_id)} className="text-left font-semibold text-blue-800 hover:underline">{person.user_name}</button>
            </TableCell>
            <TableCell className="text-center font-semibold" title={departments.find(department => department.id === person.department_id)?.name}>{realizationDepartmentTag(departments.find(department => department.id === person.department_id))}</TableCell>
            <TableCell className="text-center tabular-nums"><RealizationPlanCount planned={person.metrics.original_planned_count} extra={person.metrics.additional_count} /></TableCell>
            <TableCell className="bg-emerald-50 text-center tabular-nums">{person.metrics.total_completed_today_count}</TableCell>
            <TableCell className="bg-amber-50 text-center tabular-nums">{person.metrics.in_progress_count}</TableCell>
            <TableCell className="bg-violet-50 text-center tabular-nums">{person.metrics.postponed_count}</TableCell>
            <TableCell className="bg-rose-50 text-center tabular-nums">{person.metrics.no_progress_count}</TableCell>
            <TableCell className="bg-emerald-50 text-center tabular-nums text-emerald-800"><button type="button" className="hover:underline" title="Shfaq detyrat ekstra të kryera sot" onClick={() => onSelectExtra(person.user_id, "completed")}>{person.metrics.additional_completed_count}</button></TableCell>
            <TableCell className="bg-amber-50 text-center tabular-nums"><button type="button" className="hover:underline" title="Shfaq detyrat ekstra në progres" onClick={() => onSelectExtra(person.user_id, "progress")}>{person.metrics.additional_in_progress_count}</button></TableCell>
            <TableCell className="bg-rose-50 text-center tabular-nums"><button type="button" className="hover:underline" title={EXTRA_NO_PROGRESS_EXPLANATION} onClick={() => onSelectExtra(person.user_id, "no-progress")}>{person.metrics.additional_no_progress_count}</button></TableCell>
            <TableCell className="bg-blue-50 text-center font-semibold tabular-nums text-blue-800"><button type="button" className="hover:underline" title="Shfaq të gjitha detyrat jashtë planit fillestar" onClick={() => onSelectExtra(person.user_id, "all")}>{person.metrics.additional_count}</button></TableCell>
            <TableCell className="bg-teal-50 text-center tabular-nums">{person.metrics.quantity_task_count ? person.metrics.quantity_planned_count : "—"}</TableCell>
            <TableCell className="bg-teal-50 text-center tabular-nums">{person.metrics.quantity_task_count ? person.metrics.quantity_completed_count : "—"}</TableCell>
            <TableCell className="bg-teal-50 text-center">{person.metrics.quantity_task_count ? <RealizationQuantityDelta value={person.metrics.quantity_delta} /> : "—"}</TableCell>
            <TableCell className={person.metrics.critical_deadlines_today_count > 0 ? "!border-2 !border-red-600 bg-orange-50 text-center font-semibold tabular-nums" : "bg-orange-50 text-center font-semibold tabular-nums"}><button type="button" className="hover:underline" title={person.metrics.critical_deadlines_today_count > 0 ? `Shfaq të gjitha detyrat me afat sot; ${person.metrics.critical_deadlines_today_count} janë Deadline Important` : "Shfaq të gjitha detyrat që kishin deadline këtë ditë"} onClick={() => onSelectDeadline(person.user_id, "all")}>{person.metrics.deadlines_today_count}</button></TableCell>
            <TableCell className="bg-emerald-50 text-center font-semibold tabular-nums text-emerald-800"><button type="button" className="hover:underline" title="Shfaq deadline-t e kryera" onClick={() => onSelectDeadline(person.user_id, "completed")}>{person.metrics.deadlines_completed_count}</button></TableCell>
            <TableCell className="bg-rose-50 text-center font-semibold tabular-nums text-rose-700"><button type="button" className="hover:underline" title={`Shfaq deadline-t e pakryera${person.metrics.deadlines_postponed_count ? `; ${person.metrics.deadlines_postponed_count} të shtyra` : ""}`} onClick={() => onSelectDeadline(person.user_id, "not-completed")}>{Math.max(0, person.metrics.deadlines_today_count - person.metrics.deadlines_completed_count)}</button></TableCell>
            <TableCell className="text-center font-semibold tabular-nums">{person.metrics.raw_plan_realization == null ? "—" : `${Math.min(100, person.metrics.raw_plan_realization)}%`}</TableCell>
            <RealizationReviewCells periodId={periodIds[person.department_id] || ""} userId={person.user_id} userName={person.user_name} refreshKey={reviewVersion} />
          </TableRow>)}
          {!people.length && <TableRow><TableCell colSpan={21} className="text-center text-slate-500">Nuk ka aktivitet për këtë ditë.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <p className="border-t px-3 py-2 text-[11px] text-slate-500">Deadline “Afat sot” tregon çdo detyrë që e kishte due date në datën e raportit. Borderi i kuq dhe i trashë tregon se personi ka të paktën një Deadline Important atë ditë. Pa kryer = gjithsej − kryer dhe përfshin edhe deadline-t e shtyra. Kliko numrin për të parë detyrat.</p>
      <p className="border-t px-3 py-2 text-[11px] text-slate-500">Sasi = produkte të projekteve + pika të detyrave me numër/numër në titull. Plani ditor është numri më i vogël: 2/17 → 2 dhe 40/4 → 4. Diferenca = kryer − planifikuar; 0 ✓ tregon se sasia është kryer. Kliko emrin për sasitë e çdo detyre.</p>
      <p className="border-t px-3 py-2 text-[11px] text-slate-500">Ekstra gjithsej = të kryera + në progres + pa progres. {EXTRA_NO_PROGRESS_EXPLANATION}</p>
      <p className="border-t px-3 py-2 text-[11px] text-slate-500">Ekstra janë detyrat e raportit jashtë planit fillestar të ditës, përfshirë detyra të shtuara ose të bartura. “Ekstra gjithsej” përfshin çdo gjendje; “Ekstra të kryera” janë pjesë e “Kryer gjithsej”. Plan = të planifikuara + ekstra gjithsej. Kliko numrin e ekstrave për të parë detyrat.</p>
    </CardContent>
  </Card>
}
