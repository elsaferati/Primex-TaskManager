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
  MBYLLUR: "Closed",
}

const TABS = [
  { id: "description", label: "Description" },
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

export default function DevelopmentProjectPage() {
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
  const [meetingChecklist, setMeetingChecklist] = React.useState(() =>
    MEETING_CHECKLIST_ITEMS.map((content, index) => ({
      id: `meeting-${index}`,
      content,
      isChecked: false,
    }))
  )
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
      if (cRes.ok) setChecklistItems((await cRes.json()) as ChecklistItem[])
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
        toast.error(typeof detail === "string" ? detail : "An error occurred")
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
        toast.error(typeof detail === "string" ? detail : "An error occurred")
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
        toast.error(typeof detail === "string" ? detail : "An error occurred")
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

  const toggleMeetingChecklistItem = (itemId: string, next: boolean) => {
    setMeetingChecklist((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, isChecked: next } : item))
    )
  }

  const updateMeetingChecklistItem = (itemId: string, content: string) => {
    setMeetingChecklist((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, content } : item))
    )
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
        toast.error(typeof detail === "string" ? detail : "An error occurred")
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
        toast.error(typeof detail === "string" ? detail : "An error occurred")
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
        toast.error(typeof detail === "string" ? detail : "An error occurred")
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
      toast.error(typeof detail === "string" ? detail : "An error occurred")
      return
    }
    const updated = (await res.json()) as GaNote
    setGaNotes((prev) => prev.map((note) => (note.id === updated.id ? updated : note)))
  }

  const phaseValue = viewedPhase || project?.current_phase || "MEETINGS"
  const visibleTabs = React.useMemo(() => {
    if (phaseValue === "MEETINGS") {
      return [
        ...TABS.filter((tab) => tab.id === "description"),
        ...MEETING_TABS,
        ...TABS.filter((tab) => tab.id === "ga"),
      ]
    }
    if (phaseValue === "PLANIFIKIMI") {
      return TABS.filter((tab) => tab.id !== "checklists" && tab.id !== "members" && tab.id !== "prompts")
    }
    if (phaseValue === "ZHVILLIMI" || phaseValue === "DEVELOPMENT") {
      return [
        ...TABS.filter((tab) => tab.id === "tasks" || tab.id === "prompts"),
        ...TABS.filter((tab) => tab.id === "ga"),
      ]
    }
    if (phaseValue === "TESTIMI") {
      return TABS.filter((tab) => tab.id !== "checklists" && tab.id !== "members" && tab.id !== "prompts")
    }
    if (phaseValue === "DOKUMENTIMI") {
      return TABS.filter((tab) =>
        tab.id !== "description" && tab.id !== "tasks" && tab.id !== "members" && tab.id !== "prompts"
      )
    }
    return TABS
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

  if (!project)
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50/30 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-sky-500 border-r-transparent"></div>
          <div className="mt-4 text-sm text-slate-600">Loading project...</div>
        </div>
      </div>
    )

  const title = project.title || project.name || "Project"
  const phase = project.current_phase || "MEETINGS"
  const phaseIndex = PHASES.indexOf(phase as (typeof PHASES)[number])
  const canClosePhase = phase !== "MBYLLUR"
  const userMap = new Map([...allUsers, ...members, ...(user ? [user] : [])].map((m) => [m.id, m]))
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
        toast.error(typeof detail === "string" ? detail : "An error occurred")
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
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50/30 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header Section with Soft Blue Background */}
        <Card className="bg-white/80 backdrop-blur-sm border-sky-100 shadow-sm rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-sky-100/50 via-blue-50/50 to-sky-100/50 px-6 py-5 border-b border-sky-100/50">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="text-sm text-sky-600/70 hover:text-sky-700 transition-colors mb-4 inline-flex items-center gap-1.5 font-medium"
                >
                  <span className="text-sky-500">←</span> Back to Projects
                </button>
                <h1 className="text-4xl font-bold text-slate-800 mb-4 tracking-tight">{title}</h1>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <Badge className="bg-sky-100 text-sky-700 border-sky-200 hover:bg-sky-200/80 px-3 py-1.5 text-sm font-medium rounded-lg shadow-sm">
                    {PHASE_LABELS[phase] || "Meetings"}
                  </Badge>
                  {activePhase !== phase && (
                    <Badge variant="outline" className="bg-blue-50/50 text-blue-600 border-blue-200 px-3 py-1.5 text-xs font-medium rounded-lg">
                      View: {PHASE_LABELS[activePhase] || "Meetings"}
                    </Badge>
                  )}
                </div>
                {/* Phase Navigation - Beautiful Soft Blue Pills */}
                <div className="flex flex-wrap items-center gap-2">
                  {PHASES.map((p, idx) => {
                    const isViewed = p === activePhase
                    const isCurrent = p === phase
                    const isLocked = idx > phaseIndex
                    return (
                      <React.Fragment key={p}>
                        <button
                          type="button"
                          onClick={() => {
                            if (isLocked) return
                            setViewedPhase(p)
                          }}
                          className={[
                            "px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200",
                            isLocked
                              ? "bg-white/60 text-slate-300 border border-slate-200 cursor-not-allowed"
                              : isViewed
                                ? "bg-sky-500 text-white shadow-md shadow-sky-200/50 scale-105"
                                : isCurrent
                                  ? "bg-sky-100 text-sky-700 hover:bg-sky-200/80 border border-sky-200"
                                  : "bg-white/60 text-slate-500 hover:bg-sky-50/80 border border-slate-200 hover:border-sky-200",
                          ].join(" ")}
                          aria-pressed={isViewed}
                          disabled={isLocked}
                        >
                          {PHASE_LABELS[p]}
                        </button>
                        {idx < PHASES.length - 1 && (
                          <span className="text-sky-300 text-lg font-light">→</span>
                        )}
                      </React.Fragment>
                    )
                  })}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button className="bg-white hover:bg-sky-50 text-slate-700 border border-slate-200 shadow-sm rounded-xl px-4 py-2 font-medium transition-all">
                  Settings
                </Button>
              </div>
            </div>
          </div>

          {/* Close Phase Button */}
          <div className="px-6 py-4 bg-white/50 flex justify-end">
            <Button
              variant="outline"
              disabled={!canClosePhase || advancingPhase}
              onClick={() => void advancePhase()}
              className="bg-sky-500 hover:bg-sky-600 text-white border-0 shadow-md shadow-sky-200/50 rounded-xl px-6 py-2.5 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {advancingPhase ? "Closing..." : "Close Phase"}
            </Button>
          </div>
        </Card>

        {/* Tabs Navigation - Soft Blue Design */}
        <Card className="bg-white/80 backdrop-blur-sm border-sky-100 shadow-sm rounded-2xl overflow-hidden">
          <div className="px-6 py-1">
            <div className="flex flex-wrap gap-1">
              {visibleTabs.map((tab) => {
                const isActive = tab.id === activeTab
                const label = activePhase === "TESTIMI" && tab.id === "description" ? "Testing" : tab.label
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                      "relative px-5 py-3 text-sm font-medium rounded-xl transition-all duration-200",
                      tab.id === "ga" ? "ml-auto" : "",
                      isActive
                        ? "bg-sky-100 text-sky-700 shadow-sm"
                        : "text-slate-500 hover:text-sky-600 hover:bg-sky-50/50",
                    ].join(" ")}
                  >
                    {label}
                    {isActive && <span className="absolute inset-x-2 bottom-1.5 h-0.5 bg-sky-500 rounded-full" />}
                  </button>
                )
              })}
            </div>
          </div>
        </Card>

        {/* Tab Content Area with Soft Blue Design */}
        <div className="min-h-[400px]">
          {activeTab === "meeting-focus" ? (
            <Card className="bg-white/90 backdrop-blur-sm border-sky-100 shadow-sm rounded-2xl overflow-hidden">
              <div className="p-6">
                <div className="text-xl font-semibold text-slate-800 mb-2">Meeting Focus</div>
                <div className="text-sm text-slate-500 mb-6">Main points to discuss in the meeting.</div>
                <div className="space-y-3">
                  {MEETING_POINTS.map((point) => (
                    <div key={point} className="flex items-start gap-3 p-4 rounded-xl bg-sky-50/50 border border-sky-100/50">
                      <span className="mt-1 h-2 w-2 rounded-full bg-sky-400 flex-shrink-0" aria-hidden />
                      <span className="text-sm text-slate-700">{point}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ) : null}

          {activeTab === "meeting-checklist" ? (
            <Card className="bg-white/90 backdrop-blur-sm border-sky-100 shadow-sm rounded-2xl overflow-hidden">
              <div className="p-6">
                <div className="text-xl font-semibold text-slate-800 mb-6">Meeting Checklist</div>
                <div className="space-y-3">
                  {meetingChecklist.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 rounded-xl border border-sky-100 bg-white px-4 py-3 hover:bg-sky-50/30 transition-colors">
                      <Checkbox
                        checked={item.isChecked}
                        onCheckedChange={(checked) => toggleMeetingChecklistItem(item.id, Boolean(checked))}
                        className="mt-1"
                      />
                      <Input
                        value={item.content}
                        onChange={(e) => updateMeetingChecklistItem(item.id, e.target.value)}
                        className="flex-1 border-sky-200 focus:border-sky-400"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ) : null}

          {activeTab === "description" ? (
            <Card className="bg-white/90 backdrop-blur-sm border-sky-100 shadow-sm rounded-2xl overflow-hidden">
              <div className="p-6">
                {activePhase === "MEETINGS" ? (
                  <>
                    <div className="text-xl font-semibold text-slate-800 mb-2">Project Description</div>
                    <Textarea
                      value={editingDescription}
                      onChange={(e) => setEditingDescription(e.target.value)}
                      rows={6}
                      className="mt-4 border-sky-200 focus:border-sky-400 rounded-xl"
                    />
                    <div className="mt-4 flex justify-end">
                      <Button
                        variant="outline"
                        disabled={savingDescription}
                        onClick={() => void saveDescription()}
                        className="bg-sky-500 hover:bg-sky-600 text-white border-0 shadow-md shadow-sky-200/50 rounded-xl px-6"
                      >
                        {savingDescription ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </>
                ) : activePhase === "TESTIMI" ? (
                  <>
                    <div className="text-xl font-semibold text-slate-800 mb-2">Testing Questions</div>
                    <div className="mt-6 space-y-3">
                      {[
                        "What should we test and why?",
                        "Who owns each test area?",
                        "What environments or data are required?",
                        "How will issues be tracked and fixed?",
                        "What is the acceptance checklist to approve?",
                      ].map((question, idx) => (
                        <div key={idx} className="p-4 rounded-xl bg-sky-50/50 border border-sky-100/50 text-sm text-slate-700">
                          {question}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xl font-semibold text-slate-800 mb-2">Project Description</div>
                    <Textarea
                      value={editingDescription}
                      onChange={(e) => setEditingDescription(e.target.value)}
                      rows={6}
                      className="mt-4 border-sky-200 focus:border-sky-400 rounded-xl"
                    />
                    <div className="mt-4 flex justify-end">
                      <Button
                        variant="outline"
                        disabled={savingDescription}
                        onClick={() => void saveDescription()}
                        className="bg-sky-500 hover:bg-sky-600 text-white border-0 shadow-md shadow-sky-200/50 rounded-xl px-6"
                      >
                        {savingDescription ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Card>
          ) : null}

          {activeTab === "tasks" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-end">
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-sky-500 hover:bg-sky-600 text-white border-0 shadow-md shadow-sky-200/50 rounded-xl px-6">
                      + Add Task
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg bg-white border-sky-100 rounded-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-slate-800">New Task</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-slate-700">Title</Label>
                        <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="border-sky-200 focus:border-sky-400 rounded-xl" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-700">Description</Label>
                        <Textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="border-sky-200 focus:border-sky-400 rounded-xl" />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-slate-700">Status</Label>
                          <Select value={newStatus} onValueChange={(v) => setNewStatus(v as typeof newStatus)}>
                            <SelectTrigger className="border-sky-200 focus:border-sky-400 rounded-xl">
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
                          <Label className="text-slate-700">Priority</Label>
                          <Select value={newPriority} onValueChange={(v) => setNewPriority(v as typeof newPriority)}>
                            <SelectTrigger className="border-sky-200 focus:border-sky-400 rounded-xl">
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
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-slate-700">Assign to</Label>
                          <Select value={newAssignedTo} onValueChange={setNewAssignedTo}>
                            <SelectTrigger className="border-sky-200 focus:border-sky-400 rounded-xl">
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
                          <Label className="text-slate-700">Phase</Label>
                          <Select value={newTaskPhase} onValueChange={setNewTaskPhase}>
                            <SelectTrigger className="border-sky-200 focus:border-sky-400 rounded-xl">
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
                          <Label className="text-slate-700">Due date</Label>
                          <Input
                            type="date"
                            value={newDueDate}
                            onChange={(e) => setNewDueDate(normalizeDueDateInput(e.target.value))}
                            className="border-sky-200 focus:border-sky-400 rounded-xl"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          disabled={!newTitle.trim() || creating}
                          onClick={() => void submitCreateTask()}
                          className="bg-sky-500 hover:bg-sky-600 text-white border-0 shadow-md shadow-sky-200/50 rounded-xl px-6"
                        >
                          {creating ? "Creating..." : "Create"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <Card className="bg-white/90 backdrop-blur-sm border-sky-100 shadow-sm rounded-2xl overflow-hidden p-0">
                <div className="divide-y divide-sky-100">
                  {visibleTasks.length ? (
                    visibleTasks.map((task) => {
                      const assignedId = task.assigned_to || task.assigned_to_user_id || null
                      const assigned = assignedId ? userMap.get(assignedId) : null
                      return (
                        <div key={task.id} className="grid grid-cols-4 gap-4 px-6 py-4 text-sm hover:bg-sky-50/30 transition-colors">
                          <div className="font-medium text-slate-800">{task.title}</div>
                          <div className="text-slate-600">
                            {assigned?.full_name || assigned?.username || "-"}
                          </div>
                          <div>
                            <Select
                              value={task.status || "TODO"}
                              onValueChange={(value) => void updateTaskStatus(task.id, value as Task["status"])}
                              disabled={updatingTaskId === task.id}
                            >
                              <SelectTrigger className="h-8 border-sky-200 focus:border-sky-400 rounded-xl">
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
                          <div className="text-slate-500">-</div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="px-6 py-8 text-sm text-slate-500 text-center">No tasks yet.</div>
                  )}
                </div>
              </Card>
            </div>
          ) : null}

          {activeTab === "checklists" ? (
            <div className="space-y-4">
              {activePhase === "DOKUMENTIMI" ? (
                <Card className="bg-white/90 backdrop-blur-sm border-sky-100 shadow-sm rounded-2xl overflow-hidden">
                  <div className="p-6">
                    <div className="text-xl font-semibold text-slate-800 mb-6">Documentation Checklist</div>
                    <div className="space-y-3">
                      {documentationChecklist.map((item) => (
                        <div key={item.id} className="flex items-start gap-3 rounded-xl border border-sky-100 bg-white px-4 py-3 hover:bg-sky-50/30 transition-colors">
                          <Checkbox
                            checked={item.isChecked}
                            onCheckedChange={(checked) => toggleDocumentationChecklistItem(item.id, Boolean(checked))}
                            className="mt-1"
                          />
                          <div className={item.isChecked ? "text-slate-400 line-through" : "text-slate-700"}>
                            {item.question}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6">
                      <div className="text-sm font-semibold text-slate-800 mb-3">Documentation File Paths</div>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Add file path..."
                          value={documentationFilePath}
                          onChange={(e) => setDocumentationFilePath(e.target.value)}
                          className="border-sky-200 focus:border-sky-400 rounded-xl"
                        />
                        <Button
                          variant="outline"
                          disabled={!documentationFilePath.trim()}
                          onClick={addDocumentationFilePath}
                          className="bg-sky-500 hover:bg-sky-600 text-white border-0 shadow-md shadow-sky-200/50 rounded-xl"
                        >
                          Add
                        </Button>
                      </div>
                      {documentationFilePaths.length ? (
                        <div className="mt-4 space-y-2">
                          {documentationFilePaths.map((path, idx) => (
                            <div key={`${path}-${idx}`} className="rounded-xl border border-sky-100 bg-sky-50/50 px-4 py-2 text-sm text-slate-700">
                              {path}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-slate-500">No file paths added.</div>
                      )}
                    </div>
                  </div>
                </Card>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Add item..."
                      value={newChecklistContent}
                      onChange={(e) => setNewChecklistContent(e.target.value)}
                      className="border-sky-200 focus:border-sky-400 rounded-xl"
                    />
                    <Button
                      variant="outline"
                      disabled={!newChecklistContent.trim() || addingChecklist}
                      onClick={() => void submitChecklistItem()}
                      className="bg-sky-500 hover:bg-sky-600 text-white border-0 shadow-md shadow-sky-200/50 rounded-xl"
                    >
                      {addingChecklist ? "Adding..." : "Add"}
                    </Button>
                  </div>
                  {checklistItems.length ? (
                    checklistItems.map((item) => (
                      <Card
                        key={item.id}
                        className="cursor-pointer px-6 py-5 bg-white/90 backdrop-blur-sm border-sky-100 shadow-sm rounded-2xl hover:bg-sky-50/30 transition-all"
                        onClick={() => void toggleChecklistItem(item.id, !item.is_checked)}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox checked={item.is_checked ?? false} />
                          <div className={item.is_checked ? "text-slate-400 line-through" : "text-slate-700"}>
                            {(item as any).content || item.title}
                          </div>
                        </div>
                      </Card>
                    ))
                  ) : (
                    <div className="text-sm text-slate-500 text-center py-8">No checklist items yet.</div>
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
                    <Button className="bg-sky-500 hover:bg-sky-600 text-white border-0 shadow-md shadow-sky-200/50 rounded-xl px-6">
                      + Add Members
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg bg-white border-sky-100 rounded-2xl">
                    <DialogHeader>
                      <DialogTitle className="text-slate-800">Select Members</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      {departmentUsers.length ? (
                        departmentUsers.map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center justify-between rounded-xl border border-sky-100 bg-white px-4 py-3 hover:bg-sky-50/30 transition-colors cursor-pointer"
                            onClick={() => toggleMemberSelect(u.id)}
                          >
                            <div className="flex items-center gap-3">
                              <Checkbox checked={selectedMemberIds.includes(u.id)} />
                              <span className="text-slate-700">{u.full_name || u.username || u.email}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-slate-500">No department users found.</div>
                      )}
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setMembersOpen(false)} className="rounded-xl border-sky-200">
                          Cancel
                        </Button>
                        <Button
                          disabled={savingMembers || selectedMemberIds.length === 0}
                          onClick={() => void submitMembers()}
                          className="bg-sky-500 hover:bg-sky-600 text-white border-0 shadow-md shadow-sky-200/50 rounded-xl"
                        >
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
                    <Card key={m.id} className="flex flex-col items-center gap-3 text-center p-6 bg-white/90 backdrop-blur-sm border-sky-100 shadow-sm rounded-2xl hover:shadow-md transition-shadow">
                      <div className="h-20 w-20 rounded-full bg-gradient-to-br from-sky-100 to-blue-100 text-lg font-semibold text-sky-700 flex items-center justify-center shadow-sm">
                        {initials(m.full_name || m.username || m.email)}
                      </div>
                      <div className="text-sm font-semibold text-slate-800">{m.full_name || m.username || m.email}</div>
                    </Card>
                  ))
                ) : (
                  <div className="text-sm text-slate-500 text-center py-8 col-span-full">No members yet.</div>
                )}
              </div>
            </div>
          ) : null}

          {activeTab === "ga" ? (
            <div className="space-y-4">
              <Card className="bg-white/90 backdrop-blur-sm border-sky-100 shadow-sm rounded-2xl overflow-hidden">
                <div className="p-6 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={newGaNoteType} onValueChange={(value) => setNewGaNoteType(value as "GA" | "KA")}>
                      <SelectTrigger className="w-28 border-sky-200 focus:border-sky-400 rounded-xl">
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
                      <SelectTrigger className="w-40 border-sky-200 focus:border-sky-400 rounded-xl">
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
                      className="border-sky-200 focus:border-sky-400 rounded-xl"
                    />
                    <Button
                      variant="outline"
                      disabled={!newGaNote.trim() || addingGaNote}
                      onClick={() => void submitGaNote()}
                      className="bg-sky-500 hover:bg-sky-600 text-white border-0 shadow-md shadow-sky-200/50 rounded-xl"
                    >
                      {addingGaNote ? "Adding..." : "Add"}
                    </Button>
                  </div>
                </div>
              </Card>
              {gaNotes.length ? (
                gaNotes.map((note) => (
                  <Card key={note.id} className="bg-white/90 backdrop-blur-sm border-sky-100 shadow-sm rounded-2xl overflow-hidden p-5 hover:shadow-md transition-shadow">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Badge className={note.note_type === "KA" ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-sky-100 text-sky-700 border-sky-200"}>
                          {note.note_type || "GA"}
                        </Badge>
                        <span>
                          From {userMap.get(note.created_by || "")?.full_name || userMap.get(note.created_by || "")?.username || "-"}
                        </span>
                        <span>• {formatDateTime(note.created_at)}</span>
                        {note.priority ? (
                          <Badge className="bg-slate-100 text-slate-700 border-slate-200">{statusLabel(note.priority)}</Badge>
                        ) : null}
                      </div>
                      {note.status !== "CLOSED" ? (
                        <Button variant="outline" size="sm" onClick={() => void closeGaNote(note.id)} className="rounded-xl border-sky-200 hover:bg-sky-50">
                          Close
                        </Button>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600 border-slate-200">Closed</Badge>
                      )}
                    </div>
                    <div className="mt-3 text-sm text-slate-700">{note.content}</div>
                  </Card>
                ))
              ) : (
                <div className="text-sm text-slate-500 text-center py-8">No GA/KA notes yet.</div>
              )}
            </div>
          ) : null}

          {activeTab === "prompts" ? (
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="bg-white/90 backdrop-blur-sm border-sky-100 shadow-sm rounded-2xl overflow-hidden p-6 space-y-4">
                <div className="text-lg font-semibold text-slate-800">GA Prompt</div>
                <Textarea value={gaPromptContent} onChange={(e) => setGaPromptContent(e.target.value)} rows={8} className="border-sky-200 focus:border-sky-400 rounded-xl" />
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    disabled={savingGaPrompt}
                    onClick={() => void savePrompt("GA_PROMPT")}
                    className="bg-sky-500 hover:bg-sky-600 text-white border-0 shadow-md shadow-sky-200/50 rounded-xl px-6"
                  >
                    {savingGaPrompt ? "Saving..." : "Save"}
                  </Button>
                </div>
                <div className="text-xs text-slate-500">Used for GA guidelines and standards.</div>
                {prompts.filter((p) => p.type === "GA_PROMPT").length ? (
                  <div className="space-y-3 pt-2">
                    {prompts
                      .filter((p) => p.type === "GA_PROMPT")
                      .map((prompt) => (
                        <Card key={prompt.id} className="border border-sky-100 bg-sky-50/30 p-4 rounded-xl">
                          <div className="text-xs text-slate-500">
                            {new Date(prompt.created_at).toLocaleString("sq-AL")}
                          </div>
                          <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{prompt.content}</div>
                        </Card>
                      ))}
                  </div>
                ) : null}
              </Card>
              <Card className="bg-white/90 backdrop-blur-sm border-sky-100 shadow-sm rounded-2xl overflow-hidden p-6 space-y-4">
                <div className="text-lg font-semibold text-slate-800">Development Prompt</div>
                <Textarea value={devPromptContent} onChange={(e) => setDevPromptContent(e.target.value)} rows={8} className="border-sky-200 focus:border-sky-400 rounded-xl" />
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    disabled={savingDevPrompt}
                    onClick={() => void savePrompt("ZHVILLIM_PROMPT")}
                    className="bg-sky-500 hover:bg-sky-600 text-white border-0 shadow-md shadow-sky-200/50 rounded-xl px-6"
                  >
                    {savingDevPrompt ? "Saving..." : "Save"}
                  </Button>
                </div>
                <div className="text-xs text-slate-500">Used by the development team.</div>
                {prompts.filter((p) => p.type === "ZHVILLIM_PROMPT").length ? (
                  <div className="space-y-3 pt-2">
                    {prompts
                      .filter((p) => p.type === "ZHVILLIM_PROMPT")
                      .map((prompt) => (
                        <Card key={prompt.id} className="border border-sky-100 bg-sky-50/30 p-4 rounded-xl">
                          <div className="text-xs text-slate-500">
                            {new Date(prompt.created_at).toLocaleString("sq-AL")}
                          </div>
                          <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{prompt.content}</div>
                        </Card>
                      ))}
                  </div>
                ) : null}
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
