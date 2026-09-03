"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth"
import { RATING_LABEL, SKILL_CATEGORIES } from "@/lib/skills"
import type { SkillCategory, SkillRecommendation } from "@/lib/types"

const NONE = "__none__"

export function TaskSkillField({
  value,
  onChange,
  disabled = false,
  selectedAssigneeIds = [],
  onSelectCandidate,
}: {
  value?: SkillCategory | null
  onChange: (value: SkillCategory | null) => void
  disabled?: boolean
  selectedAssigneeIds?: string[]
  onSelectCandidate?: (userId: string) => void
}) {
  const { apiFetch, user } = useAuth()
  const [recommendations, setRecommendations] = React.useState<SkillRecommendation[]>([])
  const [loading, setLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState(false)
  const canViewRecommendations = Boolean(user)

  React.useEffect(() => {
    if (!value || !canViewRecommendations) {
      setRecommendations([])
      setLoadError(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    void apiFetch(`/skills/recommendations?category=${encodeURIComponent(value)}`)
      .then(async (response) => {
        if (cancelled) return
        if (!response.ok) {
          setRecommendations([])
          setLoadError(true)
          return
        }
        setRecommendations((await response.json()) as SkillRecommendation[])
      })
      .catch(() => {
        if (!cancelled) {
          setRecommendations([])
          setLoadError(true)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [apiFetch, canViewRecommendations, value])

  const selected = React.useMemo(
    () => recommendations.filter((item) => selectedAssigneeIds.includes(item.user_id)),
    [recommendations, selectedAssigneeIds],
  )

  return (
    <div className="space-y-2">
      <Label>Lloji i punës (Skills Matrix)</Label>
      <Select value={value || NONE} disabled={disabled} onValueChange={(next) => onChange(next === NONE ? null : next as SkillCategory)}>
        <SelectTrigger><SelectValue placeholder="Zgjidh llojin e punës" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Pa kategori</SelectItem>
          {SKILL_CATEGORIES.map((category) => (
            <SelectItem key={category.id} value={category.id}>{category.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Përdoret për të sugjeruar persona sipas preferencave të vetëraportuara; nuk ndryshon caktimin automatikisht.
      </p>
      {canViewRecommendations && value ? (
        <div className="rounded-md border bg-muted/20 p-2.5">
          <div className="mb-2 text-xs font-medium">Kandidatët më të përshtatshëm</div>
          {loading ? <p className="text-xs text-muted-foreground">Duke ngarkuar…</p> : loadError ? (
            <p className="text-xs text-destructive">Rekomandimet nuk u ngarkuan. Provo përsëri pas pak.</p>
          ) : recommendations.length ? (
            <div className="flex flex-wrap gap-2">
              {recommendations.slice(0, 5).map((item) => (
                <button
                  key={item.user_id}
                  type="button"
                  disabled={disabled || !onSelectCandidate || selectedAssigneeIds.includes(item.user_id)}
                  onClick={() => onSelectCandidate?.(item.user_id)}
                  className="flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-muted disabled:cursor-default disabled:opacity-70"
                  title={onSelectCandidate ? "Shto si përgjegjës" : undefined}
                >
                  <span>{item.rank}. {item.name}</span>
                  <Badge variant={item.rating === "A_PLUS" ? "default" : "secondary"} className="h-5 px-1.5 text-[10px]">
                    {RATING_LABEL[item.rating]}
                  </Badge>
                </button>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground">Nuk ka ende vetëvlerësime për këtë kategori.</p>}
          {selected.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Të caktuar: {selected.map((item) => `${item.name} (${RATING_LABEL[item.rating]})`).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
