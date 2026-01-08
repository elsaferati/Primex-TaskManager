"use client"

import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import type { Department, GaNote, Project, TaskFinishPeriod, TaskPriority, UserLookup } from "@/lib/types"

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

const NOTE_TO_TASK_PRIORITY: Record<NotePriority, TaskPriority> = {
  NONE: "NORMAL",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
}

const PRIORITY_OPTIONS: TaskPriority[] = ["NORMAL", "HIGH"]
const FINISH_PERIOD_OPTIONS: TaskFinishPeriod[] = ["AM", "PM"]
const FINISH_PERIOD_NONE_VALUE = "__none__"

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
  const [users, setUsers] = React.useState<UserLookup[]>([])
  const [departmentId, setDepartmentId] = React.useState("ALL")
  const [projectId, setProjectId] = React.useState("NONE")
  const [content, setContent] = React.useState("")
  const [noteType, setNoteType] = React.useState<NoteType>("GA")
  const [priority, setPriority] = React.useState<NotePriority>("NONE")
  const [loading, setLoading] = React.useState(false)
  const [posting, setPosting] = React.useState(false)
  const [taskDialogNoteId, setTaskDialogNoteId] = React.useState<string | null>(null)
  const [creatingTask, setCreatingTask] = React.useState(false)
  const [taskTitle, setTaskTitle] = React.useState("")
  const [taskDescription, setTaskDescription] = React.useState("")
  const [taskPriority, setTaskPriority] = React.useState<TaskPriority>("NORMAL")
  const [taskFinishPeriod, setTaskFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(
    FINISH_PERIOD_NONE_VALUE
  )
  const [taskDueDate, setTaskDueDate] = React.useState("")
  const [taskAssigneeId, setTaskAssigneeId] = React.useState("__unassigned__")
  const [taskDepartmentId, setTaskDepartmentId] = React.useState("__none__")

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

  const loadUsers = React.useCallback(async () => {
    const res = await apiFetch(user?.role === "STAFF" ? "/users/lookup" : "/users")
    if (res?.ok) {
      setUsers((await res.json()) as UserLookup[])
    }
  }, [apiFetch, user?.role])

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
    void loadUsers()
  }, [loadUsers])

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

  const openTaskDialog = (note: GaNote) => {
    const trimmed = note.content.trim()
    const defaultTitle = trimmed ? trimmed.split(/\r?\n/)[0].slice(0, 120) : "GA/KA note task"
    setTaskDialogNoteId(note.id)
    setTaskTitle(defaultTitle)
    setTaskDescription(note.content || "")
    setTaskPriority(note.priority === "HIGH" ? "HIGH" : "NORMAL")
    setTaskFinishPeriod(FINISH_PERIOD_NONE_VALUE)
    setTaskDueDate("")
    setTaskAssigneeId("__unassigned__")
    setTaskDepartmentId(note.department_id ?? "__none__")
  }

  const createTaskFromNote = async (note: GaNote) => {
    if (user?.role === "STAFF") {
      toast.error("Only managers or admins can create tasks")
      return
    }
    if (note.is_converted_to_task) return
    if (!taskTitle.trim()) {
      toast.error("Task title is required")
      return
    }
    const effectiveDepartmentId =
      note.department_id ?? (taskDepartmentId !== "__none__" ? taskDepartmentId : null)
    if (!effectiveDepartmentId) {
      toast.error("Select a department before creating a task")
      return
    }
    setCreatingTask(true)
    try {
      const dueDateValue = taskDueDate ? new Date(taskDueDate).toISOString() : null
      const taskRes = await apiFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskTitle.trim(),
          description: taskDescription.trim() || null,
          status: "TODO",
          priority: taskPriority,
          finish_period: taskFinishPeriod === FINISH_PERIOD_NONE_VALUE ? null : taskFinishPeriod,
          due_date: dueDateValue,
          assigned_to: taskAssigneeId === "__unassigned__" ? null : taskAssigneeId,
          ga_note_origin_id: note.id,
          department_id: effectiveDepartmentId,
          project_id: note.project_id ?? null,
        }),
      })
      if (!taskRes.ok) {
        toast.error("Failed to create task")
        return
      }
      const patchRes = await apiFetch(`/ga-notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_converted_to_task: true }),
      })
      if (patchRes.ok) {
        const updated = (await patchRes.json()) as GaNote
        setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)))
      } else {
        setNotes((prev) =>
          prev.map((n) => (n.id === note.id ? { ...n, is_converted_to_task: true } : n))
        )
      }
      setTaskDialogNoteId(null)
      toast.success("Task created from note")
    } finally {
      setCreatingTask(false)
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
  const taskDialogNote = taskDialogNoteId ? notes.find((n) => n.id === taskDialogNoteId) || null : null
  const taskDepartmentLocked = Boolean(taskDialogNote?.department_id || taskDialogNote?.project_id)
  const effectiveTaskDepartmentId =
    taskDialogNote?.department_id ?? (taskDepartmentId !== "__none__" ? taskDepartmentId : "")
  const taskAssigneeOptions = users.filter(
    (person) => effectiveTaskDepartmentId && person.department_id === effectiveTaskDepartmentId
  )

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
                  <div className="flex flex-wrap items-center gap-2">
                    {!note.is_converted_to_task ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-indigo-300 text-indigo-800 hover:bg-indigo-50"
                        disabled={user?.role === "STAFF"}
                        onClick={() => openTaskDialog(note)}
                      >
                        Create task
                      </Button>
                    ) : (
                      <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Task created</Badge>
                    )}
                        {note.status === "CLOSED" ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Closed</Badge>
                        ) : null}
                      </div>
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
      <Dialog open={Boolean(taskDialogNoteId)} onOpenChange={(open) => (!open ? setTaskDialogNoteId(null) : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Task from Note</DialogTitle>
          </DialogHeader>
          {taskDialogNote ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  rows={4}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={taskPriority} onValueChange={(v) => setTaskPriority(v as TaskPriority)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Finish by (optional)</Label>
                  <Select
                    value={taskFinishPeriod}
                    onValueChange={(value) =>
                      setTaskFinishPeriod(value as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None (all day)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FINISH_PERIOD_NONE_VALUE}>None (all day)</SelectItem>
                      {FINISH_PERIOD_OPTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Due date (optional)</Label>
                  <Input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Select
                    value={effectiveTaskDepartmentId || "__none__"}
                    onValueChange={(value) => {
                      setTaskDepartmentId(value)
                      setTaskAssigneeId("__unassigned__")
                    }}
                    disabled={taskDepartmentLocked}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select department</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Assign to</Label>
                <Select
                  value={taskAssigneeId}
                  onValueChange={setTaskAssigneeId}
                  disabled={!effectiveTaskDepartmentId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned__">Unassigned</SelectItem>
                    {taskAssigneeOptions.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.full_name || person.username || person.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!effectiveTaskDepartmentId ? (
                  <p className="text-xs text-muted-foreground">Select a department to choose an assignee.</p>
                ) : null}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTaskDialogNoteId(null)}>
                  Cancel
                </Button>
                <Button disabled={creatingTask} onClick={() => void createTaskFromNote(taskDialogNote)}>
                  {creatingTask ? "Creating..." : "Create task"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
