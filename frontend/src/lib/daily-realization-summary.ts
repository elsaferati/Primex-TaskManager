import type { DailyRealizationLive, DailyRealizationMetrics } from "@/lib/types"
import { weeklyRealizationPercent } from "@/lib/weekly-realization-percent"

export function combineDailyRealization(reports: DailyRealizationLive[]): DailyRealizationLive | null {
  if (!reports.length) return null
  if (reports.length === 1) return reports[0]
  const metrics = { ...reports[0].metrics }
  type DerivedKey = "raw_plan_realization" | "adjusted_plan_realization" | "deadline_compliance_percentage" | "daily_control_state" | "deadline_tasks"
  type CountKey = Exclude<keyof DailyRealizationMetrics, DerivedKey>
  const derivedKeys: DerivedKey[] = ["raw_plan_realization", "adjusted_plan_realization", "deadline_compliance_percentage", "daily_control_state", "deadline_tasks"]
  for (const key of Object.keys(metrics) as (keyof DailyRealizationMetrics)[]) {
    if ((derivedKeys as string[]).includes(key)) continue
    metrics[key as CountKey] = reports.reduce((sum, report) => sum + report.metrics[key as CountKey], 0)
  }
  metrics.deadline_tasks = reports.flatMap((report) => report.metrics.deadline_tasks ?? [])
  const percent = (completed: number, total: number) => total ? Math.min(100, Math.round(completed * 1000 / total) / 10) : null
  const realization = (planned: number, postponed: number) => planned || metrics.additional_count
    ? weeklyRealizationPercent(planned, metrics.total_completed_today_count, metrics.additional_count, postponed)
    : null
  metrics.raw_plan_realization = realization(metrics.original_planned_count, metrics.postponed_count)
  metrics.adjusted_plan_realization = realization(metrics.adjusted_denominator, metrics.unapproved_postponement_count)
  metrics.deadline_compliance_percentage = percent(metrics.deadlines_completed_count, metrics.deadlines_today_count)
  metrics.daily_control_state = reports.some((report) => report.metrics.daily_control_state === "ACTION_REQUIRED") ? "ACTION_REQUIRED" : "CLEAN_DAY"
  return {
    ...reports[0], department_id: "ALL", baseline_id: null, baseline_captured_at: null,
    baseline_available: reports.every((report) => report.baseline_available),
    historical_estimate: reports.some((report) => report.historical_estimate),
    live: reports.some((report) => report.live),
    last_updated: reports.map((report) => report.last_updated).sort()[0],
    metrics, people: reports.flatMap((report) => report.people),
  }
}
