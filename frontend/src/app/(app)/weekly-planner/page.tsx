"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"
import { Save } from "lucide-react"
import { useAuth } from "@/lib/auth"
import type { Department, Project, Task, User } from "@/lib/types"

type WeeklyTableProjectEntry = {
  project_id: string
  project_title: string
  task_count: number
}

type WeeklyTableTaskEntry = {
  task_id: string | null
  title: string
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
  const [departmentId, setDepartmentId] = React.useState<string>(ALL_DEPARTMENTS_VALUE)
  const [isThisWeek, setIsThisWeek] = React.useState(false)
  const [data, setData] = React.useState<WeeklyTableResponse | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

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
    }
    void boot()
  }, [apiFetch, user])

  React.useEffect(() => {
    const load = async () => {
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
          setIsLoading(false)
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
    }
    void load()
  }, [apiFetch, departmentId, isThisWeek])

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
          <Button onClick={handleSavePlan} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Plan"}
          </Button>
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
                <div className="overflow-x-auto">
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
                                        {project.task_count > 1 && (
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
                                            key={idx}
                                            className="p-1.5 rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm"
                                          >
                                            {task.title}
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
                                            key={idx}
                                            className="p-1.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm"
                                          >
                                            {task.title}
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
