import { cn } from "@/lib/utils"

const LEGEND_ITEMS = [
  ["?", "PAQARTESI"],
  ["!", "KËRKON MONITORIM NGA DIKUSH TJETËR"],
  ["M2", "DOREZIM DERI NE PAUZE"],
  ["M3", "DOREZIM DERI NE FUND TE DITES"],
  ["GENT", "PYETJE/SQARIM ME GENTIN"],
  ["KA", "PYETJE/SQARIM ME KA"],
  ["⚑", "PYETJE/SQARIM ME GA"],
] as const

export function TaskOneHMarkerLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-bold text-[#0F2A5F]",
        className
      )}
    >
      <span className="font-bold uppercase">Legjenda:</span>
      {LEGEND_ITEMS.map(([symbol, description], index) => (
        <span key={symbol} className="contents">
          {index > 0 ? (
            <span className="text-lg font-black leading-none text-[#0F2A5F]" aria-hidden="true">/</span>
          ) : null}
          <span>
            <b className={cn("font-black", symbol.length > 1 ? "text-xs" : "text-base")}>{symbol}</b>
            {` - ${description}`}
          </span>
        </span>
      ))}
    </div>
  )
}
