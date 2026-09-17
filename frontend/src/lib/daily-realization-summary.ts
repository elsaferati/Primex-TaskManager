import type { DailyRealizationLive, DailyRealizationMetrics } from "@/lib/types"

export function combineDailyRealization(reports: DailyRealizationLive[]): DailyRealizationLive | null {
  if (!reports.length) return null
  if (reports.length === 1) return reports[0]
  const metrics = { ...reports[0].metrics }
  type CountKey = Exclude<keyof DailyRealizationMetrics,
    "raw_plan_realization" | "adjusted_plan_realization" | "deadline_compliance_percentage" | "daily_control_state">
  for (const key of Object.keys(metrics) as (keyof DailyRealizationMetrics)[]) {
    if (key === "raw_plan_realization" || key === "adjusted_plan_realization" || key === "deadline_compliance_percentage" || key === "daily_control_state") continue
    metrics[key as CountKey] = reports.reduce((sum, report) => sum + report.metrics[key as CountKey], 0)
  }
  const percent = (completed: number, total: number) => total ? Math.min(100, Math.round(completed * 1000 / total) / 10) : null
  metrics.raw_plan_realization = percent(metrics.total_completed_today_count, metrics.original_planned_count)
  metrics.adjusted_plan_realization = percent(metrics.total_completed_today_count, metrics.adjusted_denominator)
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
