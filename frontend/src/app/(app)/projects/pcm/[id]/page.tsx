"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"

import { toast } from "sonner"
import { Check, Pencil, Trash2, Calendar, Users, FileText, Link2, MessageSquare, ListChecks, Lock, ChevronRight } from "lucide-react"

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
import { VsWorkflow } from "@/components/projects/vs-workflow"


// PCM phases (English labels)
const PHASES = ["MEETINGS", "PLANNING", "DEVELOPMENT", "TESTING", "DOCUMENTATION", "CLOSED"] as const
const PHASE_LABELS: Record<string, string> = {
  MEETINGS: "Meetings",
  PLANNING: "Planning",
  DEVELOPMENT: "Development",
  TESTING: "Testing",
  DOCUMENTATION: "Documentation",
  CLOSED: "Closed",
}

// MST-specific phases
const MST_PHASES = ["PLANNING", "PRODUCT", "CONTROL", "FINAL"] as const
const MST_PHASE_LABELS: Record<(typeof MST_PHASES)[number], string> = {
  PLANNING: "Planning",
  PRODUCT: "Product",
  CONTROL: "Control",
  FINAL: "Final",
}

const VS_VL_PHASES = ["PLANNING", "AMAZON", "CHECK", "DREAMROBOT"] as const
const VS_VL_PHASE_LABELS: Record<(typeof VS_VL_PHASES)[number], string> = {
  PLANNING: "Planning",
  AMAZON: "Amazon",
  CHECK: "Check",
  DREAMROBOT: "Dreamrobot",
}
const VS_VL_ACCEPTANCE_QUESTIONS = [
  "IS TEAMS GROUP OPENED?",
  "ARE TRELLO POINTS ADDED?",
  "IS CHATGPT PROJECT OPENED?",
]
const VS_VL_META_PREFIX = "VS_VL_META:"

const MST_PLANNING_QUESTIONS = [
  "Is the group opened in Teams?",
  "Is the project opened in Chat GPT?",
  "Have all necessary documents been received (PDF, Stammdaten, Artikelliste)?",
  "Has the category and PDF been analyzed?",
  "Have the program characteristics been identified?",
  "Is there a plan for when the project is expected to be completed?",
]
const MST_PROGRAM_QUESTION_LEGACY = "A eshte hapur projekti ne chat GPT?"
const FINALIZATION_PATH = "FINALIZATION"
const MST_EXCLUDED_PATHS = new Set(["PLANNING", FINALIZATION_PATH, "MEETINGS", "VS_VL_PLANNING"])
const FINALIZATION_CHECKLIST = [
  { id: "kontrollat", question: "A jane kryer kontrollat?" },
  { id: "files", question: "A eshte ruajtur projekti tek files?" },
]

// Helper function to initialize MST checklist items in database
async function initializeMstChecklistItems(
  projectId: string,
  existingItems: ChecklistItem[],
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>
) {
  // Create a map of existing items by path + title for quick lookup
  const existingMap = new Map<string, ChecklistItem>()
  existingItems.forEach((item) => {
    if (item.path && item.title) {
      const key = `${item.path}|${item.title}`
      existingMap.set(key, item)
    } else if (item.title && !item.path) {
      // For planning questions, use just title as key
      const key = `PLANNING|${item.title}`
      existingMap.set(key, item)
    }
  })

  // Find user IDs for "DV, LM" initials (we'll need to parse this)
  // For now, we'll create items without assignees and they can be added later

  // Create missing items from final checklist
  const finalItemsToCreate = MST_FINAL_CHECKLIST.filter((row) => {
    const key = `${row.path}|${row.detyrat}`
    return !existingMap.has(key)
  })

  const finalizationItemsToCreate = FINALIZATION_CHECKLIST.filter((entry) => {
    const key = `${FINALIZATION_PATH}|${entry.question}`
    return !existingMap.has(key)
  })

  // Create missing planning questions
  const planningItemsToCreate = MST_PLANNING_QUESTIONS.filter((question) => {
    const key = `PLANNING|${question}`
    return !existingMap.has(key)
  })

  // Combine all items to create
  const itemsToCreate = [
    ...finalItemsToCreate.map((row, index) => ({
      type: "final" as const,
      path: row.path,
      title: row.detyrat,
      keyword: row.keywords,
      description: row.pershkrimi,
      category: row.kategoria,
      position: index + 1,
    })),
    ...finalizationItemsToCreate.map((entry) => ({
      type: "finalization" as const,
      path: FINALIZATION_PATH,
      title: entry.question,
      keyword: FINALIZATION_PATH,
      description: entry.question,
      category: FINALIZATION_PATH,
    })),
    ...planningItemsToCreate.map((question) => ({
      type: "planning" as const,
      path: "PLANNING",
      title: question,
      keyword: "PLANNING",
      description: question,
      category: "PLANNING",
    })),
  ]

  // Create items in batches - ensure all are created
  const createPromises = itemsToCreate.map(async (item) => {
    try {
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          item_type: "CHECKBOX",
          path: item.path,
          title: item.title,
          keyword: item.keyword,
          description: item.description,
          category: item.category,
          is_checked: false,
          position: item.position,
        }),
      })
      if (!res.ok) {
        const errorText = await res.text().catch(() => "Unknown error")
        console.error(`Failed to create checklist item "${item.title}":`, errorText)
        return false
      }
      return true
    } catch (error) {
      console.error(`Failed to create checklist item "${item.title}":`, error)
      return false
    }
  })

  // Wait for all items to be created
  const results = await Promise.all(createPromises)
  const successCount = results.filter(Boolean).length
  const totalCount = itemsToCreate.length

  if (successCount < totalCount) {
    console.warn(`Only created ${successCount} out of ${totalCount} checklist items`)
  } else if (totalCount > 0) {
    console.log(`Successfully initialized ${successCount} checklist items`)
  }
}

async function initializeVsVlPlanningItems(
  projectId: string,
  existingItems: ChecklistItem[],
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>
) {
  const existingTitles = new Set(
    existingItems
      .filter((item) => item.item_type === "CHECKBOX" && item.path === "VS_VL_PLANNING")
      .map((item) => item.title || "")
      .filter(Boolean)
  )
  const itemsToCreate = VS_VL_ACCEPTANCE_QUESTIONS.filter((title) => !existingTitles.has(title))
  for (const [index, title] of itemsToCreate.entries()) {
    await apiFetch("/checklist-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        item_type: "CHECKBOX",
        position: index + 1,
        path: "VS_VL_PLANNING",
        keyword: "VS_VL_PLANNING",
        description: title,
        category: "VS_VL_PLANNING",
        title,
        is_checked: false,
      }),
    })
  }
}

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
  unlock_after_days?: number  // Days after dependency task's creation before this task is editable
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

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const
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

function initialsWithDots(src: string) {
  const raw = initials(src)
  if (!raw) return ""
  return raw.length === 1 ? raw : raw.split("").join(".")
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

function toDateInput(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(0, 10)
}

function formatDateDisplay(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
}

function isMstProject(project?: Project | null) {
  if (!project) return false
  const title = (project.title || project.name || "").toUpperCase().trim()
  const isTt = title === "TT" || title.startsWith("TT ") || title.startsWith("TT-")
  return title.includes("MST") || isTt
}
function mstBadgeLabel(project?: Project | null) {
  if (!project) return "MST"
  const title = (project.title || project.name || "").toUpperCase().trim()
  if (title === "TT" || title.startsWith("TT ") || title.startsWith("TT-")) {
    return "TT"
  }
  return "MST"
}
function isVsVlProject(project?: Project | null) {
  if (!project) return false
  const title = (project.title || project.name || "").toUpperCase()
  return title.includes("VS/VL") || isVsAmazonProject(project)
}
function isVsAmazonProject(project?: Project | null) {
  if (!project) return false
  const title = (project.title || project.name || "").toUpperCase()
  return title.includes("VS AMAZON") || title.includes("VS/VL AMAZON")
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

function parseTaskTotals(notes?: string | null) {
  if (!notes) return { total: 0, completed: 0 }
  const totalMatch = notes.match(/total_products[:=]\s*(\d+)/i)
  const completedMatch = notes.match(/completed_products[:=]\s*(\d+)/i)
  return {
    total: totalMatch ? parseInt(totalMatch[1], 10) : 0,
    completed: completedMatch ? parseInt(completedMatch[1], 10) : 0,
  }
}

function getOriginTaskId(notes?: string | null) {
  if (!notes) return null
  const match = notes.match(/origin_task_id[:=]\s*([a-f0-9-]+)/i)
  return match ? match[1] : null
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
  control: normalizeTaskTitle("KONTROLLIMI I PROD. EGZSISTUESE DHE POSTIMI NE AMAZON"),
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
  const mstCommentTimersRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({})
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
  const [mstPhase, setMstPhase] = React.useState<(typeof MST_PHASES)[number]>("PLANNING")
  const [vsVlPhase, setVsVlPhase] = React.useState<(typeof VS_VL_PHASES)[number]>("PLANNING")
  const [vsVlTab, setVsVlTab] = React.useState<"description" | "tasks" | "workflow" | "ga">("description")
  const [mstChecklistChecked, setMstChecklistChecked] = React.useState<Record<string, boolean>>({})
  const [mstChecklistComments, setMstChecklistComments] = React.useState<Record<string, string>>({})
  const [editingMstChecklistKey, setEditingMstChecklistKey] = React.useState<string | null>(null)
  const [editingMstChecklistRow, setEditingMstChecklistRow] = React.useState({
    path: "",
    detyrat: "",
    keywords: "",
    pershkrimi: "",
    kategoria: "",
  })
  const [newMstChecklistRow, setNewMstChecklistRow] = React.useState({
    path: "",
    detyrat: "",
    keywords: "",
    pershkrimi: "",
    kategoria: "",
  })
  const [savingMstChecklistRow, setSavingMstChecklistRow] = React.useState(false)
  const [viewingChecklistField, setViewingChecklistField] = React.useState<{ key: string; field: string; value: string; label: string } | null>(null)
  const [mstPlanningChecks, setMstPlanningChecks] = React.useState<Record<string, boolean>>({})
  const [descriptionChecks, setDescriptionChecks] = React.useState<Record<string, boolean>>({})
  const [planningComments, setPlanningComments] = React.useState<Record<string, string>>({})
  const [vsVlAcceptanceChecks, setVsVlAcceptanceChecks] = React.useState<Record<string, boolean>>({})
  const [vsVlPlanningItems, setVsVlPlanningItems] = React.useState<ChecklistItem[]>([])
  const [editingVsVlPlanningId, setEditingVsVlPlanningId] = React.useState<string | null>(null)
  const [editingVsVlPlanningText, setEditingVsVlPlanningText] = React.useState("")
  const [newVsVlPlanningText, setNewVsVlPlanningText] = React.useState("")
  const [savingVsVlPlanning, setSavingVsVlPlanning] = React.useState(false)
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
  const [vsVlChecklistEdits, setVsVlChecklistEdits] = React.useState<Record<string, string>>({})
  const [vsVlAssigneeOpen, setVsVlAssigneeOpen] = React.useState<Record<string, boolean>>({})
  const [vsVlEditMode, setVsVlEditMode] = React.useState<Record<string, boolean>>({})
  const [creatingVsVlTask, setCreatingVsVlTask] = React.useState(false)
  const [programName, setProgramName] = React.useState("")
  const [mstTab, setMstTab] = React.useState<"description" | "tasks" | "checklists" | "members" | "ga" | "final">(
    "description"
  )
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
  const [finalizationItems, setFinalizationItems] = React.useState<ChecklistItem[]>([])
  const [editingFinalizationId, setEditingFinalizationId] = React.useState<string | null>(null)
  const [editingFinalizationText, setEditingFinalizationText] = React.useState("")
  const [newFinalizationText, setNewFinalizationText] = React.useState("")
  const [savingFinalization, setSavingFinalization] = React.useState(false)
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
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null)
  const [editingTaskTitle, setEditingTaskTitle] = React.useState("")
  const [editingTaskAssignee, setEditingTaskAssignee] = React.useState<string>("__unassigned__")
  const [editingTaskTotal, setEditingTaskTotal] = React.useState("")
  const [editingTaskCompleted, setEditingTaskCompleted] = React.useState("")
  const [savingTaskEdit, setSavingTaskEdit] = React.useState(false)
  const mstChecklistScrollRef = React.useRef<HTMLDivElement | null>(null)
  const mstChecklistDragRef = React.useRef({
    active: false,
    startX: 0,
    startScrollLeft: 0,
  })

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
          if (isVsVlProject(p)) {
            const hasVsVlItems = items.some(
              (item) => item.item_type === "CHECKBOX" && item.path === "VS_VL_PLANNING"
            )
            if (!hasVsVlItems) {
              await initializeVsVlPlanningItems(p.id, items, apiFetch)
              const reloadRes = await apiFetch(`/checklist-items?project_id=${p.id}`)
              if (reloadRes.ok) {
                setChecklistItems((await reloadRes.json()) as ChecklistItem[])
              }
            }
          }

          // Initialize MST checklist items only if none exist yet
          if (isMstProject(p)) {
            const hasMstItems = items.some((item) => {
              if (item.item_type !== "CHECKBOX") return false
              if (!item.path || !item.title) return false
              return !MST_EXCLUDED_PATHS.has(item.path)
            })
            if (!hasMstItems) {
              await initializeMstChecklistItems(p.id, items, apiFetch)
              const reloadRes = await apiFetch(`/checklist-items?project_id=${p.id}`)
              if (reloadRes.ok) {
                setChecklistItems((await reloadRes.json()) as ChecklistItem[])
              }
            }
          }

          await initializeMeetingChecklistItems(p.id, items, apiFetch)
          const meetingReloadRes = await apiFetch(`/checklist-items?project_id=${p.id}`)
          if (meetingReloadRes.ok) {
            setChecklistItems((await meetingReloadRes.json()) as ChecklistItem[])
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

  // Initialize MST checklist checked state and comments from database
  React.useEffect(() => {
    if (!isMst || !project) return

    const mstChecklistItems = checklistItems.filter((item) => {
      if (item.item_type !== "CHECKBOX") return false
      if (!item.path || !item.title) return false
      return !MST_EXCLUDED_PATHS.has(item.path)
    })

    const checked: Record<string, boolean> = {}
    const comments: Record<string, string> = {}
    mstChecklistItems.forEach((item) => {
      if (item.path && item.title) {
        const key = `${item.path}|${item.title}`
        checked[key] = item.is_checked || false
        if (item.comment) comments[key] = item.comment
      }
    })
    setMstChecklistChecked(checked)
    setMstChecklistComments(comments)

    // Load planning questions from database
    const planningItems = checklistItems.filter((item) => {
      if (item.item_type !== "CHECKBOX") return false
      return item.path === "PLANNING" && MST_PLANNING_QUESTIONS.includes(item.title || "")
    })

    const planningChecked: Record<string, boolean> = {}
    const descriptionChecked: Record<string, boolean> = {}
    const planningCommentsData: Record<string, string> = {}
    planningItems.forEach((item) => {
      if (item.title) {
        planningChecked[item.title] = item.is_checked || false
        descriptionChecked[item.title] = item.is_checked || false

        // Load planning comments
        if (item.comment) {
          planningCommentsData[item.title] = item.comment
        }

        // Load program name from the second question's comment (supports legacy title)
        if (
          (item.title === MST_PLANNING_QUESTIONS[1] || item.title === MST_PROGRAM_QUESTION_LEGACY) &&
          item.comment
        ) {
          setProgramName(item.comment)
        }
      }
    })
    setMstPlanningChecks(planningChecked)
    setDescriptionChecks(descriptionChecked)
    setPlanningComments(planningCommentsData)

    const finalizationItemsFromDb = checklistItems.filter((item) => {
      return item.item_type === "CHECKBOX" && item.path === FINALIZATION_PATH
    })
    setFinalizationItems(finalizationItemsFromDb)
    
    if (finalizationItemsFromDb.length) {
      const finalizationData: Record<string, boolean> = {}
      finalizationItemsFromDb.forEach((item) => {
        // Use item ID as key for dynamic items
        finalizationData[item.id] = item.is_checked || false
      })
      setFinalizationChecks(finalizationData)
    }
  }, [checklistItems, isMst, project])

  // Load VS/VL acceptance questions from database (separate from MST)
  const isVsVlForEffect = React.useMemo(() => isVsVlProject(project), [project])
  React.useEffect(() => {
    if (!isVsVlForEffect || !project) return

    const vsVlAcceptanceItems = checklistItems.filter((item) => {
      return item.item_type === "CHECKBOX" && item.path === "VS_VL_PLANNING"
    })
    setVsVlPlanningItems(vsVlAcceptanceItems)
    const vsVlChecked: Record<string, boolean> = {}
    vsVlAcceptanceItems.forEach((item) => {
      if (item.title) {
        vsVlChecked[item.title] = item.is_checked || false
      }
    })
    setVsVlAcceptanceChecks(vsVlChecked)
  }, [checklistItems, isVsVlForEffect, project])

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
  const isVsVl = React.useMemo(() => isVsVlProject(project), [project])

  const vsVlTabs = React.useMemo(() => {
    const tabs =
      vsVlPhase === "PLANNING" ? [{ id: "description", label: "Description" }] : [{ id: "tasks", label: "Tasks" }]

    if (isVsAmazonProject(project) && vsVlPhase !== "PLANNING") {
      tabs.push({ id: "workflow", label: "Workflow" })
    }

    tabs.push({ id: "ga", label: "GA/KA Notes" })
    return tabs
  }, [vsVlPhase, project])
  const mstPhaseRef = React.useRef(mstPhase)
  const vsVlPhaseRef = React.useRef(vsVlPhase)

  React.useEffect(() => {
    if (!isMst) return
    if (mstPhaseRef.current === mstPhase) return
    mstPhaseRef.current = mstPhase
    if (mstPhase === "PLANNING") {
      setMstTab("description")
      return
    }
    if (mstPhase === "FINAL") {
      setMstTab("final")
      return
    }
    setMstTab("tasks")
  }, [isMst, mstPhase])

  React.useEffect(() => {
    if (!isVsVl) return
    if (vsVlPhaseRef.current === vsVlPhase) return
    vsVlPhaseRef.current = vsVlPhase
    setVsVlTab(vsVlPhase === "PLANNING" ? "description" : "tasks")
  }, [isVsVl, vsVlPhase])

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
    const kontrolTask = findVsVlTask(tasks, VS_VL_TASK_TITLES.control)
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

  const toggleTemplate = async () => {
    if (!project) return
    const newValue = !project.is_template
    try {
      const res = await apiFetch(`/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_template: newValue }),
      })
      if (!res.ok) {
        toast.error("Failed to update template status")
        return
      }
      const updated = (await res.json()) as Project
      setProject(updated)
      toast.success(newValue ? "Marked as template" : "Unmarked as template")
    } catch {
      toast.error("Failed to update template status")
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
    const currentPhase = project.current_phase || "INICIMI"
    const isMeetingPhase = currentPhase === "INICIMI"
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
      if (openTasks.length) blockers.push(`${openTasks.length} open tasks`)
      if (uncheckedItems.length) blockers.push(`${uncheckedItems.length} checklist items`)
      if (uncheckedMeeting.length) blockers.push(`${uncheckedMeeting.length} meeting checklist items`)
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
      toast.error(typeof detail === "string" ? detail : Array.isArray(detail) ? (detail as any[]).map((e: any) => e.msg || String(e)).join(", ") : "An error occurred")
      return
    }
    const updated = (await res.json()) as GaNote
    setGaNotes((prev) => prev.map((note) => (note.id === updated.id ? updated : note)))
  }

  const phaseValue = viewedPhase || project?.current_phase || "MEETINGS"
  const visibleTabs = React.useMemo(() => {
    // PCM: meetings phase shows meeting tabs + GA
    if (phaseValue === "MEETINGS") {
      return [...MEETING_TABS, ...TABS.filter((tab) => tab.id === "ga")]
    }
    // planning: show description/tasks/financials
    if (phaseValue === "PLANNING") {
      return TABS.filter((tab) => tab.id !== "checklists" && tab.id !== "members")
    }
    // execution: tasks, members, ga, financials
    if (phaseValue === "DEVELOPMENT") {
      return TABS.filter((tab) => tab.id === "tasks" || tab.id === "members" || tab.id === "ga" || tab.id === "financials")
    }
    // monitoring: show most tabs
    if (phaseValue === "TESTING") {
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

  React.useEffect(() => {
    if (!project || mstPhase !== "CONTROL") return
    const productTasks = tasks.filter((task) => (task.phase ?? "PRODUCT") === "PRODUCT")
    const controlTasks = tasks.filter((task) => task.phase === "CONTROL")
    const existingOrigins = new Set(controlTasks.map((task) => getOriginTaskId(task.internal_notes)).filter(Boolean))
    const findUserIdByName = (needle: string) =>
      allUsers.find((u) => (u.full_name || u.username || "").toLowerCase().includes(needle))?.id || null
    const getKoAssigneeId = (assignedTo?: string | null) => {
      if (!assignedTo) return null
      const assignedUser = allUsers.find((u) => u.id === assignedTo)
      const assignedName = (assignedUser?.full_name || assignedUser?.username || "").toLowerCase()
      if (assignedName.includes("diellza")) return findUserIdByName("lea")
      if (assignedName.includes("lea")) return findUserIdByName("diellza")
      return findUserIdByName("elsa")
    }
    const createMissing = async () => {
      for (const task of productTasks) {
        if (existingOrigins.has(task.id)) continue
        const totals = parseTaskTotals(task.internal_notes)
        const koAssigneeId = getKoAssigneeId(task.assigned_to)
        const res = await apiFetch("/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: task.title,
            project_id: project.id,
            department_id: project.department_id,
            assigned_to: koAssigneeId,
            status: "TODO",
            priority: task.priority || "NORMAL",
            phase: "CONTROL",
            internal_notes: `origin_task_id=${task.id}; total_products=${totals.total || 0}; completed_products=0`,
          }),
        })
        if (res?.ok) {
          const created = (await res.json()) as Task
          setTasks((prev) => [...prev, created])
        }
      }
    }
    void createMissing()
  }, [allUsers, apiFetch, mstPhase, project, tasks])

  const activePhase = phaseValue
  const visibleTasks = React.useMemo(
    () =>
      tasks.filter((task) => {
        const taskPhase = task.phase || project?.current_phase || "MEETINGS"
        return taskPhase === activePhase
      }),
    [activePhase, project?.current_phase, tasks]
  )
  const assignableUsers = React.useMemo(() => allUsers.filter((u) => u.role !== "ADMIN"), [allUsers])

  if (!project) return <div className="text-sm text-muted-foreground">Loading...</div>

  const title = project.title || project.name || "Project"
  const phase = project.current_phase || "MEETINGS"
  const phaseIndex = PHASES.indexOf(phase as (typeof PHASES)[number])
  const canClosePhase = phase !== "CLOSED"
  const userMap = new Map([...allUsers, ...members, ...(user ? [user] : [])].map((m) => [m.id, m]))

  const renderGaNotes = () => (
    <div className="space-y-4">
      <Card className="bg-white/90 backdrop-blur-sm border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <div className="p-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={newGaNoteType} onValueChange={(value) => setNewGaNoteType(value as "GA" | "KA")}>
              <SelectTrigger className="w-28 border-slate-200 focus:border-slate-400 rounded-xl">
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
              <SelectTrigger className="w-40 border-slate-200 focus:border-slate-400 rounded-xl">
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
              className="border-slate-200 focus:border-slate-400 rounded-xl"
            />
            <Button
              variant="outline"
              disabled={!newGaNote.trim() || addingGaNote}
              onClick={() => void submitGaNote()}
              className="bg-slate-900 hover:bg-slate-800 text-white border-0 rounded-xl"
            >
              {addingGaNote ? "Adding..." : "Add"}
            </Button>
          </div>
        </div>
      </Card>
      {gaNotes.length ? (
        gaNotes.map((note) => (
          <Card key={note.id} className="bg-white/90 backdrop-blur-sm border-slate-100 shadow-sm rounded-2xl overflow-hidden p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Badge className={note.note_type === "KA" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-sky-100 text-sky-700 border-sky-200"}>
                  {note.note_type || "GA"}
                </Badge>
                <span>
                  From {userMap.get(note.created_by || "")?.full_name || userMap.get(note.created_by || "")?.username || "-"}
                </span>
                <span>- {formatDateTime(note.created_at)}</span>
                {note.priority ? (
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200">{statusLabel(note.priority)}</Badge>
                ) : null}
              </div>
              {note.status !== "CLOSED" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void closeGaNote(note.id)}
                  className="rounded-xl border-slate-200 hover:bg-slate-50"
                >
                  Close
                </Button>
              ) : (
                <Badge className="bg-slate-100 text-slate-600 border-slate-200">Closed</Badge>
              )}
            </div>
            <div className="mt-3 text-sm text-slate-700 whitespace-pre-wrap">{note.content}</div>
          </Card>
        ))
      ) : (
        <div className="text-sm text-slate-500 text-center py-6">No GA/KA notes yet.</div>
      )}
    </div>
  )

  if (isVsVl) {
    const memberLabel = (id?: string | null) => {
      if (!id) return "-"
      const u = userMap.get(id)
      const label = u?.full_name || u?.username || u?.email || "-"
      return label === "-" ? "-" : initialsWithDots(label)
    }
    const taskAssigneeIds = (task: Task) => {
      const ids = task.assignees?.map((a) => a.id) || []
      if (ids.length) return ids
      if (task.assigned_to) return [task.assigned_to]
      return []
    }
    const vsVlTasks = tasks.filter((task) => {
      const meta = parseVsVlMeta(task.internal_notes)
      if (!meta?.vs_vl_phase) {
        return vsVlPhase === "AMAZON"
      }
      return meta.vs_vl_phase === vsVlPhase
    })
    const phaseOrder =
      vsVlPhase === "AMAZON"
        ? [
          VS_VL_TASK_TITLES.base,
          VS_VL_TASK_TITLES.template,
          VS_VL_TASK_TITLES.prices,
          VS_VL_TASK_TITLES.photos,
          VS_VL_TASK_TITLES.control,
        ]
        : vsVlPhase === "CHECK"
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

    const patchTask = async (taskId: string, payload: Record<string, unknown>, errorMessage: string) => {
      const res = await apiFetch(`/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        toast.error(errorMessage)
        return null
      }
      const updated = (await res.json()) as Task
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      return updated
    }
    const updateVsVlMeta = async (task: Task, updates: Partial<VsVlTaskMeta>) => {
      const current = parseVsVlMeta(task.internal_notes) || {}
      const nextMeta: VsVlTaskMeta = {
        ...current,
        ...updates,
        vs_vl_phase: current.vs_vl_phase || vsVlPhase,
      }
      if (!nextMeta.comment) delete nextMeta.comment
      if (!nextMeta.checklist) delete nextMeta.checklist
      if (!nextMeta.unlock_after_days) delete nextMeta.unlock_after_days
      const res = await apiFetch(`/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internal_notes: serializeVsVlMeta(nextMeta) }),
      })
      if (!res.ok) {
        toast.error("Failed to update task")
        return null
      }
      const updated = (await res.json()) as Task
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      return updated
    }

    // VS/VL acceptance checklist items map
    const vsVlAcceptanceItemMap = new Map<string, ChecklistItem>()
    checklistItems
      .filter((item) => item.item_type === "CHECKBOX" && item.path === "VS_VL_PLANNING")
      .forEach((item) => {
        if (item.title) vsVlAcceptanceItemMap.set(item.title, item)
      })

    const toggleVsVlAcceptance = async (q: string) => {
      const newChecked = !vsVlAcceptanceChecks[q]
      // Optimistically update UI
      setVsVlAcceptanceChecks((prev) => ({ ...prev, [q]: newChecked }))

      let item = vsVlAcceptanceItemMap.get(q)

      // Create item if it doesn't exist
      if (!item && project) {
        try {
          const createRes = await apiFetch("/checklist-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: project.id,
              item_type: "CHECKBOX",
              path: "VS_VL_PLANNING",
              title: q,
              keyword: "VS_VL_PLANNING",
              description: q,
              category: "VS_VL_PLANNING",
              is_checked: newChecked,
            }),
          })

          if (createRes.ok) {
            const created = (await createRes.json()) as ChecklistItem
            item = created
            setChecklistItems((prev) => [...prev, created])
            vsVlAcceptanceItemMap.set(q, created)
          }
        } catch (error) {
          console.error("Failed to create VS/VL acceptance item:", error)
        }
      }

      if (item) {
        // Update in background
        try {
          await apiFetch(`/checklist-items/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_checked: newChecked }),
          })
        } catch (error) {
          // Silently handle errors
        }
      }
    }

    const toggleVsVlAcceptanceById = async (itemId: string, nextChecked: boolean) => {
      const item = vsVlPlanningItems.find((i) => i.id === itemId)
      if (!item) return

      const previousValue = item.is_checked || false
      setVsVlAcceptanceChecks((prev) => ({ ...prev, [item.title || ""]: nextChecked }))
      setVsVlPlanningItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, is_checked: nextChecked } : i)))
      setChecklistItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, is_checked: nextChecked } : i)))
      
      try {
        const res = await apiFetch(`/checklist-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_checked: nextChecked }),
        })
        if (!res.ok) {
          toast.error("Failed to save checklist")
          setVsVlAcceptanceChecks((prev) => ({ ...prev, [item.title || ""]: previousValue }))
          setVsVlPlanningItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, is_checked: previousValue } : i)))
          setChecklistItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, is_checked: previousValue } : i)))
        } else {
          const updated = (await res.json()) as ChecklistItem
          setChecklistItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
          setVsVlPlanningItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
        }
      } catch {
        toast.error("Failed to save checklist")
        setVsVlAcceptanceChecks((prev) => ({ ...prev, [item.title || ""]: previousValue }))
        setVsVlPlanningItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, is_checked: previousValue } : i)))
        setChecklistItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, is_checked: previousValue } : i)))
      }
    }

    const addVsVlPlanningItem = async () => {
      if (!project || !newVsVlPlanningText.trim()) return
      setSavingVsVlPlanning(true)
      try {
        const position = vsVlPlanningItems.length > 0
          ? Math.max(...vsVlPlanningItems.map((item) => item.position ?? 0)) + 1
          : 1
        
        const res = await apiFetch("/checklist-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: project.id,
            item_type: "CHECKBOX",
            path: "VS_VL_PLANNING",
            title: newVsVlPlanningText.trim(),
            keyword: "VS_VL_PLANNING",
            description: newVsVlPlanningText.trim(),
            category: "VS_VL_PLANNING",
            is_checked: false,
            position,
          }),
        })
        if (!res.ok) {
          toast.error("Failed to add checklist item")
          return
        }
        const created = (await res.json()) as ChecklistItem
        setChecklistItems((prev) => [...prev, created])
        setVsVlPlanningItems((prev) => [...prev, created])
        setVsVlAcceptanceChecks((prev) => ({ ...prev, [created.title || ""]: false }))
        setNewVsVlPlanningText("")
        toast.success("Checklist item added")
      } catch {
        toast.error("Failed to add checklist item")
      } finally {
        setSavingVsVlPlanning(false)
      }
    }

    const startEditVsVlPlanningItem = (itemId: string) => {
      const item = vsVlPlanningItems.find((i) => i.id === itemId)
      if (!item) return
      setEditingVsVlPlanningId(itemId)
      setEditingVsVlPlanningText(item.title || "")
    }

    const cancelEditVsVlPlanningItem = () => {
      setEditingVsVlPlanningId(null)
      setEditingVsVlPlanningText("")
    }

    const saveVsVlPlanningItem = async () => {
      if (!editingVsVlPlanningId || !editingVsVlPlanningText.trim()) return
      setSavingVsVlPlanning(true)
      try {
        const res = await apiFetch(`/checklist-items/${editingVsVlPlanningId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: editingVsVlPlanningText.trim() }),
        })
        if (!res.ok) {
          toast.error("Failed to update checklist item")
          return
        }
        const updated = (await res.json()) as ChecklistItem
        setChecklistItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
        setVsVlPlanningItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
        const oldTitle = vsVlPlanningItems.find((i) => i.id === editingVsVlPlanningId)?.title || ""
        if (oldTitle && oldTitle !== updated.title) {
          setVsVlAcceptanceChecks((prev) => {
            const next = { ...prev }
            delete next[oldTitle]
            if (updated.title) next[updated.title] = updated.is_checked || false
            return next
          })
        }
        cancelEditVsVlPlanningItem()
        toast.success("Checklist item updated")
      } catch {
        toast.error("Failed to update checklist item")
      } finally {
        setSavingVsVlPlanning(false)
      }
    }

    const deleteVsVlPlanningItem = async (itemId: string) => {
      const item = vsVlPlanningItems.find((i) => i.id === itemId)
      if (!item) return
      
      const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Failed to delete checklist item")
        return
      }
      setChecklistItems((prev) => prev.filter((i) => i.id !== itemId))
      setVsVlPlanningItems((prev) => prev.filter((i) => i.id !== itemId))
      if (item.title) {
        setVsVlAcceptanceChecks((prev) => {
          const next = { ...prev }
          delete next[item.title!]
          return next
        })
      }
      toast.success("Checklist item deleted")
    }

    return (
      <div className="space-y-5 max-w-6xl mx-auto px-4">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button type="button" onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-foreground">
              &larr; Back to Projects
            </button>
            <div className="flex items-center gap-3">
            {project?.start_date ? (
              <div className="text-xs text-slate-500">
                Started: {new Date(project.start_date).toLocaleDateString()}
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={async () => {
                  if (!project) return
                  const res = await apiFetch(`/projects/${project.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ start_date: new Date().toISOString() }),
                  })
                  if (res.ok) {
                    const updated = (await res.json()) as Project
                    setProject(updated)
                    toast.success("Project started!")
                  } else {
                    toast.error("Failed to start project")
                  }
                }}
              >
                Start Project
              </Button>
            )}
            {user?.role === "ADMIN" && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={project?.is_template ?? false}
                  onCheckedChange={() => void toggleTemplate()}
                />
                <span className="text-muted-foreground">Template</span>
              </label>
            )}
            <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
              VS/VL
            </Badge>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-semibold">{title}</span>
              {project?.is_template && (
                <Badge variant="secondary" className="text-amber-700 border-amber-300 bg-amber-50">Template</Badge>
              )}
            </div>
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
        </div>

        <div className="border-b flex gap-6">
          {vsVlTabs.map((tab) => {
            const isActive = vsVlTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setVsVlTab(tab.id as typeof vsVlTab)}
                className={[
                  "relative pb-3 text-sm font-medium",
                  tab.id === "ga" ? "ml-auto" : "",
                  isActive ? "text-blue-600" : "text-muted-foreground",
                ].join(" ")}
              >
                {tab.label}
                {isActive ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" /> : null}
              </button>
            )
          })}
        </div>

        {vsVlTab === "ga" ? (
          renderGaNotes()
        ) : vsVlTab === "workflow" ? (
          <VsWorkflow projectId={projectId} apiFetch={apiFetch} phase={vsVlPhase} />
        ) : vsVlPhase === "PLANNING" ? (

          <Card>
            <div className="p-4 space-y-4">
              <div className="text-lg font-semibold">Planning</div>
              
              {/* Add new item */}
              <div className="flex items-center gap-2 mb-4">
                <Input
                  placeholder="Add checklist item..."
                  value={newVsVlPlanningText}
                  onChange={(e) => setNewVsVlPlanningText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !savingVsVlPlanning) {
                      void addVsVlPlanningItem()
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={() => void addVsVlPlanningItem()}
                  disabled={!newVsVlPlanningText.trim() || savingVsVlPlanning}
                  size="sm"
                >
                  {savingVsVlPlanning ? "Adding..." : "Add"}
                </Button>
              </div>

              <div className="grid gap-3">
                {vsVlPlanningItems
                  .slice()
                  .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                  .map((item, index) => {
                    const isEditing = editingVsVlPlanningId === item.id
                    return (
                      <div key={item.id} className="flex items-center gap-3 group">
                        <span className="text-xs font-semibold text-slate-400">{index + 1}.</span>
                        <Checkbox
                          checked={Boolean(vsVlAcceptanceChecks[item.title || ""])}
                          onCheckedChange={(checked) =>
                            void toggleVsVlAcceptanceById(item.id, Boolean(checked))
                          }
                          className="h-5 w-5 border-2 border-slate-400 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                        />
                        <div className="flex-1">
                          {isEditing ? (
                            <Input
                              value={editingVsVlPlanningText}
                              onChange={(e) => setEditingVsVlPlanningText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !savingVsVlPlanning) {
                                  void saveVsVlPlanningItem()
                                } else if (e.key === "Escape") {
                                  cancelEditVsVlPlanningItem()
                                }
                              }}
                              className="border-blue-500"
                              autoFocus
                            />
                          ) : (
                            <span className="text-sm font-semibold uppercase tracking-wide">{item.title}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isEditing ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void saveVsVlPlanningItem()}
                                disabled={savingVsVlPlanning}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={cancelEditVsVlPlanningItem}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEditVsVlPlanningItem(item.id)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void deleteVsVlPlanningItem(item.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                {vsVlPlanningItems.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No checklist items yet. Add one above.
                  </div>
                )}
              </div>
            </div>
          </Card>
        ) : (
                    <Card className="border-0 shadow-sm">
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-base font-semibold">{VS_VL_PHASE_LABELS[vsVlPhase]} Tasks</div>
                <Badge variant="outline" className="text-xs text-slate-600 border-slate-200 bg-white">
                  {VS_VL_PHASE_LABELS[vsVlPhase]}
                </Badge>
              </div>
              
              {/* Compact Add Task Form */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={vsVlTaskTitle}
                    onChange={(e) => setVsVlTaskTitle(e.target.value)}
                    placeholder="Task title..."
                    className="h-8 text-sm flex-1 min-w-[200px]"
                  />
                  <Select value={vsVlTaskPriority} onValueChange={(v) => setVsVlTaskPriority(v as TaskPriority)}>
                    <SelectTrigger className="h-8 w-[100px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NORMAL">NORMAL</SelectItem>
                      <SelectItem value="HIGH">I LARTE</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={vsVlTaskStatus || "TODO"} onValueChange={(v) => setVsVlTaskStatus(v as Task["status"])}>
                    <SelectTrigger className="h-8 w-[100px] text-xs">
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
                  <Button
                    size="sm"
                    className="h-8 px-3 text-xs"
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
                            phase: vsVlPhase,
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
                    {creatingVsVlTask ? "..." : "Add"}
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                {orderedVsVlTasks.length ? (
                  orderedVsVlTasks.map((task, index) => {
                    const meta = parseVsVlMeta(task.internal_notes)
                    const titleKey = normalizeTaskTitle(task.title)
                    const isBaseTask = titleKey === VS_VL_TASK_TITLES.base
                    const dependencyId = isBaseTask
                      ? null
                      : task.dependency_task_id || meta?.dependency_task_id || null
                    const dependencyStatus = dependencyId ? taskStatusById.get(dependencyId) : null
                    const dependencyTask = dependencyId ? tasks.find((t) => t.id === dependencyId) : null
                    
                    // Calculate lock status based on unlock_after_days from PROJECT start date
                    let isTimeLocked = false
                    let daysRemaining = 0
                    let unlockDateDisplay: Date | null = null
                    
                    // Helper to add business days (skip weekends)
                    const addBusinessDays = (start: Date, days: number): Date => {
                      const result = new Date(start)
                      let addedDays = 0
                      while (addedDays < days) {
                        result.setDate(result.getDate() + 1)
                        const dayOfWeek = result.getDay()
                        // Skip Saturday (6) and Sunday (0)
                        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                          addedDays++
                        }
                      }
                      // If result lands on weekend, move to Monday
                      while (result.getDay() === 0 || result.getDay() === 6) {
                        result.setDate(result.getDate() + 1)
                      }
                      return result
                    }
                    
                    // Time-based lock: task unlocks X business days after project start
                    if (meta?.unlock_after_days !== undefined && meta.unlock_after_days > 0 && project) {
                      const projectStart = new Date(project.start_date || project.created_at || Date.now())
                      const unlockDate = addBusinessDays(projectStart, meta.unlock_after_days)
                      unlockDateDisplay = unlockDate
                      const now = new Date()
                      // Reset time to start of day for comparison
                      now.setHours(0, 0, 0, 0)
                      unlockDate.setHours(0, 0, 0, 0)
                      isTimeLocked = now < unlockDate
                      if (isTimeLocked) {
                        // Calculate business days remaining
                        let remaining = 0
                        const temp = new Date(now)
                        while (temp < unlockDate) {
                          temp.setDate(temp.getDate() + 1)
                          if (temp.getDay() !== 0 && temp.getDay() !== 6) {
                            remaining++
                          }
                        }
                        daysRemaining = remaining
                      }
                    }
                    
                    // Dependency-based lock: locked until dependency is DONE
                    const isDependencyNotDone = Boolean(dependencyId && dependencyStatus !== "DONE")
                    
                    // Combined lock: if has unlock_after_days, must ALSO have dependency done (if exists)
                    // If no unlock_after_days, just check dependency
                    const isLocked = isTimeLocked || isDependencyNotDone
                    const selectedAssignees = taskAssigneeIds(task)
                    const commentValue = vsVlCommentEdits[task.id] ?? meta?.comment ?? ""
                    const checklistValue = vsVlChecklistEdits[task.id] ?? meta?.checklist ?? ""
                    const isEditing = Boolean(vsVlEditMode[task.id])
                    return (
                      <div 
                        key={task.id} 
                        className={`rounded-lg border bg-white transition-shadow hover:shadow-sm ${
                          isLocked 
                            ? "border-amber-200 bg-amber-50/20" 
                            : "border-slate-200"
                        }`}
                      >
                        {/* Main Row - Compact */}
                        <div className="p-2.5 flex items-center gap-2">
                          {isLocked && (
                            <div 
                              className="flex items-center gap-1 flex-shrink-0" 
                              title={
                                isTimeLocked && isDependencyNotDone
                                  ? `Locked: ${daysRemaining}d remaining + waiting for "${dependencyTask?.title || 'dependency'}"`
                                  : isTimeLocked
                                    ? `Unlocks in ${daysRemaining} business day(s)`
                                    : `Waiting for "${dependencyTask?.title || 'dependency'}" to complete`
                              }
                            >
                              <Lock className="h-3.5 w-3.5 text-amber-600" />
                              {daysRemaining > 0 && (
                                <span className="text-xs text-amber-600 font-medium">{daysRemaining}d</span>
                              )}
                              {!isTimeLocked && isDependencyNotDone && (
                                <span className="text-xs text-amber-600">dep</span>
                              )}
                            </div>
                          )}
                          <span className="text-xs font-semibold text-slate-400 flex-shrink-0">{index + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <Input
                              key={`title-${task.id}-${task.updated_at}`}
                              defaultValue={task.title}
                              onBlur={(e) => {
                                const nextValue = e.target.value.trim()
                                if (!nextValue || nextValue === task.title) return
                                void patchTask(task.id, { title: nextValue }, "Failed to update title")
                              }}
                              className={`h-auto text-sm font-semibold px-0 border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-slate-300 ${
                                !isEditing ? "text-slate-700" : "text-slate-900"
                              }`}
                              readOnly={!isEditing}
                              disabled={isLocked || !isEditing}
                            />
                          </div>
                          <Badge
                            className={`text-[10px] px-1.5 py-0 h-5 flex-shrink-0 ${
                              task.priority === "HIGH"
                                ? "bg-rose-500 text-white"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {vsVlPriorityLabel(task.priority)}
                          </Badge>
                          <Select
                            value={task.status || "TODO"}
                            onValueChange={(value) => {
                              if (isLocked) return
                              void patchTask(task.id, { status: value }, "Failed to update status")
                            }}
                            disabled={isLocked}
                          >
                            <SelectTrigger className="h-7 min-w-[90px] text-xs px-2 flex-shrink-0">
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
                          {task.due_date && (
                            <div className="flex items-center gap-0.5 text-[10px] text-slate-500 flex-shrink-0" title="Due date">
                              <Calendar className="h-3 w-3" />
                              <span>{formatDateDisplay(task.due_date)}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {selectedAssignees.slice(0, 3).map((id, idx) => {
                              const user = userMap.get(id)
                              const label = user?.full_name || user?.username || user?.email || "-"
                              const colorClass = [
                                "bg-blue-500 text-white",
                                "bg-emerald-500 text-white",
                                "bg-amber-500 text-white",
                                "bg-rose-500 text-white",
                                "bg-purple-500 text-white",
                              ][idx % 5]
                              return (
                                <div
                                  key={id}
                                  className={`h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-semibold ring-1 ring-slate-200 ${colorClass}`}
                                  title={label}
                                >
                                  {initials(label)}
                                </div>
                              )
                            })}
                            {selectedAssignees.length > 3 && (
                              <span className="text-[10px] text-slate-500">+{selectedAssignees.length - 3}</span>
                            )}
                            {selectedAssignees.length === 0 && (
                              <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center" title="Unassigned">
                                <Users className="h-3 w-3 text-slate-400" />
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 flex-shrink-0"
                            onClick={() =>
                              setVsVlEditMode((prev) => ({ ...prev, [task.id]: !prev[task.id] }))
                            }
                            aria-label={isEditing ? "Done editing" : "Edit task"}
                            title={isEditing ? "Done" : "Edit"}
                          >
                            {isEditing ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Pencil className="h-3 w-3 text-slate-600" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-red-600 hover:bg-red-50 flex-shrink-0"
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
                            aria-label="Delete task"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>

                        {/* Expandable Details - Only when editing */}
                        {isEditing && (
                          <div className="border-t border-slate-100 p-2.5 space-y-2 bg-slate-50/30">
                            <div className="grid gap-2 md:grid-cols-[2fr_1fr]">
                              <div>
                                <Label className="text-[10px] font-medium text-slate-600 mb-1 block">Description</Label>
                                <Textarea
                                  key={`description-${task.id}-${task.updated_at}`}
                                  defaultValue={task.description || ""}
                                  onBlur={(e) => {
                                    const nextValue = e.target.value.trim()
                                    const currentValue = task.description || ""
                                    if (nextValue === currentValue) return
                                    void patchTask(task.id, { description: nextValue || null }, "Failed to update description")
                                  }}
                                  rows={2}
                                  className="text-xs border-slate-300 bg-white resize-none h-auto"
                                  placeholder="Description..."
                                />
                              </div>
                              <div className="space-y-2">
                                <div>
                                  <Label className="text-[10px] font-medium text-slate-600 mb-1 block">Due date</Label>
                                  <Input
                                    value={toDateInput(task.due_date)}
                                    onChange={(e) => {
                                      if (isLocked) return
                                      const nextValue = normalizeDueDateInput(e.target.value)
                                      const dueDate = nextValue ? new Date(nextValue).toISOString() : null
                                      void patchTask(task.id, { due_date: dueDate }, "Failed to update date")
                                    }}
                                    type="date"
                                    className="h-7 text-xs border-slate-300 bg-white"
                                    disabled={isLocked}
                                  />
                                </div>
                                <div>
                                  <Label className="text-[10px] font-medium text-slate-600 mb-1 block">Dependency</Label>
                                  <Select
                                    value={
                                      isBaseTask ? "__none__" : task.dependency_task_id || meta?.dependency_task_id || "__none__"
                                    }
                                    onValueChange={(value) => {
                                      void patchTask(
                                        task.id,
                                        { dependency_task_id: value === "__none__" ? null : value },
                                        "Failed to update dependency"
                                      )
                                    }}
                                    disabled={isBaseTask}
                                  >
                                    <SelectTrigger className="h-7 text-xs border-slate-300 bg-white">
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
                                </div>
                                <div>
                                  <Label className="text-[10px] font-medium text-slate-600 mb-1 block">Unlock on day</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    placeholder="0"
                                    defaultValue={meta?.unlock_after_days || ""}
                                    className="h-7 text-xs border-slate-300 bg-white w-20"
                                    disabled={isBaseTask}
                                    onBlur={(e) => {
                                      const value = parseInt(e.target.value, 10)
                                      const newValue = isNaN(value) || value <= 0 ? undefined : value
                                      if (newValue === meta?.unlock_after_days) return
                                      void updateVsVlMeta(task, { unlock_after_days: newValue })
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <Label className="text-[10px] font-medium text-slate-700">Assignees</Label>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-[10px] h-5 px-2"
                                onClick={() =>
                                  setVsVlAssigneeOpen((prev) => ({ ...prev, [task.id]: !prev[task.id] }))
                                }
                                disabled={isLocked}
                              >
                                {vsVlAssigneeOpen[task.id] ? "Hide" : "Manage"}
                              </Button>
                            </div>
                            {vsVlAssigneeOpen[task.id] && (
                              <div className="rounded border border-slate-200 bg-white p-1.5 space-y-1 max-h-32 overflow-y-auto">
                                {assignableUsers.length ? (
                                  assignableUsers.map((u) => {
                                    const checked = selectedAssignees.includes(u.id)
                                    return (
                                      <label
                                        key={u.id}
                                        className="flex items-center gap-1.5 p-1 rounded hover:bg-slate-50 transition-colors cursor-pointer"
                                      >
                                        <Checkbox
                                          checked={checked}
                                          disabled={isLocked}
                                          onCheckedChange={() => {
                                            if (isLocked) return
                                            const nextIds = checked
                                              ? selectedAssignees.filter((id) => id !== u.id)
                                              : [...selectedAssignees, u.id]
                                            void patchTask(task.id, { assignees: nextIds }, "Failed to update assignees")
                                          }}
                                          className="h-3.5 w-3.5"
                                        />
                                        <span className="text-[10px] text-slate-700 flex-1">
                                          {u.full_name || u.username || u.email}
                                        </span>
                                      </label>
                                    )
                                  })
                                ) : (
                                  <div className="text-[10px] text-slate-400 text-center py-1">No users available</div>
                                )}
                              </div>
                            )}
                            <div className="grid gap-2 md:grid-cols-2">
                              <div>
                                <Label className="text-[10px] font-medium text-slate-600 mb-1 block">Comment</Label>
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
                                    const checklist = (vsVlChecklistEdits[task.id] ?? meta?.checklist ?? "").trim()
                                    const updated = await updateVsVlMeta(task, {
                                      comment: nextValue || undefined,
                                      checklist: checklist || undefined,
                                    })
                                    if (updated) {
                                      setVsVlCommentEdits((prev) => ({ ...prev, [task.id]: nextValue }))
                                    }
                                  }}
                                  placeholder="Koment..."
                                  rows={2}
                                  className="text-xs border-slate-300 bg-white resize-none"
                                />
                              </div>
                              <div>
                                <Label className="text-[10px] font-medium text-slate-600 mb-1 block">Checklist</Label>
                                <Textarea
                                  value={checklistValue}
                                  onChange={(e) =>
                                    setVsVlChecklistEdits((prev) => ({ ...prev, [task.id]: e.target.value }))
                                  }
                                  onBlur={async (e) => {
                                    if (isLocked) return
                                    const nextValue = e.target.value.trim()
                                    const currentValue = meta?.checklist || ""
                                    if (nextValue === currentValue) return
                                    const comment = (vsVlCommentEdits[task.id] ?? meta?.comment ?? "").trim()
                                    const updated = await updateVsVlMeta(task, {
                                      checklist: nextValue || undefined,
                                      comment: comment || undefined,
                                    })
                                    if (updated) {
                                      setVsVlChecklistEdits((prev) => ({ ...prev, [task.id]: nextValue }))
                                    }
                                  }}
                                  placeholder="Checklist..."
                                  rows={2}
                                  className="text-xs border-slate-300 bg-white resize-none"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No tasks yet.
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    )
  }

  if (isMst) {
    // Get planning items from database
    const planningItems = checklistItems.filter((item) => {
      if (item.item_type !== "CHECKBOX") return false
      return item.path === "PLANNING" && MST_PLANNING_QUESTIONS.includes(item.title || "")
    })

    const planningItemMap = new Map<string, ChecklistItem>()
    planningItems.forEach((item) => {
      if (item.title) {
        planningItemMap.set(item.title, item)
      }
    })

    const planningChecks = mstPlanningChecks
    const togglePlanning = async (q: string) => {
      const newChecked = !mstPlanningChecks[q]
      // Optimistically update UI
      setMstPlanningChecks((prev) => ({ ...prev, [q]: newChecked }))
      setDescriptionChecks((prev) => ({ ...prev, [q]: newChecked }))

      let item = planningItemMap.get(q)

      // Create item if it doesn't exist
      if (!item && project) {
        try {
          const createRes = await apiFetch("/checklist-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: project.id,
              item_type: "CHECKBOX",
              path: "PLANNING",
              title: q,
              keyword: "PLANNING",
              description: q,
              category: "PLANNING",
              is_checked: newChecked,
            }),
          })

          if (createRes.ok) {
            const created = (await createRes.json()) as ChecklistItem
            item = created
            setChecklistItems((prev) => [...prev, created])
            planningItemMap.set(q, created)
          }
        } catch (error) {
          console.error("Failed to create planning item:", error)
        }
      }

      if (item) {
        // Update in background
        try {
          await apiFetch(`/checklist-items/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_checked: newChecked }),
          })
        } catch (error) {
          // Silently handle errors - update might still succeed
        }
      }
    }
    const templateOrderMap = new Map(
      MST_FINAL_CHECKLIST.map((row, index) => [`${row.path}|${row.detyrat}`, index])
    )

    // Get MST checklist items from database (exclude planning/meeting/finalization)
    const mstChecklistItems = checklistItems.filter((item) => {
      if (item.item_type !== "CHECKBOX") return false
      if (!item.path || !item.title) return false
      return !MST_EXCLUDED_PATHS.has(item.path)
    })

    const mstChecklistRows = mstChecklistItems
      .map((item) => {
        const key = `${item.path}|${item.title}`
        const templateRow = templateOrderMap.has(key)
          ? MST_FINAL_CHECKLIST[templateOrderMap.get(key) as number]
          : null
        const order = templateOrderMap.has(key)
          ? (templateOrderMap.get(key) as number)
          : templateOrderMap.size + (item.position ?? 0)
        return {
          key,
          order,
          item,
          path: item.path || "",
          detyrat: item.title || "",
          keywords: item.keyword || "",
          pershkrimi: item.description || "",
          kategoria: item.category || "",
          incl: templateRow?.incl || "",
        }
      })
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order
        return a.detyrat.localeCompare(b.detyrat)
      })

    // Initialize checked state from database (moved outside to avoid hook issues)

    const toggleFinalChecklist = async (item: ChecklistItem) => {
      if (!item.id || !item.path || !item.title) return
      const key = `${item.path}|${item.title}`
      const newChecked = !mstChecklistChecked[key]
      setMstChecklistChecked((prev) => ({ ...prev, [key]: newChecked }))
      setChecklistItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_checked: newChecked } : i))
      )
      try {
        const res = await apiFetch(`/checklist-items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_checked: newChecked }),
        })
        if (!res.ok && res.status !== 503) {
          let errorMessage = "Failed to update checklist"
          try {
            const errorData = await res.json()
            if (errorData.detail) {
              if (typeof errorData.detail === "string") {
                errorMessage = errorData.detail
              } else if (Array.isArray(errorData.detail)) {
                errorMessage = errorData.detail.map((e: any) => e.msg || String(e)).join(", ")
              } else {
                errorMessage = String(errorData.detail)
              }
            }
          } catch {
            errorMessage = `${errorMessage} (${res.status})`
          }
          toast.error(errorMessage)
        } else if (res.ok) {
          const updated = (await res.json()) as ChecklistItem
          setChecklistItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
        }
      } catch (error) {
        console.error("Error updating checklist (may still succeed):", error)
      }
    }

    const updateMstChecklistComment = async (item: ChecklistItem, comment: string) => {
      if (!item.id || !item.path || !item.title) return
      const key = `${item.path}|${item.title}`
      const previousComment = item.comment || ""
      setMstChecklistComments((prev) => ({ ...prev, [key]: comment }))
      setChecklistItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, comment } : i))
      )

      try {
        const res = await apiFetch(`/checklist-items/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment: comment || null }),
        })
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          const detail = errorData.detail
          const errorMsg = typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((e: any) => e.msg || String(e)).join(", ")
              : "Failed to save comment"
          toast.error(errorMsg)
          setMstChecklistComments((prev) => ({ ...prev, [key]: previousComment }))
          setChecklistItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, comment: previousComment || null } : i))
          )
        }
      } catch (error) {
        toast.error("Failed to save comment")
        setMstChecklistComments((prev) => ({ ...prev, [key]: previousComment }))
        setChecklistItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, comment: previousComment || null } : i))
        )
      }
    }

    const queueMstCommentSave = (item: ChecklistItem, comment: string) => {
      if (!item.path || !item.title) return
      const key = `${item.path}|${item.title}`
      const timers = mstCommentTimersRef.current
      if (timers[key]) {
        clearTimeout(timers[key])
      }
      timers[key] = setTimeout(() => {
        void updateMstChecklistComment(item, comment)
      }, 600)
    }

    const startEditMstChecklistRow = (row: {
      key: string
      path: string
      detyrat: string
      keywords: string
      pershkrimi: string
      kategoria: string
    }) => {
      setEditingMstChecklistKey(row.key)
      setEditingMstChecklistRow({
        path: row.path,
        detyrat: row.detyrat,
        keywords: row.keywords,
        pershkrimi: row.pershkrimi,
        kategoria: row.kategoria,
      })
    }

    const cancelEditMstChecklistRow = () => {
      setEditingMstChecklistKey(null)
      setEditingMstChecklistRow({
        path: "",
        detyrat: "",
        keywords: "",
        pershkrimi: "",
        kategoria: "",
      })
    }

    const saveMstChecklistRow = async (row: { key: string; item: ChecklistItem }) => {
      if (!project) return
      const path = editingMstChecklistRow.path.trim()
      const title = editingMstChecklistRow.detyrat.trim()
      if (!path || !title) {
        toast.error("Path and detyrat are required.")
        return
      }
      setSavingMstChecklistRow(true)
      try {
        const payload = {
          path,
          title,
          keyword: editingMstChecklistRow.keywords.trim() || null,
          description: editingMstChecklistRow.pershkrimi.trim() || null,
          category: editingMstChecklistRow.kategoria.trim() || null,
        }
        if (row.item?.id) {
          const res = await apiFetch(`/checklist-items/${row.item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
          if (!res.ok) {
            toast.error("Failed to update checklist row")
            return
          }
          const updated = (await res.json()) as ChecklistItem
          setChecklistItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
          const oldKey = row.key
          const newKey = `${updated.path}|${updated.title}`
          if (oldKey !== newKey) {
            setMstChecklistChecked((prev) => {
              if (!(oldKey in prev)) return prev
              const next = { ...prev }
              next[newKey] = next[oldKey]
              delete next[oldKey]
              return next
            })
            setMstChecklistComments((prev) => {
              if (!(oldKey in prev)) return prev
              const next = { ...prev }
              next[newKey] = next[oldKey]
              delete next[oldKey]
              return next
            })
          }
        }
        cancelEditMstChecklistRow()
        toast.success("Checklist row saved")
      } finally {
        setSavingMstChecklistRow(false)
      }
    }

    const deleteMstChecklistRow = async (row: { key: string; item: ChecklistItem }) => {
      if (!row.item?.id) return
      const res = await apiFetch(`/checklist-items/${row.item.id}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Failed to delete checklist row")
        return
      }
      setChecklistItems((prev) => prev.filter((i) => i.id !== row.item.id))
      setMstChecklistChecked((prev) => {
        if (!(row.key in prev)) return prev
        const next = { ...prev }
        delete next[row.key]
        return next
      })
      setMstChecklistComments((prev) => {
        if (!(row.key in prev)) return prev
        const next = { ...prev }
        delete next[row.key]
        return next
      })
      toast.success("Checklist row deleted")
    }

    const addMstChecklistRow = async () => {
      if (!project) return
      const path = newMstChecklistRow.path.trim()
      const title = newMstChecklistRow.detyrat.trim()
      if (!path || !title) {
        toast.error("Path and detyrat are required.")
        return
      }
      setSavingMstChecklistRow(true)
      try {
        const maxPosition = mstChecklistItems.reduce(
          (max, item) => Math.max(max, item.position ?? 0),
          templateOrderMap.size
        )
        const res = await apiFetch("/checklist-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: project.id,
            item_type: "CHECKBOX",
            path,
            title,
            keyword: newMstChecklistRow.keywords.trim() || null,
            description: newMstChecklistRow.pershkrimi.trim() || null,
            category: newMstChecklistRow.kategoria.trim() || null,
            is_checked: false,
            position: maxPosition + 1,
          }),
        })
        if (!res.ok) {
          toast.error("Failed to add checklist row")
          return
        }
        const created = (await res.json()) as ChecklistItem
        setChecklistItems((prev) => [...prev, created])
        setNewMstChecklistRow({
          path: "",
          detyrat: "",
          keywords: "",
          pershkrimi: "",
          kategoria: "",
        })
        toast.success("Checklist row added")
      } finally {
        setSavingMstChecklistRow(false)
      }
    }
    const toggleFinalizationChecklist = async (itemId: string, nextChecked: boolean) => {
      if (!project) return
      const item = finalizationItems.find((i) => i.id === itemId)
      if (!item) return

      const previousValue = item.is_checked || false
      setFinalizationChecks((prev) => ({ ...prev, [itemId]: nextChecked }))
      setFinalizationItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, is_checked: nextChecked } : i)))
      setChecklistItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, is_checked: nextChecked } : i)))
      
      try {
        const res = await apiFetch(`/checklist-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_checked: nextChecked }),
        })
        if (!res.ok) {
          toast.error("Failed to save checklist")
          setFinalizationChecks((prev) => ({ ...prev, [itemId]: previousValue }))
          setFinalizationItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, is_checked: previousValue } : i)))
          setChecklistItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, is_checked: previousValue } : i)))
        } else {
          const updated = (await res.json()) as ChecklistItem
          setChecklistItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
          setFinalizationItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
        }
      } catch {
        toast.error("Failed to save checklist")
        setFinalizationChecks((prev) => ({ ...prev, [itemId]: previousValue }))
        setFinalizationItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, is_checked: previousValue } : i)))
        setChecklistItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, is_checked: previousValue } : i)))
      }
    }

    const addFinalizationItem = async () => {
      if (!project || !newFinalizationText.trim()) return
      setSavingFinalization(true)
      try {
        const position = finalizationItems.length > 0
          ? Math.max(...finalizationItems.map((item) => item.position ?? 0)) + 1
          : 1
        
        const res = await apiFetch("/checklist-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: project.id,
            item_type: "CHECKBOX",
            path: FINALIZATION_PATH,
            title: newFinalizationText.trim(),
            keyword: FINALIZATION_PATH,
            description: newFinalizationText.trim(),
            category: FINALIZATION_PATH,
            is_checked: false,
            position,
          }),
        })
        if (!res.ok) {
          toast.error("Failed to add checklist item")
          return
        }
        const created = (await res.json()) as ChecklistItem
        setChecklistItems((prev) => [...prev, created])
        setFinalizationItems((prev) => [...prev, created])
        setFinalizationChecks((prev) => ({ ...prev, [created.id]: false }))
        setNewFinalizationText("")
        toast.success("Checklist item added")
      } catch {
        toast.error("Failed to add checklist item")
      } finally {
        setSavingFinalization(false)
      }
    }

    const startEditFinalizationItem = (itemId: string) => {
      const item = finalizationItems.find((i) => i.id === itemId)
      if (!item) return
      setEditingFinalizationId(itemId)
      setEditingFinalizationText(item.title || "")
    }

    const cancelEditFinalizationItem = () => {
      setEditingFinalizationId(null)
      setEditingFinalizationText("")
    }

    const saveFinalizationItem = async () => {
      if (!editingFinalizationId || !editingFinalizationText.trim()) return
      setSavingFinalization(true)
      try {
        const res = await apiFetch(`/checklist-items/${editingFinalizationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: editingFinalizationText.trim() }),
        })
        if (!res.ok) {
          toast.error("Failed to update checklist item")
          return
        }
        const updated = (await res.json()) as ChecklistItem
        setChecklistItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
        setFinalizationItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
        cancelEditFinalizationItem()
        toast.success("Checklist item updated")
      } catch {
        toast.error("Failed to update checklist item")
      } finally {
        setSavingFinalization(false)
      }
    }

    const deleteFinalizationItem = async (itemId: string) => {
      const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Failed to delete checklist item")
        return
      }
      setChecklistItems((prev) => prev.filter((i) => i.id !== itemId))
      setFinalizationItems((prev) => prev.filter((i) => i.id !== itemId))
      setFinalizationChecks((prev) => {
        const next = { ...prev }
        delete next[itemId]
        return next
      })
      toast.success("Checklist item deleted")
    }

    const startEditTask = (task: Task) => {
      // Find the latest task from state to ensure we have the most recent data
      const latestTask = tasks.find((t) => t.id === task.id) || task
      setEditingTaskId(latestTask.id)
      setEditingTaskTitle(latestTask.title || "")
      setEditingTaskAssignee(latestTask.assigned_to || "__unassigned__")
      const notes = latestTask.internal_notes || ""
      const totalMatch = notes.match(/total_products=(\d+)/)
      const completedMatch = notes.match(/completed_products=(\d+)/)
      setEditingTaskTotal(totalMatch ? totalMatch[1] : controlEdits[latestTask.id]?.total || "0")
      setEditingTaskCompleted(
        controlEdits[latestTask.id]?.completed || completedMatch?.[1] || "0"
      )
    }

    const cancelEditTask = () => {
      setEditingTaskId(null)
      setEditingTaskTitle("")
      setEditingTaskAssignee("__unassigned__")
      setEditingTaskTotal("")
      setEditingTaskCompleted("")
    }

    const saveTaskEdit = async () => {
      if (!editingTaskId || !editingTaskTitle.trim() || !project) return
      setSavingTaskEdit(true)
      try {
        const task = tasks.find((t) => t.id === editingTaskId)
        if (!task) return

        const currentNotes = task.internal_notes || ""
        const completedMatch = currentNotes.match(/completed_products=(\d+)/)
        const completed =
          editingTaskCompleted || controlEdits[task.id]?.completed || completedMatch?.[1] || "0"

        const totalValue = editingTaskTotal || controlEdits[task.id]?.total || "0"
        const totalNum = parseInt(totalValue, 10) || 0
        const completedNum = parseInt(completed, 10) || 0
        const nextStatus = totalNum > 0 && completedNum >= totalNum ? "DONE" : "TODO"
        const res = await apiFetch(`/tasks/${editingTaskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editingTaskTitle.trim(),
            assigned_to: editingTaskAssignee === "__unassigned__" ? null : editingTaskAssignee,
            internal_notes: `total_products=${totalValue}; completed_products=${completed}`,
            status: nextStatus,
          }),
        })
        if (!res.ok) {
          toast.error("Failed to update task")
          return
        }
        const updated = (await res.json()) as Task
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
        setControlEdits((prev) => ({
          ...prev,
          [updated.id]: {
            ...prev[updated.id],
            total: editingTaskTotal || "0",
            completed,
            assigned_to: editingTaskAssignee === "__unassigned__" ? null : editingTaskAssignee,
            status: nextStatus,
          },
        }))
        cancelEditTask()
        toast.success("Task updated")
      } catch {
        toast.error("Failed to update task")
      } finally {
        setSavingTaskEdit(false)
      }
    }

    const memberLabel = (id?: string | null) => {
      if (!id) return "-"
      const u = userMap.get(id)
      const label = u?.full_name || u?.username || u?.email || "-"
      return label === "-" ? "-" : initialsWithDots(label)
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
              {mstBadgeLabel(project)}
            </Badge>
          </div>
        </div>

        {mstPhase === "PLANNING" ? (
          <>
            <div className="border-b flex gap-6">
              {[
                { id: "description", label: "Description" },
                { id: "ga", label: "Shenime GA/KA" },
              ].map((tab) => {
                const isActive = mstTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMstTab(tab.id as typeof mstTab)}
                    className={[
                      "relative pb-3 text-sm font-medium",
                      tab.id === "ga" ? "ml-auto" : "",
                      isActive ? "text-blue-600" : "text-muted-foreground",
                    ].join(" ")}
                  >
                    {tab.label}
                    {isActive ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" /> : null}
                  </button>
                )
              })}
            </div>
            {mstTab === "ga" ? (
              renderGaNotes()
            ) : (
              <Card>
                <div className="p-4 space-y-4">
                  <div className="text-lg font-semibold">Planifikimi</div>
                  <div className="grid gap-3">
                    {MST_PLANNING_QUESTIONS.slice(0, 2).map((q, idx) => (
                      <div key={q} className="grid grid-cols-12 gap-3 items-center">
                        <div className="col-span-9 flex items-center gap-3">
                          <Checkbox
                            checked={Boolean(descriptionChecks[q])}
                            onCheckedChange={() => togglePlanning(q)}
                          />
                          <span className="text-sm font-semibold uppercase tracking-wide">{q}</span>
                        </div>
                        <div className="col-span-3">
                          {idx === 1 ? (
                            <Textarea
                              placeholder="Shkruaj emrin e programit..."
                              value={programName}
                              onChange={(e) => {
                                const newValue = e.target.value
                                setProgramName(newValue)

                                // Save to database as comment on the checklist item
                                const planningItem = planningItemMap.get(q)

                                if (planningItem) {
                                  // Item exists, update it
                                  apiFetch(`/checklist-items/${planningItem.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ comment: newValue || null }),
                                  }).catch(() => {
                                    // Silently handle errors - update might still succeed
                                  })
                                } else if (project) {
                                  // Item doesn't exist, create it
                                  apiFetch("/checklist-items", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      project_id: project.id,
                                      item_type: "CHECKBOX",
                                      path: "PLANNING",
                                      title: q,
                                      keyword: "PLANNING",
                                      description: q,
                                      category: "PLANNING",
                                      is_checked: false,
                                      comment: newValue || null,
                                    }),
                                  }).then((createRes) => {
                                    if (createRes.ok) {
                                      createRes.json().then((created: ChecklistItem) => {
                                        setChecklistItems((prev) => [...prev, created])
                                        planningItemMap.set(q, created)
                                      }).catch(() => { })
                                    }
                                  }).catch(() => {
                                    // Silently handle errors
                                  })
                                }
                              }}
                              onBlur={async (e) => {
                                // Ensure it's saved on blur
                                const planningItem = planningItemMap.get(q)
                                const newValue = e.target.value

                                if (planningItem) {
                                  // Item exists, update it
                                  try {
                                    const res = await apiFetch(`/checklist-items/${planningItem.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ comment: newValue || null }),
                                    })
                                    if (!res.ok && res.status !== 503) {
                                      // Real error, but don't spam the user
                                    }
                                  } catch {
                                    // Silently handle network errors - update might still succeed
                                  }
                                } else if (project) {
                                  // Item doesn't exist, create it
                                  try {
                                    const createRes = await apiFetch("/checklist-items", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        project_id: project.id,
                                        item_type: "CHECKBOX",
                                        path: "PLANNING",
                                        title: q,
                                        keyword: "PLANNING",
                                        description: q,
                                        category: "PLANNING",
                                        is_checked: false,
                                        comment: newValue || null,
                                      }),
                                    })

                                    if (createRes.ok) {
                                      const created = (await createRes.json()) as ChecklistItem
                                      setChecklistItems((prev) => [...prev, created])
                                      planningItemMap.set(q, created)
                                    }
                                  } catch {
                                    // Silently handle network errors
                                  }
                                }
                              }}
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
                    {MST_PLANNING_QUESTIONS.slice(2).map((q) => {
                      const planningItem = planningItemMap.get(q)
                      // Use local state for immediate UI updates, fallback to database value
                      const comment = planningComments[q] || planningItem?.comment || ""

                      return (
                        <div key={q} className="grid grid-cols-12 gap-3 items-center px-3 py-3">
                          <div className="col-span-10 flex items-start gap-3">
                            <Checkbox
                              checked={Boolean(descriptionChecks[q])}
                              onCheckedChange={() => togglePlanning(q)}
                            />
                            <span className="text-sm">{q}</span>
                          </div>
                          <div className="col-span-2">
                            <Input
                              placeholder="Comment"
                              value={comment}
                              onChange={(e) => {
                                const newComment = e.target.value
                                // Update local state immediately for responsive UI
                                setPlanningComments((prev) => ({ ...prev, [q]: newComment }))

                                // Also update in checklistItems for consistency
                                setChecklistItems((prev) =>
                                  prev.map((item) =>
                                    item.id === planningItem?.id
                                      ? { ...item, comment: newComment }
                                      : item
                                  )
                                )

                                // Save to database
                                const saveComment = async (item: ChecklistItem | undefined) => {
                                  if (item) {
                                    // Item exists, update it
                                    try {
                                      const res = await apiFetch(`/checklist-items/${item.id}`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ comment: newComment || null }),
                                      })
                                      if (!res.ok && res.status !== 503) {
                                        // Real error, but don't spam the user
                                      }
                                    } catch {
                                      // Silently handle network errors - update might still succeed
                                    }
                                  } else if (project) {
                                    // Item doesn't exist, create it
                                    try {
                                      const createRes = await apiFetch("/checklist-items", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          project_id: project.id,
                                          item_type: "CHECKBOX",
                                          path: "PLANNING",
                                          title: q,
                                          keyword: "PLANNING",
                                          description: q,
                                          category: "PLANNING",
                                          is_checked: false,
                                          comment: newComment || null,
                                        }),
                                      })

                                      if (createRes.ok) {
                                        const created = (await createRes.json()) as ChecklistItem
                                        setChecklistItems((prev) => [...prev, created])
                                        planningItemMap.set(q, created)
                                      }
                                    } catch {
                                      // Silently handle network errors
                                    }
                                  }
                                }

                                // Save in background
                                saveComment(planningItem)
                              }}
                              onBlur={async (e) => {
                                const newComment = e.target.value

                                if (planningItem) {
                                  // Item exists, update it
                                  try {
                                    const res = await apiFetch(`/checklist-items/${planningItem.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ comment: newComment || null }),
                                    })
                                    if (!res.ok && res.status !== 503) {
                                      // Real error, but don't spam the user
                                    }
                                  } catch {
                                    // Silently handle network errors - update might still succeed
                                  }
                                } else if (project) {
                                  // Item doesn't exist, create it
                                  try {
                                    const createRes = await apiFetch("/checklist-items", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        project_id: project.id,
                                        item_type: "CHECKBOX",
                                        path: "PLANNING",
                                        title: q,
                                        keyword: "PLANNING",
                                        description: q,
                                        category: "PLANNING",
                                        is_checked: false,
                                        comment: newComment || null,
                                      }),
                                    })

                                    if (createRes.ok) {
                                      const created = (await createRes.json()) as ChecklistItem
                                      setChecklistItems((prev) => [...prev, created])
                                      planningItemMap.set(q, created)
                                    }
                                  } catch {
                                    // Silently handle network errors
                                  }
                                }
                              }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </Card>
            )}
          </>
        ) : mstPhase === "PRODUCT" ? (
          <>
            <div className="border-b flex gap-6">
              {[
                { id: "tasks", label: "Tasks (Detyrat)" },
                { id: "checklists", label: "Checklists" },
                { id: "members", label: "Members" },
                { id: "ga", label: "Shenime GA/KA" },
              ].map((tab) => {
                const isActive = mstTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMstTab(tab.id as typeof mstTab)}
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

            {mstTab === "tasks" ? (
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
                                status: "TODO",
                                priority: "NORMAL",
                                phase: "PRODUCT",
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
                    {tasks.filter((task) => (task.phase ?? "PRODUCT") === "PRODUCT").map((task, index) => {
                      const totalVal = parseInt(controlEdits[task.id]?.total || "0", 10) || 0
                      const isEditing = editingTaskId === task.id
                      return (
                        <div key={task.id} className="grid grid-cols-12 gap-4 py-4 px-2 text-sm items-center hover:bg-slate-50/70 transition-colors group">
                          <div className="col-span-4 pr-2">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingTaskTitle}
                                onChange={(e) => setEditingTaskTitle(e.target.value)}
                                className="w-full bg-transparent border-0 border-b-2 border-blue-500 outline-none py-1 text-sm"
                                autoFocus
                              />
                            ) : (
                              <span className="font-medium text-slate-700">{index + 1}. {task.title}</span>
                            )}
                          </div>
                          <div className="col-span-1 px-2 min-w-0">
                            {isEditing ? (
                              <Select value={editingTaskAssignee} onValueChange={setEditingTaskAssignee}>
                                <SelectTrigger className="h-8 w-full min-w-0 border-0 border-b-2 border-blue-500 rounded-none bg-transparent shadow-none px-1">
                                  <SelectValue />
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
                              <span className="block truncate text-slate-500">{memberLabel(task.assigned_to)}</span>
                            )}
                          </div>
                          <div className="col-span-2 px-2">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editingTaskTotal}
                                onChange={(e) => setEditingTaskTotal(e.target.value)}
                                placeholder="0"
                                className="w-full bg-transparent border-0 border-b-2 border-blue-500 outline-none py-1 text-sm"
                              />
                            ) : (
                              <span className="text-slate-500">{controlEdits[task.id]?.total || "-"}</span>
                            )}
                          </div>
                          <div className="col-span-2 px-2">
                            {isEditing ? (
                              <input
                                type="number"
                                min="0"
                                value={editingTaskCompleted}
                                onChange={(e) => {
                                  const rawValue = e.target.value
                                  let completedNum = parseInt(rawValue, 10)
                                  if (Number.isNaN(completedNum) || completedNum < 0) completedNum = 0
                                  const totalValue = editingTaskTotal || controlEdits[task.id]?.total || "0"
                                  const totalNum = parseInt(totalValue, 10) || 0
                                  if (totalNum > 0 && completedNum > totalNum) completedNum = totalNum
                                  const newCompleted = completedNum.toString()
                                  const newStatus = totalNum > 0 && completedNum >= totalNum ? "DONE" : "TODO"
                                  setEditingTaskCompleted(newCompleted)
                                  setControlEdits((prev) => ({
                                    ...prev,
                                    [task.id]: { ...prev[task.id], completed: newCompleted, status: newStatus },
                                  }))
                                }}
                                className="w-full bg-transparent border-0 border-b-2 border-blue-500 outline-none py-1 text-sm text-center"
                              />
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  className="h-6 w-6 rounded-full border border-slate-300 text-slate-500 hover:text-slate-700"
                                  onClick={async () => {
                                    const completedNum = Math.max(
                                      0,
                                      (parseInt(controlEdits[task.id]?.completed || "0", 10) || 0) - 1
                                    )
                                    const newCompleted = completedNum.toString()
                                    const shouldMarkDone = totalVal > 0 && completedNum >= totalVal
                                    const newStatus = shouldMarkDone ? "DONE" : "TODO"
                                    setControlEdits((prev) => ({
                                      ...prev,
                                      [task.id]: { ...prev[task.id], completed: newCompleted, status: newStatus },
                                    }))
                                    await apiFetch(`/tasks/${task.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        internal_notes: `total_products=${controlEdits[task.id]?.total || 0}; completed_products=${newCompleted}`,
                                        status: newStatus,
                                      }),
                                    })
                                  }}
                                >
                                  -
                                </button>
                                <div className="min-w-[32px] text-center text-sm text-slate-700">
                                  {controlEdits[task.id]?.completed || "0"}
                                </div>
                                <button
                                  type="button"
                                  className="h-6 w-6 rounded-full border border-slate-300 text-slate-500 hover:text-slate-700"
                                  onClick={async () => {
                                    let completedNum = (parseInt(controlEdits[task.id]?.completed || "0", 10) || 0) + 1
                                    if (totalVal > 0 && completedNum > totalVal) completedNum = totalVal
                                    const newCompleted = completedNum.toString()
                                    const shouldMarkDone = totalVal > 0 && completedNum >= totalVal
                                    const newStatus = shouldMarkDone ? "DONE" : "TODO"
                                    setControlEdits((prev) => ({
                                      ...prev,
                                      [task.id]: { ...prev[task.id], completed: newCompleted, status: newStatus },
                                    }))
                                    await apiFetch(`/tasks/${task.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        internal_notes: `total_products=${controlEdits[task.id]?.total || 0}; completed_products=${newCompleted}`,
                                        status: newStatus,
                                      }),
                                    })
                                  }}
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="col-span-2 px-2">
                            <Badge
                              variant={task.status === "DONE" ? "default" : "outline"}
                              className={task.status === "DONE" ? "bg-emerald-500 hover:bg-emerald-600" : "text-slate-600 border-slate-300"}
                            >
                              {statusLabel(controlEdits[task.id]?.status || task.status)}
                            </Badge>
                          </div>
                          <div className="col-span-1 text-right opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-1">
                            {isEditing ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-slate-400 hover:text-blue-600"
                                  onClick={() => void saveTaskEdit()}
                                  disabled={savingTaskEdit}
                                >
                                  {savingTaskEdit ? "Saving..." : "Save"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-slate-400 hover:text-slate-600"
                                  onClick={cancelEditTask}
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                  onClick={() => startEditTask(task)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
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
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
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

            {mstTab === "checklists" ? (
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
                  <div
                    ref={mstChecklistScrollRef}
                    className="overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing"
                    style={{ WebkitOverflowScrolling: "touch" }}
                    onMouseDown={(event) => {
                      if (event.button !== 0) return
                      const target = event.target as HTMLElement
                      if (target.closest("input, textarea, button, select, [role=\"checkbox\"]")) {
                        return
                      }
                      const container = mstChecklistScrollRef.current
                      if (!container) return
                      mstChecklistDragRef.current.active = true
                      mstChecklistDragRef.current.startX = event.pageX - container.offsetLeft
                      mstChecklistDragRef.current.startScrollLeft = container.scrollLeft
                    }}
                    onMouseUp={() => {
                      mstChecklistDragRef.current.active = false
                    }}
                    onMouseLeave={() => {
                      mstChecklistDragRef.current.active = false
                    }}
                    onMouseMove={(event) => {
                      if (!mstChecklistDragRef.current.active) return
                      event.preventDefault()
                      const container = mstChecklistScrollRef.current
                      if (!container) return
                      const x = event.pageX - container.offsetLeft
                      const walk = (x - mstChecklistDragRef.current.startX) * 1.2
                      container.scrollLeft = mstChecklistDragRef.current.startScrollLeft - walk
                    }}
                  >
                    <div className="min-w-[1200px]">
                      <div className="grid grid-cols-15 gap-3 text-xs font-semibold text-muted-foreground border-b pb-2">
                        <div className="col-span-1">NO</div>
                        <div className="col-span-2">PATH</div>
                        <div className="col-span-2">DETYRAT</div>
                        <div className="col-span-2">KEYWORDS</div>
                        <div className="col-span-2">PERSHKRIMI</div>
                        <div className="col-span-1">KATEGORIA</div>
                        <div className="col-span-1">CHECK</div>
                        <div className="col-span-1">INCL</div>
                        <div className="col-span-2">KOMENT</div>
                        <div className="col-span-1 text-right">ACTIONS</div>
                      </div>
                      <div className="grid grid-cols-15 gap-3 py-3 text-sm items-center border-b">
                        <div className="col-span-1 text-xs font-semibold text-slate-400">+</div>
                        <div className="col-span-2">
                          <Input
                            value={newMstChecklistRow.path}
                            onChange={(e) => setNewMstChecklistRow((prev) => ({ ...prev, path: e.target.value }))}
                          placeholder="Path"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          value={newMstChecklistRow.detyrat}
                          onChange={(e) => setNewMstChecklistRow((prev) => ({ ...prev, detyrat: e.target.value }))}
                          placeholder="Detyrat"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          value={newMstChecklistRow.keywords}
                          onChange={(e) => setNewMstChecklistRow((prev) => ({ ...prev, keywords: e.target.value }))}
                          placeholder="Keywords"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          value={newMstChecklistRow.pershkrimi}
                          onChange={(e) => setNewMstChecklistRow((prev) => ({ ...prev, pershkrimi: e.target.value }))}
                          placeholder="Pershkrimi"
                          className="h-8 text-xs"
                        />
                      </div>
                        <div className="col-span-1">
                          <Input
                            value={newMstChecklistRow.kategoria}
                            onChange={(e) => setNewMstChecklistRow((prev) => ({ ...prev, kategoria: e.target.value }))}
                            placeholder="Kategoria"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="col-span-1" />
                        <div className="col-span-1" />
                        <div className="col-span-2" />
                        <div className="col-span-1 flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void addMstChecklistRow()}
                          disabled={savingMstChecklistRow || !newMstChecklistRow.path.trim() || !newMstChecklistRow.detyrat.trim()}
                        >
                          {savingMstChecklistRow ? "Saving..." : "Add"}
                        </Button>
                      </div>
                      </div>
                      <div className="divide-y">
                        {mstChecklistRows.map((row, index) => {
                          const key = row.key
                          const isChecked = mstChecklistChecked[key] || false
                          const comment = mstChecklistComments[key] ?? row.item.comment ?? ""
                          const assignees = row.item.assignees || []
                          const assigneeInitials = assignees
                            .map((a) => {
                              const user = allUsers.find((u) => u.id === a.user_id)
                              if (user?.full_name) {
                                const names = user.full_name.split(" ")
                                return names.map((n) => n[0]).join("").toUpperCase()
                              }
                              return user?.username?.substring(0, 2).toUpperCase() || ""
                            })
                            .filter(Boolean)
                            .join(", ") || row.incl || "-"
                          const isEditing = editingMstChecklistKey === key

                          return (
                            <div key={key} className="grid grid-cols-15 gap-3 py-3 text-sm items-center">
                              <div className="col-span-1 text-xs text-slate-500">{index + 1}</div>
                              <div className="col-span-2" title={row.path}>
                                {isEditing ? (
                                  <Input
                                    value={editingMstChecklistRow.path}
                                    onChange={(e) => setEditingMstChecklistRow((prev) => ({ ...prev, path: e.target.value }))}
                                    className="h-8 text-xs"
                                  />
                                ) : (
                                  <div
                                    className="flex items-start gap-1"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                      if (row.path) {
                                        setViewingChecklistField({ key, field: "path", value: row.path, label: "Path" })
                                      }
                                    }}
                                    onKeyDown={(event) => {
                                      if ((event.key === "Enter" || event.key === " ") && row.path) {
                                        setViewingChecklistField({ key, field: "path", value: row.path, label: "Path" })
                                      }
                                    }}
                                  >
                                    <span className="flex-1 break-words max-h-10 overflow-hidden text-ellipsis">
                                      {row.path}
                                    </span>
                                    {row.path && row.path.length > 20 && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-5 w-5 shrink-0"
                                        onClick={() => setViewingChecklistField({ key, field: "path", value: row.path, label: "Path" })}
                                        title="View full text"
                                      >
                                        <FileText className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="col-span-2 font-semibold" title={row.detyrat}>
                                {isEditing ? (
                                  <Input
                                    value={editingMstChecklistRow.detyrat}
                                    onChange={(e) => setEditingMstChecklistRow((prev) => ({ ...prev, detyrat: e.target.value }))}
                                    className="h-8 text-xs"
                                  />
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <span className="flex-1 whitespace-normal break-words">{row.detyrat}</span>
                                    {row.detyrat && row.detyrat.length > 20 && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-5 w-5 shrink-0"
                                        onClick={() => setViewingChecklistField({ key, field: "detyrat", value: row.detyrat, label: "Task" })}
                                        title="View full text"
                                      >
                                        <FileText className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="col-span-2" title={row.keywords}>
                                {isEditing ? (
                                  <Input
                                    value={editingMstChecklistRow.keywords}
                                    onChange={(e) => setEditingMstChecklistRow((prev) => ({ ...prev, keywords: e.target.value }))}
                                    className="h-8 text-xs"
                                  />
                                ) : (
                                  <div
                                    className="flex items-start gap-1"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                      if (row.keywords) {
                                        setViewingChecklistField({ key, field: "keywords", value: row.keywords, label: "Keywords" })
                                      }
                                    }}
                                    onKeyDown={(event) => {
                                      if ((event.key === "Enter" || event.key === " ") && row.keywords) {
                                        setViewingChecklistField({ key, field: "keywords", value: row.keywords, label: "Keywords" })
                                      }
                                    }}
                                  >
                                    <span className="flex-1 break-words max-h-10 overflow-hidden text-ellipsis">
                                      {row.keywords}
                                    </span>
                                    {row.keywords && row.keywords.length > 20 && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-5 w-5 shrink-0"
                                        onClick={() => setViewingChecklistField({ key, field: "keywords", value: row.keywords, label: "Keywords" })}
                                        title="View full text"
                                      >
                                        <FileText className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="col-span-2" title={row.pershkrimi}>
                                {isEditing ? (
                                  <Input
                                    value={editingMstChecklistRow.pershkrimi}
                                    onChange={(e) => setEditingMstChecklistRow((prev) => ({ ...prev, pershkrimi: e.target.value }))}
                                    className="h-8 text-xs"
                                  />
                                ) : (
                                  <div
                                    className="flex items-start gap-1"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                      if (row.pershkrimi) {
                                        setViewingChecklistField({ key, field: "pershkrimi", value: row.pershkrimi, label: "Description" })
                                      }
                                    }}
                                    onKeyDown={(event) => {
                                      if ((event.key === "Enter" || event.key === " ") && row.pershkrimi) {
                                        setViewingChecklistField({ key, field: "pershkrimi", value: row.pershkrimi, label: "Description" })
                                      }
                                    }}
                                  >
                                    <span className="flex-1 break-words max-h-10 overflow-hidden text-ellipsis">
                                      {row.pershkrimi}
                                    </span>
                                    {row.pershkrimi && row.pershkrimi.length > 20 && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-5 w-5 shrink-0"
                                        onClick={() => setViewingChecklistField({ key, field: "pershkrimi", value: row.pershkrimi, label: "Description" })}
                                        title="View full text"
                                      >
                                        <FileText className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="col-span-1" title={row.kategoria}>
                                {isEditing ? (
                                  <Input
                                    value={editingMstChecklistRow.kategoria}
                                    onChange={(e) => setEditingMstChecklistRow((prev) => ({ ...prev, kategoria: e.target.value }))}
                                    className="h-8 text-xs"
                                  />
                                ) : (
                                  <div className="flex items-start gap-1">
                                    <span className="flex-1 whitespace-normal break-words">{row.kategoria}</span>
                                  </div>
                                )}
                              </div>
                              <div className="col-span-1 flex justify-center">
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() => toggleFinalChecklist(row.item)}
                                />
                              </div>
                              <div className="col-span-1 truncate" title={assigneeInitials}>{assigneeInitials}</div>
                              <div className="col-span-2 pr-3">
                                <Input
                                  placeholder="Koment"
                                  className="h-8 text-xs w-full"
                                  value={comment}
                                  onChange={(e) => {
                                    const newComment = e.target.value
                                    setMstChecklistComments((prev) => ({ ...prev, [key]: newComment }))
                                    queueMstCommentSave(row.item, newComment)
                                  }}
                                  onBlur={(e) => updateMstChecklistComment(row.item, e.target.value)}
                                />
                              </div>
                              <div className="col-span-1 flex items-center justify-end gap-2">
                                {isEditing ? (
                                  <>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      onClick={() => void saveMstChecklistRow(row)}
                                      aria-label="Save checklist row"
                                      title="Save"
                                      disabled={savingMstChecklistRow}
                                    >
                                      <Check className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={cancelEditMstChecklistRow}
                                      aria-label="Cancel editing"
                                      title="Cancel"
                                    >
                                      <span className="text-xs">X</span>
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      onClick={() => startEditMstChecklistRow(row)}
                                      aria-label="Edit checklist row"
                                      title="Edit"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className="text-red-600 border-red-200 hover:bg-red-50"
                                      onClick={() => void deleteMstChecklistRow(row)}
                                      aria-label="Delete checklist row"
                                      title="Delete"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          )
                        })}
                        {!mstChecklistRows.length ? (
                          <div className="py-8 text-center text-sm text-muted-foreground">
                            No checklist rows yet. Add one above to get started.
                          </div>
                        ) : null}
                      </div>

                      {/* View Full Text Modal */}
                      <Dialog open={viewingChecklistField !== null} onOpenChange={(open) => !open && setViewingChecklistField(null)}>
                        <DialogContent className="sm:max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>{viewingChecklistField?.label || "Full Text"}</DialogTitle>
                          </DialogHeader>
                          <div className="mt-4">
                            <div className="rounded-lg border bg-slate-50 p-4">
                              <p className="whitespace-pre-wrap text-sm">{viewingChecklistField?.value || ""}</p>
                            </div>
                            <div className="mt-4 flex justify-end">
                              <Button
                                variant="outline"
                                onClick={() => {
                                  const value = viewingChecklistField?.value || ""
                                  if (!value) return
                                  void navigator.clipboard.writeText(value)
                                  toast.success("Copied to clipboard")
                                }}
                              >
                                Copy
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </div>
              </Card>
            ) : null}

            {mstTab === "members" ? (
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

            {mstTab === "ga" ? renderGaNotes() : null}
          </>
        ) : mstPhase === "CONTROL" ? (
          <>
            <div className="border-b flex gap-6">
              {[
                { id: "tasks", label: "Tasks (Detyrat)" },
                { id: "ga", label: "Shenime GA/KA" },
              ].map((tab) => {
                const isActive = mstTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMstTab(tab.id as typeof mstTab)}
                    className={[
                      "relative pb-3 text-sm font-medium",
                      tab.id === "ga" ? "ml-auto" : "",
                      isActive ? "text-blue-600" : "text-muted-foreground",
                    ].join(" ")}
                  >
                    {tab.label}
                    {isActive ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" /> : null}
                  </button>
                )
              })}
            </div>
            {mstTab === "ga" ? (
              renderGaNotes()
            ) : (
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
                        const assignedUser = allUsers.find((u) => u.id === controlAssignee)
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
                                status: "TODO",
                                priority: "NORMAL",
                                phase: "CONTROL",
                                internal_notes: "total_products=0; completed_products=0",
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
                    {tasks.filter((task) => task.phase === "CONTROL").map((task, index) => {
                      const totalVal = parseInt(controlEdits[task.id]?.total || "0", 10) || 0
                      const assignedUser = allUsers.find((u) => u.id === task.assigned_to)
                      const assignedName = assignedUser?.full_name?.toLowerCase() || ""
                      const koFullName = !task.assigned_to
                        ? "-"
                        : assignedName.includes("diellza")
                          ? "Lea Murturi"
                          : assignedName.includes("lea")
                            ? "Diellza Veliu"
                            : "Elsa Ferati"
                      const koName = koFullName === "-" ? "-" : initialsWithDots(koFullName)
                      const isEditing = editingTaskId === task.id
                      return (
                        <div key={task.id} className="grid grid-cols-12 gap-4 py-4 px-2 text-sm items-center hover:bg-slate-50/70 transition-colors group">
                          <div className="col-span-3 pr-2">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingTaskTitle}
                                onChange={(e) => setEditingTaskTitle(e.target.value)}
                                className="w-full bg-transparent border-0 border-b-2 border-blue-500 outline-none py-1 text-sm font-medium"
                                autoFocus
                              />
                            ) : (
                              <span className="font-medium text-slate-700">{index + 1}. {task.title}</span>
                            )}
                          </div>
                          <div className="col-span-1 px-2 min-w-0">
                            {isEditing ? (
                              <Select value={editingTaskAssignee} onValueChange={setEditingTaskAssignee}>
                                <SelectTrigger className="h-8 w-full min-w-0 border-0 border-b-2 border-blue-500 rounded-none bg-transparent shadow-none px-1">
                                  <SelectValue />
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
                              <span className="block truncate text-slate-500">{memberLabel(task.assigned_to)}</span>
                            )}
                          </div>
                          <div className="col-span-2 px-2">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editingTaskTotal}
                                onChange={(e) => setEditingTaskTotal(e.target.value)}
                                placeholder="0"
                                className="w-full bg-transparent border-0 border-b-2 border-blue-500 outline-none py-1 text-sm"
                              />
                            ) : (
                              <span className="text-slate-500">{controlEdits[task.id]?.total || "-"}</span>
                            )}
                          </div>
                          <div className="col-span-2 px-2">
                            {isEditing ? (
                              <input
                                type="number"
                                min="0"
                                value={editingTaskCompleted}
                                onChange={(e) => {
                                  const rawValue = e.target.value
                                  let completedNum = parseInt(rawValue, 10)
                                  if (Number.isNaN(completedNum) || completedNum < 0) completedNum = 0
                                  const totalValue = editingTaskTotal || controlEdits[task.id]?.total || "0"
                                  const totalNum = parseInt(totalValue, 10) || 0
                                  if (totalNum > 0 && completedNum > totalNum) completedNum = totalNum
                                  const newCompleted = completedNum.toString()
                                  const newStatus = totalNum > 0 && completedNum >= totalNum ? "DONE" : "TODO"
                                  setEditingTaskCompleted(newCompleted)
                                  setControlEdits((prev) => ({
                                    ...prev,
                                    [task.id]: { ...prev[task.id], completed: newCompleted, status: newStatus },
                                  }))
                                }}
                                className="w-full bg-transparent border-0 border-b-2 border-blue-500 outline-none py-1 text-sm text-center"
                              />
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  className="h-6 w-6 rounded-full border border-slate-300 text-slate-500 hover:text-slate-700"
                                  onClick={async () => {
                                    const completedNum = Math.max(
                                      0,
                                      (parseInt(controlEdits[task.id]?.completed || "0", 10) || 0) - 1
                                    )
                                    const newCompleted = completedNum.toString()
                                    const shouldMarkDone = totalVal > 0 && completedNum >= totalVal
                                    const newStatus = shouldMarkDone ? "DONE" : "TODO"
                                    setControlEdits((prev) => ({
                                      ...prev,
                                      [task.id]: { ...prev[task.id], completed: newCompleted, status: newStatus },
                                    }))
                                    await apiFetch(`/tasks/${task.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        internal_notes: `total_products=${controlEdits[task.id]?.total || 0}; completed_products=${newCompleted}`,
                                        status: newStatus,
                                      }),
                                    })
                                  }}
                                >
                                  -
                                </button>
                                <div className="min-w-[32px] text-center text-sm text-slate-700">
                                  {controlEdits[task.id]?.completed || "0"}
                                </div>
                                <button
                                  type="button"
                                  className="h-6 w-6 rounded-full border border-slate-300 text-slate-500 hover:text-slate-700"
                                  onClick={async () => {
                                    let completedNum = (parseInt(controlEdits[task.id]?.completed || "0", 10) || 0) + 1
                                    if (totalVal > 0 && completedNum > totalVal) completedNum = totalVal
                                    const newCompleted = completedNum.toString()
                                    const shouldMarkDone = totalVal > 0 && completedNum >= totalVal
                                    const newStatus = shouldMarkDone ? "DONE" : "TODO"
                                    setControlEdits((prev) => ({
                                      ...prev,
                                      [task.id]: { ...prev[task.id], completed: newCompleted, status: newStatus },
                                    }))
                                    await apiFetch(`/tasks/${task.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        internal_notes: `total_products=${controlEdits[task.id]?.total || 0}; completed_products=${newCompleted}`,
                                        status: newStatus,
                                      }),
                                    })
                                  }}
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="col-span-1 text-slate-500">{koName}</div>
                          <div className="col-span-2 px-2">
                            <Badge
                              variant={task.status === "DONE" ? "default" : "outline"}
                              className={task.status === "DONE" ? "bg-emerald-500 hover:bg-emerald-600" : "text-slate-600 border-slate-300"}
                            >
                              {statusLabel(controlEdits[task.id]?.status || task.status)}
                            </Badge>
                          </div>
                          <div className="col-span-1 text-right opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-1 px-2">
                            {isEditing ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-slate-400 hover:text-blue-600"
                                  onClick={() => void saveTaskEdit()}
                                  disabled={savingTaskEdit}
                                >
                                  {savingTaskEdit ? "Saving..." : "Save"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-slate-400 hover:text-slate-600"
                                  onClick={cancelEditTask}
                                >
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                  onClick={() => startEditTask(task)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
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
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
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
            )}
          </>
        ) : mstPhase === "FINAL" ? (
          <>
            <div className="border-b flex gap-6">
              {[
                { id: "final", label: "Finalizimi" },
                { id: "ga", label: "Shenime GA/KA" },
              ].map((tab) => {
                const isActive = mstTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMstTab(tab.id as typeof mstTab)}
                    className={[
                      "relative pb-3 text-sm font-medium",
                      tab.id === "ga" ? "ml-auto" : "",
                      isActive ? "text-blue-600" : "text-muted-foreground",
                    ].join(" ")}
                  >
                    {tab.label}
                    {isActive ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" /> : null}
                  </button>
                )
              })}
            </div>
            {mstTab === "ga" ? (
              renderGaNotes()
            ) : (
              <Card className="border-0 shadow-sm">
                <div className="p-6 space-y-6">
                  <div className="text-lg font-semibold tracking-tight">Finalizimi - Checklist</div>
                  
                  {/* Add new item */}
                  <div className="flex items-center gap-2 mb-4">
                    <Input
                      placeholder="Add checklist item..."
                      value={newFinalizationText}
                      onChange={(e) => setNewFinalizationText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !savingFinalization) {
                          void addFinalizationItem()
                        }
                      }}
                      className="flex-1"
                    />
                    <Button
                      onClick={() => void addFinalizationItem()}
                      disabled={!newFinalizationText.trim() || savingFinalization}
                      size="sm"
                    >
                      {savingFinalization ? "Adding..." : "Add"}
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {finalizationItems
                      .slice()
                      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                      .map((item) => {
                        const isEditing = editingFinalizationId === item.id
                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-4 p-4 rounded-lg border border-slate-100 hover:bg-slate-50/70 transition-colors"
                          >
                            <Checkbox
                              id={item.id}
                              checked={Boolean(finalizationChecks[item.id])}
                              onCheckedChange={(checked) =>
                                void toggleFinalizationChecklist(item.id, Boolean(checked))
                              }
                            />
                            <div className="flex-1">
                              {isEditing ? (
                                <Input
                                  value={editingFinalizationText}
                                  onChange={(e) => setEditingFinalizationText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !savingFinalization) {
                                      void saveFinalizationItem()
                                    } else if (e.key === "Escape") {
                                      cancelEditFinalizationItem()
                                    }
                                  }}
                                  className="border-slate-200"
                                  autoFocus
                                />
                              ) : (
                                <label
                                  htmlFor={item.id}
                                  className={`text-sm font-medium cursor-pointer ${finalizationChecks[item.id] ? "text-slate-400 line-through" : "text-slate-700"}`}
                                >
                                  {item.title}
                                </label>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {isEditing ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void saveFinalizationItem()}
                                    disabled={savingFinalization}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={cancelEditFinalizationItem}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => startEditFinalizationItem(item.id)}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => void deleteFinalizationItem(item.id)}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    Delete
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    {finalizationItems.length === 0 && (
                      <div className="text-sm text-muted-foreground text-center py-8">
                        No checklist items yet. Add one above.
                      </div>
                    )}
                  </div>
                  {finalizationItems.length > 0 && Object.values(finalizationChecks).filter(Boolean).length === finalizationItems.length && (
                    <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                      <div className="flex items-center gap-2 text-emerald-700 font-medium">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                        Projekti eshte gati per mbyllje!
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}
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
          <div className="mt-3 flex items-center gap-3">
            <span className="text-3xl font-semibold">{title}</span>
            {project?.is_template && (
              <Badge variant="secondary" className="text-amber-700 border-amber-300 bg-amber-50">Template</Badge>
            )}
          </div>
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
        <div className="flex items-center gap-3">
          {user?.role === "ADMIN" && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={project?.is_template ?? false}
                onCheckedChange={() => void toggleTemplate()}
              />
              <span className="text-muted-foreground">Template</span>
            </label>
          )}
          <Button className="rounded-xl">Settings</Button>
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" disabled={!canClosePhase || advancingPhase} onClick={() => void advancePhase()}>{advancingPhase ? "Closing..." : "Close Phase"}</Button>
      </div>

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

      {activeTab === "meeting-focus" ? (
        <Card className="p-6 mt-6">
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
        <Card className="p-6 mt-6">
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
              meetingChecklist.map((item, index) => {
                const isEditing = editingMeetingItemId === item.id
                return (
                  <div key={item.id} className="flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3">
                    <div className="mt-1 text-xs font-semibold text-slate-400">{index + 1}.</div>
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

      {/* Keep the rest of rendering logic similar to the source component; tabs will include Financials placeholder when active */}
    </div>
  )
}
