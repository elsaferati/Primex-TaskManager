import { cn } from "@/lib/utils"

// Weekly planner and reports show only the first line of a task title, on one line.
// This is roughly what fits in the narrowest planner column before it gets cut with "…".
export const TASK_TITLE_FIRST_LINE_LIMIT = 30

export function TaskTitleLimitHint({ title, className }: { title: string; className?: string }) {
  const firstLine = title.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || ""
  const length = firstLine.length
  const isOver = length > TASK_TITLE_FIRST_LINE_LIMIT

  return (
    <div className={cn("space-y-1 text-xs", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className={isOver ? "font-medium text-red-600" : "text-muted-foreground"}>
          {isOver
            ? "Rreshti i parë është shumë i gjatë, do të pritet në Weekly Planner. Vazhdo në rreshtin e dytë."
            : "Rreshti i parë shfaqet si titull në Weekly Planner. Detajet shkruaji nga rreshti i dytë."}
        </span>
        <span className={cn("shrink-0 font-semibold tabular-nums", isOver ? "text-red-600" : "text-emerald-600")}>
          {length}/{TASK_TITLE_FIRST_LINE_LIMIT}
        </span>
      </div>
      {firstLine ? (
        <div className="rounded border bg-muted/40 px-2 py-1 font-semibold uppercase">
          <span>{firstLine.slice(0, TASK_TITLE_FIRST_LINE_LIMIT)}</span>
          {isOver ? (
            <span className="text-red-600 line-through decoration-red-400">
              {firstLine.slice(TASK_TITLE_FIRST_LINE_LIMIT)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
