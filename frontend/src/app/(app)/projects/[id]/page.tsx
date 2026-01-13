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
import { normalizeDueDateInput } from "@/lib/dates"
import type { ChecklistItem, GaNote, Meeting, Project, ProjectPrompt, Task, User } from "@/lib/types"

const PHASES = ["MEETINGS", "PLANNING", "DEVELOPMENT", "TESTING", "DOCUMENTATION"] as const
const PHASE_LABELS: Record<string, string> = {
  MEETINGS: "Meetings",
  PLANNING: "Planning",
  DEVELOPMENT: "Development",
  TESTING: "Testing",
  DOCUMENTATION: "Documentation",
  CLOSED: "Closed",
}

const TABS = [
  { id: "description", label: "Description" },
  { id: "testing", label: "Testing" },
  { id: "tasks", label: "Tasks" },
  { id: "checklists", label: "Checklists" },
  { id: "members", label: "Members" },
  { id: "ga", label: "GA/KA Notes" },
  { id: "prompts", label: "Prompts" },
] as const

const MEETING_TABS = [
  { id: "meeting-focus", label: "Meeting Focus" },
  { id: "meeting-checklist", label: "Checklist" },
] as const

type TabId = (typeof TABS)[number]["id"] | (typeof MEETING_TABS)[number]["id"]

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const
const TASK_PRIORITIES = ["NORMAL", "HIGH"] as const

const MEETING_POINTS = [
  "Confirm scope and goals with the client.",
  "Align on timeline, milestones, and communication.",
  "Define roles, owners, and next steps.",
  "Capture risks, dependencies, and open questions.",
]

const MEETING_CHECKLIST_ITEMS = [
  "Project Type",
  "Requester/Supporter",
  "Project Lead",
  "Other Participants",
  "Role of Other Participants",
  "Concept/Planning",
  "Anticipated Problems",
]
const DOCUMENTATION_CHECKLIST_QUESTIONS = [
  "Does the documentation have a clear ending?",
  "Did you follow the documentation template?",
  "Did you save it as files?",
]

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

function formatErrorDetail(detail: unknown) {
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        item && typeof item === "object" && "msg" in item
          ? (item as { msg?: string }).msg
          : String(item)
      )
      .filter(Boolean)
      .join(", ")
  }
  if (detail && typeof detail === "object" && "msg" in detail) {
    return String((detail as { msg?: string }).msg || "An error occurred")
  }
  return "An error occurred"
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

async function initializeMeetingChecklistItems(
  projectId: string,
  existingItems: ChecklistItem[],
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>
) {
  const existingTitles = new Set(
    existingItems
      .filter((item) => item.path === "MEETINGS" && item.item_type === "CHECKBOX")
      .map((item) => (item.title || "").trim().toLowerCase())
      .filter(Boolean)
  )
  const missing = MEETING_CHECKLIST_ITEMS.filter(
    (title) => !existingTitles.has(title.trim().toLowerCase())
  )
  if (!missing.length) return
  for (const title of missing) {
    const position = MEETING_CHECKLIST_ITEMS.indexOf(title)
    const res = await apiFetch("/checklist-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        item_type: "CHECKBOX",
        path: "MEETINGS",
        title,
        is_checked: false,
        position: position >= 0 ? position + 1 : null,
      }),
    })
    if (!res.ok) {
      console.error("Failed to create meeting checklist item", title)
    }
  }
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

export default function ProjectPage() {
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
  const [addingChecklist, setAddingChecklist] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [newTitle, setNewTitle] = React.useState("")
  const [newDescription, setNewDescription] = React.useState("")
  const [newStatus, setNewStatus] = React.useState<(typeof TASK_STATUSES)[number]>("TODO")
  const [newPriority, setNewPriority] = React.useState<(typeof TASK_PRIORITIES)[number]>("NORMAL")
  const [newAssignedTo, setNewAssignedTo] = React.useState<string>("__unassigned__")
  const [newTaskPhase, setNewTaskPhase] = React.useState<string>("")
  const [newDueDate, setNewDueDate] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [updatingTaskId, setUpdatingTaskId] = React.useState<string | null>(null)
  const [editingDescription, setEditingDescription] = React.useState("")
  const [savingDescription, setSavingDescription] = React.useState(false)
  const [membersOpen, setMembersOpen] = React.useState(false)
  const [selectedMemberIds, setSelectedMemberIds] = React.useState<string[]>([])
  const [savingMembers, setSavingMembers] = React.useState(false)
  const [advancingPhase, setAdvancingPhase] = React.useState(false)
  const [viewedPhase, setViewedPhase] = React.useState<string | null>(null)
  const [newGaNote, setNewGaNote] = React.useState("")
  const [newGaNoteType, setNewGaNoteType] = React.useState("GA")
  const [newGaNotePriority, setNewGaNotePriority] = React.useState<"__none__" | "NORMAL" | "HIGH">("__none__")
  const [addingGaNote, setAddingGaNote] = React.useState(false)
  const [meetingChecklist, setMeetingChecklist] = React.useState<
    { id: string; content: string; answer: string; isChecked: boolean; position: number }[]
  >([])
  const [newMeetingItemContent, setNewMeetingItemContent] = React.useState("")
  const [newMeetingItemAnswer, setNewMeetingItemAnswer] = React.useState("")
  const [addingMeetingItem, setAddingMeetingItem] = React.useState(false)
  const [editingMeetingItemId, setEditingMeetingItemId] = React.useState<string | null>(null)
  const [editingMeetingItemContent, setEditingMeetingItemContent] = React.useState("")
  const [editingMeetingItemAnswer, setEditingMeetingItemAnswer] = React.useState("")
  const [documentationChecklist, setDocumentationChecklist] = React.useState(() =>
    DOCUMENTATION_CHECKLIST_QUESTIONS.map((question, index) => ({
      id: `doc-${index}`,
      question,
      isChecked: false,
    }))
  )
  const [documentationFilePath, setDocumentationFilePath] = React.useState("")
  const [documentationFilePaths, setDocumentationFilePaths] = React.useState<string[]>([])
  const [gaPromptContent, setGaPromptContent] = React.useState("")
  const [devPromptContent, setDevPromptContent] = React.useState("")
  const [savingGaPrompt, setSavingGaPrompt] = React.useState(false)
  const [savingDevPrompt, setSavingDevPrompt] = React.useState(false)

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
        try {
          await initializeMeetingChecklistItems(p.id, items, apiFetch)
          const reloadRes = await apiFetch(`/checklist-items?project_id=${p.id}`)
          if (reloadRes.ok) {
            setChecklistItems((await reloadRes.json()) as ChecklistItem[])
          }
        } catch (error) {
          console.error("Failed to initialize meeting checklist items:", error)
        }
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
    if (!prompts.length) return
  }, [prompts])

  React.useEffect(() => {
    const meetingItems = checklistItems.filter(
      (item) => item.path === "MEETINGS" && item.item_type === "CHECKBOX"
    )
    if (!meetingItems.length) {
      setMeetingChecklist([])
      return
    }
    const sorted = meetingItems
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    setMeetingChecklist(
      sorted.map((item, index) => ({
        id: item.id,
        content: item.title || "",
        answer: item.comment || "",
        isChecked: Boolean(item.is_checked),
        position: item.position ?? index + 1,
      }))
    )
  }, [checklistItems])

  React.useEffect(() => {
    if (!membersOpen) return
    setSelectedMemberIds(members.map((m) => m.id))
  }, [membersOpen, members])

  React.useEffect(() => {
    if (!createOpen) return
    if (newTaskPhase) return
    const phaseValue = viewedPhase || project?.current_phase || "MEETINGS"
    setNewTaskPhase(phaseValue)
  }, [createOpen, newTaskPhase, project?.current_phase, viewedPhase])

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
      setNewAssignedTo("__unassigned__")
      setNewTaskPhase("")
      setNewDueDate("")
      toast.success("Task created")
    } finally {
      setCreating(false)
    }
  }

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

  const submitChecklistItem = async () => {
    if (!project || !newChecklistContent.trim()) return
    setAddingChecklist(true)
    try {
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          item_type: "CHECKBOX",
          path: activePhase,
          title: newChecklistContent.trim(),
          is_checked: false,
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
        toast.error(formatErrorDetail(detail))
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

  const updateTaskStatus = async (taskId: string, nextStatus: Task["status"]) => {
    const previousStatus = tasks.find((task) => task.id === taskId)?.status
    setUpdatingTaskId(taskId)
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, status: nextStatus } : task)))
    try {
      const res = await apiFetch(`/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!res.ok) {
        throw new Error("Failed to update status")
      }
      const updated = (await res.json()) as Task
      setTasks((prev) => prev.map((task) => (task.id === updated.id ? updated : task)))
    } catch {
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? { ...task, status: previousStatus } : task))
      )
      toast.error("Failed to update task status")
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const patchMeetingChecklistItem = async (
    itemId: string,
    payload: Partial<{ title: string; comment: string | null; is_checked: boolean }>
  ) => {
    const res = await apiFetch(`/checklist-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      toast.error("Failed to save meeting checklist")
      return null
    }
    const updated = (await res.json()) as ChecklistItem
    setChecklistItems((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)))
    return updated
  }

  const toggleMeetingChecklistItem = (itemId: string, next: boolean) => {
    const previous = meetingChecklist.find((item) => item.id === itemId)?.isChecked ?? false
    setMeetingChecklist((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, isChecked: next } : item))
    )
    void patchMeetingChecklistItem(itemId, { is_checked: next }).then((saved) => {
      if (!saved) {
        setMeetingChecklist((prev) =>
          prev.map((item) => (item.id === itemId ? { ...item, isChecked: previous } : item))
        )
      }
    })
  }

  const startEditMeetingChecklistItem = (itemId: string) => {
    const item = meetingChecklist.find((entry) => entry.id === itemId)
    if (!item) return
    setEditingMeetingItemId(itemId)
    setEditingMeetingItemContent(item.content)
    setEditingMeetingItemAnswer(item.answer)
  }

  const cancelEditMeetingChecklistItem = () => {
    setEditingMeetingItemId(null)
    setEditingMeetingItemContent("")
    setEditingMeetingItemAnswer("")
  }

  const saveMeetingChecklistItem = async () => {
    if (!editingMeetingItemId) return
    const title = editingMeetingItemContent.trim()
    if (!title) return
    const comment = editingMeetingItemAnswer.trim()
    const saved = await patchMeetingChecklistItem(editingMeetingItemId, {
      title,
      comment: comment || null,
    })
    if (saved) {
      cancelEditMeetingChecklistItem()
    }
  }

  const deleteMeetingChecklistItem = async (itemId: string) => {
    const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Failed to delete meeting checklist item")
      return
    }
    setChecklistItems((prev) => prev.filter((entry) => entry.id !== itemId))
    toast.success("Checklist item deleted")
  }

  const addMeetingChecklistItem = async () => {
    if (!project) return
    const title = newMeetingItemContent.trim()
    if (!title) return
    setAddingMeetingItem(true)
    try {
      const nextPosition =
        meetingChecklist.reduce((max, item) => Math.max(max, item.position), 0) + 1
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          item_type: "CHECKBOX",
          path: "MEETINGS",
          title,
          comment: newMeetingItemAnswer.trim() || null,
          is_checked: false,
          position: nextPosition,
        }),
      })
      if (!res.ok) {
        toast.error("Failed to add meeting checklist item")
        return
      }
      const created = (await res.json()) as ChecklistItem
      setChecklistItems((prev) => [...prev, created])
      setNewMeetingItemContent("")
      setNewMeetingItemAnswer("")
      toast.success("Checklist item added")
    } finally {
      setAddingMeetingItem(false)
    }
  }

  const toggleDocumentationChecklistItem = (itemId: string, next: boolean) => {
    setDocumentationChecklist((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, isChecked: next } : item))
    )
  }

  const addDocumentationFilePath = () => {
    const value = documentationFilePath.trim()
    if (!value) return
    setDocumentationFilePaths((prev) => [value, ...prev])
    setDocumentationFilePath("")
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

  const advancePhase = async () => {
    if (!project) return
    const currentPhase = project.current_phase || "MEETINGS"
    const isMeetingPhase = currentPhase === "MEETINGS"
    const openTasks = tasks.filter(
      (task) =>
        task.status !== "DONE" &&
        task.status !== "DONE" &&
        (task.phase || currentPhase) === currentPhase
    )
    const uncheckedItems = checklistItems.filter((item) => !item.is_checked)
    const uncheckedMeeting = isMeetingPhase ? meetingChecklist.filter((item) => !item.isChecked) : []
    if (openTasks.length || uncheckedItems.length || uncheckedMeeting.length) {
      const blockers: string[] = []
      if (openTasks.length) blockers.push(`${openTasks.length} detyra te hapura`)
      if (uncheckedItems.length) blockers.push(`${uncheckedItems.length} checklist te pa kryera`)
      if (uncheckedMeeting.length) blockers.push(`${uncheckedMeeting.length} checklist te takimeve te pa kryera`)
      toast.error(`Ka ${blockers.join(" dhe ")}.`)
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
      setViewedPhase(updated.current_phase || "MEETINGS")
      toast.success("Phase advanced")
    } finally {
      setAdvancingPhase(false)
    }
  }

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

  const phaseValue = viewedPhase || project?.current_phase || "MEETINGS"
  const visibleTabs = React.useMemo(() => {
    if (phaseValue === "MEETINGS") {
      return [
        ...MEETING_TABS.filter((tab) => tab.id === "meeting-focus"),
        ...TABS.filter((tab) => tab.id === "description"),
        ...MEETING_TABS.filter((tab) => tab.id === "meeting-checklist"),
        ...TABS.filter((tab) => tab.id === "ga"),
      ]
    }
    if (phaseValue === "PLANIFIKIMI" || phaseValue === "PLANNING") {
      return TABS.filter(
        (tab) =>
          tab.id !== "checklists" &&
          tab.id !== "members" &&
          tab.id !== "prompts" &&
          tab.id !== "testing"
      )
    }
    if (phaseValue === "ZHVILLIMI" || phaseValue === "DEVELOPMENT") {
      return [
        ...TABS.filter((tab) => tab.id === "tasks" || tab.id === "prompts"),
        ...TABS.filter((tab) => tab.id === "ga"),
      ]
    }
    if (phaseValue === "TESTIMI" || phaseValue === "TESTING") {
      return TABS.filter((tab) => tab.id === "testing" || tab.id === "tasks" || tab.id === "ga")
    }
    if (phaseValue === "DOKUMENTIMI" || phaseValue === "DOCUMENTATION") {
      return TABS.filter(
        (tab) =>
          tab.id !== "description" &&
          tab.id !== "tasks" &&
          tab.id !== "members" &&
          tab.id !== "prompts"
      )
    }
    return TABS.filter((tab) => tab.id !== "testing")
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
        const taskPhase = task.phase || project?.current_phase || "MEETINGS"
        return taskPhase === activePhase
      }),
    [activePhase, project?.current_phase, tasks]
  )
  const visibleChecklistItems = React.useMemo(
    () => checklistItems.filter((item) => item.path === activePhase),
    [activePhase, checklistItems]
  )

  if (!project) return <div className="text-sm text-muted-foreground">Loading...</div>

  const title = project.title || project.name || "Project"
  const phase = project.current_phase || "MEETINGS"
  const phaseIndex = PHASES.indexOf(phase as (typeof PHASES)[number])
  const canClosePhase = phase !== "MBYLLUR"
  const userMap = new Map(
    [...allUsers, ...members, ...(user ? [user] : [])].map((m) => [m.id, m])
  )
  const savePrompt = async (type: "GA_PROMPT" | "ZHVILLIM_PROMPT") => {
    if (!project) return
    const isGa = type === "GA_PROMPT"
    const content = (isGa ? gaPromptContent : devPromptContent).trim()
    if (!content) {
      toast.error("Prompt content is required")
      return
    }
    if (isGa) setSavingGaPrompt(true)
    else setSavingDevPrompt(true)
    try {
      const res = await apiFetch("/project-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id, type, content }),
      })
      if (!res.ok) {
        let detail = "Failed to save prompt"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const created = (await res.json()) as ProjectPrompt
      setPrompts((prev) => [created, ...prev])
      if (isGa) setGaPromptContent("")
      else setDevPromptContent("")
      toast.success("Prompt saved")
    } finally {
      if (isGa) setSavingGaPrompt(false)
      else setSavingDevPrompt(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Back to Projects
          </button>
          <div className="mt-3 text-3xl font-semibold">{title}</div>
          <div className="mt-3">
            <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
              {PHASE_LABELS[phase] || "Meetings"}
            </Badge>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            {PHASES.map((p, idx) => {
              const isViewed = p === activePhase
              const isCurrent = p === phase
              const isLocked = idx > phaseIndex
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
                          ? "text-blue-600 font-medium"
                          : isCurrent
                            ? "text-foreground"
                            : "text-muted-foreground",
                    ].join(" ")}
                    aria-pressed={isViewed}
                    disabled={isLocked}
                  >
                    {PHASE_LABELS[p]}
                  </button>
                  {idx < PHASES.length - 1 ? " -> " : ""}
                </span>
              )
            })}
          </div>
          {activePhase !== phase ? (
            <div className="mt-2 text-xs text-muted-foreground">
              View: {PHASE_LABELS[activePhase] || "Meetings"}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button className="rounded-xl">Settings</Button>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          disabled={!canClosePhase || advancingPhase}
          onClick={() => void advancePhase()}
        >
          {advancingPhase ? "Closing..." : "Close Phase"}
        </Button>
      </div>

      <div className="border-b">
        <div className="flex flex-wrap gap-6">
          {visibleTabs.map((tab) => {
            const isActive = tab.id === activeTab
            const label = activePhase === "TESTIMI" && tab.id === "description" ? "Testing" : tab.label
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "relative pb-3 text-sm font-medium",
                  tab.id === "ga" ? "ml-auto" : "",
                  isActive ? "text-blue-600" : "text-muted-foreground",
                ].join(" ")}
              >
                {label}
                {isActive ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" /> : null}
              </button>
            )
          })}
        </div>
      </div>

      {activeTab === "meeting-focus" ? (
        <Card className="p-6">
          <div className="text-lg font-semibold">Meeting focus</div>
          <div className="mt-2 text-sm text-muted-foreground">Main points to discuss in the meeting.</div>
          <div className="mt-4 space-y-2">
            {MEETING_POINTS.map((point) => (
              <div key={point} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" aria-hidden />
                <span>{point}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {activeTab === "meeting-checklist" ? (
        <Card className="p-6">
          <div className="text-lg font-semibold">Meeting checklist</div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Input
              value={newMeetingItemContent}
              onChange={(e) => setNewMeetingItemContent(e.target.value)}
              placeholder="Add checklist item..."
              className="min-w-[220px] flex-1"
            />
            <Input
              value={newMeetingItemAnswer}
              onChange={(e) => setNewMeetingItemAnswer(e.target.value)}
              placeholder="Notes (optional)"
              className="min-w-[220px] flex-1"
            />
            <Button
              variant="outline"
              disabled={!newMeetingItemContent.trim() || addingMeetingItem}
              onClick={() => void addMeetingChecklistItem()}
            >
              {addingMeetingItem ? "Adding..." : "Add"}
            </Button>
          </div>
          <div className="mt-3 space-y-3">
            {meetingChecklist.length ? (
              meetingChecklist.map((item) => {
                const isEditing = editingMeetingItemId === item.id
                return (
                  <div key={item.id} className="flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3">
                    <Checkbox
                      checked={item.isChecked}
                      onCheckedChange={(checked) => toggleMeetingChecklistItem(item.id, Boolean(checked))}
                    />
                    <div className="flex-1 space-y-2">
                      {isEditing ? (
                        <Input
                          value={editingMeetingItemContent}
                          onChange={(e) => setEditingMeetingItemContent(e.target.value)}
                          placeholder="Checklist item"
                        />
                      ) : (
                        <div className="text-sm font-semibold text-slate-700">{item.content}</div>
                      )}
                      {isEditing ? (
                        <Input
                          value={editingMeetingItemAnswer}
                          onChange={(e) => setEditingMeetingItemAnswer(e.target.value)}
                          placeholder="Notes (optional)"
                        />
                      ) : item.answer ? (
                        <div className="text-sm text-muted-foreground">{item.answer}</div>
                      ) : (
                        <div className="text-sm text-muted-foreground">No notes</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => void saveMeetingChecklistItem()}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelEditMeetingChecklistItem}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => startEditMeetingChecklistItem(item.id)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => void deleteMeetingChecklistItem(item.id)}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No meeting checklist items yet.
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {activeTab === "description" ? (
        <Card className="p-6">
          {activePhase === "MEETINGS" ? (
            <>
              <div className="text-lg font-semibold">Project Description</div>
              <Textarea
                value={editingDescription}
                onChange={(e) => setEditingDescription(e.target.value)}
                rows={4}
                className="mt-3"
              />
              <div className="mt-3 flex justify-end">
                <Button variant="outline" disabled={savingDescription} onClick={() => void saveDescription()}>
                  {savingDescription ? "Saving..." : "Save"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-lg font-semibold">Project Description</div>
              <Textarea
                value={editingDescription}
                onChange={(e) => setEditingDescription(e.target.value)}
                rows={4}
                className="mt-3"
              />
              <div className="mt-3 flex justify-end">
                <Button variant="outline" disabled={savingDescription} onClick={() => void saveDescription()}>
                  {savingDescription ? "Saving..." : "Save"}
                </Button>
              </div>
            </>
          )}
        </Card>
      ) : null}

      {activeTab === "testing" ? (
        <Card className="p-6">
          <div className="text-lg font-semibold">Testing Questions</div>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <div>What should we test and why?</div>
            <div>Who owns each test area?</div>
            <div>What environments or data are required?</div>
            <div>How will issues be tracked and fixed?</div>
            <div>What is the acceptance checklist to approve?</div>
          </div>
        </Card>
      ) : null}

      {activeTab === "tasks" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">+ Add Task</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>New Task</DialogTitle>
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
                          {allUsers.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.full_name || m.username || m.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Phase</Label>
                      <Select value={newTaskPhase} onValueChange={setNewTaskPhase}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select phase" />
                        </SelectTrigger>
                        <SelectContent>
                          {PHASES.map((p) => (
                            <SelectItem key={p} value={p}>
                              {PHASE_LABELS[p]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Due date</Label>
                      <Input
                        type="date"
                        value={newDueDate}
                        onChange={(e) => setNewDueDate(normalizeDueDateInput(e.target.value))}
                      />
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
              {visibleTasks.length ? (
                visibleTasks.map((task) => {
                  const assignedId = task.assigned_to || task.assigned_to_user_id || null
                  const assigned = assignedId ? userMap.get(assignedId) : null
                  return (
                    <div key={task.id} className="grid grid-cols-4 gap-3 px-6 py-4 text-sm">
                      <div className="font-medium">{task.title}</div>
                      <div className="text-muted-foreground">
                        {assigned?.full_name || assigned?.username || "-"}
                      </div>
                      <div>
                        <Select
                          value={task.status || "TODO"}
                          onValueChange={(value) => void updateTaskStatus(task.id, value as Task["status"])}
                          disabled={updatingTaskId === task.id}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_STATUSES.map((status) => (
                              <SelectItem key={status} value={status}>
                                {statusLabel(status)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
          {activePhase === "DOKUMENTIMI" ? (
            <Card className="p-6">
              <div className="text-lg font-semibold">Documentation checklist</div>
              <div className="mt-4 space-y-3">
                {documentationChecklist.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 rounded-lg border px-4 py-3">
                    <Checkbox
                      checked={item.isChecked}
                      onCheckedChange={(checked) =>
                        toggleDocumentationChecklistItem(item.id, Boolean(checked))
                      }
                    />
                    <div className={item.isChecked ? "text-muted-foreground line-through" : ""}>
                      {item.question}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <div className="text-sm font-semibold">Documentation file paths</div>
                <div className="mt-3 flex items-center gap-2">
                  <Input
                    placeholder="Add file path..."
                    value={documentationFilePath}
                    onChange={(e) => setDocumentationFilePath(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={!documentationFilePath.trim()}
                    onClick={addDocumentationFilePath}
                  >
                    Add
                  </Button>
                </div>
                {documentationFilePaths.length ? (
                  <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {documentationFilePaths.map((path, idx) => (
                      <div key={`${path}-${idx}`} className="rounded-md border px-3 py-2">
                        {path}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-muted-foreground">No file paths added.</div>
                )}
              </div>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Add item..."
                  value={newChecklistContent}
                  onChange={(e) => setNewChecklistContent(e.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={!newChecklistContent.trim() || addingChecklist}
                  onClick={() => void submitChecklistItem()}
                >
                  {addingChecklist ? "Adding..." : "Add"}
                </Button>
              </div>
              {visibleChecklistItems.length ? (
                visibleChecklistItems.map((item) => (
                  <Card
                    key={item.id}
                    className="cursor-pointer px-6 py-5"
                    onClick={() => void toggleChecklistItem(item.id, !item.is_checked)}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox checked={item.is_checked ?? false} />
                      <div className={item.is_checked ? "text-muted-foreground line-through" : ""}>
                        {(item as any).content || item.title}
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No checklist items yet.</div>
              )}
            </>
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
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={newGaNoteType} onValueChange={setNewGaNoteType}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="GA/KA" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GA">GA</SelectItem>
                  <SelectItem value="KA">KA</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={newGaNotePriority}
                onValueChange={(value) => setNewGaNotePriority(value as "__none__" | "NORMAL" | "HIGH")}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No priority</SelectItem>
                  <SelectItem value="NORMAL">Normal</SelectItem>

                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start gap-2">
              <Textarea
                placeholder="Add GA/KA note..."
                value={newGaNote}
                onChange={(e) => setNewGaNote(e.target.value)}
                rows={3}
              />
              <Button
                variant="outline"
                disabled={!newGaNote.trim() || addingGaNote}
                onClick={() => void submitGaNote()}
              >
                {addingGaNote ? "Adding..." : "Add"}
              </Button>
            </div>
          </div>
          {gaNotes.length ? (
            gaNotes.map((note) => (
              <Card key={note.id} className="border-orange-100 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline" className={note.note_type === "KA" ? "border-orange-200 text-orange-600" : "border-blue-200 text-blue-600"}>
                      {note.note_type || "GA"}
                    </Badge>
                    <span>
                      From {userMap.get(note.created_by || "")?.full_name || userMap.get(note.created_by || "")?.username || "-"}
                    </span>
                    <span>• {formatDateTime(note.created_at)}</span>
                    {note.priority ? (
                      <Badge variant="secondary">{statusLabel(note.priority)}</Badge>
                    ) : null}
                  </div>
                  {note.status !== "CLOSED" ? (
                    <Button variant="outline" size="sm" onClick={() => void closeGaNote(note.id)}>
                      Close
                    </Button>
                  ) : (
                    <Badge variant="secondary">Closed</Badge>
                  )}
                </div>
                <div className="mt-3 text-sm text-muted-foreground">{note.content}</div>
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
            <div className="text-sm font-semibold">GA Prompt</div>
            <Textarea value={gaPromptContent} onChange={(e) => setGaPromptContent(e.target.value)} rows={8} />
            <div className="flex justify-end">
              <Button variant="outline" disabled={savingGaPrompt} onClick={() => void savePrompt("GA_PROMPT")}>
                {savingGaPrompt ? "Saving..." : "Save"}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">Used for GA guidelines and standards.</div>
            {prompts.filter((p) => p.type === "GA_PROMPT").length ? (
              <div className="space-y-3 pt-2">
                {prompts
                  .filter((p) => p.type === "GA_PROMPT")
                  .map((prompt) => (
                    <Card key={prompt.id} className="border border-muted p-4">
                      <div className="text-xs text-muted-foreground">
                        {new Date(prompt.created_at).toLocaleString("sq-AL")}
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{prompt.content}</div>
                    </Card>
                  ))}
              </div>
            ) : null}
          </Card>
          <Card className="p-5 space-y-3">
            <div className="text-sm font-semibold">Development Prompt</div>
            <Textarea value={devPromptContent} onChange={(e) => setDevPromptContent(e.target.value)} rows={8} />
            <div className="flex justify-end">
              <Button variant="outline" disabled={savingDevPrompt} onClick={() => void savePrompt("ZHVILLIM_PROMPT")}>
                {savingDevPrompt ? "Saving..." : "Save"}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">Used by the development team.</div>
            {prompts.filter((p) => p.type === "ZHVILLIM_PROMPT").length ? (
              <div className="space-y-3 pt-2">
                {prompts
                  .filter((p) => p.type === "ZHVILLIM_PROMPT")
                  .map((prompt) => (
                    <Card key={prompt.id} className="border border-muted p-4">
                      <div className="text-xs text-muted-foreground">
                        {new Date(prompt.created_at).toLocaleString("sq-AL")}
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{prompt.content}</div>
                    </Card>
                  ))}
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  )
}

