"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import type { Board, CommonCategory, CommonEntry, Project, TaskStatus, User } from "@/lib/types"

const categories: CommonCategory[] = [
  "Delays",
  "Absences",
  "Annual Leave",
  "Blocks",
  "External Tasks",
  "Complaints",
  "Requests",
  "Proposals",
]

export default function CommonViewPage() {
  const { apiFetch, user } = useAuth()
  const [entries, setEntries] = React.useState<CommonEntry[]>([])
  const [active, setActive] = React.useState<CommonCategory>("Delays")
  const [users, setUsers] = React.useState<User[]>([])
  const [boards, setBoards] = React.useState<Board[]>([])
  const [projects, setProjects] = React.useState<Project[]>([])
  const [statuses, setStatuses] = React.useState<TaskStatus[]>([])

  const load = React.useCallback(async () => {
    const res = await apiFetch("/common-entries")
    if (res.ok) setEntries((await res.json()) as CommonEntry[])

    if (user?.role !== "STAFF") {
      const [uRes, bRes, pRes, sRes] = await Promise.all([
        apiFetch("/users"),
        apiFetch("/boards"),
        apiFetch("/projects"),
        apiFetch("/task-statuses"),
      ])
      if (uRes.ok) setUsers((await uRes.json()) as User[])
      if (bRes.ok) setBoards((await bRes.json()) as Board[])
      if (pRes.ok) setProjects((await pRes.json()) as Project[])
      if (sRes.ok) setStatuses((await sRes.json()) as TaskStatus[])
    }
  }, [apiFetch, user])

  React.useEffect(() => {
    void load()
  }, [load])

  const boardById = React.useMemo(() => new Map(boards.map((b) => [b.id, b])), [boards])
  const statusByDept = React.useMemo(() => {
    const map = new Map<string, TaskStatus[]>()
    for (const s of statuses) map.set(s.department_id, [...(map.get(s.department_id) || []), s])
    for (const list of map.values()) list.sort((a, b) => a.position - b.position)
    return map
  }, [statuses])

  const [createOpen, setCreateOpen] = React.useState(false)
  const [createTitle, setCreateTitle] = React.useState("")
  const [createDesc, setCreateDesc] = React.useState("")
  const [creating, setCreating] = React.useState(false)

  const submitCreate = async () => {
    setCreating(true)
    try {
      const res = await apiFetch("/common-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: active, title: createTitle, description: createDesc || null }),
      })
      if (!res.ok) return
      setCreateOpen(false)
      setCreateTitle("")
      setCreateDesc("")
      await load()
    } finally {
      setCreating(false)
    }
  }

  const assignEntry = async (entryId: string, assignedTo: string | null) => {
    await apiFetch(`/common-entries/${entryId}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigned_to_user_id: assignedTo }),
    })
    await load()
  }

  const approveEntry = async (
    entryId: string,
    payload: { create_task: boolean; project_id?: string | null; status_id?: string | null; assigned_to_user_id?: string | null }
  ) => {
    await apiFetch(`/common-entries/${entryId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    await load()
  }

  const rejectEntry = async (entryId: string, reason: string) => {
    await apiFetch(`/common-entries/${entryId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    })
    await load()
  }

  const filtered = entries.filter((e) => e.category === active)
  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-semibold">Common View</div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>Create entry</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New entry</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} />
              </div>
              <div className="flex justify-end">
                <Button disabled={!createTitle.trim() || creating} onClick={() => void submitCreate()}>
                  {creating ? "Creating..." : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={active} onValueChange={(v) => setActive(v as CommonCategory)}>
        <TabsList className="flex flex-wrap">
          {categories.map((c) => (
            <TabsTrigger key={c} value={c}>
              {c}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={active} className="mt-4">
          <div className="space-y-3">
            {filtered.length ? (
              filtered.map((e) => (
                <Card key={e.id}>
                  <CardHeader className="space-y-1">
                    <CardTitle className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{e.title}</span>
                      <Badge variant="secondary">{e.approval_status}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {e.description ? <div className="text-sm text-muted-foreground">{e.description}</div> : null}

                    {canManage ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={e.assigned_to_user_id || ""}
                          onValueChange={(v) => void assignEntry(e.id, v || null)}
                        >
                          <SelectTrigger className="w-56">
                            <SelectValue placeholder="Assign to" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Unassigned</SelectItem>
                            {users.map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.full_name || u.username}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {e.approval_status === "pending" ? (
                          <ApproveDialog
                            entry={e}
                            projects={projects}
                            users={users}
                            boardById={boardById}
                            statusByDept={statusByDept}
                            onApprove={approveEntry}
                            onReject={rejectEntry}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No entries.</div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ApproveDialog({
  entry,
  projects,
  users,
  boardById,
  statusByDept,
  onApprove,
  onReject,
}: {
  entry: CommonEntry
  projects: Project[]
  users: User[]
  boardById: Map<string, Board>
  statusByDept: Map<string, TaskStatus[]>
  onApprove: (
    entryId: string,
    payload: { create_task: boolean; project_id?: string | null; status_id?: string | null; assigned_to_user_id?: string | null }
  ) => Promise<void>
  onReject: (entryId: string, reason: string) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [createTask, setCreateTask] = React.useState(false)
  const [projectId, setProjectId] = React.useState<string>("")
  const [statusId, setStatusId] = React.useState<string>("")
  const [assignedTo, setAssignedTo] = React.useState<string>("")
  const [rejectReason, setRejectReason] = React.useState("")

  const deptId = React.useMemo(() => {
    const p = projects.find((p) => p.id === projectId)
    if (!p) return ""
    const b = boardById.get(p.board_id)
    return b?.department_id || ""
  }, [projectId, projects, boardById])

  const availableStatuses = deptId ? statusByDept.get(deptId) || [] : []
  const availableUsers = deptId ? users.filter((u) => u.department_id === deptId) : users

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">Approve / Reject</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Approve entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={createTask}
              onChange={(e) => setCreateTask(e.target.checked)}
            />
            <span className="text-sm">Create task from entry</span>
          </div>

          {createTask ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusId} onValueChange={setStatusId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStatuses.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Assign to</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {availableUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name || u.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive">Reject</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Reject entry</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Reason</Label>
                    <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="destructive"
                      disabled={!rejectReason.trim()}
                      onClick={() => void onReject(entry.id, rejectReason).then(() => setOpen(false))}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Button
              onClick={() =>
                void onApprove(entry.id, {
                  create_task: createTask,
                  project_id: createTask ? projectId : null,
                  status_id: createTask ? statusId : null,
                  assigned_to_user_id: assignedTo || null,
                }).then(() => setOpen(false))
              }
              disabled={createTask && (!projectId || !statusId)}
            >
              Approve
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}



