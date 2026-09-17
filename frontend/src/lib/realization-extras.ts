import type { DailyRealizationTask } from "@/lib/types"

export type ExtraTaskState = "completed" | "progress" | "no-progress"

export function dailyExtraTaskState(task: DailyRealizationTask): ExtraTaskState | null {
  if (task.in_original_plan) return null
  if (["ADDITIONAL_COMPLETED", "COMPLETED_LATE", "COMPLETED_EARLY"].includes(task.classification)) return "completed"
  if (task.classification === "IN_PROGRESS" || task.current_status === "IN_PROGRESS" || task.progress_today > 0 || task.completed_delta > 0 || (task.quantity?.source === "title" && task.quantity.completed > 0)) return "progress"
  return "no-progress"
}

export const EXTRA_NO_PROGRESS_EXPLANATION =
  "Ekstra pa progres janë ekstrat e pakryera pa status ose progres të regjistruar, përfshirë rastet në pritje ose të shtyra pa progres."
