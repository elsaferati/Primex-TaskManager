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
import type { ChecklistItem, GaNote, Meeting, Project, ProjectPrompt, Task, User } from "@/lib/types"

// MST phases for Graphic Design projects
const MST_PHASES = ["PLANNING", "PRODUCT", "CONTROL", "FINAL"] as const
const MST_PHASE_LABELS: Record<string, string> = {
  PLANNING: "Planning",
  PRODUCT: "Product",
  CONTROL: "Control",
  FINAL: "Final",
  CLOSED: "Closed",
}

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
  { id: "description", label: "Description" },
  { id: "tasks", label: "Tasks" },
  { id: "checklist", label: "Checklist" },
  { id: "members", label: "Members" },
  { id: "ga-notes", label: "GA Notes" },
] as const

// Tabs for Control phase
const CONTROL_TABS = [
  { id: "description", label: "Description" },
  { id: "tasks", label: "Tasks" },
  { id: "checklist", label: "Checklist" },
  { id: "members", label: "Members" },
  { id: "ga-notes", label: "GA Notes" },
] as const

// Tabs for Final phase
const FINAL_TABS = [
  { id: "description", label: "Description" },
  { id: "tasks", label: "Tasks" },
  { id: "checklist", label: "Checklist" },
  { id: "members", label: "Members" },
  { id: "ga-notes", label: "GA Notes" },
] as const

type TabId = (typeof PLANNING_TABS)[number]["id"] | (typeof PRODUCT_TABS)[number]["id"] | (typeof CONTROL_TABS)[number]["id"] | (typeof FINAL_TABS)[number]["id"]

// Task statuses and priorities
const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const
const TASK_PRIORITIES = ["NORMAL", "HIGH"] as const

// Project Acceptance questions (PRANIMI I PROJEKTIT) - connected to database
const PROJECT_ACCEPTANCE_QUESTIONS = [
  "A është pranuar projekti?",
  "A është krijuar folderi për projektin?",
  "A janë ruajtur të gjitha dokumentet?",
  "A janë eksportuar të gjitha fotot në dosjen 01_ALL_PHOTO?",
  "A është kryer organizimi i fotove në foldera?",
  "A është shikuar sa foto janë mungesë nese po a është dërguar email tek klienti?",
  "A janë analizuar dokumentet që i ka dërguar klienti?",
  "A janë identifikuar karakteristikat e produktit? p.sh (glass, soft close)...",
  "A janë gjetur variacionet? (fusse, farbe)",
  "A është përgatitur lista e produkteve e ndarë me kategori?",
  "A është rast i ri, apo është kategori ekzistuese?",
]

// GA Meeting questions (TAKIM ME GA/DV)
const GA_MEETING_QUESTIONS = [
  "A është diskutuar me GA për propozimin?",
  "Çfarë është vendosur për të vazhduar?",
  "A ka pasur pika shtesë nga takimi?",
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

// Helper function to initialize checklist items in database (Project Acceptance + GA Meeting)
async function initializePlanningChecklistItems(
  projectId: string,
  existingItems: ChecklistItem[],
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>
) {
  const existingMap = new Map<string, ChecklistItem>()
  existingItems.forEach((item) => {
    if (item.path && item.title) {
      const key = `${item.path}|${item.title}`
      existingMap.set(key, item)
    }
  })

  // Project Acceptance items
  const acceptanceItemsToCreate = PROJECT_ACCEPTANCE_QUESTIONS.filter((question) => {
    const key = `PROJECT_ACCEPTANCE|${question}`
    return !existingMap.has(key)
  })

  // GA Meeting items
  const gaMeetingItemsToCreate = GA_MEETING_QUESTIONS.filter((question) => {
    const key = `GA_MEETING|${question}`
    return !existingMap.has(key)
  })

  const createPromises = [
    ...acceptanceItemsToCreate.map(async (question) => {
      try {
        const res = await apiFetch("/checklist-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            item_type: "CHECKBOX",
            path: "PROJECT_ACCEPTANCE",
            title: question,
            keyword: "PRANIMI_PROJEKTIT",
            description: question,
            category: "PROJECT_ACCEPTANCE",
            is_checked: false,
          }),
        })
        if (!res.ok) {
          console.error(`Failed to create acceptance item "${question}"`)
          return false
        }
        return true
      } catch (error) {
        console.error(`Failed to create acceptance item "${question}":`, error)
        return false
      }
    }),
    ...gaMeetingItemsToCreate.map(async (question) => {
      try {
        const res = await apiFetch("/checklist-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            item_type: "CHECKBOX",
            path: "GA_MEETING",
            title: question,
            keyword: "TAKIM_GA_DV",
            description: question,
            category: "GA_MEETING",
            is_checked: false,
          }),
        })
        if (!res.ok) {
          console.error(`Failed to create GA meeting item "${question}"`)
          return false
        }
        return true
      } catch (error) {
        console.error(`Failed to create GA meeting item "${question}":`, error)
        return false
      }
    }),
  ]

  await Promise.all(createPromises)
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
  const [acceptanceItemsInitialized, setAcceptanceItemsInitialized] = React.useState(false)

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
        
        // Initialize planning checklist items (Project Acceptance + GA Meeting) if not already done
        if (!acceptanceItemsInitialized) {
          await initializePlanningChecklistItems(p.id, items, apiFetch)
          // Reload checklist items after initialization
          const refreshRes = await apiFetch(`/checklist-items?project_id=${p.id}`)
          if (refreshRes.ok) {
            setChecklistItems((await refreshRes.json()) as ChecklistItem[])
          }
          setAcceptanceItemsInitialized(true)
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
  }, [apiFetch, projectId, acceptanceItemsInitialized])

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
    const uncheckedItems = checklistItems.filter((item) => !item.is_checked)
    
    if (openTasks.length || uncheckedItems.length) {
      const blockers: string[] = []
      if (openTasks.length) blockers.push(`${openTasks.length} open tasks`)
      if (uncheckedItems.length) blockers.push(`${uncheckedItems.length} checklist items`)
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

  // Filter acceptance checklist items (PRANIMI I PROJEKTIT)
  const acceptanceItems = React.useMemo(
    () => checklistItems.filter((item) => item.path === "PROJECT_ACCEPTANCE"),
    [checklistItems]
  )

  // Filter GA Meeting checklist items (TAKIM ME GA/DV)
  const gaMeetingItems = React.useMemo(
    () => checklistItems.filter((item) => item.path === "GA_MEETING"),
    [checklistItems]
  )

  // Filter general checklist items (not project acceptance or GA meeting)
  const generalChecklistItems = React.useMemo(
    () => checklistItems.filter((item) => item.path !== "PROJECT_ACCEPTANCE" && item.path !== "GA_MEETING"),
    [checklistItems]
  )

  if (!project) return <div className="text-sm text-muted-foreground">Loading...</div>

  const title = project.title || project.name || "Project"
  const phase = project.current_phase || "PLANNING"
  const phaseSequence = MST_PHASES
  const phaseLabels = MST_PHASE_LABELS
  const phaseIndex = phaseSequence.indexOf(phase as (typeof phaseSequence)[number])
  const lockedAfterIndex = phaseIndex === -1 ? 0 : phaseIndex
  const canClosePhase = phase !== "CLOSED"
  const userMap = new Map([...allUsers, ...members, ...(user ? [user] : [])].map((m) => [m.id, m]))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button type="button" onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-foreground">&larr; Back to Projects</button>
          <div className="mt-3 text-3xl font-semibold">{title}</div>
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
        <Button variant="outline" disabled={!canClosePhase || advancingPhase} onClick={() => void advancePhase()}>
          {advancingPhase ? "Advancing..." : "Advance to Next Phase"}
        </Button>
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
                      <Label>Title</Label>
                      <Input
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="Task title"
                      />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        placeholder="Task description"
                      />
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
                      <Label>Assignee</Label>
                      <Select value={newAssignedTo} onValueChange={setNewAssignedTo}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unassigned__">Unassigned</SelectItem>
                          {departmentUsers.map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Due Date</Label>
                      <Input
                        type="date"
                        value={newDueDate}
                        onChange={(e) => setNewDueDate(e.target.value)}
                      />
                    </div>
                    <Button onClick={() => void submitCreateTask()} disabled={creating} className="w-full">
                      {creating ? "Creating..." : "Create Task"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {visibleTasks.length === 0 ? (
              <p className="text-muted-foreground">No tasks for this phase.</p>
            ) : (
              <div className="space-y-3">
                {visibleTasks.map((task) => {
                  const assignee = task.assigned_to ? userMap.get(task.assigned_to) : null
                  return (
                    <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{task.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {assignee ? assignee.full_name || assignee.email : "Unassigned"}
                          {task.due_date ? ` • Due: ${formatDateTime(task.due_date)}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={task.priority === "HIGH" ? "destructive" : "secondary"}>
                          {task.priority}
                        </Badge>
                        <Badge variant={task.status === "DONE" ? "default" : "outline"}>
                          {statusLabel(task.status)}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        )}

        {/* Checklist Tab (empty for now as requested) */}
        {activeTab === "checklist" && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Checklist</h3>
            <div className="flex gap-2 mb-4">
              <Input
                value={newChecklistContent}
                onChange={(e) => setNewChecklistContent(e.target.value)}
                placeholder="Add new checklist item..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitChecklistItem()
                }}
              />
              <Button onClick={() => void submitChecklistItem()} disabled={addingChecklist}>
                {addingChecklist ? "Adding..." : "Add"}
              </Button>
            </div>
            {generalChecklistItems.length === 0 ? (
              <p className="text-muted-foreground">No checklist items yet. Add items above.</p>
            ) : (
              <div className="space-y-2">
                {generalChecklistItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50">
                    <Checkbox
                      checked={item.is_checked || false}
                      onCheckedChange={(checked) => void toggleChecklistItem(item.id, !!checked)}
                    />
                    <span className={item.is_checked ? "line-through text-muted-foreground" : ""}>
                      {item.title || item.content}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
                  <div key={item.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <span className="text-purple-600 font-medium min-w-[24px]">{idx + 1}.</span>
                    <Checkbox
                      checked={item.is_checked || false}
                      onCheckedChange={(checked) => void toggleChecklistItem(item.id, !!checked)}
                    />
                    <span className={item.is_checked ? "line-through text-muted-foreground" : ""}>
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* GA Meeting Tab (TAKIM ME GA/DV) */}
        {activeTab === "ga-meeting" && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Takim me GA/DV</h3>
            
            {/* GA Meeting Questions */}
            <div className="mb-6">
              <div className="space-y-3">
                {gaMeetingItems.length === 0 ? (
                  <p className="text-muted-foreground">Duke ngarkuar checklistën e takimit...</p>
                ) : (
                  gaMeetingItems.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <span className="text-purple-600 font-medium min-w-[24px]">{idx + 1}.</span>
                      <Checkbox
                        checked={item.is_checked || false}
                        onCheckedChange={(checked) => void toggleChecklistItem(item.id, !!checked)}
                      />
                      <span className={item.is_checked ? "line-through text-muted-foreground" : ""}>
                        {item.title}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Scheduled Meetings */}
            <div>
              <h4 className="font-medium mb-3">Takimet e planifikuara</h4>
              {meetings.length === 0 ? (
                <p className="text-muted-foreground">Nuk ka takime të planifikuara për këtë projekt.</p>
              ) : (
                <div className="space-y-2">
                  {meetings.map((meeting) => (
                    <div key={meeting.id} className="p-3 border rounded-lg">
                      <div className="font-medium">{formatMeetingLabel(meeting)}</div>
                      {meeting.platform && (
                        <div className="text-sm text-muted-foreground">Platforma: {meeting.platform}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
                {gaNotes.map((note) => {
                  const creator = note.created_by ? userMap.get(note.created_by) : null
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
                            {creator ? creator.full_name || creator.email : "Unknown"} • {formatDateTime(note.created_at)}
                          </div>
                        </div>
                        {note.status !== "CLOSED" && (
                          <Button variant="ghost" size="sm" onClick={() => void closeGaNote(note.id)}>
                            Close
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
