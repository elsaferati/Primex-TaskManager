import { cn } from "@/lib/utils"
import type { DailyRealizationMetrics, DailyRealizationTask } from "@/lib/types"

export function RealizationQuantitySummary({ metrics }: { metrics: DailyRealizationMetrics }) {
  if (!metrics.quantity_task_count) return null
  return <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-xs">
    <b>Sasi · produkte / pika</b>
    <span>Planifikuar: <b>{metrics.quantity_planned_count}</b></span>
    <span>Kryer: <b>{metrics.quantity_completed_count}</b></span>
    <span>Diferenca: <RealizationQuantityDelta value={metrics.quantity_delta} /></span>
  </div>
}

export function RealizationQuantityDelta({ value }: { value: number }) {
  return <span className={cn("font-semibold tabular-nums", value < 0 ? "text-rose-700" : "text-emerald-700")} title={value === 0 ? "Sasia e planifikuar është kryer" : value < 0 ? "Mungojnë njësi nga plani" : "Njësi mbi planin"}>{value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0 ✓"}</span>
}

export function RealizationTaskQuantity({ quantity }: { quantity: DailyRealizationTask["quantity"] }) {
  if (!quantity) return <span className="text-slate-400">—</span>
  return <div className="space-y-1 text-xs" title={quantity.source === "title" ? "Plani ditor merret nga numri më i vogël në numër/numër; të kryerat nga pikat me strike për këtë ditë." : "Sasia e produkteve të projektit, sipas të dhënave të M3."}>
    <p>Plan: <b>{quantity.planned}</b></p>
    <p>Kryer: <b>{quantity.completed}</b></p>
    <RealizationQuantityDelta value={quantity.delta} />
    <p className="text-[10px] text-slate-500">{quantity.source === "products" ? "Produkte" : "Pika me strike"}</p>
  </div>
}
