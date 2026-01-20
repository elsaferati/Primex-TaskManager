"use client"

import * as React from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth"
import { normalizeDueDateInput } from "@/lib/dates"
import type { Task, User, UserLookup } from "@/lib/types"

const TASK_STATUS_OPTIONS = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
] as const

const TASK_PRIORITY_LABELS: Record<string, string> = {
  NORMAL: "Normal",
  HIGH: "High",
}

function toDateInput(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return adjusted.toISOString().slice(0, 10)
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("en-US")
}

function statusLabel(value?: string | null) {
  if (!value) return "-"
  const hit = TASK_STATUS_OPTIONS.find((option) => option.value === value)
  return hit?.label ?? value
}

import { BoldOnlyEditor } from "@/components/bold-only-editor"

export default function TaskDetailsPage() {
  const UNASSIGNED_VALUE = "__unassigned__"
  const params = useParams<{ id: string }>()
  const taskId = String(params.id)
  const searchParams = useSearchParams()
  const router = useRouter()
  const returnTo = searchParams.get("returnTo")
  const { apiFetch, user } = useAuth()

  const [task, setTask] = React.useState<Task | null>(null)
  const [users, setUsers] = React.useState<UserLookup[]>([])

  const load = React.useCallback(async () => {
    const taskRes = await apiFetch(`/tasks/${taskId}`)
    if (!taskRes.ok) return
    const t = (await taskRes.json()) as Task
    setTask(t)

    const uRes = await apiFetch("/users/lookup")
    if (uRes.ok) setUsers((await uRes.json()) as UserLookup[])
  }, [apiFetch, taskId])

  React.useEffect(() => {
    void load()
  }, [load])

  const [saving, setSaving] = React.useState(false)
  const [description, setDescription] = React.useState("")
  const [statusValue, setStatusValue] = React.useState<Task["status"] | "">("")
  const [dueDate, setDueDate] = React.useState("")
  const [assignedTo, setAssignedTo] = React.useState(UNASSIGNED_VALUE)
  const [reminder, setReminder] = React.useState(false)

  React.useEffect(() => {
    if (!task) return
    setDescription(task.description || "")
    setStatusValue(task.status || "")
    setDueDate(toDateInput(task.due_date))
    setAssignedTo(task.assigned_to || UNASSIGNED_VALUE)
    setReminder(Boolean(task.reminder_enabled))
  }, [task])

  const canAssign =
    user?.role === "ADMIN" ||
    user?.role === "MANAGER" ||
    (task && user?.department_id && task.department_id === user.department_id)

  const save = async () => {
    if (!task) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        description,
        reminder_enabled: reminder,
      }
      if (statusValue) payload.status = statusValue
      if (canAssign) {
        payload.due_date = dueDate || null
        payload.assigned_to = assignedTo === UNASSIGNED_VALUE ? null : assignedTo
      }

      const res = await apiFetch(`/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) return
      if (returnTo) {
        router.push(returnTo)
        return
      }
      await load()
    } finally {
      setSaving(false)
    }
  }

  if (!task) return <div className="text-sm text-muted-foreground">Loading...</div>

  const assignedUser = users.find((u) => u.id === task.assigned_to) || null
  const statusText = statusLabel(task.status)
  const priorityText = task.priority ? TASK_PRIORITY_LABELS[task.priority] || task.priority : "-"

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <Card className="border-slate-200/70 bg-white/80 shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (returnTo) {
                      router.push(returnTo)
                    } else {
                      router.back()
                    }
                  }}
                  className="px-0"
                >
                  Back
                </Button>
                <div className="text-2xl font-semibold text-slate-900">{task.title}</div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>Status: {statusText}</span>
                  <span>•</span>
                  <span>Priority: {priorityText}</span>
                  {task.phase ? (
                    <>
                      <span>•</span>
                      <span>Phase: {task.phase}</span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {task.task_type === "system" ? <Badge variant="secondary">System</Badge> : null}
                {task.reminder_enabled ? <Badge variant="secondary">1h Reminder</Badge> : null}
                {task.is_carried_over ? <Badge variant="secondary">Carried</Badge> : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card className="border-slate-200/70 bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm">Update Task</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusValue} onValueChange={(value) => setStatusValue(value as typeof statusValue)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <BoldOnlyEditor value={description} onChange={setDescription} />
              </div>

              {canAssign ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Due date</Label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(normalizeDueDateInput(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Assign to</Label>
                    <Select value={assignedTo} onValueChange={setAssignedTo}>
                      <SelectTrigger>
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                        {users
                          .filter((u) => !u.department_id || u.department_id === task.department_id)
                          .map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.full_name || u.username}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={reminder} onCheckedChange={(v) => setReminder(Boolean(v))} />
                  1h Reminder
                </label>
              </div>

              <div className="flex justify-end">
                <Button disabled={saving} onClick={() => void save()}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/70 bg-white/90 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm">Task Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="grid gap-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Assignee</span>
                    <span className="font-medium text-slate-900">
                      {assignedUser?.full_name || assignedUser?.username || (task.assigned_to ? "Assigned" : "Unassigned")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Due date</span>
                    <span className="font-medium text-slate-900">{formatDate(task.due_date)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-medium text-slate-900">{formatDate(task.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Updated</span>
                    <span className="font-medium text-slate-900">{formatDate(task.updated_at)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Flags</div>
                <div className="flex flex-wrap gap-2">
                  {task.is_bllok ? <Badge variant="secondary">Blocked</Badge> : null}
                  {task.is_1h_report ? <Badge variant="secondary">1H</Badge> : null}
                  {task.is_r1 ? <Badge variant="secondary">R1</Badge> : null}
                  {task.ga_note_origin_id ? <Badge variant="secondary">GA/KA Note</Badge> : null}
                  {!task.is_bllok && !task.is_1h_report && !task.is_r1 && !task.ga_note_origin_id ? (
                    <span className="text-sm text-muted-foreground">No special flags.</span>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

