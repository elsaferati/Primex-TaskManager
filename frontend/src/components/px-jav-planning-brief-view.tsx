import type { PxJavPlanningBrief } from "@/lib/types"

type PxJavPlanningBriefViewProps = {
  brief?: PxJavPlanningBrief | null
  loading?: boolean
}

export function PxJavPlanningBriefView({ brief, loading = false }: PxJavPlanningBriefViewProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-700">
        Duke ngarkuar planifikimin PX JAV...
      </div>
    )
  }

  if (!brief) return null

  const dg = typeof brief.dg !== "boolean"
    ? "—"
    : brief.dg
      ? `Po${brief.dg_kush?.trim() ? ` — KUSH: ${brief.dg_kush.trim()}` : ""}`
      : "Jo"

  const rows = [
    ["DL", brief.dl?.trim() || "—"],
    ["DG", dg],
    ["HAPAT", brief.hapat?.trim() || "—"],
    ["KUSH", brief.kush?.trim() || "—"],
    ["SQ", brief.sq?.trim() || "—"],
  ]

  return (
    <section className="overflow-hidden rounded-xl border border-violet-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-violet-200 bg-violet-50 px-3 py-2">
        <div className="text-sm font-semibold text-violet-950">Planifikimi nga PX JAV</div>
        <div className="text-[10px] font-medium uppercase tracking-wide text-violet-700">Vetëm për lexim</div>
      </div>
      <dl className="divide-y divide-violet-100 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[58px_minmax(0,1fr)]">
            <dt className="bg-violet-50/60 px-2 py-1.5 text-[11px] font-semibold text-violet-700">{label}</dt>
            <dd className="whitespace-pre-wrap break-words px-2 py-1.5 text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
