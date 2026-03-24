"use client"

import * as React from "react"
import { toast } from "sonner"

import { TaskEditDialog } from "@/components/task-edit-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/lib/auth"
import { formatDateDMY, toDateInputValue } from "@/lib/dates"
import type { Department, Task, User } from "@/lib/types"
import { weeklyPlanStatusBgClass } from "@/lib/weekly-plan-status"

const ALL_USERS_VALUE = "__all__"
const VIEW_ALL = "all"
const VIEW_TODAY = "today"
const VIEW_OVERDUE = "overdue"
const VIEW_TODAY_OVERDUE = "today_overdue"

type ViewFilter = typeof VIEW_ALL | typeof VIEW_TODAY | typeof VIEW_OVERDUE | typeof VIEW_TODAY_OVERDUE

type RowView = {
  task: Task
  id: string
  title: string
  assigneeIds: string[]
  assigneeLabel: string
  startDateIso: string
  dueDateIso: string
  priority: string
  lateDays: number | null
  status: string
  statusClassName: string
  canEdit: boolean
  canMarkDone: boolean
}

function userLabel(user?: User | null) {
  if (!user) return ""
  return user.full_name || user.username || user.email || ""
}

function isoOrEmpty(value?: string | null) {
  return toDateInputValue(value || null)
}

function taskAssigneeInfo(task: Task, usersById: Map<string, User>) {
  const seen = new Set<string>()
  const ids: string[] = []
  const labels: string[] = []

  const pushUser = (id?: string | null, fallbackLabel?: string | null) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    ids.push(id)
    const label = userLabel(usersById.get(id)) || fallbackLabel || id
    labels.push(label)
  }

  if (task.assignees?.length) {
    for (const assignee of task.assignees) {
      pushUser(assignee.id, assignee.full_name || assignee.username || assignee.email || null)
    }
  }

  pushUser(task.assigned_to)

  return {
    ids,
    label: labels.length ? labels.join(", ") : "Unassigned",
  }
}

function isOpenStatus(status: string) {
  return status === "TODO" || status === "IN_PROGRESS" || status === "WAITING_CONFIRMATION"
}

function rowMatchesToday(row: RowView, todayIso: string) {
  return [row.startDateIso, row.dueDateIso].filter(Boolean).includes(todayIso)
}

function isIsoWithinInclusiveRange(value: string, from: string, to: string) {
  if (!value) return false
  if (from && value < from) return false
  if (to && value > to) return false
  return true
}

function rowMatchesDateFilter(row: RowView, dateFrom: string, dateTo: string) {
  const candidateDates = [row.startDateIso, row.dueDateIso].filter(Boolean)
  if (!candidateDates.length) return false
  if (!dateFrom && !dateTo) return true
  if (dateFrom && !dateTo) return candidateDates.includes(dateFrom)
  if (!dateFrom && dateTo) return candidateDates.includes(dateTo)
  const start = dateFrom <= dateTo ? dateFrom : dateTo
  const end = dateFrom <= dateTo ? dateTo : dateFrom
  return candidateDates.some((value) => isIsoWithinInclusiveRange(value, start, end))
}

function rowSortDate(row: RowView) {
  return row.dueDateIso || row.startDateIso || ""
}

function rowPriorityRank(row: RowView) {
  const isLate = (row.lateDays ?? 0) > 0
  const isOpen = isOpenStatus(row.status)

  if (isLate && isOpen) return 0
  if (row.status === "TODO") return 1
  if (row.status === "IN_PROGRESS") return 2
  if (row.status === "WAITING_CONFIRMATION") return 3
  if (isOpen) return 4
  if (row.status === "DONE") return 6
  return 5
}

export default function DepartmentKanban() {
  const { apiFetch, user } = useAuth()
  const [department, setDepartment] = React.useState<Department | null>(null)
  const [tasks, setTasks] = React.useState<Task[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = React.useState<string>(ALL_USERS_VALUE)
  const [viewFilter, setViewFilter] = React.useState<ViewFilter>(VIEW_ALL)
  const [dateFrom, setDateFrom] = React.useState("")
  const [dateTo, setDateTo] = React.useState("")
  const [showDone, setShowDone] = React.useState(false)
  const [updatingTaskIds, setUpdatingTaskIds] = React.useState<Record<string, boolean>>({})
  const [editingTask, setEditingTask] = React.useState<Task | null>(null)
  const todayIso = React.useMemo(() => toDateInputValue(new Date()), [])

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [departmentsRes, usersRes] = await Promise.all([apiFetch("/departments"), apiFetch("/users")])
      if (!departmentsRes.ok || !usersRes.ok) {
        throw new Error("Unable to load Finance department data.")
      }

      const nextDepartments = (await departmentsRes.json()) as Department[]
      const nextUsers = (await usersRes.json()) as User[]
      const financeDepartment =
        nextDepartments.find((entry) => entry.code.toUpperCase() === "FIN") ||
        nextDepartments.find((entry) => entry.name.trim().toLowerCase() === "finance")

      if (!financeDepartment) {
        throw new Error("Finance department was not found.")
      }

      const tasksRes = await apiFetch(
        `/tasks?department_id=${encodeURIComponent(financeDepartment.id)}&include_done=true&include_all_done=true`
      )

      if (!tasksRes.ok) {
        throw new Error("Unable to load Finance tasks.")
      }

      const nextTasks = (await tasksRes.json()) as Task[]
      const financeUsers = nextUsers.filter(
        (entry) => entry.is_active && entry.department_id === financeDepartment.id
      )

      setDepartment(financeDepartment)
      setUsers(nextUsers)
      setTasks(nextTasks)
      setSelectedUserId((prev) => {
        if (prev !== ALL_USERS_VALUE && nextUsers.some((entry) => entry.id === prev)) return prev
        if (financeUsers.length === 1) return financeUsers[0]!.id
        return ALL_USERS_VALUE
      })
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load Finance tasks."
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [apiFetch])

  React.useEffect(() => {
    void loadData()
  }, [loadData])

  const usersById = React.useMemo(() => {
    const map = new Map<string, User>()
    for (const entry of users) {
      map.set(entry.id, entry)
    }
    return map
  }, [users])

  const rows = React.useMemo<RowView[]>(() => {
    return [...tasks]
      .map((task) => {
        const assigneeInfo = taskAssigneeInfo(task, usersById)
        const statusValue = task.status || "TODO"
        const isManagerView = user?.role === "ADMIN" || user?.role === "MANAGER"
        const isAssignedToCurrentUser = Boolean(user?.id && assigneeInfo.ids.includes(user.id))
        const canEdit = Boolean((isManagerView || isAssignedToCurrentUser) && statusValue !== "DONE")

        return {
          task,
          id: task.id,
          title: task.title || "-",
          assigneeIds: assigneeInfo.ids,
          assigneeLabel: assigneeInfo.label,
          startDateIso: isoOrEmpty(task.start_date),
          dueDateIso: isoOrEmpty(task.due_date),
          priority: task.priority || "NORMAL",
          lateDays: task.late_days ?? null,
          status: statusValue,
          statusClassName: weeklyPlanStatusBgClass(statusValue),
          canEdit,
          canMarkDone: canEdit && statusValue !== "DONE",
        }
      })
      .sort((a, b) => {
        const rankDiff = rowPriorityRank(a) - rowPriorityRank(b)
        if (rankDiff !== 0) return rankDiff

        const aLate = a.lateDays ?? 0
        const bLate = b.lateDays ?? 0
        if (aLate !== bLate) return bLate - aLate

        const aDate = rowSortDate(a)
        const bDate = rowSortDate(b)
        if (aDate !== bDate) return aDate.localeCompare(bDate)

        return a.title.localeCompare(b.title)
      })
  }, [tasks, user?.id, user?.role, usersById])

  const selectableUsers = React.useMemo(() => {
    const ids = new Set<string>()
    for (const row of rows) {
      for (const id of row.assigneeIds) ids.add(id)
    }

    return users
      .filter((entry) => ids.has(entry.id))
      .sort((a, b) => (userLabel(a) || a.email).localeCompare(userLabel(b) || b.email))
  }, [rows, users])

  React.useEffect(() => {
    if (selectedUserId === ALL_USERS_VALUE) return
    if (selectableUsers.some((entry) => entry.id === selectedUserId)) return
    setSelectedUserId(ALL_USERS_VALUE)
  }, [selectableUsers, selectedUserId])

  const filteredRows = React.useMemo(() => {
    const visibleRows = rows.filter((row) => {
      if (selectedUserId !== ALL_USERS_VALUE && !row.assigneeIds.includes(selectedUserId)) {
        return false
      }

      return rowMatchesDateFilter(row, dateFrom, dateTo)
    })

    if (viewFilter === VIEW_TODAY) {
      return visibleRows.filter((row) => row.status !== "DONE" && rowMatchesToday(row, todayIso))
    }
    if (viewFilter === VIEW_OVERDUE) {
      return visibleRows.filter((row) => row.status !== "DONE" && (row.lateDays ?? 0) > 0)
    }
    if (viewFilter === VIEW_TODAY_OVERDUE) {
      return visibleRows.filter(
        (row) =>
          row.status !== "DONE" && (rowMatchesToday(row, todayIso) || (row.lateDays ?? 0) > 0)
      )
    }

    const openRows = visibleRows.filter((row) => row.status !== "DONE")
    if (!showDone) return openRows
    const doneRows = visibleRows.filter((row) => row.status === "DONE")
    return [...openRows, ...doneRows]
  }, [dateFrom, dateTo, rows, selectedUserId, showDone, todayIso, viewFilter])

  const selectedUserLabel = React.useMemo(() => {
    if (selectedUserId === ALL_USERS_VALUE) return "All people"
    const selectedUser = users.find((entry) => entry.id === selectedUserId)
    return userLabel(selectedUser) || selectedUser?.email || "Selected user"
  }, [selectedUserId, users])

  const handleTaskUpdated = React.useCallback((updatedTask: Task) => {
    setTasks((prev) => prev.map((task) => (task.id === updatedTask.id ? updatedTask : task)))
  }, [])

  const handleMarkDone = React.useCallback(
    async (taskId: string) => {
      setUpdatingTaskIds((prev) => ({ ...prev, [taskId]: true }))

      try {
        const res = await apiFetch(`/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "DONE" }),
        })

        if (!res.ok) {
          let detail = "Failed to mark task as done."
          try {
            const payload = (await res.json()) as { detail?: string }
            if (payload?.detail) detail = payload.detail
          } catch {
            // Ignore JSON parse errors for non-JSON error bodies.
          }
          throw new Error(detail)
        }

        const updatedTask = (await res.json()) as Task
        setTasks((prev) => prev.map((task) => (task.id === taskId ? updatedTask : task)))
        toast.success("Task marked as done")
      } catch (markError) {
        const message = markError instanceof Error ? markError.message : "Failed to mark task as done."
        toast.error(message)
      } finally {
        setUpdatingTaskIds((prev) => {
          const next = { ...prev }
          delete next[taskId]
          return next
        })
      }
    },
    [apiFetch]
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>{department?.name || "Finance"} Department Tasks</CardTitle>
          </div>
          <Button onClick={() => void loadData()} variant="outline">
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>People</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="All people" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_USERS_VALUE}>All people</SelectItem>
                  {selectableUsers.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {userLabel(entry) || entry.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>View</Label>
              <Select value={viewFilter} onValueChange={(value) => setViewFilter(value as ViewFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a view" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={VIEW_ALL}>All</SelectItem>
                  <SelectItem value={VIEW_TODAY}>Today</SelectItem>
                  <SelectItem value={VIEW_OVERDUE}>Overdue</SelectItem>
                  <SelectItem value={VIEW_TODAY_OVERDUE}>Today + Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date from</Label>
              <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Date to</Label>
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Finance Tasks</CardTitle>
            <CardDescription>
              {filteredRows.length} rows for {selectedUserLabel}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-slate-500">Loading Finance tasks...</div>
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : (
            <div className="space-y-4">
              <Table containerClassName="rounded-lg border border-slate-200 bg-white">
                <TableHeader className="bg-slate-50">
                  <TableRow className="bg-slate-50">
                    <TableHead>NR</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Late</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length ? (
                    filteredRows.map((row, index) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-semibold text-slate-700">{index + 1}</TableCell>
                        <TableCell className="min-w-[320px] whitespace-normal font-medium text-slate-800">
                          {row.title}
                        </TableCell>
                        <TableCell>{row.assigneeLabel}</TableCell>
                        <TableCell>{formatDateDMY(row.startDateIso)}</TableCell>
                        <TableCell>{formatDateDMY(row.dueDateIso)}</TableCell>
                        <TableCell>
                          <Badge variant={row.priority === "HIGH" || row.priority === "BLLOK" ? "destructive" : "outline"}>
                            {row.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {row.lateDays != null && row.lateDays > 0 ? (
                            <Badge variant="destructive">{row.lateDays}</Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex rounded px-2 py-1 text-xs font-medium uppercase ${row.statusClassName}`}>
                            {row.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {row.canEdit ? (
                              <Button size="sm" variant="outline" onClick={() => setEditingTask(row.task)}>
                                Edit
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400">No access</span>
                            )}
                            {row.canMarkDone ? (
                              <Button
                                size="sm"
                                className="bg-emerald-500 text-white hover:bg-emerald-600"
                                onClick={() => void handleMarkDone(row.id)}
                                disabled={Boolean(updatingTaskIds[row.id])}
                              >
                                {updatingTaskIds[row.id] ? "Saving..." : "Done"}
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-sm text-slate-500">
                        No Finance tasks match the selected filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {viewFilter === VIEW_ALL ? (
                <div className="flex justify-center border-t pt-3">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowDone((prev) => !prev)}>
                    {showDone ? "Hide done" : "Show done"}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <TaskEditDialog
        task={editingTask}
        open={Boolean(editingTask)}
        onOpenChange={(open) => {
          if (!open) setEditingTask(null)
        }}
        onUpdated={handleTaskUpdated}
      />
    </div>
  )
}
