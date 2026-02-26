"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { API_HTTP_URL } from "@/lib/config"

type PublicGaNote = {
  id: string
  content: string
  note_type: "GA" | "KA"
  status: "OPEN" | "CLOSED"
  created_at: string
}

const TYPE_BADGE: Record<PublicGaNote["note_type"], string> = {
  GA: "bg-amber-100 text-amber-800 border-amber-200",
  KA: "bg-cyan-100 text-cyan-800 border-cyan-200",
}

function formatShortDate(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  const day = date.getDate().toString().padStart(2, "0")
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${day}.${month} ${hours}:${minutes}`
}

export default function WatchGaNotesPage() {
  const [notes, setNotes] = React.useState<PublicGaNote[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const loadNotes = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_HTTP_URL}/public/ga-notes`, { cache: "no-store" })
      if (!res.ok) {
        setError("Could not load GA notes.")
        return
      }
      const data = (await res.json()) as PublicGaNote[]
      setNotes(data)
    } catch {
      setError("Could not load GA notes.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  return (
    <div className="space-y-3 text-sm">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">GA Notes</h1>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-sm"
            onClick={() => void loadNotes()}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
        <div className="text-xs text-slate-500">Watch view</div>
      </header>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
      ) : null}

      {loading && notes.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-500">Loading notes...</div>
      ) : null}

      {!loading && notes.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-500">
          No notes to show.
        </div>
      ) : null}

      <div className="space-y-2">
        {notes.map((note) => (
          <div key={note.id} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="outline" className={`h-6 px-2 text-xs ${TYPE_BADGE[note.note_type]}`}>
                {note.note_type}
              </Badge>
              <span className="text-xs text-slate-500">{formatShortDate(note.created_at)}</span>
            </div>
            <div
              className="mt-1 text-sm text-slate-800"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {note.content || "-"}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
