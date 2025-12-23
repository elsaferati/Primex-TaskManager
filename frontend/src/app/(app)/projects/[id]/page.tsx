"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"

import { toast } from "sonner"

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
import type { ChecklistItem, GaNote, Project, ProjectPrompt, Task, User } from "@/lib/types"

const PHASES = ["PLANIFIKIMI", "ZHVILLIMI", "TESTIMI", "DOKUMENTIMI"] as const
const PHASE_LABELS: Record<string, string> = {
  PLANIFIKIMI: "Planifikimi",
  ZHVILLIMI: "Zhvillimi",
  TESTIMI: "Testimi",
  DOKUMENTIMI: "Dokumentimi",
  MBYLLUR: "Mbyllur",
}

const TABS = [
  { id: "description", label: "Description" },
  { id: "tasks", label: "Tasks (Detyrat)" },
  { id: "checklists", label: "Checklists" },
  { id: "members", label: "Members" },
  { id: "ga", label: "Shenime GA/KA" },
  { id: "prompts", label: "Prompts" },
] as const

type TabId = (typeof TABS)[number]["id"]

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE", "CANCELLED"] as const
const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const

function initials(src: string) {
  return src
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

function statusLabel(status?: string) {
  if (!status) return "-"
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/(^\w|\s\w)/g, (m) => m.toUpperCase())
}

export default function ProjectPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const projectId = String(params.id)
  const { apiFetch } = useAuth()

  const [project, setProject] = React.useState<Project | null>(null)
  const [tasks, setTasks] = React.useState<Task[]>([])
  const [departmentUsers, setDepartmentUsers] = React.useState<User[]>([])
  const [members, setMembers] = React.useState<User[]>([])
  const [checklistItems, setChecklistItems] = React.useState<ChecklistItem[]>([])
  const [gaNotes, setGaNotes] = React.useState<GaNote[]>([])
  const [prompts, setPrompts] = React.useState<ProjectPrompt[]>([])
  const [activeTab, setActiveTab] = React.useState<TabId>("description")
  const [newChecklistContent, setNewChecklistContent] = React.useState("")
  const [addingChecklist, setAddingChecklist] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState("")
  const [newDescription, setNewDescription] = React.useState("")
  const [newStatus, setNewStatus] = React.useState<(typeof TASK_STATUSES)[number]>("TODO")
  const [newPriority, setNewPriority] = React.useState<(typeof TASK_PRIORITIES)[number]>("MEDIUM")
  const [newAssignedTo, setNewAssignedTo] = React.useState<string>("__unassigned__")
  const [newDueDate, setNewDueDate] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [membersOpen, setMembersOpen] = React.useState(false)
  const [selectedMemberIds, setSelectedMemberIds] = React.useState<string[]>([])
  const [savingMembers, setSavingMembers] = React.useState(false)

  React.useEffect(() => {
    const load = async () => {
      const pRes = await apiFetch(`/projects/${projectId}`)
      if (!pRes.ok) return
      const p = (await pRes.json()) as Project
      setProject(p)

      const [tRes, mRes, cRes, gRes, prRes, usersRes] = await Promise.all([
        apiFetch(`/tasks?project_id=${p.id}&include_done=true`),
        apiFetch(`/project-members?project_id=${p.id}`),
        apiFetch(`/checklist-items?project_id=${p.id}`),
        apiFetch(`/ga-notes?project_id=${p.id}`),
        apiFetch(`/project-prompts?project_id=${p.id}`),
        apiFetch("/users"),
      ])

      if (tRes.ok) setTasks((await tRes.json()) as Task[])
      if (mRes.ok) setMembers((await mRes.json()) as User[])
      if (cRes.ok) setChecklistItems((await cRes.json()) as ChecklistItem[])
      if (gRes.ok) setGaNotes((await gRes.json()) as GaNote[])
      if (prRes.ok) setPrompts((await prRes.json()) as ProjectPrompt[])
      if (usersRes.ok) {
        const users = (await usersRes.json()) as User[]
        setDepartmentUsers(users.filter((u) => u.department_id === p.department_id))
      }
    }
    void load()
  }, [apiFetch, projectId])

  React.useEffect(() => {
    if (!membersOpen) return
    setSelectedMemberIds(members.map((m) => m.id))
  }, [membersOpen, members])

  const submitCreateTask = async () => {
    if (!project) return
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const payload = {
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        project_id: project.id,
        department_id: project.department_id,
        assigned_to: newAssignedTo === "__unassigned__" ? null : newAssignedTo,
        status: newStatus,
        priority: newPriority,
        due_date: newDueDate || null,
      }
      const res = await apiFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail = "Failed to create task"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const created = (await res.json()) as Task
      setTasks((prev) => [created, ...prev])
      setCreateOpen(false)
      setNewTitle("")
      setNewDescription("")
      setNewStatus("TODO")
      setNewPriority("MEDIUM")
      setNewAssignedTo("__unassigned__")
      setNewDueDate("")
      toast.success("Task created")
    } finally {
      setCreating(false)
    }
  }

  const submitChecklistItem = async () => {
    if (!project || !newChecklistContent.trim()) return
    setAddingChecklist(true)
    try {
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          content: newChecklistContent.trim(),
        }),
      })
      if (!res.ok) {
        let detail = "Failed to add checklist item"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const created = (await res.json()) as ChecklistItem
      setChecklistItems((prev) => [...prev, created])
      setNewChecklistContent("")
      toast.success("Checklist item added")
    } finally {
      setAddingChecklist(false)
    }
  }

  const toggleChecklistItem = async (itemId: string, next: boolean) => {
    setChecklistItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, is_checked: next } : item))
    )
    const res = await apiFetch(`/checklist-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_checked: next }),
    })
    if (!res.ok) {
      setChecklistItems((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, is_checked: !next } : item))
      )
      toast.error("Failed to update checklist")
    }
  }

  const toggleMemberSelect = (userId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  const submitMembers = async () => {
    if (!project || selectedMemberIds.length === 0) return
    setSavingMembers(true)
    try {
      const res = await apiFetch("/project-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          user_ids: selectedMemberIds,
        }),
      })
      if (!res.ok) {
        let detail = "Failed to add members"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const added = (await res.json()) as User[]
      const existing = new Map(members.map((m) => [m.id, m]))
      for (const u of added) {
        existing.set(u.id, u)
      }
      setMembers(Array.from(existing.values()))
      setMembersOpen(false)
      toast.success("Members updated")
    } finally {
      setSavingMembers(false)
    }
  }

  if (!project) return <div className="text-sm text-muted-foreground">Loading...</div>

  const title = project.title || project.name || "Project"
  const phase = project.current_phase || "PLANIFIKIMI"
  const userMap = new Map(
    [...departmentUsers, ...members].map((m) => [m.id, m])
  )
  const gaPrompt = prompts.find((p) => p.type === "GA_PROMPT")
  const devPrompt = prompts.find((p) => p.type === "ZHVILLIM_PROMPT")

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Kthehu tek Projektet
          </button>
          <div className="mt-3 text-3xl font-semibold">{title}</div>
          <div className="mt-3">
            <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
              {PHASE_LABELS[phase] || "Planifikimi"}
            </Badge>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            {PHASES.map((p, idx) => {
              const isCurrent = p === phase
              return (
                <span key={p}>
                  <span className={isCurrent ? "text-blue-600 font-medium" : ""}>
                    {PHASE_LABELS[p]}
                  </span>
                  {idx < PHASES.length - 1 ? " -> " : ""}
                </span>
              )
            })}
          </div>
        </div>
        <Button className="rounded-xl">Settings</Button>
      </div>

      <div className="border-b">
        <div className="flex flex-wrap gap-6">
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "relative pb-3 text-sm font-medium",
                  isActive ? "text-blue-600" : "text-muted-foreground",
                ].join(" ")}
              >
                {tab.label}
                {isActive ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" /> : null}
              </button>
            )
          })}
        </div>
      </div>

      {activeTab === "description" ? (
        <Card className="p-6">
          <div className="text-lg font-semibold">Qellimi i Projektit</div>
          <div className="mt-3 text-sm text-muted-foreground">{project.description || "-"}</div>
        </Card>
      ) : null}

      {activeTab === "tasks" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">+ Shto Detyre</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Detyre e re</DialogTitle>
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
                      <Select value={newStatus} onValueChange={(v) => setNewStatus(v as typeof newStatus)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {statusLabel(s)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={newPriority} onValueChange={(v) => setNewPriority(v as typeof newPriority)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Priority" />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_PRIORITIES.map((p) => (
                            <SelectItem key={p} value={p}>
                              {statusLabel(p)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Assign to</Label>
                      <Select value={newAssignedTo} onValueChange={setNewAssignedTo}>
                        <SelectTrigger>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unassigned__">Unassigned</SelectItem>
                          {departmentUsers.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.full_name || m.username || m.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Due date</Label>
                      <Input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button disabled={!newTitle.trim() || creating} onClick={() => void submitCreateTask()}>
                      {creating ? "Creating..." : "Create"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <Card className="p-0">
            <div className="divide-y">
              {tasks.length ? (
                tasks.map((task) => {
                  const assignedId = task.assigned_to || task.assigned_to_user_id || null
                  const assigned = assignedId ? userMap.get(assignedId) : null
                  return (
                    <div key={task.id} className="grid grid-cols-4 gap-3 px-6 py-4 text-sm">
                      <div className="font-medium">{task.title}</div>
                      <div className="text-muted-foreground">
                        {assigned?.full_name || assigned?.username || "-"}
                      </div>
                      <div>
                        <Badge variant="secondary">{statusLabel(task.status)}</Badge>
                      </div>
                      <div className="text-muted-foreground">-</div>
                    </div>
                  )
                })
              ) : (
                <div className="px-6 py-6 text-sm text-muted-foreground">No tasks yet.</div>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === "checklists" ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Shto item..."
              value={newChecklistContent}
              onChange={(e) => setNewChecklistContent(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={!newChecklistContent.trim() || addingChecklist}
              onClick={() => void submitChecklistItem()}
            >
              {addingChecklist ? "Shto..." : "Shto"}
            </Button>
          </div>
          {checklistItems.length ? (
            checklistItems.map((item) => (
              <Card
                key={item.id}
                className="cursor-pointer px-6 py-5"
                onClick={() => void toggleChecklistItem(item.id, !item.is_checked)}
              >
                <div className="flex items-center gap-3">
                  <Checkbox checked={item.is_checked} />
                  <div className={item.is_checked ? "text-muted-foreground line-through" : ""}>{item.content}</div>
                </div>
              </Card>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">No checklist items yet.</div>
          )}
        </div>
      ) : null}

      {activeTab === "members" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">+ Add members</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Select members</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  {departmentUsers.length ? (
                    departmentUsers.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2"
                        onClick={() => toggleMemberSelect(u.id)}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox checked={selectedMemberIds.includes(u.id)} />
                          <span>{u.full_name || u.username || u.email}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground">No department users found.</div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setMembersOpen(false)}>
                      Cancel
                    </Button>
                    <Button disabled={savingMembers || selectedMemberIds.length === 0} onClick={() => void submitMembers()}>
                      {savingMembers ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {members.length ? (
              members.map((m) => (
                <div key={m.id} className="flex flex-col items-center gap-3 text-center">
                  <div className="h-20 w-20 rounded-full bg-blue-100 text-lg font-semibold text-blue-700 flex items-center justify-center">
                    {initials(m.full_name || m.username || m.email)}
                  </div>
                  <div className="text-sm font-semibold">{m.full_name || m.username || m.email}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No members yet.</div>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === "ga" ? (
        <div className="space-y-3">
          {gaNotes.length ? (
            gaNotes.map((note) => (
              <Card key={note.id} className="bg-orange-50 border-orange-100 p-5">
                <div className="text-sm font-semibold">Shenim GA:</div>
                <div className="text-sm text-muted-foreground">{note.content}</div>
              </Card>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">No GA/KA notes yet.</div>
          )}
        </div>
      ) : null}

      {activeTab === "prompts" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5 space-y-3">
            <div className="text-sm font-semibold">GA PROMPT</div>
            <Textarea value={gaPrompt?.content || ""} readOnly rows={8} />
            <div className="text-xs text-muted-foreground">Ky prompt perdoret per udhezime GA dhe standarte.</div>
          </Card>
          <Card className="p-5 space-y-3">
            <div className="text-sm font-semibold">ZHVILLIM PROMPT</div>
            <Textarea value={devPrompt?.content || ""} readOnly rows={8} />
            <div className="text-xs text-muted-foreground">Ky prompt perdoret per ekipin e zhvillimit.</div>
          </Card>
        </div>
      ) : null}
    </div>
  )
}

