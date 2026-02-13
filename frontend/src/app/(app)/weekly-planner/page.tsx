"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { ChevronDown, Plus, X, Printer } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { formatDepartmentName } from "@/lib/department-name"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  WeeklyPlannerLegendTable,
  LEGEND_COLORS,
  buildLegendDisplayEntries,
  getLegendQuestions,
  getLegendLabelDisplay,
  type LegendEntry,
} from "@/components/weekly-planner-legend-table"
import { WeeklyPlannerSnapshotsView } from "@/components/weekly-planner-snapshots-view"
import { WeeklyPlanPerformanceView, type WeeklyPlanPerformanceResponse } from "@/components/weekly-plan-performance-view"
import type { Department, Project, Task, UserLookup } from "@/lib/types"

type WeeklyTableProjectTaskEntry = {
  task_id: string
  task_title: string
  status?: string | null
  daily_status?: string | null
  completed_at?: string | null
  daily_products: number | null
  finish_period?: string | null
  is_bllok: boolean
  is_1h_report: boolean
  is_r1: boolean
  is_personal: boolean
  ga_note_origin_id: string | null
}

type WeeklyTableProjectEntry = {
  project_id: string
  project_title: string
  project_total_products: number | null
  task_count: number
  tasks: WeeklyTableProjectTaskEntry[]
  is_late?: boolean
}

type WeeklyTableTaskEntry = {
  task_id: string | null
  title: string
  status?: string | null
  daily_status?: string | null
  completed_at?: string | null
  daily_products: number | null
  finish_period?: string | null
  fast_task_type?: string | null
  is_bllok: boolean
  is_1h_report: boolean
  is_r1: boolean
  is_personal: boolean
  ga_note_origin_id: string | null
}

type WeeklyTableUserDay = {
  user_id: string
  user_name: string
  am_projects: WeeklyTableProjectEntry[]
  pm_projects: WeeklyTableProjectEntry[]
  am_system_tasks: WeeklyTableTaskEntry[]
  pm_system_tasks: WeeklyTableTaskEntry[]
  am_fast_tasks: WeeklyTableTaskEntry[]
  pm_fast_tasks: WeeklyTableTaskEntry[]
}

type WeeklyTableDay = {
  date: string
  users: WeeklyTableUserDay[]
}

type WeeklyTableDepartment = {
  department_id: string
  department_name: string
  days: WeeklyTableDay[]
}

type WeeklyTableResponse = {
  week_start: string
  week_end: string
  departments: WeeklyTableDepartment[]
  saved_plan_id: string | null
}

type WeeklyPlannerBlock = {
  entry_id: string
  user_id: string
  start_date: string
  end_date: string
  full_day: boolean
  start_time?: string | null
  end_time?: string | null
  note?: string | null
}

type WeeklyPrintUser = {
  user_id: string
  user_name: string
}

const ALL_DEPARTMENTS_VALUE = "__all__"
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

const normalizeDepartmentKey = (name?: string) => {
  const normalized = (name || "").trim().toLowerCase().replace(/\s+/g, "")
  if (normalized === "zhvillim") return "development"
  if (normalized === "grafikdizajn" || normalized === "dizajngrafik") return "graphicdesign"
  if (normalized === "productcontent" || normalized === "produktcontent") return "productcontent"
  if (normalized === "projectcontentmanager") return "productcontent"
  return normalized
}

function mondayISO(today = new Date()) {
  const d = new Date(today)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

const pad2 = (n: number) => String(n).padStart(2, "0")
const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const fromISODate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

const timeToMinutes = (value?: string | null) => {
  if (!value) return null
  const [h, m] = value.split(":").map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

export default function WeeklyPlannerPage() {
  const { apiFetch, user } = useAuth()
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [projects, setProjects] = React.useState<Project[]>([])
  const [users, setUsers] = React.useState<UserLookup[]>([])
  const [departmentId, setDepartmentId] = React.useState<string>(ALL_DEPARTMENTS_VALUE)
  const [viewMode, setViewMode] = React.useState<"current" | "snapshots">("current")
  const [isThisWeek, setIsThisWeek] = React.useState(false)
  const [data, setData] = React.useState<WeeklyTableResponse | null>(null)
  const [pvFestBlocks, setPvFestBlocks] = React.useState<WeeklyPlannerBlock[]>([])

  const [isExporting, setIsExporting] = React.useState(false)
  const [savingSnapshotMode, setSavingSnapshotMode] = React.useState<"THIS_WEEK_FINAL" | "NEXT_WEEK_PLANNED" | null>(null)
  const [planVsActualOpen, setPlanVsActualOpen] = React.useState(false)
  const [isLoadingPlanVsActual, setIsLoadingPlanVsActual] = React.useState(false)
  const [planVsActualError, setPlanVsActualError] = React.useState<string | null>(null)
  const [planVsActual, setPlanVsActual] = React.useState<WeeklyPlanPerformanceResponse | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [manualTaskOpen, setManualTaskOpen] = React.useState(false)
  const [manualTaskType, setManualTaskType] = React.useState<"project" | "fast">("fast")
  const [manualTaskTitle, setManualTaskTitle] = React.useState("")
  const [manualTaskDays, setManualTaskDays] = React.useState<string[]>([])
  const [manualTaskUserIds, setManualTaskUserIds] = React.useState<string[]>([])
  const [manualTaskPeriod, setManualTaskPeriod] = React.useState<"AM" | "PM">("AM")
  const [manualTaskDepartmentId, setManualTaskDepartmentId] = React.useState("")
  const [manualTaskFastType, setManualTaskFastType] = React.useState<string>("")
  const [manualTaskProjectId, setManualTaskProjectId] = React.useState("")
  const [isCreatingManualTask, setIsCreatingManualTask] = React.useState(false)
  const canDeleteProjects = user?.role === "ADMIN"
  const canSaveSnapshots = user?.role === "ADMIN" || user?.role === "MANAGER"

  // Drag-to-scroll refs and state
  const scrollContainerRefs = React.useRef<Map<string, HTMLDivElement>>(new Map())
  const isDraggingRef = React.useRef(false)
  const startXRef = React.useRef(0)
  const startYRef = React.useRef(0)
  const scrollLeftRef = React.useRef(0)
  const activeContainerRef = React.useRef<HTMLDivElement | null>(null)
  const hasDraggedRef = React.useRef(false)

  const handlePointerDown = React.useCallback((e: React.PointerEvent<HTMLDivElement>, deptId: string) => {
    // Don't start drag if clicking on a button, link, or input
    const target = e.target as HTMLElement
    if (target.closest("button") || target.closest("a") || target.closest("input")) return
    if (e.pointerType === "mouse" && e.button !== 0) return

    const container = scrollContainerRefs.current.get(deptId)
    if (!container) return

    isDraggingRef.current = true
    hasDraggedRef.current = false
    activeContainerRef.current = container
    startXRef.current = e.clientX
    startYRef.current = e.clientY
    scrollLeftRef.current = container.scrollLeft

    container.setPointerCapture(e.pointerId)
  }, [])

  // Global mouse move and up handlers
  React.useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current || !activeContainerRef.current) return

      const deltaX = Math.abs(e.clientX - startXRef.current)
      const deltaY = Math.abs(e.clientY - startYRef.current)

      // Only start dragging if moved more than 5px horizontally
      if (!hasDraggedRef.current && deltaX < 5) return

      // If we're dragging more vertically than horizontally, don't scroll
      if (deltaY > deltaX) return

      hasDraggedRef.current = true
      e.preventDefault()

      activeContainerRef.current.style.cursor = "grabbing"
      document.body.style.userSelect = "none"

      const walk = (e.clientX - startXRef.current) * 2
      activeContainerRef.current.scrollLeft = scrollLeftRef.current - walk
    }

    const handleGlobalPointerUp = () => {
      if (activeContainerRef.current) {
        activeContainerRef.current.style.cursor = "grab"
      }
      document.body.style.userSelect = ""
      isDraggingRef.current = false
      hasDraggedRef.current = false
      activeContainerRef.current = null
    }

    document.addEventListener("pointermove", handleGlobalPointerMove, { passive: false })
    document.addEventListener("pointerup", handleGlobalPointerUp)
    document.addEventListener("pointercancel", handleGlobalPointerUp)

    return () => {
      document.removeEventListener("pointermove", handleGlobalPointerMove)
      document.removeEventListener("pointerup", handleGlobalPointerUp)
      document.removeEventListener("pointercancel", handleGlobalPointerUp)
    }
  }, [])

  // Horizontal wheel scroll handler
  const handleWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>, deptId: string) => {
    const container = scrollContainerRefs.current.get(deptId)
    if (!container) return

    // Allow horizontal scrolling with Shift+wheel or trackpad horizontal swipe
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault()
      // Use deltaX if available (trackpad), otherwise use deltaY with Shift key
      const scrollAmount = e.deltaX !== 0 ? e.deltaX : e.deltaY
      container.scrollLeft += scrollAmount
    }
  }, [])

  const setScrollRef = React.useCallback((deptId: string) => (el: HTMLDivElement | null) => {
    if (el) {
      scrollContainerRefs.current.set(deptId, el)
    } else {
      scrollContainerRefs.current.delete(deptId)
    }
  }, [])

  const [deletingTaskId, setDeletingTaskId] = React.useState<string | null>(null)
  const [deletingProjectId, setDeletingProjectId] = React.useState<string | null>(null)

  const deleteTask = React.useCallback(async (
    taskId: string,
    taskTitle?: string,
    timeSlot?: "am" | "pm",
    dayDate?: string,
    userId?: string
  ) => {
    if (!taskId) return
    if (!dayDate || !userId) {
      toast.error("Missing planner context to remove this task.")
      return
    }

    const slotLabel = timeSlot ? timeSlot.toUpperCase() : "this slot"
    const confirmed = window.confirm(
      taskTitle
        ? `Remove task "${taskTitle}" from ${slotLabel} on ${dayDate} for this user?`
        : `Remove this task from ${slotLabel} on ${dayDate} for this user?`
    )

    if (!confirmed) return

    setDeletingTaskId(taskId)
    try {
      const body: any = {
        day_date: dayDate,
        user_id: userId,
      }
      if (timeSlot) {
        body.time_slot = timeSlot.toUpperCase()
      }
      const res = await apiFetch(`/tasks/${taskId}/remove-from-day`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        toast.error("Failed to remove task")
        return
      }
      toast.success("Task removed from this slot")
      const refreshParams = new URLSearchParams()
      if (departmentId !== ALL_DEPARTMENTS_VALUE) {
        refreshParams.set("department_id", departmentId)
      }
      refreshParams.set("is_this_week", isThisWeek.toString())
      const tableRes = await apiFetch(`/planners/weekly-table?${refreshParams.toString()}`)
      if (tableRes.ok) {
        setData(await tableRes.json())
      }
    } catch {
      toast.error("Failed to remove task")
    } finally {
      setDeletingTaskId(null)
    }
  }, [apiFetch, departmentId, isThisWeek])

  const deleteProject = React.useCallback(async (
    projectId: string,
    projectTitle?: string,
    timeSlot?: "am" | "pm",
    dayDate?: string,
    userId?: string
  ) => {
    if (!projectId) return
    if (!dayDate || !userId) {
      toast.error("Missing planner context to remove this project.")
      return
    }

    const slotLabel = timeSlot ? timeSlot.toUpperCase() : "this slot"
    const confirmed = window.confirm(
      projectTitle
        ? `Remove project "${projectTitle}" from ${slotLabel} on ${dayDate} for this user?`
        : `Remove this project from ${slotLabel} on ${dayDate} for this user?`
    )
    if (!confirmed) return

    setDeletingProjectId(projectId)
    try {
      const body: any = {
        day_date: dayDate,
        user_id: userId,
      }
      if (timeSlot) {
        body.time_slot = timeSlot.toUpperCase()
      }
      const res = await apiFetch(`/projects/${projectId}/remove-from-day`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        toast.error("Failed to remove project")
        return
      }
      toast.success("Project removed from this slot")
      const params = new URLSearchParams()
      if (departmentId !== ALL_DEPARTMENTS_VALUE) {
        params.set("department_id", departmentId)
      }
      params.set("is_this_week", isThisWeek.toString())
      const tableRes = await apiFetch(`/planners/weekly-table?${params.toString()}`)
      if (tableRes.ok) {
        setData(await tableRes.json())
      }
    } catch {
      toast.error("Failed to remove project")
    } finally {
      setDeletingProjectId(null)
    }
  }, [apiFetch, departmentId, isThisWeek])

  React.useEffect(() => {
    const boot = async () => {
      const [depRes, projRes] = await Promise.all([
        apiFetch("/departments"),
        apiFetch("/projects"),
      ])
      if (depRes.ok) {
        const deps = (await depRes.json()) as Department[]
        setDepartments(deps)
        if (user?.role === "STAFF" && user?.department_id) {
          setDepartmentId(user.department_id)
        } else {
          setDepartmentId(ALL_DEPARTMENTS_VALUE)
        }
      }
      if (projRes.ok) {
        const projs = (await projRes.json()) as Project[]
        setProjects(projs)
      }
      const usersRes = await apiFetch("/users/lookup")
      if (usersRes.ok) {
        const list = (await usersRes.json()) as UserLookup[]
        setUsers(list.filter((u) => u.is_active))
      }
    }
    void boot()
  }, [apiFetch, user])

  const loadPlanner = React.useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      qs.set("is_this_week", isThisWeek.toString())
      if (departmentId && departmentId !== ALL_DEPARTMENTS_VALUE) {
        qs.set("department_id", departmentId)
      }
      const res = await apiFetch(`/planners/weekly-table?${qs.toString()}`)
      if (!res.ok) {
        const errorText = await res.text()
        console.error("Failed to load weekly planner:", res.status, res.statusText, errorText)
        setError(`Failed to load planner: ${res.status} ${res.statusText}`)
        setData(null)
        setPvFestBlocks([])
        return
      }
      const payload = (await res.json()) as WeeklyTableResponse
      console.log("Weekly planner data:", payload)
      setData(payload)
      try {
        const blockParams = new URLSearchParams()
        blockParams.set("type", "PV_FEST")
        blockParams.set("start", payload.week_start)
        blockParams.set("end", payload.week_end)
        if (departmentId && departmentId !== ALL_DEPARTMENTS_VALUE) {
          blockParams.set("department_id", departmentId)
        }
        const blocksRes = await apiFetch(`/common-entries/blocks?${blockParams.toString()}`)
        if (blocksRes.ok) {
          const blocks = (await blocksRes.json()) as WeeklyPlannerBlock[]
          setPvFestBlocks(blocks)
        } else {
          setPvFestBlocks([])
        }
      } catch (err) {
        console.error("Failed to load PV/FEST blocks:", err)
        setPvFestBlocks([])
      }
    } catch (error) {
      console.error("Error loading weekly planner:", error)
      setError(error instanceof Error ? error.message : "Unknown error occurred")
      setData(null)
      setPvFestBlocks([])
    } finally {
      setIsLoading(false)
    }
  }, [apiFetch, departmentId, isThisWeek])

  React.useEffect(() => {
    if (viewMode !== "current") return
    void loadPlanner()
  }, [loadPlanner, viewMode])

  React.useEffect(() => {
    if (!manualTaskOpen) {
      // Reset all form state when dialog closes
      setManualTaskTitle("")
      setManualTaskDays([])
      setManualTaskUserIds([])
      setManualTaskPeriod("AM")
      setManualTaskDepartmentId("")
      setManualTaskFastType("")
      setManualTaskProjectId("")
      setManualTaskType("fast")
      return
    }
    if (departmentId !== ALL_DEPARTMENTS_VALUE) {
      setManualTaskDepartmentId(departmentId)
    }
  }, [manualTaskOpen, departmentId])

  React.useEffect(() => {
    if (!manualTaskDepartmentId) return
    setManualTaskUserIds([])
    setManualTaskProjectId("")
  }, [manualTaskDepartmentId])

  const availableDays = React.useMemo(() => {
    if (!data?.departments?.length) return []
    const firstDept = data.departments[0]
    return firstDept.days.map((day, index) => ({
      value: day.date,
      label: DAY_NAMES[index] || formatDate(day.date),
    }))
  }, [data])

  const availableUsers = React.useMemo(() => {
    const filtered = manualTaskDepartmentId
      ? users.filter((u) => u.department_id === manualTaskDepartmentId)
      : users
    return filtered
      .map((u) => ({
        id: u.id,
        name: u.full_name || u.username || "",
      }))
      .filter((u) => u.name.trim().length > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [manualTaskDepartmentId, users])

  const availableDepartments = React.useMemo(() => {
    return departments.slice().sort((a, b) => a.name.localeCompare(b.name))
  }, [departments])

  const pvFestByUserDate = React.useMemo(() => {
    const map = new Map<string, Map<string, WeeklyPlannerBlock[]>>()
    for (const block of pvFestBlocks) {
      if (!block.user_id || !block.start_date || !block.end_date) continue
      let current = fromISODate(block.start_date)
      const end = fromISODate(block.end_date)
      while (current <= end) {
        const iso = toISODate(current)
        const byDate = map.get(block.user_id) ?? new Map<string, WeeklyPlannerBlock[]>()
        const list = byDate.get(iso) ?? []
        list.push(block)
        byDate.set(iso, list)
        map.set(block.user_id, byDate)
        current.setDate(current.getDate() + 1)
      }
    }
    return map
  }, [pvFestBlocks])

  const getBlockForSlot = React.useCallback(
    (userId: string, dayIso: string, slot: "am" | "pm") => {
      const blocks = pvFestByUserDate.get(userId)?.get(dayIso) || []
      if (!blocks.length) return null
      const slotStart = slot === "am" ? 0 : 12 * 60
      const slotEnd = slot === "am" ? 12 * 60 : 24 * 60
      return (
        blocks.find((block) => {
          if (block.full_day) return true
          const start = timeToMinutes(block.start_time) ?? 0
          const end = timeToMinutes(block.end_time) ?? 24 * 60
          if (end <= start) return true
          return start < slotEnd && end > slotStart
        }) || null
      )
    },
    [pvFestByUserDate]
  )

  const isProjectClosed = React.useCallback((project: Project) => {
    const statusValue = (project.status || "").toUpperCase()
    const phaseValue = (project.current_phase || "").toUpperCase()
    if (project.completed_at) return true
    if (statusValue === "CLOSED" || statusValue === "MBYLLUR" || statusValue === "LOST" || statusValue === "CANCELLED") return true
    if (phaseValue === "CLOSED" || phaseValue === "MBYLLUR") return true
    return false
  }, [])

  const projectLabel = React.useCallback((project: Project) => {
    return project.title || project.name || "Untitled project"
  }, [])

  const availableProjects = React.useMemo(() => {
    if (!manualTaskDepartmentId) return []
    return projects
      .filter((project) => project.department_id === manualTaskDepartmentId)
      .filter((project) => !project.is_template)
      .filter((project) => !isProjectClosed(project))
      .slice()
      .sort((a, b) => projectLabel(a).localeCompare(projectLabel(b)))
  }, [manualTaskDepartmentId, projects, isProjectClosed, projectLabel])

  const manualTaskDepartmentValue =
    departmentId !== ALL_DEPARTMENTS_VALUE ? departmentId : manualTaskDepartmentId

  const handleCreateManualTask = async () => {
    if (!manualTaskTitle.trim()) {
      toast.error("Task title is required.")
      return
    }
    if (!manualTaskDepartmentValue) {
      toast.error("Select a department.")
      return
    }
    if (manualTaskType === "fast") {
      // Fast Task validation
      if (manualTaskDays.length === 0) {
        toast.error("Select at least one day.")
        return
      }
      if (manualTaskUserIds.length === 0) {
        toast.error("Select at least one member.")
        return
      }
      if (!manualTaskFastType) {
        toast.error("Select a task type.")
        return
      }
    } else {
      // Project validation
      if (manualTaskDays.length === 0) {
        toast.error("Select at least one day.")
        return
      }
      if (!manualTaskProjectId) {
        toast.error("Select a project.")
        return
      }
      if (manualTaskUserIds.length === 0) {
        toast.error("Select at least one member.")
        return
      }
    }

    const departmentValue = manualTaskDepartmentValue
    if (!departmentValue) {
      toast.error("Department is required for this task.")
      return
    }

    setIsCreatingManualTask(true)
    try {
      if (manualTaskType === "fast") {
        // Create fast tasks for multiple days and members
        const tasksToCreate: Promise<Response>[] = []

        for (const day of manualTaskDays) {
          for (const userId of manualTaskUserIds) {
            const dueDateIso = new Date(day).toISOString()
            const taskPayload: any = {
              title: manualTaskTitle.trim(),
              project_id: null,
              department_id: departmentValue,
              assigned_to: userId,
              status: "TODO",
              priority: "NORMAL",
              finish_period: manualTaskPeriod,
              due_date: dueDateIso,
            }

            // Set fast task type flags
            if (manualTaskFastType === "BLL") {
              taskPayload.is_bllok = true
            } else if (manualTaskFastType === "R1") {
              taskPayload.is_r1 = true
            } else if (manualTaskFastType === "1H") {
              taskPayload.is_1h_report = true
            } else if (manualTaskFastType === "P:") {
              taskPayload.is_personal = true
            }

            tasksToCreate.push(
              apiFetch("/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(taskPayload),
              })
            )
          }
        }

        const results = await Promise.all(tasksToCreate)
        const failed = results.filter(r => !r.ok)
        if (failed.length > 0) {
          toast.error(`Failed to create ${failed.length} task(s).`)
          return
        }
        toast.success(`Created ${tasksToCreate.length} fast task(s).`)
      } else {
        // Create project tasks for multiple days and members
        const tasksToCreate: Promise<Response>[] = []

        for (const day of manualTaskDays) {
          for (const userId of manualTaskUserIds) {
            const dueDateIso = new Date(day).toISOString()
            tasksToCreate.push(
              apiFetch("/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: manualTaskTitle.trim(),
                  project_id: manualTaskProjectId,
                  department_id: departmentValue,
                  assigned_to: userId,
                  status: "TODO",
                  priority: "NORMAL",
                  finish_period: manualTaskPeriod,
                  due_date: dueDateIso,
                }),
              })
            )
          }
        }

        const results = await Promise.all(tasksToCreate)
        const failed = results.filter(r => !r.ok)
        if (failed.length > 0) {
          toast.error(`Failed to create ${failed.length} task(s).`)
          return
        }
        toast.success(`Created ${tasksToCreate.length} project task(s).`)
      }

      setManualTaskOpen(false)
      setManualTaskTitle("")
      setManualTaskDays([])
      setManualTaskUserIds([])
      setManualTaskPeriod("AM")
      setManualTaskDepartmentId("")
      setManualTaskFastType("")
      setManualTaskProjectId("")
      setManualTaskType("fast")
      await loadPlanner()
    } catch (error) {
      console.error("Error creating task:", error)
      toast.error("Failed to create task")
    } finally {
      setIsCreatingManualTask(false)
    }
  }

  // Edit/delete handlers removed - now showing projects instead of individual tasks



  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  const fastTaskBadgeStyles: Record<string, string> = {
    BLL: "border-red-200 bg-red-50 text-red-700",
    R1: "border-indigo-200 bg-indigo-50 text-indigo-700",
    "1H": "border-amber-200 bg-amber-50 text-amber-700",
    "P:": "border-emerald-200 bg-emerald-50 text-emerald-700",
    N: "border-slate-200 bg-slate-50 text-slate-700",
  }

  const getStatusCardClasses = React.useCallback((status?: string | null) => {
    const normalized = (status || "TODO").toUpperCase()
    if (normalized === "IN_PROGRESS") {
      return "border-[#000000] bg-[#FFFF00] text-[#000000]"
    }
    if (normalized === "DONE") {
      return "border-[#000000] bg-[#C4FDC4] text-[#000000]"
    }
    if (normalized === "TODO") {
      return "border-[#000000] bg-[#FFC4ED] text-[#000000]"
    }
    return "border-[#000000] bg-[#f1f5f9] text-[#000000]"
  }, [])

  const getStatusCardClassesForDay = React.useCallback(
    (
      status?: string | null,
      completedAt?: string | null,
      dayDate?: string | null,
      dailyStatus?: string | null
    ) => {
      const normalized = (status || "TODO").toUpperCase()
      // If the task was completed on this specific day, show it as DONE even if daily_status is stale.
      if (normalized === "DONE" && completedAt && dayDate) {
        const completedDate = completedAt.slice(0, 10)
        const currentDate = dayDate.slice(0, 10)
        if (completedDate === currentDate) {
          return getStatusCardClasses("DONE")
        }
      }
      if (dailyStatus) {
        return getStatusCardClasses(dailyStatus)
      }
      if (normalized !== "DONE") {
        return getStatusCardClasses(normalized)
      }
      if (!completedAt || !dayDate) {
        return getStatusCardClasses("IN_PROGRESS")
      }
      const completedDate = completedAt.slice(0, 10)
      const currentDate = dayDate.slice(0, 10)
      if (completedDate === currentDate) {
        return getStatusCardClasses("DONE")
      }
      return getStatusCardClasses("IN_PROGRESS")
    },
    [getStatusCardClasses]
  )

  const getStatusValueForDay = React.useCallback(
    (
      status?: string | null,
      completedAt?: string | null,
      dayDate?: string | null,
      dailyStatus?: string | null
    ) => {
      const normalized = (status || "TODO").toUpperCase()
      // If the task was completed on this specific day, treat it as DONE even if daily_status is stale.
      if (normalized === "DONE" && completedAt && dayDate) {
        const completedDate = completedAt.slice(0, 10)
        const currentDate = dayDate.slice(0, 10)
        if (completedDate === currentDate) {
          return "DONE"
        }
      }
      if (dailyStatus) {
        const normalizedDaily = dailyStatus.toUpperCase()
        return normalizedDaily === "DONE" ? "DONE" : normalizedDaily === "IN_PROGRESS" ? "IN_PROGRESS" : "TODO"
      }
      if (normalized !== "DONE") {
        return normalized === "TODO" ? "TODO" : "IN_PROGRESS"
      }
      if (!completedAt || !dayDate) {
        return "IN_PROGRESS"
      }
      const completedDate = completedAt.slice(0, 10)
      const currentDate = dayDate.slice(0, 10)
      if (completedDate === currentDate) {
        return "DONE"
      }
      return "IN_PROGRESS"
    },
    []
  )

  const getTaskStatusBadge = React.useCallback((task: {
    is_bllok?: boolean
    is_1h_report?: boolean
    is_r1?: boolean
    is_personal?: boolean
    ga_note_origin_id?: string | null
    fast_task_type?: string | null
  }): { label: string; className: string } | null => {
    if (task.is_bllok) {
      return { label: "BLL", className: "border-red-200 bg-red-50 text-red-700" }
    }
    if (task.is_r1) {
      return { label: "R1", className: "border-indigo-200 bg-indigo-50 text-indigo-700" }
    }
    if (task.is_1h_report) {
      return { label: "1H", className: "border-amber-200 bg-amber-50 text-amber-700" }
    }
    if (task.is_personal) {
      return { label: "P:", className: "border-emerald-200 bg-emerald-50 text-emerald-700" }
    }
    return null // NORMAL = no badge
  }, [])

  const getFastTaskBadge = React.useCallback((task: {
    is_bllok?: boolean
    is_1h_report?: boolean
    is_r1?: boolean
    is_personal?: boolean
    ga_note_origin_id?: string | null
    fast_task_type?: string | null
  }): { label: string; className: string } => {
    const badge = getTaskStatusBadge(task)
    if (badge) return badge
    if (task.fast_task_type) {
      if (task.fast_task_type === "GA") {
        return { label: "N", className: "border-slate-200 bg-slate-50 text-slate-700" }
      }
      return {
        label: task.fast_task_type,
        className: fastTaskBadgeStyles[task.fast_task_type] || "border-slate-200 bg-slate-50 text-slate-700",
      }
    }
    return { label: "N", className: "border-slate-200 bg-slate-50 text-slate-700" }
  }, [getTaskStatusBadge, fastTaskBadgeStyles])

  const fastTaskSortOrder = ["BLL", "1H", "P:", "R1", "N"] as const
  const fastTaskSortRank = new Map<string, number>(
    fastTaskSortOrder.map((label, index) => [label, index])
  )

  const getFastTaskSortLabel = React.useCallback((task: {
    is_bllok?: boolean
    is_1h_report?: boolean
    is_r1?: boolean
    is_personal?: boolean
    ga_note_origin_id?: string | null
    fast_task_type?: string | null
  }) => {
    const badge = getFastTaskBadge(task)
    return badge?.label || "N"
  }, [getFastTaskBadge])

  const sortFastTasks = React.useCallback((tasks: WeeklyTableTaskEntry[]) => (
    tasks
      .map((task, index) => ({ task, index }))
      .sort((a, b) => {
        const aLabel = getFastTaskSortLabel(a.task)
        const bLabel = getFastTaskSortLabel(b.task)
        const aRank = fastTaskSortRank.get(aLabel) ?? fastTaskSortOrder.length
        const bRank = fastTaskSortRank.get(bLabel) ?? fastTaskSortOrder.length
        if (aRank !== bRank) return aRank - bRank
        return a.index - b.index
      })
      .map((entry) => entry.task)
  ), [getFastTaskSortLabel, fastTaskSortOrder.length, fastTaskSortRank])

  const handlePrint = React.useCallback(async () => {
    if (!data) return

    const printWindow = window.open("", "_blank")
    if (!printWindow) return

    const weekRange = `${formatDate(data.week_start)} - ${formatDate(data.week_end)}`
    const selectedDept = departmentId !== ALL_DEPARTMENTS_VALUE
      ? formatDepartmentName(departments.find(d => d.id === departmentId)?.name || "All Departments")
      : "All Departments"
    const printedAt = new Date()
    const printInitials = (user?.full_name || user?.username || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
    const legendEntriesByDept = new Map<string, LegendEntry[]>()
    const escapeHtml = (value: string) => (
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
    )

    await Promise.all(
      data.departments.map(async (dept) => {
        const legendConfig = getLegendQuestions(dept.department_name)
        if (!legendConfig) return

        let entries: LegendEntry[] = []
        try {
          const qs = new URLSearchParams()
          qs.set("department_id", dept.department_id)
          qs.set("week_start", data.week_start)
          const res = await apiFetch(`/planners/weekly-planner/legend?${qs.toString()}`)
          if (res.ok) {
            entries = (await res.json()) as LegendEntry[]
          }
        } catch (error) {
          console.error("Failed to load print legend entries:", error)
        }

        const displayEntries = buildLegendDisplayEntries({
          entries,
          departmentId: dept.department_id,
          weekStart: data.week_start,
          departmentName: dept.department_name,
        })
        legendEntriesByDept.set(dept.department_id, displayEntries)
      })
    )

    const printHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Weekly Planner - ${weekRange}</title>
          <style>
            @media print {
              @page {
                size: letter portrait;
                margin-top: 0.35in;
                margin-bottom: 0.35in;
                margin-left: 0.4in;
                margin-right: 0.4in;
              }
              body { margin: 0; padding: 0; }
              .print-page { page-break-after: avoid; page-break-inside: avoid; }
              .print-page:last-child { page-break-after: avoid; }
              table { page-break-inside: avoid; }
              tr { page-break-inside: avoid; }
              tbody { page-break-inside: avoid; }
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              line-height: 1.1;
            }
            body {
              font-family: Arial, sans-serif;
              font-size: 5.5pt;
              margin: 0;
              padding: 0;
              width: 100%;
              margin-left: auto;
              margin-right: auto;
              direction: ltr;
            }
            .print-page {
              position: relative;
              height: calc(11in - 0.7in);
              width: 100%;
              display: grid;
              grid-template-rows: auto auto 1fr auto;
            }
            .print-header {
              display: grid;
              grid-template-columns: 1fr auto 1fr;
              align-items: center;
              margin-bottom: 2px;
            }
            .print-header.compact {
              grid-template-columns: 1fr auto;
              margin-bottom: 2px;
            }
            .print-title {
              margin: 0;
              font-size: 8pt;
              font-weight: 700;
              text-transform: uppercase;
              text-align: center;
              color: #0f172a;
              line-height: 1.1;
            }
            .print-datetime {
              text-align: right;
              font-size: 6pt;
              color: #334155;
            }
            .print-meta {
              text-align: center;
              margin-bottom: 2px;
              font-size: 6pt;
              color: #334155;
            }
            .print-meta.compact {
              margin-bottom: 2px;
              font-size: 0;
              line-height: 0;
              height: 0;
              overflow: hidden;
            }
            .print-content {
              width: 100%;
              min-height: 0;
              overflow: visible;
              max-height: calc(11in - 0.7in - 70px);
              padding-left: 0.05in;
              padding-right: 0.05in;
            }
            .print-dept-title {
              margin-top: 2px;
              margin-bottom: 1px;
              font-size: 7pt;
              font-weight: 700;
            }
            .print-legend {
              margin-top: 2px;
              margin-bottom: 6px;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .print-legend-title {
              font-size: 6.5pt;
              font-weight: 700;
              margin-bottom: 2px;
              color: #0f172a;
            }
            .legend-table {
              margin: 0;
            }
            .legend-table th,
            .legend-table td {
              font-size: 6pt;
              padding: 1px;
              vertical-align: middle;
            }
            .legend-color-box {
              width: 18px;
              height: 10px;
              border: 0.5px solid #000;
            }
            .legend-question {
              color: #991b1b;
              font-weight: 600;
            }
            .legend-answer-line {
              height: 9px;
              border-bottom: 0.5px solid #000;
            }
            .pv-fest-cell {
              position: relative;
              min-height: 18px;
              border: 0.5px solid #cbd5e1;
              background: #f1f5f9;
              color: #475569;
              border-radius: 3px;
              padding: 2px 4px 3px;
              display: flex;
              align-items: flex-start;
              justify-content: flex-start;
            }
            .pv-fest-badge {
              position: absolute;
              top: 1px;
              right: 1px;
              font-size: 4.5pt;
              font-weight: 700;
              text-transform: uppercase;
              background: #e2e8f0;
              color: #475569;
              padding: 1px 2px;
              border-radius: 2px;
              letter-spacing: 0.2px;
            }
            .pv-fest-note {
              font-size: 5pt;
              font-weight: 600;
              line-height: 1.15;
              margin-top: 6px;
              color: #475569;
            }
            .print-legend-spacer {
              height: 0.18in;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
              margin-bottom: 0.01in;
              direction: ltr;
            }
            thead {
              display: table-header-group;
            }
            tbody.day-group {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            tr {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .print-content {
              max-height: calc(11in - 0.7in - 70px);
              overflow: visible;
            }
            th {
              background-color: #e2e8f0;
              border: 0.5px solid #000;
              padding: 1px;
              text-align: left;
              font-weight: bold;
              font-size: 5.5pt;
              text-transform: uppercase;
              vertical-align: bottom;
              line-height: 1.1;
              overflow-wrap: anywhere;
              word-break: break-word;
            }
            th.user-header {
              white-space: normal;
              word-break: break-word;
              font-size: 5.5pt;
              line-height: 1.05;
            }
            td {
              border: 0.5px solid #000;
              padding: 0.5px;
              vertical-align: bottom;
              font-size: 5.5pt;
              line-height: 1.1;
              text-align: left;
              overflow-wrap: anywhere;
              word-break: break-word;
            }
            .day-cell {
              font-weight: bold;
              background-color: #f9f9f9;
              text-align: left;
              width: 70px;
              vertical-align: bottom;
              white-space: nowrap;
            }
            .ll-cell {
              font-weight: bold;
              background-color: #f9f9f9;
              text-align: left;
              width: 32px;
              vertical-align: bottom;
              font-size: 4.5pt;
              line-height: 1;
              letter-spacing: -0.2px;
              white-space: nowrap;
              padding-left: 0.5px;
              padding-right: 0.5px;
            }
            .time-cell {
              width: 22px;
              text-align: left;
              padding-left: 1px;
              padding-right: 1px;
              vertical-align: bottom;
            }
            .print-subhead {
              font-weight: bold;
              text-transform: uppercase;
              font-size: 6pt;
            }
            .project-card {
              margin: 1px 0;
              padding: 1px;
              background-color: #f5f5f5;
              border: 0.5px solid #ddd;
              border-radius: 2px;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .project-title {
              font-weight: bold;
              margin-bottom: 0.5px;
              line-height: 1.1;
              overflow-wrap: anywhere;
              word-break: break-word;
            }
            .task-item {
              font-size: 5pt;
              margin: 0.5px 0;
              padding: 0.5px 1px;
              border: 0.5px solid #000;
              border-radius: 2px;
              background-color: #fff;
              break-inside: avoid;
              page-break-inside: avoid;
              line-height: 1.1;
              overflow-wrap: anywhere;
              word-break: break-word;
            }
            .task-status-todo { background-color: #FFC4ED; }
            .task-status-in-progress { background-color: #FFFF00; }
            .task-status-done { background-color: #C4FDC4; }
            .badge {
              display: inline-block;
              padding: 0.5px 2px;
              border-radius: 2px;
              font-size: 5pt;
              font-weight: bold;
              margin-left: 1px;
              line-height: 1.1;
            }
            .badge-bll { background-color: #fee2e2; color: #991b1b; }
            .badge-r1 { background-color: #e0e7ff; color: #3730a3; }
            .badge-1h { background-color: #fef3c7; color: #92400e; }
            .badge-ga { background-color: #dbeafe; color: #1e40af; }
            .badge-p { background-color: #d1fae5; color: #065f46; }
            .badge-n { background-color: #f1f5f9; color: #475569; }
            .products {
              color: #2563eb;
              font-weight: bold;
              font-size: 5pt;
            }
            .empty-cell {
              text-align: left;
              color: #999;
            }
            .pm-row {
              border-top: 1px solid #000 !important;
            }
            .table-narrow th,
            .table-narrow td {
              font-size: 5pt;
            }
            .table-narrow .task-item,
            .table-narrow .badge,
            .table-narrow .products {
              font-size: 4pt;
            }
            .table-compact th,
            .table-compact td {
              font-size: 5pt;
              padding: 0.5px;
            }
            .table-compact .task-item,
            .table-compact .badge,
            .table-compact .products {
              font-size: 4pt;
            }
            .table-compact th.user-header {
              font-size: 5pt;
              line-height: 1;
            }
            .table-ultra-compact th,
            .table-ultra-compact td {
              font-size: 4.5pt;
              padding: 0.25px;
            }
            .table-ultra-compact .task-item,
            .table-ultra-compact .badge,
            .table-ultra-compact .products {
              font-size: 3.5pt;
            }
            .table-ultra-compact th.user-header {
              font-size: 4.5pt;
              line-height: 1;
            }
            .print-footer {
              margin-top: auto;
              display: grid;
              grid-template-columns: 1fr auto 1fr;
              padding-left: 0.1in;
              padding-right: 0.04in;
              padding-bottom: 0.05in;
              font-size: 6pt;
              color: #334155;
              background: #fff;
            }
            .print-page-count {
              text-align: center;
            }
            .print-initials {
              text-align: right;
            }
            .print-measure {
              position: absolute;
              left: -9999px;
              top: 0;
              visibility: hidden;
              width: 7.7in;
            }
          </style>
        </head>
        <body>
          <div id="print-root"></div>
        </body>
      </html>
    `

    printWindow.document.write(printHtml)
    printWindow.document.close()
    printWindow.focus()

    const doc = printWindow.document
    const root = doc.getElementById("print-root")
    if (!root) return



    const formatPrintedAt = printedAt.toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

    const createHeader = (showTitle: boolean) => {
      const header = doc.createElement("div")
      header.className = showTitle ? "print-header" : "print-header compact"
      header.innerHTML = showTitle
        ? `
        <div></div>
        <div class="print-title">Weekly Planner</div>
        <div class="print-datetime">${formatPrintedAt}</div>
      `
        : `
        <div></div>
        <div class="print-datetime">${formatPrintedAt}</div>
      `
      return header
    }

    const createMeta = (showMeta: boolean) => {
      const meta = doc.createElement("div")
      meta.className = showMeta ? "print-meta" : "print-meta compact"
      meta.innerHTML = showMeta
        ? `<strong>Week:</strong> ${weekRange} | <strong>Department:</strong> ${selectedDept}`
        : ""
      return meta
    }

    const createFooter = () => {
      const footer = doc.createElement("div")
      footer.className = "print-footer"
      footer.innerHTML = `
        <div></div>
        <div class="print-page-count"></div>
        <div class="print-initials">PUNOI: ${printInitials}</div>
      `
      return footer
    }

    const createLegendSection = (entries: LegendEntry[]) => {
      const wrapper = doc.createElement("div")
      wrapper.className = "print-legend"

      const title = doc.createElement("div")
      title.className = "print-legend-title"
      title.textContent = "Legend / Questions"
      wrapper.appendChild(title)

      const table = doc.createElement("table")
      table.className = "legend-table"

      const colgroup = doc.createElement("colgroup")
      colgroup.innerHTML = `
        <col style="width: 28px;" />
        <col style="width: 70px;" />
        <col />
        <col style="width: 120px;" />
      `
      table.appendChild(colgroup)

      const thead = doc.createElement("thead")
      thead.innerHTML = `
        <tr>
          <th>Color</th>
          <th>Label</th>
          <th>Question</th>
          <th>Answer</th>
        </tr>
      `
      table.appendChild(thead)

      const tbody = doc.createElement("tbody")
      entries.forEach((entry) => {
        const row = doc.createElement("tr")

        const colorCell = doc.createElement("td")
        const colorBox = doc.createElement("div")
        colorBox.className = "legend-color-box"
        colorBox.style.backgroundColor = LEGEND_COLORS[entry.label] || "#E5E7EB"
        colorCell.appendChild(colorBox)
        row.appendChild(colorCell)

        const labelCell = doc.createElement("td")
        labelCell.textContent = getLegendLabelDisplay(entry.label)
        row.appendChild(labelCell)

        const questionCell = doc.createElement("td")
        if (entry.question_text) {
          const question = doc.createElement("span")
          question.className = "legend-question"
          question.textContent = entry.question_text
          questionCell.appendChild(question)
        } else {
          questionCell.textContent = "-"
        }
        row.appendChild(questionCell)

        const answerCell = doc.createElement("td")
        const answer = entry.answer_text?.trim() || ""
        if (answer) {
          answerCell.textContent = answer
        } else {
          const answerLine = doc.createElement("div")
          answerLine.className = "legend-answer-line"
          answerCell.appendChild(answerLine)
        }
        row.appendChild(answerCell)

        tbody.appendChild(row)
      })
      table.appendChild(tbody)

      wrapper.appendChild(table)
      return wrapper
    }

    const createPage = (options?: { showTitle?: boolean; showMeta?: boolean }) => {
      const { showTitle = true, showMeta = true } = options || {}
      const page = doc.createElement("div")
      page.className = "print-page"
      page.appendChild(createHeader(showTitle))
      page.appendChild(createMeta(showMeta))
      const content = doc.createElement("div")
      content.className = "print-content"
      page.appendChild(content)
      page.appendChild(createFooter())
      return { page, content }
    }

    const dayColWidth = 70
    const llColWidth = 32
    const timeColWidth = 22
    const minUserColWidth = 48
    const targetUserColWidth = 72

    const getUserDisplayName = (lookup: UserLookup) => (
      lookup.full_name || lookup.username || ""
    )

    const getDepartmentUsersForPrint = (dept: WeeklyTableDepartment) => {
      const deptUsers = users
        .filter((lookup) => lookup.department_id === dept.department_id)
        .map((lookup) => ({
          user_id: lookup.id,
          user_name: getUserDisplayName(lookup).trim(),
        }))
        .filter((user) => user.user_name.length > 0)
        .sort((a, b) => a.user_name.localeCompare(b.user_name))

      const dataUsersMap = new Map<string, WeeklyTableUserDay>()
      dept.days.forEach((day) => {
        day.users.forEach((userDay) => {
          if (!dataUsersMap.has(userDay.user_id)) {
            dataUsersMap.set(userDay.user_id, userDay)
          }
        })
      })

      const extraUsers = Array.from(dataUsersMap.values())
        .filter((userDay) => !deptUsers.some((user) => user.user_id === userDay.user_id))
        .map((userDay) => ({
          user_id: userDay.user_id,
          user_name: userDay.user_name,
        }))
        .filter((user) => user.user_name.trim().length > 0)
        .sort((a, b) => a.user_name.localeCompare(b.user_name))

      return [...deptUsers, ...extraUsers]
    }

    const getPrintableWidth = () => {
      if (measure.clientWidth) return measure.clientWidth
      return Math.max(0, Math.floor(printWindow.innerWidth * 0.9))
    }

    const getUserColumnWidth = (userCount: number) => {
      const measureWidth = getPrintableWidth() ? Math.floor(getPrintableWidth() * 0.98) : 0
      const fixedWidth = dayColWidth + llColWidth + timeColWidth
      const availableWidth = Math.max(0, measureWidth - fixedWidth)
      if (userCount <= 0) return minUserColWidth
      return Math.max(minUserColWidth, Math.floor(availableWidth / userCount))
    }

    const getMaxUsersPerPage = (totalUsers: number) => {
      if (totalUsers <= 0) return 1
      const printableWidth = getPrintableWidth()
      const fixedWidth = dayColWidth + llColWidth + timeColWidth
      const availableWidth = Math.max(0, printableWidth - fixedWidth)
      if (availableWidth <= 0) return 1
      const maxByTarget = Math.max(1, Math.floor(availableWidth / targetUserColWidth))
      return Math.min(totalUsers, maxByTarget)
    }

    const chunkUsers = (allUsers: WeeklyPrintUser[], chunkSize: number) => {
      if (chunkSize <= 0) return [allUsers]
      const chunks: WeeklyPrintUser[][] = []
      for (let i = 0; i < allUsers.length; i += chunkSize) {
        chunks.push(allUsers.slice(i, i + chunkSize))
      }
      return chunks
    }

    const createTable = (allUsers: WeeklyPrintUser[]) => {
      const userCount = allUsers.length
      const userColWidth = getUserColumnWidth(userCount)
      const table = doc.createElement("table")
      if (userColWidth <= 55) {
        table.classList.add("table-narrow")
      }
      if (userCount >= 8) {
        table.classList.add("table-compact")
      }
      if (userCount >= 12) {
        table.classList.add("table-ultra-compact")
      }
      const colgroup = doc.createElement("colgroup")
      colgroup.innerHTML = `
        <col style="width: ${dayColWidth}px;" />
        <col style="width: ${timeColWidth}px;" />
        <col style="width: ${llColWidth}px;" />
        ${allUsers.map(() => `<col style="width: ${userColWidth}px;" />`).join("")}
      `
      const thead = doc.createElement("thead")
      thead.innerHTML = `
        <tr>
          <th class="day-cell" rowspan="2">Day</th>
          <th class="time-cell" style="width: ${timeColWidth}px;">Time</th>
          <th style="width: ${llColWidth}px;">LL</th>
          ${allUsers.map(user => `<th class="user-header">${user.user_name}</th>`).join("")}
        </tr>
      `
      table.appendChild(colgroup)
      table.appendChild(thead)
      return table
    }

    const fitContentToWidth = (content: HTMLElement) => {
      const tables = Array.from(content.querySelectorAll("table")) as HTMLTableElement[]
      const maxTableWidth = tables.reduce((max, table) => Math.max(max, table.scrollWidth), 0)
      const availableWidth = Math.max(0, content.clientWidth - 2)
      if (maxTableWidth > 0 && availableWidth > 0) {
        const scale = Math.min(1, (availableWidth / maxTableWidth) * 0.98)
        if (scale < 1) {
          content.style.transform = `scale(${scale})`
          content.style.transformOrigin = "top left"
          content.style.width = `${Math.round((1 / scale) * 1000) / 10}%`
          return
        }
      }
      content.style.transform = ""
      content.style.transformOrigin = ""
      content.style.width = "100%"
    }

    const isContentOverflowing = (content: HTMLElement | null) => {
      if (!content) return false
      // Force layout so scrollHeight/clientHeight are accurate in the offscreen measure container.
      void content.offsetHeight
      return content.clientHeight > 0 && content.scrollHeight > content.clientHeight + 1
    }

    const buildBadgeClass = (label: string) => {
      if (label === "BLL") return "badge-bll"
      if (label === "R1") return "badge-r1"
      if (label === "1H") return "badge-1h"
      if (label === "GA") return "badge-ga"
      if (label === "P:") return "badge-p"
      if (label === "N") return "badge-n"
      return ""
    }

    const renderDayGroupHtml = (day: WeeklyTableDay, dayIndex: number, allUsers: WeeklyPrintUser[]) => {
      const dayName = DAY_NAMES[dayIndex]
      const dayDate = formatDate(day.date)
      const dayIso = day.date

      let html = `
        <tr>
          <td class="day-cell" rowspan="4" style="text-align: left; padding: 1px;">
            <div style="display: flex; flex-direction: column;">
              <strong class="print-subhead">${dayName}</strong>
              <span class="print-subhead" style="margin-top: 0.5px;">${dayDate}</span>
            </div>
          </td>
          <td class="print-subhead time-cell" rowspan="2">AM</td>
          <td class="ll-cell print-subhead">PRJK</td>
      `
      allUsers.forEach((user) => {
        const userDay = day.users.find(u => u.user_id === user.user_id)
        const projects = userDay?.am_projects || []
        const systemTasks = userDay?.am_system_tasks || []
        const block = getBlockForSlot(user.user_id, dayIso, "am")
        const isBlocked = Boolean(block)

        html += `<td>`
        if (isBlocked) {
          html += `<div class="pv-fest-cell">`
          html += `<div class="pv-fest-badge">PV/FEST</div>`
          html += `<div class="pv-fest-note">${block?.note ? escapeHtml(block.note) : ""}</div>`
          html += `</div>`
        } else if (projects.length > 0 || systemTasks.length > 0) {
          projects.forEach((project, projectIndex) => {
            html += `<div class="project-card">
              <div class="project-title">${projectIndex + 1}. ${project.project_title}`
            if (project.project_total_products) {
              html += ` <span style="color: #666; font-size: 4pt;">(${project.project_total_products})</span>`
            }
            html += `</div>`
            if (project.tasks && project.tasks.length > 0) {
              project.tasks.forEach((task, taskIndex) => {
                const statusValue = getStatusValueForDay(task.status, task.completed_at, dayIso, task.daily_status)
                const statusClass =
                  statusValue === "DONE"
                    ? "task-status-done"
                    : statusValue === "IN_PROGRESS"
                      ? "task-status-in-progress"
                      : "task-status-todo"
                const taskNumber = `${projectIndex + 1}.${taskIndex + 1}`
                html += `<div class="task-item ${statusClass}">${taskNumber}. ${task.task_title}`
                if (task.daily_products) {
                  html += ` <span class="products">${task.daily_products} pcs</span>`
                }
                const badge = getTaskStatusBadge(task)
                if (badge) {
                  html += ` <span class="badge ${buildBadgeClass(badge.label)}">${badge.label}</span>`
                }
                html += `</div>`
              })
            }
            html += `</div>`
          })
          if (systemTasks.length > 0) {
            html += `<div style="margin-top: 1px; font-size: 4pt; color: #1e40af;"><strong>System Tasks:</strong>`
            systemTasks.forEach((task, taskIndex) => {
              html += `<div class="task-item">${taskIndex + 1}. ${task.title}</div>`
            })
            html += `</div>`
          }
        } else {
          html += `<div class="empty-cell">-</div>`
        }
        html += `</td>`
      })
      html += `</tr>`

      html += `<tr>`
      html += `<td class="ll-cell print-subhead">FT</td>`
      allUsers.forEach((user) => {
        const userDay = day.users.find(u => u.user_id === user.user_id)
        const fastTasks = sortFastTasks(userDay?.am_fast_tasks || [])
        const block = getBlockForSlot(user.user_id, dayIso, "am")
        const isBlocked = Boolean(block)

        html += `<td>`
        if (isBlocked) {
          html += `<div class="pv-fest-cell">`
          html += `<div class="pv-fest-badge">PV/FEST</div>`
          html += `<div class="pv-fest-note">${block?.note ? escapeHtml(block.note) : ""}</div>`
          html += `</div>`
        } else if (fastTasks.length > 0) {
          html += `<div style="font-size: 4pt; color: #0f172a;">`
          fastTasks.forEach((task, taskIndex) => {
            const statusValue = getStatusValueForDay(task.status, task.completed_at, dayIso, task.daily_status)
            const statusClass =
              statusValue === "DONE"
                ? "task-status-done"
                : statusValue === "IN_PROGRESS"
                  ? "task-status-in-progress"
                  : "task-status-todo"
            html += `<div class="task-item ${statusClass}">${taskIndex + 1}. ${task.title}`
            const badge = getFastTaskBadge(task)
            if (badge) {
              html += ` <span class="badge ${buildBadgeClass(badge.label)}">${badge.label}</span>`
            }
            html += `</div>`
          })
          html += `</div>`
        } else {
          html += `<div class="empty-cell">-</div>`
        }
        html += `</td>`
      })
      html += `</tr>`

      html += `<tr style="border-top: 2px solid #000;">`
      html += `<td class="print-subhead time-cell" rowspan="2">PM</td>`
      html += `<td class="ll-cell print-subhead">PRJK</td>`
      allUsers.forEach((user) => {
        const userDay = day.users.find(u => u.user_id === user.user_id)
        const projects = userDay?.pm_projects || []
        const systemTasks = userDay?.pm_system_tasks || []
        const block = getBlockForSlot(user.user_id, dayIso, "pm")
        const isBlocked = Boolean(block)

        html += `<td>`
        if (isBlocked) {
          html += `<div class="pv-fest-cell">`
          html += `<div class="pv-fest-badge">PV/FEST</div>`
          html += `<div class="pv-fest-note">${block?.note ? escapeHtml(block.note) : ""}</div>`
          html += `</div>`
        } else if (projects.length > 0 || systemTasks.length > 0) {
          projects.forEach((project, projectIndex) => {
            html += `<div class="project-card">
              <div class="project-title">${projectIndex + 1}. ${project.project_title}`
            if (project.project_total_products) {
              html += ` <span style="color: #666; font-size: 4pt;">(${project.project_total_products})</span>`
            }
            html += `</div>`
            if (project.tasks && project.tasks.length > 0) {
              project.tasks.forEach((task, taskIndex) => {
                const statusValue = getStatusValueForDay(task.status, task.completed_at, dayIso, task.daily_status)
                const statusClass =
                  statusValue === "DONE"
                    ? "task-status-done"
                    : statusValue === "IN_PROGRESS"
                      ? "task-status-in-progress"
                      : "task-status-todo"
                const taskNumber = `${projectIndex + 1}.${taskIndex + 1}`
                html += `<div class="task-item ${statusClass}">${taskNumber}. ${task.task_title}`
                if (task.daily_products) {
                  html += ` <span class="products">${task.daily_products} pcs</span>`
                }
                const badge = getTaskStatusBadge(task)
                if (badge) {
                  html += ` <span class="badge ${buildBadgeClass(badge.label)}">${badge.label}</span>`
                }
                html += `</div>`
              })
            }
            html += `</div>`
          })
          if (systemTasks.length > 0) {
            html += `<div style="margin-top: 1px; font-size: 4pt; color: #1e40af;"><strong>System Tasks:</strong>`
            systemTasks.forEach((task, taskIndex) => {
              html += `<div class="task-item">${taskIndex + 1}. ${task.title}</div>`
            })
            html += `</div>`
          }
        } else {
          html += `<div class="empty-cell">-</div>`
        }
        html += `</td>`
      })
      html += `</tr>`

      html += `<tr>`
      html += `<td class="ll-cell print-subhead">FT</td>`
      allUsers.forEach((user) => {
        const userDay = day.users.find(u => u.user_id === user.user_id)
        const fastTasks = sortFastTasks(userDay?.pm_fast_tasks || [])
        const block = getBlockForSlot(user.user_id, dayIso, "pm")
        const isBlocked = Boolean(block)

        html += `<td>`
        if (isBlocked) {
          html += `<div class="pv-fest-cell">`
          html += `<div class="pv-fest-badge">PV/FEST</div>`
          html += `<div class="pv-fest-note">${block?.note ? escapeHtml(block.note) : ""}</div>`
          html += `</div>`
        } else if (fastTasks.length > 0) {
          html += `<div style="font-size: 4pt; color: #0f172a;">`
          fastTasks.forEach((task, taskIndex) => {
            const statusValue = getStatusValueForDay(task.status, task.completed_at, dayIso, task.daily_status)
            const statusClass =
              statusValue === "DONE"
                ? "task-status-done"
                : statusValue === "IN_PROGRESS"
                  ? "task-status-in-progress"
                  : "task-status-todo"
            html += `<div class="task-item ${statusClass}">${taskIndex + 1}. ${task.title}`
            const badge = getFastTaskBadge(task)
            if (badge) {
              html += ` <span class="badge ${buildBadgeClass(badge.label)}">${badge.label}</span>`
            }
            html += `</div>`
          })
          html += `</div>`
        } else {
          html += `<div class="empty-cell">-</div>`
        }
        html += `</td>`
      })
      html += `</tr>`

      return html
    }

    const measure = doc.createElement("div")
    measure.className = "print-measure"
    root.appendChild(measure)

    const pages: HTMLDivElement[] = []

    data.departments.forEach((dept) => {
      const allUsers = getDepartmentUsersForPrint(dept)
      const maxUsersPerPage = getMaxUsersPerPage(allUsers.length)
      const userChunks = chunkUsers(allUsers, maxUsersPerPage)

      userChunks.forEach((chunk, chunkIndex) => {
        const isFirstPage = pages.length === 0
        const { page, content } = createPage({ showTitle: isFirstPage, showMeta: isFirstPage })
        measure.appendChild(page)
        pages.push(page)

        const legendEntries = legendEntriesByDept.get(dept.department_id)
        if (legendEntries && legendEntries.length > 0 && chunkIndex === 0) {
          content.appendChild(createLegendSection(legendEntries))
          const legendSpacer = doc.createElement("div")
          legendSpacer.className = "print-legend-spacer"
          content.appendChild(legendSpacer)
        }

        const deptTitle = doc.createElement("div")
        deptTitle.className = "print-dept-title"
        let chunkLabel = ""
        if (allUsers.length > 0 && userChunks.length > 1) {
          const chunkStart = chunkIndex * maxUsersPerPage + 1
          const chunkEnd = Math.min(allUsers.length, chunkStart + chunk.length - 1)
          chunkLabel = ` (${chunkStart}-${chunkEnd} of ${allUsers.length})`
        }
        deptTitle.textContent = `${formatDepartmentName(dept.department_name)}${chunkLabel}`
        content.appendChild(deptTitle)

        const table = createTable(chunk)
        content.appendChild(table)

        dept.days.forEach((day, dayIndex) => {
          const tbody = doc.createElement("tbody")
          tbody.className = "day-group"
          tbody.innerHTML = renderDayGroupHtml(day, dayIndex, chunk)
          table.appendChild(tbody)
        })

        fitContentToWidth(content)
      })
    })

    const renderPages = () => {
      root.innerHTML = ""
      pages.forEach((page, index) => {
        const countEl = page.querySelector(".print-page-count")
        if (countEl) {
          countEl.textContent = `Page ${index + 1} / ${pages.length}`
        }
        root.appendChild(page)
      })
    }

    setTimeout(() => {
      renderPages()
      requestAnimationFrame(() => {
        pages.forEach((page) => {
          const content = page.querySelector(".print-content") as HTMLElement | null
          if (content) {
            fitContentToWidth(content)
          }
        })
        printWindow.print()
      })
    }, 200)
  }, [
    apiFetch,
    data,
    departmentId,
    departments,
    getFastTaskBadge,
    getBlockForSlot,
    getStatusValueForDay,
    getTaskStatusBadge,
    sortFastTasks,
    users,
  ])

  const parseFilenameFromDisposition = (headerValue: string | null) => {
    if (!headerValue) return null
    const match = headerValue.match(/filename=\"?([^\";]+)\"?/i)
    return match ? match[1] : null
  }

  const exportWeeklyPlannerExcel = async () => {
    if (isExporting) return
    setIsExporting(true)
    try {
      const targets =
        departmentId === ALL_DEPARTMENTS_VALUE
          ? departments.map((d) => d.id)
          : [departmentId]

      for (const deptId of targets) {
        const qs = new URLSearchParams()
        qs.set("department_id", deptId)
        qs.set("is_this_week", isThisWeek.toString())
        const res = await apiFetch(`/exports/weekly-planner.xlsx?${qs.toString()}`)
        if (!res.ok) {
          toast.error("Failed to export weekly planner")
          return
        }
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        const filename = parseFilenameFromDisposition(res.headers.get("content-disposition"))
        link.download = filename || "weekly_planner.xlsx"
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error("Failed to export weekly planner", error)
      toast.error("Failed to export weekly planner")
    } finally {
      setIsExporting(false)
    }
  }

  const saveWeeklySnapshot = async (mode: "THIS_WEEK_FINAL" | "NEXT_WEEK_PLANNED") => {
    if (!canSaveSnapshots) return
    if (!departmentId || departmentId === ALL_DEPARTMENTS_VALUE) {
      toast.error("Select a specific department before saving snapshots.")
      return
    }
    if (savingSnapshotMode) return

    setSavingSnapshotMode(mode)
    try {
      const res = await apiFetch("/planners/weekly-snapshots/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department_id: departmentId,
          mode,
        }),
      })
      if (!res.ok) {
        const message = await res.text().catch(() => "Failed to save snapshot")
        toast.error(message || "Failed to save snapshot")
        return
      }
      const payload = await res.json()
      const weekStart = payload?.snapshot?.week_start_date
      const weekEnd = payload?.snapshot?.week_end_date
      const versionCount = payload?.version_count
      const typeLabel = mode === "THIS_WEEK_FINAL" ? "This Week (Final)" : "Next Week (Planned)"
      if (weekStart && weekEnd) {
        toast.success(
          `Saved ${typeLabel}: ${formatDate(weekStart)} - ${formatDate(weekEnd)} (versions: ${versionCount ?? 1})`
        )
      } else {
        toast.success(`Saved ${typeLabel}`)
      }
    } catch (error) {
      console.error("Failed to save weekly snapshot", error)
      toast.error("Failed to save snapshot")
    } finally {
      setSavingSnapshotMode(null)
    }
  }

  const openPlanVsActualCompare = async () => {
    if (!data) return
    if (!isThisWeek) {
      toast.error('Switch Week to "This Week" to compare against last Friday plan.')
      return
    }
    if (!departmentId || departmentId === ALL_DEPARTMENTS_VALUE) {
      toast.error("Select a specific department before comparing plan vs actual.")
      return
    }

    setPlanVsActualOpen(true)
    setIsLoadingPlanVsActual(true)
    setPlanVsActualError(null)
    setPlanVsActual(null)
    try {
      const qs = new URLSearchParams()
      qs.set("department_id", departmentId)
      qs.set("week_start", data.week_start)
      const res = await apiFetch(`/planners/weekly-snapshots/plan-vs-actual?${qs.toString()}`)
      if (!res.ok) {
        const message = await res.text().catch(() => "Failed to compare plan vs actual")
        throw new Error(message || "Failed to compare plan vs actual")
      }
      const payload = (await res.json()) as WeeklyPlanPerformanceResponse
      setPlanVsActual(payload)
    } catch (err) {
      setPlanVsActualError(err instanceof Error ? err.message : "Failed to compare plan vs actual")
      setPlanVsActual(null)
    } finally {
      setIsLoadingPlanVsActual(false)
    }
  }

  const formatPlannerStatusLabel = (value?: string | null) => {
    const normalized = (value || "TODO")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_")
    if (normalized === "IN_PROGRESS") return "In Progress"
    if (normalized === "DONE") return "Done"
    return "To Do"
  }

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          button[title="Delete task"] {
            display: none !important;
          }
        }
      `}} />
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Weekly Planner</div>
        {viewMode === "current" && data && (
          <div className="flex items-center gap-2">
            {canSaveSnapshots ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => void saveWeeklySnapshot("THIS_WEEK_FINAL")}
                  disabled={savingSnapshotMode !== null}
                >
                  {savingSnapshotMode === "THIS_WEEK_FINAL" ? "Saving..." : "Save This Week (Final)"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void saveWeeklySnapshot("NEXT_WEEK_PLANNED")}
                  disabled={savingSnapshotMode !== null}
                >
                  {savingSnapshotMode === "NEXT_WEEK_PLANNED" ? "Saving..." : "Save Next Week (Planned)"}
                </Button>
              </>
            ) : null}
            {isThisWeek ? (
              <Button
                variant="outline"
                onClick={() => void openPlanVsActualCompare()}
                disabled={isLoadingPlanVsActual}
              >
                {isLoadingPlanVsActual ? "Comparing..." : "Compare with Last Friday Plan"}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setManualTaskOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Task
            </Button>

            <Button variant="outline" onClick={exportWeeklyPlannerExcel} disabled={isExporting}>
              {isExporting ? "Exporting..." : "Export Excel"}
            </Button>
            <Button variant="outline" onClick={handlePrint} disabled={!data}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-2">
          <Label>View</Label>
          <Select value={viewMode} onValueChange={(value) => setViewMode(value as "current" | "snapshots")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current Weekly Plan</SelectItem>
              <SelectItem value="snapshots">Saved Weekly Snapshots</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {viewMode === "current" ? (
        <div className="space-y-2">
          <Label>Week</Label>
          <Select value={isThisWeek ? "this" : "next"} onValueChange={(v) => setIsThisWeek(v === "this")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this">This Week</SelectItem>
              <SelectItem value="next">Next Week</SelectItem>
            </SelectContent>
          </Select>
        </div>
        ) : null}
        {user?.role !== "STAFF" ? (
          <div className="space-y-2">
            <Label>Department</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_DEPARTMENTS_VALUE}>All Departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {formatDepartmentName(d.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {viewMode === "current" && data ? (
          <div className="space-y-2">
            <Label>Week Range</Label>
            <div className="text-sm text-muted-foreground pt-2">
              {formatDate(data.week_start)} - {formatDate(data.week_end)}
            </div>
          </div>
        ) : null}
      </div>

      <Dialog open={manualTaskOpen} onOpenChange={setManualTaskOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add Task to Weekly Planner</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {departmentId === ALL_DEPARTMENTS_VALUE ? (
              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={manualTaskDepartmentId} onValueChange={setManualTaskDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDepartments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {formatDepartmentName(dept.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Task Type</Label>
              <Select value={manualTaskType} onValueChange={(v) => {
                setManualTaskType(v as "project" | "fast")
                // Reset fields when switching type
                setManualTaskDays([])
                setManualTaskUserIds([])
                setManualTaskFastType("")
                setManualTaskProjectId("")
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fast">Fast Task</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Task title</Label>
              <Input
                value={manualTaskTitle}
                onChange={(e) => setManualTaskTitle(e.target.value)}
                placeholder="Write the task..."
              />
            </div>

            {manualTaskType === "fast" ? (
              <>
                <div className="space-y-2">
                  <Label>Task Type</Label>
                  <Select value={manualTaskFastType} onValueChange={setManualTaskFastType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select task type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BLL">BLL</SelectItem>
                      <SelectItem value="R1">R1</SelectItem>
                      <SelectItem value="1H">1H</SelectItem>
                      <SelectItem value="P:">P:</SelectItem>
                      <SelectItem value="N">N</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>AM / PM</Label>
                    <Select value={manualTaskPeriod} onValueChange={(v) => setManualTaskPeriod(v as "AM" | "PM")}>
                      <SelectTrigger>
                        <SelectValue placeholder="AM/PM" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AM">AM</SelectItem>
                        <SelectItem value="PM">PM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Days (Select multiple)</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {manualTaskDays.length > 0 ? `Days (${manualTaskDays.length})` : "Select days"}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56 max-h-64 z-[120]">
                      <DropdownMenuLabel>Days</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {availableDays.map((day) => (
                        <DropdownMenuCheckboxItem
                          key={day.value}
                          checked={manualTaskDays.includes(day.value)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setManualTaskDays([...manualTaskDays, day.value])
                            } else {
                              setManualTaskDays(manualTaskDays.filter(d => d !== day.value))
                            }
                          }}
                        >
                          {day.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={(event) => {
                          event.preventDefault()
                          setManualTaskDays([])
                        }}
                      >
                        Clear days
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-2">
                  <Label>Members (Select multiple)</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {manualTaskUserIds.length > 0 ? `Members (${manualTaskUserIds.length})` : "Select members"}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64 max-h-64 z-[120]">
                      <DropdownMenuLabel>Members</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {availableUsers.map((entry) => (
                        <DropdownMenuCheckboxItem
                          key={entry.id}
                          checked={manualTaskUserIds.includes(entry.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setManualTaskUserIds([...manualTaskUserIds, entry.id])
                            } else {
                              setManualTaskUserIds(manualTaskUserIds.filter(id => id !== entry.id))
                            }
                          }}
                        >
                          {entry.name}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={(event) => {
                          event.preventDefault()
                          setManualTaskUserIds([])
                        }}
                      >
                        Clear members
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Project</Label>
                  <Select
                    value={manualTaskProjectId}
                    onValueChange={setManualTaskProjectId}
                    disabled={!manualTaskDepartmentValue}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={manualTaskDepartmentValue ? "Select project" : "Select department first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProjects.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          No active projects
                        </SelectItem>
                      ) : (
                        availableProjects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {projectLabel(project)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Days (Select multiple)</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {manualTaskDays.length > 0 ? `Days (${manualTaskDays.length})` : "Select days"}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56 max-h-64 z-[120]">
                      <DropdownMenuLabel>Days</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {availableDays.map((day) => (
                        <DropdownMenuCheckboxItem
                          key={day.value}
                          checked={manualTaskDays.includes(day.value)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setManualTaskDays([...manualTaskDays, day.value])
                            } else {
                              setManualTaskDays(manualTaskDays.filter(d => d !== day.value))
                            }
                          }}
                        >
                          {day.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={(event) => {
                          event.preventDefault()
                          setManualTaskDays([])
                        }}
                      >
                        Clear days
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-2">
                  <Label>AM / PM</Label>
                  <Select value={manualTaskPeriod} onValueChange={(v) => setManualTaskPeriod(v as "AM" | "PM")}>
                    <SelectTrigger>
                      <SelectValue placeholder="AM/PM" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AM">AM</SelectItem>
                      <SelectItem value="PM">PM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Members (Select multiple)</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {manualTaskUserIds.length > 0 ? `Members (${manualTaskUserIds.length})` : "Select members"}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64 max-h-64 z-[120]">
                      <DropdownMenuLabel>Members</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {availableUsers.map((entry) => (
                        <DropdownMenuCheckboxItem
                          key={entry.id}
                          checked={manualTaskUserIds.includes(entry.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setManualTaskUserIds([...manualTaskUserIds, entry.id])
                            } else {
                              setManualTaskUserIds(manualTaskUserIds.filter(id => id !== entry.id))
                            }
                          }}
                        >
                          {entry.name}
                        </DropdownMenuCheckboxItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={(event) => {
                          event.preventDefault()
                          setManualTaskUserIds([])
                        }}
                      >
                        Clear members
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setManualTaskOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateManualTask} disabled={isCreatingManualTask}>
                {isCreatingManualTask ? "Adding..." : "Add Task"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={planVsActualOpen} onOpenChange={setPlanVsActualOpen}>
        <DialogContent className="sm:max-w-[1000px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Plan vs Actual Weekly Comparison</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {isLoadingPlanVsActual ? (
              <div className="text-sm text-muted-foreground">Comparing plan vs actual...</div>
            ) : null}
            {planVsActualError ? (
              <div className="text-sm text-destructive">{planVsActualError}</div>
            ) : null}
            {(() => {
              if (!planVsActual) return null
              const dept = data?.departments?.find((d) => d.department_id === departmentId)
              const userMap = new Map<string, string>()
              dept?.days?.forEach((day) => {
                day.users?.forEach((u) => {
                  if (!userMap.has(u.user_id)) userMap.set(u.user_id, u.user_name)
                })
              })
              const columns = Array.from(userMap.entries()).map(([user_id, user_name]) => ({
                assignee_id: user_id,
                assignee_name: user_name,
              }))
              return <WeeklyPlanPerformanceView data={planVsActual} assigneeColumns={columns} />
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {viewMode === "snapshots" ? (
        <WeeklyPlannerSnapshotsView
          departmentId={departmentId}
          allDepartmentsValue={ALL_DEPARTMENTS_VALUE}
        />
      ) : error ? (
        <div className="text-center py-8 text-destructive">
          <p>{error}</p>
        </div>
      ) : isLoading ? (
        <div className="text-sm text-muted-foreground">Loading planner…</div>
      ) : data ? (
        data.departments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No departments or tasks found for this week.</p>
            <p className="text-sm mt-2">Try selecting a different week or department.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Show Legend Table only for Development, Graphic Design, or Product Content */}
            {(() => {
              if (departmentId === ALL_DEPARTMENTS_VALUE) return null

              const selectedDept = departments.find((d) => d.id === departmentId)
              const selectedKey = normalizeDepartmentKey(selectedDept?.name)
              const isLegendDepartment =
                selectedKey === "development" ||
                selectedKey === "graphicdesign" ||
                selectedKey === "productcontent"
              if (!isLegendDepartment) return null

              const legendDept = data.departments.find(
                (d) => normalizeDepartmentKey(d.department_name) === selectedKey
              )

              if (legendDept && data.week_start) {
                return (
                  <WeeklyPlannerLegendTable
                    departmentId={departmentId}
                    weekStart={data.week_start}
                    departmentName={selectedDept?.name}
                  />
                )
              }
              return null
            })()}
            {data.departments.map((dept) => (
              <Card key={dept.department_id}>
                <CardHeader>
                  <CardTitle>{formatDepartmentName(dept.department_name)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table
                    className="table-fixed w-full"
                    containerProps={{
                      ref: setScrollRef(dept.department_id),
                      className: "max-h-[75vh] overflow-x-auto overflow-y-auto cursor-grab",
                      onPointerDown: (e) => handlePointerDown(e, dept.department_id),
                      onWheel: (e) => handleWheel(e, dept.department_id),
                      style: {
                        scrollbarWidth: "thin",
                        scrollbarColor: "#94a3b8 #e2e8f0",
                        touchAction: "pan-y",
                      },
                    }}
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24 min-w-24 sticky top-0 left-0 bg-background z-30 text-xs font-bold uppercase" rowSpan={2}>Day</TableHead>
                        <TableHead className="w-10 min-w-10 sticky top-0 left-24 bg-background z-30 text-center text-xs font-bold uppercase">Time</TableHead>
                        <TableHead className="w-10 min-w-10 sticky top-0 left-34 bg-background z-30 text-center text-xs font-bold uppercase">LL</TableHead>
                        {(() => {
                          // Get all unique users from all days
                          const userMap = new Map<string, WeeklyTableUserDay>()
                          dept.days.forEach((day) => {
                            day.users.forEach((userDay) => {
                              if (!userMap.has(userDay.user_id)) {
                                userMap.set(userDay.user_id, userDay)
                              }
                            })
                          })
                          const allUsers = Array.from(userMap.values())

                          return allUsers.map((user) => (
                            <TableHead key={user.user_id} className="w-56 min-w-56 sticky top-0 bg-background z-20 text-center text-xs font-bold uppercase">
                              <div className="font-semibold">{user.user_name}</div>
                            </TableHead>
                          ))
                        })()}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dept.days.map((day, dayIndex) => {
                        // Get all unique users from all days
                        const userMap = new Map<string, WeeklyTableUserDay>()
                        dept.days.forEach((d) => {
                          d.users.forEach((userDay) => {
                            if (!userMap.has(userDay.user_id)) {
                              userMap.set(userDay.user_id, userDay)
                            }
                          })
                        })
                        const allUsers = Array.from(userMap.values())

                          const renderCellContent = (
                            projects: WeeklyTableProjectEntry[],
                            systemTasks: WeeklyTableTaskEntry[],
                            fastTasks: WeeklyTableTaskEntry[],
                            timeSlot: "am" | "pm",
                            dayDate: string,
                            userId: string
                          ) => {
                            // Ensure arrays are defined
                            const projectsList = projects || []
                            const systemTasksList = systemTasks || []
                            const fastTasksList = sortFastTasks(fastTasks || [])

                            const hasContent = projectsList.length > 0 || systemTasksList.length > 0 || fastTasksList.length > 0
                            const block = getBlockForSlot(userId, dayDate, timeSlot)
                            const isBlocked = Boolean(block)
                            const blockTitle = isBlocked
                              ? `PV/FEST${block?.note ? `: ${block.note}` : ""}`
                              : undefined

                            if (!hasContent && !isBlocked) {
                              return <div className="min-h-20 text-xs text-muted-foreground/50">--</div>
                            }

                            if (isBlocked) {
                              return (
                                <div
                                  className="min-h-20 relative rounded-md border border-slate-300 bg-slate-100/70 text-slate-600 cursor-not-allowed"
                                  title={blockTitle}
                                >
                                  <div className="absolute inset-0 bg-slate-200/50 pointer-events-none" />
                                  <div className="absolute top-1 right-1 z-10 text-[10px] font-semibold uppercase tracking-wide text-slate-600 bg-slate-200/90 px-1.5 py-0.5 rounded">
                                    PV/FEST
                                  </div>
                                  <div className="relative z-0 px-2 py-1 text-xs font-semibold text-slate-600">
                                    {block?.note ?? null}
                                  </div>
                                </div>
                              )
                            }

                            return (
                              <div className="min-h-20">
                                {!hasContent ? (
                                  <div className="min-h-20 text-xs text-muted-foreground/50">--</div>
                                ) : (
                                  <div className="space-y-2 min-h-20">
                                      {/* Projects */}
                                {projectsList.map((project, projectIndex) => {
                                  // Debug: log if project should be late
                                  if (project.project_title.includes("LATE") || project.project_title.includes("PRJK")) {
                                    console.log("Project:", project.project_title, "is_late:", project.is_late, "project_id:", project.project_id)
                                  }
                                  return (
                                    <div
                                      key={project.project_id}
                                      className={[
                                        "group p-1.5 rounded-md transition-colors",
                                        project.is_late
                                          ? "bg-red-50 dark:bg-red-950/20 border-2 border-red-500 hover:bg-red-100 dark:hover:bg-red-950/30"
                                          : "bg-primary/5 border border-primary/20 hover:bg-primary/10",
                                      ].join(" ")}
                                    >
                                        <div className="font-semibold text-sm text-slate-900 flex items-start justify-between gap-2">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="truncate whitespace-nowrap">{projectIndex + 1}. {project.project_title}</span>
                                          {project.is_late && (
                                            <span className="inline-flex h-5 items-center justify-center rounded-full bg-red-500 text-white px-2 text-[10px] font-semibold">
                                              LATE
                                            </span>
                                          )}
                                        </div>
                                        {canDeleteProjects && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              void deleteProject(project.project_id, project.project_title, timeSlot, dayDate, userId)
                                            }}
                                            disabled={deletingProjectId === project.project_id}
                                            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-opacity"
                                            title="Delete project"
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>
                                        {project.tasks && project.tasks.length > 0 && (
                                          <div className="mt-1 space-y-0.5">
                                          {project.tasks.map((task, taskIndex) => {
                                              const statusBadge = getTaskStatusBadge(task)
                                              const taskNumber = `${projectIndex + 1}.${taskIndex + 1}`
                                              return (
                                                <div
                                                  key={task.task_id}
                                                className={[
                                                  "text-[11px] flex justify-between items-center gap-1 rounded border px-1.5 py-0.5 group/task",
                                                  getStatusCardClassesForDay(task.status, task.completed_at, dayDate, task.daily_status),
                                                ].join(" ")}
                                              >
                                                  <span className="truncate whitespace-nowrap font-semibold text-slate-900">{taskNumber}. {task.task_title}</span>
                                                <div className="flex items-center gap-1">
                                                  {statusBadge && (
                                                    <span
                                                      className={[
                                                        "inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full border px-1 text-[10px] font-semibold",
                                                        statusBadge.className,
                                                      ].join(" ")}
                                                      title={statusBadge.label}
                                                    >
                                                      {statusBadge.label}
                                                    </span>
                                                  )}
                                                  {task.daily_products != null && (
                                                    <span className="font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]">
                                                      {task.daily_products} pcs
                                                    </span>
                                                  )}
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation()
                                                      void deleteTask(task.task_id, task.task_title, timeSlot, dayDate, userId)
                                                    }}
                                                    disabled={deletingTaskId === task.task_id}
                                                    className="opacity-0 group-hover/task:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-opacity"
                                                    title="Delete task"
                                                  >
                                                    <X className="h-3 w-3" />
                                                  </button>
                                                </div>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )}
                                      {(!project.tasks || project.tasks.length === 0) && project.task_count > 1 && (
                                        <div className="text-xs font-semibold text-slate-900 mt-0.5">
                                          {project.task_count} tasks
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}

                                {/* System Tasks */}
                                {systemTasksList.length > 0 && (
                                  <div className="space-y-1">
                                    <div className="text-[11px] font-semibold text-slate-900 mb-1">System Tasks</div>
                                      {systemTasksList.map((task, idx) => {
                                        const statusBadge = getTaskStatusBadge(task)
                                        return (
                                          <div
                                            key={task.task_id || idx}
                                          className={[
                                            "p-1 rounded border text-[11px] flex justify-between items-center group/task",
                                            getStatusCardClassesForDay(task.status, task.completed_at, dayDate, task.daily_status),
                                          ].join(" ")}
                                        >
                                            <span className="truncate whitespace-nowrap font-semibold text-slate-900">{idx + 1}. {task.title}</span>
                                          <div className="flex items-center gap-1">
                                            {statusBadge && (
                                              <span
                                                className={[
                                                  "inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full border px-1 text-[10px] font-semibold",
                                                  statusBadge.className,
                                                ].join(" ")}
                                                title={statusBadge.label}
                                              >
                                                {statusBadge.label}
                                              </span>
                                            )}
                                            {task.task_id && (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  void deleteTask(task.task_id!, task.title, timeSlot, dayDate, userId)
                                                }}
                                                disabled={deletingTaskId === task.task_id}
                                                className="opacity-0 group-hover/task:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-opacity ml-1"
                                                title="Delete task"
                                              >
                                                <X className="h-3 w-3" />
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}

                                {/* Fast Tasks */}
                                {fastTasksList.length > 0 && (
                                  <div className="space-y-1">
                                  {fastTasksList.map((task, idx) => {
                                    const statusBadge = getFastTaskBadge(task)
                                    return (
                                      <div
                                        key={task.task_id || idx}
                                          className={[
                                            "p-1 rounded border text-[11px] flex justify-between items-center group/task",
                                            getStatusCardClassesForDay(task.status, task.completed_at, dayDate, task.daily_status),
                                          ].join(" ")}
                                        >
                                        <span className="truncate whitespace-nowrap font-semibold text-slate-900">{idx + 1}. {task.title}</span>
                                          <div className="flex items-center gap-1">
                                            {statusBadge && (
                                              <span
                                                className={[
                                                  "inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full border px-1 text-[10px] font-semibold",
                                                  statusBadge.className,
                                                ].join(" ")}
                                                title={statusBadge.label}
                                              >
                                                {statusBadge.label}
                                              </span>
                                            )}
                                            {task.task_id && (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  void deleteTask(task.task_id!, task.title, timeSlot, dayDate, userId)
                                                }}
                                                disabled={deletingTaskId === task.task_id}
                                                className="opacity-0 group-hover/task:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-opacity ml-1"
                                                title="Delete task"
                                              >
                                                <X className="h-3 w-3" />
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                      )
                          }

                          const renderProjectsAndSystem = (
                            projects: WeeklyTableProjectEntry[],
                            systemTasks: WeeklyTableTaskEntry[],
                            dayDate: string,
                            timeSlot: "am" | "pm",
                            userId: string
                          ) => (
                            renderCellContent(projects, systemTasks, [], timeSlot, dayDate, userId)
                          )

                          const renderFastOnly = (
                            fastTasks: WeeklyTableTaskEntry[],
                            dayDate: string,
                            timeSlot: "am" | "pm",
                            userId: string
                          ) => (
                            renderCellContent([], [], fastTasks, timeSlot, dayDate, userId)
                          )

                          return (
                            <React.Fragment key={day.date}>
                              {/* AM PRJK Row */}
                              <TableRow>
                                <TableCell
                                  className="font-medium sticky left-0 bg-background z-10 align-top w-24 min-w-24"
                                  rowSpan={4}
                                >
                                  <div className="flex flex-col">
                                    <div className="font-bold text-slate-900">{DAY_NAMES[dayIndex]}</div>
                                    <div className="text-xs font-semibold text-slate-900 mt-1">{formatDate(day.date)}</div>
                                  </div>
                                </TableCell>
                                <TableCell className="w-10 min-w-10 align-top sticky left-24 bg-background z-10 text-center">
                                  <div className="text-xs font-medium text-primary">AM</div>
                                </TableCell>
                                <TableCell className="w-10 min-w-10 align-top sticky left-34 bg-background z-10 text-center text-xs font-bold uppercase">
                                  PRJK
                                </TableCell>
                                {allUsers.map((user) => {
                                  const userDay = day.users.find((u) => u.user_id === user.user_id)
                                  return (
                                    <TableCell key={`${user.user_id}-am-prjk`} className="align-top w-56 min-w-56">
                                      {userDay
                                        ? renderProjectsAndSystem(
                                          userDay.am_projects || [],
                                          userDay.am_system_tasks || [],
                                          day.date,
                                          "am",
                                          user.user_id
                                        )
                                        : <div className="min-h-20 text-xs text-muted-foreground/50">—</div>}
                                    </TableCell>
                                  )
                                })}
                              </TableRow>

                              {/* AM FT Row */}
                              <TableRow className="border-t border-border">
                                <TableCell className="w-10 min-w-10 align-top sticky left-24 bg-background z-10 text-center">
                                  <div className="text-xs font-medium text-primary">AM</div>
                                </TableCell>
                                <TableCell className="w-10 min-w-10 align-top sticky left-34 bg-background z-10 text-center text-xs font-bold uppercase">
                                  FT
                                </TableCell>
                                {allUsers.map((user) => {
                                  const userDay = day.users.find((u) => u.user_id === user.user_id)
                                  return (
                                    <TableCell key={`${user.user_id}-am-ft`} className="align-top w-56 min-w-56">
                                      {userDay
                                        ? renderFastOnly(
                                          userDay.am_fast_tasks || [],
                                          day.date,
                                          "am",
                                          user.user_id
                                        )
                                        : <div className="min-h-20 text-xs text-muted-foreground/50">—</div>}
                                    </TableCell>
                                  )
                                })}
                              </TableRow>

                              {/* PM PRJK Row */}
                              <TableRow className="border-t-2 border-border">
                                <TableCell className="w-10 min-w-10 align-top sticky left-24 bg-background z-10 text-center">
                                  <div className="text-xs font-medium text-primary">PM</div>
                                </TableCell>
                                <TableCell className="w-10 min-w-10 align-top sticky left-34 bg-background z-10 text-center text-xs font-bold uppercase">
                                  PRJK
                                </TableCell>
                                {allUsers.map((user) => {
                                  const userDay = day.users.find((u) => u.user_id === user.user_id)
                                  return (
                                    <TableCell key={`${user.user_id}-pm-prjk`} className="align-top w-56 min-w-56">
                                      {userDay
                                        ? renderProjectsAndSystem(
                                          userDay.pm_projects || [],
                                          userDay.pm_system_tasks || [],
                                          day.date,
                                          "pm",
                                          user.user_id
                                        )
                                        : <div className="min-h-20 text-xs text-muted-foreground/50">—</div>}
                                    </TableCell>
                                  )
                                })}
                              </TableRow>

                              {/* PM FT Row */}
                              <TableRow className="border-t border-border">
                                <TableCell className="w-10 min-w-10 align-top sticky left-24 bg-background z-10 text-center">
                                  <div className="text-xs font-medium text-primary">PM</div>
                                </TableCell>
                                <TableCell className="w-10 min-w-10 align-top sticky left-34 bg-background z-10 text-center text-xs font-bold uppercase">
                                  FT
                                </TableCell>
                                {allUsers.map((user) => {
                                  const userDay = day.users.find((u) => u.user_id === user.user_id)
                                  return (
                                    <TableCell key={`${user.user_id}-pm-ft`} className="align-top w-56 min-w-56">
                                      {userDay
                                        ? renderFastOnly(
                                          userDay.pm_fast_tasks || [],
                                          day.date,
                                          "pm",
                                          user.user_id
                                        )
                                        : <div className="min-h-20 text-xs text-muted-foreground/50">—</div>}
                                    </TableCell>
                                  )
                                })}
                              </TableRow>
                            </React.Fragment>
                          )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}
