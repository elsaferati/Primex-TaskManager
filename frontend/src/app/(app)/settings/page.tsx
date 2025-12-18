"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import type { Board, Project, TaskStatus, TaskTemplate, TemplateRecurrence, User } from "@/lib/types"

export default function SettingsPage() {
  const { user, apiFetch } = useAuth()
  const [templates, setTemplates] = React.useState<TaskTemplate[]>([])
  const [open, setOpen] = React.useState(false)
  const [boards, setBoards] = React.useState<Board[]>([])
  const [projects, setProjects] = React.useState<Project[]>([])
  const [statuses, setStatuses] = React.useState<TaskStatus[]>([])
  const [users, setUsers] = React.useState<User[]>([])

  const load = React.useCallback(async () => {
    const [tRes, bRes, pRes, sRes, uRes] = await Promise.all([
      apiFetch("/task-templates"),
      apiFetch("/boards"),
      apiFetch("/projects"),
      apiFetch("/task-statuses"),
      apiFetch("/users"),
    ])
    if (tRes.ok) setTemplates((await tRes.json()) as TaskTemplate[])
    if (bRes.ok) setBoards((await bRes.json()) as Board[])
    if (pRes.ok) setProjects((await pRes.json()) as Project[])
    if (sRes.ok) setStatuses((await sRes.json()) as TaskStatus[])
    if (uRes.ok) setUsers((await uRes.json()) as User[])
  }, [apiFetch])

  React.useEffect(() => {
    void load()
  }, [load])

  if (!user || user.role === "staff") {
    return <div className="text-sm text-muted-foreground">Forbidden.</div>
  }

  const toggleActive = async (id: string, isActive: boolean) => {
    await apiFetch(`/task-templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !isActive }),
    })
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-semibold">Settings</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Create system task template</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>New task template</DialogTitle>
            </DialogHeader>
            <TemplateForm
              boards={boards}
              projects={projects}
              statuses={statuses}
              users={users}
              onCreated={async () => {
                setOpen(false)
                await load()
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">System task templates</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Recurrence</TableHead>
                <TableHead>Active</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.title}</TableCell>
                  <TableCell>{t.recurrence}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t.is_active ? "active" : "inactive"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" onClick={() => void toggleActive(t.id, t.is_active)}>
                      {t.is_active ? "Disable" : "Enable"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function TemplateForm({
  boards,
  projects,
  statuses,
  users,
  onCreated,
}: {
  boards: Board[]
  projects: Project[]
  statuses: TaskStatus[]
  users: User[]
  onCreated: () => Promise<void>
}) {
  const { apiFetch } = useAuth()
  const [boardId, setBoardId] = React.useState("")
  const [projectId, setProjectId] = React.useState("")
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [recurrence, setRecurrence] = React.useState<TemplateRecurrence>("weekly")
  const [defaultStatusId, setDefaultStatusId] = React.useState("")
  const [assignedTo, setAssignedTo] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const board = boards.find((b) => b.id === boardId)
  const availableProjects = projects.filter((p) => p.board_id === boardId)
  const availableStatuses = board ? statuses.filter((s) => s.department_id === board.department_id) : statuses
  const availableUsers = board ? users.filter((u) => u.department_id === board.department_id) : users

  React.useEffect(() => {
    if (!boardId && boards.length) setBoardId(boards[0].id)
  }, [boardId, boards])

  React.useEffect(() => {
    if (!defaultStatusId && availableStatuses.length) setDefaultStatusId(availableStatuses[0].id)
  }, [defaultStatusId, availableStatuses])

  const submit = async () => {
    if (!boardId || !defaultStatusId) return
    setSubmitting(true)
    try {
      const res = await apiFetch("/task-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          board_id: boardId,
          project_id: projectId || null,
          title,
          description: description || null,
          recurrence,
          default_status_id: defaultStatusId,
          assigned_to_user_id: assignedTo || null,
          is_active: true,
        }),
      })
      if (!res.ok) return
      await onCreated()
      setTitle("")
      setDescription("")
      setAssignedTo("")
      setProjectId("")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Board</Label>
          <Select value={boardId} onValueChange={setBoardId}>
            <SelectTrigger>
              <SelectValue placeholder="Board" />
            </SelectTrigger>
            <SelectContent>
              {boards.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Project (optional)</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger>
              <SelectValue placeholder="General / first project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">General / first project</SelectItem>
              {availableProjects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Recurrence</Label>
          <Select value={recurrence} onValueChange={(v) => setRecurrence(v as TemplateRecurrence)}>
            <SelectTrigger>
              <SelectValue placeholder="Recurrence" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Default status</Label>
          <Select value={defaultStatusId} onValueChange={setDefaultStatusId}>
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
      </div>
      <div className="space-y-2">
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
      <div className="flex justify-end">
        <Button disabled={!title.trim() || !boardId || !defaultStatusId || submitting} onClick={() => void submit()}>
          {submitting ? "Creating..." : "Create"}
        </Button>
      </div>
    </div>
  )
}

