"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

const MARKER_UPDATED_EVENT = "primeflow:task-marker-updated"

export function TaskMarkerComment({ comment, taskId, className }: {
  comment?: string | null
  taskId?: string | null
  className?: string
}) {
  const [current, setCurrent] = React.useState(comment || "")

  React.useEffect(() => setCurrent(comment || ""), [comment])
  React.useEffect(() => {
    if (!taskId) return
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<{ taskId: string; markerComment?: string | null }>).detail
      if (detail?.taskId === taskId) setCurrent(detail.markerComment || "")
    }
    window.addEventListener(MARKER_UPDATED_EVENT, sync)
    return () => window.removeEventListener(MARKER_UPDATED_EVENT, sync)
  }, [taskId])

  const text = current.trim()
  if (!text) return null
  return (
    <span className={cn("block w-fit max-w-full whitespace-pre-wrap break-words rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium leading-snug text-blue-900", className)}>
      <strong>COM:</strong> {text}
    </span>
  )
}
