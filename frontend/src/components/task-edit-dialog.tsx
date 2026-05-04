"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import { normalizeDueDateInput, toDateInputValue } from "@/lib/dates"
import type { Task } from "@/lib/types"

const TASK_STATUS_OPTIONS = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_CONFIRMATION", label: "Waiting Confirmation" },
  { value: "DONE", label: "Done" },
] as const

const FAST_TASK_TYPES = [
  { value: "N", label: "N (Normal)" },
  { value: "BLL", label: "BLL (BLLOK)" },
  { value: "R1", label: "R1" },
  { value: "1H", label: "1H (1 Hour Report)" },
  { value: "P:", label: "P: (Personal)" },
] as const

const PROJECT_TASK_TYPES = [
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "1H", label: "1H (1 Hour Report)" },
  { value: "R1", label: "R1" },
  { value: "PERSONAL", label: "P: (Personal)" },
  { value: "BLLOK", label: "BLLOK" },
] as const

type TaskStatusValue = typeof TASK_STATUS_OPTIONS[number]["value"]
type FastTaskTypeValue = typeof FAST_TASK_TYPES[number]["value"]
type ProjectTaskTypeValue = typeof PROJECT_TASK_TYPES[number]["value"]

function getCurrentFastTaskType(task: Task | null): FastTaskTypeValue {
  if (!task) return "N"
  if (task.is_bllok) return "BLL"
  if (task.is_r1) return "R1"
  if (task.is_1h_report) return "1H"
  if (task.is_personal) return "P:"
  return "N"
}

function isFastTask(task: Task | null) {
  if (!task) return false
  return task.project_id == null && task.dependency_task_id == null && task.system_template_origin_id == null
}

function isProjectTask(task: Task | null) {
  if (!task) return false
  return task.project_id != null && task.system_template_origin_id == null
}

function getCurrentProjectTaskType(task: Task | null): ProjectTaskTypeValue {
  if (!task) return "NORMAL"
  if (task.is_1h_report) return "1H"
  if (task.is_r1) return "R1"
  if (task.is_personal) return "PERSONAL"
  if (task.is_bllok) return "BLLOK"
  if (task.priority === "HIGH") return "HIGH"
  return "NORMAL"
}

export function TaskEditDialog({
  task,
  open,
  onOpenChange,
  onUpdated,
}: {
  task: Task | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: (task: Task) => void | Promise<void>
}) {
  const { apiFetch } = useAuth()
  const [title, setTitle] = React.useState("")
  const [statusValue, setStatusValue] = React.useState<TaskStatusValue>("TODO")
  const [fastTaskType, setFastTaskType] = React.useState<FastTaskTypeValue>("N")
  const [projectTaskType, setProjectTaskType] = React.useState<ProjectTaskTypeValue>("NORMAL")
  const [dueDate, setDueDate] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!task) return
    setTitle(task.title || "")
    setStatusValue((task.status as TaskStatusValue | undefined) || "TODO")
    setFastTaskType(getCurrentFastTaskType(task))
    setProjectTaskType(getCurrentProjectTaskType(task))
    setDueDate(toDateInputValue(task.due_date))
  }, [task])

  const statusOptions = React.useMemo(() => {
    if (!task) return TASK_STATUS_OPTIONS
    return TASK_STATUS_OPTIONS.filter((option) => {
      if (option.value !== "WAITING_CONFIRMATION") return true
      return Boolean(task.confirmation_assignee_id || task.status === "WAITING_CONFIRMATION")
    })
  }, [task])

  const closeDialog = React.useCallback(() => {
    if (saving) return
    onOpenChange(false)
  }, [onOpenChange, saving])

  const handleSave = React.useCallback(async () => {
    if (!task) return

    const nextTitle = title.trim()
    if (nextTitle.length < 2) {
      toast.error("Title must be at least 2 characters.")
      return
    }

    if (statusValue === "WAITING_CONFIRMATION" && !task.confirmation_assignee_id) {
      toast.error("This task needs a confirmation assignee before it can use Waiting Confirmation.")
      return
    }

    setSaving(true)
    try {
      const currentFastTaskType = getCurrentFastTaskType(task)
      const currentProjectTaskType = getCurrentProjectTaskType(task)
      const res = await apiFetch(`/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: nextTitle,
          status: statusValue,
          due_date: dueDate || null,
          ...(isFastTask(task) && fastTaskType !== currentFastTaskType
            ? {
                is_bllok: fastTaskType === "BLL",
                is_r1: fastTaskType === "R1",
                is_1h_report: fastTaskType === "1H",
                is_personal: fastTaskType === "P:",
              }
            : {}),
          ...(isProjectTask(task) && projectTaskType !== currentProjectTaskType
            ? {
                priority: projectTaskType === "HIGH" ? "HIGH" : "NORMAL",
                is_1h_report: projectTaskType === "1H",
                is_r1: projectTaskType === "R1",
                is_personal: projectTaskType === "PERSONAL",
                is_bllok: projectTaskType === "BLLOK",
              }
            : {}),
        }),
      })

      if (!res.ok) {
        let detail = "Failed to update task."
        try {
          const payload = (await res.json()) as { detail?: string }
          if (payload?.detail) detail = payload.detail
        } catch {
          // Ignore non-JSON error bodies.
        }
        throw new Error(detail)
      }

      const updatedTask = (await res.json()) as Task
      await onUpdated(updatedTask)
      toast.success("Task updated")
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update task."
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }, [apiFetch, dueDate, fastTaskType, onOpenChange, onUpdated, projectTaskType, statusValue, task, title])

  if (!task) return null

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!saving ? onOpenChange(nextOpen) : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>
            Update the title, type, status, and due date without leaving this table.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-edit-title">Title</Label>
            <Textarea
              id="task-edit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoResize
              rows={3}
              className="min-h-[88px] resize-none whitespace-pre-wrap [overflow-wrap:anywhere]"
              disabled={saving}
            />
          </div>

          {isFastTask(task) ? (
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={fastTaskType} onValueChange={(value) => setFastTaskType(value as FastTaskTypeValue)}>
                <SelectTrigger disabled={saving}>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {FAST_TASK_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {isProjectTask(task) ? (
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={projectTaskType} onValueChange={(value) => setProjectTaskType(value as ProjectTaskTypeValue)}>
                <SelectTrigger disabled={saving}>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TASK_TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={statusValue} onValueChange={(value) => setStatusValue(value as TaskStatusValue)}>
              <SelectTrigger disabled={saving}>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-edit-due-date">Due date</Label>
            <Input
              id="task-edit-due-date"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(normalizeDueDateInput(event.target.value))}
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={closeDialog} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
