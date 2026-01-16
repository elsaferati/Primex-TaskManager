"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { Plus, Save, X } from "lucide-react"
import { useAuth } from "@/lib/auth"
import type { Department, Project, Task, UserLookup } from "@/lib/types"

type WeeklyTableProjectTaskEntry = {
  task_id: string
  task_title: string
  daily_products: number | null
}

type WeeklyTableProjectEntry = {
  project_id: string
  project_title: string
  project_total_products: number | null
  task_count: number
  tasks: WeeklyTableProjectTaskEntry[]
}

type WeeklyTableTaskEntry = {
  task_id: string | null
  title: string
  daily_products: number | null
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
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [manualTaskOpen, setManualTaskOpen] = React.useState(false)
  const [manualTaskTitle, setManualTaskTitle] = React.useState("")
  const [manualTaskDay, setManualTaskDay] = React.useState("")
  const [manualTaskUserId, setManualTaskUserId] = React.useState("")
  const [manualTaskPeriod, setManualTaskPeriod] = React.useState<"AM" | "PM">("AM")
  const [manualTaskDepartmentId, setManualTaskDepartmentId] = React.useState("")
  const [isCreatingManualTask, setIsCreatingManualTask] = React.useState(false)

  // Drag-to-scroll refs and state
  const scrollContainerRefs = React.useRef<Map<string, HTMLDivElement>>(new Map())
  const isDragging = React.useRef(false)
  const startX = React.useRef(0)
  const scrollLeft = React.useRef(0)
  const activeContainer = React.useRef<HTMLDivElement | null>(null)

  const handleMouseDown = React.useCallback((e: React.MouseEvent<HTMLDivElement>, deptId: string) => {
    const container = scrollContainerRefs.current.get(deptId)
    if (!container) return
    isDragging.current = true
    activeContainer.current = container
    startX.current = e.pageX - container.offsetLeft
    scrollLeft.current = container.scrollLeft
    container.style.cursor = "grabbing"
    container.style.userSelect = "none"
  }, [])

  const handleMouseMove = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current || !activeContainer.current) return
    e.preventDefault()
    const x = e.pageX - activeContainer.current.offsetLeft
    const walk = (x - startX.current) * 1.5 // Scroll speed multiplier
    activeContainer.current.scrollLeft = scrollLeft.current - walk
  }, [])

  const handleMouseUp = React.useCallback(() => {
    if (activeContainer.current) {
      activeContainer.current.style.cursor = "grab"
      activeContainer.current.style.userSelect = ""
    }
    isDragging.current = false
    activeContainer.current = null
  }, [])

  const handleMouseLeave = React.useCallback(() => {
    if (isDragging.current && activeContainer.current) {
      activeContainer.current.style.cursor = "grab"
      activeContainer.current.style.userSelect = ""
    }
    isDragging.current = false
    activeContainer.current = null
  }, [])

  const setScrollRef = React.useCallback((deptId: string) => (el: HTMLDivElement | null) => {
    if (el) {
      scrollContainerRefs.current.set(deptId, el)
    } else {
      scrollContainerRefs.current.delete(deptId)
    }
  }, [])

  const [deletingTaskId, setDeletingTaskId] = React.useState<string | null>(null)

  const deleteTask = React.useCallback(async (taskId: string) => {
    if (!taskId) return
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
    if (!manualTaskOpen) return
    if (departmentId !== ALL_DEPARTMENTS_VALUE) {
      setManualTaskDepartmentId(departmentId)
    }
  }, [manualTaskOpen, departmentId])

  React.useEffect(() => {
    if (!manualTaskDepartmentId) return
    setManualTaskUserId("")
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
    if (!manualTaskDay) {
      toast.error("Select a day.")
      return
    }
    if (!manualTaskUserId) {
      toast.error("Select a member.")
      return
    }
    const userEntry = users.find((u) => u.id === manualTaskUserId)
    const departmentValue = manualTaskDepartmentValue || userEntry?.department_id || null
    if (!departmentValue) {
      toast.error("Department is required for this task.")
      return
    }

    setIsCreatingManualTask(true)
    try {
      const dueDateIso = new Date(manualTaskDay).toISOString()
      const res = await apiFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: manualTaskTitle.trim(),
          project_id: null,
          department_id: departmentValue,
          assigned_to: manualTaskUserId,
          status: "TODO",
          priority: "NORMAL",
          finish_period: manualTaskPeriod,
          due_date: dueDateIso,
        }),
      })
      if (!res.ok) {
        let detail = "Failed to create task"
        try {
          const data = await res.json()
          if (typeof data?.detail === "string") detail = data.detail
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      toast.success("Task added to weekly planner.")
      setManualTaskOpen(false)
      setManualTaskTitle("")
      setManualTaskDay("")
      setManualTaskUserId("")
      setManualTaskPeriod("AM")
      setManualTaskDepartmentId("")
      await loadPlanner()
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

  return (
    <div className="space-y-4">
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
                    {d.name}
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
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Task title</Label>
              <Input
                value={manualTaskTitle}
                onChange={(e) => setManualTaskTitle(e.target.value)}
                placeholder="Write the task..."
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Day</Label>
                <Select value={manualTaskDay} onValueChange={setManualTaskDay}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select day" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDays.map((day) => (
                      <SelectItem key={day.value} value={day.value}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            </div>
            <div className="space-y-2">
              <Label>Member</Label>
              <Select value={manualTaskUserId} onValueChange={setManualTaskUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                <CardTitle>{dept.department_name}</CardTitle>
            </CardHeader>
              <CardContent>
                <div 
                  ref={setScrollRef(dept.department_id)}
                  className="overflow-x-auto cursor-grab select-none"
                  onMouseDown={(e) => handleMouseDown(e, dept.department_id)}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseLeave}
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-32 sticky left-0 bg-background z-10">User</TableHead>
                        {dept.days.map((day, dayIndex) => (
                          <React.Fragment key={day.date}>
                            <TableHead className="min-w-48 text-center">
                              <div className="font-semibold">{DAY_NAMES[dayIndex]}</div>
                              <div className="text-xs text-muted-foreground">{formatDate(day.date)}</div>
                              <div className="text-xs font-medium mt-1">AM</div>
                            </TableHead>
                            <TableHead className="min-w-48 text-center">
                              <div className="text-xs font-medium mt-6">PM</div>
                            </TableHead>
                          </React.Fragment>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
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
                          <TableRow key={user.user_id}>
                            <TableCell className="font-medium sticky left-0 bg-background z-10">
                              {user.user_name}
                            </TableCell>
                            {dept.days.map((day, dayIndex) => {
                              // Find this user's data for this day
                              const userDay = day.users.find((u) => u.user_id === user.user_id)
                              
                              const renderCellContent = (
                                projects: WeeklyTableProjectEntry[],
                                systemTasks: WeeklyTableTaskEntry[],
                                fastTasks: WeeklyTableTaskEntry[],
                                timeSlot: "am" | "pm"
                              ) => {
                                // Ensure arrays are defined
                                const projectsList = projects || []
                                const systemTasksList = systemTasks || []
                                const fastTasksList = fastTasks || []
                                
                                const hasContent = projectsList.length > 0 || systemTasksList.length > 0 || fastTasksList.length > 0
                                
                                if (!hasContent) {
                                  return <div className="min-h-24 text-xs text-muted-foreground/50">—</div>
                                }
                                
                                return (
                                  <div className="space-y-2 min-h-24">
                                    {/* Projects */}
                                    {projectsList.map((project, idx) => (
                                      <div
                                        key={project.project_id}
                                        className="p-2 rounded-md bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors"
                                      >
                                        <div className="font-medium text-sm">{project.project_title}</div>
                                        {project.tasks && project.tasks.length > 0 && (
                                          <div className="mt-1 space-y-0.5">
                                            {project.tasks.map((task) => (
                                              <div key={task.task_id} className="text-xs text-muted-foreground flex justify-between items-center group/task">
                                                <span className="truncate">{task.task_title}</span>
                                                <div className="flex items-center gap-1">
                                                  {task.daily_products != null && (
                                                    <span className="font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]">
                                                      {task.daily_products} pcs
                                                    </span>
                                                  )}
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation()
                                                      void deleteTask(task.task_id)
                                                    }}
                                                    disabled={deletingTaskId === task.task_id}
                                                    className="opacity-0 group-hover/task:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-opacity"
                                                    title="Delete task"
                                                  >
                                                    <X className="h-3 w-3" />
                                                  </button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        {(!project.tasks || project.tasks.length === 0) && project.task_count > 1 && (
                                          <div className="text-xs text-muted-foreground mt-0.5">
                                            {project.task_count} tasks
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                    
                                    {/* System Tasks */}
                                    {systemTasksList.length > 0 && (
                                      <div className="space-y-1">
                                        <div className="text-xs font-medium text-muted-foreground mb-1">System Tasks</div>
                                        {systemTasksList.map((task, idx) => (
                                          <div
                                            key={task.task_id || idx}
                                            className="p-1.5 rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm flex justify-between items-center group/task"
                                          >
                                            <span className="truncate">{task.title}</span>
                                            {task.task_id && (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  void deleteTask(task.task_id!)
                                                }}
                                                disabled={deletingTaskId === task.task_id}
                                                className="opacity-0 group-hover/task:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-opacity ml-1"
                                                title="Delete task"
                                              >
                                                <X className="h-3 w-3" />
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {/* Fast Tasks */}
                                    {fastTasksList.length > 0 && (
                                      <div className="space-y-1">
                                        <div className="text-xs font-medium text-muted-foreground mb-1">Fast Tasks</div>
                                        {fastTasksList.map((task, idx) => (
                                          <div
                                            key={task.task_id || idx}
                                            className="p-1.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm flex justify-between items-center group/task"
                                          >
                                            <span className="truncate">{task.title}</span>
                                            {task.task_id && (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  void deleteTask(task.task_id!)
                                                }}
                                                disabled={deletingTaskId === task.task_id}
                                                className="opacity-0 group-hover/task:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-opacity ml-1"
                                                title="Delete task"
                                              >
                                                <X className="h-3 w-3" />
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              }

                              return (
                                <React.Fragment key={day.date}>
                                  {/* AM Column */}
                                  <TableCell className="align-top">
                                    {userDay
                                      ? renderCellContent(
                                          userDay.am_projects || [],
                                          userDay.am_system_tasks || [],
                                          userDay.am_fast_tasks || [],
                                          "am"
                                        )
                                      : <div className="min-h-24 text-xs text-muted-foreground/50">—</div>}
                                  </TableCell>
                                  {/* PM Column */}
                                  <TableCell className="align-top">
                                    {userDay
                                      ? renderCellContent(
                                          userDay.pm_projects || [],
                                          userDay.pm_system_tasks || [],
                                          userDay.pm_fast_tasks || [],
                                          "pm"
                                        )
                                      : <div className="min-h-24 text-xs text-muted-foreground/50">—</div>}
                                  </TableCell>
                                </React.Fragment>
                              )
                            })}
                          </TableRow>
                        ))
                      })()}
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
