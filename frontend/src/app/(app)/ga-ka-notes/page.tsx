"use client"

import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import type { Department, GaNote, Project } from "@/lib/types"

type NoteType = "GA" | "KA"
type NotePriority = "NORMAL" | "HIGH" | "NONE"

const TYPE_BADGE: Record<NoteType, string> = {
  GA: "bg-amber-100 text-amber-800 border-amber-200",
  KA: "bg-cyan-100 text-cyan-800 border-cyan-200",
}

const PRIORITY_BADGE: Record<Exclude<NotePriority, "NONE">, string> = {
  NORMAL: "bg-emerald-100 text-emerald-800 border-emerald-200",
  HIGH: "bg-rose-100 text-rose-800 border-rose-200",
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function GaKaNotesPage() {
  const { user, apiFetch } = useAuth()
  const [notes, setNotes] = React.useState<GaNote[]>([])
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [projects, setProjects] = React.useState<Project[]>([])
  const [departmentId, setDepartmentId] = React.useState("ALL")
  const [projectId, setProjectId] = React.useState("NONE")
  const [content, setContent] = React.useState("")
  const [noteType, setNoteType] = React.useState<NoteType>("GA")
  const [priority, setPriority] = React.useState<NotePriority>("NONE")
  const [loading, setLoading] = React.useState(false)
  const [posting, setPosting] = React.useState(false)

  // Default department for staff
  React.useEffect(() => {
    if (user?.department_id && departmentId === "ALL") {
      setDepartmentId(user.department_id)
    }
  }, [departmentId, user])

  const loadDepartments = React.useCallback(async () => {
    const res = await apiFetch("/departments")
    if (res?.ok) {
      setDepartments((await res.json()) as Department[])
    }
  }, [apiFetch])

  const loadProjects = React.useCallback(
    async (deptId?: string) => {
      const query = deptId ? `?department_id=${deptId}` : ""
      const res = await apiFetch(`/projects${query}`)
      if (res?.ok) {
        setProjects((await res.json()) as Project[])
      }
    },
    [apiFetch]
  )

  const fetchNotes = React.useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      let url = "/ga-notes"
      const params = new URLSearchParams()
      if (projectId !== "NONE") params.set("project_id", projectId)
      else if (departmentId && departmentId !== "ALL") params.set("department_id", departmentId)
      url += params.toString() ? `?${params}` : ""
      const res = await apiFetch(url)
      if (res?.ok) {
        setNotes((await res.json()) as GaNote[])
      } else {
        toast.error("Could not load GA/KA notes")
      }
    } finally {
      setLoading(false)
    }
  }, [apiFetch, departmentId, projectId, user])

  React.useEffect(() => {
    void loadDepartments()
  }, [loadDepartments])

  React.useEffect(() => {
    const effectiveDept = departmentId && departmentId !== "ALL" ? departmentId : undefined
    void loadProjects(effectiveDept)
  }, [departmentId, loadProjects])

  React.useEffect(() => {
    void fetchNotes()
  }, [fetchNotes])

  const createNote = async () => {
    if (!content.trim()) {
      toast.error("Content is required")
      return
    }
    // Staff must target their department or a project
    if (user?.role === "STAFF" && !projectId && !departmentId) {
      toast.error("Select a department or project")
      return
    }
    setPosting(true)
    try {
      const res = await apiFetch("/ga-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          note_type: noteType,
          priority: priority === "NONE" ? null : priority,
          department_id: projectId !== "NONE" ? null : departmentId !== "ALL" ? departmentId : null,
          project_id: projectId !== "NONE" ? projectId : null,
        }),
      })
      if (!res?.ok) {
        toast.error("Failed to create note")
        return
      }
      const created = (await res.json()) as GaNote
      setNotes((prev) => [...prev, created])
      setContent("")
    } finally {
      setPosting(false)
    }
  }

  const closeNote = async (id: string) => {
    const res = await apiFetch(`/ga-notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CLOSED" }),
    })
    if (res?.ok) {
      const updated = (await res.json()) as GaNote
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)))
    } else {
      toast.error("Failed to update note")
    }
  }

  const projectOptions = projects.filter((p) => !departmentId || departmentId === "ALL" || p.department_id === departmentId)

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-gradient-to-r from-amber-50 via-indigo-50 to-cyan-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-primary/80 uppercase">Department Notes</div>
            <div className="text-2xl font-semibold leading-tight mt-1 text-slate-900">GA/KA Notes</div>
            <div className="text-sm text-muted-foreground mt-1">
              Capture decisions, asks, and follow-ups. Keep it crisp and actionable.
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary" className="px-3 py-1 rounded-full shadow-sm bg-emerald-100 text-emerald-800">
              Open: {notes.filter((n) => n.status !== "CLOSED").length}
            </Badge>
            <Badge variant="outline" className="px-3 py-1 rounded-full border-indigo-200 text-indigo-800">
              Total: {notes.length}
            </Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">New note</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Note type</Label>
              <Select value={noteType} onValueChange={(v) => setNoteType(v as NoteType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GA">GA</SelectItem>
                  <SelectItem value="KA">KA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as NotePriority)}>
                <SelectTrigger>
                  <SelectValue placeholder="No priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No priority</SelectItem>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {user?.role !== "STAFF" && (
              <div className="space-y-2">
                <Label>Department (optional)</Label>
                <Select value={departmentId} onValueChange={(v) => setDepartmentId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Project (optional)</Label>
              <Select value={projectId} onValueChange={(v) => setProjectId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No project</SelectItem>
                  {projectOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title || p.name || "Untitled project"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Content</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Capture the takeaway or ask. Be clear, action-oriented, and include owners or due dates."
              rows={6}
              className="min-h-[220px] resize-none text-base md:text-lg bg-primary/5 border-primary/40 shadow-[0_0_0_1px_rgba(0,0,0,0.04)] focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:border-primary"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Tip: Include the who/what/when so the note is actionable later.
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void createNote()} disabled={posting}>
              {posting ? "Saving..." : "Save note"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading notes...</div>
          ) : notes.length === 0 ? (
            <div className="text-sm text-muted-foreground">No notes yet.</div>
          ) : (
            <div className="grid gap-3">
              {notes.map((note) => (
                <Card
                  key={note.id}
                  className="border border-primary/10 bg-gradient-to-br from-white via-primary/5 to-transparent shadow-sm"
                >
                  <CardContent className="flex flex-col gap-3 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge className={TYPE_BADGE[note.note_type] ?? ""}>{note.note_type}</Badge>
                          <Badge
                            className={
                              note.priority && note.priority !== "NONE"
                                ? PRIORITY_BADGE[note.priority as Exclude<NotePriority, "NONE">]
                                : "border border-slate-200 text-slate-700 bg-slate-50"
                            }
                          >
                            {note.priority || "No priority"}
                          </Badge>
                          <span>Created: {formatDate(note.created_at)}</span>
                        </div>
                        <div className="text-base font-medium leading-relaxed">{note.content}</div>
                      </div>
                      {note.status !== "CLOSED" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                          onClick={() => void closeNote(note.id)}
                        >
                          Mark done
                        </Button>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Closed</Badge>
                      )}
                    </div>
                    {note.project_id || note.department_id ? (
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                        {note.project_id ? (
                          <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Project</Badge>
                        ) : null}
                        {note.department_id ? (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200">Department</Badge>
                        ) : null}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
