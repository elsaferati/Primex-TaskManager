"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"

import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { BoldOnlyEditor } from "@/components/bold-only-editor"
import { ChevronDown } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { normalizeDueDateInput } from "@/lib/dates"
import type { ChecklistItem, GaNote, Meeting, Project, ProjectPrompt, Task, TaskPriority, User } from "@/lib/types"

function toDateInput(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(0, 10)
}

function formatDateDisplay(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
}

// MST phases for Graphic Design projects
const MST_PHASES = ["PLANNING", "PRODUCT", "CONTROL", "FINAL"] as const
const MST_PHASE_LABELS: Record<string, string> = {
  PLANNING: "Planning",
  PRODUCT: "Product",
  CONTROL: "Control",
  FINAL: "Final",
  CLOSED: "Closed",
}
const CONTROL_CHECKLIST_PATH = "control ko1/ko2"
const CONTROL_CHECKLIST_TITLE = "PËRGATITJA PËR DËRGIM KO1/KO2"
const FINALIZATION_PATH = "finalization"
const FINALIZATION_TITLE = "Finalizimi"

// Tabs for Planning phase
const PLANNING_TABS = [
  { id: "description", label: "Description" },
  { id: "tasks", label: "Tasks" },
  { id: "checklist", label: "Checklist" },
  { id: "project-acceptance", label: "Pranimi i Projektit" },
  { id: "ga-meeting", label: "Takim me GA/DV" },
  { id: "members", label: "Members" },
  { id: "ga-notes", label: "GA Notes" },
] as const

// Tabs for Product phase
const PRODUCT_TABS = [
  { id: "tasks", label: "Tasks" },
  { id: "propozim-ko1-ko2", label: "PROPOZIM KO1/KO2" },
  { id: "punimi", label: "PUNIMI" },
  { id: "produkte-sa-jane-kryer", label: "PRODUKTE SA JANE KRYER" },
  { id: "members", label: "Members" },
  { id: "ga-notes", label: "GA Notes" },
] as const

// Tabs for Control phase
const CONTROL_TABS = [
  { id: "ko1-ko2", label: "KO1/KO2" },
  { id: "tasks", label: "Tasks" },
  { id: "checklist", label: "Checklist" },
  { id: "members", label: "Members" },
  { id: "ga-notes", label: "GA Notes" },
] as const

// Tabs for Final phase
const FINAL_TABS = [
  { id: "finalization", label: "Finalizimi" },
  { id: "ga-notes", label: "GA Notes" },
] as const

type TabId =
  | (typeof PLANNING_TABS)[number]["id"]
  | (typeof PRODUCT_TABS)[number]["id"]
  | (typeof CONTROL_TABS)[number]["id"]
  | (typeof FINAL_TABS)[number]["id"]

// Task statuses and priorities
const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const
const TASK_PRIORITIES = ["NORMAL", "HIGH"] as const


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

function formatDateTime(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("sq-AL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatMeetingLabel(meeting: Meeting) {
  const platformLabel = meeting.platform ? ` (${meeting.platform})` : ""
  if (!meeting.starts_at) return `${meeting.title}${platformLabel}`
  const date = new Date(meeting.starts_at)
  if (Number.isNaN(date.getTime())) return `${meeting.title}${platformLabel}`
  const today = new Date()
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  const timeLabel = date.toLocaleTimeString("sq-AL", { hour: "2-digit", minute: "2-digit" })
  const weekdayLabel = date.toLocaleDateString("sq-AL", { weekday: "long" })
  const prefix = sameDay ? timeLabel : weekdayLabel
  return `${prefix} - ${meeting.title}${platformLabel}`
}

function parseProductTotals(notes?: string | null) {
  if (!notes) return { total: "", completed: "" }
  const totalMatch = notes.match(/total_products[:=]\s*(\d+)/i)
  const completedMatch = notes.match(/completed_products[:=]\s*(\d+)/i)
  return {
    total: totalMatch ? totalMatch[1] : "",
    completed: completedMatch ? completedMatch[1] : "",
  }
}

function isKoTask(notes?: string | null) {
  return /ko_tab[:=]\s*KO1KO2/i.test(notes || "")
}

function hasProductTotals(notes?: string | null) {
  return /total_products[:=]\s*\d+/i.test(notes || "")
}

function checklistItemsForPhase(phase: string, items: ChecklistItem[]) {
  if (phase === "PLANNING") {
    return items.filter(
      (item) => item.path === "project acceptance" || item.path === "ga/dv meeting"
    )
  }
  if (phase === "PRODUCT") {
    return items.filter((item) => item.path === "propozim ko1/ko2" || item.path === "punimi")
  }
  if (phase === "CONTROL") {
    return items.filter((item) => item.path === CONTROL_CHECKLIST_PATH)
  }
  if (phase === "FINAL") {
    return items.filter((item) => item.path === FINALIZATION_PATH)
  }
  return []
}

function noteToTaskTitle(content: string, noteType?: string | null) {
  const prefix = noteType ? `${noteType}: ` : ""
  const trimmed = content.trim().replace(/\s+/g, " ")
  const base = `${prefix}${trimmed}`.trim()
  if (!base) return "GA/KA Note Task"
  return base.length > 120 ? `${base.slice(0, 117)}...` : base
}


export default function DesignProjectPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const projectId = String(params.id)
  const { apiFetch, user } = useAuth()

  const [project, setProject] = React.useState<Project | null>(null)
  const [tasks, setTasks] = React.useState<Task[]>([])
  const [departmentUsers, setDepartmentUsers] = React.useState<User[]>([])
  const [allUsers, setAllUsers] = React.useState<User[]>([])
  const [members, setMembers] = React.useState<User[]>([])
  const [checklistItems, setChecklistItems] = React.useState<ChecklistItem[]>([])
  const [gaNotes, setGaNotes] = React.useState<GaNote[]>([])
  const [prompts, setPrompts] = React.useState<ProjectPrompt[]>([])
  const [meetings, setMeetings] = React.useState<Meeting[]>([])
  const [activeTab, setActiveTab] = React.useState<TabId>("description")
  const [newChecklistContent, setNewChecklistContent] = React.useState("")
  const [newChecklistNumber, setNewChecklistNumber] = React.useState("")
  const [addingChecklist, setAddingChecklist] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState("")
  const [newDescription, setNewDescription] = React.useState("")
  const [newStatus, setNewStatus] = React.useState<(typeof TASK_STATUSES)[number]>("TODO")
  const [newPriority, setNewPriority] = React.useState<(typeof TASK_PRIORITIES)[number]>("NORMAL")
  const [newAssignees, setNewAssignees] = React.useState<string[]>([])
  const [newTaskPhase, setNewTaskPhase] = React.useState<string>("")
  const [newDueDate, setNewDueDate] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [editingDescription, setEditingDescription] = React.useState("")
  const [savingDescription, setSavingDescription] = React.useState(false)
  const [membersOpen, setMembersOpen] = React.useState(false)
  const [selectedMemberIds, setSelectedMemberIds] = React.useState<string[]>([])
  const [savingMembers, setSavingMembers] = React.useState(false)
  const [advancingPhase, setAdvancingPhase] = React.useState(false)
  const [resettingPhase, setResettingPhase] = React.useState(false)
  const [viewedPhase, setViewedPhase] = React.useState<string | null>(null)
  const [creatingNoteTaskId, setCreatingNoteTaskId] = React.useState<string | null>(null)
  const [gaNoteTaskOpenId, setGaNoteTaskOpenId] = React.useState<string | null>(null)
  const [gaNoteTaskTitle, setGaNoteTaskTitle] = React.useState("")
  const [gaNoteTaskDescription, setGaNoteTaskDescription] = React.useState("")
  const [gaNoteTaskPriority, setGaNoteTaskPriority] = React.useState<TaskPriority>("NORMAL")
  const [gaNoteTaskAssigneeId, setGaNoteTaskAssigneeId] = React.useState("__unassigned__")
  const [gaNoteTaskDueDate, setGaNoteTaskDueDate] = React.useState("")
  const [newGaNote, setNewGaNote] = React.useState("")
  const [newGaNoteType, setNewGaNoteType] = React.useState("GA")
  const [newGaNotePriority, setNewGaNotePriority] = React.useState<"__none__" | "NORMAL" | "HIGH">("__none__")
  const [addingGaNote, setAddingGaNote] = React.useState(false)
  
  // Admin controls for Project Acceptance checklist
  const [acceptanceEditingId, setAcceptanceEditingId] = React.useState<string | null>(null)
  const [acceptanceEditingText, setAcceptanceEditingText] = React.useState("")
  const [acceptanceNewText, setAcceptanceNewText] = React.useState("")
  const [acceptanceNewNumber, setAcceptanceNewNumber] = React.useState("")
  const [acceptanceSaving, setAcceptanceSaving] = React.useState(false)
  
  // Admin controls for GA/DV Meeting checklist
  const [gaMeetingEditingId, setGaMeetingEditingId] = React.useState<string | null>(null)
  const [gaMeetingEditingText, setGaMeetingEditingText] = React.useState("")
  const [gaMeetingNewText, setGaMeetingNewText] = React.useState("")
  const [gaMeetingNewNumber, setGaMeetingNewNumber] = React.useState("")
  const [gaMeetingSaving, setGaMeetingSaving] = React.useState(false)
  
  // Admin controls for PROPOZIM KO1/KO2 checklist
  const [propozimEditingId, setPropozimEditingId] = React.useState<string | null>(null)
  const [propozimEditingText, setPropozimEditingText] = React.useState("")
  const [propozimNewText, setPropozimNewText] = React.useState("")
  const [propozimNewNumber, setPropozimNewNumber] = React.useState("")
  const [propozimSaving, setPropozimSaving] = React.useState(false)
  
  // Admin controls for PUNIMI checklist
  const [punimiEditingId, setPunimiEditingId] = React.useState<string | null>(null)
  const [punimiEditingText, setPunimiEditingText] = React.useState("")
  const [punimiNewText, setPunimiNewText] = React.useState("")
  const [punimiNewNumber, setPunimiNewNumber] = React.useState("")
  const [punimiSaving, setPunimiSaving] = React.useState(false)

  // Admin controls for Finalization checklist
  const [finalizationNewText, setFinalizationNewText] = React.useState("")
  const [finalizationNewNumber, setFinalizationNewNumber] = React.useState("")
  const [finalizationSaving, setFinalizationSaving] = React.useState(false)
  
  // Comment editing state (for all checklist items)
  const [commentEditingId, setCommentEditingId] = React.useState<string | null>(null)
  const [commentEditingText, setCommentEditingText] = React.useState("")
  const [commentSaving, setCommentSaving] = React.useState(false)
  const [controlChecklistEditingId, setControlChecklistEditingId] = React.useState<string | null>(null)
  const [controlChecklistEditingText, setControlChecklistEditingText] = React.useState("")
  const [controlChecklistSaving, setControlChecklistSaving] = React.useState(false)
  const [taskStatusSaving, setTaskStatusSaving] = React.useState<Record<string, boolean>>({})

  // Inline task form state for Produkte Sa Jane Kryer
  const [newProductTaskTitle, setNewProductTaskTitle] = React.useState("")
  const [newProductTaskAssignee, setNewProductTaskAssignee] = React.useState<string>("__unassigned__")
  const [newProductTaskTotal, setNewProductTaskTotal] = React.useState("")
  const [newProductTaskCompleted, setNewProductTaskCompleted] = React.useState("")
  const [creatingProductTask, setCreatingProductTask] = React.useState(false)
  const [newKoTaskTitle, setNewKoTaskTitle] = React.useState("")
  const [newKoTaskAssignee, setNewKoTaskAssignee] = React.useState<string>("__unassigned__")
  const [newKoTaskTotal, setNewKoTaskTotal] = React.useState("")
  const [newKoTaskCompleted, setNewKoTaskCompleted] = React.useState("")
  const [creatingKoTask, setCreatingKoTask] = React.useState(false)
  const [productTaskEdits, setProductTaskEdits] = React.useState<
    Record<
      string,
      {
        total: string
        completed: string
        assigned_to: string | null
        status: Task["status"]
      }
    >
  >({})
  const [editingTaskIds, setEditingTaskIds] = React.useState<Record<string, boolean>>({})
  const [editingTaskTitles, setEditingTaskTitles] = React.useState<Record<string, string>>({})
  const [editingTaskAssignees, setEditingTaskAssignees] = React.useState<Record<string, string>>({})
  const [editingTaskTotals, setEditingTaskTotals] = React.useState<Record<string, string>>({})
  const [editProjectDueDateOpen, setEditProjectDueDateOpen] = React.useState(false)
  const [editProjectDueDate, setEditProjectDueDate] = React.useState("")
  const [savingProjectDueDate, setSavingProjectDueDate] = React.useState(false)

  const isAdmin = user?.role === "ADMIN"
  const isManager = user?.role === "MANAGER"
  const canEditDueDate = isAdmin || isManager

  // Sync the edit date when dialog opens or project changes
  React.useEffect(() => {
    if (editProjectDueDateOpen && project) {
      setEditProjectDueDate(toDateInput(project.due_date))
    }
  }, [editProjectDueDateOpen, project?.due_date])

  // Load project data
  React.useEffect(() => {
    const load = async () => {
      const pRes = await apiFetch(`/projects/${projectId}`)
      if (!pRes.ok) return
      const p = (await pRes.json()) as Project
      setProject(p)
      setEditingDescription(p.description || "")

      const [tRes, mRes, cRes, gRes, prRes, usersRes, meetingsRes] = await Promise.all([
        apiFetch(`/tasks?project_id=${p.id}&include_done=true`),
        apiFetch(`/project-members?project_id=${p.id}`),
        apiFetch(`/checklist-items?project_id=${p.id}`),
        apiFetch(`/ga-notes?project_id=${p.id}`),
        apiFetch(`/project-prompts?project_id=${p.id}`),
        apiFetch("/users?include_all_departments=true"),
        apiFetch(`/meetings?project_id=${p.id}`),
      ])

      if (tRes.ok) setTasks((await tRes.json()) as Task[])
      if (mRes.ok) setMembers((await mRes.json()) as User[])
      if (cRes.ok) {
        const items = (await cRes.json()) as ChecklistItem[]
        setChecklistItems(items)
      }
      if (gRes.ok) setGaNotes((await gRes.json()) as GaNote[])
      if (prRes.ok) setPrompts((await prRes.json()) as ProjectPrompt[])
      if (meetingsRes.ok) setMeetings((await meetingsRes.json()) as Meeting[])
      if (usersRes.ok) {
        const users = (await usersRes.json()) as User[]
        setAllUsers(users)
        setDepartmentUsers(users.filter((u) => u.department_id === p.department_id))
      }
    }
    void load()
  }, [apiFetch, projectId])

  React.useEffect(() => {
    if (project?.current_phase) setViewedPhase(project.current_phase)
  }, [project?.current_phase])

  React.useEffect(() => {
    if (!membersOpen) return
    setSelectedMemberIds(members.map((m) => m.id))
  }, [membersOpen, members])

  React.useEffect(() => {
    if (!createOpen) return
    if (newTaskPhase) return
    const phaseValue = viewedPhase || project?.current_phase || "PLANNING"
    setNewTaskPhase(phaseValue)
  }, [createOpen, newTaskPhase, project?.current_phase, viewedPhase])

  // Task creation
  const submitCreateTask = async () => {
    if (!project) return
    if (!newTitle.trim()) {
      toast.error("Title is required")
      return
    }
    if (!newAssignees || newAssignees.length === 0) {
      toast.error("Please assign the task to at least one user")
      return
    }
    if (!newDueDate || !newDueDate.trim()) {
      toast.error("Due date is required")
      return
    }
    setCreating(true)
    try {
      const payload = {
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        project_id: project.id,
        department_id: project.department_id,
        assignees: newAssignees,
        status: newStatus,
        priority: newPriority,
        phase: newTaskPhase || activePhase,
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
      setNewPriority("NORMAL")
      setNewAssignees([])
      setNewTaskPhase("")
      setNewDueDate("")
      toast.success("Task created")
    } finally {
      setCreating(false)
    }
  }

  // Save description
  const saveDescription = async () => {
    if (!project) return
    setSavingDescription(true)
    try {
      const res = await apiFetch(`/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: editingDescription.trim() || null }),
      })
      if (!res.ok) {
        let detail = "Failed to update description"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const updated = (await res.json()) as Project
      setProject(updated)
      setEditingDescription(updated.description || "")
      toast.success("Description updated")
    } finally {
      setSavingDescription(false)
    }
  }

  // Add checklist item
  const submitChecklistItem = async () => {
    if (!project || !newChecklistContent.trim()) return
    const rawNumber = newChecklistNumber.trim()
    const parsedNumber = Number.parseInt(rawNumber, 10)
    const position =
      rawNumber && !Number.isNaN(parsedNumber) ? Math.max(0, parsedNumber - 1) : undefined
    setAddingChecklist(true)
    try {
      const payload: Record<string, unknown> = {
        project_id: project.id,
        item_type: "CHECKBOX",
        title: newChecklistContent.trim(),
        is_checked: false,
      }
      if (activePhase === "CONTROL") payload.path = CONTROL_CHECKLIST_PATH
      if (position != null) payload.position = position

      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      setNewChecklistContent("")
      setNewChecklistNumber("")
      await reloadChecklistItems()
      toast.success("Checklist item added")
    } finally {
      setAddingChecklist(false)
    }
  }

  // Toggle checklist item
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

  // Reload checklist items
  const reloadChecklistItems = async () => {
    if (!project) return
    const res = await apiFetch(`/checklist-items?project_id=${project.id}`)
    if (res.ok) {
      const items = (await res.json()) as ChecklistItem[]
      setChecklistItems(items)
    }
  }

  // Comment management functions
  const startEditComment = (item: ChecklistItem) => {
    setCommentEditingId(item.id)
    setCommentEditingText(item.comment || "")
  }

  const cancelEditComment = () => {
    setCommentEditingId(null)
    setCommentEditingText("")
  }

  const saveComment = async (itemId: string) => {
    setCommentSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: commentEditingText.trim() || null }),
      })
      if (!res.ok) {
        toast.error("Failed to save comment")
        return
      }
      await reloadChecklistItems()
      setCommentEditingId(null)
      setCommentEditingText("")
      toast.success("Comment saved")
    } finally {
      setCommentSaving(false)
    }
  }

  // Project Acceptance admin functions
  const addAcceptanceItem = async () => {
    if (!project) return
    const text = acceptanceNewText.trim()
    if (!text) return
    const rawNumber = acceptanceNewNumber.trim()
    const position = rawNumber ? Math.max(0, Number.parseInt(rawNumber, 10) - 1) : undefined
    setAcceptanceSaving(true)
    try {
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          item_type: "CHECKBOX",
          path: "project acceptance",
          title: text,
          position,
          is_checked: false,
        }),
      })
      if (!res.ok) {
        toast.error("Failed to add item")
        return
      }
      setAcceptanceNewText("")
      setAcceptanceNewNumber("")
      await reloadChecklistItems()
      toast.success("Item added")
    } finally {
      setAcceptanceSaving(false)
    }
  }

  const startEditAcceptanceItem = (item: ChecklistItem) => {
    setAcceptanceEditingId(item.id)
    setAcceptanceEditingText(item.title || "")
  }

  const saveEditAcceptanceItem = async () => {
    if (!acceptanceEditingId) return
    const text = acceptanceEditingText.trim()
    if (!text) return
    setAcceptanceSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${acceptanceEditingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: text }),
      })
      if (!res.ok) {
        toast.error("Failed to update item")
        return
      }
      setAcceptanceEditingId(null)
      setAcceptanceEditingText("")
      await reloadChecklistItems()
      toast.success("Item updated")
    } finally {
      setAcceptanceSaving(false)
    }
  }

  const deleteAcceptanceItem = async (itemId: string) => {
    setAcceptanceSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Failed to delete item")
        return
      }
      await reloadChecklistItems()
      toast.success("Item deleted")
    } finally {
      setAcceptanceSaving(false)
    }
  }

  // GA/DV Meeting admin functions
  const addGaMeetingItem = async () => {
    if (!project) return
    const text = gaMeetingNewText.trim()
    if (!text) return
    const rawNumber = gaMeetingNewNumber.trim()
    const position = rawNumber ? Math.max(0, Number.parseInt(rawNumber, 10) - 1) : undefined
    setGaMeetingSaving(true)
    try {
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          item_type: "CHECKBOX",
          path: "ga/dv meeting",
          title: text,
          position,
          is_checked: false,
        }),
      })
      if (!res.ok) {
        toast.error("Failed to add item")
        return
      }
      setGaMeetingNewText("")
      setGaMeetingNewNumber("")
      await reloadChecklistItems()
      toast.success("Item added")
    } finally {
      setGaMeetingSaving(false)
    }
  }

  const startEditGaMeetingItem = (item: ChecklistItem) => {
    setGaMeetingEditingId(item.id)
    setGaMeetingEditingText(item.title || "")
  }

  const saveEditGaMeetingItem = async () => {
    if (!gaMeetingEditingId) return
    const text = gaMeetingEditingText.trim()
    if (!text) return
    setGaMeetingSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${gaMeetingEditingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: text }),
      })
      if (!res.ok) {
        toast.error("Failed to update item")
        return
      }
      setGaMeetingEditingId(null)
      setGaMeetingEditingText("")
      await reloadChecklistItems()
      toast.success("Item updated")
    } finally {
      setGaMeetingSaving(false)
    }
  }

  const deleteGaMeetingItem = async (itemId: string) => {
    setGaMeetingSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Failed to delete item")
        return
      }
      await reloadChecklistItems()
      toast.success("Item deleted")
    } finally {
      setGaMeetingSaving(false)
    }
  }

  // PROPOZIM KO1/KO2 admin functions
  const addPropozimItem = async () => {
    if (!project) return
    const text = propozimNewText.trim()
    if (!text) return
    const rawNumber = propozimNewNumber.trim()
    const position = rawNumber ? Math.max(0, Number.parseInt(rawNumber, 10) - 1) : undefined
    setPropozimSaving(true)
    try {
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          item_type: "CHECKBOX",
          path: "propozim ko1/ko2",
          title: text,
          position,
          is_checked: false,
        }),
      })
      if (!res.ok) {
        toast.error("Failed to add item")
        return
      }
      setPropozimNewText("")
      setPropozimNewNumber("")
      await reloadChecklistItems()
      toast.success("Item added")
    } finally {
      setPropozimSaving(false)
    }
  }

  const startEditPropozimItem = (item: ChecklistItem) => {
    setPropozimEditingId(item.id)
    setPropozimEditingText(item.title || "")
  }

  const saveEditPropozimItem = async () => {
    if (!propozimEditingId) return
    const text = propozimEditingText.trim()
    if (!text) return
    setPropozimSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${propozimEditingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: text }),
      })
      if (!res.ok) {
        toast.error("Failed to update item")
        return
      }
      setPropozimEditingId(null)
      setPropozimEditingText("")
      await reloadChecklistItems()
      toast.success("Item updated")
    } finally {
      setPropozimSaving(false)
    }
  }

  const deletePropozimItem = async (itemId: string) => {
    setPropozimSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Failed to delete item")
        return
      }
      await reloadChecklistItems()
      toast.success("Item deleted")
    } finally {
      setPropozimSaving(false)
    }
  }

  // PUNIMI admin functions
  const addPunimiItem = async () => {
    if (!project) return
    const text = punimiNewText.trim()
    if (!text) return
    const rawNumber = punimiNewNumber.trim()
    const position = rawNumber ? Math.max(0, Number.parseInt(rawNumber, 10) - 1) : undefined
    setPunimiSaving(true)
    try {
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          item_type: "CHECKBOX",
          path: "punimi",
          title: text,
          position,
          is_checked: false,
        }),
      })
      if (!res.ok) {
        toast.error("Failed to add item")
        return
      }
      setPunimiNewText("")
      setPunimiNewNumber("")
      await reloadChecklistItems()
      toast.success("Item added")
    } finally {
      setPunimiSaving(false)
    }
  }

  const startEditPunimiItem = (item: ChecklistItem) => {
    setPunimiEditingId(item.id)
    setPunimiEditingText(item.title || "")
  }

  const saveEditPunimiItem = async () => {
    if (!punimiEditingId) return
    const text = punimiEditingText.trim()
    if (!text) return
    setPunimiSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${punimiEditingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: text }),
      })
      if (!res.ok) {
        toast.error("Failed to update item")
        return
      }
      setPunimiEditingId(null)
      setPunimiEditingText("")
      await reloadChecklistItems()
      toast.success("Item updated")
    } finally {
      setPunimiSaving(false)
    }
  }

  const deletePunimiItem = async (itemId: string) => {
    setPunimiSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Failed to delete item")
        return
      }
      await reloadChecklistItems()
      toast.success("Item deleted")
    } finally {
      setPunimiSaving(false)
    }
  }

  const addFinalizationItem = async () => {
    if (!project) return
    const text = finalizationNewText.trim()
    if (!text) return
    const rawNumber = finalizationNewNumber.trim()
    const position = rawNumber ? Math.max(0, Number.parseInt(rawNumber, 10) - 1) : undefined
    setFinalizationSaving(true)
    try {
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          item_type: "CHECKBOX",
          path: FINALIZATION_PATH,
          title: text,
          position,
          is_checked: false,
        }),
      })
      if (!res.ok) {
        toast.error("Failed to add item")
        return
      }
      setFinalizationNewText("")
      setFinalizationNewNumber("")
      await reloadChecklistItems()
      toast.success("Item added")
    } finally {
      setFinalizationSaving(false)
    }
  }

  // Member management
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

  // Advance phase
  const advancePhase = async () => {
    if (!project) return
    const currentPhase = project.current_phase || "PLANNING"
    const openTasks = tasks.filter(
      (task) =>
        task.status !== "DONE" &&
        (task.phase || currentPhase) === currentPhase
    )
    const phaseChecklistItems = checklistItemsForPhase(currentPhase, checklistItems)
    const uncheckedItems = phaseChecklistItems.filter((item) => !item.is_checked)
    const productTasksForPhase =
      currentPhase === "PRODUCT"
        ? tasks.filter((task) => (task.phase ?? "PRODUCT") === "PRODUCT")
        : []
    const productTotalsMissing =
      currentPhase === "PRODUCT"
        ? productTasksForPhase.filter((task) => {
            const totals = parseProductTotals(task.internal_notes)
            const total = parseInt(totals.total || "0", 10) || 0
            const completed = parseInt(totals.completed || "0", 10) || 0
            return total <= 0 || completed < total
          })
        : []
    
    if (openTasks.length || uncheckedItems.length || productTotalsMissing.length) {
      const blockers: string[] = []
      if (openTasks.length) blockers.push(`${openTasks.length} open tasks`)
      if (uncheckedItems.length) blockers.push(`${uncheckedItems.length} checklist items`)
      if (productTotalsMissing.length)
        blockers.push(`${productTotalsMissing.length} tasks missing total/completed`)
      toast.error(`There are ${blockers.join(" and ")} remaining.`)
      return
    }
    
    setAdvancingPhase(true)
    try {
      const res = await apiFetch(`/projects/${project.id}/advance-phase`, { method: "POST" })
      if (!res.ok) {
        let detail = "Failed to advance phase"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const updated = (await res.json()) as Project
      setProject(updated)
      setViewedPhase(updated.current_phase || "PLANNING")
      toast.success("Phase advanced")
    } finally {
      setAdvancingPhase(false)
    }
  }

  // GA Notes
  const submitGaNote = async () => {
    if (!project || !newGaNote.trim()) return
    setAddingGaNote(true)
    try {
      const priorityValue = newGaNotePriority === "__none__" ? null : newGaNotePriority
      const res = await apiFetch("/ga-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          content: newGaNote.trim(),
          note_type: newGaNoteType,
          priority: priorityValue,
        }),
      })
      if (!res.ok) {
        let detail = "Failed to add GA/KA note"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const created = (await res.json()) as GaNote
      setGaNotes((prev) => [...prev, created])
      setNewGaNote("")
      setNewGaNoteType("GA")
      setNewGaNotePriority("__none__")
      toast.success("GA/KA note added")
    } finally {
      setAddingGaNote(false)
    }
  }

  const closeGaNote = async (noteId: string) => {
    const res = await apiFetch(`/ga-notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CLOSED" }),
    })
    if (!res.ok) {
      let detail = "Failed to close GA/KA note"
      try {
        const data = (await res.json()) as { detail?: string }
        if (data?.detail) detail = data.detail
      } catch {
        // ignore
      }
      toast.error(detail)
      return
    }
    const updated = (await res.json()) as GaNote
    setGaNotes((prev) => prev.map((note) => (note.id === updated.id ? updated : note)))
  }

  const createTaskFromNote = async (note: GaNote) => {
    if (!project) return
    setCreatingNoteTaskId(note.id)
    try {
      const res = await apiFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: gaNoteTaskTitle.trim() || noteToTaskTitle(note.content, note.note_type),
          description: gaNoteTaskDescription.trim() || note.content,
          project_id: project.id,
          department_id: project.department_id,
          assigned_to: gaNoteTaskAssigneeId === "__unassigned__" ? null : gaNoteTaskAssigneeId,
          status: "TODO",
          priority: gaNoteTaskPriority || note.priority || "NORMAL",
          phase: project.current_phase || "PLANNING",
          due_date: gaNoteTaskDueDate || null,
          ga_note_origin_id: note.id,
        }),
      })
      if (!res.ok) {
        let detail = "Failed to create task from note"
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
      setGaNoteTaskOpenId(null)
      toast.success("Task created from note")
    } finally {
      setCreatingNoteTaskId(null)
    }
  }

  const startEditControlChecklistItem = (item: ChecklistItem) => {
    setControlChecklistEditingId(item.id)
    setControlChecklistEditingText(item.title || "")
  }

  const cancelEditControlChecklistItem = () => {
    setControlChecklistEditingId(null)
    setControlChecklistEditingText("")
  }

  const saveControlChecklistItem = async () => {
    if (!controlChecklistEditingId) return
    const text = controlChecklistEditingText.trim()
    if (!text) return
    setControlChecklistSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${controlChecklistEditingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: text }),
      })
      if (!res.ok) {
        toast.error("Failed to update item")
        return
      }
      setControlChecklistEditingId(null)
      setControlChecklistEditingText("")
      await reloadChecklistItems()
      toast.success("Item updated")
    } finally {
      setControlChecklistSaving(false)
    }
  }

  const deleteControlChecklistItem = async (itemId: string) => {
    setControlChecklistSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Failed to delete item")
        return
      }
      await reloadChecklistItems()
      toast.success("Item deleted")
    } finally {
      setControlChecklistSaving(false)
    }
  }

  const updateTaskStatus = async (taskId: string, status: Task["status"]) => {
    const task = tasks.find((t) => t.id === taskId)
    
    // Only admins can change tasks from DONE to any other status
    if (task?.status === "DONE" && status !== "DONE" && user?.role !== "ADMIN") {
      toast.error("Only admins can change tasks from DONE to another status")
      return
    }
    
    setTaskStatusSaving((prev) => ({ ...prev, [taskId]: true }))
    try {
      const res = await apiFetch(`/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        toast.error("Failed to update task status")
        return
      }
      const updated = (await res.json()) as Task
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      toast.success("Task updated")
    } finally {
      setTaskStatusSaving((prev) => ({ ...prev, [taskId]: false }))
    }
  }

  // Determine active phase and visible tabs
  const phaseValue = viewedPhase || project?.current_phase || "PLANNING"
  const visibleTabs = React.useMemo(() => {
    switch (phaseValue) {
      case "PLANNING":
        return PLANNING_TABS
      case "PRODUCT":
        return PRODUCT_TABS
      case "CONTROL":
        return CONTROL_TABS
      case "FINAL":
        return FINAL_TABS
      default:
        return PLANNING_TABS
    }
  }, [phaseValue])

  React.useEffect(() => {
    if (!visibleTabs.length) return
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0].id)
    }
  }, [activeTab, visibleTabs])

  const activePhase = phaseValue
  const visibleTasks = React.useMemo(
    () =>
      tasks.filter((task) => {
        const taskPhase = task.phase || project?.current_phase || "PLANNING"
        return taskPhase === activePhase
      }),
    [activePhase, project?.current_phase, tasks]
  )
  const taskList = React.useMemo(() => {
    if (activePhase !== "PRODUCT") return visibleTasks
    return visibleTasks.filter((task) => !hasProductTotals(task.internal_notes))
  }, [activePhase, visibleTasks])
  const productTasks = React.useMemo(
    () =>
      tasks.filter(
        (task) =>
          (task.phase ?? "PRODUCT") === "PRODUCT" &&
          hasProductTotals(task.internal_notes) &&
          !isKoTask(task.internal_notes)
      ),
    [tasks]
  )
  const koTasks = React.useMemo(
    () =>
      tasks.filter(
        (task) =>
          (task.phase ?? "PRODUCT") === "PRODUCT" &&
          hasProductTotals(task.internal_notes) &&
          isKoTask(task.internal_notes)
      ),
    [tasks]
  )

  React.useEffect(() => {
    const next: Record<string, { total: string; completed: string; assigned_to: string | null; status: Task["status"] }> =
      {}
    for (const t of tasks) {
      const totals = parseProductTotals(t.internal_notes)
      next[t.id] = {
        total: totals.total,
        completed: totals.completed,
        assigned_to: t.assigned_to || null,
        status: t.status,
      }
    }
    setProductTaskEdits(next)
  }, [tasks])

  const startEditTaskRow = (task: Task) => {
    setEditingTaskIds((prev) => ({ ...prev, [task.id]: true }))
    setEditingTaskTitles((prev) => ({ ...prev, [task.id]: task.title }))
    setEditingTaskAssignees((prev) => ({
      ...prev,
      [task.id]: task.assigned_to || "__unassigned__",
    }))
    setEditingTaskTotals((prev) => ({
      ...prev,
      [task.id]: productTaskEdits[task.id]?.total || "",
    }))
  }

  const resetToPlanning = async () => {
    if (!project) return
    setResettingPhase(true)
    try {
      const res = await apiFetch(`/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_phase: "PLANNING" }),
      })
      if (!res.ok) {
        let detail = "Failed to reset phase"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const updated = (await res.json()) as Project
      setProject(updated)
      setViewedPhase(updated.current_phase || "PLANNING")
      toast.success("Phase reset to Planning")
    } finally {
      setResettingPhase(false)
    }
  }

  const cancelEditTaskRow = (taskId: string) => {
    setEditingTaskIds((prev) => ({ ...prev, [taskId]: false }))
  }

  const saveTaskRowEdits = async (task: Task, isKo: boolean) => {
    if (!project) return
    const title = (editingTaskTitles[task.id] || "").trim()
    if (!title) return
    const assignedTo =
      editingTaskAssignees[task.id] === "__unassigned__"
        ? null
        : editingTaskAssignees[task.id] || null
    const totalValue = editingTaskTotals[task.id] || "0"
    const completedValue = productTaskEdits[task.id]?.completed || "0"
    const payload = {
      title,
      assigned_to: assignedTo,
      internal_notes: `${isKo ? "ko_tab=KO1KO2; " : ""}total_products=${totalValue || 0}; completed_products=${completedValue || 0}`,
    }
    const res = await apiFetch(`/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      toast.error("Failed to update task")
      return
    }
    const updated = (await res.json()) as Task
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
    setEditingTaskIds((prev) => ({ ...prev, [task.id]: false }))
    toast.success("Task updated")
  }

  // Filter acceptance checklist items (PRANIMI I PROJEKTIT)
  const acceptanceItems = React.useMemo(
    () => checklistItems.filter((item) => item.path === "project acceptance"),
    [checklistItems]
  )

  // Filter GA Meeting checklist items (TAKIM ME GA/DV)
  const gaMeetingItems = React.useMemo(
    () => checklistItems.filter((item) => item.path === "ga/dv meeting"),
    [checklistItems]
  )

  // Filter PROPOZIM KO1/KO2 checklist items
  const propozimItems = React.useMemo(
    () => checklistItems.filter((item) => item.path === "propozim ko1/ko2"),
    [checklistItems]
  )

  // Filter PUNIMI checklist items
  const punimiItems = React.useMemo(
    () => checklistItems.filter((item) => item.path === "punimi"),
    [checklistItems]
  )

  // Filter general checklist items (not project acceptance, GA meeting, propozim, or punimi)
  const generalChecklistItems = React.useMemo(
    () =>
      checklistItems.filter(
        (item) =>
          item.path !== "project acceptance" &&
          item.path !== "ga/dv meeting" &&
          item.path !== "propozim ko1/ko2" &&
          item.path !== "punimi" &&
          item.path !== FINALIZATION_PATH &&
          item.path !== CONTROL_CHECKLIST_PATH
      ),
    [checklistItems]
  )
  const controlChecklistItems = React.useMemo(
    () => checklistItems.filter((item) => item.path === CONTROL_CHECKLIST_PATH),
    [checklistItems]
  )
  const finalizationItems = React.useMemo(
    () => checklistItems.filter((item) => item.path === FINALIZATION_PATH),
    [checklistItems]
  )
  const finalizationItemsOrdered = React.useMemo(
    () =>
      finalizationItems
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
          const aPos = a.item.position
          const bPos = b.item.position
          if (aPos == null && bPos == null) return a.index - b.index
          if (aPos == null) return 1
          if (bPos == null) return -1
          if (aPos !== bPos) return aPos - bPos
          return a.index - b.index
        })
        .map((entry) => entry.item),
    [finalizationItems]
  )
  const checklistItemsForTab = React.useMemo(() => {
    const baseItems = activePhase === "CONTROL" ? controlChecklistItems : generalChecklistItems
    return baseItems
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const aPos = a.item.position
        const bPos = b.item.position
        if (aPos == null && bPos == null) return a.index - b.index
        if (aPos == null) return 1
        if (bPos == null) return -1
        if (aPos !== bPos) return aPos - bPos
        return a.index - b.index
      })
      .map((entry) => entry.item)
  }, [activePhase, controlChecklistItems, generalChecklistItems])
  const checklistTitle = activePhase === "CONTROL" ? CONTROL_CHECKLIST_TITLE : "Checklist"

  const userMap = new Map([...allUsers, ...members, ...(user ? [user] : [])].map((m) => [m.id, m]))
  const assignableUsers = React.useMemo(() => allUsers, [allUsers])
  const memberLabel = (id?: string | null) => {
    if (!id) return "-"
    const member = userMap.get(id)
    return member?.full_name || member?.username || member?.email || "-"
  }

  if (!project) return <div className="text-sm text-muted-foreground">Loading...</div>

  const baseTitle = project.title || project.name || "Project"
  const title = project.project_type === "MST" && project.total_products != null && project.total_products > 0
    ? `${baseTitle} - ${project.total_products}`
    : baseTitle
  const phase = project.current_phase || "PLANNING"
  const phaseSequence = MST_PHASES
  const phaseLabels = MST_PHASE_LABELS
  const phaseIndex = phaseSequence.indexOf(phase as (typeof phaseSequence)[number])
  const lockedAfterIndex = phaseIndex === -1 ? 0 : phaseIndex
  const canClosePhase = phase !== "CLOSED"

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur print:static">
        <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button type="button" onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-foreground">&larr; Back to Projects</button>
          <div className="mt-3 flex items-center gap-3">
            <div className="text-3xl font-semibold">{title}</div>
            {canEditDueDate && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const currentDueDate = project.due_date ? toDateInput(project.due_date) : ""
                  setEditProjectDueDate(currentDueDate)
                  setEditProjectDueDateOpen(true)
                }}
                className="text-sm text-muted-foreground hover:text-foreground cursor-pointer"
                title="Edit project due date"
              >
                {project.due_date ? `Due: ${formatDateDisplay(project.due_date)}` : "Set due date"}
              </button>
            )}
            {!canEditDueDate && project.due_date && (
              <span className="text-sm text-muted-foreground">Due: {formatDateDisplay(project.due_date)}</span>
            )}
          </div>
          <div className="mt-3">
            <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50">
              {phaseLabels[phase] || "Design"}
            </Badge>
            <Badge variant="outline" className="ml-2 text-blue-600 border-blue-200 bg-blue-50">
              Graphic Design
            </Badge>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            {phaseSequence.map((p, idx) => {
              const isViewed = p === activePhase
              const isCurrent = p === phase
              const isLocked = idx > lockedAfterIndex
              return (
                <span key={p}>
                  <button
                    type="button"
                    onClick={() => {
                      if (isLocked) return
                      setViewedPhase(p)
                    }}
                    className={[
                      "transition-colors",
                      isLocked
                        ? "text-slate-300 cursor-not-allowed"
                        : isViewed
                          ? "text-purple-600 font-medium"
                          : isCurrent
                            ? "text-foreground"
                            : "text-muted-foreground",
                    ].join(" ")}
                    aria-pressed={isViewed}
                    disabled={isLocked}
                  >
                    {phaseLabels[p] || p}
                  </button>
                  {idx < phaseSequence.length - 1 ? " → " : ""}
                </span>
              )
            })}
          </div>
          {activePhase !== phase ? <div className="mt-2 text-xs text-muted-foreground">Viewing: {phaseLabels[activePhase] || "Design"}</div> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button className="rounded-xl" variant="outline">Settings</Button>
        </div>
      </div>

      {/* Advance Phase Button */}
      <div className="flex justify-end">
        <div className="flex items-center gap-2">
          {user?.role === "ADMIN" && phase !== "PLANNING" ? (
            <Button
              variant="outline"
              disabled={resettingPhase}
              onClick={() => void resetToPlanning()}
            >
              {resettingPhase ? "Resetting..." : "Reset to Planning"}
            </Button>
          ) : null}
          <Button variant="outline" disabled={!canClosePhase || advancingPhase} onClick={() => void advancePhase()}>
          {advancingPhase ? "Advancing..." : activePhase === "FINAL" ? "Finalize" : "Next Phase"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex flex-wrap gap-6">
          {visibleTabs.map((tab) => {
            const isActive = tab.id === activeTab
            return (
              <button
               
                key={tab.id}
               
                type="button"
               
                onClick={() => setActiveTab(tab.id)}
               
                className={[
                  
                  "relative pb-3 text-sm font-medium",
                  tab.id === "ga" ? "ml-auto" : "",
                 
                  isActive ? "text-purple-600" : "text-muted-foreground",
                ,
                ].join(" ")}
              
              >
                {tab.label}
                {isActive ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-purple-600" /> : null}
              </button>
            )
          })}
        </div>
      </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {/* Description Tab */}
        {activeTab === "description" && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Project Description</h3>
            <Textarea
              value={editingDescription}
              onChange={(e) => setEditingDescription(e.target.value)}
              placeholder="Enter project description..."
              rows={6}
              className="mb-4"
            />
            <Button
              onClick={() => void saveDescription()}
              disabled={savingDescription}
            >
              {savingDescription ? "Saving..." : "Save Description"}
            </Button>
          </Card>
        )}

        {/* Tasks Tab */}
        {activeTab === "tasks" && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Tasks</h3>
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button>+ New Task</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Task</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Title <span className="text-red-500">*</span></Label>
                      <Input
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value.toUpperCase())}
                        placeholder="Task title"
                      />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <BoldOnlyEditor value={newDescription} onChange={setNewDescription} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Status</Label>
                        <Select value={newStatus} onValueChange={(v) => setNewStatus(v as typeof newStatus)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Priority</Label>
                        <Select value={newPriority} onValueChange={(v) => setNewPriority(v as typeof newPriority)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_PRIORITIES.map((p) => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>Assignee <span className="text-red-500">*</span></Label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="w-full justify-between">
                            <span className="truncate text-left flex-1">
                              {newAssignees.length > 0 
                                ? (() => {
                                    const selectedNames = newAssignees
                                      .map(id => {
                                        const user = assignableUsers.find(u => u.id === id)
                                        return user?.full_name || user?.email || id
                                      })
                                      .join(", ")
                                    return selectedNames.length > 50 
                                      ? `${selectedNames.substring(0, 50)}... (${newAssignees.length})`
                                      : selectedNames
                                  })()
                                : "Select users"}
                            </span>
                            <ChevronDown className="h-4 w-4 opacity-50 ml-2 flex-shrink-0" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-full max-h-64 overflow-y-auto">
                          <DropdownMenuLabel>Select Users</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {assignableUsers.map((u) => (
                            <DropdownMenuCheckboxItem
                              key={u.id}
                              checked={newAssignees.includes(u.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setNewAssignees([...newAssignees, u.id])
                                } else {
                                  setNewAssignees(newAssignees.filter(id => id !== u.id))
                                }
                              }}
                            >
                              {u.full_name || u.email}
                            </DropdownMenuCheckboxItem>
                          ))}
                          {newAssignees.length > 0 && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.preventDefault()
                                  setNewAssignees([])
                                }}
                              >
                                Clear selection
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div>
                      <Label>Due Date <span className="text-red-500">*</span></Label>
                      <Input
                        type="date"
                        value={newDueDate}
                        onChange={(e) => setNewDueDate(e.target.value)}
                        required
                      />
                    </div>
                    <Button 
                      onClick={() => void submitCreateTask()} 
                      disabled={creating || !newTitle.trim() || !newAssignees || newAssignees.length === 0 || !newDueDate || !newDueDate.trim()} 
                      className="w-full"
                    >
                      {creating ? "Creating..." : "Create Task"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {taskList.length === 0 ? (
              <p className="text-muted-foreground">No tasks for this phase.</p>
            ) : (
              <div className="space-y-3">
                {taskList.map((task) => {
                  // Get all assignees from the assignees array, fallback to assigned_to for backward compatibility
                  const assignees = task.assignees && task.assignees.length > 0
                    ? task.assignees
                    : (() => {
                        const assignedId = task.assigned_to || task.assigned_to_user_id || null
                        if (!assignedId) return []
                        const assignedUser = userMap.get(assignedId)
                        return assignedUser ? [{ id: assignedId, full_name: assignedUser.full_name, username: assignedUser.username, email: assignedUser.email }] : []
                      })()
                  const savingStatus = taskStatusSaving[task.id]
                  const taskPhase = task.phase || project?.current_phase || "PLANNING"
                  const canMarkDone = taskPhase === activePhase
                  return (
                    <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{task.title}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
                          {assignees.length > 0 ? (
                            assignees.map((assignee, idx) => {
                              const displayName = assignee.full_name || assignee.username || assignee.email || "-"
                              const assigneeInitials = initials(displayName)
                              return (
                                <Badge key={assignee.id || idx} variant="secondary" className="bg-blue-100 text-blue-700 border-blue-200 text-xs" title={displayName}>
                                  {assigneeInitials}
                                </Badge>
                              )
                            })
                          ) : (
                            <span>Unassigned</span>
                          )}
                          {task.due_date ? ` • Due: ${formatDateTime(task.due_date)}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={task.priority === "HIGH" ? "destructive" : "secondary"}>
                          {task.priority}
                        </Badge>
                        <Select
                          value={task.status}
                          onValueChange={(value) => void updateTaskStatus(task.id, value as Task["status"])}
                          disabled={savingStatus}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_STATUSES.map((status) => {
                              // Disable DONE option if can't mark done, or disable all non-DONE options if task is DONE and user is not admin
                              const isDisabled = (status === "DONE" && !canMarkDone) || (task.status === "DONE" && status !== "DONE" && user?.role !== "ADMIN")
                              return (
                                <SelectItem key={status} value={status} disabled={isDisabled}>
                                  {statusLabel(status)}
                                </SelectItem>
                              )
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        )}

        {/* Checklist Tab */}
        {activeTab === "checklist" && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">{checklistTitle}</h3>
            {checklistItemsForTab.length === 0 ? (
              <p className="text-muted-foreground">No checklist items yet. Add items below.</p>
            ) : (
              <div className="space-y-2">
                {checklistItemsForTab.map((item, idx) => (
                  <div key={item.id} className="p-3 border rounded-lg space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-purple-600 font-medium min-w-[24px] mt-0.5">{idx + 1}.</span>
                      <Checkbox
                        checked={item.is_checked || false}
                        onCheckedChange={(checked) => void toggleChecklistItem(item.id, !!checked)}
                      />
                      <div className="flex-1">
                        {activePhase === "CONTROL" && isAdmin ? (
                          controlChecklistEditingId === item.id ? (
                            <Input
                              value={controlChecklistEditingText}
                              onChange={(e) => setControlChecklistEditingText(e.target.value)}
                            />
                          ) : (
                            <span className={item.is_checked ? "line-through text-muted-foreground" : ""}>
                              {item.title || item.content}
                            </span>
                          )
                        ) : (
                          <span className={item.is_checked ? "line-through text-muted-foreground" : ""}>
                            {item.title || item.content}
                          </span>
                        )}
                      </div>
                      {activePhase === "CONTROL" && isAdmin ? (
                        <div className="ml-auto flex items-center gap-2">
                          {controlChecklistEditingId === item.id ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={controlChecklistSaving || !controlChecklistEditingText.trim()}
                                onClick={() => void saveControlChecklistItem()}
                              >
                                {controlChecklistSaving ? "Saving..." : "Save"}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={cancelEditControlChecklistItem}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startEditControlChecklistItem(item)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-600"
                                disabled={controlChecklistSaving}
                                onClick={() => void deleteControlChecklistItem(item.id)}
                              >
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                    {/* Comment section */}
                    <div className="ml-9 space-y-2">
                      {commentEditingId === item.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={commentEditingText}
                            onChange={(e) => setCommentEditingText(e.target.value)}
                            placeholder="Add a comment..."
                            rows={2}
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={commentSaving}
                              onClick={() => void saveComment(item.id)}
                            >
                              {commentSaving ? "Saving..." : "Save Comment"}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={cancelEditComment}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          {item.comment ? (
                            <div className="flex-1 text-sm text-muted-foreground bg-muted p-2 rounded">
                              {item.comment}
                            </div>
                          ) : (
                            <div className="flex-1 text-sm text-muted-foreground italic">
                              No comment
                            </div>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => startEditComment(item)}>
                            {item.comment ? "Edit" : "Add"} Comment
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 grid gap-2 md:grid-cols-[120px_1fr_auto]">
              <div className="space-y-1">
                <Label>Number</Label>
                <Input
                  value={newChecklistNumber}
                  onChange={(e) => setNewChecklistNumber(e.target.value)}
                  placeholder="e.g. 3"
                />
              </div>
              <div className="space-y-1">
                <Label>Item</Label>
                <Input
                  value={newChecklistContent}
                  onChange={(e) => setNewChecklistContent(e.target.value)}
                  placeholder="Add new checklist item..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitChecklistItem()
                  }}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={() => void submitChecklistItem()} disabled={addingChecklist}>
                  {addingChecklist ? "Adding..." : "Add"}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Project Acceptance Tab (PRANIMI I PROJEKTIT) - connected to database */}
        {activeTab === "project-acceptance" && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Pranimi i Projektit</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Plotësoni këto pika për të konfirmuar pranimin e projektit.
            </p>
            {acceptanceItems.length === 0 ? (
              <p className="text-muted-foreground">Duke ngarkuar checklistën...</p>
            ) : (
              <div className="space-y-3">
                {acceptanceItems.map((item, idx) => (
                  <div key={item.id} className="p-3 border rounded-lg space-y-2">
                    <div className="flex items-start gap-3">
                      <span className="text-purple-600 font-medium min-w-[24px] mt-0.5">{idx + 1}.</span>
                      <Checkbox
                        checked={item.is_checked || false}
                        onCheckedChange={(checked) => void toggleChecklistItem(item.id, !!checked)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        {isAdmin && acceptanceEditingId === item.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={acceptanceEditingText}
                              onChange={(e) => setAcceptanceEditingText(e.target.value)}
                            />
                            <Button
                              variant="outline"
                              disabled={!acceptanceEditingText.trim() || acceptanceSaving}
                              onClick={() => void saveEditAcceptanceItem()}
                            >
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setAcceptanceEditingId(null)
                                setAcceptanceEditingText("")
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <span className={item.is_checked ? "line-through text-muted-foreground" : ""}>
                            {item.title}
                          </span>
                        )}
                      </div>
                      {isAdmin && acceptanceEditingId !== item.id ? (
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" onClick={() => startEditAcceptanceItem(item)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={acceptanceSaving}
                            onClick={() => void deleteAcceptanceItem(item.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    {/* Comment section */}
                    <div className="ml-9 space-y-2">
                      {commentEditingId === item.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={commentEditingText}
                            onChange={(e) => setCommentEditingText(e.target.value)}
                            placeholder="Add a comment..."
                            rows={2}
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={commentSaving}
                              onClick={() => void saveComment(item.id)}
                            >
                              {commentSaving ? "Saving..." : "Save Comment"}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={cancelEditComment}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          {item.comment ? (
                            <div className="flex-1 text-sm text-muted-foreground bg-muted p-2 rounded">
                              {item.comment}
                            </div>
                          ) : (
                            <div className="flex-1 text-sm text-muted-foreground italic">
                              No comment
                            </div>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => startEditComment(item)}>
                            {item.comment ? "Edit" : "Add"} Comment
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isAdmin ? (
              <div className="mt-6 grid gap-2 md:grid-cols-[120px_1fr_auto]">
                <div className="space-y-1">
                  <Label>Number</Label>
                  <Input
                    value={acceptanceNewNumber}
                    onChange={(e) => setAcceptanceNewNumber(e.target.value)}
                    placeholder="e.g. 3"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Item</Label>
                  <Input
                    value={acceptanceNewText}
                    onChange={(e) => setAcceptanceNewText(e.target.value)}
                    placeholder="Add new checklist item..."
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    disabled={!acceptanceNewText.trim() || acceptanceSaving}
                    onClick={() => void addAcceptanceItem()}
                  >
                    {acceptanceSaving ? "Saving..." : "Add"}
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        )}

        {/* GA Meeting Tab (TAKIM ME GA/DV) */}
        {activeTab === "ga-meeting" && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Takim me GA/DV</h3>
            
            {/* GA Meeting Questions */}
            <div className="space-y-3">
              {gaMeetingItems.length === 0 ? (
                <p className="text-muted-foreground">Duke ngarkuar checklistën e takimit...</p>
              ) : (
                gaMeetingItems.map((item, idx) => (
                  <div key={item.id} className="p-3 border rounded-lg space-y-2">
                    <div className="flex items-start gap-3">
                      <span className="text-purple-600 font-medium min-w-[24px] mt-0.5">{idx + 1}.</span>
                      <Checkbox
                        checked={item.is_checked || false}
                        onCheckedChange={(checked) => void toggleChecklistItem(item.id, !!checked)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        {isAdmin && gaMeetingEditingId === item.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={gaMeetingEditingText}
                              onChange={(e) => setGaMeetingEditingText(e.target.value)}
                            />
                            <Button
                              variant="outline"
                              disabled={!gaMeetingEditingText.trim() || gaMeetingSaving}
                              onClick={() => void saveEditGaMeetingItem()}
                            >
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setGaMeetingEditingId(null)
                                setGaMeetingEditingText("")
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <span className={item.is_checked ? "line-through text-muted-foreground" : ""}>
                            {item.title}
                          </span>
                        )}
                      </div>
                      {isAdmin && gaMeetingEditingId !== item.id ? (
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" onClick={() => startEditGaMeetingItem(item)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={gaMeetingSaving}
                            onClick={() => void deleteGaMeetingItem(item.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    {/* Comment section */}
                    <div className="ml-9 space-y-2">
                      {commentEditingId === item.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={commentEditingText}
                            onChange={(e) => setCommentEditingText(e.target.value)}
                            placeholder="Add a comment..."
                            rows={2}
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={commentSaving}
                              onClick={() => void saveComment(item.id)}
                            >
                              {commentSaving ? "Saving..." : "Save Comment"}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={cancelEditComment}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          {item.comment ? (
                            <div className="flex-1 text-sm text-muted-foreground bg-muted p-2 rounded">
                              {item.comment}
                            </div>
                          ) : (
                            <div className="flex-1 text-sm text-muted-foreground italic">
                              No comment
                            </div>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => startEditComment(item)}>
                            {item.comment ? "Edit" : "Add"} Comment
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            {isAdmin ? (
              <div className="mt-6 grid gap-2 md:grid-cols-[120px_1fr_auto]">
                <div className="space-y-1">
                  <Label>Number</Label>
                  <Input
                    value={gaMeetingNewNumber}
                    onChange={(e) => setGaMeetingNewNumber(e.target.value)}
                    placeholder="e.g. 3"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Item</Label>
                  <Input
                    value={gaMeetingNewText}
                    onChange={(e) => setGaMeetingNewText(e.target.value)}
                    placeholder="Add new checklist item..."
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    disabled={!gaMeetingNewText.trim() || gaMeetingSaving}
                    onClick={() => void addGaMeetingItem()}
                  >
                    {gaMeetingSaving ? "Saving..." : "Add"}
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        )}

        {/* PROPOZIM KO1/KO2 Tab */}
        {activeTab === "propozim-ko1-ko2" && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">PROPOZIM KO1/KO2</h3>

            {propozimItems.length === 0 ? (
              <p className="text-muted-foreground">Duke ngarkuar checklistën...</p>
            ) : (
              <div className="space-y-3">
                {propozimItems.map((item, idx) => (
                  <div key={item.id} className="p-3 border rounded-lg space-y-2">
                    <div className="flex items-start gap-3">
                      <span className="text-purple-600 font-medium min-w-[24px] mt-0.5">{idx + 1}.</span>
                      <Checkbox
                        checked={item.is_checked || false}
                        onCheckedChange={(checked) => void toggleChecklistItem(item.id, !!checked)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        {isAdmin && propozimEditingId === item.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={propozimEditingText}
                              onChange={(e) => setPropozimEditingText(e.target.value)}
                            />
                            <Button
                              variant="outline"
                              disabled={!propozimEditingText.trim() || propozimSaving}
                              onClick={() => void saveEditPropozimItem()}
                            >
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setPropozimEditingId(null)
                                setPropozimEditingText("")
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <span className={item.is_checked ? "line-through text-muted-foreground" : ""}>
                            {item.title}
                          </span>
                        )}
                      </div>
                      {isAdmin && propozimEditingId !== item.id ? (
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" onClick={() => startEditPropozimItem(item)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={propozimSaving}
                            onClick={() => void deletePropozimItem(item.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    {/* Comment section */}
                    <div className="ml-9 space-y-2">
                      {commentEditingId === item.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={commentEditingText}
                            onChange={(e) => setCommentEditingText(e.target.value)}
                            placeholder="Add a comment..."
                            rows={2}
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={commentSaving}
                              onClick={() => void saveComment(item.id)}
                            >
                              {commentSaving ? "Saving..." : "Save Comment"}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={cancelEditComment}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          {item.comment ? (
                            <div className="flex-1 text-sm text-muted-foreground bg-muted p-2 rounded">
                              {item.comment}
                            </div>
                          ) : (
                            <div className="flex-1 text-sm text-muted-foreground italic">
                              No comment
                            </div>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => startEditComment(item)}>
                            {item.comment ? "Edit" : "Add"} Comment
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isAdmin ? (
              <div className="mt-6 grid gap-2 md:grid-cols-[120px_1fr_auto]">
                <div className="space-y-1">
                  <Label>Number</Label>
                  <Input
                    value={propozimNewNumber}
                    onChange={(e) => setPropozimNewNumber(e.target.value)}
                    placeholder="e.g. 3"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Item</Label>
                  <Input
                    value={propozimNewText}
                    onChange={(e) => setPropozimNewText(e.target.value)}
                    placeholder="Add new checklist item..."
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    disabled={!propozimNewText.trim() || propozimSaving}
                    onClick={() => void addPropozimItem()}
                  >
                    {propozimSaving ? "Saving..." : "Add"}
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        )}

        {/* PUNIMI Tab */}
        {activeTab === "punimi" && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">PUNIMI</h3>

            {punimiItems.length === 0 ? (
              <p className="text-muted-foreground">Duke ngarkuar checklistën...</p>
            ) : (
              <div className="space-y-3">
                {punimiItems.map((item, idx) => (
                  <div key={item.id} className="p-3 border rounded-lg space-y-2">
                    <div className="flex items-start gap-3">
                      <span className="text-purple-600 font-medium min-w-[24px] mt-0.5">{idx + 1}.</span>
                      <Checkbox
                        checked={item.is_checked || false}
                        onCheckedChange={(checked) => void toggleChecklistItem(item.id, !!checked)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        {isAdmin && punimiEditingId === item.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={punimiEditingText}
                              onChange={(e) => setPunimiEditingText(e.target.value)}
                            />
                            <Button
                              variant="outline"
                              disabled={!punimiEditingText.trim() || punimiSaving}
                              onClick={() => void saveEditPunimiItem()}
                            >
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setPunimiEditingId(null)
                                setPunimiEditingText("")
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <span className={item.is_checked ? "line-through text-muted-foreground" : ""}>
                            {item.title}
                          </span>
                        )}
                      </div>
                      {isAdmin && punimiEditingId !== item.id ? (
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" onClick={() => startEditPunimiItem(item)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={punimiSaving}
                            onClick={() => void deletePunimiItem(item.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    {/* Comment section */}
                    <div className="ml-9 space-y-2">
                      {commentEditingId === item.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={commentEditingText}
                            onChange={(e) => setCommentEditingText(e.target.value)}
                            placeholder="Add a comment..."
                            rows={2}
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={commentSaving}
                              onClick={() => void saveComment(item.id)}
                            >
                              {commentSaving ? "Saving..." : "Save Comment"}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={cancelEditComment}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          {item.comment ? (
                            <div className="flex-1 text-sm text-muted-foreground bg-muted p-2 rounded">
                              {item.comment}
                            </div>
                          ) : (
                            <div className="flex-1 text-sm text-muted-foreground italic">
                              No comment
                            </div>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => startEditComment(item)}>
                            {item.comment ? "Edit" : "Add"} Comment
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isAdmin ? (
              <div className="mt-6 grid gap-2 md:grid-cols-[120px_1fr_auto]">
                <div className="space-y-1">
                  <Label>Number</Label>
                  <Input
                    value={punimiNewNumber}
                    onChange={(e) => setPunimiNewNumber(e.target.value)}
                    placeholder="e.g. 3"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Item</Label>
                  <Input
                    value={punimiNewText}
                    onChange={(e) => setPunimiNewText(e.target.value)}
                    placeholder="Add new checklist item..."
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    disabled={!punimiNewText.trim() || punimiSaving}
                    onClick={() => void addPunimiItem()}
                  >
                    {punimiSaving ? "Saving..." : "Add"}
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        )}

        {/* PRODUKTE SA JANE KRYER Tab */}
        {activeTab === "produkte-sa-jane-kryer" && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">PRODUKTE SA JANE KRYER</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-12 gap-4 text-[11px] font-medium text-slate-400 uppercase tracking-wider pb-3">
                <div className="col-span-4">Task</div>
                <div className="col-span-1">Assigned</div>
                <div className="col-span-2">Total</div>
                <div className="col-span-2">Completed</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-1"></div>
              </div>
              <div className="grid grid-cols-12 gap-4 py-4 text-sm items-center bg-slate-50/60 -mx-6 px-6 border-y border-slate-100">
                <div className="col-span-4">
                  <input
                    type="text"
                    placeholder="Enter task name..."
                    className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-purple-500 outline-none py-2 text-sm placeholder:text-slate-400 transition-colors"
                    value={newProductTaskTitle}
                    onChange={(e) => setNewProductTaskTitle(e.target.value)}
                  />
                </div>
                <div className="col-span-1">
                  <Select value={newProductTaskAssignee} onValueChange={setNewProductTaskAssignee}>
                    <SelectTrigger className="h-9 border-0 border-b-2 border-slate-200 rounded-none bg-transparent focus:border-purple-500 shadow-none">
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unassigned__">-</SelectItem>
                      {assignableUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name || u.username || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-purple-500 outline-none py-2 text-sm placeholder:text-slate-400 transition-colors"
                    value={newProductTaskTotal}
                    onChange={(e) => setNewProductTaskTotal(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-purple-500 outline-none py-2 text-sm placeholder:text-slate-400 transition-colors"
                    value={newProductTaskCompleted}
                    onChange={(e) => setNewProductTaskCompleted(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <Button
                    size="sm"
                    className="rounded-full px-5 shadow-sm"
                    onClick={async () => {
                      if (!project || !newProductTaskTitle.trim()) return
                      setCreatingProductTask(true)
                      try {
                        const res = await apiFetch("/tasks", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            title: newProductTaskTitle.trim(),
                            project_id: project.id,
                            department_id: project.department_id,
                            assigned_to: newProductTaskAssignee === "__unassigned__" ? null : newProductTaskAssignee,
                            status: "TODO",
                            priority: "NORMAL",
                            phase: "PRODUCT",
                            internal_notes: `total_products=${newProductTaskTotal || 0}; completed_products=${newProductTaskCompleted || 0}`,
                          }),
                        })
                        if (!res?.ok) {
                          toast.error("Failed to add task")
                          return
                        }
                        const created = (await res.json()) as Task
                        setTasks((prev) => [...prev, created])
                        setNewProductTaskTitle("")
                        setNewProductTaskAssignee("__unassigned__")
                        setNewProductTaskTotal("")
                        setNewProductTaskCompleted("")
                        toast.success("Task added")
                      } finally {
                        setCreatingProductTask(false)
                      }
                    }}
                    disabled={creatingProductTask || !newProductTaskTitle.trim()}
                  >
                    {creatingProductTask ? "Saving..." : "Save"}
                  </Button>
                </div>
                <div className="col-span-1"></div>
              </div>
              <div className="divide-y divide-slate-100">
                {productTasks.map((task, index) => {
                  const totalVal = parseInt(productTaskEdits[task.id]?.total || "0", 10) || 0
                  const isEditing = Boolean(editingTaskIds[task.id])
                  return (
                    <div key={task.id} className="grid grid-cols-12 gap-4 py-4 text-sm items-center hover:bg-slate-50/70 transition-colors group">
                      <div className="col-span-4 font-medium text-slate-700">
                        {isEditing ? (
                          <input
                            type="text"
                            className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-purple-500 outline-none py-1 text-sm"
                            value={editingTaskTitles[task.id] ?? task.title}
                            onChange={(e) =>
                              setEditingTaskTitles((prev) => ({ ...prev, [task.id]: e.target.value }))
                            }
                          />
                        ) : (
                          `${index + 1}. ${task.title}`
                        )}
                      </div>
                      <div className="col-span-1 text-slate-500">
                        {isEditing ? (
                          <Select
                            value={editingTaskAssignees[task.id] ?? (task.assigned_to || "__unassigned__")}
                            onValueChange={(value) =>
                              setEditingTaskAssignees((prev) => ({ ...prev, [task.id]: value }))
                            }
                          >
                            <SelectTrigger className="h-9 border-0 border-b-2 border-slate-200 rounded-none bg-transparent focus:border-purple-500 shadow-none">
                              <SelectValue placeholder="-" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__unassigned__">-</SelectItem>
                              {assignableUsers.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.full_name || u.username || u.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          memberLabel(task.assigned_to)
                        )}
                      </div>
                      <div className="col-span-2 text-slate-500">
                        {isEditing ? (
                          <input
                            type="number"
                            className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-purple-500 outline-none py-1 text-sm"
                            value={editingTaskTotals[task.id] ?? productTaskEdits[task.id]?.total ?? ""}
                            onChange={(e) =>
                              setEditingTaskTotals((prev) => ({ ...prev, [task.id]: e.target.value }))
                            }
                          />
                        ) : (
                          productTaskEdits[task.id]?.total || "-"
                        )}
                      </div>
                      <div className="col-span-2">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            className="h-6 w-6 rounded-full border border-slate-300 text-slate-500 hover:text-slate-700"
                            onClick={async () => {
                              const completedNum = Math.max(
                                0,
                                (parseInt(productTaskEdits[task.id]?.completed || "0", 10) || 0) - 1
                              )
                              const newCompleted = completedNum.toString()
                              const shouldMarkDone = totalVal > 0 && completedNum >= totalVal
                              const newStatus = shouldMarkDone ? "DONE" : "TODO"
                              setProductTaskEdits((prev) => ({
                                ...prev,
                                [task.id]: { ...prev[task.id], completed: newCompleted, status: newStatus },
                              }))
                              await apiFetch(`/tasks/${task.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  internal_notes: `total_products=${productTaskEdits[task.id]?.total || 0}; completed_products=${newCompleted}`,
                                  status: newStatus,
                                }),
                              })
                            }}
                          >
                            -
                          </button>
                          <div className="min-w-[32px] text-center text-sm text-slate-700">
                            {productTaskEdits[task.id]?.completed || "0"}
                          </div>
                          <button
                            type="button"
                            className="h-6 w-6 rounded-full border border-slate-300 text-slate-500 hover:text-slate-700"
                            onClick={async () => {
                              let completedNum = (parseInt(productTaskEdits[task.id]?.completed || "0", 10) || 0) + 1
                              if (totalVal > 0 && completedNum > totalVal) completedNum = totalVal
                              const newCompleted = completedNum.toString()
                              const shouldMarkDone = totalVal > 0 && completedNum >= totalVal
                              const newStatus = shouldMarkDone ? "DONE" : "TODO"
                              setProductTaskEdits((prev) => ({
                                ...prev,
                                [task.id]: { ...prev[task.id], completed: newCompleted, status: newStatus },
                              }))
                              await apiFetch(`/tasks/${task.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  internal_notes: `total_products=${productTaskEdits[task.id]?.total || 0}; completed_products=${newCompleted}`,
                                  status: newStatus,
                                }),
                              })
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <Badge
                          variant={task.status === "DONE" ? "default" : "outline"}
                          className={task.status === "DONE" ? "bg-emerald-500 hover:bg-emerald-600" : "text-slate-600 border-slate-300"}
                        >
                          {statusLabel(productTaskEdits[task.id]?.status || task.status)}
                        </Badge>
                      </div>
                      <div className="col-span-1 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="flex items-center justify-end gap-2">
                          {isEditing ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void saveTaskRowEdits(task, false)}
                              >
                                Save
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => cancelEditTaskRow(task.id)}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditTaskRow(task)}
                            >
                              Edit
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50"
                            onClick={async () => {
                              const res = await apiFetch(`/tasks/${task.id}`, { method: "DELETE" })
                              if (!res?.ok) {
                                if (res?.status == 405) {
                                  toast.error("Delete endpoint not active. Restart backend.")
                                } else {
                                  toast.error("Failed to delete task")
                                }
                                return
                              }
                              setTasks((prev) => prev.filter((t) => t.id !== task.id))
                              toast.success("Task deleted")
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {productTasks.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400">
                    No tasks yet. Add one above to get started.
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        )}

        {/* KO1/KO2 Tab */}
        {activeTab === "ko1-ko2" && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">KO1/KO2</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-12 gap-4 text-[11px] font-medium text-slate-400 uppercase tracking-wider pb-3">
                <div className="col-span-4">Task</div>
                <div className="col-span-1">Assigned</div>
                <div className="col-span-2">Total</div>
                <div className="col-span-2">Completed</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-1"></div>
              </div>
              <div className="grid grid-cols-12 gap-4 py-4 text-sm items-center bg-slate-50/60 -mx-6 px-6 border-y border-slate-100">
                <div className="col-span-4">
                  <input
                    type="text"
                    placeholder="Enter task name..."
                    className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-purple-500 outline-none py-2 text-sm placeholder:text-slate-400 transition-colors"
                    value={newKoTaskTitle}
                    onChange={(e) => setNewKoTaskTitle(e.target.value)}
                  />
                </div>
                <div className="col-span-1">
                  <Select value={newKoTaskAssignee} onValueChange={setNewKoTaskAssignee}>
                    <SelectTrigger className="h-9 border-0 border-b-2 border-slate-200 rounded-none bg-transparent focus:border-purple-500 shadow-none">
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unassigned__">-</SelectItem>
                      {assignableUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name || u.username || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-purple-500 outline-none py-2 text-sm placeholder:text-slate-400 transition-colors"
                    value={newKoTaskTotal}
                    onChange={(e) => setNewKoTaskTotal(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-purple-500 outline-none py-2 text-sm placeholder:text-slate-400 transition-colors"
                    value={newKoTaskCompleted}
                    onChange={(e) => setNewKoTaskCompleted(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <Button
                    size="sm"
                    className="rounded-full px-5 shadow-sm"
                    onClick={async () => {
                      if (!project || !newKoTaskTitle.trim()) return
                      setCreatingKoTask(true)
                      try {
                        const res = await apiFetch("/tasks", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            title: newKoTaskTitle.trim(),
                            project_id: project.id,
                            department_id: project.department_id,
                            assigned_to: newKoTaskAssignee === "__unassigned__" ? null : newKoTaskAssignee,
                            status: "TODO",
                            priority: "NORMAL",
                            phase: "PRODUCT",
                            internal_notes: `ko_tab=KO1KO2; total_products=${newKoTaskTotal || 0}; completed_products=${newKoTaskCompleted || 0}`,
                          }),
                        })
                        if (!res?.ok) {
                          toast.error("Failed to add task")
                          return
                        }
                        const created = (await res.json()) as Task
                        setTasks((prev) => [...prev, created])
                        setNewKoTaskTitle("")
                        setNewKoTaskAssignee("__unassigned__")
                        setNewKoTaskTotal("")
                        setNewKoTaskCompleted("")
                        toast.success("Task added")
                      } finally {
                        setCreatingKoTask(false)
                      }
                    }}
                    disabled={creatingKoTask || !newKoTaskTitle.trim()}
                  >
                    {creatingKoTask ? "Saving..." : "Save"}
                  </Button>
                </div>
                <div className="col-span-1"></div>
              </div>
              <div className="divide-y divide-slate-100">
                {koTasks.map((task, index) => {
                  const totalVal = parseInt(productTaskEdits[task.id]?.total || "0", 10) || 0
                  const isEditing = Boolean(editingTaskIds[task.id])
                  return (
                    <div key={task.id} className="grid grid-cols-12 gap-4 py-4 text-sm items-center hover:bg-slate-50/70 transition-colors group">
                      <div className="col-span-4 font-medium text-slate-700">
                        {isEditing ? (
                          <input
                            type="text"
                            className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-purple-500 outline-none py-1 text-sm"
                            value={editingTaskTitles[task.id] ?? task.title}
                            onChange={(e) =>
                              setEditingTaskTitles((prev) => ({ ...prev, [task.id]: e.target.value }))
                            }
                          />
                        ) : (
                          `${index + 1}. ${task.title}`
                        )}
                      </div>
                      <div className="col-span-1 text-slate-500">
                        {isEditing ? (
                          <Select
                            value={editingTaskAssignees[task.id] ?? (task.assigned_to || "__unassigned__")}
                            onValueChange={(value) =>
                              setEditingTaskAssignees((prev) => ({ ...prev, [task.id]: value }))
                            }
                          >
                            <SelectTrigger className="h-9 border-0 border-b-2 border-slate-200 rounded-none bg-transparent focus:border-purple-500 shadow-none">
                              <SelectValue placeholder="-" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__unassigned__">-</SelectItem>
                              {assignableUsers.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.full_name || u.username || u.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          memberLabel(task.assigned_to)
                        )}
                      </div>
                      <div className="col-span-2 text-slate-500">
                        {isEditing ? (
                          <input
                            type="number"
                            className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-purple-500 outline-none py-1 text-sm"
                            value={editingTaskTotals[task.id] ?? productTaskEdits[task.id]?.total ?? ""}
                            onChange={(e) =>
                              setEditingTaskTotals((prev) => ({ ...prev, [task.id]: e.target.value }))
                            }
                          />
                        ) : (
                          productTaskEdits[task.id]?.total || "-"
                        )}
                      </div>
                      <div className="col-span-2">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            className="h-6 w-6 rounded-full border border-slate-300 text-slate-500 hover:text-slate-700"
                            onClick={async () => {
                              const completedNum = Math.max(
                                0,
                                (parseInt(productTaskEdits[task.id]?.completed || "0", 10) || 0) - 1
                              )
                              const newCompleted = completedNum.toString()
                              const shouldMarkDone = totalVal > 0 && completedNum >= totalVal
                              const newStatus = shouldMarkDone ? "DONE" : "TODO"
                              setProductTaskEdits((prev) => ({
                                ...prev,
                                [task.id]: { ...prev[task.id], completed: newCompleted, status: newStatus },
                              }))
                              await apiFetch(`/tasks/${task.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  internal_notes: `ko_tab=KO1KO2; total_products=${productTaskEdits[task.id]?.total || 0}; completed_products=${newCompleted}`,
                                  status: newStatus,
                                }),
                              })
                            }}
                          >
                            -
                          </button>
                          <div className="min-w-[32px] text-center text-sm text-slate-700">
                            {productTaskEdits[task.id]?.completed || "0"}
                          </div>
                          <button
                            type="button"
                            className="h-6 w-6 rounded-full border border-slate-300 text-slate-500 hover:text-slate-700"
                            onClick={async () => {
                              let completedNum = (parseInt(productTaskEdits[task.id]?.completed || "0", 10) || 0) + 1
                              if (totalVal > 0 && completedNum > totalVal) completedNum = totalVal
                              const newCompleted = completedNum.toString()
                              const shouldMarkDone = totalVal > 0 && completedNum >= totalVal
                              const newStatus = shouldMarkDone ? "DONE" : "TODO"
                              setProductTaskEdits((prev) => ({
                                ...prev,
                                [task.id]: { ...prev[task.id], completed: newCompleted, status: newStatus },
                              }))
                              await apiFetch(`/tasks/${task.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  internal_notes: `ko_tab=KO1KO2; total_products=${productTaskEdits[task.id]?.total || 0}; completed_products=${newCompleted}`,
                                  status: newStatus,
                                }),
                              })
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <Badge
                          variant={task.status === "DONE" ? "default" : "outline"}
                          className={task.status === "DONE" ? "bg-emerald-500 hover:bg-emerald-600" : "text-slate-600 border-slate-300"}
                        >
                          {statusLabel(productTaskEdits[task.id]?.status || task.status)}
                        </Badge>
                      </div>
                      <div className="col-span-1 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="flex items-center justify-end gap-2">
                          {isEditing ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void saveTaskRowEdits(task, true)}
                              >
                                Save
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => cancelEditTaskRow(task.id)}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditTaskRow(task)}
                            >
                              Edit
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50"
                            onClick={async () => {
                              const res = await apiFetch(`/tasks/${task.id}`, { method: "DELETE" })
                              if (!res?.ok) {
                                if (res?.status == 405) {
                                  toast.error("Delete endpoint not active. Restart backend.")
                                } else {
                                  toast.error("Failed to delete task")
                                }
                                return
                              }
                              setTasks((prev) => prev.filter((t) => t.id !== task.id))
                              toast.success("Task deleted")
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {koTasks.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400">
                    No tasks yet. Add one above to get started.
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        )}

        {/* Members Tab */}
        {activeTab === "members" && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Team Members</h3>
              <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">Manage Members</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Manage Team Members</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {departmentUsers.map((u) => (
                      <div key={u.id} className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedMemberIds.includes(u.id)}
                          onCheckedChange={() => toggleMemberSelect(u.id)}
                        />
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-xs font-medium text-purple-600">
                            {initials(u.full_name || u.email)}
                          </div>
                          <span>{u.full_name || u.email}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button onClick={() => void submitMembers()} disabled={savingMembers} className="w-full">
                    {savingMembers ? "Saving..." : "Save Members"}
                  </Button>
                </DialogContent>
              </Dialog>
            </div>
            {members.length === 0 ? (
              <p className="text-muted-foreground">No members assigned to this project.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-sm font-medium text-purple-600">
                      {initials(member.full_name || member.email)}
                    </div>
                    <div>
                      <div className="font-medium">{member.full_name || member.email}</div>
                      <div className="text-xs text-muted-foreground">{member.role || "Member"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* GA Notes Tab */}
        {activeTab === "ga-notes" && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">GA/KA Notes</h3>
            
            {/* Add new note */}
            <div className="space-y-3 mb-6 p-4 bg-muted/30 rounded-lg">
              <Textarea
                value={newGaNote}
                onChange={(e) => setNewGaNote(e.target.value)}
                placeholder="Add a new GA/KA note..."
                rows={3}
              />
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label className="text-xs">Type</Label>
                  <Select value={newGaNoteType} onValueChange={setNewGaNoteType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GA">GA</SelectItem>
                      <SelectItem value="KA">KA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Priority</Label>
                  <Select value={newGaNotePriority} onValueChange={(v) => setNewGaNotePriority(v as typeof newGaNotePriority)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      <SelectItem value="NORMAL">Normal</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={() => void submitGaNote()} disabled={addingGaNote}>
                {addingGaNote ? "Adding..." : "Add Note"}
              </Button>
            </div>

            {/* Notes list */}
            {gaNotes.length === 0 ? (
              <p className="text-muted-foreground">No GA/KA notes yet.</p>
            ) : (
              <div className="space-y-3">
                <Dialog
                  open={Boolean(gaNoteTaskOpenId)}
                  onOpenChange={(open) => {
                    if (!open) setGaNoteTaskOpenId(null)
                  }}
                >
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Create Task from Note</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground">
                        This will create a task linked to the GA/KA note.
                      </div>
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input value={gaNoteTaskTitle} onChange={(e) => setGaNoteTaskTitle(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                          value={gaNoteTaskDescription}
                          onChange={(e) => setGaNoteTaskDescription(e.target.value)}
                          rows={4}
                        />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Priority</Label>
                          <Select value={gaNoteTaskPriority} onValueChange={(v) => setGaNoteTaskPriority(v as TaskPriority)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Priority" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NORMAL">Normal</SelectItem>
                              <SelectItem value="HIGH">High</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Due date</Label>
                          <Input
                            type="date"
                            value={gaNoteTaskDueDate}
                            onChange={(e) => setGaNoteTaskDueDate(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Assign to</Label>
                        <Select value={gaNoteTaskAssigneeId} onValueChange={setGaNoteTaskAssigneeId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__unassigned__">Unassigned</SelectItem>
                            {assignableUsers.map((member) => (
                              <SelectItem key={member.id} value={member.id}>
                                {member.full_name || member.username || member.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setGaNoteTaskOpenId(null)}>
                          Cancel
                        </Button>
                        <Button
                          disabled={!gaNoteTaskTitle.trim() || creatingNoteTaskId === gaNoteTaskOpenId}
                          onClick={() => {
                            const note = gaNotes.find((n) => n.id === gaNoteTaskOpenId)
                            if (note) void createTaskFromNote(note)
                          }}
                        >
                          {creatingNoteTaskId === gaNoteTaskOpenId ? "Creating..." : "Create Task"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                {gaNotes.map((note) => {
                  const creator = note.created_by ? userMap.get(note.created_by) : null
                  const linkedTask = tasks.find((task) => task.ga_note_origin_id === note.id)
                  return (
                    <div key={note.id} className={`p-4 border rounded-lg ${note.status === "CLOSED" ? "bg-muted/30" : ""}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant={note.note_type === "GA" ? "default" : "secondary"}>
                              {note.note_type}
                            </Badge>
                            {note.priority && (
                              <Badge variant={note.priority === "HIGH" ? "destructive" : "outline"}>
                                {note.priority}
                              </Badge>
                            )}
                            {note.status === "CLOSED" && (
                              <Badge variant="outline" className="text-green-600">Closed</Badge>
                            )}
                          </div>
                          <p className={note.status === "CLOSED" ? "text-muted-foreground" : ""}>
                            {note.content}
                          </p>
                          <div className="text-xs text-muted-foreground mt-2">
                            {creator ? creator.full_name || creator.email : "Unknown"} ??? {formatDateTime(note.created_at)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {linkedTask ? (
                            <Badge variant="outline" className="text-muted-foreground">Task Created</Badge>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setGaNoteTaskOpenId(note.id)
                                setGaNoteTaskTitle(noteToTaskTitle(note.content, note.note_type))
                                setGaNoteTaskDescription(note.content)
                                setGaNoteTaskPriority(note.priority === "HIGH" ? "HIGH" : "NORMAL")
                                setGaNoteTaskAssigneeId("__unassigned__")
                                setGaNoteTaskDueDate("")
                              }}
                            >
                              Create Task
                            </Button>
                          )}
                          {note.status !== "CLOSED" && (
                            <Button variant="ghost" size="sm" onClick={() => void closeGaNote(note.id)}>
                              Close
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        )}

        {/* Finalization Tab */}
        {activeTab === "finalization" && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">{FINALIZATION_TITLE}</h3>
            {finalizationItemsOrdered.length === 0 ? (
              <p className="text-muted-foreground">No finalization items yet.</p>
            ) : (
              <div className="space-y-2">
                {finalizationItemsOrdered.map((item, idx) => (
                  <div key={item.id} className="p-3 border rounded-lg space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-purple-600 font-medium min-w-[24px] mt-0.5">{idx + 1}.</span>
                      <Checkbox
                        checked={item.is_checked || false}
                        onCheckedChange={(checked) => void toggleChecklistItem(item.id, !!checked)}
                      />
                      <span className={item.is_checked ? "line-through text-muted-foreground" : ""}>
                        {item.title || item.content}
                      </span>
                    </div>
                    <div className="ml-9 space-y-2">
                      {commentEditingId === item.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={commentEditingText}
                            onChange={(e) => setCommentEditingText(e.target.value)}
                            placeholder="Add a comment..."
                            rows={2}
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={commentSaving}
                              onClick={() => void saveComment(item.id)}
                            >
                              {commentSaving ? "Saving..." : "Save Comment"}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={cancelEditComment}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          {item.comment ? (
                            <div className="flex-1 text-sm text-muted-foreground bg-muted p-2 rounded">
                              {item.comment}
                            </div>
                          ) : (
                            <div className="flex-1 text-sm text-muted-foreground italic">
                              No comment
                            </div>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => startEditComment(item)}>
                            {item.comment ? "Edit" : "Add"} Comment
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isAdmin ? (
              <div className="mt-4 grid gap-2 md:grid-cols-[120px_1fr_auto]">
                <div className="space-y-1">
                  <Label>Number</Label>
                  <Input
                    value={finalizationNewNumber}
                    onChange={(e) => setFinalizationNewNumber(e.target.value)}
                    placeholder="e.g. 3"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Item</Label>
                  <Input
                    value={finalizationNewText}
                    onChange={(e) => setFinalizationNewText(e.target.value)}
                    placeholder="Add new checklist item..."
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    disabled={!finalizationNewText.trim() || finalizationSaving}
                    onClick={() => void addFinalizationItem()}
                  >
                    {finalizationSaving ? "Saving..." : "Add"}
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        )}

      </div>
      <Dialog open={editProjectDueDateOpen} onOpenChange={setEditProjectDueDateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Project Due Date</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={editProjectDueDate}
                onChange={(e) => setEditProjectDueDate(normalizeDueDateInput(e.target.value))}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditProjectDueDateOpen(false)} disabled={savingProjectDueDate}>
                Cancel
              </Button>
              <Button
                disabled={savingProjectDueDate}
                onClick={async () => {
                  if (!project) return
                  setSavingProjectDueDate(true)
                  try {
                    const dueDateValue = editProjectDueDate.trim()
                      ? new Date(editProjectDueDate).toISOString()
                      : null
                    const res = await apiFetch(`/projects/${project.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ due_date: dueDateValue }),
                    })
                    if (!res.ok) {
                      toast.error("Failed to update project due date")
                      return
                    }
                    const updated = (await res.json()) as Project
                    setProject(updated)
                    setEditProjectDueDateOpen(false)
                    toast.success("Project due date updated")
                  } catch (err) {
                    console.error("Failed to update project due date", err)
                    toast.error("Failed to update project due date")
                  } finally {
                    setSavingProjectDueDate(false)
                  }
                }}
              >
                {savingProjectDueDate ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
