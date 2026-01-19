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
import type { ChecklistItem, Department, GaNote, Meeting, Project, ProjectPrompt, Task, TaskFinishPeriod, User } from "@/lib/types"

const GENERAL_PHASES = ["MEETINGS", "PLANNING", "DEVELOPMENT", "TESTING", "DOCUMENTATION"] as const
const MST_PHASES = ["PLANNING", "PRODUCT", "CONTROL", "FINAL"] as const

const PHASE_LABELS: Record<string, string> = {
  MEETINGS: "Meetings",
  PLANNING: "Planning",
  DEVELOPMENT: "Development",
  TESTING: "Testing",
  DOCUMENTATION: "Documentation",
  PRODUCT: "Product",
  CONTROL: "Control",
  FINAL: "Final",
  CLOSED: "Closed",
}

const TABS = [
  { id: "description", label: "Description" },
  { id: "testing", label: "Testing" },
  { id: "tasks", label: "Tasks" },
  { id: "checklists", label: "Checklists" },
  { id: "mst-acceptance", label: "Project Acceptance" },
  { id: "mst-ga-meeting", label: "GA Meeting" },
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
const FINISH_PERIOD_OPTIONS: TaskFinishPeriod[] = ["AM", "PM"]
const FINISH_PERIOD_NONE_VALUE = "__none__"
const FINISH_PERIOD_NONE_LABEL = "None (all day)"

const MEETING_FOCUS_POINTS = [
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
const TESTING_CHECKLIST_QUESTIONS = [
  "What should we test and why?",
  "Who owns each test area?",
  "What environments or data are required?",
  "How will issues be tracked and fixed?",
  "What is the acceptance checklist to approve?",
]

const MST_PLANNING_ACCEPTANCE_GROUP_KEY = "MST_PLANNING_ACCEPTANCE"
const MST_PLANNING_GA_MEETING_GROUP_KEY = "MST_PLANNING_GA_MEETING"

function initials(src: string) {
  return src
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

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

function isOverdue(task: Task) {
  if (!task.due_date || task.status === "DONE") return false
  const due = new Date(task.due_date)
  if (Number.isNaN(due.getTime())) return false
  due.setHours(23, 59, 59, 999)
  return Date.now() > due.getTime()
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

async function initializeMeetingFocusItems(
  projectId: string,
  existingItems: ChecklistItem[],
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>
) {
  const existingComments = new Set(
    existingItems
      .filter((item) => item.path === "MEETING_FOCUS" && item.item_type === "COMMENT")
      .map((item) => (item.comment || "").trim().toLowerCase())
      .filter(Boolean)
  )
  const missing = MEETING_FOCUS_POINTS.filter(
    (text) => !existingComments.has(text.trim().toLowerCase())
  )
  if (!missing.length) return
  for (const text of missing) {
    const position = MEETING_FOCUS_POINTS.indexOf(text)
    const res = await apiFetch("/checklist-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        item_type: "COMMENT",
        path: "MEETING_FOCUS",
        comment: text,
        position: position >= 0 ? position + 1 : null,
      }),
    })
    if (!res.ok) {
      console.error("Failed to create meeting focus item", text)
    }
  }
}

async function initializeDocumentationChecklistItems(
  projectId: string,
  existingItems: ChecklistItem[],
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>
) {
  const existingTitles = new Set(
    existingItems
      .filter((item) => item.path === "DOCUMENTATION" && item.item_type === "CHECKBOX")
      .map((item) => (item.title || "").trim().toLowerCase())
      .filter(Boolean)
  )
  const missing = DOCUMENTATION_CHECKLIST_QUESTIONS.filter(
    (title) => !existingTitles.has(title.trim().toLowerCase())
  )
  if (!missing.length) return
  for (const title of missing) {
    const position = DOCUMENTATION_CHECKLIST_QUESTIONS.indexOf(title)
    const res = await apiFetch("/checklist-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        item_type: "CHECKBOX",
        path: "DOCUMENTATION",
        title,
        is_checked: false,
        position: position >= 0 ? position + 1 : null,
      }),
    })
    if (!res.ok) {
      console.error("Failed to create documentation checklist item", title)
    }
  }
}

async function initializeTestingChecklistItems(
  projectId: string,
  existingItems: ChecklistItem[],
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>
) {
  const existingTitles = new Set(
    existingItems
      .filter((item) => item.path === "TESTING" && item.item_type === "CHECKBOX")
      .map((item) => (item.title || "").trim().toLowerCase())
      .filter(Boolean)
  )
  const missing = TESTING_CHECKLIST_QUESTIONS.filter(
    (title) => !existingTitles.has(title.trim().toLowerCase())
  )
  if (!missing.length) return
  for (const title of missing) {
    const position = TESTING_CHECKLIST_QUESTIONS.indexOf(title)
    const res = await apiFetch("/checklist-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        item_type: "CHECKBOX",
        path: "TESTING",
        title,
        is_checked: false,
        position: position >= 0 ? position + 1 : null,
      }),
    })
    if (!res.ok) {
      console.error("Failed to create testing checklist item", title)
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
  const [projectDepartmentName, setProjectDepartmentName] = React.useState<string | null>(null)
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
  const [newFinishPeriod, setNewFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(
    FINISH_PERIOD_NONE_VALUE
  )
  const [creating, setCreating] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null)
  const [editTitle, setEditTitle] = React.useState("")
  const [editDescription, setEditDescription] = React.useState("")
  const [editStatus, setEditStatus] = React.useState<(typeof TASK_STATUSES)[number]>("TODO")
  const [editPriority, setEditPriority] = React.useState<(typeof TASK_PRIORITIES)[number]>("NORMAL")
  const [editAssignedTo, setEditAssignedTo] = React.useState<string>("__unassigned__")
  const [editPhase, setEditPhase] = React.useState<string>("")
  const [editDueDate, setEditDueDate] = React.useState("")
  const [editFinishPeriod, setEditFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(
    FINISH_PERIOD_NONE_VALUE
  )
  const [savingEdit, setSavingEdit] = React.useState(false)
  const [updatingTaskId, setUpdatingTaskId] = React.useState<string | null>(null)
  const [deletingTaskId, setDeletingTaskId] = React.useState<string | null>(null)
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
  const [meetingChecklistNewNumber, setMeetingChecklistNewNumber] = React.useState("")
  const [newMeetingItemContent, setNewMeetingItemContent] = React.useState("")
  const [newMeetingItemAnswer, setNewMeetingItemAnswer] = React.useState("")
  const [addingMeetingItem, setAddingMeetingItem] = React.useState(false)
  const [editingMeetingItemId, setEditingMeetingItemId] = React.useState<string | null>(null)
  const [editingMeetingItemContent, setEditingMeetingItemContent] = React.useState("")
  const [editingMeetingItemAnswer, setEditingMeetingItemAnswer] = React.useState("")
  const [editingMeetingItemNumber, setEditingMeetingItemNumber] = React.useState("")
  const [meetingFocusItems, setMeetingFocusItems] = React.useState<
    { id: string; text: string; position: number }[]
  >([])
  const [newMeetingFocusText, setNewMeetingFocusText] = React.useState("")
  const [meetingFocusNewNumber, setMeetingFocusNewNumber] = React.useState("")
  const [meetingFocusEditingId, setMeetingFocusEditingId] = React.useState<string | null>(null)
  const [meetingFocusEditingText, setMeetingFocusEditingText] = React.useState("")
  const [meetingFocusEditingNumber, setMeetingFocusEditingNumber] = React.useState("")
  const [savingMeetingFocusItem, setSavingMeetingFocusItem] = React.useState(false)
  const [mstAcceptanceChecklist, setMstAcceptanceChecklist] = React.useState<ChecklistItem[]>([])
  const [mstGaMeetingChecklist, setMstGaMeetingChecklist] = React.useState<ChecklistItem[]>([])
  const [mstAcceptanceNewText, setMstAcceptanceNewText] = React.useState("")
  const [mstAcceptanceNewNumber, setMstAcceptanceNewNumber] = React.useState("")
  const [mstAcceptanceEditingId, setMstAcceptanceEditingId] = React.useState<string | null>(null)
  const [mstAcceptanceEditingText, setMstAcceptanceEditingText] = React.useState("")
  const [mstAcceptanceSaving, setMstAcceptanceSaving] = React.useState(false)
  const [mstGaMeetingNewText, setMstGaMeetingNewText] = React.useState("")
  const [mstGaMeetingNewNumber, setMstGaMeetingNewNumber] = React.useState("")
  const [mstGaMeetingEditingId, setMstGaMeetingEditingId] = React.useState<string | null>(null)
  const [mstGaMeetingEditingText, setMstGaMeetingEditingText] = React.useState("")
  const [mstGaMeetingSaving, setMstGaMeetingSaving] = React.useState(false)
  const [mstAcceptanceCommentEditingId, setMstAcceptanceCommentEditingId] = React.useState<string | null>(null)
  const [mstAcceptanceCommentText, setMstAcceptanceCommentText] = React.useState("")
  const [mstGaMeetingCommentEditingId, setMstGaMeetingCommentEditingId] = React.useState<string | null>(null)
  const [mstGaMeetingCommentText, setMstGaMeetingCommentText] = React.useState("")
  const [testingChecklist, setTestingChecklist] = React.useState<
    { id: string; question: string; isChecked: boolean; position?: number }[]
  >([])
  const [testingEditingId, setTestingEditingId] = React.useState<string | null>(null)
  const [testingEditingText, setTestingEditingText] = React.useState("")
  const [testingEditingNumber, setTestingEditingNumber] = React.useState("")
  const [newTestingNumber, setNewTestingNumber] = React.useState("")
  const [newTestingText, setNewTestingText] = React.useState("")
  const [savingTestingItem, setSavingTestingItem] = React.useState(false)
  const [documentationChecklist, setDocumentationChecklist] = React.useState<
    { id: string; question: string; isChecked: boolean; position?: number }[]
  >(
    DOCUMENTATION_CHECKLIST_QUESTIONS.map((question, index) => ({
      id: `doc-${index}`,
      question,
      isChecked: false,
      position: index + 1,
    }))
  )
  const [documentationEditingId, setDocumentationEditingId] = React.useState<string | null>(null)
  const [documentationEditingText, setDocumentationEditingText] = React.useState("")
  const [documentationEditingNumber, setDocumentationEditingNumber] = React.useState("")
  const [newDocumentationNumber, setNewDocumentationNumber] = React.useState("")
  const [newDocumentationText, setNewDocumentationText] = React.useState("")
  const [savingDocumentationItem, setSavingDocumentationItem] = React.useState(false)
  const [documentationFilePath, setDocumentationFilePath] = React.useState("")
  const [documentationFilePaths, setDocumentationFilePaths] = React.useState<
    { id: string; path: string }[]
  >([])
  const [documentationFilePathEditingId, setDocumentationFilePathEditingId] = React.useState<
    string | null
  >(null)
  const [documentationFilePathEditingText, setDocumentationFilePathEditingText] = React.useState("")
  const [documentationFilePathSaving, setDocumentationFilePathSaving] = React.useState(false)
  const [gaPromptContent, setGaPromptContent] = React.useState("")
  const [devPromptContent, setDevPromptContent] = React.useState("")
  const [savingGaPrompt, setSavingGaPrompt] = React.useState(false)
  const [savingDevPrompt, setSavingDevPrompt] = React.useState(false)
  const [editProjectDueDateOpen, setEditProjectDueDateOpen] = React.useState(false)
  const [editProjectDueDate, setEditProjectDueDate] = React.useState("")
  const [savingProjectDueDate, setSavingProjectDueDate] = React.useState(false)

  // Sync the edit date when dialog opens or project changes
  React.useEffect(() => {
    if (editProjectDueDateOpen && project) {
      setEditProjectDueDate(toDateInput(project.due_date))
    }
  }, [editProjectDueDateOpen, project?.due_date])

  React.useEffect(() => {
    const load = async () => {
      const pRes = await apiFetch(`/projects/${projectId}`)
      if (!pRes.ok) return
      const p = (await pRes.json()) as Project
      setProject(p)
      setEditingDescription(p.description || "")

      const [tRes, mRes, cRes, gRes, prRes, usersRes, meetingsRes, depsRes] = await Promise.all([
        apiFetch(`/tasks?project_id=${p.id}&include_done=true`),
        apiFetch(`/project-members?project_id=${p.id}`),
        apiFetch(`/checklist-items?project_id=${p.id}`),
        apiFetch(`/ga-notes?project_id=${p.id}`),
        apiFetch(`/project-prompts?project_id=${p.id}`),
        apiFetch("/users?include_all_departments=true"),
        apiFetch(`/meetings?project_id=${p.id}`),
        apiFetch("/departments"),
      ])

      if (tRes.ok) setTasks((await tRes.json()) as Task[])
      if (mRes.ok) setMembers((await mRes.json()) as User[])
      if (cRes.ok) {
        const items = (await cRes.json()) as ChecklistItem[]
        setChecklistItems(items)
        try {
          await initializeMeetingChecklistItems(p.id, items, apiFetch)
          await initializeMeetingFocusItems(p.id, items, apiFetch)
          await initializeDocumentationChecklistItems(p.id, items, apiFetch)
          await initializeTestingChecklistItems(p.id, items, apiFetch)
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
      if (depsRes.ok) {
        const deps = (await depsRes.json()) as Department[]
        const dep = deps.find((d) => d.id === p.department_id) || null
        setProjectDepartmentName(dep?.name ?? null)
      }
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
    const seenTitles = new Set<string>()
    const deduped = sorted.filter((item) => {
      const key = (item.title || "").trim().toLowerCase()
      if (!key) return true
      if (seenTitles.has(key)) return false
      seenTitles.add(key)
      return true
    })
    setMeetingChecklist(
      deduped.map((item, index) => ({
        id: item.id,
        content: item.title || "",
        answer: item.comment || "",
        isChecked: Boolean(item.is_checked),
        position: item.position ?? index + 1,
      }))
    )
  }, [checklistItems])

  React.useEffect(() => {
    const focusItems = checklistItems
      .filter((item) => item.path === "MEETING_FOCUS" && item.item_type === "COMMENT")
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    if (!focusItems.length) {
      setMeetingFocusItems([])
      return
    }
    setMeetingFocusItems(
      focusItems.map((item, index) => ({
        id: item.id,
        text: item.comment || "",
        position: item.position ?? index + 1,
      }))
    )
  }, [checklistItems])

  React.useEffect(() => {
    const items = checklistItems
      .filter((item) => item.path === "DOCUMENTATION" && item.item_type === "CHECKBOX")
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    if (!items.length) return
    setDocumentationChecklist(
      items.map((item, index) => ({
        id: item.id,
        question: item.title || "",
        isChecked: Boolean(item.is_checked),
        position: item.position ?? index + 1,
      }))
    )
  }, [checklistItems])

  React.useEffect(() => {
    const filePathItems = checklistItems
      .filter(
        (item) =>
          item.path === "DOCUMENTATION" &&
          item.item_type === "COMMENT" &&
          item.category === "FILE_PATH"
      )
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    setDocumentationFilePaths(
      filePathItems
        .map((item) => ({ id: item.id, path: item.comment || "" }))
        .filter((item) => item.path)
    )
  }, [checklistItems])

  React.useEffect(() => {
    const items = checklistItems
      .filter((item) => item.path === "TESTING" && item.item_type === "CHECKBOX")
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    if (!items.length) return
    setTestingChecklist(
      items.map((item, index) => ({
        id: item.id,
        question: item.title || "",
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
        finish_period: newFinishPeriod === FINISH_PERIOD_NONE_VALUE ? null : newFinishPeriod,
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
      setNewFinishPeriod(FINISH_PERIOD_NONE_VALUE)
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
    payload: Partial<{ title: string; comment: string | null; is_checked: boolean; position: number }>
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

  const toggleMeetingChecklistItem = async (itemId: string, next: boolean) => {
    const previous = meetingChecklist.find((item) => item.id === itemId)?.isChecked ?? false
    const source = checklistItems.find((item) => item.id === itemId)
    const normalizedTitle = (source?.title || "").trim().toLowerCase()
    const targetIds = checklistItems
      .filter(
        (item) =>
          item.item_type === "CHECKBOX" &&
          item.path === "MEETINGS" &&
          (item.title || "").trim().toLowerCase() === normalizedTitle
      )
      .map((item) => item.id)
    const idsToUpdate = targetIds.length ? targetIds : [itemId]
    const previousStates = new Map(
      checklistItems
        .filter((item) => idsToUpdate.includes(item.id))
        .map((item) => [item.id, item.is_checked ?? false])
    )
    setMeetingChecklist((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, isChecked: next } : item))
    )
    setChecklistItems((prev) =>
      prev.map((item) => (idsToUpdate.includes(item.id) ? { ...item, is_checked: next } : item))
    )
    const results = await Promise.all(
      idsToUpdate.map(async (id) => {
        const res = await apiFetch(`/checklist-items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_checked: next }),
        })
        return res.ok
      })
    )
    if (results.some((ok) => !ok)) {
      setMeetingChecklist((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, isChecked: previous } : item))
      )
      setChecklistItems((prev) =>
        prev.map((item) =>
          idsToUpdate.includes(item.id)
            ? { ...item, is_checked: previousStates.get(item.id) ?? false }
            : item
        )
      )
      toast.error("Failed to update meeting checklist")
    }
  }

  const startEditTask = (task: Task) => {
    setEditingTaskId(task.id)
    setEditTitle(task.title || "")
    setEditDescription(task.description || "")
    setEditStatus(task.status || "TODO")
    setEditPriority(task.priority || "NORMAL")
    setEditAssignedTo(task.assigned_to || task.assigned_to_user_id || "__unassigned__")
    setEditPhase(task.phase || activePhase)
    setEditDueDate(toDateInput(task.due_date))
    setEditFinishPeriod(task.finish_period || FINISH_PERIOD_NONE_VALUE)
    setEditOpen(true)
  }

  const saveEditTask = async () => {
    if (!editingTaskId || !editTitle.trim()) return
    setSavingEdit(true)
    try {
      const payload = {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        status: editStatus,
        priority: editPriority,
        assigned_to: editAssignedTo === "__unassigned__" ? null : editAssignedTo,
        phase: editPhase || activePhase,
        due_date: editDueDate || null,
        finish_period: editFinishPeriod === FINISH_PERIOD_NONE_VALUE ? null : editFinishPeriod,
      }
      const res = await apiFetch(`/tasks/${editingTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail = "Failed to update task"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(formatErrorDetail(detail))
        return
      }
      const updated = (await res.json()) as Task
      setTasks((prev) => prev.map((task) => (task.id === updated.id ? updated : task)))
      setEditOpen(false)
      setEditingTaskId(null)
      toast.success("Task updated")
    } finally {
      setSavingEdit(false)
    }
  }

  const deleteTask = async (taskId: string, taskTitle?: string) => {
    if (!taskId) return
    const confirmed = window.confirm(
      taskTitle
        ? `Are you sure you want to delete the task "${taskTitle}"?\n\nThis action cannot be undone.`
        : "Are you sure you want to delete this task?\n\nThis action cannot be undone."
    )
    if (!confirmed) return
    setDeletingTaskId(taskId)
    try {
      const res = await apiFetch(`/tasks/${taskId}`, { method: "DELETE" })
      if (!res.ok) {
        let detail = "Failed to delete task"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // ignore
        }
        toast.error(formatErrorDetail(detail))
        return
      }
      setTasks((prev) => prev.filter((task) => task.id !== taskId))
      toast.success("Task deleted")
    } finally {
      setDeletingTaskId(null)
    }
  }

  const startEditMeetingChecklistItem = (itemId: string) => {
    const item = meetingChecklist.find((entry) => entry.id === itemId)
    if (!item) return
    setEditingMeetingItemId(itemId)
    setEditingMeetingItemContent(item.content)
    setEditingMeetingItemAnswer(item.answer)
    setEditingMeetingItemNumber(item.position ? String(item.position) : "")
  }

  const cancelEditMeetingChecklistItem = () => {
    setEditingMeetingItemId(null)
    setEditingMeetingItemContent("")
    setEditingMeetingItemAnswer("")
    setEditingMeetingItemNumber("")
  }

  const startEditMeetingFocusItem = (itemId: string) => {
    const item = meetingFocusItems.find((entry) => entry.id === itemId)
    if (!item) return
    setMeetingFocusEditingId(itemId)
    setMeetingFocusEditingText(item.text)
    setMeetingFocusEditingNumber(item.position ? String(item.position) : "")
  }

  const cancelEditMeetingFocusItem = () => {
    setMeetingFocusEditingId(null)
    setMeetingFocusEditingText("")
    setMeetingFocusEditingNumber("")
  }

  const reloadChecklistItems = React.useCallback(async () => {
    const res = await apiFetch(`/checklist-items?project_id=${projectId}`)
    if (!res.ok) return false
    const items = (await res.json()) as ChecklistItem[]
    setChecklistItems(items)
    return true
  }, [apiFetch, projectId])

  const saveMeetingFocusItem = async () => {
    if (!meetingFocusEditingId) return
    const text = meetingFocusEditingText.trim()
    if (!text) return
    const rawNumber = meetingFocusEditingNumber.trim()
    let position: number | undefined
    if (rawNumber) {
      const parsed = Number.parseInt(rawNumber, 10)
      if (Number.isNaN(parsed) || parsed < 1) {
        toast.error("Invalid order number")
        return
      }
      position = parsed
    }
    setSavingMeetingFocusItem(true)
    try {
      const res = await apiFetch(`/checklist-items/${meetingFocusEditingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: text, position }),
      })
      if (!res.ok) {
        toast.error("Failed to update meeting focus item")
        return
      }
      const updated = (await res.json()) as ChecklistItem
      const refreshed = await reloadChecklistItems()
      if (!refreshed) {
        setChecklistItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      }
      cancelEditMeetingFocusItem()
    } finally {
      setSavingMeetingFocusItem(false)
    }
  }

  const deleteMeetingFocusItem = async (itemId: string) => {
    const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Failed to delete meeting focus item")
      return
    }
    const refreshed = await reloadChecklistItems()
    if (!refreshed) {
      setChecklistItems((prev) => prev.filter((item) => item.id !== itemId))
    }
    toast.success("Meeting focus item deleted")
  }

  const addMeetingFocusItem = async () => {
    if (!project) return
    const text = newMeetingFocusText.trim()
    if (!text) return
    const rawNumber = meetingFocusNewNumber.trim()
    let position = meetingFocusItems.reduce((max, item) => Math.max(max, item.position ?? 0), 0) + 1
    if (rawNumber) {
      const parsed = Number.parseInt(rawNumber, 10)
      if (Number.isNaN(parsed) || parsed < 1) {
        toast.error("Invalid order number")
        return
      }
      position = parsed
    }
    setSavingMeetingFocusItem(true)
    try {
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          item_type: "COMMENT",
          path: "MEETING_FOCUS",
          comment: text,
          position,
        }),
      })
      if (!res.ok) {
        toast.error("Failed to add meeting focus item")
        return
      }
      const created = (await res.json()) as ChecklistItem
      const refreshed = await reloadChecklistItems()
      if (!refreshed) {
        setChecklistItems((prev) => [...prev, created])
      }
      setNewMeetingFocusText("")
      setMeetingFocusNewNumber("")
      toast.success("Meeting focus item added")
    } finally {
      setSavingMeetingFocusItem(false)
    }
  }

  const saveMeetingChecklistItem = async () => {
    if (!editingMeetingItemId) return
    const title = editingMeetingItemContent.trim()
    if (!title) return
    const comment = editingMeetingItemAnswer.trim()
    const rawNumber = editingMeetingItemNumber.trim()
    let position: number | undefined
    if (rawNumber) {
      const parsed = Number.parseInt(rawNumber, 10)
      if (Number.isNaN(parsed) || parsed < 1) {
        toast.error("Invalid order number")
        return
      }
      position = parsed
    }
    const saved = await patchMeetingChecklistItem(editingMeetingItemId, {
      title,
      comment: comment || null,
      position,
    })
    if (saved) {
      await reloadChecklistItems()
      cancelEditMeetingChecklistItem()
    }
  }

  const deleteMeetingChecklistItem = async (itemId: string) => {
    const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Failed to delete meeting checklist item")
      return
    }
    const refreshed = await reloadChecklistItems()
    if (!refreshed) {
      setChecklistItems((prev) => prev.filter((entry) => entry.id !== itemId))
    }
    toast.success("Checklist item deleted")
  }

  const addMeetingChecklistItem = async () => {
    if (!project) return
    const title = newMeetingItemContent.trim()
    if (!title) return
    const rawNumber = meetingChecklistNewNumber.trim()
    let nextPosition =
      meetingChecklist.reduce((max, item) => Math.max(max, item.position ?? 0), 0) + 1
    if (rawNumber) {
      const parsed = Number.parseInt(rawNumber, 10)
      if (Number.isNaN(parsed) || parsed < 1) {
        toast.error("Invalid order number")
        return
      }
      nextPosition = parsed
    }
    setAddingMeetingItem(true)
    try {
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
      const refreshed = await reloadChecklistItems()
      if (!refreshed) {
        setChecklistItems((prev) => [...prev, created])
      }
      setNewMeetingItemContent("")
      setNewMeetingItemAnswer("")
      setMeetingChecklistNewNumber("")
      toast.success("Checklist item added")
    } finally {
      setAddingMeetingItem(false)
    }
  }

  const toggleChecklistDbItem = async (item: ChecklistItem, next: boolean) => {
    const res = await apiFetch(`/checklist-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_checked: next }),
    })
    if (!res.ok) {
      toast.error("Failed to update checklist")
      return
    }
    const updated = (await res.json()) as ChecklistItem
    setMstAcceptanceChecklist((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
    setMstGaMeetingChecklist((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
  }

  const toggleTestingChecklistItemDb = async (itemId: string, next: boolean) => {
    const previous = checklistItems.find((item) => item.id === itemId)?.is_checked ?? false
    setChecklistItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, is_checked: next } : item))
    )
    setTestingChecklist((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, isChecked: next } : item))
    )
    const res = await apiFetch(`/checklist-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_checked: next }),
    })
    if (!res.ok) {
      setChecklistItems((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, is_checked: previous } : item))
      )
      setTestingChecklist((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, isChecked: previous } : item))
      )
      toast.error("Failed to update testing checklist")
    }
  }

  const startEditTestingItem = (itemId: string) => {
    const item = testingChecklist.find((entry) => entry.id === itemId)
    if (!item) return
    setTestingEditingId(itemId)
    setTestingEditingText(item.question)
    setTestingEditingNumber(item.position ? String(item.position) : "")
  }

  const cancelEditTestingItem = () => {
    setTestingEditingId(null)
    setTestingEditingText("")
    setTestingEditingNumber("")
  }

  const saveTestingItem = async () => {
    if (!testingEditingId) return
    const text = testingEditingText.trim()
    if (!text) return
    const rawNumber = testingEditingNumber.trim()
    let position: number | undefined
    if (rawNumber) {
      const parsed = Number.parseInt(rawNumber, 10)
      if (Number.isNaN(parsed) || parsed < 1) {
        toast.error("Invalid order number")
        return
      }
      position = parsed
    }
    setSavingTestingItem(true)
    try {
      const res = await apiFetch(`/checklist-items/${testingEditingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: text, position }),
      })
      if (!res.ok) {
        toast.error("Failed to update testing checklist item")
        return
      }
      const updated = (await res.json()) as ChecklistItem
      const refreshed = await reloadChecklistItems()
      if (!refreshed) {
        setChecklistItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      }
      cancelEditTestingItem()
    } finally {
      setSavingTestingItem(false)
    }
  }

  const deleteTestingItem = async (itemId: string) => {
    const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Failed to delete testing checklist item")
      return
    }
    const refreshed = await reloadChecklistItems()
    if (!refreshed) {
      setChecklistItems((prev) => prev.filter((item) => item.id !== itemId))
      setTestingChecklist((prev) => prev.filter((item) => item.id !== itemId))
    }
    toast.success("Testing checklist item deleted")
  }

  const addTestingChecklistItem = async () => {
    if (!project) return
    const text = newTestingText.trim()
    if (!text) return
    setSavingTestingItem(true)
    try {
      const rawNumber = newTestingNumber.trim()
      let position = testingChecklist.reduce((max, item) => Math.max(max, item.position ?? 0), 0) + 1
      if (rawNumber) {
        const parsed = Number.parseInt(rawNumber, 10)
        if (Number.isNaN(parsed) || parsed < 1) {
          toast.error("Invalid order number")
          return
        }
        position = parsed
      }
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          item_type: "CHECKBOX",
          path: "TESTING",
          title: text,
          is_checked: false,
          position,
        }),
      })
      if (!res.ok) {
        toast.error("Failed to add testing checklist item")
        return
      }
      const created = (await res.json()) as ChecklistItem
      const refreshed = await reloadChecklistItems()
      if (!refreshed) {
        setChecklistItems((prev) => [...prev, created])
      }
      setNewTestingText("")
      setNewTestingNumber("")
      toast.success("Testing checklist item added")
    } finally {
      setSavingTestingItem(false)
    }
  }

  const toggleDocumentationChecklistItemDb = async (itemId: string, next: boolean) => {
    const previous = checklistItems.find((item) => item.id === itemId)?.is_checked ?? false
    setChecklistItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, is_checked: next } : item))
    )
    setDocumentationChecklist((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, isChecked: next } : item))
    )
    const res = await apiFetch(`/checklist-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_checked: next }),
    })
    if (!res.ok) {
      setChecklistItems((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, is_checked: previous } : item))
      )
      setDocumentationChecklist((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, isChecked: previous } : item))
      )
      toast.error("Failed to update documentation checklist")
    }
  }

  const startEditDocumentationItem = (itemId: string) => {
    const item = documentationChecklist.find((entry) => entry.id === itemId)
    if (!item) return
    setDocumentationEditingId(itemId)
    setDocumentationEditingText(item.question)
    setDocumentationEditingNumber(item.position ? String(item.position) : "")
  }

  const cancelEditDocumentationItem = () => {
    setDocumentationEditingId(null)
    setDocumentationEditingText("")
    setDocumentationEditingNumber("")
  }

  const saveDocumentationItem = async () => {
    if (!documentationEditingId) return
    const text = documentationEditingText.trim()
    if (!text) return
    const rawNumber = documentationEditingNumber.trim()
    let position: number | undefined
    if (rawNumber) {
      const parsed = Number.parseInt(rawNumber, 10)
      if (Number.isNaN(parsed) || parsed < 1) {
        toast.error("Invalid order number")
        return
      }
      position = parsed
    }
    setSavingDocumentationItem(true)
    try {
      const res = await apiFetch(`/checklist-items/${documentationEditingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: text, position }),
      })
      if (!res.ok) {
        toast.error("Failed to update documentation checklist item")
        return
      }
      const updated = (await res.json()) as ChecklistItem
      const refreshed = await reloadChecklistItems()
      if (!refreshed) {
        setChecklistItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      }
      cancelEditDocumentationItem()
    } finally {
      setSavingDocumentationItem(false)
    }
  }

  const deleteDocumentationItem = async (itemId: string) => {
    const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Failed to delete documentation checklist item")
      return
    }
    const refreshed = await reloadChecklistItems()
    if (!refreshed) {
      setChecklistItems((prev) => prev.filter((item) => item.id !== itemId))
      setDocumentationChecklist((prev) => prev.filter((item) => item.id !== itemId))
    }
    toast.success("Documentation checklist item deleted")
  }

  const addDocumentationChecklistItem = async () => {
    if (!project) return
    const text = newDocumentationText.trim()
    if (!text) return
    setSavingDocumentationItem(true)
    try {
      const rawNumber = newDocumentationNumber.trim()
      let position =
        documentationChecklist.reduce((max, item) => Math.max(max, item.position ?? 0), 0) + 1
      if (rawNumber) {
        const parsed = Number.parseInt(rawNumber, 10)
        if (Number.isNaN(parsed) || parsed < 1) {
          toast.error("Invalid order number")
          return
        }
        position = parsed
      }
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          item_type: "CHECKBOX",
          path: "DOCUMENTATION",
          title: text,
          is_checked: false,
          position,
        }),
      })
      if (!res.ok) {
        toast.error("Failed to add documentation checklist item")
        return
      }
      const created = (await res.json()) as ChecklistItem
      const refreshed = await reloadChecklistItems()
      if (!refreshed) {
        setChecklistItems((prev) => [...prev, created])
      }
      setNewDocumentationText("")
      setNewDocumentationNumber("")
      toast.success("Documentation checklist item added")
    } finally {
      setSavingDocumentationItem(false)
    }
  }

  const addDocumentationFilePath = async () => {
    if (!project) return
    const value = documentationFilePath.trim()
    if (!value) return
    try {
      const existingFilePaths = checklistItems.filter(
        (item) =>
          item.path === "DOCUMENTATION" &&
          item.item_type === "COMMENT" &&
          item.category === "FILE_PATH"
      )
      const position =
        existingFilePaths.length > 0
          ? Math.max(...existingFilePaths.map((item) => item.position ?? 0)) + 1
          : 1
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          item_type: "COMMENT",
          path: "DOCUMENTATION",
          category: "FILE_PATH",
          comment: value,
          position,
        }),
      })
      if (!res.ok) {
        toast.error("Failed to add file path")
        return
      }
      const created = (await res.json()) as ChecklistItem
      setChecklistItems((prev) => [...prev, created])
      setDocumentationFilePath("")
      toast.success("File path added")
    } catch (error) {
      console.error("Failed to add file path:", error)
      toast.error("Failed to add file path")
    }
  }

  const startEditDocumentationFilePath = (itemId: string) => {
    const item = documentationFilePaths.find((entry) => entry.id === itemId)
    if (!item) return
    setDocumentationFilePathEditingId(itemId)
    setDocumentationFilePathEditingText(item.path)
  }

  const cancelEditDocumentationFilePath = () => {
    setDocumentationFilePathEditingId(null)
    setDocumentationFilePathEditingText("")
  }

  const saveDocumentationFilePath = async () => {
    if (!documentationFilePathEditingId) return
    const value = documentationFilePathEditingText.trim()
    if (!value) return
    setDocumentationFilePathSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${documentationFilePathEditingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: value }),
      })
      if (!res.ok) {
        toast.error("Failed to update file path")
        return
      }
      const updated = (await res.json()) as ChecklistItem
      setChecklistItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      cancelEditDocumentationFilePath()
      toast.success("File path updated")
    } finally {
      setDocumentationFilePathSaving(false)
    }
  }

  const deleteDocumentationFilePath = async (itemId: string) => {
    if (documentationFilePathEditingId === itemId) {
      cancelEditDocumentationFilePath()
    }
    try {
      const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Failed to delete file path")
        return
      }
      setChecklistItems((prev) => prev.filter((item) => item.id !== itemId))
      toast.success("File path deleted")
    } catch (error) {
      console.error("Failed to delete file path:", error)
      toast.error("Failed to delete file path")
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

  const advancePhase = async () => {
    if (!project) return
    const currentPhase = project.current_phase || "MEETINGS"
    const isMeetingPhase = currentPhase === "MEETINGS"
    const projectTitle = (project.title || project.name || "").toUpperCase()
    const isMst = project.project_type === "MST" || projectTitle.includes("MST")
    const openTasks = tasks.filter(
      (task) =>
        task.status !== "DONE" &&
        task.status !== "DONE" &&
        (task.phase || currentPhase) === currentPhase
    )
    const phaseChecklistItems = checklistItems.filter(
      (item) =>
        item.item_type === "CHECKBOX" &&
        (item.path || "").toUpperCase() === currentPhase &&
        !item.is_checked
    )
    const uncheckedItems =
      isMeetingPhase || (isMst && currentPhase === "PLANNING") ? [] : phaseChecklistItems
    const uncheckedMeeting = isMeetingPhase ? meetingChecklist.filter((item) => !item.isChecked) : []
    const uncheckedMstPlanning =
      isMst && currentPhase === "PLANNING"
        ? [
            ...mstAcceptanceChecklist.filter((item) => item.item_type === "CHECKBOX" && !item.is_checked),
            ...mstGaMeetingChecklist.filter((item) => item.item_type === "CHECKBOX" && !item.is_checked),
          ]
        : []

    if (openTasks.length || uncheckedItems.length || uncheckedMeeting.length || uncheckedMstPlanning.length) {
      const blockers: string[] = []
      if (openTasks.length) blockers.push(`${openTasks.length} detyra te hapura`)
      if (uncheckedItems.length) blockers.push(`${uncheckedItems.length} checklist te pa kryera`)
      if (uncheckedMeeting.length) blockers.push(`${uncheckedMeeting.length} checklist te takimeve te pa kryera`)
      if (uncheckedMstPlanning.length) blockers.push(`${uncheckedMstPlanning.length} checklist te planifikimit te pa kryera`)
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
  const titleUpper = (project?.title || project?.name || "").toUpperCase()
  const isMstProject = project?.project_type === "MST" || titleUpper.includes("MST")
  const isDevelopmentProject = (projectDepartmentName || "").toLowerCase() === "development"
  const visibleTabs = React.useMemo(() => {
    if (phaseValue === "MEETINGS") {
      return [
        ...MEETING_TABS.filter((tab) => tab.id === "meeting-focus"),
        ...TABS.filter((tab) => tab.id === "description"),
        ...MEETING_TABS.filter((tab) => tab.id === "meeting-checklist"),
        ...TABS.filter((tab) => tab.id === "members"),
        ...TABS.filter((tab) => tab.id === "ga"),
      ]
    }
    if (phaseValue === "PLANIFIKIMI" || phaseValue === "PLANNING") {
      if (isMstProject) {
        return TABS.filter((tab) =>
          tab.id === "description" ||
          tab.id === "tasks" ||
          tab.id === "mst-acceptance" ||
          tab.id === "mst-ga-meeting" ||
          tab.id === "members" ||
          tab.id === "checklists" ||
          tab.id === "ga"
        )
      }
      return TABS.filter(
        (tab) =>
          tab.id !== "checklists" &&
          tab.id !== "members" &&
          tab.id !== "prompts" &&
          tab.id !== "testing" &&
          tab.id !== "mst-acceptance" &&
          tab.id !== "mst-ga-meeting"
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
      return TABS.filter((tab) => {
        if (
          tab.id === "description" ||
          tab.id === "tasks" ||
          tab.id === "members" ||
          tab.id === "prompts"
        ) {
          return false
        }
        if (
          isDevelopmentProject &&
          (tab.id === "testing" || tab.id === "mst-acceptance" || tab.id === "mst-ga-meeting")
        ) {
          return false
        }
        return true
      })
    }
    const baseTabs = TABS.filter((tab) => tab.id !== "testing")
    if (isMstProject) {
      // Outside PLANNING, hide the MST-only checklist tabs.
      return baseTabs.filter((tab) => tab.id !== "mst-acceptance" && tab.id !== "mst-ga-meeting")
    }
    return baseTabs
  }, [phaseValue, isDevelopmentProject])

  React.useEffect(() => {
    if (!visibleTabs.length) return
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0].id)
    }
  }, [activeTab, visibleTabs])

  React.useEffect(() => {
    if (!project) return
    if (!isMstProject) return
    if (phaseValue !== "PLANNING" && phaseValue !== "PLANIFIKIMI") return
    const loadMstChecklists = async () => {
      const [accRes, gaRes] = await Promise.all([
        apiFetch(`/checklists?project_id=${project.id}&group_key=${MST_PLANNING_ACCEPTANCE_GROUP_KEY}&include_items=true`),
        apiFetch(`/checklists?project_id=${project.id}&group_key=${MST_PLANNING_GA_MEETING_GROUP_KEY}&include_items=true`),
      ])
      if (accRes.ok) {
        const data = (await accRes.json()) as { items?: ChecklistItem[] }[]
        setMstAcceptanceChecklist(data?.[0]?.items || [])
      }
      if (gaRes.ok) {
        const data = (await gaRes.json()) as { items?: ChecklistItem[] }[]
        setMstGaMeetingChecklist(data?.[0]?.items || [])
      }
    }
    void loadMstChecklists()
  }, [apiFetch, project, isMstProject, phaseValue])

  const reloadMstPlanningChecklists = React.useCallback(async () => {
    if (!project) return
    const [accRes, gaRes] = await Promise.all([
      apiFetch(`/checklists?project_id=${project.id}&group_key=${MST_PLANNING_ACCEPTANCE_GROUP_KEY}&include_items=true`),
      apiFetch(`/checklists?project_id=${project.id}&group_key=${MST_PLANNING_GA_MEETING_GROUP_KEY}&include_items=true`),
    ])
    if (accRes.ok) {
      const data = (await accRes.json()) as { items?: ChecklistItem[] }[]
      setMstAcceptanceChecklist(data?.[0]?.items || [])
    }
    if (gaRes.ok) {
      const data = (await gaRes.json()) as { items?: ChecklistItem[] }[]
      setMstGaMeetingChecklist(data?.[0]?.items || [])
    }
  }, [apiFetch, project])

  const isAdmin = user?.role === "ADMIN"

  const addMstAcceptanceItem = async () => {
    if (!project) return
    const text = mstAcceptanceNewText.trim()
    if (!text) return
    const rawNumber = mstAcceptanceNewNumber.trim()
    const position =
      rawNumber ? Math.max(0, Number.parseInt(rawNumber, 10) - 1) : undefined
    setMstAcceptanceSaving(true)
    try {
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          group_key: MST_PLANNING_ACCEPTANCE_GROUP_KEY,
          checklist_title: "Project Acceptance",
          item_type: "CHECKBOX",
          title: text,
          position,
        }),
      })
      if (!res.ok) {
        toast.error("Failed to add item")
        return
      }
      setMstAcceptanceNewText("")
      setMstAcceptanceNewNumber("")
      await reloadMstPlanningChecklists()
    } finally {
      setMstAcceptanceSaving(false)
    }
  }

  const startEditMstAcceptanceItem = (item: ChecklistItem) => {
    setMstAcceptanceEditingId(item.id)
    setMstAcceptanceEditingText(item.title || "")
  }

  const saveEditMstAcceptanceItem = async () => {
    if (!mstAcceptanceEditingId) return
    const text = mstAcceptanceEditingText.trim()
    if (!text) return
    setMstAcceptanceSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${mstAcceptanceEditingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: text }),
      })
      if (!res.ok) {
        toast.error("Failed to update item")
        return
      }
      setMstAcceptanceEditingId(null)
      setMstAcceptanceEditingText("")
      await reloadMstPlanningChecklists()
    } finally {
      setMstAcceptanceSaving(false)
    }
  }

  const deleteMstAcceptanceItem = async (itemId: string) => {
    setMstAcceptanceSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Failed to delete item")
        return
      }
      await reloadMstPlanningChecklists()
    } finally {
      setMstAcceptanceSaving(false)
    }
  }

  const addMstGaMeetingItem = async () => {
    if (!project || !mstGaMeetingNewText.trim()) return
    const text = mstGaMeetingNewText.trim()
    const position = mstGaMeetingNewNumber.trim() ? parseInt(mstGaMeetingNewNumber.trim(), 10) - 1 : mstGaMeetingChecklist.length
    if (isNaN(position) || position < 0) {
      toast.error("Invalid position number")
      return
    }
    setMstGaMeetingSaving(true)
    try {
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          group_key: MST_PLANNING_GA_MEETING_GROUP_KEY,
          checklist_title: "GA Meeting",
          item_type: "CHECKBOX",
          title: text,
          position,
        }),
      })
      if (!res.ok) {
        toast.error("Failed to add item")
        return
      }
      setMstGaMeetingNewText("")
      setMstGaMeetingNewNumber("")
      await reloadMstPlanningChecklists()
    } finally {
      setMstGaMeetingSaving(false)
    }
  }

  const startEditMstGaMeetingItem = (item: ChecklistItem) => {
    setMstGaMeetingEditingId(item.id)
    setMstGaMeetingEditingText(item.title || "")
  }

  const saveEditMstGaMeetingItem = async () => {
    if (!mstGaMeetingEditingId) return
    const text = mstGaMeetingEditingText.trim()
    if (!text) return
    setMstGaMeetingSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${mstGaMeetingEditingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: text }),
      })
      if (!res.ok) {
        toast.error("Failed to update item")
        return
      }
      setMstGaMeetingEditingId(null)
      setMstGaMeetingEditingText("")
      await reloadMstPlanningChecklists()
    } finally {
      setMstGaMeetingSaving(false)
    }
  }

  const deleteMstGaMeetingItem = async (itemId: string) => {
    setMstGaMeetingSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Failed to delete item")
        return
      }
      await reloadMstPlanningChecklists()
    } finally {
      setMstGaMeetingSaving(false)
    }
  }

  const startEditMstAcceptanceComment = (item: ChecklistItem) => {
    setMstAcceptanceCommentEditingId(item.id)
    setMstAcceptanceCommentText(item.comment || "")
  }

  const saveMstAcceptanceComment = async (itemId: string) => {
    setMstAcceptanceSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: mstAcceptanceCommentText.trim() || null }),
      })
      if (!res.ok) {
        toast.error("Failed to save comment")
        return
      }
      setMstAcceptanceCommentEditingId(null)
      setMstAcceptanceCommentText("")
      await reloadMstPlanningChecklists()
    } finally {
      setMstAcceptanceSaving(false)
    }
  }

  const startEditMstGaMeetingComment = (item: ChecklistItem) => {
    setMstGaMeetingCommentEditingId(item.id)
    setMstGaMeetingCommentText(item.comment || "")
  }

  const saveMstGaMeetingComment = async (itemId: string) => {
    setMstGaMeetingSaving(true)
    try {
      const res = await apiFetch(`/checklist-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: mstGaMeetingCommentText.trim() || null }),
      })
      if (!res.ok) {
        toast.error("Failed to save comment")
        return
      }
      setMstGaMeetingCommentEditingId(null)
      setMstGaMeetingCommentText("")
      await reloadMstPlanningChecklists()
    } finally {
      setMstGaMeetingSaving(false)
    }
  }

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

  const baseTitle = project.title || project.name || "Project"
  const title = project.project_type === "MST" && project.total_products != null && project.total_products > 0
    ? `${baseTitle} - ${project.total_products}`
    : baseTitle
  const phase = project.current_phase || "MEETINGS"

  const phaseSteps: string[] = isDevelopmentProject
    ? isMstProject
      ? [...MST_PHASES]
      : [...GENERAL_PHASES]
    : isMstProject
      ? [...MST_PHASES, "CLOSED"]
      : [...GENERAL_PHASES, "CLOSED"]
  const phaseIndex = phaseSteps.indexOf(phase)
  const canClosePhase = phase !== "CLOSED"
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
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur print:static pt-6 pb-4 border-b border-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.back()}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              &larr; Back to Projects
            </button>
            <div className="mt-3 flex items-center gap-3">
              <div className="text-3xl font-semibold">{title}</div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const currentDueDate = project.due_date ? toDateInput(project.due_date) : ""
                    console.log("Edit due date clicked", { project: project?.id, due_date: project?.due_date, formatted: currentDueDate })
                    setEditProjectDueDate(currentDueDate)
                    setEditProjectDueDateOpen(true)
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Edit project due date"
                >
                  {project.due_date ? `Due: ${formatDateDisplay(project.due_date)}` : "Set due date"}
                </button>
              )}
              {!isAdmin && project.due_date && (
                <span className="text-sm text-muted-foreground">Due: {formatDateDisplay(project.due_date)}</span>
              )}
            </div>
            <div className="mt-3">
              <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
                {PHASE_LABELS[phase] || "Meetings"}
              </Badge>
            </div>
            <div className="mt-3 text-sm text-muted-foreground">
              {phaseSteps.map((p, idx) => {
                const isViewed = p === activePhase
                const isCurrent = p === phase
                const isLocked = phaseIndex !== -1 && idx > phaseIndex
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
                      {PHASE_LABELS[p] || p}
                    </button>
                    {idx < phaseSteps.length - 1 ? " -> " : ""}
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

        <div className="flex justify-end mt-4">
          <Button
            variant="outline"
            disabled={!canClosePhase || advancingPhase}
            onClick={() => void advancePhase()}
          >
            {advancingPhase ? "Closing..." : "Close Phase"}
          </Button>
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap gap-6">
            {visibleTabs.map((tab) => {
              const isActive = tab.id === activeTab
              const label = activePhase === "TESTING" && tab.id === "description" ? "Testing" : tab.label
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
      </div>

      {activeTab === "meeting-focus" ? (
        <Card className="p-6">
          <div className="text-lg font-semibold text-slate-900">Meeting focus</div>
          <div className="mt-2 text-sm text-slate-700">Main points to discuss in the meeting.</div>
          <div className="mt-4 space-y-3">
            {meetingFocusItems.length ? (
              meetingFocusItems.map((item, index) => {
                const isEditing = meetingFocusEditingId === item.id
                const displayNumber = item.position > 0 ? item.position : index + 1
                return (
                  <div key={item.id} className="flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3">
                    <div className="mt-0.5 w-16 shrink-0 text-right text-sm text-muted-foreground">
                      {isEditing ? (
                        <Input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={meetingFocusEditingNumber}
                          onChange={(e) => setMeetingFocusEditingNumber(e.target.value)}
                          className="h-8 w-16 text-right"
                        />
                      ) : (
                        `${displayNumber}.`
                      )}
                    </div>
                    <div className="flex-1">
                      {isEditing ? (
                        <Input
                          value={meetingFocusEditingText}
                          onChange={(e) => setMeetingFocusEditingText(e.target.value)}
                        />
                      ) : (
                        <div className="text-sm font-semibold text-slate-900">{item.text}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void saveMeetingFocusItem()}
                            disabled={savingMeetingFocusItem}
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelEditMeetingFocusItem}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => startEditMeetingFocusItem(item.id)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => void deleteMeetingFocusItem(item.id)}
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
              <div className="text-sm text-muted-foreground">No meeting focus items yet.</div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={meetingFocusNewNumber}
                onChange={(e) => setMeetingFocusNewNumber(e.target.value)}
                placeholder="No."
                className="w-24"
              />
              <Input
                value={newMeetingFocusText}
                onChange={(e) => setNewMeetingFocusText(e.target.value)}
                placeholder="Add meeting focus item..."
                className="flex-1 min-w-[220px]"
              />
              <Button
                variant="outline"
                disabled={!newMeetingFocusText.trim() || savingMeetingFocusItem}
                onClick={() => void addMeetingFocusItem()}
              >
                {savingMeetingFocusItem ? "Saving..." : "Add"}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {activeTab === "meeting-checklist" ? (
        <Card className="p-6">
          <div className="text-lg font-semibold">Meeting checklist</div>
          <div className="mt-4 space-y-3">
            {meetingChecklist.length ? (
              meetingChecklist.map((item, index) => {
                const isEditing = editingMeetingItemId === item.id
                const displayNumber = item.position > 0 ? item.position : index + 1
                return (
                  <div key={item.id} className="flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3">
                    <div className="mt-0.5 w-16 shrink-0 text-right text-sm text-muted-foreground">
                      {isEditing ? (
                        <Input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={editingMeetingItemNumber}
                          onChange={(e) => setEditingMeetingItemNumber(e.target.value)}
                          className="h-8 w-16 text-right"
                        />
                      ) : (
                        `${displayNumber}.`
                      )}
                    </div>
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
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={meetingChecklistNewNumber}
                onChange={(e) => setMeetingChecklistNewNumber(e.target.value)}
                placeholder="No."
                className="w-24"
              />
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
          <div className="mt-4 space-y-3">
            {testingChecklist.length ? (
              testingChecklist.map((item, index) => {
                const isEditing = testingEditingId === item.id
                const displayNumber = item.position > 0 ? item.position : index + 1
                return (
                  <div key={item.id} className="flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3">
                    <div className="mt-0.5 w-16 shrink-0 text-right text-sm text-muted-foreground">
                      {isEditing ? (
                        <Input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={testingEditingNumber}
                          onChange={(e) => setTestingEditingNumber(e.target.value)}
                          className="h-8 w-16 text-right"
                        />
                      ) : (
                        `${displayNumber}.`
                      )}
                    </div>
                    <Checkbox
                      checked={item.isChecked}
                      onCheckedChange={(checked) => toggleTestingChecklistItemDb(item.id, Boolean(checked))}
                    />
                    <div className="flex-1">
                      {isEditing ? (
                        <Input
                          value={testingEditingText}
                          onChange={(e) => setTestingEditingText(e.target.value)}
                        />
                      ) : (
                        <div className={item.isChecked ? "text-muted-foreground line-through" : ""}>
                          {item.question}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void saveTestingItem()}
                            disabled={savingTestingItem}
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelEditTestingItem}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => startEditTestingItem(item.id)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => void deleteTestingItem(item.id)}
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
              <div className="text-sm text-muted-foreground">No testing checklist items yet.</div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                value={newTestingNumber}
                onChange={(e) => setNewTestingNumber(e.target.value)}
                placeholder="No."
                className="w-24"
              />
              <Input
                value={newTestingText}
                onChange={(e) => setNewTestingText(e.target.value)}
                placeholder="Add testing checklist item..."
                className="flex-1 min-w-[220px]"
              />
              <Button
                variant="outline"
                disabled={!newTestingText.trim() || savingTestingItem}
                onClick={() => void addTestingChecklistItem()}
              >
                {savingTestingItem ? "Saving..." : "Add"}
              </Button>
            </div>
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
                          {(isMstProject ? MST_PHASES : GENERAL_PHASES).map((p) => (
                            <SelectItem key={p} value={p}>
                              {PHASE_LABELS[p] || p}
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
                    <div className="space-y-2">
                      <Label>Finish period</Label>
                      <Select
                        value={newFinishPeriod}
                        onValueChange={(value) =>
                          setNewFinishPeriod(value as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="All day" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={FINISH_PERIOD_NONE_VALUE}>{FINISH_PERIOD_NONE_LABEL}</SelectItem>
                          {FINISH_PERIOD_OPTIONS.map((o) => (
                            <SelectItem key={o} value={o}>
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Edit Task</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={editStatus} onValueChange={(v) => setEditStatus(v as Task["status"])}>
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
                      <Select value={editPriority} onValueChange={(v) => setEditPriority(v as Task["priority"])}>
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
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Assign to</Label>
                      <Select value={editAssignedTo} onValueChange={setEditAssignedTo}>
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
                      <Select value={editPhase} onValueChange={setEditPhase}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select phase" />
                        </SelectTrigger>
                        <SelectContent>
                          {(isMstProject ? MST_PHASES : GENERAL_PHASES).map((p) => (
                            <SelectItem key={p} value={p}>
                              {PHASE_LABELS[p] || p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Due date</Label>
                      <Input
                        type="date"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(normalizeDueDateInput(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Finish period</Label>
                      <Select
                        value={editFinishPeriod}
                        onValueChange={(value) =>
                          setEditFinishPeriod(value as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="All day" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={FINISH_PERIOD_NONE_VALUE}>{FINISH_PERIOD_NONE_LABEL}</SelectItem>
                          {FINISH_PERIOD_OPTIONS.map((o) => (
                            <SelectItem key={o} value={o}>
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingEdit}>
                      Cancel
                    </Button>
                    <Button disabled={!editTitle.trim() || savingEdit} onClick={() => void saveEditTask()}>
                      {savingEdit ? "Saving..." : "Save"}
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
                  const overdue = isOverdue(task)
                  const taskPriority = (task.priority as "HIGH" | "NORMAL") || "NORMAL"
                  const isHighPriority = taskPriority === "HIGH"
                  return (
                    <div
                      key={task.id}
                      className="grid grid-cols-5 gap-3 px-6 py-4 text-sm"
                    >
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        <span>{task.title}</span>
                        {isDevelopmentProject && (
                          <Badge
                            variant="secondary"
                            className={`text-xs ${
                              isHighPriority
                                ? "bg-red-100 text-red-700 border-red-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            {taskPriority}
                          </Badge>
                        )}
                      </div>
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
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className={overdue ? "text-red-600 font-semibold" : undefined}>
                          {formatDateDisplay(task.due_date)}
                        </span>
                        {overdue ? (
                          <Badge variant="outline" className="border-red-200 text-red-700 bg-red-50">
                            Late
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => startEditTask(task)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={deletingTaskId === task.id}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => void deleteTask(task.id, task.title)}
                        >
                          {deletingTaskId === task.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
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
          {activePhase === "DOCUMENTATION" ? (
            <Card className="p-6">
              <div className="text-lg font-semibold">Documentation checklist</div>
              <div className="mt-4 space-y-3">
                {documentationChecklist.length ? (
                  documentationChecklist.map((item, index) => {
                    const isEditing = documentationEditingId === item.id
                    const displayNumber = item.position ? item.position : index + 1
                    return (
                      <div key={item.id} className="flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3">
                        <div className="mt-0.5 w-16 shrink-0 text-right text-sm text-muted-foreground">
                          {isEditing ? (
                            <Input
                              type="number"
                              min={1}
                              inputMode="numeric"
                              value={documentationEditingNumber}
                              onChange={(e) => setDocumentationEditingNumber(e.target.value)}
                              className="h-8 w-16 text-right"
                            />
                          ) : (
                            `${displayNumber}.`
                          )}
                        </div>
                        <Checkbox
                          checked={item.isChecked}
                          onCheckedChange={(checked) =>
                            toggleDocumentationChecklistItemDb(item.id, Boolean(checked))
                          }
                        />
                        <div className="flex-1">
                          {isEditing ? (
                            <Input
                              value={documentationEditingText}
                              onChange={(e) => setDocumentationEditingText(e.target.value)}
                            />
                          ) : (
                            <div className={item.isChecked ? "text-muted-foreground line-through" : ""}>
                              {item.question}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void saveDocumentationItem()}
                                disabled={savingDocumentationItem}
                              >
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={cancelEditDocumentationItem}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEditDocumentationItem(item.id)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 border-red-200 hover:bg-red-50"
                                onClick={() => void deleteDocumentationItem(item.id)}
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
                  <div className="text-sm text-muted-foreground">No documentation checklist items yet.</div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={newDocumentationNumber}
                    onChange={(e) => setNewDocumentationNumber(e.target.value)}
                    placeholder="No."
                    className="w-24"
                  />
                  <Input
                    value={newDocumentationText}
                    onChange={(e) => setNewDocumentationText(e.target.value)}
                    placeholder="Add documentation checklist item..."
                    className="flex-1 min-w-[220px]"
                  />
                  <Button
                    variant="outline"
                    disabled={!newDocumentationText.trim() || savingDocumentationItem}
                    onClick={() => void addDocumentationChecklistItem()}
                  >
                    {savingDocumentationItem ? "Saving..." : "Add"}
                  </Button>
                </div>
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
                    {documentationFilePaths.map((item) => {
                      const isEditing = documentationFilePathEditingId === item.id
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                        >
                          {isEditing ? (
                            <>
                              <Input
                                value={documentationFilePathEditingText}
                                onChange={(e) => setDocumentationFilePathEditingText(e.target.value)}
                              />
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    documentationFilePathSaving ||
                                    !documentationFilePathEditingText.trim()
                                  }
                                  onClick={() => void saveDocumentationFilePath()}
                                >
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={cancelEditDocumentationFilePath}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex-1">{item.path}</div>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => startEditDocumentationFilePath(item.id)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 border-red-200 hover:bg-red-50"
                                  onClick={() => void deleteDocumentationFilePath(item.id)}
                                >
                                  Delete
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-muted-foreground">No file paths added.</div>
                )}
              </div>
            </Card>
          ) : (
            <>
              {isMstProject && activePhase === "PLANNING" ? (
                <div className="text-sm text-muted-foreground">
                  Planning checklists are available under <span className="font-medium">Project Acceptance</span> and{" "}
                  <span className="font-medium">GA Meeting</span>.
                </div>
              ) : null}

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

      {activeTab === "mst-acceptance" ? (
        <Card className="p-6">
          <div className="text-lg font-semibold">Project Acceptance</div>
          {isAdmin ? (
            <div className="mt-4 grid gap-2 md:grid-cols-[120px_1fr_auto]">
              <div className="space-y-1">
                <Label>Number</Label>
                <Input
                  value={mstAcceptanceNewNumber}
                  onChange={(e) => setMstAcceptanceNewNumber(e.target.value)}
                  placeholder="e.g. 3"
                />
              </div>
              <div className="space-y-1">
                <Label>Item</Label>
                <Input
                  value={mstAcceptanceNewText}
                  onChange={(e) => setMstAcceptanceNewText(e.target.value)}
                  placeholder="Add new checklist item..."
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  disabled={!mstAcceptanceNewText.trim() || mstAcceptanceSaving}
                  onClick={() => void addMstAcceptanceItem()}
                >
                  {mstAcceptanceSaving ? "Saving..." : "Add"}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="mt-4 space-y-3">
            {mstAcceptanceChecklist.length ? (
              mstAcceptanceChecklist
                .filter((item) => item.item_type === "CHECKBOX")
                .map((item) => (
                  <div key={item.id} className="flex items-start gap-3 rounded-lg border px-4 py-3">
                    <div className="mt-0.5 w-7 shrink-0 text-right text-sm text-muted-foreground">
                      {(item.position ?? 0) + 1}.
                    </div>
                    <Checkbox
                      checked={Boolean(item.is_checked)}
                      onCheckedChange={(checked) => void toggleChecklistDbItem(item, Boolean(checked))}
                    />
                    <div className="flex-1">
                      {isAdmin && mstAcceptanceEditingId === item.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={mstAcceptanceEditingText}
                            onChange={(e) => setMstAcceptanceEditingText(e.target.value)}
                          />
                          <Button
                            variant="outline"
                            disabled={!mstAcceptanceEditingText.trim() || mstAcceptanceSaving}
                            onClick={() => void saveEditMstAcceptanceItem()}
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setMstAcceptanceEditingId(null)
                              setMstAcceptanceEditingText("")
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className={item.is_checked ? "text-muted-foreground line-through" : ""}>{item.title}</div>
                      )}
                    </div>
                    {isAdmin && mstAcceptanceEditingId !== item.id ? (
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={() => startEditMstAcceptanceItem(item)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={mstAcceptanceSaving}
                          onClick={() => void deleteMstAcceptanceItem(item.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
            ) : (
              <div className="text-sm text-muted-foreground">No items yet.</div>
            )}
          </div>
        </Card>
      ) : null}

      {activeTab === "mst-ga-meeting" ? (
        <Card className="p-6">
          <div className="text-lg font-semibold">GA Meeting</div>
          <div className="mt-4 space-y-3">
            {mstGaMeetingChecklist.length ? (
              mstGaMeetingChecklist
                .filter((item) => item.item_type === "CHECKBOX")
                .map((item) => (
                  <div key={item.id} className="flex items-start gap-3 rounded-lg border px-4 py-3">
                    <div className="mt-0.5 w-7 shrink-0 text-right text-sm text-muted-foreground">
                      {(item.position ?? 0) + 1}.
                    </div>
                    <Checkbox
                      checked={Boolean(item.is_checked)}
                      onCheckedChange={(checked) => void toggleChecklistDbItem(item, Boolean(checked))}
                    />
                    <div className="flex-1">
                      {isAdmin && mstGaMeetingEditingId === item.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={mstGaMeetingEditingText}
                            onChange={(e) => setMstGaMeetingEditingText(e.target.value)}
                          />
                          <Button
                            variant="outline"
                            disabled={!mstGaMeetingEditingText.trim() || mstGaMeetingSaving}
                            onClick={() => void saveEditMstGaMeetingItem()}
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setMstGaMeetingEditingId(null)
                              setMstGaMeetingEditingText("")
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className={item.is_checked ? "text-muted-foreground line-through" : ""}>{item.title}</div>
                      )}
                    </div>
                    {isAdmin && mstGaMeetingEditingId !== item.id ? (
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={() => startEditMstGaMeetingItem(item)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={mstGaMeetingSaving}
                          onClick={() => void deleteMstGaMeetingItem(item.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
            ) : (
              <div className="text-sm text-muted-foreground">No items yet.</div>
            )}
          </div>
          {isAdmin ? (
            <div className="mt-4 grid gap-2 md:grid-cols-[120px_1fr_auto]">
              <div className="space-y-1">
                <Label>Number</Label>
                <Input
                  value={mstGaMeetingNewNumber}
                  onChange={(e) => setMstGaMeetingNewNumber(e.target.value)}
                  placeholder="e.g. 3"
                />
              </div>
              <div className="space-y-1">
                <Label>Item</Label>
                <Input
                  value={mstGaMeetingNewText}
                  onChange={(e) => setMstGaMeetingNewText(e.target.value)}
                  placeholder="Add new checklist item..."
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  disabled={!mstGaMeetingNewText.trim() || mstGaMeetingSaving}
                  onClick={() => void addMstGaMeetingItem()}
                >
                  {mstGaMeetingSaving ? "Saving..." : "Add"}
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
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

