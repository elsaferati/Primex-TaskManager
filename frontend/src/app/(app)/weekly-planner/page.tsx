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
import { ChevronDown, Plus, Save, X, Printer } from "lucide-react"
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
import type { Department, Project, Task, UserLookup } from "@/lib/types"

type WeeklyTableProjectTaskEntry = {
  task_id: string
  task_title: string
  status?: string | null
  completed_at?: string | null
  daily_products: number | null
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
  completed_at?: string | null
  daily_products: number | null
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

const ALL_DEPARTMENTS_VALUE = "__all__"
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

function mondayISO(today = new Date()) {
  const d = new Date(today)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

export default function WeeklyPlannerPage() {
  const { apiFetch, user } = useAuth()
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [projects, setProjects] = React.useState<Project[]>([])
  const [users, setUsers] = React.useState<UserLookup[]>([])
  const [departmentId, setDepartmentId] = React.useState<string>(ALL_DEPARTMENTS_VALUE)
  const [isThisWeek, setIsThisWeek] = React.useState(false)
  const [data, setData] = React.useState<WeeklyTableResponse | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isExporting, setIsExporting] = React.useState(false)
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

  const deleteTask = React.useCallback(async (taskId: string, taskTitle?: string) => {
    if (!taskId) return
    
    // Confirmation dialog
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
        toast.error("Failed to delete task")
        return
      }
      toast.success("Task deleted")
      // Refresh data
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
      toast.error("Failed to delete task")
    } finally {
      setDeletingTaskId(null)
    }
  }, [apiFetch, departmentId, isThisWeek])

  const deleteProject = React.useCallback(async (projectId: string, projectTitle?: string) => {
    if (!projectId) return

    const confirmed = window.confirm(
      projectTitle
        ? `Are you sure you want to delete the project "${projectTitle}"?\n\nThis action cannot be undone.`
        : "Are you sure you want to delete this project?\n\nThis action cannot be undone."
    )
    if (!confirmed) return

    setDeletingProjectId(projectId)
    try {
      const res = await apiFetch(`/projects/${projectId}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Failed to delete project")
        return
      }
      toast.success("Project deleted")
      setProjects((prev) => prev.filter((p) => p.id !== projectId))
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
      toast.error("Failed to delete project")
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
        return
      }
      const payload = (await res.json()) as WeeklyTableResponse
      console.log("Weekly planner data:", payload)
      setData(payload)
    } catch (error) {
      console.error("Error loading weekly planner:", error)
      setError(error instanceof Error ? error.message : "Unknown error occurred")
      setData(null)
    } finally {
      setIsLoading(false)
    }
  }, [apiFetch, departmentId, isThisWeek])

  React.useEffect(() => {
    void loadPlanner()
  }, [loadPlanner])

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
            } else if (manualTaskFastType === "GA") {
              // Leave ga_note_origin_id null for manual creation.
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

  const handleSavePlan = async () => {
    if (!data) return
    setIsSaving(true)

    try {
      const planData = {
        department_id: departmentId !== ALL_DEPARTMENTS_VALUE ? departmentId : null,
        start_date: data.week_start,
        end_date: data.week_end,
        content: data,
        is_finalized: false,
      }

      if (data.saved_plan_id) {
        // Update existing plan
        const res = await apiFetch(`/planners/weekly-plans/${data.saved_plan_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: planData.content }),
        })
        if (res.ok) {
          toast.success("Weekly plan updated successfully")
        } else {
          toast.error("Failed to update weekly plan")
        }
      } else {
        // Create new plan
        const res = await apiFetch("/planners/weekly-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(planData),
        })
        if (res.ok) {
          const saved = (await res.json()) as { id: string }
          setData({ ...data, saved_plan_id: saved.id })
          toast.success("Weekly plan saved successfully")
        } else {
          toast.error("Failed to save weekly plan")
        }
      }
    } catch (error) {
      console.error("Error saving plan:", error)
      toast.error("Failed to save weekly plan")
    } finally {
      setIsSaving(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  const fastTaskBadgeStyles: Record<string, string> = {
    BLL: "border-red-200 bg-red-50 text-red-700",
    R1: "border-indigo-200 bg-indigo-50 text-indigo-700",
    "1H": "border-amber-200 bg-amber-50 text-amber-700",
    GA: "border-sky-200 bg-sky-50 text-sky-700",
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
    (status?: string | null, completedAt?: string | null, dayDate?: string | null) => {
      const normalized = (status || "TODO").toUpperCase()
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
    if (task.ga_note_origin_id) {
      return { label: "GA", className: "border-sky-200 bg-sky-50 text-sky-700" }
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
      return {
        label: task.fast_task_type,
        className: fastTaskBadgeStyles[task.fast_task_type] || "border-slate-200 bg-slate-50 text-slate-700",
      }
    }
    return { label: "N", className: "border-slate-200 bg-slate-50 text-slate-700" }
  }, [getTaskStatusBadge, fastTaskBadgeStyles])

  const handlePrint = React.useCallback(() => {
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

    let printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Weekly Planner - ${weekRange}</title>
          <style>
            @media print {
              @page { margin: 0.36in 0.08in 0.8in 0.2in; }
              body { margin: 0; padding: 0; }
            }
            body {
              font-family: Arial, sans-serif;
              font-size: 10pt;
              margin: 0;
              padding: 0 0 0.8in 0;
            }
            .print-header {
              display: grid;
              grid-template-columns: 1fr auto 1fr;
              align-items: center;
              margin-bottom: 12px;
            }
            .print-title {
              margin: 0;
              font-size: 16pt;
              font-weight: 700;
              text-transform: uppercase;
              text-align: center;
              color: #0f172a;
            }
            .print-datetime {
              text-align: right;
              font-size: 10pt;
              color: #334155;
            }
            .print-meta {
              text-align: center;
              margin-bottom: 12px;
              font-size: 10pt;
              color: #334155;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 12px;
              page-break-inside: auto;
            }
            thead {
              display: table-header-group;
            }
            th {
              background-color: #e2e8f0;
              border: 1px solid #000;
              padding: 8px;
              text-align: center;
              font-weight: bold;
              font-size: 9pt;
              text-transform: uppercase;
              vertical-align: bottom;
            }
            td {
              border: 1px solid #000;
              padding: 6px;
              vertical-align: top;
              font-size: 9pt;
            }
            .day-cell {
              font-weight: bold;
              background-color: #f9f9f9;
              text-align: center;
              width: 80px;
            }
            .ll-cell {
              font-weight: bold;
              background-color: #f9f9f9;
              text-align: center;
              width: 40px;
            }
            .time-cell {
              width: 36px;
              text-align: center;
              padding-left: 4px;
              padding-right: 4px;
            }
            .print-subhead {
              font-weight: bold;
              text-transform: uppercase;
              font-size: 9pt;
            }
            .project-card {
              margin: 4px 0;
              padding: 4px;
              background-color: #f5f5f5;
              border: 1px solid #ddd;
              border-radius: 3px;
            }
            .project-title {
              font-weight: bold;
              margin-bottom: 2px;
            }
            .task-item {
              font-size: 8pt;
              margin: 2px 0;
              padding-left: 8px;
            }
            .badge {
              display: inline-block;
              padding: 2px 6px;
              border-radius: 3px;
              font-size: 7pt;
              font-weight: bold;
              margin-left: 4px;
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
              font-size: 8pt;
            }
            .empty-cell {
              text-align: center;
              color: #999;
            }
            .pm-row {
              border-top: 2px solid #000 !important;
            }
            .print-footer {
              position: fixed;
              left: 0;
              right: 0;
              bottom: 0.2in;
              display: grid;
              grid-template-columns: 1fr auto 1fr;
              padding-left: 0.2in;
              padding-right: 0.08in;
              font-size: 10pt;
              color: #334155;
              background: #fff;
            }
            .print-page-count {
              text-align: center;
            }
            .print-page-count::before {
              content: "Page " counter(page) " / " counter(pages);
            }
            .print-initials {
              text-align: right;
            }
          </style>
        </head>
        <body>
          <div class="print-header">
            <div></div>
            <div class="print-title">Weekly Planner</div>
            <div class="print-datetime">${printedAt.toLocaleString("en-US", {
              month: "2-digit",
              day: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}</div>
          </div>
          <div class="print-meta">
            <strong>Week:</strong> ${weekRange} | <strong>Department:</strong> ${selectedDept}
          </div>
    `

    data.departments.forEach((dept) => {
      // Get all unique users
      const userMap = new Map<string, WeeklyTableUserDay>()
      dept.days.forEach((day) => {
        day.users.forEach((userDay) => {
          if (!userMap.has(userDay.user_id)) {
            userMap.set(userDay.user_id, userDay)
          }
        })
      })
      const allUsers = Array.from(userMap.values())

      printContent += `
        <h2 style="margin-top: 20px; margin-bottom: 10px; font-size: 14pt;">${formatDepartmentName(dept.department_name)}</h2>
        <table>
          <thead>
            <tr>
              <th class="day-cell" rowspan="2">Day</th>
              <th style="width: 40px;">LL</th>
              <th class="time-cell">Time</th>
              ${allUsers.map(user => `<th>${user.user_name}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
      `

      dept.days.forEach((day, dayIndex) => {
        const dayName = DAY_NAMES[dayIndex]
        const dayDate = formatDate(day.date)
        
        // AM PRJK Row
        printContent += `
          <tr>
            <td class="day-cell" rowspan="4" style="text-align: left; padding: 8px;">
              <div style="display: flex; flex-direction: column;">
                <strong class="print-subhead">${dayName}</strong>
                <span class="print-subhead" style="margin-top: 2px;">${dayDate}</span>
              </div>
            </td>
            <td class="ll-cell print-subhead">PRJK</td>
            <td class="print-subhead time-cell">AM</td>
        `
        allUsers.forEach((user) => {
          const userDay = day.users.find(u => u.user_id === user.user_id)
          const projects = userDay?.am_projects || []
          const systemTasks = userDay?.am_system_tasks || []
          const fastTasks = userDay?.am_fast_tasks || []
          
          printContent += `<td>`
          if (projects.length > 0 || systemTasks.length > 0) {
            projects.forEach((project) => {
              printContent += `<div class="project-card">
                <div class="project-title">${project.project_title}`
              if (project.project_total_products) {
                printContent += ` <span style="color: #666; font-size: 8pt;">(${project.project_total_products})</span>`
              }
              printContent += `</div>`
              if (project.tasks && project.tasks.length > 0) {
                project.tasks.forEach((task) => {
                  printContent += `<div class="task-item">${task.task_title}`
                  if (task.daily_products) {
                    printContent += ` <span class="products">${task.daily_products} pcs</span>`
                  }
                  const badge = getTaskStatusBadge(task)
                  if (badge) {
                    const badgeClass = badge.label === "BLL" ? "badge-bll" :
                                     badge.label === "R1" ? "badge-r1" :
                                     badge.label === "1H" ? "badge-1h" :
                                     badge.label === "GA" ? "badge-ga" :
                                     badge.label === "P:" ? "badge-p" :
                                     badge.label === "N" ? "badge-n" : ""
                    printContent += ` <span class="badge ${badgeClass}">${badge.label}</span>`
                  }
                  printContent += `</div>`
                })
              }
              printContent += `</div>`
            })
            if (systemTasks.length > 0) {
              printContent += `<div style="margin-top: 4px; font-size: 8pt; color: #1e40af;"><strong>System Tasks:</strong>`
              systemTasks.forEach((task) => {
                printContent += `<div class="task-item">${task.title}</div>`
              })
              printContent += `</div>`
            }
          } else {
            printContent += `<div class="empty-cell">—</div>`
          }
          printContent += `</td>`
        })
        printContent += `</tr>`

        // AM FT Row
        printContent += `<tr>`
        printContent += `<td class="ll-cell print-subhead">FT</td>`
        printContent += `<td class="print-subhead time-cell">AM</td>`
        allUsers.forEach((user) => {
          const userDay = day.users.find(u => u.user_id === user.user_id)
          const fastTasks = userDay?.am_fast_tasks || []

          printContent += `<td>`
            if (fastTasks.length > 0) {
            printContent += `<div style="font-size: 8pt; color: #0f172a;">`
            fastTasks.forEach((task) => {
              printContent += `<div class="task-item">${task.title}`
              const badge = getFastTaskBadge(task)
              if (badge) {
                const badgeClass = badge.label === "BLL" ? "badge-bll" :
                                 badge.label === "R1" ? "badge-r1" :
                                 badge.label === "1H" ? "badge-1h" :
                                 badge.label === "GA" ? "badge-ga" :
                                 badge.label === "P:" ? "badge-p" :
                                 badge.label === "N" ? "badge-n" : ""
                printContent += ` <span class="badge ${badgeClass}">${badge.label}</span>`
              }
              printContent += `</div>`
            })
            printContent += `</div>`
          } else {
            printContent += `<div class="empty-cell">—</div>`
          }
          printContent += `</td>`
        })
        printContent += `</tr>`
        
        // PM PRJK Row
        printContent += `<tr style="border-top: 2px solid #000;">`
        printContent += `<td class="ll-cell print-subhead">PRJK</td>`
        printContent += `<td class="print-subhead time-cell">PM</td>`
        allUsers.forEach((user) => {
          const userDay = day.users.find(u => u.user_id === user.user_id)
          const projects = userDay?.pm_projects || []
          const systemTasks = userDay?.pm_system_tasks || []
          const fastTasks = userDay?.pm_fast_tasks || []
          
          printContent += `<td>`
          if (projects.length > 0 || systemTasks.length > 0) {
            projects.forEach((project) => {
              printContent += `<div class="project-card">
                <div class="project-title">${project.project_title}`
              if (project.project_total_products) {
                printContent += ` <span style="color: #666; font-size: 8pt;">(${project.project_total_products})</span>`
              }
              printContent += `</div>`
              if (project.tasks && project.tasks.length > 0) {
                project.tasks.forEach((task) => {
                  printContent += `<div class="task-item">${task.task_title}`
                  if (task.daily_products) {
                    printContent += ` <span class="products">${task.daily_products} pcs</span>`
                  }
                  const badge = getTaskStatusBadge(task)
                  if (badge) {
                    const badgeClass = badge.label === "BLL" ? "badge-bll" :
                                     badge.label === "R1" ? "badge-r1" :
                                     badge.label === "1H" ? "badge-1h" :
                                   badge.label === "GA" ? "badge-ga" :
                                   badge.label === "P:" ? "badge-p" :
                                   badge.label === "N" ? "badge-n" : ""
                    printContent += ` <span class="badge ${badgeClass}">${badge.label}</span>`
                  }
                  printContent += `</div>`
                })
              }
              printContent += `</div>`
            })
            if (systemTasks.length > 0) {
              printContent += `<div style="margin-top: 4px; font-size: 8pt; color: #1e40af;"><strong>System Tasks:</strong>`
              systemTasks.forEach((task) => {
                printContent += `<div class="task-item">${task.title}</div>`
              })
              printContent += `</div>`
            }
          } else {
            printContent += `<div class="empty-cell">—</div>`
          }
          printContent += `</td>`
        })
        printContent += `</tr>`

        // PM FT Row
        printContent += `<tr>`
        printContent += `<td class="ll-cell print-subhead">FT</td>`
        printContent += `<td class="print-subhead time-cell">PM</td>`
        allUsers.forEach((user) => {
          const userDay = day.users.find(u => u.user_id === user.user_id)
          const fastTasks = userDay?.pm_fast_tasks || []

          printContent += `<td>`
          if (fastTasks.length > 0) {
            printContent += `<div style="font-size: 8pt; color: #0f172a;">`
            fastTasks.forEach((task) => {
              printContent += `<div class="task-item">${task.title}`
              const badge = getFastTaskBadge(task)
              if (badge) {
                const badgeClass = badge.label === "BLL" ? "badge-bll" :
                                 badge.label === "R1" ? "badge-r1" :
                                 badge.label === "1H" ? "badge-1h" :
                                 badge.label === "GA" ? "badge-ga" :
                                 badge.label === "P:" ? "badge-p" :
                                 badge.label === "N" ? "badge-n" : ""
                printContent += ` <span class="badge ${badgeClass}">${badge.label}</span>`
              }
              printContent += `</div>`
            })
            printContent += `</div>`
          } else {
            printContent += `<div class="empty-cell">—</div>`
          }
          printContent += `</td>`
        })
        printContent += `</tr>`
      })

      printContent += `
          </tbody>
        </table>
      `
    })

    printContent += `
          <div class="print-footer">
            <div></div>
            <div class="print-page-count"></div>
            <div class="print-initials">Initials: ${printInitials}</div>
          </div>
        </body>
      </html>
    `

    printWindow.document.write(printContent)
    printWindow.document.close()
    printWindow.focus()
    
    // Wait for content to load, then print
    setTimeout(() => {
      printWindow.print()
    }, 250)
  }, [data, departmentId, departments, getTaskStatusBadge])

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

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          button[title="Delete task"] {
            display: none !important;
          }
        }
      `}} />
      <div className="flex items-center justify-between">
      <div className="text-lg font-semibold">Weekly Planner</div>
        {data && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setManualTaskOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Task
            </Button>
            <Button onClick={handleSavePlan} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : "Save Plan"}
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

      <div className="grid gap-3 md:grid-cols-3">
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
        {data && (
          <div className="space-y-2">
            <Label>Week Range</Label>
            <div className="text-sm text-muted-foreground pt-2">
              {formatDate(data.week_start)} - {formatDate(data.week_end)}
            </div>
          </div>
        )}
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
                      <SelectItem value="GA">GA</SelectItem>
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

      {error ? (
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
            {data.departments.map((dept) => (
            <Card key={dept.department_id}>
            <CardHeader>
                <CardTitle>{formatDepartmentName(dept.department_name)}</CardTitle>
            </CardHeader>
              <CardContent>
                <div 
                  ref={setScrollRef(dept.department_id)}
                  className="overflow-x-auto cursor-grab"
                  onPointerDown={(e) => handlePointerDown(e, dept.department_id)}
                  onWheel={(e) => handleWheel(e, dept.department_id)}
                  style={{
                    scrollbarWidth: "thin",
                    scrollbarColor: "#94a3b8 #e2e8f0",
                    touchAction: "pan-y",
                  }}
                >
                  <Table className="table-fixed w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24 min-w-24 sticky left-0 bg-background z-10 text-xs font-bold uppercase" rowSpan={2}>Day</TableHead>
                        <TableHead className="w-10 min-w-10 sticky left-24 bg-background z-10 text-center text-xs font-bold uppercase">LL</TableHead>
                        <TableHead className="w-10 min-w-10 sticky left-34 bg-background z-10 text-center text-xs font-bold uppercase">Time</TableHead>
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
                            <TableHead key={user.user_id} className="w-56 min-w-56 text-center text-xs font-bold uppercase">
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
                                dayDate: string
                              ) => {
                                // Ensure arrays are defined
                                const projectsList = projects || []
                                const systemTasksList = systemTasks || []
                                const fastTasksList = fastTasks || []
                                
                                const hasContent = projectsList.length > 0 || systemTasksList.length > 0 || fastTasksList.length > 0
                                
                                if (!hasContent) {
                                  return <div className="min-h-20 text-xs text-muted-foreground/50">—</div>
                                }
                                
                                return (
                                  <div className="space-y-2 min-h-20">
                                    {/* Projects */}
                                    {projectsList.map((project, idx) => {
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
                                            <span className="truncate whitespace-nowrap">{project.project_title}</span>
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
                                                void deleteProject(project.project_id, project.project_title)
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
                                            {project.tasks.map((task) => {
                                              const statusBadge = getTaskStatusBadge(task)
                                              return (
                                                <div
                                                  key={task.task_id}
                                                  className={[
                                                    "text-[11px] flex justify-between items-center gap-1 rounded border px-1.5 py-0.5 group/task",
                                                    getStatusCardClassesForDay(task.status, task.completed_at, dayDate),
                                                  ].join(" ")}
                                                >
                                                  <span className="truncate whitespace-nowrap font-semibold text-slate-900">{task.task_title}</span>
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
                                                        void deleteTask(task.task_id, task.task_title)
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
                                                getStatusCardClassesForDay(task.status, task.completed_at, dayDate),
                                              ].join(" ")}
                                            >
                                              <span className="truncate whitespace-nowrap font-semibold text-slate-900">{task.title}</span>
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
                                                      void deleteTask(task.task_id!, task.title)
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
                                                getStatusCardClassesForDay(task.status, task.completed_at, dayDate),
                                              ].join(" ")}
                                            >
                                              <span className="truncate whitespace-nowrap font-semibold text-slate-900">{task.title}</span>
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
                                                      void deleteTask(task.task_id!, task.title)
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
                                )
                              }

                        const renderProjectsAndSystem = (
                          projects: WeeklyTableProjectEntry[],
                          systemTasks: WeeklyTableTaskEntry[],
                          dayDate: string
                        ) => (
                          renderCellContent(projects, systemTasks, [], "am", dayDate)
                        )

                        const renderFastOnly = (
                          fastTasks: WeeklyTableTaskEntry[],
                          dayDate: string
                        ) => (
                          renderCellContent([], [], fastTasks, "am", dayDate)
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
                              <TableCell className="w-10 min-w-10 align-top sticky left-24 bg-background z-10 text-center text-xs font-bold uppercase">
                                PRJK
                              </TableCell>
                              <TableCell className="w-10 min-w-10 align-top sticky left-34 bg-background z-10 text-center">
                                <div className="text-xs font-medium text-primary">AM</div>
                              </TableCell>
                              {allUsers.map((user) => {
                                const userDay = day.users.find((u) => u.user_id === user.user_id)
                                return (
                                  <TableCell key={`${user.user_id}-am-prjk`} className="align-top w-56 min-w-56">
                                    {userDay
                                      ? renderProjectsAndSystem(
                                          userDay.am_projects || [],
                                          userDay.am_system_tasks || [],
                                          day.date
                                        )
                                      : <div className="min-h-20 text-xs text-muted-foreground/50">—</div>}
                                  </TableCell>
                                )
                              })}
                            </TableRow>

                            {/* AM FT Row */}
                            <TableRow className="border-t border-border">
                              <TableCell className="w-10 min-w-10 align-top sticky left-24 bg-background z-10 text-center text-xs font-bold uppercase">
                                FT
                              </TableCell>
                              <TableCell className="w-10 min-w-10 align-top sticky left-34 bg-background z-10 text-center">
                                <div className="text-xs font-medium text-primary">AM</div>
                              </TableCell>
                              {allUsers.map((user) => {
                                const userDay = day.users.find((u) => u.user_id === user.user_id)
                                return (
                                  <TableCell key={`${user.user_id}-am-ft`} className="align-top w-56 min-w-56">
                                    {userDay
                                      ? renderFastOnly(
                                          userDay.am_fast_tasks || [],
                                          day.date
                                        )
                                      : <div className="min-h-20 text-xs text-muted-foreground/50">—</div>}
                                  </TableCell>
                                )
                              })}
                            </TableRow>

                            {/* PM PRJK Row */}
                            <TableRow className="border-t-2 border-border">
                              <TableCell className="w-10 min-w-10 align-top sticky left-24 bg-background z-10 text-center text-xs font-bold uppercase">
                                PRJK
                              </TableCell>
                              <TableCell className="w-10 min-w-10 align-top sticky left-34 bg-background z-10 text-center">
                                <div className="text-xs font-medium text-primary">PM</div>
                              </TableCell>
                              {allUsers.map((user) => {
                                const userDay = day.users.find((u) => u.user_id === user.user_id)
                                return (
                                  <TableCell key={`${user.user_id}-pm-prjk`} className="align-top w-56 min-w-56">
                                    {userDay
                                      ? renderProjectsAndSystem(
                                          userDay.pm_projects || [],
                                          userDay.pm_system_tasks || [],
                                          day.date
                                        )
                                      : <div className="min-h-20 text-xs text-muted-foreground/50">—</div>}
                                  </TableCell>
                                )
                              })}
                            </TableRow>

                            {/* PM FT Row */}
                            <TableRow className="border-t border-border">
                              <TableCell className="w-10 min-w-10 align-top sticky left-24 bg-background z-10 text-center text-xs font-bold uppercase">
                                FT
                              </TableCell>
                              <TableCell className="w-10 min-w-10 align-top sticky left-34 bg-background z-10 text-center">
                                <div className="text-xs font-medium text-primary">PM</div>
                              </TableCell>
                              {allUsers.map((user) => {
                                const userDay = day.users.find((u) => u.user_id === user.user_id)
                                return (
                                  <TableCell key={`${user.user_id}-pm-ft`} className="align-top w-56 min-w-56">
                                    {userDay
                                      ? renderFastOnly(
                                          userDay.pm_fast_tasks || [],
                                          day.date
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
                </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}
