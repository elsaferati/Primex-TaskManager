"use client"

import * as React from "react"
import { useAuth } from "@/lib/auth"
import type { User, Task, CommonEntry, Project, Meeting, Department } from "@/lib/types"

type CommonType =
  | "late"
  | "absent"
  | "leave"
  | "blocked"
  | "oneH"
  | "personal"
  | "external"
  | "r1"
  | "problem"
  | "feedback"
  | "priority"

type LateItem = { entryId?: string; person: string; date: string; until: string; start?: string; note?: string }
type AbsentItem = { entryId?: string; person: string; date: string; from: string; to: string; note?: string }
type LeaveItem = { entryId?: string; person: string; startDate: string; endDate: string; fullDay: boolean; from?: string; to?: string; note?: string }
type BlockedItem = { title: string; person: string; date: string; note?: string }
type OneHItem = { title: string; person: string; date: string; note?: string }
type PersonalItem = { title: string; person: string; date: string; note?: string }
type ExternalItem = { title: string; date: string; time: string; platform: string; owner: string }
type R1Item = { title: string; date: string; owner: string; note?: string }
type ProblemItem = { entryId?: string; title: string; person: string; date: string; note?: string }
type FeedbackItem = { entryId?: string; title: string; person: string; date: string; note?: string }
type PriorityItem = { project: string; date: string; assignees: string[] }

type SwimlaneCell = {
  title: string
  subtitle?: string
  accentClass?: string
  assignees?: string[]
  placeholder?: boolean
  entryId?: string
  number?: number
}
type SwimlaneRow = {
  id: CommonType
  label: string
  count: number
  headerClass: string
  badgeClass: string
  items: SwimlaneCell[]
}

type MeetingColumnKey = "nr" | "day" | "topic" | "check" | "owner" | "time"
type MeetingColumn = { key: MeetingColumnKey; label: string; width?: string }
type MeetingRow = {
  id: string
  nr: number
  day?: string
  topic: string
  owner?: string
  time?: string
  isChecked?: boolean
}
type MeetingTemplate = {
  id: string
  title: string
  note?: string
  groupKey?: string
  columns: MeetingColumn[]
  rows: MeetingRow[]
  defaultOwner?: string
  defaultTime?: string
}

type MeetingChecklist = {
  id: string
  title: string
  note?: string | null
  default_owner?: string | null
  default_time?: string | null
  group_key?: string | null
  columns?: MeetingColumn[] | null
  position?: number | null
  items?: {
    id: string
    position: number
    title?: string | null
    day?: string | null
    owner?: string | null
    time?: string | null
    is_checked?: boolean | null
  }[]
}


const initials = (name: string) => {
  const cleaned = name.trim()
  if (!cleaned) return "?"
  const parts = cleaned.split(/\s+/)
  const first = parts[0]?.[0] || ""
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : ""
  return `${first}${last}`.toUpperCase()
}

export default function CommonViewPage() {
  const { apiFetch, user } = useAuth()
  const isAdmin = user?.role === "ADMIN"
  const printedAt = React.useMemo(() => new Date(), [])
  const printInitials = initials(user?.full_name || user?.username || "")

  // Utils
  const pad2 = (n: number) => String(n).padStart(2, "0")
  const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  const fromISODate = (s: string) => {
    const [y, m, d] = s.split("-").map(Number)
    return new Date(y, m - 1, d)
  }
  const addDays = (d: Date, n: number) => {
    const x = new Date(d)
    x.setDate(x.getDate() + n)
    return x
  }
  const getMonday = (d: Date) => {
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const day = date.getDay()
    const diff = (day === 0 ? -6 : 1) - day
    date.setDate(date.getDate() + diff)
    return date
  }
  const getWeekdays = (monday: Date) => [0, 1, 2, 3, 4].map((i) => addDays(monday, i))
  const formatDateHuman = (s: string) => {
    const d = fromISODate(s)
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`
  }
  const formatTime = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  const formatExternalMeetingWhen = (meeting: Meeting) => {
    const source = meeting.starts_at || meeting.created_at
    if (!source) return "Date TBD"
    const date = new Date(source)
    if (Number.isNaN(date.getTime())) return "Date TBD"
    const dateLabel = formatDateHuman(toISODate(date))
    const timeLabel = meeting.starts_at ? formatTime(date) : "TBD"
    return `${dateLabel} ${timeLabel}`
  }
  const alWeekdayShort = (d: Date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    return days[d.getDay()]
  }
  const getDayCode = (d: Date) => {
    const codes = ["H", "M", "MR", "E", "P", "S", "D"] // H=Monday, M=Tuesday, MR=Wednesday, E=Thursday, P=Friday
    return codes[d.getDay() === 0 ? 6 : d.getDay() - 1] || ""
  }

  // State
  const [users, setUsers] = React.useState<User[]>([])
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [commonData, setCommonData] = React.useState({
    late: [] as LateItem[],
    absent: [] as AbsentItem[],
    leave: [] as LeaveItem[],
    blocked: [] as BlockedItem[],
    oneH: [] as OneHItem[],
    personal: [] as PersonalItem[],
    external: [] as ExternalItem[],
    r1: [] as R1Item[],
    problems: [] as ProblemItem[],
    feedback: [] as FeedbackItem[],
    priority: [] as PriorityItem[],
  })
  const [dataLoaded, setDataLoaded] = React.useState(false)

  const [weekStart, setWeekStart] = React.useState<Date>(() => getMonday(new Date()))
  const [selectedDates, setSelectedDates] = React.useState<Set<string>>(new Set())
  const [multiMode, setMultiMode] = React.useState(false)
  const [typeFilters, setTypeFilters] = React.useState<Set<CommonType>>(new Set())
  const [typeMultiMode, setTypeMultiMode] = React.useState(false)

  // Modal state
  const [modalOpen, setModalOpen] = React.useState(false)
  const [formType, setFormType] = React.useState<"late" | "absent" | "leave" | "problem" | "feedback">("late")
  const [formPerson, setFormPerson] = React.useState("")
  const [formDate, setFormDate] = React.useState(toISODate(new Date()))
  const [formDelayStart, setFormDelayStart] = React.useState("08:00")
  const [formUntil, setFormUntil] = React.useState("09:00")
  const [formFrom, setFormFrom] = React.useState("08:00")
  const [formTo, setFormTo] = React.useState("12:00")
  const [formEndDate, setFormEndDate] = React.useState("")
  const [formFullDay, setFormFullDay] = React.useState(true)
  const [formTitle, setFormTitle] = React.useState("")
  const [formNote, setFormNote] = React.useState("")
  const [meetingPanelOpen, setMeetingPanelOpen] = React.useState(false)
  const [meetingTemplates, setMeetingTemplates] = React.useState<MeetingTemplate[]>([])
  const [activeMeetingId, setActiveMeetingId] = React.useState("")
  const [externalMeetingsOpen, setExternalMeetingsOpen] = React.useState(false)
  const [externalMeetings, setExternalMeetings] = React.useState<Meeting[]>([])
  const [externalMeetingTitle, setExternalMeetingTitle] = React.useState("")
  const [externalMeetingPlatform, setExternalMeetingPlatform] = React.useState("")
  const [externalMeetingStartsAt, setExternalMeetingStartsAt] = React.useState("")
  const [externalMeetingDepartmentId, setExternalMeetingDepartmentId] = React.useState("")
  const [creatingExternalMeeting, setCreatingExternalMeeting] = React.useState(false)
  const [externalMeetingChecklist, setExternalMeetingChecklist] = React.useState<MeetingChecklist | null>(null)
  const [externalMeetingChecklistItems, setExternalMeetingChecklistItems] = React.useState<
    Map<string, boolean>
  >(new Map())
  const [externalMeetingChecklistOpen, setExternalMeetingChecklistOpen] = React.useState(false)
  const [externalMeetingChecklistLoading, setExternalMeetingChecklistLoading] = React.useState(false)
  const [externalChecklistEditingId, setExternalChecklistEditingId] = React.useState<string | null>(null)
  const [externalChecklistEditTitle, setExternalChecklistEditTitle] = React.useState("")
  const [externalChecklistEditPrefix, setExternalChecklistEditPrefix] = React.useState<string>("")
  const [externalChecklistSavingId, setExternalChecklistSavingId] = React.useState<string | null>(null)
  const [externalChecklistDeletingId, setExternalChecklistDeletingId] = React.useState<string | null>(null)
  const [externalChecklistAddTitle, setExternalChecklistAddTitle] = React.useState("")
  const [externalChecklistAddOrder, setExternalChecklistAddOrder] = React.useState("")
  const [externalChecklistAdding, setExternalChecklistAdding] = React.useState(false)
  const [externalChecklistImageError, setExternalChecklistImageError] = React.useState(false)
  const [editingRowId, setEditingRowId] = React.useState<string | null>(null)
  const [editDraft, setEditDraft] = React.useState({
    day: "",
    topic: "",
    owner: "",
    time: "",
  })
  const [addDraft, setAddDraft] = React.useState({
    nr: "",
    day: "",
    topic: "",
    owner: "",
    time: "",
  })
  const [isSavingEntry, setIsSavingEntry] = React.useState(false)
  const [editingMeetingTitle, setEditingMeetingTitle] = React.useState(false)
  const [meetingTitleDraft, setMeetingTitleDraft] = React.useState("")
  const [savingMeetingTitle, setSavingMeetingTitle] = React.useState(false)
  const [exportingExcel, setExportingExcel] = React.useState(false)

  // Derived
  const weekISOs = React.useMemo(() => getWeekdays(weekStart).map(toISODate), [weekStart])
  const allDaysSelected = React.useMemo(() => {
    if (selectedDates.size !== weekISOs.length) return false
    return weekISOs.every((iso) => selectedDates.has(iso))
  }, [selectedDates, weekISOs])
  const activeMeeting = React.useMemo(
    () => meetingTemplates.find((template) => template.id === activeMeetingId) || null,
    [activeMeetingId, meetingTemplates]
  )
  const boardMeetingIds = React.useMemo(
    () => meetingTemplates.filter((m) => m.groupKey === "board").map((m) => m.id),
    [meetingTemplates]
  )
  const staffMeetingIds = React.useMemo(
    () => meetingTemplates.filter((m) => m.groupKey === "staff").map((m) => m.id),
    [meetingTemplates]
  )
  const mergeOwnerColumn = React.useMemo(() => {
    if (!activeMeeting) return false
    const hasOwner = Boolean(activeMeeting.defaultOwner) || activeMeeting.rows.some((row) => row.owner)
    if (!hasOwner) return false
    return activeMeeting.rows.every((row, idx) => !row.owner || idx === 0)
  }, [activeMeeting])

  const startEditMeetingTitle = React.useCallback(() => {
    if (!activeMeeting) return
    setMeetingTitleDraft(activeMeeting.title || "")
    setEditingMeetingTitle(true)
  }, [activeMeeting])

  const cancelEditMeetingTitle = React.useCallback(() => {
    setEditingMeetingTitle(false)
    setMeetingTitleDraft("")
  }, [])

  const saveMeetingTitle = React.useCallback(async () => {
    if (!activeMeeting || !meetingTitleDraft.trim()) return
    setSavingMeetingTitle(true)
    try {
      const res = await apiFetch(`/checklists/${activeMeeting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: meetingTitleDraft.trim() }),
      })
      if (!res.ok) {
        let detail = "Failed to update meeting title"
        try {
          const data = (await res.json()) as { detail?: string }
          if (data?.detail) detail = data.detail
        } catch {
          // If response is not JSON, try to get status text
          if (res.status === 404) {
            detail = "Meeting template not found. Please refresh the page."
          } else if (res.status === 403) {
            detail = "Only admins can update meeting templates."
          } else {
            detail = `Failed to update meeting title (${res.status})`
          }
        }
        alert(detail)
        return
      }
      const updated = (await res.json()) as { id: string; title: string; [key: string]: unknown }
      setMeetingTemplates((prev) =>
        prev.map((meeting) => (meeting.id === activeMeeting.id ? { ...meeting, title: updated.title } : meeting))
      )
      setEditingMeetingTitle(false)
      setMeetingTitleDraft("")
    } catch (err) {
      console.error("Error updating meeting title:", err)
      alert("Failed to update meeting title. Please try again.")
    } finally {
      setSavingMeetingTitle(false)
    }
  }, [activeMeeting, meetingTitleDraft, apiFetch])

  const canSelectExternalDepartment = user?.role !== "STAFF"
  const externalMeetingDepartment = React.useMemo(
    () => departments.find((d) => d.id === externalMeetingDepartmentId) || null,
    [departments, externalMeetingDepartmentId]
  )
  const externalMeetingsSorted = React.useMemo(() => {
    return [...externalMeetings].sort((a, b) => {
      const aDate = a.starts_at || a.created_at
      const bDate = b.starts_at || b.created_at
      const aTime = aDate ? new Date(aDate).getTime() : 0
      const bTime = bDate ? new Date(bDate).getTime() : 0
      return bTime - aTime
    })
  }, [externalMeetings])
  const userById = React.useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  
  const reloadExternalChecklist = React.useCallback(async () => {
    setExternalMeetingChecklistLoading(true)
    try {
      const res = await apiFetch("/checklists?group_key=external&include_items=true")
      if (!res?.ok) return
      const data = (await res.json()) as MeetingChecklist[]
      const checklist = data.length > 0 ? data[0] : null
      setExternalMeetingChecklist(checklist)
      const itemsMap = new Map<string, boolean>()
      if (checklist?.items) {
        for (const item of checklist.items) {
          itemsMap.set(item.id, item.is_checked ?? false)
        }
      }
      setExternalMeetingChecklistItems(itemsMap)
    } catch (err) {
      console.error("Failed to load external meeting checklist", err)
    } finally {
      setExternalMeetingChecklistLoading(false)
    }
  }, [apiFetch])

  // Load external meeting checklist when panel opens
  React.useEffect(() => {
    if (!externalMeetingsOpen) return
    void reloadExternalChecklist()
  }, [externalMeetingsOpen, reloadExternalChecklist])

  const startEditExternalChecklistItem = React.useCallback(
    (itemId: string, currentTitle: string) => {
      const match = (currentTitle || "").match(/^(\d+(?:\.\d+)*)\.\s*(.*)$/)
      const prefix = match?.[1] || ""
      const titleOnly = (match?.[2] ?? currentTitle ?? "").trim()
      setExternalChecklistEditingId(itemId)
      setExternalChecklistEditPrefix(prefix)
      setExternalChecklistEditTitle(titleOnly)
    },
    []
  )

  const cancelEditExternalChecklistItem = React.useCallback(() => {
    setExternalChecklistEditingId(null)
    setExternalChecklistEditTitle("")
    setExternalChecklistEditPrefix("")
  }, [])

  const saveExternalChecklistItemTitle = React.useCallback(
    async (itemId: string) => {
      if (!isAdmin) return
      const nextTitle = externalChecklistEditTitle.trim()
      if (!nextTitle) return
      setExternalChecklistSavingId(itemId)
      try {
        const patchedTitle = externalChecklistEditPrefix ? `${externalChecklistEditPrefix}. ${nextTitle}` : nextTitle
        const res = await apiFetch(`/checklist-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: patchedTitle }),
        })
        if (!res?.ok) return
        await reloadExternalChecklist()
        setExternalChecklistEditingId(null)
        setExternalChecklistEditTitle("")
        setExternalChecklistEditPrefix("")
      } finally {
        setExternalChecklistSavingId(null)
      }
    },
    [apiFetch, externalChecklistEditPrefix, externalChecklistEditTitle, isAdmin, reloadExternalChecklist]
  )

  const deleteExternalChecklistItem = React.useCallback(
    async (itemId: string) => {
      if (!isAdmin) return
      const confirmed = window.confirm("Delete this checklist item?")
      if (!confirmed) return
      setExternalChecklistDeletingId(itemId)
      try {
        const res = await apiFetch(`/checklist-items/${itemId}`, { method: "DELETE" })
        if (!res?.ok) return
        await reloadExternalChecklist()
      } finally {
        setExternalChecklistDeletingId(null)
      }
    },
    [apiFetch, isAdmin, reloadExternalChecklist]
  )

  const addExternalChecklistItem = React.useCallback(async () => {
    if (!isAdmin) return
    const checklistId = externalMeetingChecklist?.id
    const title = externalChecklistAddTitle.trim()
    if (!checklistId || !title) return
    setExternalChecklistAdding(true)
    try {
      const orderNum = Number(externalChecklistAddOrder)
      const hasOrder = externalChecklistAddOrder.trim() !== "" && Number.isFinite(orderNum) && orderNum > 0
      let position: number | undefined
      if (hasOrder && externalMeetingChecklist?.items?.length) {
        // Translate "Order #" (1-based, main items only) into DB integer position (which includes subpoints).
        const sorted = externalMeetingChecklist.items
          .slice()
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        const isSubpoint = (t: string) => /^\d+\.\d+/.test((t || "").trim())
        const mainItems = sorted.filter((it) => !isSubpoint(it.title || ""))
        const insertIdx = Math.floor(orderNum) - 1
        if (insertIdx <= 0) {
          position = (mainItems[0]?.position ?? 0)
        } else if (insertIdx >= mainItems.length) {
          const maxPos = sorted.reduce((m, it) => Math.max(m, it.position ?? 0), 0)
          position = maxPos + 1
        } else {
          position = (mainItems[insertIdx]?.position ?? 0)
        }
      }
      const res = await apiFetch("/checklist-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklist_id: checklistId,
          item_type: "CHECKBOX",
          position,
          title,
          is_checked: false,
        }),
      })
      if (!res?.ok) return
      setExternalChecklistAddTitle("")
      setExternalChecklistAddOrder("")
      await reloadExternalChecklist()
    } finally {
      setExternalChecklistAdding(false)
    }
  }, [
    apiFetch,
    externalChecklistAddOrder,
    externalChecklistAddTitle,
    externalMeetingChecklist?.id,
    externalMeetingChecklist?.items,
    isAdmin,
    reloadExternalChecklist,
  ])

  // Reset checklist when panel closes
  React.useEffect(() => {
    if (!externalMeetingsOpen) {
      setExternalMeetingChecklist(null)
      setExternalMeetingChecklistItems(new Map())
      setExternalMeetingChecklistOpen(false)
      setExternalMeetingChecklistLoading(false)
    }
  }, [externalMeetingsOpen])

  const canCreateExternalMeeting = Boolean(externalMeetingTitle.trim()) && Boolean(externalMeetingDepartmentId)

  React.useEffect(() => {
    let mounted = true
    async function loadMeetings() {
      try {
        // Common view should only show the official meeting templates:
        // - group_key=board (BORD/GA)
        // - group_key=staff (STAFF/GA)
        const [boardRes, staffRes] = await Promise.all([
          apiFetch("/checklists?group_key=board&include_items=true"),
          apiFetch("/checklists?group_key=staff&include_items=true"),
        ])
        if (!boardRes?.ok && !staffRes?.ok) return
        const boardData = boardRes?.ok ? ((await boardRes.json()) as MeetingChecklist[]) : []
        const staffData = staffRes?.ok ? ((await staffRes.json()) as MeetingChecklist[]) : []
        const data = [...boardData, ...staffData]
        const templates = data
          .slice()
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((checklist) => {
            const rows = (checklist.items || [])
              .slice()
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
              .map((item) => ({
                id: item.id,
                nr: item.position ?? 0,
                day: item.day || undefined,
                topic: item.title || "",
                owner: item.owner || undefined,
                time: item.time || undefined,
                isChecked: item.is_checked ?? false,
              }))
            return {
              id: checklist.id,
              title: checklist.title,
              note: checklist.note || undefined,
              groupKey: checklist.group_key || undefined,
              columns: checklist.columns?.length
                ? checklist.columns
                : [
                    { key: "nr", label: "NR", width: "52px" },
                    { key: "topic", label: "M1 PIKAT" },
                    { key: "check", label: "", width: "48px" },
                    { key: "owner", label: "WHO", width: "90px" },
                    { key: "time", label: "WHEN", width: "90px" },
                  ],
              rows,
              defaultOwner: checklist.default_owner || undefined,
              defaultTime: checklist.default_time || undefined,
            }
          })
        if (mounted) {
          setMeetingTemplates(templates)
        }
      } catch (err) {
        console.error("Failed to load meeting checklists", err)
      }
    }
    void loadMeetings()
    return () => {
      mounted = false
    }
  }, [apiFetch])

  React.useEffect(() => {
    if (!meetingTemplates.length) return
    if (!activeMeetingId || !meetingTemplates.some((meeting) => meeting.id === activeMeetingId)) {
      setActiveMeetingId(meetingTemplates[0].id)
    }
  }, [activeMeetingId, meetingTemplates])

  React.useEffect(() => {
    setEditingRowId(null)
    setEditDraft({ day: "", topic: "", owner: "", time: "" })
    setAddDraft({ nr: "", day: "", topic: "", owner: "", time: "" })
  }, [activeMeetingId])

  React.useEffect(() => {
    if (externalMeetingDepartmentId) return
    if (user?.department_id) {
      setExternalMeetingDepartmentId(user.department_id)
      return
    }
    if (departments.length) {
      setExternalMeetingDepartmentId(departments[0].id)
    }
  }, [departments, externalMeetingDepartmentId, user?.department_id])

  // Load data on mount
  React.useEffect(() => {
    let mounted = true
    async function load() {
      try {
        // Initialize all data buckets
        const allData = {
          late: [] as LateItem[],
          absent: [] as AbsentItem[],
          leave: [] as LeaveItem[],
          blocked: [] as BlockedItem[],
          oneH: [] as OneHItem[],
          personal: [] as PersonalItem[],
          external: [] as ExternalItem[],
          r1: [] as R1Item[],
          problems: [] as ProblemItem[],
          feedback: [] as FeedbackItem[],
          priority: [] as PriorityItem[],
        }

        // Load users and departments first
        const usersEndpoint =
          user?.role && user.role !== "STAFF"
            ? "/users?include_all_departments=true"
            : "/users"
        const uRes = await apiFetch(usersEndpoint)
        let loadedUsers: User[] = []
        let projectNameById = new Map<string, string>()
        if (uRes?.ok) {
          loadedUsers = (await uRes.json()) as User[]
          if (mounted) setUsers(loadedUsers)
        }
        const depRes = await apiFetch("/departments")
        if (depRes?.ok) {
          const loadedDepartments = (await depRes.json()) as Department[]
          if (mounted) setDepartments(loadedDepartments)
        }
        const projectsEndpoint =
          user?.role && user.role !== "STAFF"
            ? "/projects?include_all_departments=true"
            : "/projects"
        const projectsRes = await apiFetch(projectsEndpoint)
        if (projectsRes?.ok) {
          const projects = (await projectsRes.json()) as Project[]
          projectNameById = new Map(
            projects
              .map((p) => {
                const baseTitle = (p.title || p.name || "").trim()
                if (!baseTitle) return null
                const title = p.project_type === "MST" && p.total_products != null && p.total_products > 0
                  ? `${baseTitle} - ${p.total_products}`
                  : baseTitle
                return [p.id, title] as [string, string]
              })
              .filter((entry): entry is [string, string] => entry !== null && entry[1] !== "")
          )
        }

        // Load common entries
        const ceRes = await apiFetch("/common-entries")
        if (ceRes?.ok) {
          const entries = (await ceRes.json()) as CommonEntry[]

          for (const e of entries) {
            // Prioritize assigned user, fallback to creator, then title
            let user = loadedUsers.find((u) => u.id === e.assigned_to_user_id)
            if (!user) {
              user = loadedUsers.find((u) => u.id === e.created_by_user_id)
            }
            const personName = user?.full_name || user?.username || e.title || "Unknown"
            
            // Use entry_date if available, otherwise parse from description or fallback to created_at
            let date = e.entry_date || null
            if (!date) {
              // Try to parse date from description
              const descDateMatch = (e.description || "").match(/Date:\s*(\d{4}-\d{2}-\d{2})/i)
              if (descDateMatch) {
                date = descDateMatch[1]
              } else {
                date = toISODate(new Date(e.created_at))
              }
            }

            if (e.category === "Delays") {
              // Parse until time from description
              let until = "09:00"
              let start = "08:00"
              let note = e.description || ""
              const startMatch = note.match(/Start:\s*(\d{1,2}:\d{2})/i)
              if (startMatch) {
                start = startMatch[1]
                note = note.replace(/Start:\s*\d{1,2}:\d{2}/i, "").trim()
              }
              const untilMatch = note.match(/Until:\s*(\d{1,2}:\d{2})/i)
              if (untilMatch) {
                until = untilMatch[1]
                note = note.replace(/Until:\s*\d{1,2}:\d{2}/i, "").trim()
              }
              // Remove date from note if present
              note = note.replace(/Date:\s*\d{4}-\d{2}-\d{2}/i, "").trim()
              
              allData.late.push({
                entryId: e.id,
                person: personName,
                date,
                until,
                start,
                note: note || undefined,
              })
            } else if (e.category === "Absences") {
              // Parse from/to times from description
              let from = "08:00"
              let to = "23:00"
              let note = e.description || ""
              const fromToMatch = note.match(/From:\s*(\d{1,2}:\d{2})\s*-\s*To:\s*(\d{1,2}:\d{2})/i)
              if (fromToMatch) {
                from = fromToMatch[1]
                to = fromToMatch[2]
                note = note.replace(/From:\s*\d{1,2}:\d{2}\s*-\s*To:\s*\d{1,2}:\d{2}/i, "").trim()
              }
              // Remove date from note if present
              note = note.replace(/Date:\s*\d{4}-\d{2}-\d{2}/i, "").trim()
              
              allData.absent.push({
                entryId: e.id,
                person: personName,
                date,
                from,
                to,
                note: note || undefined,
              })
            } else if (e.category === "Annual Leave") {
              // Parse leave information from description
              let startDate = date
              let endDate = date
              let fullDay = true
              let from = ""
              let to = ""
              let note = e.description || ""
              const dateMatches = note.match(/\d{4}-\d{2}-\d{2}/g) || []
              
              // Parse date range
              const dateRangeMatch = note.match(/Date range:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i)
              if (dateRangeMatch) {
                startDate = dateRangeMatch[1]
                endDate = dateRangeMatch[2]
                note = note.replace(/Date range:\s*\d{4}-\d{2}-\d{2}\s+to\s+\d{4}-\d{2}-\d{2}/i, "").trim()
              } else {
                const dateMatch = note.match(/Date:\s*(\d{4}-\d{2}-\d{2})/i)
                if (dateMatch) {
                  startDate = dateMatch[1]
                  endDate = dateMatch[1]
                  note = note.replace(/Date:\s*\d{4}-\d{2}-\d{2}/i, "").trim()
                } else if (dateMatches.length) {
                  const firstDate = dateMatches[0] ?? date
                  const secondDate = dateMatches[1] ?? firstDate
                  startDate = firstDate
                  endDate = secondDate
                }
              }
              
              // Parse full day or time range
              if (note.includes("Full day")) {
                fullDay = true
                note = note.replace(/\(Full day\)/i, "").trim()
              } else {
                const timeMatch = note.match(/\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\)/i)
                if (timeMatch) {
                  fullDay = false
                  from = timeMatch[1]
                  to = timeMatch[2]
                  note = note.replace(/\(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\)/i, "").trim()
                }
              }
              
              allData.leave.push({
                entryId: e.id,
                person: personName,
                startDate,
                endDate,
                fullDay,
                from: from || undefined,
                to: to || undefined,
                note: note || undefined,
              })
            } else if (e.category === "Blocks") {
              allData.blocked.push({
                title: e.title,
                person: personName,
                date,
                note: e.description || undefined,
              })
            } else if (e.category === "External Tasks") {
              allData.external.push({
                title: e.title,
                date,
                time: "14:00",
                platform: "Zoom",
                owner: personName,
              })
            } else if (e.category === "Problems") {
              allData.problems.push({
                entryId: e.id,
                title: e.title,
                person: personName,
                date,
                note: e.description || undefined,
              })
            } else if (e.category === "Complaints" || e.category === "Requests" || e.category === "Proposals") {
              allData.feedback.push({
                entryId: e.id,
                title: e.title,
                person: personName,
                date,
                note: e.description || undefined,
              })
            }
          }
        }

        // Load tasks for blocked, 1H, R1, external, and priority
        const tasksEndpoint =
          user?.role && user.role !== "STAFF"
            ? "/tasks?include_done=true&include_all_departments=true"
            : "/tasks?include_done=true"
        const tasksRes = await apiFetch(tasksEndpoint)
        if (tasksRes?.ok) {
          const tasks = (await tasksRes.json()) as Task[]
          
          // Collect all project IDs from tasks that aren't in our map yet
          const missingProjectIds = new Set<string>()
          for (const t of tasks) {
            if (t.project_id && !projectNameById.has(t.project_id)) {
              missingProjectIds.add(t.project_id)
            }
          }
          
          // Fetch missing projects individually
          if (missingProjectIds.size > 0) {
            const projectFetchPromises = Array.from(missingProjectIds).map(async (projectId) => {
              try {
                const projRes = await apiFetch(`/projects/${projectId}`)
                if (projRes?.ok) {
                  const project = (await projRes.json()) as Project
                  const baseTitle = (project.title || project.name || "").trim()
                  if (baseTitle) {
                    const projectName = project.project_type === "MST" && project.total_products != null && project.total_products > 0
                      ? `${baseTitle} - ${project.total_products}`
                      : baseTitle
                    projectNameById.set(projectId, projectName)
                  }
                }
              } catch (err) {
                // Project might not exist or user doesn't have access - ignore
                console.warn(`Failed to fetch project ${projectId}`, err)
              }
            })
            await Promise.all(projectFetchPromises)
          }
          
          const today = toISODate(new Date())
          const priorityMap = new Map<string, PriorityItem>()

          for (const t of tasks) {
            // Only show tasks that are in progress (not completed)
            // Skip tasks that are done (have completed_at set or status is "Done")
            if (t.completed_at) {
              continue
            }
            // Also skip if status is explicitly "Done"
            if (t.status && (t.status.toLowerCase() === "done" || t.status.toLowerCase() === "completed")) {
              continue
            }
            
            const assigneeId = t.assigned_to || t.assignees?.[0]?.id || t.assigned_to_user_id || null
            const assignee = t.assignees?.[0] || (assigneeId ? loadedUsers.find((u) => u.id === assigneeId) : null)
            const ownerName = assignee?.full_name || assignee?.username || null
            const assigneeNames = t.assignees?.length
              ? t.assignees.map((a) => a.full_name || a.username || a.email || "Unknown")
              : ownerName
              ? [ownerName]
              : []
            const taskDateSource = t.planned_for || t.due_date || t.start_date || t.created_at
            const taskDate = taskDateSource ? toISODate(new Date(taskDateSource)) : today

            if (t.is_bllok) {
              allData.blocked.push({
                title: t.title,
                person: ownerName || "Unknown",
                date: taskDate,
                note: t.description || undefined,
              })
            }
            if (t.is_1h_report) {
              allData.oneH.push({
                title: t.title,
                person: ownerName || "Unknown",
                date: taskDate,
                note: t.description || undefined,
              })
            }
            if (t.is_personal) {
              allData.personal.push({
                title: t.title,
                person: ownerName || "Unknown",
                date: taskDate,
                note: t.description || undefined,
              })
            }
            if (t.is_r1) {
              allData.r1.push({
                title: t.title,
                date: taskDate,
                owner: ownerName || "Unknown",
                note: t.description || undefined,
              })
            }
            if (t.task_type === "adhoc" && t.project_id) {
              allData.external.push({
                title: t.title,
                date: taskDate,
                time: "14:00",
                platform: "Zoom",
                owner: ownerName || "Unknown",
              })
            }

            // Priority items - only include if we have a project name
            if (t.project_id) {
              const projectName = projectNameById.get(t.project_id)
              // Skip if project name is not found (project might be deleted or inaccessible)
              if (!projectName) {
                continue
              }
              const key = `${t.project_id}-${taskDate}`
              if (!priorityMap.has(key)) {
                priorityMap.set(key, {
                  project: projectName,
                  date: taskDate,
                  assignees: [],
                })
              }
              const entry = priorityMap.get(key)!
              for (const name of assigneeNames) {
                if (!entry.assignees.includes(name)) {
                  entry.assignees.push(name)
                }
              }
            }
          }
          
          allData.priority = Array.from(priorityMap.values())
        }

        const meetingsEndpoint =
          user?.role && user.role !== "STAFF"
            ? "/meetings?include_all_departments=true"
            : user?.department_id
              ? `/meetings?department_id=${user.department_id}`
              : null

        if (meetingsEndpoint) {
          const meetingsRes = await apiFetch(meetingsEndpoint)
          if (meetingsRes?.ok) {
            const meetings = (await meetingsRes.json()) as Meeting[]
            if (mounted) setExternalMeetings(meetings)
            for (const meeting of meetings) {
              const startsAt = meeting.starts_at ? new Date(meeting.starts_at) : null
              const validStartsAt = startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt : null
              const createdAt = new Date(meeting.created_at)
              const validCreatedAt = Number.isNaN(createdAt.getTime()) ? null : createdAt
              const dateSource = validStartsAt ?? validCreatedAt
              if (!dateSource) continue

              const ownerUser = meeting.created_by
                ? loadedUsers.find((u) => u.id === meeting.created_by)
                : null
              const ownerName = ownerUser?.full_name || ownerUser?.username || "Unknown"

              allData.external.push({
                title: meeting.title || "External meeting",
                date: toISODate(dateSource),
                time: validStartsAt ? formatTime(validStartsAt) : "TBD",
                platform: meeting.platform?.trim() || "TBD",
                owner: ownerName,
              })
            }
          }
        }

        // Single state update with all data
        if (mounted) {
          setCommonData(allData)
        }

        // Select today by default
        if (mounted && selectedDates.size === 0) {
          setSelectedDates(new Set([toISODate(new Date())]))
        }
        
        // Mark data as loaded
        if (mounted) {
          setDataLoaded(true)
        }
      } catch (err) {
        console.error("Failed to load common view data", err)
      }
    }
    void load()
    return () => {
      mounted = false
    }
  }, [apiFetch, user?.role, user?.department_id])

  React.useEffect(() => {
    if (formType === "leave" && !formFullDay) {
      setFormFullDay(true)
    }
  }, [formType, formFullDay])

  // Filter helpers
  const inSelectedDates = (dateStr: string) => !selectedDates.size || selectedDates.has(dateStr)
  const leaveCovers = (leave: LeaveItem, dateStr: string) => {
    return dateStr >= leave.startDate && dateStr <= leave.endDate
  }

  // Filtered data
  const filtered = React.useMemo(() => {
    const late = commonData.late.filter((x) => inSelectedDates(x.date))
    const absent = commonData.absent.filter((x) => inSelectedDates(x.date))
    const leave = commonData.leave.filter((x) =>
      selectedDates.size ? Array.from(selectedDates).some((d) => leaveCovers(x, d)) : true
    )
    const blocked = commonData.blocked.filter((x) => inSelectedDates(x.date))
    const oneH = commonData.oneH.filter((x) => inSelectedDates(x.date))
    const personal = commonData.personal.filter((x) => inSelectedDates(x.date))
    const external = commonData.external.filter((x) => inSelectedDates(x.date))
    const r1 = commonData.r1.filter((x) => inSelectedDates(x.date))
    const problems = commonData.problems.filter((x) => inSelectedDates(x.date))
    const feedback = commonData.feedback.filter((x) => inSelectedDates(x.date))
    const priority = commonData.priority.filter((p) =>
      selectedDates.size ? Array.from(selectedDates).includes(p.date) : true
    )

    return { late, absent, leave, blocked, oneH, personal, external, r1, problems, feedback, priority }
  }, [commonData, selectedDates])

  // Common people for priority (from users)
  const commonPeople = React.useMemo(() => {
    return users
      .filter((u) => u.role !== "STAFF" || u.department_id)
      .slice(0, 4)
      .map((u) => u.full_name || u.username || "Unknown")
  }, [users])

  // Handlers
  const toggleDay = (iso: string) => {
    setSelectedDates((prev) => {
      const s = new Set(prev)
      if (!multiMode) {
        s.clear()
      }
      if (s.has(iso)) {
        if (s.size === 1) return s
        s.delete(iso)
      } else {
        s.add(iso)
      }
      return s
    })
  }

  const setTypeFilter = (type: CommonType | "all") => {
    if (type === "all") {
      setTypeFilters(new Set())
    } else if (!typeMultiMode) {
      setTypeFilters(new Set([type]))
    } else {
      setTypeFilters((prev) => {
        const s = new Set(prev)
        if (s.has(type)) {
          s.delete(type)
        } else {
          s.add(type)
        }
        return s
      })
    }
  }

  const selectAll = () => {
    if (!multiMode) {
      setMultiMode(true)
    }
    setSelectedDates(new Set(weekISOs))
  }

  const selectToday = () => {
    const today = new Date()
    setWeekStart(getMonday(today))
    setSelectedDates(new Set([toISODate(today)]))
  }

  const handlePrint = () => {
    window.print()
  }

  const handleExportExcel = async () => {
    if (exportingExcel) return
    setExportingExcel(true)
    try {
      const weekStartIso = toISODate(weekStart)
      const res = await apiFetch(`/exports/common.xlsx?week_start=${encodeURIComponent(weekStartIso)}`)
      if (!res?.ok) {
        const detail = await res.text()
        alert(detail || "Failed to export Excel.")
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `common_view_${weekStartIso}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Failed to export common view Excel", err)
      alert("Failed to export Excel.")
    } finally {
      setExportingExcel(false)
    }
  }

  const setWeek = (dateStr: string) => {
    const base = dateStr ? fromISODate(dateStr) : new Date()
    const monday = getMonday(base)
    setWeekStart(monday)
    const weekISO = getWeekdays(monday).map(toISODate)
    setSelectedDates((prev) => {
      const filtered = Array.from(prev).filter((d) => weekISO.includes(d))
      return filtered.length ? new Set(filtered) : new Set([weekISO[0]])
    })
  }

  const openModal = () => {
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    // Reset form
    setFormType("late")
    setFormPerson("")
    setFormDate(toISODate(new Date()))
    setFormDelayStart("08:00")
    setFormUntil("09:00")
    setFormFrom("08:00")
    setFormTo("12:00")
    setFormEndDate("")
    setFormFullDay(true)
    setFormTitle("")
    setFormNote("")
  }

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSavingEntry) return
    setIsSavingEntry(true)

    try {
      let category: string
      if (formType === "late") category = "Delays"
      else if (formType === "absent") category = "Absences"
      else if (formType === "leave") category = "Annual Leave"
      else if (formType === "problem") category = "Problems"
      else category = "Requests"

      // Find the user by name if person is selected
      let assignedUserId: string | null = null
      if (formPerson && formType !== "feedback") {
        const selectedUser = users.find(
          (u) =>
            u.full_name === formPerson ||
            u.username === formPerson ||
            u.email === formPerson ||
            `${u.full_name || ""}`.trim() === formPerson
        )
        if (selectedUser) {
          assignedUserId = selectedUser.id
        }
      }

      // Build description with all relevant information
      let description = formNote || ""
      
      // Add time/date information based on type
      if (formType === "late") {
        const startTime = formDelayStart || "08:00"
        const startLine = `Start: ${startTime}`
        const endLine = formUntil ? `Until: ${formUntil}` : ""
        const delayLines = endLine ? `${startLine}\n${endLine}` : startLine
        description = description ? `${description}\n\n${delayLines}` : delayLines
      } else if (formType === "absent" && formFrom && formTo) {
        description = description ? `${description}\n\nFrom: ${formFrom} - To: ${formTo}` : `From: ${formFrom} - To: ${formTo}`
      } else if (formType === "leave") {
        const leaveInfo =
          formEndDate && formEndDate !== formDate
            ? `Date range: ${formDate} to ${formEndDate}`
            : `Date: ${formDate}`
        description = description ? `${description}\n\n${leaveInfo}` : leaveInfo
      }
      
      // Add date information
      if (formDate && formType !== "leave") {
        description = description ? `${description}\nDate: ${formDate}` : `Date: ${formDate}`
      }

      // Create the entry
      const res = await apiFetch("/common-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          title: formType === "feedback" || formType === "problem" ? formTitle : formPerson || "Untitled",
          description: description || null,
          entry_date: formDate || null,
        }),
      })

      if (res.ok) {
        const createdEntry = (await res.json()) as CommonEntry

        // If we have a user to assign, assign them
        if (assignedUserId && createdEntry.id) {
          await apiFetch(`/common-entries/${createdEntry.id}/assign`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assigned_to_user_id: assignedUserId,
            }),
          })
        }

        // Trigger a reload
        window.location.reload()
      }
      closeModal()
    } catch (err) {
      console.error("Failed to submit form", err)
    } finally {
      setIsSavingEntry(false)
    }
  }

  const showCard = (type: CommonType) => {
    if (typeFilters.size === 0) return true
    return typeFilters.has(type)
  }

  const deleteCommonEntry = React.useCallback(
    async (entryId: string) => {
      if (!isAdmin) return
      const confirmed = window.confirm("Delete this common entry? This action cannot be undone.")
      if (!confirmed) return
      try {
        const res = await apiFetch(`/common-entries/${entryId}`, { method: "DELETE" })
        if (!res?.ok) {
          console.error("Failed to delete common entry", res?.status)
          return
        }
        window.location.reload()
      } catch (err) {
        console.error("Failed to delete common entry", err)
      }
    },
    [apiFetch, isAdmin]
  )

  const toggleChecklistItem = React.useCallback(
    async (itemId: string) => {
      const currentChecked = externalMeetingChecklistItems.get(itemId) ?? false
      const newChecked = !currentChecked
      
      // Optimistically update UI
      setExternalMeetingChecklistItems((prev) => {
        const next = new Map(prev)
        next.set(itemId, newChecked)
        return next
      })

      try {
        const res = await apiFetch(`/checklist-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_checked: newChecked }),
        })
        if (!res?.ok) {
          // Revert on error
          setExternalMeetingChecklistItems((prev) => {
            const next = new Map(prev)
            next.set(itemId, currentChecked)
            return next
          })
          console.error("Failed to update checklist item", res?.status)
        }
      } catch (err) {
        // Revert on error
        setExternalMeetingChecklistItems((prev) => {
          const next = new Map(prev)
          next.set(itemId, currentChecked)
          return next
        })
        console.error("Failed to update checklist item", err)
      }
    },
    [apiFetch, externalMeetingChecklistItems]
  )

  const submitExternalMeeting = React.useCallback(async () => {
    if (!externalMeetingTitle.trim()) return
    const departmentId = externalMeetingDepartmentId || user?.department_id
    if (!departmentId) {
      console.error("Department is required to create a meeting.")
      return
    }
    setCreatingExternalMeeting(true)
    try {
      const startsAt = externalMeetingStartsAt ? new Date(externalMeetingStartsAt).toISOString() : null
      const payload = {
        title: externalMeetingTitle.trim(),
        platform: externalMeetingPlatform.trim() || null,
        starts_at: startsAt,
        department_id: departmentId,
        project_id: null,
      }
      const res = await apiFetch("/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res?.ok) {
        console.error("Failed to create meeting", res?.status)
        return
      }
      const created = (await res.json()) as Meeting
      setExternalMeetings((prev) => [created, ...prev])
      const ownerName = user?.full_name || user?.username || user?.email || "Unknown"
      const dateSource = created.starts_at ? new Date(created.starts_at) : new Date(created.created_at)
      const safeDate = Number.isNaN(dateSource.getTime()) ? new Date() : dateSource
      setCommonData((prev) => ({
        ...prev,
        external: [
          ...prev.external,
          {
            title: created.title || "External meeting",
            date: toISODate(safeDate),
            time: created.starts_at ? formatTime(safeDate) : "TBD",
            platform: created.platform?.trim() || "TBD",
            owner: ownerName,
          },
        ],
      }))
      setExternalMeetingTitle("")
      setExternalMeetingPlatform("")
      setExternalMeetingStartsAt("")
      // Reset checklist after successful creation
      if (externalMeetingChecklist?.items) {
        const resetMap = new Map<string, boolean>()
        for (const item of externalMeetingChecklist.items) {
          resetMap.set(item.id, false)
        }
        setExternalMeetingChecklistItems(resetMap)
      }
    } finally {
      setCreatingExternalMeeting(false)
    }
  }, [
    apiFetch,
    externalMeetingTitle,
    externalMeetingPlatform,
    externalMeetingStartsAt,
    externalMeetingDepartmentId,
    user?.department_id,
    user?.email,
    user?.full_name,
    user?.username,
    formatTime,
    toISODate,
    externalMeetingChecklist,
  ])

  const buildSwimlaneCells = (items: SwimlaneCell[]) => {
    const baseItems = items.length ? items : [{ title: "No data available.", placeholder: true }]
    const totalCells = Math.max(3, Math.ceil(baseItems.length / 3) * 3)
    return [
      ...baseItems,
      ...Array.from({ length: totalCells - baseItems.length }, () => null),
    ]
  }


  const swimlaneRows = React.useMemo<SwimlaneRow[]>(() => {
    const lateItems: SwimlaneCell[] = filtered.late.map((x) => ({
      title: x.person,
      subtitle: `${x.start || "08:00"}-${x.until} - ${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      accentClass: "swimlane-accent delay",
      entryId: x.entryId,
    }))
    const absentItems: SwimlaneCell[] = filtered.absent.map((x) => ({
      title: x.person,
      subtitle: `${x.from} - ${x.to} - ${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      accentClass: "swimlane-accent absence",
      entryId: x.entryId,
    }))
    const leaveItems: SwimlaneCell[] = filtered.leave.map((x) => {
      const isRange = x.endDate && x.endDate !== x.startDate
      const dateLabel = isRange
        ? `${formatDateHuman(x.startDate)} - ${formatDateHuman(x.endDate)}`
        : formatDateHuman(x.startDate)
      const timeLabel = x.fullDay
        ? "Full day"
        : `${x.from || ""}${x.from && x.to ? " - " : ""}${x.to || ""}`.trim()
      return {
        title: x.person,
        subtitle: `${timeLabel} - ${dateLabel}${x.note ? ` - ${x.note}` : ""}`,
        accentClass: "swimlane-accent leave",
        entryId: x.entryId,
      }
    })
    const blockedItems: SwimlaneCell[] = filtered.blocked.map((x) => ({
      title: x.title,
      subtitle: `Owner: ${x.person} - ${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      accentClass: "swimlane-accent blocked",
    }))
    const oneHItems: SwimlaneCell[] = filtered.oneH.map((x) => ({
      title: x.title,
      subtitle: `Owner: ${x.person} - ${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      accentClass: "swimlane-accent oneh",
    }))
    const personalItems: SwimlaneCell[] = filtered.personal.map((x) => ({
      title: x.title,
      subtitle: `Owner: ${x.person} - ${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      accentClass: "swimlane-accent personal",
    }))
    const externalItems: SwimlaneCell[] = filtered.external.map((x) => ({
      title: x.title,
      subtitle: `${x.time} - ${formatDateHuman(x.date)} - ${x.platform} - ${x.owner}`,
      accentClass: "swimlane-accent external",
    }))
    const r1Items: SwimlaneCell[] = filtered.r1.map((x) => ({
      title: x.title,
      subtitle: `Owner: ${x.owner} - ${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      accentClass: "swimlane-accent r1",
    }))
    const problemItems: SwimlaneCell[] = filtered.problems.map((x) => ({
      title: x.title,
      subtitle: `${x.person} - ${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      accentClass: "swimlane-accent problem",
      entryId: x.entryId,
    }))
    const feedbackItems: SwimlaneCell[] = filtered.feedback.map((x) => ({
      title: x.title,
      subtitle: `${x.person} - ${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      accentClass: "swimlane-accent feedback",
      entryId: x.entryId,
    }))
    const priorityItems: SwimlaneCell[] = filtered.priority.map((p, idx) => ({
      title: p.project,
      assignees: p.assignees,
      accentClass: "swimlane-accent priority",
      number: idx + 1,
    }))

    return [
      {
        id: "late",
        label: "Delays",
        count: filtered.late.length,
        headerClass: "swimlane-header delay",
        badgeClass: "swimlane-badge delay",
        items: lateItems,
      },
      {
        id: "absent",
        label: "Absences",
        count: filtered.absent.length,
        headerClass: "swimlane-header absence",
        badgeClass: "swimlane-badge absence",
        items: absentItems,
      },
      {
        id: "leave",
        label: "Annual Leave",
        count: filtered.leave.length,
        headerClass: "swimlane-header leave",
        badgeClass: "swimlane-badge leave",
        items: leaveItems,
      },
      {
        id: "external",
        label: "External Meetings",
        count: filtered.external.length,
        headerClass: "swimlane-header external",
        badgeClass: "swimlane-badge external",
        items: externalItems,
      },
      {
        id: "blocked",
        label: "BLLOK",
        count: filtered.blocked.length,
        headerClass: "swimlane-header blocked",
        badgeClass: "swimlane-badge blocked",
        items: blockedItems,
      },
      {
        id: "oneH",
        label: "1H",
        count: filtered.oneH.length,
        headerClass: "swimlane-header oneh",
        badgeClass: "swimlane-badge oneh",
        items: oneHItems,
      },
      {
        id: "personal",
        label: "Personal",
        count: filtered.personal.length,
        headerClass: "swimlane-header personal",
        badgeClass: "swimlane-badge personal",
        items: personalItems,
      },
      {
        id: "r1",
        label: "R1",
        count: filtered.r1.length,
        headerClass: "swimlane-header r1",
        badgeClass: "swimlane-badge r1",
        items: r1Items,
      },
      {
        id: "priority",
        label: "Projects",
        count: filtered.priority.length,
        headerClass: "swimlane-header priority",
        badgeClass: "swimlane-badge priority",
        items: priorityItems,
      },
      {
        id: "problem",
        label: "Problems",
        count: filtered.problems.length,
        headerClass: "swimlane-header problem",
        badgeClass: "swimlane-badge problem",
        items: problemItems,
      },
      {
        id: "feedback",
        label: "Complaints/Requests/Proposals",
        count: filtered.feedback.length,
        headerClass: "swimlane-header feedback",
        badgeClass: "swimlane-badge feedback",
        items: feedbackItems,
      },
    ]
  }, [filtered])

  // Organize data by day for table view
  const tableDataByDay = React.useMemo(() => {
    if (!allDaysSelected) return null
    
    const dataByDay: Record<string, {
      late: LateItem[]
      absent: AbsentItem[]
      leave: LeaveItem[]
      blocked: BlockedItem[]
      oneH: OneHItem[]
      personal: PersonalItem[]
      external: ExternalItem[]
      r1: R1Item[]
      problems: ProblemItem[]
      feedback: FeedbackItem[]
      priority: PriorityItem[]
    }> = {}
    
    weekISOs.forEach((iso) => {
      dataByDay[iso] = {
        late: filtered.late.filter((x) => x.date === iso),
        absent: filtered.absent.filter((x) => x.date === iso),
        leave: filtered.leave.filter((x) => iso >= x.startDate && iso <= x.endDate),
        blocked: filtered.blocked.filter((x) => x.date === iso),
        oneH: filtered.oneH.filter((x) => x.date === iso),
        personal: filtered.personal.filter((x) => x.date === iso),
        external: filtered.external.filter((x) => x.date === iso),
        r1: filtered.r1.filter((x) => x.date === iso),
        problems: filtered.problems.filter((x) => x.date === iso),
        feedback: filtered.feedback.filter((x) => x.date === iso),
        priority: filtered.priority.filter((x) => x.date === iso),
      }
    })
    
    return dataByDay
  }, [allDaysSelected, weekISOs, filtered])

  const swimlaneRowRefs = React.useRef<Record<string, HTMLDivElement | null>>({})
  const scrollSwimlaneRow = React.useCallback((rowId: CommonType, direction: "left" | "right") => {
    const node = swimlaneRowRefs.current[rowId]
    if (!node) return
    const delta = direction === "left" ? -320 : 320
    node.scrollBy({ left: delta, behavior: "smooth" })
  }, [])

  const updateMeetingChecked = React.useCallback((meetingId: string, itemId: string, nextChecked: boolean) => {
    setMeetingTemplates((prev) =>
      prev.map((meeting) => {
        if (meeting.id !== meetingId) return meeting
        return {
          ...meeting,
          rows: meeting.rows.map((row) =>
            row.id === itemId ? { ...row, isChecked: nextChecked } : row
          ),
        }
      })
    )
  }, [])

  const toggleMeetingItem = React.useCallback(
    async (meetingId: string, itemId: string, nextChecked: boolean) => {
      const currentChecked =
        meetingTemplates
          .find((meeting) => meeting.id === meetingId)
          ?.rows.find((row) => row.id === itemId)?.isChecked ?? false
      updateMeetingChecked(meetingId, itemId, nextChecked)
      try {
        const res = await apiFetch(`/checklist-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_checked: nextChecked }),
        })
        if (!res.ok) {
          updateMeetingChecked(meetingId, itemId, currentChecked)
        }
      } catch (err) {
        updateMeetingChecked(meetingId, itemId, currentChecked)
      }
    },
    [apiFetch, meetingTemplates, updateMeetingChecked]
  )

  const startEditMeetingRow = React.useCallback((row: MeetingRow) => {
    setEditingRowId(row.id)
    setEditDraft({
      day: row.day || "",
      topic: row.topic || "",
      owner: row.owner || "",
      time: row.time || "",
    })
  }, [])

  const cancelEditMeetingRow = React.useCallback(() => {
    setEditingRowId(null)
    setEditDraft({ day: "", topic: "", owner: "", time: "" })
  }, [])

  const saveMeetingRow = React.useCallback(
    async (meetingId: string, rowId: string) => {
      const payload = {
        title: editDraft.topic.trim().toUpperCase(),
        day: editDraft.day.trim() || null,
        owner: editDraft.owner.trim() || null,
        time: editDraft.time.trim() || null,
      }
      if (!payload.title) return
      const previous = meetingTemplates
        .find((meeting) => meeting.id === meetingId)
        ?.rows.find((row) => row.id === rowId)
      setMeetingTemplates((prev) =>
        prev.map((meeting) => {
          if (meeting.id !== meetingId) return meeting
          return {
            ...meeting,
            rows: meeting.rows.map((row) =>
              row.id === rowId
                ? {
                    ...row,
                    day: payload.day ?? undefined,
                    topic: payload.title,
                    owner: payload.owner ?? undefined,
                    time: payload.time ?? undefined,
                  }
                : row
            ),
          }
        })
      )
      setEditingRowId(null)
      try {
        const res = await apiFetch(`/checklist-items/${rowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          if (previous) {
            setMeetingTemplates((prev) =>
              prev.map((meeting) => {
                if (meeting.id !== meetingId) return meeting
                return {
                  ...meeting,
                  rows: meeting.rows.map((row) =>
                    row.id === rowId
                      ? {
                          ...row,
                          day: previous.day,
                          topic: previous.topic,
                          owner: previous.owner,
                          time: previous.time,
                        }
                      : row
                  ),
                }
              })
            )
          }
        }
      } catch (err) {
        if (previous) {
          setMeetingTemplates((prev) =>
            prev.map((meeting) => {
              if (meeting.id !== meetingId) return meeting
              return {
                ...meeting,
                rows: meeting.rows.map((row) =>
                  row.id === rowId
                    ? {
                        ...row,
                        day: previous.day,
                        topic: previous.topic,
                        owner: previous.owner,
                        time: previous.time,
                      }
                    : row
                ),
              }
            })
          )
        }
      }
    },
    [apiFetch, editDraft, meetingTemplates]
  )

  const resequenceMeetingRows = React.useCallback(
    async (meetingId: string, rowsOverride?: MeetingRow[]) => {
      const meeting = meetingTemplates.find((template) => template.id === meetingId)
      const rows = rowsOverride || meeting?.rows || []
      if (!rows.length) return
      const sortedRows = rows.slice().sort((a, b) => a.nr - b.nr || a.id.localeCompare(b.id))
      const resequencedRows = sortedRows.map((row, index) => ({
        ...row,
        nr: index + 1,
      }))
      const updates = resequencedRows
        .map((row) => ({ row, nextNr: row.nr }))
        .filter(({ row, nextNr }) => (rows.find((r) => r.id === row.id)?.nr ?? 0) !== nextNr)
      if (!updates.length) return

      setMeetingTemplates((prev) =>
        prev.map((template) => {
          if (template.id !== meetingId) return template
          if (rowsOverride) {
            return { ...template, rows: resequencedRows }
          }
          const updatedRows = template.rows.map((row) => {
            const next = updates.find((entry) => entry.row.id === row.id)
            return next ? { ...row, nr: next.nextNr } : row
          })
          return { ...template, rows: updatedRows }
        })
      )

      try {
        await Promise.all(
          updates.map(({ row, nextNr }) =>
            apiFetch(`/checklist-items/${row.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ position: nextNr }),
            })
          )
        )
      } catch (err) {
        console.error("Failed to resequence meeting items", err)
      }
    },
    [apiFetch, meetingTemplates]
  )

  const deleteMeetingRow = React.useCallback(
    async (meetingId: string, rowId: string) => {
      const confirmed = window.confirm(
        "Delete this checklist item? This action cannot be undone."
      )
      if (!confirmed) return
      const previousRows = meetingTemplates.find((meeting) => meeting.id === meetingId)?.rows || []
      setMeetingTemplates((prev) =>
        prev.map((meeting) => {
          if (meeting.id !== meetingId) return meeting
          return {
            ...meeting,
            rows: meeting.rows.filter((row) => row.id !== rowId),
          }
        })
      )
      try {
        const res = await apiFetch(`/checklist-items/${rowId}`, {
          method: "DELETE",
        })
        if (!res.ok) {
          setMeetingTemplates((prev) =>
            prev.map((meeting) => {
              if (meeting.id !== meetingId) return meeting
              return {
                ...meeting,
                rows: previousRows,
              }
            })
          )
          return
        }
        const remainingRows = previousRows.filter((row) => row.id !== rowId)
        await resequenceMeetingRows(meetingId, remainingRows)
      } catch (err) {
        setMeetingTemplates((prev) =>
          prev.map((meeting) => {
            if (meeting.id !== meetingId) return meeting
            return {
              ...meeting,
              rows: previousRows,
            }
          })
        )
      }
    },
    [apiFetch, meetingTemplates, resequenceMeetingRows]
  )

  const addMeetingRow = React.useCallback(
    async (meetingId: string) => {
      const topic = addDraft.topic.trim().toUpperCase()
      if (!topic) return
      const meeting = meetingTemplates.find((template) => template.id === meetingId)
      if (!meeting) return
      const parsedNr = Number(addDraft.nr)
      const requestedNr = Number.isFinite(parsedNr) && parsedNr > 0 ? Math.floor(parsedNr) : null
      const nextPosition =
        requestedNr || Math.max(0, ...meeting.rows.map((row) => row.nr || 0)) + 1
      const payload = {
        checklist_id: meetingId,
        item_type: "CHECKBOX",
        position: nextPosition,
        title: topic,
        day: addDraft.day.trim() || null,
        owner: null,
        time: null,
        is_checked: false,
      }
      try {
        const res = await apiFetch("/checklist-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) return
        const created = await res.json()
        const createdRow: MeetingRow = {
          id: created.id,
          nr: requestedNr || created.position || nextPosition,
          day: created.day || undefined,
          topic: created.title || topic,
          owner: created.owner || undefined,
          time: created.time || undefined,
          isChecked: created.is_checked ?? false,
        }
        const baseRows = meeting?.rows || []
        const nextRows = requestedNr
          ? baseRows.map((row) =>
              row.nr >= requestedNr ? { ...row, nr: row.nr + 1 } : row
            ).concat(createdRow)
          : baseRows.concat(createdRow)
        setMeetingTemplates((prev) =>
          prev.map((template) => {
            if (template.id !== meetingId) return template
            return {
              ...template,
              rows: nextRows,
            }
          })
        )
        setAddDraft({ nr: "", day: "", topic: "", owner: "", time: "" })
        await resequenceMeetingRows(meetingId, nextRows)
      } catch (err) {
        console.error("Failed to add meeting item", err)
      }
    },
    [addDraft, apiFetch, meetingTemplates, resequenceMeetingRows]
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#ffffff" }}>
      <style>{`
        * { box-sizing: border-box; }
        :root {
          --swim-border: #d7dbe3;
          --swim-text: #0f172a;
          --swim-muted: #6b7280;
          --delay-bg: #fff4e6;
          --delay-accent: #f59e0b;
          --absence-bg: #ffe9e9;
          --absence-accent: #ef4444;
          --leave-bg: #e9f9ef;
          --leave-accent: #22c55e;
          --blocked-bg: #ffe7ea;
          --blocked-accent: #be123c;
          --oneh-bg: #e0f2fe;
          --oneh-accent: #0ea5e9;
          --personal-bg: #f3e8ff;
          --personal-accent: #a855f7;
          --external-bg: #e0f2fe;
          --external-accent: #0284c7;
          --r1-bg: #dcfce7;
          --r1-accent: #16a34a;
          --problem-bg: #ecfeff;
          --problem-accent: #0891b2;
          --feedback-bg: #e2e8f0;
          --feedback-accent: #64748b;
          --priority-bg: #fef3c7;
          --priority-accent: #d97706;
          --cell-bg: #ffffff;
          --cell-tint: #f9fafb;
        }
        
        /* Modern Header */
        .common-sticky {
          position: sticky;
          top: 0;
          z-index: 20;
          background: #ffffff;
        }
        .top-header { 
          background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
          padding: 12px 24px; 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          flex-shrink: 0;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .page-title h1 { 
          font-size: 20px; 
          margin-bottom: 2px; 
          color: white;
          font-weight: 700;
          letter-spacing: -0.5px;
        }
        .page-title p { 
          font-size: 11px; 
          color: rgba(255, 255, 255, 0.9); 
          margin: 0; 
        }
        
        /* Modern Buttons */
        .btn-primary { 
          background: white; 
          color: #475569; 
          border: none; 
          padding: 6px 14px; 
          border-radius: 6px; 
          font-size: 12px; 
          font-weight: 600;
          cursor: pointer; 
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .btn-primary:hover { 
          background: #f8f9fa;
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
        }
        .btn-outline { 
          background: rgba(255, 255, 255, 0.2); 
          color: white; 
          border: 1px solid rgba(255, 255, 255, 0.3); 
          padding: 6px 14px; 
          border-radius: 6px; 
          font-size: 12px; 
          font-weight: 600;
          cursor: pointer; 
          transition: all 0.2s ease;
        }
        .btn-outline:hover { 
          background: rgba(255, 255, 255, 0.3);
          border-color: rgba(255, 255, 255, 0.5);
        }
        .btn-outline.active {
          background: #ffffff;
          color: #0f172a;
          border-color: #ffffff;
          box-shadow: 0 4px 10px rgba(15, 23, 42, 0.2);
        }

        /* Button style for light panels (dark text on light background) */
        .btn-surface {
          background: #f8fafc;
          color: #0f172a;
          border: 1px solid #cbd5e1;
          padding: 8px 12px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-surface:hover:not(:disabled) {
          background: #f1f5f9;
          border-color: #94a3b8;
        }
        .btn-surface:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .external-checklist-media {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #ffffff;
          padding: 10px;
          margin-bottom: 12px;
        }
        .external-checklist-media-title {
          font-size: 12px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 8px;
        }
        .external-checklist-media img {
          width: 100%;
          height: auto;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          display: block;
          background: #f8fafc;
        }
        .external-checklist-media-hint {
          font-size: 12px;
          color: #64748b;
          margin-top: 8px;
          line-height: 1.4;
        }

        .no-print { display: inline-flex; }
        .hide-in-print { display: none !important; }
        .hide-when-all-days { display: none !important; }
        .print-header,
        .print-footer {
          display: none;
        }
        @media print {
          @page {
            margin: 0.36in 0.08in 0.51in 0.2in;
          }
          .no-print { display: none !important; }
          .hide-in-print { display: none !important; }
          .swimlane-delete { display: none !important; }
          .week-table-delete { display: none !important; }
          aside, header, .command-palette, .top-header, .common-toolbar, .meeting-panel, .modal {
            display: none !important;
          }
          body, html { background: white; }
          main { padding: 0 !important; }
          .view-container { padding: 0; background: white; }
          .print-page {
            position: relative;
            padding-bottom: 0.35in;
          }
          .week-table-view { display: block !important; padding-bottom: 0.35in; }
          .print-header {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            margin-bottom: 12px;
          }
          .print-title {
            font-size: 16px;
            font-weight: 700;
            text-transform: uppercase;
            text-align: center;
            color: #0f172a;
          }
          .print-datetime {
            text-align: right;
            font-size: 10px;
            color: #334155;
          }
          .print-footer {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0.3in;
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            padding-left: 0.2in;
            padding-right: 0.08in;
            font-size: 10px;
            color: #334155;
          }
          .print-page-count {
            grid-column: 2;
            text-align: center;
          }
          .print-page-count::before {
            content: "Page " counter(page) " / " counter(pages);
          }
          .print-initials {
            grid-column: 3;
            text-align: right;
          }
          .swimlane-board { gap: 12px; }
          .swimlane-row { break-inside: avoid; page-break-inside: avoid; }
          .swimlane-row-nav { display: none !important; }
          .swimlane-content-scroll { overflow: visible !important; padding-right: 0; }
          .swimlane-content {
            grid-auto-flow: row !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            grid-auto-columns: auto !important;
            min-width: 0 !important;
            width: 100% !important;
          }
          .swimlane-board {
            border: 1px solid #111827 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          .swimlane-row + .swimlane-row {
            border-top: 2px solid #111827 !important;
          }
          .swimlane-row {
            margin-top: 6px;
          }
          .swimlane-header,
          .swimlane-cell {
            padding-top: 18px;
            padding-bottom: 18px;
          }
          .swimlane-header,
          .swimlane-badge,
          .swimlane-cell {
            background: #ffffff !important;
            color: #111827 !important;
          }
          .swimlane-header,
          .swimlane-cell {
            border-color: #111827 !important;
          }
        }
        
        /* View Container */
        .view-container { 
          padding: 16px 24px; 
          overflow: visible; 
          flex-grow: 1; 
          min-height: 0;
          background: linear-gradient(to bottom, #f8f9fa 0%, #ffffff 100%);
        }
        .meeting-panel {
          margin: 16px 24px 0;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 16px 18px;
          box-shadow: 0 10px 20px rgba(15, 23, 42, 0.06);
        }
        .external-meetings-panel {
          margin-top: 12px;
        }
        .meeting-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .meeting-title {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
        }
        .meeting-subtitle {
          font-size: 12px;
          color: #64748b;
          margin-top: 2px;
        }
        .meeting-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 12px;
        }
        .meeting-dropdown {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 220px;
        }
        .meeting-dropdown label {
          font-size: 12px;
          font-weight: 700;
          color: #475569;
        }
        .meeting-dropdown select {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px 10px;
          background: #ffffff;
          color: #0f172a;
          font-size: 12px;
          font-weight: 600;
        }
        .meeting-chip {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          color: #334155;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .meeting-chip.active {
          background: #2563eb;
          border-color: #2563eb;
          color: #ffffff;
        }
        .meeting-table-card {
          margin-top: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
          background: #ffffff;
        }
        .meeting-table-header {
          padding: 10px 12px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .meeting-table-title {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
        }
        .meeting-table-meta {
          font-size: 12px;
          color: #64748b;
        }
        .meeting-note {
          padding: 8px 10px;
          background: #fff1f2;
          color: #b91c1c;
          font-size: 12px;
          font-weight: 700;
          border-bottom: 1px solid #fecdd3;
        }
        .meeting-table-wrap {
          overflow-x: auto;
        }
        .meeting-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .external-meetings-grid {
          display: grid;
          /* Make the left panel wider so checklist titles have room */
          grid-template-columns: minmax(360px, 640px) minmax(0, 1fr);
          gap: 16px;
          margin-top: 14px;
        }
        .external-meeting-form-title {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 8px;
        }
        .external-meeting-fields {
          display: grid;
          gap: 10px;
        }
        .external-meeting-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .external-meeting-hint {
          font-size: 12px;
          color: #64748b;
        }
        .external-meeting-cards {
          display: grid;
          gap: 10px;
        }
        .external-meeting-card {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 10px 12px;
          background: #ffffff;
          box-shadow: 0 6px 14px rgba(15, 23, 42, 0.04);
        }
        .external-meeting-title {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
        }
        .external-meeting-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 12px;
          font-size: 12px;
          color: #64748b;
          margin-top: 4px;
        }
        .external-meeting-empty {
          border: 1px dashed #cbd5e1;
          border-radius: 12px;
          padding: 12px;
          font-size: 12px;
          color: #94a3b8;
        }
        @media (max-width: 900px) {
          .external-meetings-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 720px) {
          .external-meeting-row {
            grid-template-columns: 1fr;
          }
        }
        .meeting-table th {
          background: #e2e8f0;
          text-align: left;
          padding: 8px 10px;
          font-weight: 700;
          color: #1f2937;
          border-bottom: 1px solid #cbd5e1;
          white-space: nowrap;
        }
        .meeting-table td {
          border-top: 1px solid #e2e8f0;
          padding: 8px 10px;
          vertical-align: top;
          color: #0f172a;
          white-space: nowrap;
        }
        .meeting-check-cell {
          text-align: center;
          vertical-align: middle;
        }
        .meeting-check-cell input {
          accent-color: #64748b;
          width: 16px;
          height: 16px;
        }
        .btn-icon {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #475569;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .btn-icon:hover {
          background: #f1f5f9;
          color: #334155;
        }
        .btn-icon.danger {
          color: #b91c1c;
          border-color: #fecaca;
          background: #fff1f2;
        }
        .btn-icon.danger:hover {
          background: #ffe4e6;
          color: #991b1b;
        }
        .meeting-owner-cell {
          text-align: center;
          font-weight: 600;
          color: #1f2937;
        }
        .meeting-empty {
          margin-top: 12px;
          font-size: 12px;
          color: #94a3b8;
        }

        .swimlane-board {
          border: 1px solid var(--swim-border);
          border-radius: 12px;
          overflow: hidden;
          background: #ffffff;
          box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
          width: 100%;
        }
        .swimlane-row {
          display: flex;
        }
        .swimlane-row + .swimlane-row {
          border-top: 1px solid var(--swim-border);
        }
        .swimlane-header {
          width: 150px;
          padding: 10px 10px;
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          column-gap: 8px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.2px;
          border-right: 1px solid var(--swim-border);
          color: var(--swim-text);
          line-height: 1.1;
          font-size: 12px;
          word-break: break-word;
        }
        .swimlane-badge {
          min-width: 24px;
          height: 24px;
          padding: 0 6px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          border: 1px solid rgba(15, 23, 42, 0.12);
        }
        .swimlane-content-shell {
          position: relative;
          flex: 1;
          min-width: 0;
        }
        .swimlane-row-nav {
          position: absolute;
          top: 8px;
          right: 8px;
          display: flex;
          gap: 4px;
          z-index: 2;
        }
        .swimlane-row-nav button {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #64748b;
          border-radius: 8px;
          width: 24px;
          height: 24px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: none;
          font-size: 12px;
          opacity: 0.75;
          transition: all 0.2s ease;
        }
        .swimlane-row-nav button:hover {
          color: #334155;
          background: #e2e8f0;
          opacity: 1;
        }
        .swimlane-content-scroll {
          overflow-x: auto;
          padding-bottom: 6px;
          scroll-behavior: smooth;
          scrollbar-gutter: stable;
          padding-right: 40px;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .swimlane-content-scroll::-webkit-scrollbar {
          display: none;
        }
        .swimlane-content {
          flex: 1;
          display: grid;
          grid-template-columns: repeat(3, minmax(220px, 1fr));
          grid-auto-flow: column;
          grid-auto-columns: minmax(220px, 1fr);
          min-width: 660px;
        }
        .swimlane-cell {
          padding: 12px 14px;
          border-right: 1px solid var(--swim-border);
          border-bottom: 1px solid var(--swim-border);
          min-height: 68px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 4px;
          color: var(--swim-text);
          background: linear-gradient(180deg, var(--cell-bg) 0%, var(--cell-tint) 100%);
          position: relative;
        }
        .swimlane-cell:nth-child(3n) {
          border-right: 0;
        }
        .swimlane-cell.empty {
          background: #ffffff;
        }
        .swimlane-cell.placeholder {
          color: var(--swim-muted);
          font-style: italic;
        }
        .swimlane-title {
          font-weight: 700;
          font-size: 14px;
        }
        .swimlane-subtitle {
          font-size: 12px;
          color: var(--swim-muted);
        }
        .swimlane-delete {
          position: absolute;
          top: 6px;
          right: 6px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #dc2626;
          width: 22px;
          height: 22px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 14px;
          line-height: 1;
          opacity: 0.9;
          transition: all 0.2s ease;
        }
        .swimlane-delete:hover {
          background: #fee2e2;
          border-color: #fecaca;
          opacity: 1;
        }
        .swimlane-assignees {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .swimlane-avatar {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 999px;
          background: #e2e8f0;
          color: #0f172a;
          font-weight: 700;
          font-size: 10px;
          letter-spacing: 0.02em;
          border: 1px solid #cbd5e1;
        }
        
        /* Week Table View - Shows when all days are selected */
        .week-table-view {
          display: block;
          width: 100%;
          margin-bottom: 20px;
        }
        .week-table {
          width: 100%;
          border-collapse: collapse;
          border: 2px solid #111827;
          font-size: 11px;
        }
        .week-table th {
          border: 1px solid #111827;
          background: #dbeafe;
          padding: 8px 6px;
          text-align: center;
          font-weight: 700;
          vertical-align: middle;
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .week-table thead tr:nth-child(2) th {
          top: 30px;
          z-index: 1;
        }
        .week-table-date-header {
          background: #bfdbfe !important;
          font-size: 10px;
        }
        .week-table-subheader {
          background: #dbeafe !important;
          font-size: 9px;
          font-weight: 600;
        }
        .week-table td {
          border: 1px solid #dee2e6;
          padding: 6px 8px;
          vertical-align: top;
          font-size: 10px;
        }
        .week-table-number {
          text-align: center;
          font-weight: 700;
          background: #f8f9fa;
        }
        .week-table-label {
          font-weight: 700;
          background: #f8f9fa;
        }
        .week-table-cell {
          min-height: 30px;
        }
        .week-table-entries {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .week-table-entry {
          font-size: 10px;
          line-height: 1.4;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .week-table-entry span {
          flex: 1;
        }
        .week-table-delete {
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #dc2626;
          width: 18px;
          height: 18px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 12px;
          line-height: 1;
          padding: 0;
        }
        .week-table-delete:hover {
          background: #fee2e2;
          border-color: #fecaca;
        }
        .week-table-avatars {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 2px;
        }
        .week-table-avatar {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: #e2e8f0;
          color: #0f172a;
          font-weight: 700;
          font-size: 9px;
          border: 1px solid #cbd5e1;
        }
        .week-table-empty {
          color: #adb5bd;
          font-style: italic;
        }
        @media print {
          .week-table-view {
            display: block !important;
          }
          .week-table {
            page-break-inside: avoid;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .week-table thead {
            display: table-header-group;
          }
          .week-table th,
          .week-table td {
            border: 1px solid #111827 !important;
          }
        }
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 999px;
          border: 1px solid var(--swim-border);
          background: #ffffff;
          color: #475569;
          font-size: 10px;
          font-weight: 700;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
        }
        .swimlane-header.delay { background: var(--delay-bg); color: #c2410c; }
        .swimlane-header.absence { background: var(--absence-bg); color: #b91c1c; }
        .swimlane-header.leave { background: var(--leave-bg); color: #15803d; }
        .swimlane-header.blocked { background: var(--blocked-bg); color: #9f1239; }
        .swimlane-header.oneh { background: var(--oneh-bg); color: #0369a1; }
        .swimlane-header.personal { background: var(--personal-bg); color: #7e22ce; }
        .swimlane-header.external { background: var(--external-bg); color: #0369a1; }
        .swimlane-header.r1 { background: var(--r1-bg); color: #15803d; }
        .swimlane-header.problem { background: var(--problem-bg); color: #0e7490; }
        .swimlane-header.feedback { background: var(--feedback-bg); color: #475569; }
        .swimlane-header.priority { background: var(--priority-bg); color: #b45309; }
        .swimlane-badge.delay { border-color: var(--delay-accent); color: #c2410c; }
        .swimlane-badge.absence { border-color: var(--absence-accent); color: #b91c1c; }
        .swimlane-badge.leave { border-color: var(--leave-accent); color: #15803d; }
        .swimlane-badge.blocked { border-color: var(--blocked-accent); color: #9f1239; }
        .swimlane-badge.oneh { border-color: var(--oneh-accent); color: #0369a1; }
        .swimlane-badge.personal { border-color: var(--personal-accent); color: #7e22ce; }
        .swimlane-badge.external { border-color: var(--external-accent); color: #0369a1; }
        .swimlane-badge.r1 { border-color: var(--r1-accent); color: #15803d; }
        .swimlane-badge.problem { border-color: var(--problem-accent); color: #0e7490; }
        .swimlane-badge.feedback { border-color: var(--feedback-accent); color: #475569; }
        .swimlane-badge.priority { border-color: var(--priority-accent); color: #b45309; }
        .swimlane-accent.delay { border-left: 4px solid var(--delay-accent); }
        .swimlane-accent.absence { border-left: 4px solid var(--absence-accent); }
        .swimlane-accent.leave { border-left: 4px solid var(--leave-accent); }
        .swimlane-accent.blocked { border-left: 4px solid var(--blocked-accent); }
        .swimlane-accent.oneh { border-left: 4px solid var(--oneh-accent); }
        .swimlane-accent.personal { border-left: 4px solid var(--personal-accent); }
        .swimlane-accent.external { border-left: 4px solid var(--external-accent); }
        .swimlane-accent.r1 { border-left: 4px solid var(--r1-accent); }
        .swimlane-accent.problem { border-left: 4px solid var(--problem-accent); }
        .swimlane-accent.feedback { border-left: 4px solid var(--feedback-accent); }
        .swimlane-accent.priority { border-left: 4px solid var(--priority-accent); }
        
        /* Modern Toolbar */
        .common-toolbar { 
          background: white; 
          padding: 8px 24px; 
          border-bottom: 1px solid #e5e7eb; 
          display: flex; 
          flex-wrap: wrap; 
          gap: 8px; 
          align-items: center; 
          flex-shrink: 0;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        .toolbar-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .toolbar-group .chip-row {
          margin-right: 0;
        }
        
        /* Elegant Chips */
        .chip-row { 
          display: inline-flex; 
          gap: 4px; 
          padding: 4px; 
          background: #f1f5f9; 
          border-radius: 8px; 
          margin-right: 8px; 
        }
        .chip { 
          border: none; 
          padding: 4px 10px; 
          font-size: 11px; 
          border-radius: 6px; 
          cursor: pointer; 
          background: transparent; 
          color: #64748b; 
          font-weight: 600; 
          display: inline-flex; 
          align-items: center; 
          gap: 4px;
          transition: all 0.2s ease;
        }
        .chip:hover { 
          background: #e2e8f0; 
          color: #475569;
        }
        .chip.active { 
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white; 
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
        }
        
        /* Week Navigation Buttons - Different style from day chips */
        .week-nav-buttons {
          display: inline-flex;
          gap: 6px;
          margin-right: 12px;
          align-items: center;
        }
        .week-nav-btn {
          border: 2px solid #cbd5e1;
          padding: 6px 14px;
          font-size: 12px;
          font-weight: 700;
          border-radius: 8px;
          cursor: pointer;
          background: white;
          color: #475569;
          transition: all 0.2s ease;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .week-nav-btn:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
          color: #334155;
        }
        .week-nav-btn.active {
          background: #3b82f6;
          border-color: #3b82f6;
          color: white;
          box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
        }
        
        /* Input & Switch */
        .input { 
          border: 2px solid #e2e8f0; 
          border-radius: 8px; 
          padding: 10px 14px; 
          font-size: 14px; 
          width: 100%;
          transition: all 0.2s ease;
        }
        .input:focus {
          outline: none;
          border-color: #64748b;
          box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.1);
        }
        .switch { 
          display: inline-flex; 
          align-items: center; 
          gap: 8px; 
          font-size: 13px; 
          color: #475569; 
          cursor: pointer;
          font-weight: 500;
        }
        .switch input { 
          width: 18px; 
          height: 18px; 
          accent-color: #64748b; 
        }
        
        /* Modern Badges */
        .badge { 
          padding: 4px 12px; 
          border-radius: 6px; 
          font-size: 11px; 
          font-weight: 700; 
          border: none;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .bg-gray { background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); color: #475569; }
        .bg-blue { background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); color: #1e40af; }
        .bg-red-light { background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); color: #991b1b; }
        .bg-purple { background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%); color: #0369a1; }
        .bg-orange { background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%); color: #9a3412; }
        .bg-green { background: linear-gradient(135deg, #bbf7d0 0%, #86efac 100%); color: #166534; }
        
        /* Elegant Grid */
        .common-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
          gap: 12px; 
          align-content: start; 
        }
        
        /* Beautiful Cards */
        .common-card { 
          background: white; 
          border: none;
          border-radius: 12px; 
          overflow: hidden; 
          display: flex; 
          flex-direction: column; 
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          transition: all 0.3s ease;
        }
        .common-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .common-card-header { 
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
          gap: 8px; 
          padding: 10px 14px; 
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border-bottom: 1px solid #e2e8f0; 
          cursor: pointer; 
          flex-shrink: 0;
          border-radius: 12px 12px 0 0;
          transition: all 0.2s ease;
        }
        .common-card-header:hover { 
          background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
        }
        .common-card-title { 
          font-size: 11px; 
          font-weight: 800; 
          color: #1e293b; 
          text-transform: uppercase; 
          letter-spacing: 0.3px; 
          display: inline-flex; 
          align-items: center; 
          gap: 6px; 
        }
        .common-card-count { 
          padding: 2px 8px; 
          border-radius: 12px; 
          font-size: 10px; 
          font-weight: 800; 
          background: white;
          color: #475569;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }
        .common-card-body { 
          padding: 12px 14px; 
          overflow: visible;
          flex: 1;
          min-height: 0;
        }
        .common-card[data-common-type="ga"] .common-card-body {
          max-height: 320px;
          overflow-y: auto;
        }
        
        /* Elegant List Items */
        .common-list { 
          list-style: none; 
          margin: 0; 
          padding: 0; 
          display: grid; 
          gap: 6px; 
        }
        .common-item { 
          border: 1px solid #e2e8f0; 
          border-radius: 8px; 
          padding: 8px 10px; 
          background: linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%);
          transition: all 0.2s ease;
        }
        .common-item:hover {
          border-color: #cbd5e1;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
        }
        .common-item-title { 
          font-weight: 700; 
          color: #0f172a; 
          font-size: 12px;
          margin-bottom: 4px;
          line-height: 1.3;
        }
        .common-item-meta { 
          margin-top: 4px; 
          font-size: 10px; 
          color: #64748b; 
          display: flex; 
          flex-wrap: wrap; 
          gap: 6px; 
          align-items: center; 
        }
        .common-item-meta b { 
          color: #1e293b; 
          font-weight: 700;
        }
        .common-empty { 
          color: #94a3b8; 
          font-size: 11px; 
          padding: 16px 12px; 
          border: 1px dashed #cbd5e1; 
          border-radius: 8px; 
          background: #f8fafc; 
          text-align: center;
          font-style: italic;
        }
        
        /* Priority Section */
        .common-priority { 
          grid-column: 1 / -1; 
        }
        .common-person-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
          gap: 12px; 
        }
        .common-person { 
          background: white; 
          border: 1px solid #e2e8f0; 
          border-radius: 12px; 
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
          max-height: 100%;
        }
        .common-person:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .common-person-header { 
          padding: 10px 14px; 
          border-bottom: 1px solid #e2e8f0; 
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
          gap: 8px;
          flex-shrink: 0;
        }
        .common-person-name { 
          font-weight: 800; 
          color: #0f172a; 
          font-size: 12px; 
        }
        .common-person-body { 
          padding: 12px 14px;
          overflow-y: auto;
          flex: 1;
          min-height: 0;
        }
        .common-person-body ul { 
          margin: 0; 
          padding-left: 16px; 
          color: #1e293b; 
          font-size: 11px; 
        }
        .common-person-body li { 
          margin-bottom: 6px;
          line-height: 1.4;
        }
        .common-person-body li:last-child { 
          margin-bottom: 0; 
        }
        .common-person-body small { 
          color: #64748b; 
          font-weight: 600; 
          font-size: 10px; 
        }
        
        /* Modern Modal */
        .modal { 
          position: fixed; 
          inset: 0; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          z-index: 9999; 
        }
        .modal.hidden { 
          display: none; 
        }
        .modal-backdrop { 
          position: absolute; 
          inset: 0; 
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
        }
        .modal-card { 
          position: relative; 
          width: min(720px, calc(100vw - 32px)); 
          background: white; 
          border-radius: 20px; 
          border: none;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); 
          overflow: hidden; 
        }
        .modal-header { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          padding: 24px 28px; 
          border-bottom: 2px solid #e2e8f0; 
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        }
        .modal-header h4 { 
          font-size: 18px; 
          color: #0f172a; 
          margin: 0;
          font-weight: 700;
        }
        .modal-body { 
          padding: 28px; 
        }
        .modal-footer { 
          display: flex; 
          justify-content: flex-end; 
          gap: 16px; 
          padding: 24px 28px; 
          border-top: 2px solid #e2e8f0; 
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        }
        .modal-footer .btn-primary {
          background: #2563eb;
          color: white;
          border: none;
          padding: 14px 32px;
          font-size: 15px;
          font-weight: 700;
          border-radius: 10px;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
          min-width: 120px;
          transition: all 0.2s ease;
        }
        .modal-footer .btn-primary:hover:not(:disabled) {
          background: #1d4ed8;
          box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
          transform: translateY(-1px);
        }
        .modal-footer .btn-primary:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
        }
        .modal-footer .btn-outline {
          background: white;
          color: #475569;
          border: 2px solid #cbd5e1;
          padding: 14px 32px;
          font-size: 15px;
          font-weight: 700;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          min-width: 120px;
          transition: all 0.2s ease;
        }
        .modal-footer .btn-outline:hover:not(:disabled) {
          background: #f8fafc;
          border-color: #94a3b8;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          transform: translateY(-1px);
        }
        .modal-footer .btn-outline:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .btn-primary:disabled,
        .btn-outline:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .form-grid { 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 16px; 
        }
        .form-row { 
          display: flex; 
          flex-direction: column; 
          gap: 8px; 
        }
        .form-row label { 
          font-size: 13px; 
          color: #475569; 
          font-weight: 700; 
        }
        .form-row textarea { 
          min-height: 100px; 
          resize: vertical; 
        }
        .span-2 { 
          grid-column: 1 / -1; 
        }
      `}</style>

      <div className="common-sticky">
        <header className="top-header">
          <div className="page-title">
            <h1>Common View</h1>
            <p>Daily/weekly view for key statuses and team priorities.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-outline no-print"
              type="button"
              onClick={handleExportExcel}
              disabled={exportingExcel}
            >
              {exportingExcel ? "Exporting..." : "Export Excel"}
            </button>
            <button className="btn-primary no-print" type="button" onClick={handlePrint}>
              Print
            </button>
            <button
              className={`btn-outline no-print ${meetingPanelOpen ? "active" : ""}`}
              type="button"
              aria-pressed={meetingPanelOpen}
              onClick={() => setMeetingPanelOpen((prev) => !prev)}
            >
              Meeting
            </button>
            <button
              className={`btn-outline no-print ${externalMeetingsOpen ? "active" : ""}`}
              type="button"
              aria-pressed={externalMeetingsOpen}
              onClick={() => setExternalMeetingsOpen((prev) => !prev)}
            >
              External Meetings
            </button>
            <button className="btn-outline no-print" type="button" onClick={() => openModal()}>
              + Add
            </button>
          </div>
        </header>

        <div className="common-toolbar no-print">
          <div className="toolbar-group">
            <div className="chip-row">
            {weekISOs.map((iso) => {
              const d = fromISODate(iso)
              const label = `${alWeekdayShort(d)} ${formatDateHuman(iso)}`
              const isActive = selectedDates.has(iso)
              return (
                <button
                  key={iso}
                  className={`chip ${isActive ? "active" : ""}`}
                  type="button"
                  onClick={() => toggleDay(iso)}
                >
                  {label}
                </button>
              )
            })}
            </div>
            <div className="week-nav-buttons">
              <button
                className={`week-nav-btn ${toISODate(weekStart) === toISODate(getMonday(new Date())) ? "active" : ""}`}
                type="button"
                onClick={() => {
                  const thisWeekMonday = getMonday(new Date())
                  setWeekStart(thisWeekMonday)
                  setSelectedDates(new Set([toISODate(thisWeekMonday)]))
                }}
              >
                This Week
              </button>
              <button
                className={`week-nav-btn ${toISODate(weekStart) === toISODate(addDays(getMonday(new Date()), 7)) ? "active" : ""}`}
                type="button"
                onClick={() => {
                  const nextWeekMonday = addDays(getMonday(new Date()), 7)
                  setWeekStart(nextWeekMonday)
                  setSelectedDates(new Set([toISODate(nextWeekMonday)]))
                }}
              >
                Next Week
              </button>
            </div>
            <label className="switch" title="When OFF: select only one. When ON: select multiple.">
              <input type="checkbox" checked={multiMode} onChange={(e) => setMultiMode(e.target.checked)} />
              Multi-select (Days)
            </label>
          </div>
          <div className="toolbar-group">
            <div className="chip-row">
            <button
              className={`chip ${typeFilters.size === 0 ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("all")}
            >
              All
            </button>
            <button
              className={`chip ${typeFilters.has("late") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("late")}
            >
              Delays
            </button>
            <button
              className={`chip ${typeFilters.has("absent") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("absent")}
            >
              Absences
            </button>
            <button
              className={`chip ${typeFilters.has("leave") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("leave")}
            >
              Annual Leave
            </button>
            <button
              className={`chip ${typeFilters.has("external") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("external")}
            >
              External Meetings
            </button>
            <button
              className={`chip ${typeFilters.has("blocked") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("blocked")}
            >
              BLOCKED
            </button>
            <button
              className={`chip ${typeFilters.has("oneH") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("oneH")}
            >
              1H
            </button>
            <button
              className={`chip ${typeFilters.has("personal") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("personal")}
            >
              Personal
            </button>
            <button
              className={`chip ${typeFilters.has("r1") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("r1")}
            >
              R1
            </button>
            <button
              className={`chip ${typeFilters.has("priority") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("priority")}
            >
              Projects
            </button>
            <button
              className={`chip ${typeFilters.has("problem") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("problem")}
            >
              Problems
            </button>
            <button
              className={`chip ${typeFilters.has("feedback") ? "active" : ""}`}
              type="button"
              onClick={() => setTypeFilter("feedback")}
            >
              Complaints/Requests/Proposals
            </button>
            </div>
            <label className="switch" title="When OFF: select only one. When ON: select multiple.">
              <input type="checkbox" checked={typeMultiMode} onChange={(e) => setTypeMultiMode(e.target.checked)} />
              Multi-select (Types)
            </label>
          </div>
          <input
            className="input"
            type="date"
            value={toISODate(weekStart)}
            onChange={(e) => setWeek(e.target.value)}
            style={{ width: "auto" }}
          />
          <button className="btn-outline" type="button" onClick={selectAll}>
            All days
          </button>
          <button className="btn-outline" type="button" onClick={selectToday}>
            Today
          </button>
        </div>
      </div>

      {meetingPanelOpen ? (
        <section className="meeting-panel">
          <div className="meeting-panel-header">
            <div>
              <div className="meeting-title">Meetings</div>
              <div className="meeting-subtitle">Select a meeting to view the checklist table.</div>
            </div>
            <button className="btn-outline" type="button" onClick={() => setMeetingPanelOpen(false)}>
              Close
            </button>
          </div>
          <div className="meeting-tabs">
            <div className="meeting-dropdown">
              <label htmlFor="meeting-board-ga">BORD/GA</label>
              <select
                id="meeting-board-ga"
                value={boardMeetingIds.includes(activeMeetingId) ? activeMeetingId : ""}
                onChange={(e) => setActiveMeetingId(e.target.value)}
              >
                <option value="" disabled>
                  Select meeting
                </option>
                {meetingTemplates.filter((t) => boardMeetingIds.includes(t.id)).map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="meeting-dropdown">
              <label htmlFor="meeting-staff-ga">STAFF/GA</label>
              <select
                id="meeting-staff-ga"
                value={staffMeetingIds.includes(activeMeetingId) ? activeMeetingId : ""}
                onChange={(e) => setActiveMeetingId(e.target.value)}
              >
                <option value="" disabled>
                  Select meeting
                </option>
                {meetingTemplates.filter((t) => staffMeetingIds.includes(t.id)).map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {activeMeeting ? (
            <div className="meeting-table-card">
              <div className="meeting-table-header">
                {editingMeetingTitle ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                    <input
                      type="text"
                      value={meetingTitleDraft}
                      onChange={(e) => setMeetingTitleDraft(e.target.value)}
                      className="input"
                      style={{ flex: 1, fontSize: "inherit", fontWeight: "inherit" }}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          void saveMeetingTitle()
                        } else if (e.key === "Escape") {
                          cancelEditMeetingTitle()
                        }
                      }}
                    />
                    <button
                      className="btn-primary"
                      type="button"
                      onClick={() => void saveMeetingTitle()}
                      disabled={savingMeetingTitle || !meetingTitleDraft.trim()}
                    >
                      {savingMeetingTitle ? "Saving..." : "Save"}
                    </button>
                    <button className="btn-outline" type="button" onClick={cancelEditMeetingTitle}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div
                    className="meeting-table-title"
                    style={isAdmin ? { cursor: "pointer", userSelect: "none" } : undefined}
                    onClick={isAdmin ? startEditMeetingTitle : undefined}
                    title={isAdmin ? "Click to edit" : undefined}
                  >
                    {activeMeeting.title}
                  </div>
                )}
                {activeMeeting.defaultOwner || activeMeeting.defaultTime ? (
                  <div className="meeting-table-meta">
                    {activeMeeting.defaultOwner ? `WHO: ${activeMeeting.defaultOwner}` : null}
                    {activeMeeting.defaultOwner && activeMeeting.defaultTime ? " | " : null}
                    {activeMeeting.defaultTime ? `WHEN: ${activeMeeting.defaultTime}` : null}
                  </div>
                ) : null}
              </div>
              {activeMeeting.note ? <div className="meeting-note">{activeMeeting.note}</div> : null}
              <div className="meeting-table-wrap">
                <table className="meeting-table">
                  <thead>
                    <tr>
                      {activeMeeting.columns.map((col) => (
                        <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                          {col.label}
                        </th>
                      ))}
                      {isAdmin ? <th style={{ width: "120px" }}>Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {activeMeeting.rows
                      .slice()
                      .sort((a, b) => a.nr - b.nr || a.id.localeCompare(b.id))
                      .map((row, rowIndex) => (
                      <tr key={row.id}>
                        {activeMeeting.columns.map((col) => {
                          let value = ""
                          if (col.key === "nr") value = String(row.nr)
                          if (col.key === "day") value = row.day || ""
                          if (col.key === "topic") value = row.topic
                          if (col.key === "owner") {
                            value = row.owner || (rowIndex === 0 ? activeMeeting.defaultOwner || "" : "")
                          }
                          if (col.key === "time") {
                            value = row.time || (rowIndex === 0 ? activeMeeting.defaultTime || "" : "")
                          }
                          const isEditing = isAdmin && editingRowId === row.id

                          if (col.key === "owner" && mergeOwnerColumn) {
                            if (rowIndex !== 0) return null
                            return (
                              <td
                                key={`${activeMeeting.id}-${row.nr}-${col.key}`}
                                rowSpan={activeMeeting.rows.length}
                                className="meeting-owner-cell"
                                style={col.width ? { width: col.width } : undefined}
                              >
                                {value}
                              </td>
                            )
                          }

                          if (col.key === "check") {
                            return (
                              <td key={`${activeMeeting.id}-${row.nr}-${col.key}`} className="meeting-check-cell">
                                <input
                                  type="checkbox"
                                  aria-label={`Mark ${row.topic}`}
                                  checked={Boolean(row.isChecked)}
                                  onChange={(e) => toggleMeetingItem(activeMeeting.id, row.id, e.target.checked)}
                                />
                              </td>
                            )
                          }

                          if (col.key === "topic") {
                            return (
                              <td key={`${activeMeeting.id}-${row.nr}-${col.key}`} style={col.width ? { width: col.width } : undefined}>
                                {isEditing ? (
                                  <input
                                    className="input"
                                    type="text"
                                    value={editDraft.topic}
                                    onChange={(e) => setEditDraft((prev) => ({ ...prev, topic: e.target.value.toUpperCase() }))}
                                    style={{ textTransform: "uppercase" }}
                                  />
                                ) : (
                                  value
                                )}
                              </td>
                            )
                          }

                          if (col.key === "day") {
                            return (
                              <td key={`${activeMeeting.id}-${row.nr}-${col.key}`} style={col.width ? { width: col.width } : undefined}>
                                {isEditing ? (
                                  <input
                                    className="input"
                                    type="text"
                                    value={editDraft.day}
                                    onChange={(e) => setEditDraft((prev) => ({ ...prev, day: e.target.value }))}
                                  />
                                ) : (
                                  value
                                )}
                              </td>
                            )
                          }

                          if (col.key === "owner") {
                            return (
                              <td key={`${activeMeeting.id}-${row.nr}-${col.key}`} style={col.width ? { width: col.width } : undefined}>
                                {isEditing ? (
                                  <input
                                    className="input"
                                    type="text"
                                    value={editDraft.owner}
                                    onChange={(e) => setEditDraft((prev) => ({ ...prev, owner: e.target.value }))}
                                  />
                                ) : (
                                  value
                                )}
                              </td>
                            )
                          }

                          if (col.key === "time") {
                            return (
                              <td key={`${activeMeeting.id}-${row.nr}-${col.key}`} style={col.width ? { width: col.width } : undefined}>
                                {isEditing ? (
                                  <input
                                    className="input"
                                    type="text"
                                    value={editDraft.time}
                                    onChange={(e) => setEditDraft((prev) => ({ ...prev, time: e.target.value }))}
                                  />
                                ) : (
                                  value
                                )}
                              </td>
                            )
                          }

                          return (
                            <td key={`${activeMeeting.id}-${row.nr}-${col.key}`} style={col.width ? { width: col.width } : undefined}>
                              {value}
                            </td>
                          )
                        })}
                        {isAdmin ? (
                          <td>
                            {editingRowId === row.id ? (
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button className="btn-primary" type="button" onClick={() => saveMeetingRow(activeMeeting.id, row.id)}>
                                  Save
                                </button>
                                <button className="btn-outline" type="button" onClick={cancelEditMeetingRow}>
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button className="btn-icon" type="button" onClick={() => startEditMeetingRow(row)} aria-label="Edit row">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path
                                      d="M4 20h4l10.5-10.5a2.121 2.121 0 0 0-3-3L5 17v3z"
                                      stroke="currentColor"
                                      strokeWidth="1.6"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </button>
                                <button
                                  className="btn-icon danger"
                                  type="button"
                                  onClick={() => deleteMeetingRow(activeMeeting.id, row.id)}
                                  aria-label="Delete row"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path
                                      d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"
                                      stroke="currentColor"
                                      strokeWidth="1.6"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isAdmin ? (
                <div style={{ padding: "12px", borderTop: "1px solid #e2e8f0" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr)) auto", gap: "8px" }}>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      placeholder="Nr"
                      value={addDraft.nr}
                      onChange={(e) => setAddDraft((prev) => ({ ...prev, nr: e.target.value }))}
                    />
                    {activeMeeting.columns.some((col) => col.key === "day") ? (
                      <input
                        className="input"
                        type="text"
                        placeholder="Day"
                        value={addDraft.day}
                        onChange={(e) => setAddDraft((prev) => ({ ...prev, day: e.target.value }))}
                      />
                    ) : (
                      <span />
                    )}
                    <input
                      className="input"
                      type="text"
                      placeholder="Topic"
                      value={addDraft.topic}
                      onChange={(e) => setAddDraft((prev) => ({ ...prev, topic: e.target.value.toUpperCase() }))}
                      style={{ textTransform: "uppercase" }}
                    />
                    <button className="btn-primary" type="button" onClick={() => addMeetingRow(activeMeeting.id)}>
                      Add meeting point
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="meeting-empty">No meeting selected.</div>
          )}
        </section>
      ) : null}

      {externalMeetingsOpen ? (
        <section className="meeting-panel external-meetings-panel">
          <div className="meeting-panel-header">
            <div>
              <div className="meeting-title">External Meetings</div>
              <div className="meeting-subtitle">Show all external meetings and add new ones.</div>
            </div>
            <button className="btn-outline" type="button" onClick={() => setExternalMeetingsOpen(false)}>
              Close
            </button>
          </div>
          <div className="external-meetings-grid">
            <div className="external-meeting-form">
              <div className="external-meeting-form-title">Add meeting</div>
              <div className="external-meeting-fields">
                <input
                  className="input"
                  type="text"
                  placeholder="Meeting title"
                  value={externalMeetingTitle}
                  onChange={(e) => setExternalMeetingTitle(e.target.value)}
                />
                <div className="external-meeting-row">
                  <input
                    className="input"
                    type="text"
                    placeholder="Platform (Zoom, Meet, Office...)"
                    value={externalMeetingPlatform}
                    onChange={(e) => setExternalMeetingPlatform(e.target.value)}
                  />
                  <input
                    className="input"
                    type="datetime-local"
                    value={externalMeetingStartsAt}
                    onChange={(e) => setExternalMeetingStartsAt(e.target.value)}
                  />
                </div>
                <div className="external-meeting-row">
                  <select
                    className="input"
                    value={externalMeetingDepartmentId}
                    onChange={(e) => setExternalMeetingDepartmentId(e.target.value)}
                    disabled={!canSelectExternalDepartment}
                  >
                    <option value="">
                      {canSelectExternalDepartment ? "Select department" : "Department"}
                    </option>
                    {departments.map((dep) => (
                      <option key={dep.id} value={dep.id}>
                        {dep.name}
                      </option>
                    ))}
                  </select>
                </div>
                {!canSelectExternalDepartment && externalMeetingDepartment ? (
                  <div className="external-meeting-hint">Department: {externalMeetingDepartment.name}</div>
                ) : null}
                <div style={{ marginTop: "16px" }}>
                  <button
                    className="btn-surface"
                    type="button"
                    onClick={() => setExternalMeetingChecklistOpen((prev) => !prev)}
                    disabled={externalMeetingChecklistLoading}
                    style={{ width: "100%", marginBottom: externalMeetingChecklistOpen ? "12px" : "0" }}
                  >
                    {externalMeetingChecklistLoading
                      ? "Loading Checklist..."
                      : externalMeetingChecklistOpen
                        ? "Hide Checklist"
                        : "Show Checklist"}
                    {/* Checklist is optional for creating meetings; no blocking warning here. */}
                  </button>
                  {externalMeetingChecklistOpen && !externalMeetingChecklistLoading && (
                    <>
                      {externalMeetingChecklist && externalMeetingChecklist.items && externalMeetingChecklist.items.length > 0 ? (
                        <div style={{ padding: "16px", border: "1px solid #e2e8f0", borderRadius: "8px", backgroundColor: "#f8fafc" }}>
                          <div style={{ marginBottom: "12px", fontWeight: "600", fontSize: "14px", color: "#1e293b" }}>
                            {externalMeetingChecklist.title || "Checklist"}
                          </div>
                          <div className="external-checklist-media">
                            <div className="external-checklist-media-title">Meeting options (reference)</div>
                            {!externalChecklistImageError ? (
                              <a href="/external-meeting-options.png" target="_blank" rel="noreferrer">
                                <img
                                  src="/external-meeting-options.png"
                                  alt="Teams meeting options reference"
                                  onError={() => setExternalChecklistImageError(true)}
                                />
                              </a>
                            ) : (
                              <div className="external-checklist-media-hint">
                                Add the image file to: <code>frontend/public/external-meeting-options.png</code>
                                <br />
                                Then refresh the page.
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {(() => {
                              const sorted = externalMeetingChecklist.items
                                .slice()
                                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                              let mainCounter = 0
                              return sorted.map((item, idx) => {
                                const isChecked = externalMeetingChecklistItems.get(item.id) ?? false
                                const rawTitle = item.title || ""
                                const match = rawTitle.match(/^(\d+(?:\.\d+)*)\.\s*(.*)$/)
                                const prefix = match?.[1] || ""
                                const titleOnly = (match?.[2] ?? rawTitle).trim()
                                const isSubpoint = /^\d+\.\d+/.test(prefix)
                                if (!isSubpoint) mainCounter += 1
                                // Always anchor numbering to the current mainCounter:
                                // - main items: 1,2,3...
                                // - subpoints: <current-main>.<sub> (so 9.1 becomes 10.1 if a new main item was inserted)
                                const displayNr = isSubpoint
                                  ? `${mainCounter}${prefix.replace(/^\d+/, "")}`
                                  : String(mainCounter)
                                const displayTitle = titleOnly
                                return (
                                  <div
                                    key={item.id}
                                    style={{
                                      display: "flex",
                                      alignItems: "flex-start",
                                      gap: "8px",
                                      padding: "8px",
                                      borderRadius: "4px",
                                      backgroundColor: isChecked ? "#f0fdf4" : "transparent",
                                      transition: "background-color 0.2s",
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: "22px",
                                        flexShrink: 0,
                                        fontSize: "12px",
                                        fontWeight: 700,
                                        color: "#475569",
                                        textAlign: "right",
                                        marginTop: "2px",
                                      }}
                                    >
                                      {displayNr}.
                                    </span>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => void toggleChecklistItem(item.id)}
                                      style={{ marginTop: "2px", cursor: "pointer" }}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {isAdmin && externalChecklistEditingId === item.id ? (
                                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                          <input
                                            className="input"
                                            type="text"
                                            value={externalChecklistEditTitle}
                                            onChange={(e) => setExternalChecklistEditTitle(e.target.value)}
                                            style={{ flex: 1 }}
                                          />
                                          <button
                                            className="btn-surface"
                                            type="button"
                                            onClick={() => void saveExternalChecklistItemTitle(item.id)}
                                            disabled={externalChecklistSavingId === item.id || !externalChecklistEditTitle.trim()}
                                          >
                                            Save
                                          </button>
                                          <button
                                            className="btn-surface"
                                            type="button"
                                            onClick={() => cancelEditExternalChecklistItem()}
                                            disabled={externalChecklistSavingId === item.id}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <span style={{ fontSize: "13px", lineHeight: "1.5", color: "#334155" }}>
                                          {displayTitle}
                                        </span>
                                      )}
                                    </div>
                                    {isAdmin ? (
                                      <div style={{ display: "flex", gap: "6px", marginLeft: "8px" }}>
                                        <button
                                          className="btn-surface"
                                          type="button"
                                          onClick={() => startEditExternalChecklistItem(item.id, `${displayNr}. ${displayTitle}`)}
                                          disabled={externalChecklistDeletingId === item.id || externalChecklistSavingId === item.id}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          className="btn-surface"
                                          type="button"
                                          onClick={() => void deleteExternalChecklistItem(item.id)}
                                          disabled={externalChecklistDeletingId === item.id || externalChecklistSavingId === item.id}
                                        >
                                          {externalChecklistDeletingId === item.id ? "Deleting..." : "Delete"}
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })
                            })()}
                          </div>
                          {isAdmin ? (
                            <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
                              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                <input
                                  className="input"
                                  type="number"
                                  min={1}
                                  placeholder="Order #"
                                  value={externalChecklistAddOrder}
                                  onChange={(e) => setExternalChecklistAddOrder(e.target.value)}
                                  style={{ width: "110px" }}
                                />
                                <input
                                  className="input"
                                  type="text"
                                  placeholder="Add new checklist item..."
                                  value={externalChecklistAddTitle}
                                  onChange={(e) => setExternalChecklistAddTitle(e.target.value)}
                                  style={{ flex: 1 }}
                                />
                                <button
                                  className="btn-surface"
                                  type="button"
                                  onClick={() => void addExternalChecklistItem()}
                                  disabled={
                                    externalChecklistAdding ||
                                    !externalChecklistAddTitle.trim() ||
                                    !externalMeetingChecklist?.id ||
                                    (externalChecklistAddOrder.trim() !== "" &&
                                      (!Number.isFinite(Number(externalChecklistAddOrder)) || Number(externalChecklistAddOrder) <= 0))
                                  }
                                >
                                  {externalChecklistAdding ? "Adding..." : "Add"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div style={{ padding: "12px", textAlign: "center", color: "#dc2626", fontSize: "13px", border: "1px solid #fecaca", borderRadius: "4px", backgroundColor: "#fef2f2" }}>
                          Checklist not found. Please run the database migration to create the external meetings checklist.
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="external-meeting-row" style={{ marginTop: "16px" }}>
                  <button
                    className="btn-primary"
                    type="button"
                    disabled={!canCreateExternalMeeting || creatingExternalMeeting}
                    onClick={() => void submitExternalMeeting()}
                    style={{ width: "100%" }}
                  >
                    {creatingExternalMeeting ? "Saving..." : "Add"}
                  </button>
                </div>
              </div>
            </div>
            <div className="external-meeting-list">
              <div className="external-meeting-form-title">All external meetings</div>
              {externalMeetingsSorted.length ? (
                <div className="external-meeting-cards">
                  {externalMeetingsSorted.map((meeting) => {
                    const department = departments.find((d) => d.id === meeting.department_id) || null
                    const owner = meeting.created_by ? userById.get(meeting.created_by) : null
                    const ownerName = owner?.full_name || owner?.username || "Unknown"
                    return (
                      <div key={meeting.id} className="external-meeting-card">
                        <div className="external-meeting-title">{meeting.title || "External meeting"}</div>
                        <div className="external-meeting-meta">
                          <span>{formatExternalMeetingWhen(meeting)}</span>
                          <span>{meeting.platform || "Platform TBD"}</span>
                        </div>
                        <div className="external-meeting-meta">
                          <span>{department?.name || "Department TBD"}</span>
                          <span>Owner: {ownerName}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="external-meeting-empty">No external meetings yet.</div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <div className="view-container">
        {allDaysSelected ? (
          <div className="week-table-view">
            <div className="print-header">
              <div />
              <div className="print-title">COMMON VIEW - WEEK PLAN</div>
              <div className="print-datetime">
                {printedAt.toLocaleString("en-US", {
                  month: "2-digit",
                  day: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
            <table className="week-table">
              <thead>
                <tr>
                  <th rowSpan={2} style={{ width: "60px" }}>NO</th>
                  <th rowSpan={2} style={{ width: "150px" }}>LL</th>
                  {weekISOs.map((iso) => {
                    const d = fromISODate(iso)
                    const dayCode = getDayCode(d)
                    return (
                      <th key={iso} colSpan={1} className="week-table-date-header">
                        <div>{dayCode} = {formatDateHuman(iso)}</div>
                      </th>
                    )
                  })}
                </tr>
                <tr>
                  {weekISOs.map((iso) => (
                    <th key={`sub-${iso}`} className="week-table-subheader">
                      KUSH/BZ ME/DET/SI/KUR/KUJT
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {swimlaneRows
                  .filter((row) => showCard(row.id))
                  .map((row, rowIndex) => {
                    const rowData = tableDataByDay?.[weekISOs[0]] || {}
                    let dayEntries: Record<string, any[]> = {}
                    weekISOs.forEach((iso) => {
                      const dayData = tableDataByDay?.[iso] || {}
                      if (row.id === "late") dayEntries[iso] = dayData.late || []
                      else if (row.id === "absent") dayEntries[iso] = dayData.absent || []
                      else if (row.id === "leave") dayEntries[iso] = dayData.leave || []
                      else if (row.id === "blocked") dayEntries[iso] = dayData.blocked || []
                      else if (row.id === "oneH") dayEntries[iso] = dayData.oneH || []
                      else if (row.id === "personal") dayEntries[iso] = dayData.personal || []
                      else if (row.id === "external") dayEntries[iso] = dayData.external || []
                      else if (row.id === "r1") dayEntries[iso] = dayData.r1 || []
                      else if (row.id === "problem") dayEntries[iso] = dayData.problems || []
                      else if (row.id === "feedback") dayEntries[iso] = dayData.feedback || []
                      else if (row.id === "priority") dayEntries[iso] = dayData.priority || []
                    })
                    
                    const getCellContent = (iso: string) => {
                      const entries = dayEntries[iso] || []
                      if (entries.length === 0) return null
                      
                      if (row.id === "late") {
                        return entries.map((e: LateItem, idx: number) => (
                          <div key={idx} className="week-table-entry">
                            <span>{initials(e.person)} {e.start || "08:00"}-{e.until}</span>
                            {isAdmin && e.entryId ? (
                              <button
                                type="button"
                                className="week-table-delete"
                                onClick={() => deleteCommonEntry(e.entryId)}
                                aria-label="Delete entry"
                                title="Delete"
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                        ))
                      } else if (row.id === "absent") {
                        return entries.map((e: AbsentItem, idx: number) => (
                          <div key={idx} className="week-table-entry">
                            <span>{initials(e.person)} {e.from} - {e.to}</span>
                            {isAdmin && e.entryId ? (
                              <button
                                type="button"
                                className="week-table-delete"
                                onClick={() => deleteCommonEntry(e.entryId)}
                                aria-label="Delete entry"
                                title="Delete"
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                        ))
                      } else if (row.id === "leave") {
                        return entries.map((e: LeaveItem, idx: number) => {
                          const range = e.endDate !== e.startDate ? `${formatDateHuman(e.startDate)}-${formatDateHuman(e.endDate)}` : formatDateHuman(e.startDate)
                          return (
                            <div key={idx} className="week-table-entry">
                              <span>{initials(e.person)} {e.fullDay ? "Full day" : `${e.from}-${e.to}`} {range}</span>
                              {isAdmin && e.entryId ? (
                                <button
                                  type="button"
                                  className="week-table-delete"
                                  onClick={() => deleteCommonEntry(e.entryId)}
                                  aria-label="Delete entry"
                                  title="Delete"
                                >
                                  ×
                                </button>
                              ) : null}
                            </div>
                          )
                        })
                      } else if (row.id === "blocked") {
                        return entries.map((e: BlockedItem, idx: number) => (
                          <div key={idx} className="week-table-entry">
                            <span>{initials(e.person || e.title || "")}: {e.note || ""}</span>
                          </div>
                        ))
                      } else if (row.id === "problem" || row.id === "feedback") {
                        return entries.map((e: ProblemItem | FeedbackItem, idx: number) => (
                          <div key={idx} className="week-table-entry">
                            <span>{initials(e.person || e.title || "")}: {e.note || ""}</span>
                            {isAdmin && e.entryId ? (
                              <button
                                type="button"
                                className="week-table-delete"
                                onClick={() => deleteCommonEntry(e.entryId)}
                                aria-label="Delete entry"
                                title="Delete"
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                        ))
                      } else if (row.id === "oneH" || row.id === "r1") {
                        return entries.map((e: any, idx: number) => (
                          <div key={idx} className="week-table-entry">
                            {e.title} ({initials(e.person || e.owner || "")})
                          </div>
                        ))
                      } else if (row.id === "personal") {
                        return entries.map((e: PersonalItem, idx: number) => (
                          <div key={idx} className="week-table-entry">
                            {e.title} ({initials(e.person || "")})
                          </div>
                        ))
                      } else if (row.id === "external") {
                        return entries.map((e: ExternalItem, idx: number) => (
                          <div key={idx} className="week-table-entry">
                            {e.title} {e.time} ({initials(e.owner || "")})
                          </div>
                        ))
                      } else if (row.id === "priority") {
                        return entries.map((e: PriorityItem, idx: number) => (
                          <div key={idx} className="week-table-entry">
                            <div>{idx + 1}. {e.project}</div>
                            <div className="week-table-avatars">
                              {e.assignees.map((name) => (
                                <span key={`${e.project}-${name}`} className="week-table-avatar" title={name}>
                                  {initials(name)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      }
                      return null
                    }
                    
                    const rowLabel = row.label.toUpperCase()
                    
                    return (
                      <tr key={row.id}>
                        <td className="week-table-number">{rowIndex + 1}</td>
                        <td className="week-table-label">{rowLabel}</td>
                        {weekISOs.map((iso) => {
                          const content = getCellContent(iso)
                          return (
                            <td key={iso} className="week-table-cell">
                              {content ? (
                                <div className="week-table-entries">
                                  {content}
                                </div>
                              ) : (
                                <span className="week-table-empty">—</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
              </tbody>
            </table>
            <div className="print-footer">
              <div className="print-page-count" />
              <div className="print-initials">Initials: {printInitials}</div>
            </div>
          </div>
        ) : null}
        <div className={`print-page ${allDaysSelected ? "hide-when-all-days" : ""}`}>
          <div className="print-header">
            <div />
            <div className="print-title">COMMON VIEW</div>
            <div className="print-datetime">
              {printedAt.toLocaleString("en-US", {
                month: "2-digit",
                day: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
          <div className={`swimlane-board ${allDaysSelected ? "hide-when-all-days" : ""}`}>
            {swimlaneRows
              .filter((row) => showCard(row.id))
              .map((row) => {
                const cells = buildSwimlaneCells(row.items)
                return (
                  <div key={row.id} className="swimlane-row">
                    <div className={row.headerClass}>
                      <span>{row.label}</span>
                      <span className={row.badgeClass}>{row.count}</span>
                    </div>
                    <div className="swimlane-content-shell">
                      <div className="swimlane-row-nav">
                        <button type="button" onClick={() => scrollSwimlaneRow(row.id, "left")}>{"<"}</button>
                        <button type="button" onClick={() => scrollSwimlaneRow(row.id, "right")}>{">"}</button>
                      </div>
                      <div
                        className="swimlane-content-scroll"
                        ref={(node) => {
                          swimlaneRowRefs.current[row.id] = node
                        }}
                      >
                        <div className="swimlane-content">
                          {cells.map((cell, index) =>
                            cell ? (
                              <div
                                key={`${row.id}-${index}`}
                                className={[
                                  "swimlane-cell",
                                  cell.accentClass || "",
                                  cell.placeholder ? "placeholder" : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                {!cell.placeholder && isAdmin && cell.entryId ? (
                                  <button
                                    type="button"
                                    className="swimlane-delete"
                                    onClick={() => deleteCommonEntry(cell.entryId)}
                                    aria-label="Delete entry"
                                    title="Delete"
                                  >
                                    A-
                                  </button>
                                ) : null}
                                <div className="swimlane-title">
                                  {row.id === "priority" && cell.number ? `${cell.number}. ` : ""}
                                  {cell.title}
                                </div>
                                {!cell.placeholder && cell.assignees?.length ? (
                                  <div className="swimlane-assignees">
                                    {cell.assignees.map((name) => (
                                      <span key={`${cell.title}-${name}`} className="swimlane-avatar" title={name}>
                                        {initials(name)}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                {cell.subtitle ? <div className="swimlane-subtitle">{cell.subtitle}</div> : null}
                              </div>
                            ) : (
                              <div key={`${row.id}-empty-${index}`} className="swimlane-cell empty" />
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
          <div className="print-footer">
            <div className="print-page-count" />
            <div className="print-initials">Initials: {printInitials}</div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="modal">
          <div className="modal-backdrop" onClick={closeModal} />
          <div className="modal-card">
            <div className="modal-header">
            <h4>Add to Common View</h4>
              <button className="btn-outline" type="button" onClick={closeModal}>
                Close
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={submitForm}>
                <div className="form-grid">
                  <div className="form-row">
                    <label htmlFor="cv-type">Type</label>
                    <select
                      id="cv-type"
                      className="input"
                      value={formType}
                      onChange={(e) => {
                        setFormType(e.target.value as any)
                      }}
                      required
                      >
                        <option value="late">Delay</option>
                        <option value="absent">Absence</option>
                        <option value="leave">Annual Leave</option>
                        <option value="problem">Problem</option>
                        <option value="feedback">Complaint/Request/Proposal</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label htmlFor="cv-person">Person</label>
                    <select
                      id="cv-person"
                      className="input"
                      value={formPerson}
                      onChange={(e) => setFormPerson(e.target.value)}
                      required
                    >
                      <option value="">--</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.full_name || u.username || u.email}>
                          {u.full_name || u.username || u.email}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(formType === "feedback" || formType === "problem") && (
                    <div className="form-row span-2">
                      <label htmlFor="cv-title">Title</label>
                      <input
                        id="cv-title"
                        className="input"
                        type="text"
                        placeholder="e.g. Issue: server access"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  <div className="form-row">
                    <label htmlFor="cv-date">Date</label>
                    <input
                      id="cv-date"
                      className="input"
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      required
                    />
                  </div>

                  {formType === "late" && (
                    <>
                      <div className="form-row">
                        <label htmlFor="cv-start">Start time (delay)</label>
                        <input
                          id="cv-start"
                          className="input"
                          type="time"
                          value={formDelayStart}
                          onChange={(e) => setFormDelayStart(e.target.value)}
                        />
                      </div>
                      <div className="form-row">
                        <label htmlFor="cv-until">End time (delay)</label>
                        <input
                          id="cv-until"
                          className="input"
                          type="time"
                          value={formUntil}
                          onChange={(e) => setFormUntil(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {formType === "absent" && (
                    <>
                      <div className="form-row">
                        <label htmlFor="cv-from">From (for absence/AL with hours)</label>
                        <input
                          id="cv-from"
                          className="input"
                          type="time"
                          value={formFrom}
                          onChange={(e) => setFormFrom(e.target.value)}
                        />
                      </div>
                      <div className="form-row">
                        <label htmlFor="cv-to">Until (for absence/AL with hours)</label>
                        <input
                          id="cv-to"
                          className="input"
                          type="time"
                          value={formTo}
                          onChange={(e) => setFormTo(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {formType === "leave" && (
                    <div className="form-row">
                      <label htmlFor="cv-enddate">Until date (optional)</label>
                      <input
                        id="cv-enddate"
                        className="input"
                        type="date"
                        value={formEndDate}
                        onChange={(e) => setFormEndDate(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="form-row span-2">
                    <label htmlFor="cv-note">Note</label>
                    <textarea
                      id="cv-note"
                      className="input"
                      placeholder="Optional..."
                      value={formNote}
                      onChange={(e) => setFormNote(e.target.value)}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn-outline" type="button" onClick={closeModal} disabled={isSavingEntry}>
                    Cancel
                  </button>
                  <button className="btn-primary" type="submit" disabled={isSavingEntry}>
                    {isSavingEntry ? "Saving..." : "Save"}
                  </button>
                </div>
              </form>
              </div>
          </div>
        </div>
      )}
    </div>
  )
}
