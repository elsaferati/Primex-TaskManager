"use client"

import * as React from "react"
import { Gem, Trash2 } from "lucide-react"

import { DiamondAward, TaskReviewDialog } from "@/components/task-review-dialog"
import { useConfirm } from "@/components/providers/confirm-dialog-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/lib/auth"
import type { Task, TaskReview, TaskReviewOverviewRow } from "@/lib/types"


export function TaskReviewsPanel({ task }: { task: Task }) {
  const { apiFetch, user } = useAuth()
  const confirm = useConfirm()
  const [reviews, setReviews] = React.useState<TaskReview[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedRow, setSelectedRow] = React.useState<TaskReviewOverviewRow | null>(null)
  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER"

  const assignees = React.useMemo(() => {
    if (task.assignees?.length) return task.assignees
    if (task.assigned_to) {
      return [{ id: task.assigned_to, full_name: "Assigned user" }]
    }
    return []
  }, [task.assigned_to, task.assignees])
  const visibleAssignees = assignees

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/task-reviews/task/${task.id}`)
      if (res.ok) setReviews((await res.json()) as TaskReview[])
    } finally {
      setLoading(false)
    }
  }, [apiFetch, task.id])

  React.useEffect(() => {
    void load()
  }, [load])

  const openReview = (assigneeId: string, assigneeName: string) => {
    const review = reviews.find((item) => item.reviewee_user_id === assigneeId) ?? null
    setSelectedRow({
      task_id: task.id,
      task_title: task.title,
      project_id: task.project_id,
      department_id: task.department_id,
      reviewee_user_id: assigneeId,
      reviewee_name: assigneeName,
      completed_at: task.completed_at || task.updated_at,
      due_date: task.due_date,
      is_late: Boolean(task.completed_at && task.due_date && task.completed_at > task.due_date),
      review,
    })
  }

  const deleteReview = async (review: TaskReview) => {
    const approved = await confirm({
      title: "Delete review",
      description: `Delete the review for ${review.reviewee_name}?`,
      confirmLabel: "Delete",
      variant: "destructive",
    })
    if (!approved) return
    const res = await apiFetch(`/task-reviews/${review.id}`, { method: "DELETE" })
    if (res.ok) await load()
  }

  return (
    <>
      <Card className="border-slate-200/70 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Gem className="h-4 w-4 text-cyan-600" />
            Reviews
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading reviews...</div>
          ) : visibleAssignees.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              {assignees.length === 0 ? "This task has no assignee." : "No review is available to you."}
            </div>
          ) : (
            visibleAssignees.map((assignee) => {
              const review = reviews.find((item) => item.reviewee_user_id === assignee.id)
              const assigneeName = assignee.full_name || assignee.username || assignee.email || "User"
              return (
                <div key={assignee.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{assigneeName}</span>
                    {review ? (
                      <div className="flex items-center gap-2">
                        <DiamondAward compact />
                        <span className="text-xs font-semibold">Diamond</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {task.status === "DONE" ? "Not reviewed" : "Available after completion"}
                      </span>
                    )}
                  </div>
                  {review?.comment ? <p className="mt-2 text-sm text-slate-600">{review.comment}</p> : null}
                  {review ? (
                    <p className="mt-1 text-xs text-muted-foreground">By {review.reviewer_name}</p>
                  ) : null}
                  {task.status === "DONE" && assignee.id !== user?.id && (!review || canManage) ? (
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openReview(assignee.id, assigneeName)}
                      >
                        {review ? "Edit review" : "Review task"}
                      </Button>
                      {review && canManage ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          aria-label="Delete review"
                          onClick={() => void deleteReview(review)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <TaskReviewDialog
        row={selectedRow}
        open={Boolean(selectedRow)}
        onOpenChange={(open) => {
          if (!open) setSelectedRow(null)
        }}
        onSaved={async () => {
          await load()
        }}
      />
    </>
  )
}
