import type { Task } from "@/lib/types"
import { cn } from "@/lib/utils"

const SYMBOLS: Record<NonNullable<Task["one_h_marker"]>, string> = {
  EXCLAMATION: "!",
  QUESTION: "?",
  KA: "KA",
  GENT: "GENT",
  M2: "M2",
  M3: "M3",
  FLAG: "\u2691",
}

export function TaskOneHMarker({
  marker,
  className,
}: {
  marker?: Task["one_h_marker"]
  className?: string
}) {
  const symbol = marker ? SYMBOLS[marker] : null
  if (!symbol) return null
  return (
    <span
      className={cn(
        "inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-blue-300 bg-blue-50 px-1.5 text-base font-black leading-none text-[#0F2A5F] [text-shadow:0_0_0_currentColor]",
        className
      )}
      title={`Task symbol: ${symbol}`}
      aria-label={`Task symbol ${symbol}`}
    >
      {symbol}
    </span>
  )
}
