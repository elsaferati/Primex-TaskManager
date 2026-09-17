"use client"

import * as React from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import type { RealizationManagerReviewResponse, RealizationManagerReviewRating } from "@/lib/types"

const RATINGS: Record<RealizationManagerReviewRating, string> = {
  GOOD: "Mirë", VERY_GOOD: "Shumë mirë", ACTION_REQUIRED: "Kërkon veprim", BAD: "Keq",
}

export function RealizationReviewCells({ periodId, userId, userName, locked = false, onSaved, refreshKey }: {
  periodId: string; userId: string; userName: string; locked?: boolean; onSaved?: () => void; refreshKey?: unknown
}) {
  const { apiFetch } = useAuth()
  const [data, setData] = React.useState<RealizationManagerReviewResponse | null>(null)
  const [rating, setRating] = React.useState<RealizationManagerReviewRating | "">("")
  const [comment, setComment] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const endpoint = `/realization/periods/${periodId}/users/${userId}/manager-review`
  React.useEffect(() => {
    if (!periodId) return
    let cancelled = false
    void (async () => {
      try {
        const response = await apiFetch(endpoint)
        if (!response.ok) throw new Error()
        const payload = await response.json() as RealizationManagerReviewResponse
        if (cancelled) return
        setData(payload)
        setRating(payload.realization?.rating ?? (payload.realization ? payload.realization.marker === "POSITIVE" ? "GOOD" : "ACTION_REQUIRED" : ""))
        setComment(payload.realization?.comment ?? "")
        setFailed(false)
      } catch { if (!cancelled) setFailed(true) }
    })()
    return () => { cancelled = true }
  }, [apiFetch, endpoint, periodId, refreshKey])
  const canEdit = data?.can_edit && data.period_id === periodId && data.user_id === userId && !locked && Boolean(periodId)
  const savedRating = data?.realization?.rating ?? (data?.realization ? data.realization.marker === "POSITIVE" ? "GOOD" : "ACTION_REQUIRED" : "")
  const dirty = rating !== savedRating || comment !== (data?.realization?.comment ?? "")
  const save = async () => {
    if (!rating || !comment.trim()) return
    setSaving(true)
    try {
      const response = await apiFetch(`${endpoint}/REALIZATION`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, marker: ["GOOD", "VERY_GOOD"].includes(rating) ? "POSITIVE" : "NEGATIVE", comment: comment.trim() }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Vlerësimi nuk u ruajt")
      }
      const payload = await response.json() as RealizationManagerReviewResponse
      setData(payload)
      setComment(payload.realization?.comment ?? "")
      onSaved?.()
      toast.success("Vlerësimi dhe komenti u ruajtën")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Vlerësimi nuk u ruajt") }
    finally { setSaving(false) }
  }
  return <>
    <td className="p-1.5" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <select aria-label={`Statusi i realizimit për ${userName}`} value={rating} onChange={(event) => setRating(event.target.value as RealizationManagerReviewRating)} disabled={!canEdit || saving} className="h-8 w-full min-w-32 rounded border bg-white px-2 text-xs disabled:opacity-70">
        <option value="">{failed ? "Gabim ngarkimi" : data ? "Pa vlerësim" : "Duke ngarkuar…"}</option>
        {Object.entries(RATINGS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </td>
    <td className="p-1.5" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <div className="flex items-start gap-1">
        <textarea aria-label={`Komenti i përgjegjësit për ${userName}`} value={comment} onChange={(event) => setComment(event.target.value)} disabled={!canEdit || saving} rows={1} maxLength={4000} placeholder="Komenti i përgjegjësit…" className="min-h-8 w-full min-w-48 rounded border px-2 py-1.5 text-xs disabled:bg-slate-50" />
        {canEdit && dirty ? <Button size="sm" className="h-8 px-2" disabled={saving || !rating || !comment.trim()} onClick={() => void save()}>{saving ? "…" : "Ruaj"}</Button> : null}
      </div>
      {data?.realization ? <p className="mt-1 text-[10px] text-slate-500">{data.realization.created_by_name} · {new Date(data.realization.created_at).toLocaleDateString("sq-AL")}</p> : null}
    </td>
  </>
}

