"use client"

import { CellPopover } from "@/components/cell-popover"
import { firstLineTitle } from "@/components/realization-deadline-tasks"
import type { DailyRealizationMetrics, RealizationItem, RealizationItemKind } from "@/lib/types"
import { cn } from "@/lib/utils"

const groups: { kind: RealizationItemKind; label: string; className: string }[] = [
  { kind: "COMPLETED", label: "Të kryera nga plani", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  { kind: "EXTRA_COMPLETED", label: "Ekstra të kryera", className: "border-blue-200 bg-blue-50 text-blue-800" },
  { kind: "IN_PROGRESS", label: "Në progres", className: "border-amber-200 bg-amber-50 text-amber-800" },
  { kind: "POSTPONED", label: "Të shtyra", className: "border-violet-200 bg-violet-50 text-violet-800" },
  { kind: "NO_PROGRESS", label: "Pa progres", className: "border-pink-300 bg-pink-100 text-pink-900" },
  { kind: "REASSIGNED_OUT", label: "Kaluar te dikush tjetër", className: "border-slate-200 bg-slate-50 text-slate-700" },
]

function number(value: number) {
  return String(Math.round(value * 100) / 100)
}

function penaltyLabel(item: RealizationItem) {
  if (!item.penalty) return null
  const reason = item.kind === "POSTPONED"
    ? item.deadline ? (item.critical ? "shtyrë, deadline important" : "shtyrë, kishte deadline") : "shtyrë"
    : item.critical ? "deadline important i humbur" : "deadline i humbur"
  return `−${number(item.penalty)} · ${reason}`
}

function ItemRow({ item }: { item: RealizationItem }) {
  const multiDay = item.share < 1
  const penalty = penaltyLabel(item)
  return <li className={cn("flex items-start gap-2 rounded px-1 py-1", item.critical && item.penalty ? "border border-red-300 bg-red-50" : "hover:bg-slate-50")}>
    <span className="min-w-0 flex-1 text-xs leading-4 text-slate-800">{firstLineTitle(item.title)}</span>
    {multiDay ? <span className="shrink-0 whitespace-nowrap text-[10px] text-slate-500" title="Detyrë shumëditore: çdo ditë pune peshon një pjesë të detyrës">1/{Math.round(1 / item.share)} në ditë</span> : null}
    {item.credit ? <span className="shrink-0 whitespace-nowrap text-[10px] font-bold tabular-nums text-emerald-700">+{number(item.credit)}</span> : null}
    {item.approved ? <span className="shrink-0 whitespace-nowrap text-[10px] text-violet-700">aprovuar</span> : null}
    {penalty ? <span className="shrink-0 whitespace-nowrap text-[10px] font-bold text-rose-700">{penalty}</span> : null}
  </li>
}

/** Explains a person's Plan RLZ: the formula with their numbers, then the tasks behind each part. */
export function RealizationPlanRlzPopover({ metrics, title, children }: {
  metrics: DailyRealizationMetrics
  title: string
  children: React.ReactNode
}) {
  const items = metrics.realization_items ?? []
  if (!items.length || metrics.raw_plan_realization == null) return <>{children}</>

  const denominator = metrics.realization_plan_weight || metrics.additional_count
  const uncapped = denominator ? metrics.realization_credit * 100 / denominator : 0
  const base = Math.round(Math.min(100, uncapped) * 10) / 10
  const penalty = metrics.original_planned_count ? Math.round(metrics.realization_penalty_points / metrics.original_planned_count * 10) / 10 : 0

  return <CellPopover
    label={title}
    triggerTitle="Kliko për të parë si u llogarit realizimi"
    width={520}
    panel={<>
      <p className="mb-1 flex items-baseline justify-between gap-2 border-b pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
        <span className="truncate">{title}</span>
        <span className="shrink-0 text-sm font-bold normal-case text-slate-900">{metrics.raw_plan_realization}%</span>
      </p>
      <div className="mb-2 space-y-0.5 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] leading-4 text-slate-700">
        <p>
          <b>Baza:</b> {number(metrics.realization_credit)} kryer ÷ {metrics.realization_plan_weight ? `${number(metrics.realization_plan_weight)} plan` : `${metrics.additional_count} ekstra`} × 100 = <b>{base}%</b>
          {uncapped > 100 ? <span className="text-slate-500"> (kufizuar në 100%)</span> : null}
        </p>
        <p>
          <b>Penalizimi:</b> {number(metrics.realization_penalty_points)} pikë ÷ {metrics.original_planned_count} detyra = <b className={penalty ? "text-rose-700" : undefined}>−{penalty}</b>
        </p>
        <p><b>Final:</b> {base} − {penalty} = <b>{metrics.raw_plan_realization}%</b></p>
      </div>
      <div className="max-h-96 space-y-2 overflow-y-auto overscroll-contain">
        {groups.map((group) => {
          const groupItems = items.filter((item) => item.kind === group.kind)
          if (!groupItems.length) return null
          return <section key={group.kind}>
            <p className={cn("mb-0.5 inline-flex rounded border px-1.5 py-px text-[10px] font-bold uppercase", group.className)}>{group.label} · {groupItems.length}</p>
            <ul className="space-y-0.5">
              {groupItems.map((item, index) => <ItemRow key={`${item.task_id ?? "anonymous"}:${index}`} item={item} />)}
            </ul>
          </section>
        })}
      </div>
    </>}
  >
    {children}
  </CellPopover>
}
