"use client"

import * as React from "react"
import { useParams } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import type { Task, TaskStatus, User } from "@/lib/types"

type AuditLog = {
  id: string
  actor_user_id?: string | null
  action: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  created_at: string
}

export default function TaskDetailsPage() {
  const params = useParams<{ id: string }>()
  const taskId = String(params.id)
  const { apiFetch, user } = useAuth()

  const [task, setTask] = React.useState<Task | null>(null)
  const [statuses, setStatuses] = React.useState<TaskStatus[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [audit, setAudit] = React.useState<AuditLog[]>([])

  const canManage = user?.role === "admin" || user?.role === "manager"

  const load = React.useCallback(async () => {
    const taskRes = await apiFetch(`/tasks/${taskId}`)
    if (!taskRes.ok) return
    const t = (await taskRes.json()) as Task
    setTask(t)

    const [sRes, aRes] = await Promise.all([
      apiFetch(`/task-statuses?department_id=${t.department_id}`),
      apiFetch(`/audit-logs?entity_type=task&entity_id=${t.id}`),
    ])
    if (sRes.ok) setStatuses((await sRes.json()) as TaskStatus[])
    if (aRes.ok) setAudit((await aRes.json()) as AuditLog[])

    if (canManage) {
      const uRes = await apiFetch("/users")
      if (uRes.ok) setUsers((await uRes.json()) as User[])
    }
  }, [apiFetch, taskId, canManage])

  React.useEffect(() => {
    void load()
  }, [load])

  const [saving, setSaving] = React.useState(false)
  const [description, setDescription] = React.useState("")
  const [statusId, setStatusId] = React.useState("")
  const [plannedFor, setPlannedFor] = React.useState("")
  const [assignedTo, setAssignedTo] = React.useState("")
  const [milestone, setMilestone] = React.useState(false)
  const [reminder, setReminder] = React.useState(false)

  React.useEffect(() => {
    if (!task) return
    setDescription(task.description || "")
    setStatusId(task.status_id)
    setPlannedFor(task.planned_for || "")
    setAssignedTo(task.assigned_to_user_id || "")
    setMilestone(task.is_milestone)
    setReminder(task.reminder_enabled)
  }, [task])

  const save = async () => {
    if (!task) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        description,
        status_id: statusId,
        reminder_enabled: reminder,
      }
      if (canManage) {
        payload.planned_for = plannedFor || null
        payload.assigned_to_user_id = assignedTo || null
        payload.is_milestone = milestone
      }

      const res = await apiFetch(`/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) return
      await load()
    } finally {
      setSaving(false)
    }
  }

  if (!task) return <div className="text-sm text-muted-foreground">Loading...</div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-lg font-semibold">{task.title}</div>
        <div className="flex flex-wrap gap-1">
          {task.task_type === "system" ? <Badge variant="secondary">System</Badge> : null}
          {task.reminder_enabled ? <Badge variant="secondary">1h Reminder</Badge> : null}
          {task.is_milestone ? <Badge variant="secondary">Milestone</Badge> : null}
          {task.is_carried_over ? <Badge variant="secondary">Carried</Badge> : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusId} onValueChange={setStatusId}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            {canManage ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Planned for</Label>
                  <Input type="date" value={plannedFor} onChange={(e) => setPlannedFor(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Assign to</Label>
                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger>
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Unassigned</SelectItem>
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
              {canManage ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={milestone} onCheckedChange={(v) => setMilestone(Boolean(v))} />
                  Milestone
                </label>
              ) : null}
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

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Audit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {audit.length ? (
              audit.map((a) => (
                <div key={a.id} className="rounded-md border p-3">
                  <div className="text-sm font-medium">{a.action}</div>
                  <div className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No audit entries.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

