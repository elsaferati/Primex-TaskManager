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
import type { ChecklistItem, GaNote, Meeting, Project, ProjectPrompt, Task, TaskPriority, User } from "@/lib/types"

// PCM phases (Albanian labels)
const PHASES = ["INICIMI", "PLANIFIKIMI", "EKZEKUTIMI", "MONITORIMI", "MBYLLJA"] as const
const PHASE_LABELS: Record<string, string> = {
  INICIMI: "Initiation",
  PLANIFIKIMI: "Planning",
  EKZEKUTIMI: "Execution",
  MONITORIMI: "Monitoring",
  MBYLLJA: "Closed",
}

// MST-specific phases (Albanian labels for the requested UI)
const MST_PHASES = ["PLANIFIKIMI", "PRODUKTE", "KONTROLLI", "FINALIZIMI"] as const
const MST_PHASE_LABELS: Record<(typeof MST_PHASES)[number], string> = {
  PLANIFIKIMI: "Planifikimi",
  PRODUKTE: "Produkte",
  KONTROLLI: "Kontrolli",
  FINALIZIMI: "Finalizimi",
}
const VS_VL_PHASES = ["PROJECT_ACCEPTANCE", "AMAZONE", "CONTROL", "DREAMROBOT"] as const
const VS_VL_PHASE_LABELS: Record<(typeof VS_VL_PHASES)[number], string> = {
  PROJECT_ACCEPTANCE: "PLANNING",
  AMAZONE: "AMAZON",
  CONTROL: "CHECK",
  DREAMROBOT: "DREAMROBOT",
}
const VS_VL_ACCEPTANCE_QUESTIONS = [
  "A ESHTE HAPUR GRUPI NE TEAMS?",
  "A JANE VENDOSUR PIKAT NE TRELLO?",
  "A ESHTE HAPUR PROJEKTI NE CHATGPT?",
]
const VS_VL_META_PREFIX = "VS_VL_META:"

const MST_PLANNING_QUESTIONS = [
  "A eshte hapur grupi ne Teams?",
  "A eshte hapur projekti ne chat GPT?",
  "A jane pranuar te gjitha dokumentet e nevojshme (PDF, Stammdaten, Artikelliste)?",
  "A eshte analizuar kategoria dhe PDF?",
  "A jane identifikuar karakteristikat e programit?",
  "A eshte bere plani kur parashihet me u perfundu projekti?",
]

type MstChecklistRow = {
  path: string
  detyrat: string
  keywords: string
  pershkrimi: string
  shembull?: string
  kategoria: string
  incl: string
}
type VsVlTaskMeta = {
  vs_vl_phase?: (typeof VS_VL_PHASES)[number]
  dependency_text?: string
  checklist?: string
  dependency_task_id?: string
  comment?: string
}

const MST_FINAL_CHECKLIST: MstChecklistRow[] = [
  {
    path: "Z:\\\\03_MUS\\\\01_CHECKLISTA",
    detyrat: "Hapja e projektit",
    keywords: "GRUPI",
    pershkrimi:
      "Hapet grupi ne Teams per program, dhe dergohen te gjitha dokumentet duke perfshire: AI/PDF PRICELIST/ EXCEL-ARTIKLE DATEN & FOTOT",
    kategoria: "GJENERALE",
    incl: "DV, LM",
  },
  {
    path: "CHECKLISTA",
    detyrat: "Shtypet Checklista per klient",
    keywords: "CHECKLISTA",
    pershkrimi: "Shtypet Checklista per klient, nese nuk kemi duke e punuar rastin e pare krijohet checklista",
    kategoria: "GJENERALE",
    incl: "DV, LM",
  },
  {
    path: "TEMPLATE",
    detyrat: "Hapet template paraprak",
    keywords: "TEMPLATE",
    pershkrimi: "Hapet template paraprak - nese kemi kategori te njejte qe e kemi punuar me heret",
    kategoria: "GJENERALE",
    incl: "DV, LM",
  },
  {
    path: "TRELLO",
    detyrat: "Hapet projekti ne Trello",
    keywords: "TRELLO",
    pershkrimi: "Hapet projekti ne Trello, dhe krijohet checklista me te gjithe hapat, ndahen detyrat",
    kategoria: "GJENERALE",
    incl: "DV, LM",
  },
  {
    path: "REGJISTRATOR",
    detyrat: "Regjistratori",
    keywords: "DOKUMENTET",
    pershkrimi:
      "Dokumentet e shtypura dhe Checklistat ruhen ne regj. Nese nuk kemi, duhet te krijohet regjistratori per klient",
    kategoria: "GJENERALE",
    incl: "DV, LM",
  },
  {
    path: "Rast 1",
    detyrat: "R1",
    keywords: "R1",
    pershkrimi:
      "Kur kemi rast te ri per kategori/subkategori qe nuk e kemi punuar me heret, hulumtojme funksione te reja dhe top seller ne portale.",
    kategoria: "GJENERALE",
    incl: "DV, LM",
  },
  {
    path: "Krahasimi i dimensioneve/kg-ve dhe atributeve tjera",
    detyrat: "DOKUMENTET",
    keywords: "DOKUMENTET",
    pershkrimi:
      "Krahaso te dhenat kg/dim dhe atributet tjera ne: 1. PDF (pricelist) 2. Excel databaza 3. Assembly Instructions 4. Portale (OTTO).",
    kategoria: "GJENERALE",
    incl: "DV, LM",
  },
  {
    path: "BESONDERE MERKMALE",
    detyrat: "BESONDERE",
    keywords: "BESONDERE",
    pershkrimi: "Besondere Merkmale max. 70 karaktere. T'i cekim me te vecantat e produktit.",
    kategoria: "GJENERALE",
    incl: "DV, LM",
  },
  {
    path: "SELLING POINTS",
    detyrat: "SELLING POINTS",
    keywords: "SELLING POINTS",
    pershkrimi:
      "Selling points te shkurta. Produkte identike me ngjyra ndryshe nuk duhet te kene pershkrime te ndryshme.",
    kategoria: "GJENERALE",
    incl: "DV, LM",
  },
  { path: "SELLING POINT 1", detyrat: "5 JAHRE GARANTIE", keywords: "GARANTIE", pershkrimi: "", kategoria: "GJENERALE", incl: "DV, LM" },
  {
    path: "SELLING POINT 2",
    detyrat: "MATERIALI & DIZAJNI",
    keywords: "MATERIALI",
    pershkrimi: "",
    kategoria: "GJENERALE",
    incl: "DV, LM",
  },
  {
    path: "SELLING POINT 3",
    detyrat: "180°/Funksionet",
    keywords: "FUNKSIONET",
    pershkrimi: "",
    kategoria: "GJENERALE",
    incl: "DV, LM",
  },
  {
    path: "SELLING POINT 4",
    detyrat: "GESTELL/NGJYRA/DIMENSIONI",
    keywords: "DIMENSIONI",
    pershkrimi: "",
    kategoria: "GJENERALE",
    incl: "DV, LM",
  },
  {
    path: "SELLING POINT 5",
    detyrat: "MADE IN GERMANY",
    keywords: "MADE IN DE",
    pershkrimi: "",
    kategoria: "GJENERALE",
    incl: "DV, LM",
  },
  {
    path: "MARKENINFORMATIONEN",
    detyrat: "MARKENINFORMATIONEN",
    keywords: "MARKEN",
    pershkrimi:
      "Tekstet copy/paste: 1) Set One by MST ... 2) MST ... (shiko checkliste per tekstin e plote).",
    kategoria: "GJENERALE",
    incl: "DV, LM",
  },
  {
    path: "SPECIFIKA PER KARRIGE, SET APO TYPE",
    detyrat: "SET/TYPE",
    keywords: "CHAIRS",
    pershkrimi: "Pyet klientin nese shitet si set apo type (2,4,6,8). Konfirmo per kategori karrigesh.",
    kategoria: "CHAIRS",
    incl: "DV, LM",
  },
  {
    path: "SPECIFIKA PER SOFA, SET APO TYPE",
    detyrat: "SET/TYPE",
    keywords: "SOFA",
    pershkrimi:
      "Kontrollo mekanizmat e perfshire apo extra cmim. Kerkohen foto per konfirmim ngjyrash. BZ1N1 me PDF duhet te perputhen me LDB/bullet points.",
    kategoria: "SOFA",
    incl: "DV, LM",
  },
]

const TABS = [
  { id: "description", label: "Description" },
  { id: "tasks", label: "Tasks" },
  { id: "checklists", label: "Checklists" },
  { id: "members", label: "Members" },
  { id: "ga", label: "GA/KA Notes" },
  { id: "financials", label: "Financials" },
] as const

const MEETING_TABS = [
  { id: "meeting-focus", label: "Meeting Focus" },
  { id: "meeting-checklist", label: "Checklist" },
] as const

type TabId = (typeof TABS)[number]["id"] | (typeof MEETING_TABS)[number]["id"]

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE", "CANCELLED"] as const
const TASK_PRIORITIES = ["NORMAL", "HIGH"] as const

const MEETING_POINTS = [
  "Confirm scope and stakeholder alignment.",
  "Review budget and milestones.",
  "Define success criteria and reporting cadence.",
  "Identify risks and mitigation plans.",
]

// PCM-specific checklists
const MEETING_CHECKLIST_ITEMS = [
  "Contract signed",
  "Stakeholders introduced",
  "Roles clarified",
  "Budget reviewed",
  "Next meeting scheduled",
]
const DOCUMENTATION_CHECKLIST_QUESTIONS = [
  "Is the contract filed?",
  "Has the budget been approved?",
  "Has the client been invoiced?",
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

function toDateInput(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(0, 10)
}

function isMstProject(project?: Project | null) {
  if (!project) return false
  const title = (project.title || project.name || "").toUpperCase()
  return title.includes("MST") || title.trim() === "TT"
}
function isVsVlProject(project?: Project | null) {
  if (!project) return false
  const title = (project.title || project.name || "").toUpperCase()
  return title.includes("VS/VL")
}

function parseVsVlMeta(notes?: string | null): VsVlTaskMeta | null {
  if (!notes || !notes.startsWith(VS_VL_META_PREFIX)) return null
  try {
    return JSON.parse(notes.slice(VS_VL_META_PREFIX.length)) as VsVlTaskMeta
  } catch {
    return null
  }
}

function serializeVsVlMeta(meta: VsVlTaskMeta): string {
  return `${VS_VL_META_PREFIX}${JSON.stringify(meta)}`
}

function vsVlPriorityLabel(priority?: string | null) {
  return priority === "HIGH" ? "I LARTE" : "NORMAL"
}

function normalizeTaskTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
}

function addBusinessDaysToIso(baseIso: string, days: number) {
  const base = new Date(baseIso)
  if (Number.isNaN(base.getTime())) return null
  if (days === 0) return base.toISOString()
  let remaining = Math.max(0, days)
  const direction = remaining >= 0 ? 1 : -1
  while (remaining > 0) {
    base.setUTCDate(base.getUTCDate() + direction)
    const day = base.getUTCDay()
    if (day !== 0 && day !== 6) {
      remaining -= 1
    }
  }
  return base.toISOString()
}

function sameDate(value?: string | null, other?: string | null) {
  return toDateInput(value) === toDateInput(other)
}

const VS_VL_TASK_TITLES = {
  base: normalizeTaskTitle("ANALIZIMI DHE IDENTIFIKIMI I KOLONAVE"),
  template: normalizeTaskTitle("PLOTESIMI I TEMPLATE-IT TE AMAZONIT"),
  prices: normalizeTaskTitle("KALKULIMI I CMIMEVE"),
  photos: normalizeTaskTitle("GJENERIMI I FOTOVE"),
  kontrol: normalizeTaskTitle("KONTROLLIMI I PROD. EGZSISTUESE DHE POSTIMI NE AMAZON"),
  ko1: normalizeTaskTitle("KO1 E PROJEKTIT VS"),
  ko2: normalizeTaskTitle("KO2 E PROJEKTIT VS"),
  dreamVs: normalizeTaskTitle("DREAM ROBOT VS"),
  dreamVl: normalizeTaskTitle("DREAM ROBOT VL"),
  dreamWeights: normalizeTaskTitle("KALKULIMI I PESHAVE"),
}

function findVsVlTask(tasks: Task[], titleKey: string) {
  return tasks.find((task) => normalizeTaskTitle(task.title) === titleKey)
}

export default function PcmProjectPage() {
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
  const [mstPhase, setMstPhase] = React.useState<(typeof MST_PHASES)[number]>("PLANIFIKIMI")
  const [vsVlPhase, setVsVlPhase] = React.useState<(typeof VS_VL_PHASES)[number]>("PROJECT_ACCEPTANCE")
  const [mstChecklistChecked, setMstChecklistChecked] = React.useState<Record<string, boolean>>({})
  const [mstPlanningChecks, setMstPlanningChecks] = React.useState<Record<string, boolean>>({})
  const [descriptionChecks, setDescriptionChecks] = React.useState<Record<string, boolean>>({})
  const [vsVlAcceptanceChecks, setVsVlAcceptanceChecks] = React.useState<Record<string, boolean>>({})
  const [vsVlTaskTitle, setVsVlTaskTitle] = React.useState("")
  const [vsVlTaskDetail, setVsVlTaskDetail] = React.useState("")
  const [vsVlTaskDate, setVsVlTaskDate] = React.useState("")
  const [vsVlTaskPriority, setVsVlTaskPriority] = React.useState<TaskPriority>("NORMAL")
  const [vsVlTaskStatus, setVsVlTaskStatus] = React.useState<Task["status"]>("TODO")
  const [vsVlTaskAssignees, setVsVlTaskAssignees] = React.useState<string[]>([])
  const [vsVlTaskDependencyId, setVsVlTaskDependencyId] = React.useState("__none__")
  const [vsVlTaskChecklist, setVsVlTaskChecklist] = React.useState("")
  const [vsVlTaskComment, setVsVlTaskComment] = React.useState("")
  const [vsVlCommentEdits, setVsVlCommentEdits] = React.useState<Record<string, string>>({})
  const [creatingVsVlTask, setCreatingVsVlTask] = React.useState(false)
  const vsVlScrollRef = React.useRef<HTMLDivElement | null>(null)
  const vsVlDraggingRef = React.useRef(false)
  const vsVlPointerIdRef = React.useRef<number | null>(null)
  const vsVlDragStartXRef = React.useRef(0)
  const vsVlDragScrollLeftRef = React.useRef(0)
  const [programName, setProgramName] = React.useState("")
  const [productTab, setProductTab] = React.useState<"tasks" | "checklists" | "members" | "ga">("tasks")
  const [newMemberId, setNewMemberId] = React.useState<string>("")
  const [controlTitle, setControlTitle] = React.useState("")
  const [controlAssignee, setControlAssignee] = React.useState<string>("__unassigned__")
  const [creatingControlTask, setCreatingControlTask] = React.useState(false)
  // Inline task form state for Produkte phase
  const [newInlineTaskTitle, setNewInlineTaskTitle] = React.useState("")
  const [newInlineTaskAssignee, setNewInlineTaskAssignee] = React.useState<string>("__unassigned__")
  const [newInlineTaskTotal, setNewInlineTaskTotal] = React.useState("")
  const [newInlineTaskCompleted, setNewInlineTaskCompleted] = React.useState("")
  const [creatingInlineTask, setCreatingInlineTask] = React.useState(false)
  // Finalizimi checklist state
  const [finalizationChecks, setFinalizationChecks] = React.useState<Record<string, boolean>>({})
  const [controlEdits, setControlEdits] = React.useState<
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
        apiFetch("/users"),
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
      if (isMstProject(p)) {
        setMstPhase(MST_PHASES[0])
      }
      if (isVsVlProject(p)) {
        setVsVlPhase(VS_VL_PHASES[0])
      }
    }
    void load()
  }, [apiFetch, projectId])

  React.useEffect(() => {
    if (project?.current_phase) setViewedPhase(project.current_phase)
  }, [project?.current_phase])

  const isMst = React.useMemo(() => isMstProject(project), [project])
  const isVsVl = React.useMemo(() => isVsVlProject(project), [project])

  React.useEffect(() => {
    if (!isVsVl || !project?.id) return
    const baseTask = findVsVlTask(tasks, VS_VL_TASK_TITLES.base)
    if (baseTask?.dependency_task_id) {
      void (async () => {
        const res = await apiFetch(`/tasks/${baseTask.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dependency_task_id: null }),
        })
        if (!res.ok) return
        const updated = (await res.json()) as Task
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      })()
    }
    if (!baseTask?.due_date) return

    const baseDate = baseTask.due_date
    const templateTask = findVsVlTask(tasks, VS_VL_TASK_TITLES.template)
    const pricesTask = findVsVlTask(tasks, VS_VL_TASK_TITLES.prices)
    const photosTask = findVsVlTask(tasks, VS_VL_TASK_TITLES.photos)
    const kontrolTask = findVsVlTask(tasks, VS_VL_TASK_TITLES.kontrol)
    const ko1Task = findVsVlTask(tasks, VS_VL_TASK_TITLES.ko1)
    const ko2Task = findVsVlTask(tasks, VS_VL_TASK_TITLES.ko2)
    const dreamVsTask = findVsVlTask(tasks, VS_VL_TASK_TITLES.dreamVs)
    const dreamVlTask = findVsVlTask(tasks, VS_VL_TASK_TITLES.dreamVl)
    const dreamWeightsTask = findVsVlTask(tasks, VS_VL_TASK_TITLES.dreamWeights)

    const updates: Array<{ task: Task; patch: Record<string, unknown> }> = []

    if (baseTask.dependency_task_id) {
      updates.push({ task: baseTask, patch: { dependency_task_id: null } })
    }

    const applyRule = (
      task: Task | undefined,
      offsetDays: number,
      dependencyId?: string | null
    ) => {
      if (!task) return
      const expectedDate = addBusinessDaysToIso(baseDate, offsetDays)
      if (!expectedDate) return
      const patch: Record<string, unknown> = {}
      if (!sameDate(task.due_date, expectedDate)) {
        patch.due_date = expectedDate
      }
      if (dependencyId !== undefined && (task.dependency_task_id || null) !== dependencyId) {
        patch.dependency_task_id = dependencyId
      }
      if (Object.keys(patch).length) {
        updates.push({ task, patch })
      }
    }

    applyRule(templateTask, 2, baseTask.id)
    applyRule(pricesTask, 3, null)
    applyRule(photosTask, 3, null)
    applyRule(ko1Task, 4, baseTask.id)
    if (ko2Task && ko1Task) {
      applyRule(ko2Task, 4, ko1Task.id)
    } else {
      applyRule(ko2Task, 4, undefined)
    }
    if (kontrolTask) {
      const dependencyId = ko2Task?.id
      applyRule(kontrolTask, 5, dependencyId ?? undefined)
    }
    if (dreamVsTask || dreamVlTask || dreamWeightsTask) {
      const dependencyId = kontrolTask?.id
      applyRule(dreamVsTask, 6, dependencyId ?? undefined)
      applyRule(dreamVlTask, 6, dependencyId ?? undefined)
      applyRule(dreamWeightsTask, 6, null)
    }

    if (!updates.length) return
    let cancelled = false
    const run = async () => {
      for (const { task, patch } of updates) {
        const res = await apiFetch(`/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        if (!res.ok) continue
        const updated = (await res.json()) as Task
        if (cancelled) return
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [apiFetch, isVsVl, project?.id, tasks])

  React.useEffect(() => {
    if (!prompts.length) return
  }, [prompts])

  React.useEffect(() => {
    if (!isVsVl) return
    setVsVlCommentEdits((prev) => {
      const next = { ...prev }
      let changed = false
      for (const task of tasks) {
        if (next[task.id] !== undefined) continue
        const meta = parseVsVlMeta(task.internal_notes)
        next[task.id] = meta?.comment || ""
        changed = true
      }
      return changed ? next : prev
    })
  }, [isVsVl, tasks])

  React.useEffect(() => {
    if (!membersOpen) return
    setSelectedMemberIds(members.map((m) => m.id))
  }, [membersOpen, members])

  React.useEffect(() => {
    if (!createOpen) return
    if (newTaskPhase) return
    const phaseValue = viewedPhase || project?.current_phase || "INICIMI"
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
    const currentPhase = project.current_phase || "INICIMI"
    const isMeetingPhase = currentPhase === "INICIMI"
    const openTasks = tasks.filter(
      (task) =>
        task.status !== "DONE" &&
        task.status !== "CANCELLED" &&
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
      setViewedPhase(updated.current_phase || "INICIMI")
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

  const phaseValue = viewedPhase || project?.current_phase || "INICIMI"
  const visibleTabs = React.useMemo(() => {
    // PCM: meetings phase shows meeting tabs + GA
    if (phaseValue === "INICIMI") {
      return [...MEETING_TABS, ...TABS.filter((tab) => tab.id === "ga")]
    }
    // planning: show description/tasks/financials
    if (phaseValue === "PLANIFIKIMI") {
      return TABS.filter((tab) => tab.id !== "checklists" && tab.id !== "members")
    }
    // execution: tasks, members, ga, financials
    if (phaseValue === "EKZEKUTIMI") {
      return TABS.filter((tab) => tab.id === "tasks" || tab.id === "members" || tab.id === "ga" || tab.id === "financials")
    }
    // monitoring: show most tabs
    if (phaseValue === "MONITORIMI") {
      return TABS
    }
    return TABS
  }, [phaseValue])

  React.useEffect(() => {
    if (!visibleTabs.length) return
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0].id)
    }
  }, [activeTab, visibleTabs])

  React.useEffect(() => {
    // Initialize control edits from tasks (parse totals from internal_notes if present)
    const next: Record<string, { total: string; completed: string; assigned_to: string | null; status: Task["status"] }> =
      {}
    for (const t of tasks) {
      let total = ""
      let completed = ""
      if (t.internal_notes) {
        const totalMatch = t.internal_notes.match(/total_products[:=]\s*(\d+)/i)
        const completedMatch = t.internal_notes.match(/completed_products[:=]\s*(\d+)/i)
        if (totalMatch) total = totalMatch[1]
        if (completedMatch) completed = completedMatch[1]
      }
      next[t.id] = {
        total,
        completed,
        assigned_to: t.assigned_to || null,
        status: t.status,
      }
    }
    setControlEdits(next)
  }, [tasks])

  const activePhase = phaseValue
  const visibleTasks = React.useMemo(
    () =>
      tasks.filter((task) => {
        const taskPhase = task.phase || project?.current_phase || "INICIMI"
        return taskPhase === activePhase
      }),
    [activePhase, project?.current_phase, tasks]
  )

  if (!project) return <div className="text-sm text-muted-foreground">Loading...</div>

  const title = project.title || project.name || "Project"
  const phase = project.current_phase || "INICIMI"
  const phaseIndex = PHASES.indexOf(phase as (typeof PHASES)[number])
  const canClosePhase = phase !== "MBYLLJA" && phase !== "MBYLLUR"
  const userMap = new Map([...allUsers, ...members, ...(user ? [user] : [])].map((m) => [m.id, m]))

  if (isVsVl) {
    const memberLabel = (id?: string | null) => {
      if (!id) return "-"
      const u = userMap.get(id)
      return u?.full_name || u?.username || "-"
    }
    const assignableUsers = departmentUsers.filter((u) => u.role !== "ADMIN")
    const taskAssigneeIds = (task: Task) => {
      const ids = task.assignees?.map((a) => a.id) || []
      if (ids.length) return ids
      if (task.assigned_to) return [task.assigned_to]
      return []
    }
    const vsVlTasks = tasks.filter((task) => {
      const meta = parseVsVlMeta(task.internal_notes)
      if (!meta?.vs_vl_phase) {
        return vsVlPhase === "AMAZONE"
      }
      return meta.vs_vl_phase === vsVlPhase
    })
    const phaseOrder =
      vsVlPhase === "AMAZONE"
        ? [
            VS_VL_TASK_TITLES.base,
            VS_VL_TASK_TITLES.template,
            VS_VL_TASK_TITLES.prices,
            VS_VL_TASK_TITLES.photos,
            VS_VL_TASK_TITLES.kontrol,
          ]
        : vsVlPhase === "CONTROL"
          ? [VS_VL_TASK_TITLES.ko1, VS_VL_TASK_TITLES.ko2]
          : vsVlPhase === "DREAMROBOT"
            ? [VS_VL_TASK_TITLES.dreamVs, VS_VL_TASK_TITLES.dreamVl, VS_VL_TASK_TITLES.dreamWeights]
          : []
    const orderMap = new Map(phaseOrder.map((key, idx) => [key, idx]))
    const orderedVsVlTasks = [...vsVlTasks].sort((a, b) => {
      const aKey = normalizeTaskTitle(a.title)
      const bKey = normalizeTaskTitle(b.title)
      const aIndex = orderMap.get(aKey) ?? 999
      const bIndex = orderMap.get(bKey) ?? 999
      if (aIndex !== bIndex) return aIndex - bIndex
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
      return aTime - bTime
    })
    const taskStatusById = new Map(tasks.map((task) => [task.id, task.status]))
    const dependencyOptions = tasks
    const shouldIgnoreDragTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      if (target.isContentEditable) return true
      return Boolean(target.closest("input, textarea, select, option, button, label"))
    }
    const handleVsVlPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.pointerType !== "touch") return
      if (shouldIgnoreDragTarget(event.target)) return
      const node = vsVlScrollRef.current
      if (!node) return
      vsVlPointerIdRef.current = event.pointerId
      vsVlDragStartXRef.current = event.clientX
      vsVlDragScrollLeftRef.current = node.scrollLeft
      vsVlDraggingRef.current = false
    }
    const handleVsVlPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
      if (vsVlPointerIdRef.current !== event.pointerId) return
      const node = vsVlScrollRef.current
      if (!node) return
      const delta = event.clientX - vsVlDragStartXRef.current
      if (!vsVlDraggingRef.current) {
        if (Math.abs(delta) < 6) return
        vsVlDraggingRef.current = true
        node.setPointerCapture(event.pointerId)
      }
      node.scrollLeft = vsVlDragScrollLeftRef.current - delta
      event.preventDefault()
    }
    const handleVsVlPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
      if (vsVlPointerIdRef.current !== event.pointerId) return
      const node = vsVlScrollRef.current
      if (node && vsVlDraggingRef.current) {
        try {
          node.releasePointerCapture(event.pointerId)
        } catch {
          // ignore
        }
      }
      vsVlDraggingRef.current = false
      vsVlPointerIdRef.current = null
    }

    return (
      <div className="space-y-5 max-w-6xl mx-auto px-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <button type="button" onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-foreground">
              &larr; Back to Projects
            </button>
            <div className="text-3xl font-semibold">{title}</div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {VS_VL_PHASES.map((p) => {
                const isActive = p === vsVlPhase
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setVsVlPhase(p)}
                    className={[
                      "rounded-full border px-3 py-1 transition-colors",
                      isActive ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-muted-foreground",
                    ].join(" ")}
                  >
                    {VS_VL_PHASE_LABELS[p]}
                  </button>
                )
              })}
            </div>
            <div className="text-sm text-muted-foreground">
              {VS_VL_PHASES.map((p, idx) => (
                <span key={p}>
                  <button
                    type="button"
                    onClick={() => setVsVlPhase(p)}
                    className={p === vsVlPhase ? "text-blue-700 font-semibold" : "hover:text-foreground"}
                  >
                    {VS_VL_PHASE_LABELS[p]}
                  </button>
                  {idx < VS_VL_PHASES.length - 1 ? " -> " : ""}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
              VS/VL 
            </Badge>
          </div>
        </div>

        {vsVlPhase === "PROJECT_ACCEPTANCE" ? (
          <>
            <div className="border-b flex gap-6">
              <button className="relative pb-3 text-sm font-medium text-blue-600">
                Description
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" />
              </button>
            </div>
            <Card>
              <div className="p-4 space-y-4">
                <div className="text-lg font-semibold">Planning</div>
                <div className="grid gap-3">
                  {VS_VL_ACCEPTANCE_QUESTIONS.map((q) => (
                    <div key={q} className="flex items-center gap-3">
                      <Checkbox
                        checked={Boolean(vsVlAcceptanceChecks[q])}
                        onCheckedChange={() => setVsVlAcceptanceChecks((prev) => ({ ...prev, [q]: !prev[q] }))}
                        className="h-5 w-5 border-2 border-slate-400 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                      />
                      <span className="text-sm font-semibold uppercase tracking-wide">{q}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </>
        ) : (
          <>
            <div className="border-b flex gap-6">
              <button className="relative pb-3 text-sm font-medium text-blue-600">
                Tasks
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" />
              </button>
            </div>
            <Card className="border-0 shadow-sm">
              <div className="p-6 space-y-4">
                <div className="text-lg font-semibold tracking-tight">{VS_VL_PHASE_LABELS[vsVlPhase]} Tasks</div>
                <div
                  ref={vsVlScrollRef}
                  className="overflow-x-auto border rounded-lg cursor-grab active:cursor-grabbing"
                  style={{ touchAction: "pan-x" }}
                  onPointerDown={handleVsVlPointerDown}
                  onPointerMove={handleVsVlPointerMove}
                  onPointerUp={handleVsVlPointerUp}
                  onPointerLeave={handleVsVlPointerUp}
                  onPointerCancel={handleVsVlPointerUp}
                >
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600 uppercase tracking-wide">
                      <tr>
                        <th className="border px-2 py-2 text-left">PLATFORMA</th>
                        <th className="border px-2 py-2 text-left">PERSHKRIMI</th>
                        <th className="border px-2 py-2 text-left">PERSHKRIMI/DETAL</th>
                        <th className="border px-2 py-2 text-left">DATA E SHFAQJES</th>
                        <th className="border px-2 py-2 text-left">PRIORITETI</th>
                        <th className="border px-2 py-2 text-left">USERID</th>
                        <th className="border px-2 py-2 text-left">VARESIA</th>
                        <th className="border px-2 py-2 text-left">STATUS</th>
                        <th className="border px-2 py-2 text-left">COMMENT</th>
                        <th className="border px-2 py-2 text-left">CHECKLISTA</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="align-top bg-slate-50">
                        <td className="border px-2 py-2 text-[11px] font-semibold text-slate-600">
                          {VS_VL_PHASE_LABELS[vsVlPhase]}
                        </td>
                        <td className="border px-2 py-2">
                          <Input
                            value={vsVlTaskTitle}
                            onChange={(e) => setVsVlTaskTitle(e.target.value)}
                            placeholder="Pershkrimi..."
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="border px-2 py-2">
                          <Textarea
                            value={vsVlTaskDetail}
                            onChange={(e) => setVsVlTaskDetail(e.target.value)}
                            placeholder="Pershkrimi/Detaj"
                            rows={3}
                            className="text-xs"
                          />
                        </td>
                        <td className="border px-2 py-2">
                          <Input
                            value={vsVlTaskDate}
                            onChange={(e) => setVsVlTaskDate(normalizeDueDateInput(e.target.value))}
                            type="date"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="border px-2 py-2">
                          <Select value={vsVlTaskPriority} onValueChange={(v) => setVsVlTaskPriority(v as TaskPriority)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NORMAL">NORMAL</SelectItem>
                              <SelectItem value="HIGH">I LARTE</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="border px-2 py-2">
                          <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                            {assignableUsers.length ? (
                              assignableUsers.map((u) => {
                                const checked = vsVlTaskAssignees.includes(u.id)
                                return (
                                  <label key={u.id} className="flex items-center gap-2 text-[11px] text-slate-600">
                                    <input
                                      type="checkbox"
                                      className="h-3 w-3 rounded border-slate-300"
                                      checked={checked}
                                      onChange={() =>
                                        setVsVlTaskAssignees((prev) =>
                                          checked ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                                        )
                                      }
                                    />
                                    <span className="truncate">{u.full_name || u.username || u.email}</span>
                                  </label>
                                )
                              })
                            ) : (
                              <div className="text-[11px] text-slate-400">-</div>
                            )}
                          </div>
                        </td>
                        <td className="border px-2 py-2">
                          <Select value={vsVlTaskDependencyId} onValueChange={setVsVlTaskDependencyId}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="-" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">-</SelectItem>
                              {dependencyOptions.map((task) => (
                                <SelectItem key={task.id} value={task.id}>
                                  {task.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="border px-2 py-2">
                          <Select value={vsVlTaskStatus || "TODO"} onValueChange={(v) => setVsVlTaskStatus(v as Task["status"])}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                              {TASK_STATUSES.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {statusLabel(status)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="border px-2 py-2">
                          <Textarea
                            value={vsVlTaskComment}
                            onChange={(e) => setVsVlTaskComment(e.target.value)}
                            placeholder="Koment..."
                            rows={2}
                            className="text-xs"
                          />
                        </td>
                        <td className="border px-2 py-2 space-y-2">
                          <Textarea
                            value={vsVlTaskChecklist}
                            onChange={(e) => setVsVlTaskChecklist(e.target.value)}
                            placeholder="Checklist..."
                            rows={2}
                            className="text-xs"
                          />
                          <Button
                            size="sm"
                            className="w-full"
                            disabled={creatingVsVlTask || !vsVlTaskTitle.trim()}
                            onClick={async () => {
                              if (!project || !vsVlTaskTitle.trim()) return
                              setCreatingVsVlTask(true)
                              try {
                                const meta: VsVlTaskMeta = {
                                  vs_vl_phase: vsVlPhase,
                                  checklist: vsVlTaskChecklist.trim() || undefined,
                                  comment: vsVlTaskComment.trim() || undefined,
                                }
                                const res = await apiFetch("/tasks", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    title: vsVlTaskTitle.trim(),
                                    description: vsVlTaskDetail.trim() || null,
                                    project_id: project.id,
                                    department_id: project.department_id,
                                    assignees: vsVlTaskAssignees,
                                    dependency_task_id:
                                      vsVlTaskDependencyId === "__none__" ? null : vsVlTaskDependencyId,
                                    status: vsVlTaskStatus || "TODO",
                                    priority: vsVlTaskPriority,
                                    due_date: vsVlTaskDate ? new Date(vsVlTaskDate).toISOString() : null,
                                    internal_notes: serializeVsVlMeta(meta),
                                  }),
                                })
                                if (!res?.ok) {
                                  toast.error("Failed to add task")
                                  return
                                }
                                const created = (await res.json()) as Task
                                setTasks((prev) => [...prev, created])
                                setVsVlTaskTitle("")
                                setVsVlTaskDetail("")
                                setVsVlTaskDate("")
                                setVsVlTaskPriority("NORMAL")
                                setVsVlTaskStatus("TODO")
                                setVsVlTaskAssignees([])
                                setVsVlTaskDependencyId("__none__")
                                setVsVlTaskChecklist("")
                                setVsVlTaskComment("")
                                toast.success("Task added")
                              } finally {
                                setCreatingVsVlTask(false)
                              }
                            }}
                          >
                            {creatingVsVlTask ? "Saving..." : "Save"}
                          </Button>
                        </td>
                      </tr>
                      {orderedVsVlTasks.length ? (
                        orderedVsVlTasks.map((task) => {
                          const meta = parseVsVlMeta(task.internal_notes)
                          const titleKey = normalizeTaskTitle(task.title)
                          const isBaseTask = titleKey === VS_VL_TASK_TITLES.base
                          const dependencyId = isBaseTask
                            ? null
                            : task.dependency_task_id || meta?.dependency_task_id || null
                          const dependencyStatus = dependencyId ? taskStatusById.get(dependencyId) : null
                          const isDependencyLocked = Boolean(dependencyId && dependencyStatus !== "DONE")
                          const isLocked = isDependencyLocked
                          const selectedAssignees = taskAssigneeIds(task)
                          const commentValue = vsVlCommentEdits[task.id] ?? meta?.comment ?? ""
                          return (
                            <tr key={task.id} className="align-top">
                              <td className="border px-2 py-2">{VS_VL_PHASE_LABELS[vsVlPhase]}</td>
                              <td className="border px-2 py-2 font-medium">{task.title}</td>
                              <td className="border px-2 py-2 whitespace-pre-wrap">{task.description || "-"}</td>
                              <td className="border px-2 py-2">
                                <Input
                                  value={toDateInput(task.due_date)}
                                  onChange={async (e) => {
                                    if (isLocked) return
                                    const nextValue = normalizeDueDateInput(e.target.value)
                                    const dueDate = nextValue ? new Date(nextValue).toISOString() : null
                                    const res = await apiFetch(`/tasks/${task.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ due_date: dueDate }),
                                    })
                                    if (!res.ok) {
                                      toast.error("Failed to update date")
                                      return
                                    }
                                    const updated = (await res.json()) as Task
                                    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
                                  }}
                                  type="date"
                                  className="h-8 text-xs"
                                  disabled={isLocked}
                                />
                              </td>
                              <td className="border px-2 py-2">{vsVlPriorityLabel(task.priority)}</td>
                              <td className="border px-2 py-2">
                                <div className="space-y-2">
                                  <div className="text-[11px] text-slate-500">
                                    {selectedAssignees.length
                                      ? selectedAssignees.map((id) => memberLabel(id)).join(", ")
                                      : "-"}
                                  </div>
                                  <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                                    {assignableUsers.length ? (
                                      assignableUsers.map((u) => {
                                        const checked = selectedAssignees.includes(u.id)
                                        return (
                                          <label key={u.id} className="flex items-center gap-2 text-[11px] text-slate-600">
                                            <input
                                              type="checkbox"
                                              className="h-3 w-3 rounded border-slate-300"
                                              checked={checked}
                                              disabled={isLocked}
                                              onChange={async () => {
                                                if (isLocked) return
                                                const nextIds = checked
                                                  ? selectedAssignees.filter((id) => id !== u.id)
                                                  : [...selectedAssignees, u.id]
                                                const res = await apiFetch(`/tasks/${task.id}`, {
                                                  method: "PATCH",
                                                  headers: { "Content-Type": "application/json" },
                                                  body: JSON.stringify({ assignees: nextIds }),
                                                })
                                                if (!res.ok) {
                                                  toast.error("Failed to update assignees")
                                                  return
                                                }
                                                const updated = (await res.json()) as Task
                                                setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
                                              }}
                                            />
                                            <span className="truncate">{u.full_name || u.username || u.email}</span>
                                          </label>
                                        )
                                      })
                                    ) : (
                                      <div className="text-[11px] text-slate-400">-</div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="border px-2 py-2">
                                <Select
                                  value={
                                    isBaseTask ? "__none__" : task.dependency_task_id || meta?.dependency_task_id || "__none__"
                                  }
                                  onValueChange={async (value) => {
                                    const res = await apiFetch(`/tasks/${task.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        dependency_task_id: value === "__none__" ? null : value,
                                      }),
                                    })
                                    if (!res.ok) {
                                      toast.error("Failed to update dependency")
                                      return
                                    }
                                    const updated = (await res.json()) as Task
                                    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
                                  }}
                                  disabled={isBaseTask}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="-" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">-</SelectItem>
                                    {dependencyOptions
                                      .filter((opt) => opt.id !== task.id)
                                      .map((opt) => (
                                        <SelectItem key={opt.id} value={opt.id}>
                                          {opt.title}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="border px-2 py-2">
                                <Select
                                  value={task.status || "TODO"}
                                  onValueChange={async (value) => {
                                    if (isLocked) return
                                    const res = await apiFetch(`/tasks/${task.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ status: value }),
                                    })
                                    if (!res.ok) {
                                      toast.error("Failed to update status")
                                      return
                                    }
                                    const updated = (await res.json()) as Task
                                    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
                                  }}
                                  disabled={isLocked}
                                >
                                  <SelectTrigger className="h-8 text-xs">
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
                              </td>
                              <td className="border px-2 py-2">
                                <Textarea
                                  value={commentValue}
                                  onChange={(e) =>
                                    setVsVlCommentEdits((prev) => ({ ...prev, [task.id]: e.target.value }))
                                  }
                                  onBlur={async (e) => {
                                    if (isLocked) return
                                    const nextValue = e.target.value.trim()
                                    const currentValue = meta?.comment || ""
                                    if (nextValue === currentValue) return
                                    const nextMeta: VsVlTaskMeta = {
                                      ...(meta || {}),
                                      vs_vl_phase: meta?.vs_vl_phase || vsVlPhase,
                                    }
                                    if (nextValue) {
                                      nextMeta.comment = nextValue
                                    } else {
                                      delete nextMeta.comment
                                    }
                                    const res = await apiFetch(`/tasks/${task.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ internal_notes: serializeVsVlMeta(nextMeta) }),
                                    })
                                    if (!res.ok) {
                                      toast.error("Failed to update comment")
                                      return
                                    }
                                    const updated = (await res.json()) as Task
                                    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
                                    setVsVlCommentEdits((prev) => ({ ...prev, [task.id]: nextValue }))
                                  }}
                                  placeholder="Koment..."
                                  rows={2}
                                  className="text-xs"
                                  disabled={isLocked}
                                />
                              </td>
                              <td className="border px-2 py-2 whitespace-pre-wrap">{meta?.checklist || "-"}</td>
                            </tr>
                          )
                        })
                      ) : (
                        <tr>
                          <td className="border px-2 py-4 text-center text-muted-foreground" colSpan={10}>
                            No tasks yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    )
  }

  if (isMst) {
    const planningChecks = mstPlanningChecks
    const togglePlanning = (q: string) =>
      setMstPlanningChecks((prev) => ({ ...prev, [q]: !prev[q] }))
    const toggleFinalChecklist = (path: string) =>
      setMstChecklistChecked((prev) => ({ ...prev, [path]: !prev[path] }))
    const memberLabel = (id?: string | null) => {
      if (!id) return "-"
      const u = userMap.get(id)
      return u?.full_name || u?.username || "-"
    }
    const controlledBy = (assignedTo?: string | null) => {
      const other = members.find((m) => m.id !== assignedTo) || allUsers.find((m) => m.id !== assignedTo)
      return other ? memberLabel(other.id) : "-"
    }

    return (
      <div className="space-y-5 max-w-6xl mx-auto px-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <button type="button" onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-foreground">
              &larr; Back to Projects
            </button>
            <div className="text-3xl font-semibold">{title}</div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {MST_PHASES.map((p) => {
                const isActive = p === mstPhase
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setMstPhase(p)}
                    className={[
                      "rounded-full border px-3 py-1 transition-colors",
                      isActive ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-muted-foreground",
                    ].join(" ")}
                  >
                    {MST_PHASE_LABELS[p]}
                  </button>
                )
              })}
            </div>
            <div className="text-sm text-muted-foreground">
              {MST_PHASES.map((p, idx) => (
                <span key={p}>
                  <button
                    type="button"
                    onClick={() => setMstPhase(p)}
                    className={p === mstPhase ? "text-blue-700 font-semibold" : "hover:text-foreground"}
                  >
                    {MST_PHASE_LABELS[p]}
                  </button>
                  {idx < MST_PHASES.length - 1 ? " -> " : ""}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
              MST
            </Badge>
          </div>
        </div>

        {mstPhase === "PLANIFIKIMI" ? (
          <>
            <div className="border-b flex gap-6">
              <button className="relative pb-3 text-sm font-medium text-blue-600">
                Description
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" />
              </button>
            </div>
            <Card>
              <div className="p-4 space-y-4">
                <div className="text-lg font-semibold">Planifikimi</div>
                <div className="grid gap-3">
                  {[
                    "A eshte hapur grupi ne Teams?",
                    "A eshte hapur projekti ne chat GPT?",
                  ].map((q, idx) => (
                    <div key={q} className="grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-9 flex items-center gap-3">
                        <Checkbox
                          checked={Boolean(descriptionChecks[q])}
                          onCheckedChange={() => setDescriptionChecks((prev) => ({ ...prev, [q]: !prev[q] }))}
                        />
                        <span className="text-sm font-semibold uppercase tracking-wide">{q}</span>
                      </div>
                      <div className="col-span-3">
                        {idx === 1 ? (
                          <Textarea
                            placeholder="Shkruaj emrin e programit..."
                            value={programName}
                            onChange={(e) => setProgramName(e.target.value)}
                          />
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-12 items-center bg-slate-50 px-3 py-2 font-semibold text-xs uppercase text-slate-600 border">
                  <div className="col-span-10">Description/General Points (me checkbox)</div>
                  <div className="col-span-2 text-right">Status/Koment</div>
                </div>

                <div className="divide-y border rounded-lg">
                  {MST_PLANNING_QUESTIONS.slice(2).map((q) => (
                    <div key={q} className="grid grid-cols-12 gap-3 items-center px-3 py-3">
                      <div className="col-span-10 flex items-start gap-3">
                        <Checkbox
                          checked={Boolean(descriptionChecks[q])}
                          onCheckedChange={() => setDescriptionChecks((prev) => ({ ...prev, [q]: !prev[q] }))}
                        />
                        <span className="text-sm">{q}</span>
                      </div>
                      <div className="col-span-2">
                        <Input placeholder="Koment" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </>
        ) : mstPhase === "PRODUKTE" ? (
          <>
            <div className="border-b flex gap-6">
              {[
                { id: "tasks", label: "Tasks (Detyrat)" },
                { id: "checklists", label: "Checklists" },
                { id: "members", label: "Members" },
                { id: "ga", label: "Shenime GA/KA" },
              ].map((tab) => {
                const isActive = productTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setProductTab(tab.id as typeof productTab)}
                    className={["relative pb-3 text-sm font-medium", isActive ? "text-blue-600" : "text-muted-foreground"].join(" ")}
                  >
                    {tab.label}
                    {isActive ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" /> : null}
                  </button>
                )
              })}
            </div>

            {productTab === "tasks" ? (
              <Card className="border-0 shadow-sm">
                <div className="p-6 space-y-4">
                  <div className="text-lg font-semibold tracking-tight">Tasks</div>
                  {/* Table header */}
                  <div className="grid grid-cols-12 gap-4 text-[11px] font-medium text-slate-400 uppercase tracking-wider pb-3">
                    <div className="col-span-4">Task</div>
                    <div className="col-span-1">Assigned</div>
                    <div className="col-span-2">Total</div>
                    <div className="col-span-2">Completed</div>
                    <div className="col-span-2">Status</div>
                    <div className="col-span-1"></div>
                  </div>
                  {/* Inline form row */}
                  <div className="grid grid-cols-12 gap-4 py-4 text-sm items-center bg-slate-50/60 -mx-6 px-6 border-y border-slate-100">
                    <div className="col-span-4">
                      <input
                        type="text"
                        placeholder="Enter task name..."
                        className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-blue-500 outline-none py-2 text-sm placeholder:text-slate-400 transition-colors"
                        value={newInlineTaskTitle}
                        onChange={(e) => setNewInlineTaskTitle(e.target.value)}
                      />
                    </div>
                    <div className="col-span-1">
                      <Select value={newInlineTaskAssignee} onValueChange={setNewInlineTaskAssignee}>
                        <SelectTrigger className="h-9 border-0 border-b-2 border-slate-200 rounded-none bg-transparent focus:border-blue-500 shadow-none">
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unassigned__">-</SelectItem>
                          {departmentUsers
                            .filter((u) => u.role !== "ADMIN")
                            .map((u) => (
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
                        className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-blue-500 outline-none py-2 text-sm placeholder:text-slate-400 transition-colors"
                        value={newInlineTaskTotal}
                        onChange={(e) => setNewInlineTaskTotal(e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        placeholder="0"
                        className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-blue-500 outline-none py-2 text-sm placeholder:text-slate-400 transition-colors"
                        value={newInlineTaskCompleted}
                        onChange={(e) => setNewInlineTaskCompleted(e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Button
                        size="sm"
                        className="rounded-full px-5 shadow-sm"
                        onClick={async () => {
                          if (!project || !newInlineTaskTitle.trim()) return
                          setCreatingInlineTask(true)
                          try {
                            const res = await apiFetch("/tasks", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                title: newInlineTaskTitle.trim(),
                                project_id: project.id,
                                department_id: project.department_id,
                                assigned_to: newInlineTaskAssignee === "__unassigned__" ? null : newInlineTaskAssignee,
                                status: "IN_PROGRESS",
                                priority: "NORMAL",
                                internal_notes: `total_products=${newInlineTaskTotal || 0}; completed_products=${newInlineTaskCompleted || 0}`,
                              }),
                            })
                            if (!res?.ok) {
                              toast.error("Failed to add task")
                              return
                            }
                            const created = (await res.json()) as Task
                            setTasks((prev) => [...prev, created])
                            setNewInlineTaskTitle("")
                            setNewInlineTaskAssignee("__unassigned__")
                            setNewInlineTaskTotal("")
                            setNewInlineTaskCompleted("")
                            toast.success("Task added")
                          } finally {
                            setCreatingInlineTask(false)
                          }
                        }}
                        disabled={creatingInlineTask || !newInlineTaskTitle.trim()}
                      >
                        {creatingInlineTask ? "Saving..." : "Save"}
                      </Button>
                    </div>
                    <div className="col-span-1"></div>
                  </div>
                  {/* Task rows */}
                  <div className="divide-y divide-slate-100">
                    {tasks.map((task) => {
                      const totalVal = parseInt(controlEdits[task.id]?.total || "0", 10) || 0
                      return (
                        <div key={task.id} className="grid grid-cols-12 gap-4 py-4 text-sm items-center hover:bg-slate-50/70 transition-colors group">
                          <div className="col-span-4 font-medium text-slate-700">{task.title}</div>
                          <div className="col-span-1 text-slate-500">{memberLabel(task.assigned_to)}</div>
                          <div className="col-span-2 text-slate-500">{controlEdits[task.id]?.total || "-"}</div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              min="0"
                              max={totalVal > 0 ? totalVal : undefined}
                              className="w-16 bg-transparent border-0 border-b-2 border-transparent focus:border-blue-500 hover:border-slate-300 outline-none py-1 text-sm transition-colors text-center"
                              value={controlEdits[task.id]?.completed || ""}
                              onChange={async (e) => {
                                let completedNum = parseInt(e.target.value, 10) || 0
                                // Cap at total value
                                if (totalVal > 0 && completedNum > totalVal) {
                                  completedNum = totalVal
                                }
                                const newCompleted = completedNum.toString()
                                const shouldMarkDone = totalVal > 0 && completedNum >= totalVal
                                const newStatus = shouldMarkDone ? "DONE" : controlEdits[task.id]?.status || task.status

                                // Update local state immediately
                                setControlEdits((prev) => ({
                                  ...prev,
                                  [task.id]: { ...prev[task.id], completed: newCompleted, status: newStatus },
                                }))

                                // Update task on server
                                const res = await apiFetch(`/tasks/${task.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    internal_notes: `total_products=${controlEdits[task.id]?.total || 0}; completed_products=${newCompleted}`,
                                    status: newStatus,
                                  }),
                                })
                                if (res?.ok) {
                                  const updated = (await res.json()) as Task
                                  setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
                                  if (shouldMarkDone && task.status !== "DONE") {
                                    toast.success("Task marked as Done!")
                                  }
                                }
                              }}
                            />
                          </div>
                          <div className="col-span-2">
                            <Badge 
                              variant={task.status === "DONE" ? "default" : "outline"}
                              className={task.status === "DONE" ? "bg-emerald-500 hover:bg-emerald-600" : "text-slate-600 border-slate-300"}
                            >
                              {statusLabel(controlEdits[task.id]?.status || task.status)}
                            </Badge>
                          </div>
                          <div className="col-span-1 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50"
                              onClick={async () => {
                                const res = await apiFetch(`/tasks/${task.id}`, { method: "DELETE" })
                                if (!res?.ok) {
                                  toast.error("Failed to delete task")
                                  return
                                }
                                setTasks((prev) => prev.filter((t) => t.id !== task.id))
                                toast.success("Task deleted")
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                    {tasks.length === 0 ? (
                      <div className="py-8 text-center text-sm text-slate-400">
                        No tasks yet. Add one above to get started.
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>
            ) : null}

            {productTab === "checklists" ? (
              <Card>
                <div className="p-4 space-y-4">
                  <div className="text-lg font-semibold">Checklists</div>
                  <div className="text-sm text-red-600 space-y-1">
                    <div>!!! EMRI I PLOTE I KLIENTIT NUK GUXON TE SHKRUHET I PLOTE NE ASNJE EMERTIM TE FILE AS ASKUND TJETER</div>
                    <div>!!! CDO KATEGORI E RE PARAQITET SI RAST I PARE, DHE GJITHMONE DUHET TE KONFIRMOHET R1 ME GA</div>
                    <div>!!! KRAHASO TE DHENAT QE DERGOHEN TE PLOTESUARA, A JANE NE PERPUTHSHMERI ME DROPDOWN DHE ME TE DHENAT QE NA I KANE DERGUAR NE PDF/EXCEL</div>
                    <div>!!! BESONDERE MERKMALE - MAX 70 CHARACTERS</div>
                    <div>!!! SELLING POINT 1: 5 JAHRE GARANTIE (FIKSE)</div>
                    <div>!!! TO SELLING POINTS & BESONDERE MERKMALE - WE SHOULD CREATE SAME DESCRIPTIONS FOR PRODUCTS THAT ARE IDENTICAL EXCEPT FOR COLOR.</div>
                  </div>
                  <div className="grid grid-cols-12 gap-3 text-xs font-semibold text-muted-foreground border-b pb-2">
                    <div className="col-span-2">PATH</div>
                    <div className="col-span-2">DETYRAT</div>
                    <div className="col-span-2">KEYWORDS</div>
                    <div className="col-span-3">PERSHKRIMI</div>
                    <div className="col-span-1">KATEGORIA</div>
                    <div className="col-span-1">CHECK</div>
                    <div className="col-span-1">INCL</div>
                    <div className="col-span-1">COMENT</div>
                  </div>
                  <div className="divide-y">
                    {MST_FINAL_CHECKLIST.map((row) => (
                      <div key={row.path + row.detyrat} className="grid grid-cols-12 gap-3 py-3 text-sm items-center">
                        <div className="col-span-2">{row.path}</div>
                        <div className="col-span-2 font-semibold">{row.detyrat}</div>
                        <div className="col-span-2">{row.keywords}</div>
                        <div className="col-span-3">{row.pershkrimi}</div>
                        <div className="col-span-1">{row.kategoria}</div>
                        <div className="col-span-1 flex justify-center">
                          <Checkbox
                            checked={Boolean(mstChecklistChecked[row.path + row.detyrat])}
                            onCheckedChange={() => toggleFinalChecklist(row.path + row.detyrat)}
                          />
                        </div>
                        <div className="col-span-1">{row.incl}</div>
                        <div className="col-span-1">
                          <Input placeholder="Koment" className="h-8" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            ) : null}

            {productTab === "members" ? (
              <Card>
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold">Members</div>
                    <div className="flex items-center gap-2">
                      <Select value={newMemberId} onValueChange={setNewMemberId}>
                        <SelectTrigger className="w-56">
                          <SelectValue placeholder="Select member" />
                        </SelectTrigger>
                        <SelectContent>
                          {departmentUsers
                            .filter((u) => !members.some((m) => m.id === u.id))
                            .map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.full_name || u.username || u.email}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={async () => {
                          if (!project || !newMemberId) return
                          setSavingMembers(true)
                          try {
                            const res = await apiFetch("/project-members", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ project_id: project.id, user_ids: [newMemberId] }),
                            })
                            if (!res?.ok) {
                              toast.error("Failed to add member")
                              return
                            }
                            const added = (await res.json()) as User[]
                            const map = new Map(members.map((m) => [m.id, m]))
                            added.forEach((u) => map.set(u.id, u))
                            setMembers(Array.from(map.values()))
                            setNewMemberId("")
                            toast.success("Member added")
                          } finally {
                            setSavingMembers(false)
                          }
                        }}
                        disabled={savingMembers || !newMemberId}
                      >
                        {savingMembers ? "Adding..." : "Add"}
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-6">
                    {members.length ? (
                      members.map((m, idx) => {
                        const initialsText = initials(m.full_name || m.username || m.email || "-")
                        const colors = ["bg-blue-100 text-blue-800", "bg-green-100 text-green-800", "bg-purple-100 text-purple-800", "bg-rose-100 text-rose-800", "bg-amber-100 text-amber-800"]
                        const colorClass = colors[idx % colors.length]
                        return (
                          <div key={m.id} className="flex flex-col items-center gap-2">
                            <div className={`h-16 w-16 rounded-full flex items-center justify-center text-lg font-semibold ${colorClass}`}>
                              {initialsText}
                            </div>
                            <div className="text-sm font-semibold">{m.full_name || m.username || m.email}</div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="text-sm text-muted-foreground">No members added.</div>
                    )}
                  </div>
                </div>
              </Card>
            ) : null}

            {productTab === "ga" ? (
              <Card>
                <div className="p-4 space-y-4">
                  <div className="text-lg font-semibold">Shenime GA/KA</div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <Select value={newGaNoteType} onValueChange={(v) => setNewGaNoteType(v as "GA" | "KA")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GA">GA</SelectItem>
                        <SelectItem value="KA">KA</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={newGaNotePriority} onValueChange={(v) => setNewGaNotePriority(v as any)}>
                      <SelectTrigger>
                        <SelectValue placeholder="No priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No priority</SelectItem>
                        <SelectItem value="NORMAL">Normal</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="md:col-span-2 flex gap-2">
                      <Textarea
                        placeholder="Add GA/KA note..."
                        value={newGaNote}
                        onChange={(e) => setNewGaNote(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        onClick={async () => {
                          if (!project || !newGaNote.trim()) return
                          setAddingGaNote(true)
                          try {
                            const res = await apiFetch("/ga-notes", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                content: newGaNote.trim(),
                                project_id: project.id,
                                note_type: newGaNoteType,
                                priority: newGaNotePriority === "__none__" ? null : newGaNotePriority,
                              }),
                            })
                            if (!res?.ok) {
                              toast.error("Failed to add note")
                              return
                            }
                            const created = (await res.json()) as GaNote
                            setGaNotes((prev) => [...prev, created])
                            setNewGaNote("")
                            setNewGaNotePriority("__none__")
                          } finally {
                            setAddingGaNote(false)
                          }
                        }}
                        disabled={addingGaNote || !newGaNote.trim()}
                      >
                        {addingGaNote ? "Adding..." : "Add"}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {gaNotes.map((note) => {
                      const creator = userMap.get(note.created_by || "")?.full_name || userMap.get(note.created_by || "")?.username || "Unknown"
                      return (
                        <Card key={note.id} className="border border-amber-100 bg-amber-50/50">
                          <div className="p-3 flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="secondary">{note.note_type}</Badge>
                              <span>From {creator}</span>
                              <span>•</span>
                              <span>{note.created_at ? new Date(note.created_at).toLocaleString("sq-AL") : "-"}</span>
                              <Badge variant="outline" className="ml-auto">{note.priority || "Normal"}</Badge>
                              <Badge variant={note.status === "CLOSED" ? "secondary" : "outline"}>{note.status}</Badge>
                            </div>
                            <div className="text-sm whitespace-pre-wrap">{note.content}</div>
                          </div>
                        </Card>
                      )
                    })}
                    {gaNotes.length === 0 ? <div className="text-sm text-muted-foreground">No GA/KA notes yet.</div> : null}
                  </div>
                </div>
              </Card>
            ) : null}
          </>
        ) : mstPhase === "KONTROLLI" ? (
          <>
            <div className="border-b flex gap-6">
              <button className="relative pb-3 text-sm font-medium text-blue-600">
                Tasks (Detyrat)
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" />
              </button>
            </div>
            <Card className="border-0 shadow-sm">
              <div className="p-6 space-y-4">
                <div className="text-lg font-semibold tracking-tight">Kontrolli</div>
                {/* Table header */}
                <div className="grid grid-cols-12 gap-4 text-[11px] font-medium text-slate-400 uppercase tracking-wider pb-3">
                  <div className="col-span-3">Task</div>
                  <div className="col-span-1">Assigned</div>
                  <div className="col-span-2">Total</div>
                  <div className="col-span-2">Completed</div>
                  <div className="col-span-1">KO</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-1"></div>
                </div>
                {/* Inline form row */}
                <div className="grid grid-cols-12 gap-4 py-4 text-sm items-center bg-slate-50/60 -mx-6 px-6 border-y border-slate-100">
                  <div className="col-span-3">
                    <input
                      type="text"
                      placeholder="Enter task name..."
                      className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-blue-500 outline-none py-2 text-sm placeholder:text-slate-400 transition-colors"
                      value={controlTitle}
                      onChange={(e) => setControlTitle(e.target.value)}
                    />
                  </div>
                  <div className="col-span-1">
                    <Select value={controlAssignee} onValueChange={setControlAssignee}>
                      <SelectTrigger className="h-9 border-0 border-b-2 border-slate-200 rounded-none bg-transparent focus:border-blue-500 shadow-none">
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unassigned__">-</SelectItem>
                        {departmentUsers
                          .filter((u) => u.role !== "ADMIN")
                          .map((u) => (
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
                      className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-blue-500 outline-none py-2 text-sm placeholder:text-slate-400 transition-colors"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      placeholder="0"
                      className="w-full bg-transparent border-0 border-b-2 border-slate-200 focus:border-blue-500 outline-none py-2 text-sm placeholder:text-slate-400 transition-colors"
                    />
                  </div>
                  <div className="col-span-1 text-sm text-slate-400">
                    {(() => {
                      if (controlAssignee === "__unassigned__") return "-"
                      const assignedUser = departmentUsers.find((u) => u.id === controlAssignee)
                      const assignedName = assignedUser?.full_name?.toLowerCase() || ""
                      if (assignedName.includes("diellza")) return "Lea Murturi"
                      if (assignedName.includes("lea")) return "Diellza Veliu"
                      return "Elsa Ferati"
                    })()}
                  </div>
                  <div className="col-span-2">
                    <Button
                      size="sm"
                      className="rounded-full px-5 shadow-sm"
                      onClick={async () => {
                        if (!project || !controlTitle.trim()) return
                        setCreatingControlTask(true)
                        try {
                          const res = await apiFetch("/tasks", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              title: controlTitle.trim(),
                              project_id: project.id,
                              department_id: project.department_id,
                              assigned_to: controlAssignee === "__unassigned__" ? null : controlAssignee,
                              status: "IN_PROGRESS",
                              priority: "NORMAL",
                            }),
                          })
                          if (!res?.ok) {
                            toast.error("Failed to add task")
                            return
                          }
                          const created = (await res.json()) as Task
                          setTasks((prev) => [...prev, created])
                          setControlTitle("")
                          setControlAssignee("__unassigned__")
                          toast.success("Task added")
                        } finally {
                          setCreatingControlTask(false)
                        }
                      }}
                      disabled={creatingControlTask || !controlTitle.trim()}
                    >
                      {creatingControlTask ? "Saving..." : "Save"}
                    </Button>
                  </div>
                  <div className="col-span-1"></div>
                </div>
                {/* Task rows */}
                <div className="divide-y divide-slate-100">
                  {tasks.map((task) => {
                    const totalVal = parseInt(controlEdits[task.id]?.total || "0", 10) || 0
                    const assignedUser = allUsers.find((u) => u.id === task.assigned_to)
                    const assignedName = assignedUser?.full_name?.toLowerCase() || ""
                    const koName = !task.assigned_to ? "-" : assignedName.includes("diellza") ? "Lea Murturi" : assignedName.includes("lea") ? "Diellza Veliu" : "Elsa Ferati"
                    return (
                      <div key={task.id} className="grid grid-cols-12 gap-4 py-4 text-sm items-center hover:bg-slate-50/70 transition-colors group">
                        <div className="col-span-3 font-medium text-slate-700">{task.title}</div>
                        <div className="col-span-1 text-slate-500">{memberLabel(task.assigned_to)}</div>
                        <div className="col-span-2 text-slate-500">{controlEdits[task.id]?.total || "-"}</div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            min="0"
                            max={totalVal > 0 ? totalVal : undefined}
                            className="w-16 bg-transparent border-0 border-b-2 border-transparent focus:border-blue-500 hover:border-slate-300 outline-none py-1 text-sm transition-colors text-center"
                            value={controlEdits[task.id]?.completed || ""}
                            onChange={async (e) => {
                              let completedNum = parseInt(e.target.value, 10) || 0
                              // Cap at total value
                              if (totalVal > 0 && completedNum > totalVal) {
                                completedNum = totalVal
                              }
                              const newCompleted = completedNum.toString()
                              const shouldMarkDone = totalVal > 0 && completedNum >= totalVal
                              const newStatus = shouldMarkDone ? "DONE" : controlEdits[task.id]?.status || task.status

                              // Update local state immediately
                              setControlEdits((prev) => ({
                                ...prev,
                                [task.id]: { ...prev[task.id], completed: newCompleted, status: newStatus },
                              }))

                              // Update task on server
                              const res = await apiFetch(`/tasks/${task.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  internal_notes: `total_products=${controlEdits[task.id]?.total || 0}; completed_products=${newCompleted}`,
                                  status: newStatus,
                                }),
                              })
                              if (res?.ok) {
                                const updated = (await res.json()) as Task
                                setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
                                if (shouldMarkDone && task.status !== "DONE") {
                                  toast.success("Task marked as Done!")
                                }
                              }
                            }}
                          />
                        </div>
                        <div className="col-span-1 text-slate-500">{koName}</div>
                        <div className="col-span-2">
                          <Badge 
                            variant={task.status === "DONE" ? "default" : "outline"}
                            className={task.status === "DONE" ? "bg-emerald-500 hover:bg-emerald-600" : "text-slate-600 border-slate-300"}
                          >
                            {statusLabel(controlEdits[task.id]?.status || task.status)}
                          </Badge>
                        </div>
                        <div className="col-span-1 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50"
                            onClick={async () => {
                              const res = await apiFetch(`/tasks/${task.id}`, { method: "DELETE" })
                              if (!res?.ok) {
                                toast.error("Failed to delete task")
                                return
                              }
                              setTasks((prev) => prev.filter((t) => t.id !== task.id))
                              toast.success("Task deleted")
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                  {tasks.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-400">
                      No tasks yet. Add one above to get started.
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          </>
        ) : mstPhase === "FINALIZIMI" ? (
          <>
            <div className="border-b flex gap-6">
              <button className="relative pb-3 text-sm font-medium text-blue-600">
                Finalizimi
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" />
              </button>
            </div>
            <Card className="border-0 shadow-sm">
              <div className="p-6 space-y-6">
                <div className="text-lg font-semibold tracking-tight">Finalizimi - Checklist</div>
                <div className="space-y-4">
                  {[
                    { id: "kontrollat", question: "A jane kryer kontrollat?" },
                    { id: "files", question: "A eshte ruajtur projekti tek files?" },
                  ].map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 p-4 rounded-lg border border-slate-100 hover:bg-slate-50/70 transition-colors"
                    >
                      <Checkbox
                        id={item.id}
                        checked={Boolean(finalizationChecks[item.id])}
                        onCheckedChange={(checked) =>
                          setFinalizationChecks((prev) => ({ ...prev, [item.id]: Boolean(checked) }))
                        }
                      />
                      <label
                        htmlFor={item.id}
                        className={`text-sm font-medium cursor-pointer ${finalizationChecks[item.id] ? "text-slate-400 line-through" : "text-slate-700"}`}
                      >
                        {item.question}
                      </label>
                    </div>
                  ))}
                </div>
                {Object.values(finalizationChecks).filter(Boolean).length === 2 && (
                  <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="flex items-center gap-2 text-emerald-700 font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      Projekti eshte gati per mbyllje!
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </>
        ) : (
          <Card>
            <div className="p-4 space-y-3">
              <div className="text-lg font-semibold">{MST_PHASE_LABELS[mstPhase]}</div>
              <div className="text-sm text-muted-foreground">{project.description || "No description."}</div>
            </div>
          </Card>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button type="button" onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-foreground">&larr; Back to Projects</button>
          <div className="mt-3 text-3xl font-semibold">{title}</div>
          <div className="mt-3">
            <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">{PHASE_LABELS[phase] || "PCM"}</Badge>
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
          {activePhase !== phase ? <div className="mt-2 text-xs text-muted-foreground">View: {PHASE_LABELS[activePhase] || "PCM"}</div> : null}
        </div>
        <div className="flex items-center gap-2"><Button className="rounded-xl">Settings</Button></div>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" disabled={!canClosePhase || advancingPhase} onClick={() => void advancePhase()}>{advancingPhase ? "Closing..." : "Close Phase"}</Button>
      </div>

      <div className="border-b">
        <div className="flex flex-wrap gap-6">
          {visibleTabs.map((tab) => {
            const isActive = tab.id === activeTab
            return (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={["relative pb-3 text-sm font-medium", isActive ? "text-blue-600" : "text-muted-foreground"].join(" ")}>
                {tab.label}
                {isActive ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" /> : null}
              </button>
            )
          })}
        </div>
      </div>

      {/* Keep the rest of rendering logic similar to the source component; tabs will include Financials placeholder when active */}
    </div>
  )
}
