"use client"

import * as React from "react"
import { toast } from "sonner"

import { useAuth } from "@/lib/auth"
import type { Task } from "@/lib/types"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type TaskMarker = NonNullable<Task["one_h_marker"]>

const NONE = "__none__"
const MARKER_UPDATED_EVENT = "primeflow:task-marker-updated"
const OPTIONS: Array<{ value: TaskMarker; label: string }> = [
  { value: "EXCLAMATION", label: "!" },
  { value: "QUESTION", label: "?" },
  { value: "KA", label: "KA" },
  { value: "GENT", label: "GENT" },
  { value: "M2", label: "M2" },
  { value: "M3", label: "M3" },
  { value: "FLAG", label: "⚑" },
]

export function TaskOneHMarkerEditor({
  taskId,
  marker,
  className,
}: {
  taskId?: string | null
  marker?: Task["one_h_marker"]
  className?: string
}) {
  const { apiFetch } = useAuth()
  const [value, setValue] = React.useState<TaskMarker | typeof NONE>(marker || NONE)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => setValue(marker || NONE), [marker])
  React.useEffect(() => {
    const syncMarker = (event: Event) => {
      const detail = (event as CustomEvent<{ taskId: string; marker: TaskMarker | null }>).detail
      if (detail?.taskId === taskId) setValue(detail.marker || NONE)
    }
    window.addEventListener(MARKER_UPDATED_EVENT, syncMarker)
    return () => window.removeEventListener(MARKER_UPDATED_EVENT, syncMarker)
  }, [taskId])

  const updateMarker = async (nextValue: string) => {
    if (!taskId || saving) return
    const previous = value
    const next = nextValue as TaskMarker | typeof NONE
    setValue(next)
    setSaving(true)
    try {
      const response = await apiFetch(`/tasks/${taskId}/one-h-marker`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ one_h_marker: next === NONE ? null : next }),
      })
      if (!response?.ok) throw new Error("Could not update task symbol")
      window.dispatchEvent(new CustomEvent(MARKER_UPDATED_EVENT, {
        detail: { taskId, marker: next === NONE ? null : next },
      }))
      toast.success("Task symbol updated")
    } catch (error) {
      setValue(previous)
      toast.error("Task symbol update failed", { description: String(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Select value={value} onValueChange={(next) => void updateMarker(next)} disabled={!taskId || saving}>
      <SelectTrigger
        className={`h-7 min-w-[64px] max-w-[82px] border-blue-300 bg-blue-50 px-2 text-base font-black text-[#0F2A5F] [text-shadow:0_0_0_currentColor] ${className || ""}`}
        aria-label="Task symbol"
        title="Edit task symbol"
        onClick={(event) => event.stopPropagation()}
      >
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent className="font-black text-[#0F2A5F]">
        <SelectItem value={NONE}>—</SelectItem>
        {OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
