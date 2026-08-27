"use client"

import * as React from "react"
import { Check, History, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import type {
  RealizationManagerReviewDimension,
  RealizationManagerReviewItem,
  RealizationManagerReviewMarker,
  RealizationManagerReviewResponse,
} from "@/lib/types"
import { cn } from "@/lib/utils"

const DIMENSIONS: Array<{
  key: RealizationManagerReviewDimension
  title: string
  responseKey: "planning" | "realization"
}> = [
  { key: "PLANNING", title: "PLANIFIKIMI", responseKey: "planning" },
  { key: "REALIZATION", title: "REALIZIMI", responseKey: "realization" },
]

function reviewDate(value: string) {
  return new Intl.DateTimeFormat("sq-AL", {
    timeZone: "Europe/Tirane",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value)).replace(",", " ·")
}

function StatusPill({ marker }: { marker: RealizationManagerReviewMarker }) {
  const positive = marker === "POSITIVE"
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
      positive
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-rose-200 bg-rose-50 text-rose-800",
    )}>
      {positive ? <Check className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
      {positive ? "Mirë" : "Duhet përmirësim"}
    </span>
  )
}

function SavedReview({
  item,
  canEdit,
  onEdit,
  onClear,
  clearing,
}: {
  item: RealizationManagerReviewItem
  canEdit: boolean
  onEdit: () => void
  onClear: () => void
  clearing: boolean
}) {
  return (
    <div className="mt-3 space-y-3">
      <StatusPill marker={item.marker} />
      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">“{item.comment}”</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-xs leading-5 text-slate-500">
          Nga: <span className="font-semibold text-slate-700">{item.created_by_name}</span><br />
          {reviewDate(item.created_at)}
        </p>
        {canEdit ? (
          <div className="flex gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />Ndrysho
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-slate-500 hover:text-rose-700" onClick={onClear} disabled={clearing}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />Hiq
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function RealizationManagerReview({ periodId, userId }: { periodId: string; userId: string }) {
  const { apiFetch } = useAuth()
  const [data, setData] = React.useState<RealizationManagerReviewResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [editing, setEditing] = React.useState<RealizationManagerReviewDimension | null>(null)
  const [marker, setMarker] = React.useState<RealizationManagerReviewMarker | null>(null)
  const [comment, setComment] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [clearing, setClearing] = React.useState<RealizationManagerReviewDimension | null>(null)

  const endpoint = React.useMemo(
    () => `/realization/periods/${periodId}/users/${userId}/manager-review`,
    [periodId, userId],
  )
  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch(endpoint)
      if (!response.ok) throw new Error("Vlerësimi i përgjegjësit nuk u ngarkua")
      setData(await response.json() as RealizationManagerReviewResponse)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Vlerësimi nuk u ngarkua")
    } finally {
      setLoading(false)
    }
  }, [apiFetch, endpoint])

  React.useEffect(() => { queueMicrotask(() => void load()) }, [load])

  const beginEdit = (dimension: RealizationManagerReviewDimension, item: RealizationManagerReviewItem | null) => {
    setEditing(dimension)
    setMarker(item?.marker ?? null)
    setComment(item?.comment ?? "")
  }
  const cancelEdit = () => {
    setEditing(null)
    setMarker(null)
    setComment("")
  }
  const save = async () => {
    if (!editing || !marker || !comment.trim()) {
      toast.error("Zgjidh vlerësimin dhe shkruaj komentin")
      return
    }
    setSaving(true)
    try {
      const response = await apiFetch(`${endpoint}/${editing}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marker, comment: comment.trim() }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { detail?: string }
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Vlerësimi nuk u ruajt")
      }
      setData(await response.json() as RealizationManagerReviewResponse)
      cancelEdit()
      toast.success("Vlerësimi u ruajt")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Vlerësimi nuk u ruajt")
    } finally {
      setSaving(false)
    }
  }
  const clear = async (dimension: RealizationManagerReviewDimension) => {
    setClearing(dimension)
    try {
      const response = await apiFetch(`${endpoint}/${dimension}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Vlerësimi nuk u hoq")
      setData(await response.json() as RealizationManagerReviewResponse)
      toast.success("Vlerësimi u hoq; historia u ruajt")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Vlerësimi nuk u hoq")
    } finally {
      setClearing(null)
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3">
        <p className="text-xs font-bold tracking-[0.14em] text-slate-700">VLERËSIMI I PËRGJEGJËSIT</p>
        <p className="mt-1 text-xs text-slate-500">Vlerësim cilësor; nuk ndryshon metrikat e realizimit.</p>
      </div>
      {loading ? <p className="px-4 py-6 text-sm text-slate-500">Duke ngarkuar…</p> : (
        <div className="grid gap-px bg-slate-200 md:grid-cols-2">
          {DIMENSIONS.map(({ key, title, responseKey }) => {
            const item = data?.[responseKey] ?? null
            const isEditing = editing === key
            return (
              <div key={key} className="bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold tracking-[0.12em] text-slate-600">{title}</p>
                  {!item && data?.can_edit && !isEditing ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => beginEdit(key, null)}>
                      <Plus className="mr-1 h-3.5 w-3.5" />Shto vlerësim
                    </Button>
                  ) : null}
                </div>
                {isEditing ? (
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setMarker("POSITIVE")} className={cn("rounded-lg border px-3 py-2 text-xs font-semibold", marker === "POSITIVE" ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600")}>✓ Mirë</button>
                      <button type="button" onClick={() => setMarker("NEGATIVE")} className={cn("rounded-lg border px-3 py-2 text-xs font-semibold", marker === "NEGATIVE" ? "border-rose-400 bg-rose-50 text-rose-800" : "border-slate-200 text-slate-600")}>⚠ Duhet përmirësim</button>
                    </div>
                    <label className="block text-xs font-semibold text-slate-600">
                      KOMENTI <span className="text-rose-600">*</span>
                      <Textarea className="mt-1.5 min-h-24 font-normal" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Shpjego shkurt vlerësimin…" maxLength={4000} />
                    </label>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>Anulo</Button>
                      <Button type="button" size="sm" className="bg-[#0B63CE] hover:bg-[#0957B7]" onClick={() => void save()} disabled={saving || !marker || !comment.trim()}>Ruaj</Button>
                    </div>
                  </div>
                ) : item ? (
                  <SavedReview item={item} canEdit={Boolean(data?.can_edit)} onEdit={() => beginEdit(key, item)} onClear={() => void clear(key)} clearing={clearing === key} />
                ) : (
                  <p className="mt-3 text-sm text-slate-500">Pa vërejtje nga përgjegjësi</p>
                )}
              </div>
            )
          })}
        </div>
      )}
      {data?.history.some((item) => !item.active) ? (
        <details className="border-t border-slate-200 px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-slate-600"><History className="h-4 w-4" />Historia e vlerësimeve</summary>
          <div className="mt-3 space-y-3 border-l-2 border-slate-200 pl-4">
            {data.history.map((item) => (
              <div key={item.id} className={cn("text-xs", !item.active && "opacity-65")}>
                <p className="font-semibold text-slate-700">{item.dimension === "PLANNING" ? "Planifikimi" : "Realizimi"} · {item.marker === "POSITIVE" ? "✓ Mirë" : "⚠ Duhet përmirësim"}</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-600">“{item.comment}”</p>
                <p className="mt-1 text-slate-400">{item.created_by_name} · {reviewDate(item.created_at)}{item.active ? "" : " · zëvendësuar/hequr"}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  )
}
