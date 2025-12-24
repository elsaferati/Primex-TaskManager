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
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import type { Task, User } from "@/lib/types"

type AuditLog = {
  id: string
  actor_user_id?: string | null
  action: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  created_at: string
}

const TASK_STATUS_OPTIONS = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "REVIEW", label: "Review" },
  { value: "DONE", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
] as const

function toDateInput(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(0, 10)
}

export default function TaskDetailsPage() {
  const UNASSIGNED_VALUE = "__unassigned__"
  const params = useParams<{ id: string }>()
  const taskId = String(params.id)
  const searchParams = useSearchParams()
  const router = useRouter()
  const returnTo = searchParams.get("returnTo")
  const { apiFetch, user } = useAuth()

  const [task, setTask] = React.useState<Task | null>(null)
  const [users, setUsers] = React.useState<User[]>([])
  const [audit, setAudit] = React.useState<AuditLog[]>([])

  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER"

  const load = React.useCallback(async () => {
    const taskRes = await apiFetch(`/tasks/${taskId}`)
    if (!taskRes.ok) return
    const t = (await taskRes.json()) as Task
    setTask(t)

    const aRes = await apiFetch(`/audit-logs?entity_type=task&entity_id=${t.id}`)
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
  const [statusValue, setStatusValue] = React.useState<Task["status"] | "">("")
  const [dueDate, setDueDate] = React.useState("")
  const [assignedTo, setAssignedTo] = React.useState(UNASSIGNED_VALUE)
  const [milestone, setMilestone] = React.useState(false)
  const [reminder, setReminder] = React.useState(false)

  React.useEffect(() => {
    if (!task) return
    setDescription(task.description || "")
    setStatusValue(task.status || "")
    setDueDate(toDateInput(task.due_date))
    setAssignedTo(task.assigned_to || UNASSIGNED_VALUE)
    setMilestone(task.is_milestone)
    setReminder(task.reminder_enabled)
  }, [task])

  const save = async () => {
    if (!task) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        description,
        reminder_enabled: reminder,
      }
      if (statusValue) payload.status = statusValue
      if (canManage) {
        payload.due_date = dueDate || null
        payload.assigned_to = assignedTo === UNASSIGNED_VALUE ? null : assignedTo
        payload.is_milestone = milestone
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
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
          >
            Back
          </Button>
          <div className="text-lg font-semibold">{task.title}</div>
        </div>
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
              <Select value={statusValue} onValueChange={setStatusValue}>
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
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            {canManage ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Due date</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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

