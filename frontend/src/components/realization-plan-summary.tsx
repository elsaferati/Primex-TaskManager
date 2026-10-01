import { Card, CardContent } from "@/components/ui/card"
import type { DailyRealizationMetrics } from "@/lib/types"
import { cn } from "@/lib/utils"

type PlanSummaryMetrics = Pick<DailyRealizationMetrics,
  | "original_planned_count"
  | "total_completed_today_count"
  | "in_progress_count"
  | "postponed_count"
  | "no_progress_count"
  | "additional_count"
  | "additional_completed_count"
  | "raw_plan_realization"
  | "adjusted_plan_realization"
>

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="flex min-h-14 min-w-0 flex-col justify-center rounded-md border border-slate-200 border-l-[3px] bg-white px-3 py-2 shadow-sm" style={{ borderLeftColor: color }}>
    <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500" title={label}>{label}</p>
    <p className="mt-0.5 text-xl font-bold leading-6 tabular-nums text-slate-950">{value}</p>
  </div>
}

const percent = (value: number | null) => value == null ? "—" : `${Math.min(100, value)}%`

export function RealizationPlanSummary({ metrics: m }: { metrics: PlanSummaryMetrics }) {
  return <Card className="gap-0 rounded-lg border-slate-200 bg-slate-50/70 py-0 shadow-sm">
    <CardContent className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_270px]">
      <div className="min-w-0">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.12em] text-slate-700">Realizimi i planit</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <Metric label="Planifikuar" value={m.original_planned_count} color="#2563EB" />
          <Metric label="Kryer gjithsej" value={m.total_completed_today_count} color="#8BDD8B" />
          <Metric label="Në progres" value={m.in_progress_count} color="#D6D600" />
          <Metric label="Shtyrë" value={m.postponed_count} color="#A78BFA" />
          <Metric label="Pa progres" value={m.no_progress_count} color="#E69CCF" />
          <Metric label="Ekstra gjithsej" value={m.additional_count} color="#2563EB" />
          <Metric label="Ekstra të kryera" value={m.additional_completed_count} color="#8BDD8B" />
        </div>
      </div>
      <div className="flex min-h-14 flex-col justify-center rounded-md border border-blue-200 bg-blue-50 px-4 py-2 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#2563EB]">Plan RLZ</p>
        <div className="flex items-end justify-between gap-3">
          <b className="text-2xl leading-7 tabular-nums">{percent(m.raw_plan_realization)}</b>
          <span className="pb-0.5 text-[11px] text-slate-500">{m.total_completed_today_count} / {m.original_planned_count} të kryera</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-blue-100">
          <div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${Math.max(0, Math.min(100, m.raw_plan_realization ?? 0))}%` }} />
        </div>
        {m.adjusted_plan_realization != null && <p className="mt-1 text-[10px] text-slate-500">E rregulluar: <span className={cn(m.adjusted_plan_realization !== m.raw_plan_realization && "font-medium text-[#2563EB]")}>{percent(m.adjusted_plan_realization)}</span></p>}
      </div>
    </CardContent>
  </Card>
}
