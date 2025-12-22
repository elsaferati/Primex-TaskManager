"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import type { Board, Department, Project, Task, TaskStatus, User } from "@/lib/types"

function initials(src: string) {
  return src
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

export function DepartmentKanban({ departmentName }: { departmentName: string }) {
  const UNASSIGNED_VALUE = "__unassigned__"
  const params = useSearchParams()
  const router = useRouter()
  const { apiFetch, user } = useAuth()

  const [department, setDepartment] = React.useState<Department | null>(null)
  const [boards, setBoards] = React.useState<Board[]>([])
  const [selectedBoardId, setSelectedBoardId] = React.useState<string | null>(null)
  const [projects, setProjects] = React.useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null)
  const [statuses, setStatuses] = React.useState<TaskStatus[]>([])
  const [tasks, setTasks] = React.useState<Task[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [loading, setLoading] = React.useState(true)
  const [createOpen, setCreateOpen] = React.useState(false)

  const userMap = React.useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  React.useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const depRes = await apiFetch("/departments")
        if (!depRes.ok) return
        const deps = (await depRes.json()) as Department[]
        const dep = deps.find((d) => d.name === departmentName) || null
        setDepartment(dep)
        if (!dep) return

        const [boardsRes, statusesRes] = await Promise.all([
          apiFetch(`/boards?department_id=${dep.id}`),
          apiFetch(`/task-statuses?department_id=${dep.id}`),
        ])
        if (!boardsRes.ok || !statusesRes.ok) return
        const bds = (await boardsRes.json()) as Board[]
        const sts = (await statusesRes.json()) as TaskStatus[]
        setStatuses(sts)
        setBoards(bds)
        const initialBoard = bds[0]?.id || null
        setSelectedBoardId(initialBoard)

        if (user?.role !== "STAFF") {
          const usersRes = await apiFetch("/users")
          if (usersRes.ok) {
            const us = (await usersRes.json()) as User[]
            // Only allow assignment to users in the same department to match backend validation
            setUsers(us.filter((u) => u.department_id === dep.id))
          }
        }
      } finally {
        setLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, departmentName])

  React.useEffect(() => {
    const loadProjects = async () => {
      if (!selectedBoardId) return
      const projRes = await apiFetch(`/projects?board_id=${selectedBoardId}`)
      if (!projRes.ok) return
      const projs = (await projRes.json()) as Project[]
      setProjects(projs)

      const fromQuery = params.get("projectId")
      const initial =
        (fromQuery && projs.find((p) => p.id === fromQuery)?.id) || projs[0]?.id || null
      setSelectedProjectId(initial)
    }
    void loadProjects()
  }, [apiFetch, params, selectedBoardId])

  React.useEffect(() => {
    const loadTasks = async () => {
      if (!selectedProjectId) return
      const res = await apiFetch(`/tasks?project_id=${selectedProjectId}&include_done=false`)
      if (!res.ok) return
      const data = (await res.json()) as Task[]
      setTasks(data)
    }
    void loadTasks()
  }, [apiFetch, selectedProjectId])

  const moveTask = async (taskId: string, statusId: string) => {
    const position = tasks.filter((t) => t.status_id === statusId).length
    const res = await apiFetch(`/tasks/${taskId}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status_id: statusId, position }),
    })
    if (!res.ok) return
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status_id: statusId, position } : t))
    )
  }

  const canCreate = user?.role === "ADMIN" || user?.role === "MANAGER"

  const [newTitle, setNewTitle] = React.useState("")
  const [newDescription, setNewDescription] = React.useState("")
  const [newStatusId, setNewStatusId] = React.useState<string | null>(null)
  const [newAssignedTo, setNewAssignedTo] = React.useState<string | null>(null)
  const [newPlannedFor, setNewPlannedFor] = React.useState<string>("")
  const [newMilestone, setNewMilestone] = React.useState(false)
  const [newReminder, setNewReminder] = React.useState(false)
  const [creating, setCreating] = React.useState(false)

  React.useEffect(() => {
    if (!newStatusId && statuses.length) setNewStatusId(statuses[0].id)
  }, [newStatusId, statuses])

  const submitCreate = async () => {
    if (!selectedProjectId || !newStatusId) return
    setCreating(true)
    try {
      const res = await apiFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selectedProjectId,
          title: newTitle,
          description: newDescription || null,
          status_id: newStatusId,
          task_type: newReminder ? "reminder" : "adhoc",
          position: tasks.filter((t) => t.status_id === newStatusId).length,
          assigned_to_user_id: newAssignedTo || null,
          planned_for: newPlannedFor || null,
          is_milestone: newMilestone,
          reminder_enabled: newReminder,
        }),
      })
      if (!res.ok) return
      const created = (await res.json()) as Task
      setTasks((prev) => [...prev, created])
      setCreateOpen(false)
      setNewTitle("")
      setNewDescription("")
      setNewAssignedTo(null)
      setNewPlannedFor("")
      setNewMilestone(false)
      setNewReminder(false)
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading...</div>
  if (!department) return <div className="text-sm text-muted-foreground">Department not found.</div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-lg font-semibold">{departmentName}</div>
        <div className="flex items-center gap-2">
          <Select value={selectedBoardId || ""} onValueChange={setSelectedBoardId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select board" />
            </SelectTrigger>
            <SelectContent>
              {boards.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedProjectId || ""} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {canCreate ? (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>Create task</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>New task</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={newStatusId || ""} onValueChange={setNewStatusId}>
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
                      <Label>Planned for</Label>
                      <Input type="date" value={newPlannedFor} onChange={(e) => setNewPlannedFor(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Assign to</Label>
                      <Select
                        value={newAssignedTo ?? UNASSIGNED_VALUE}
                        onValueChange={(v) => setNewAssignedTo(v === UNASSIGNED_VALUE ? null : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.full_name || u.username}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Flags</Label>
                      <div className="flex items-center gap-4 pt-2">
                        <div className="flex items-center gap-2">
                          <Checkbox checked={newMilestone} onCheckedChange={(v) => setNewMilestone(Boolean(v))} />
                          <span className="text-sm">Milestone</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox checked={newReminder} onCheckedChange={(v) => setNewReminder(Boolean(v))} />
                          <span className="text-sm">1h Reminder</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button disabled={!newTitle.trim() || creating} onClick={() => void submitCreate()}>
                      {creating ? "Creating..." : "Create"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: `repeat(${statuses.length}, 280px)` }}>
        {statuses.map((status) => {
          const colTasks = tasks
            .filter((t) => t.status_id === status.id)
            .sort((a, b) => a.position - b.position)
          return (
            <div
              key={status.id}
              className="rounded-md border bg-card"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const taskId = e.dataTransfer.getData("text/plain")
                if (taskId) void moveTask(taskId, status.id)
              }}
            >
              <div className="flex items-center justify-between border-b px-3 py-2">
                <div className="text-sm font-medium">{status.name}</div>
                <div className="text-xs text-muted-foreground">{colTasks.length}</div>
              </div>
              <div className="space-y-2 p-2">
                {colTasks.map((t) => {
                  const assigned = t.assigned_to_user_id ? userMap.get(t.assigned_to_user_id) : null
                  return (
                    <Card
                      key={t.id}
                      className="cursor-grab p-3 active:cursor-grabbing"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", t.id)
                        e.dataTransfer.effectAllowed = "move"
                      }}
                      onClick={() => {
                        const returnTo =
                          typeof window !== "undefined"
                            ? `${window.location.pathname}${window.location.search}`
                            : null
                        const target = returnTo
                          ? `/tasks/${t.id}?returnTo=${encodeURIComponent(returnTo)}`
                          : `/tasks/${t.id}`
                        router.push(target)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          const returnTo =
                            typeof window !== "undefined"
                              ? `${window.location.pathname}${window.location.search}`
                              : null
                          const target = returnTo
                            ? `/tasks/${t.id}?returnTo=${encodeURIComponent(returnTo)}`
                            : `/tasks/${t.id}`
                          router.push(target)
                        }
                      }}
                      tabIndex={0}
                      role="button"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/tasks/${t.id}`} className="text-sm font-medium leading-snug hover:underline">
                          {t.title}
                        </Link>
                        {assigned ? (
                          <div className="h-7 w-7 rounded-full bg-muted text-xs font-semibold flex items-center justify-center">
                            {initials(assigned.full_name || assigned.username)}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {t.task_type === "system" ? <Badge variant="secondary">System</Badge> : null}
                        {t.reminder_enabled ? <Badge variant="secondary">1h</Badge> : null}
                        {t.is_milestone ? <Badge variant="secondary">Milestone</Badge> : null}
                        {t.is_carried_over ? <Badge variant="secondary">Carried</Badge> : null}
                        {t.planned_for ? (
                          <Badge variant="outline">{t.planned_for}</Badge>
                        ) : null}
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


