import { cn } from "@/lib/utils"
import type { NewsFilter } from "../types"

export const filters: NewsFilter[] = ["For You", "All", "Grants", "Tenders", "Business", "AI & Tech", "Kosovo", "EU", "Events"]

export function NewsFilters({ value, onChange }: { value: NewsFilter; onChange: (value: NewsFilter) => void }) {
  return <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Filter intelligence updates">{filters.map((filter) => <button type="button" key={filter} onClick={() => onChange(filter)} aria-pressed={value === filter} className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#658676]", value === filter ? "bg-[#26372d] text-white" : "text-[#6d7b71] hover:bg-[#edf1ed] hover:text-[#26372d]")}>{filter}</button>)}</div>
}
