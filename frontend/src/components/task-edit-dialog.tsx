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
import { useAuth } from "@/lib/auth"
import { normalizeDueDateInput, toDateInputValue } from "@/lib/dates"
import type { Task } from "@/lib/types"

const TASK_STATUS_OPTIONS = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_CONFIRMATION", label: "Waiting Confirmation" },
  { value: "DONE", label: "Done" },
] as const

type TaskStatusValue = typeof TASK_STATUS_OPTIONS[number]["value"]

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
  const [dueDate, setDueDate] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!task) return
    setTitle(task.title || "")
    setStatusValue((task.status as TaskStatusValue | undefined) || "TODO")
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
      const res = await apiFetch(`/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: nextTitle,
          status: statusValue,
          due_date: dueDate || null,
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
  }, [apiFetch, dueDate, onOpenChange, onUpdated, statusValue, task, title])

  if (!task) return null

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!saving ? onOpenChange(nextOpen) : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
          <DialogDescription>
            Update the title, status, and due date without leaving this table.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-edit-title">Title</Label>
            <Input
              id="task-edit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={saving}
            />
          </div>

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
