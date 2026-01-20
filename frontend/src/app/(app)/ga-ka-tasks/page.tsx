"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import { formatDepartmentName } from "@/lib/department-name"
import type { Department, Task, TaskFinishPeriod, TaskPriority, User, UserLookup } from "@/lib/types"

import { SystemTasksView } from "../system-tasks/page"

const FINISH_PERIOD_NONE_VALUE = "__none__"
const PRIORITY_OPTIONS: TaskPriority[] = ["NORMAL", "HIGH"]
const DAY_OPTIONS = [
  { value: "all", label: "All days" },
  { value: "0", label: "Monday" },
  { value: "1", label: "Tuesday" },
  { value: "2", label: "Wednesday" },
  { value: "3", label: "Thursday" },
  { value: "4", label: "Friday" },
  { value: "5", label: "Saturday" },
  { value: "6", label: "Sunday" },
]

// --- Bold-only editor (same behavior as System Tasks) ---
const BOLD_TAG_PATTERN = /<(strong|b|br|div|p)(\s|>|\/)/i

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function sanitizeBoldOnlyHtml(raw: string) {
  if (typeof document === "undefined") return raw
  const container = document.createElement("div")
  container.innerHTML = raw

  const unwrapBlockElements = (el: Element) => {
    const blocks = el.querySelectorAll("div, p")
    Array.from(blocks)
      .reverse()
      .forEach((block) => {
        const parent = block.parentNode
        if (!parent) return
        while (block.firstChild) {
          parent.insertBefore(block.firstChild, block)
        }
        parent.removeChild(block)
      })
  }
  unwrapBlockElements(container)

  const clean = document.createElement("div")

  const sanitizeNode = (node: Node): Node[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ""
      return text.length > 0 ? [document.createTextNode(text)] : []
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return []
    const el = node as HTMLElement
    const tag = el.tagName
    if (tag === "BR") return [document.createElement("br")]
    const children = Array.from(el.childNodes).flatMap(sanitizeNode)
    if (tag === "B" || tag === "STRONG") {
      const strong = document.createElement("strong")
      children.forEach((child) => strong.appendChild(child))
      return [strong]
    }
    if (tag === "SPAN") {
      const weight = el.style.fontWeight || el.getAttribute("data-weight") || ""
      const numericWeight = Number.parseInt(weight, 10)
      const isBold =
        weight.toLowerCase() === "bold" || (!Number.isNaN(numericWeight) && numericWeight >= 600)
      if (isBold) {
        const strong = document.createElement("strong")
        children.forEach((child) => strong.appendChild(child))
        return [strong]
      }
      return children
    }
    return children
  }

  Array.from(container.childNodes).forEach((node) => {
    sanitizeNode(node).forEach((child) => clean.appendChild(child))
  })

  clean.normalize()

  const text = clean.textContent?.replace(/\s+/g, "") ?? ""
  if (!text) return ""
  return clean.innerHTML
}

function normalizeBoldValue(value: string) {
  if (!value) return ""
  if (typeof document === "undefined") return value
  if (BOLD_TAG_PATTERN.test(value)) return sanitizeBoldOnlyHtml(value)
  const container = document.createElement("div")
  const lines = value.split(/\r?\n/)
  lines.forEach((line, index) => {
    container.appendChild(document.createTextNode(line))
    if (index < lines.length - 1) container.appendChild(document.createElement("br"))
  })
  return container.innerHTML
}

type BoldOnlyEditorProps = {
  value: string
  onChange: (value: string) => void
}

function BoldOnlyEditor({ value, onChange }: BoldOnlyEditorProps) {
  const editorRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!editorRef.current) return
    const normalized = normalizeBoldValue(value)
    if (editorRef.current.innerHTML !== normalized) {
      editorRef.current.innerHTML = normalized
    }
  }, [value])

  const commitChange = React.useCallback(() => {
    if (!editorRef.current) return
    const sanitized = sanitizeBoldOnlyHtml(editorRef.current.innerHTML)
    if (sanitized !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = sanitized
    }
    onChange(sanitized)
  }, [onChange])

  const handleInput = React.useCallback(() => {
    if (!editorRef.current) return
    onChange(editorRef.current.innerHTML)
  }, [onChange])

  const [isBold, setIsBold] = React.useState(false)

  const checkBoldState = React.useCallback(() => {
    if (typeof document !== "undefined") {
      setIsBold(document.queryCommandState("bold"))
    }
  }, [])

  const applyBold = React.useCallback(() => {
    if (!editorRef.current) return
    editorRef.current.focus()
    document.execCommand("bold", false)
    checkBoldState()
    commitChange()
  }, [commitChange, checkBoldState])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-semibold shadow-sm transition ${
            isBold
              ? "border-blue-500 bg-blue-100 text-blue-700"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={applyBold}
          aria-label="Bold"
          aria-pressed={isBold}
        >
          B
        </button>
        <span className="text-xs text-muted-foreground">Bold only</span>
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] md:text-sm whitespace-pre-wrap"
        onInput={handleInput}
        onBlur={commitChange}
        onSelect={checkBoldState}
        onKeyUp={checkBoldState}
        onMouseUp={checkBoldState}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            document.execCommand("insertLineBreak")
            handleInput()
            return
          }
          if (event.ctrlKey || event.metaKey) {
            const key = event.key.toLowerCase()
            if (key === "b") {
              event.preventDefault()
              applyBold()
              return
            }
            if (["i", "u"].includes(key)) {
              event.preventDefault()
            }
          }
        }}
        onPaste={(event) => {
          event.preventDefault()
          const text = event.clipboardData.getData("text/plain")
          if (!text) return
          const html = escapeHtml(text)
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .replace(/\n/g, "<br>")
          document.execCommand("insertHTML", false, html)
          commitChange()
        }}
        suppressContentEditableWarning
      />
    </div>
  )
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" })
}

function getMondayBasedDay(date: Date) {
  return (date.getDay() + 6) % 7
}

export default function GaKaTasksPage() {
  const { apiFetch, user } = useAuth()
  type AssigneeUser = User | UserLookup
  const [tasks, setTasks] = React.useState<Task[]>([])
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [users, setUsers] = React.useState<AssigneeUser[]>([])
  const [loadingTasks, setLoadingTasks] = React.useState(true)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [viewFilter, setViewFilter] = React.useState<"all" | "tasks" | "system">("all")
  const [priorityFilter, setPriorityFilter] = React.useState<"all" | TaskPriority>("all")
  const [dayFilter, setDayFilter] = React.useState<string>("all")
  const [dateFilter, setDateFilter] = React.useState("")

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [dueDate, setDueDate] = React.useState("")
  const [taskPriority, setTaskPriority] = React.useState<TaskPriority>("NORMAL")
  const [finishPeriod, setFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(
    FINISH_PERIOD_NONE_VALUE
  )

  const load = React.useCallback(async () => {
    setLoadingTasks(true)
    try {
      const [tasksRes, departmentsRes] = await Promise.all([
        apiFetch("/tasks?include_done=true"),
        apiFetch("/departments"),
      ])
      if (tasksRes.ok) {
        setTasks((await tasksRes.json()) as Task[])
      }
      if (departmentsRes.ok) {
        setDepartments((await departmentsRes.json()) as Department[])
      }
      const usersRes = await apiFetch(user?.role === "STAFF" ? "/users/lookup" : "/users")
      if (usersRes.ok) {
        setUsers((await usersRes.json()) as AssigneeUser[])
      }
    } finally {
      setLoadingTasks(false)
    }
  }, [apiFetch, user?.role])

  React.useEffect(() => {
    void load()
  }, [load])

  const submitTask = async () => {
    if (!title.trim()) {
      toast.error("Task title is required")
      return
    }
    setCreating(true)
    try {
      const noteRes = await apiFetch("/ga-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department_id: null,
          content: description.trim() || title.trim(),
          note_type: "GA",
        }),
      })
      if (!noteRes.ok) {
        let detail = "Failed to create GA note"
        try {
          const data = (await noteRes.json()) as { detail?: string | Array<{ msg?: string }> }
          if (data?.detail) {
            if (typeof data.detail === "string") {
              detail = data.detail
            } else if (Array.isArray(data.detail) && data.detail.length > 0) {
              detail = data.detail.map((e) => e.msg || "Validation error").join(", ")
            }
          }
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const createdNote = (await noteRes.json()) as { id: string }

      const dueDateValue = dueDate ? new Date(dueDate).toISOString() : null
      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || null,
        status: "TODO",
        priority: taskPriority,
        finish_period: finishPeriod === FINISH_PERIOD_NONE_VALUE ? null : finishPeriod,
        due_date: dueDateValue,
        ga_note_origin_id: createdNote.id,
      }
      const res = await apiFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail = "Failed to create task"
        try {
          const data = (await res.json()) as { detail?: string | Array<{ msg?: string }> }
          if (data?.detail) {
            if (typeof data.detail === "string") {
              detail = data.detail
            } else if (Array.isArray(data.detail) && data.detail.length > 0) {
              detail = data.detail.map((e) => e.msg || "Validation error").join(", ")
            }
          }
        } catch {
          // ignore
        }
        toast.error(detail)
        return
      }
      const created = (await res.json()) as Task
      setTasks((prev) => [created, ...prev])
      setCreateOpen(false)
      setTitle("")
      setDescription("")
      setDueDate("")
      setTaskPriority("NORMAL")
      setFinishPeriod(FINISH_PERIOD_NONE_VALUE)
      toast.success("Task created")
    } finally {
      setCreating(false)
    }
  }

  const departmentMap = React.useMemo(() => new Map(departments.map((dept) => [dept.id, dept])), [departments])
  const userMap = React.useMemo(() => new Map(users.map((person) => [person.id, person])), [users])

  const gaTasks = React.useMemo(
    () =>
      tasks.filter((task) => {
        const isSystem = Boolean(task.system_template_origin_id || task.task_type === "system")
        if (!task.ga_note_origin_id || isSystem) return false
        const createdAt = task.created_at ? new Date(task.created_at).getTime() : 0
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
        return createdAt >= cutoff
      }),
    [tasks]
  )

  const filteredTasks = React.useMemo(() => {
    let filtered = gaTasks
    if (priorityFilter !== "all") {
      filtered = filtered.filter(
        (task) => (task.priority || "NORMAL").toUpperCase() === priorityFilter
      )
    }
    if (dateFilter) {
      filtered = filtered.filter((task) => {
        if (!task.due_date) return false
        const iso = new Date(task.due_date).toISOString().slice(0, 10)
        return iso === dateFilter
      })
    }
    if (dayFilter !== "all") {
      const targetDay = Number(dayFilter)
      if (!Number.isNaN(targetDay)) {
        filtered = filtered.filter((task) => {
          if (!task.due_date) return false
          const day = getMondayBasedDay(new Date(task.due_date))
          return day === targetDay
        })
      }
    }
    return filtered
  }, [dateFilter, dayFilter, gaTasks, priorityFilter])

  const sortedTasks = React.useMemo(
    () =>
      [...filteredTasks].sort((a, b) => {
        const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0
        const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0
        return bCreated - aCreated
      }),
    [filteredTasks]
  )

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <Card className="sticky top-0 z-40 border-0 bg-gradient-to-r from-slate-50 via-slate-100 to-slate-50 shadow-sm">
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Admin Tasks</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="border-slate-200 bg-white">
                  GA tasks: {gaTasks.length}
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-white">
                  Filtered: {sortedTasks.length}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[160px]">
                <Label className="text-xs text-muted-foreground">View</Label>
                <Select value={viewFilter} onValueChange={(value) => setViewFilter(value as "all" | "tasks" | "system")}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tasks + System</SelectItem>
                    <SelectItem value="tasks">Tasks only</SelectItem>
                    <SelectItem value="system">System only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[160px]">
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as "all" | TaskPriority)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All priorities</SelectItem>
                    {PRIORITY_OPTIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[160px]">
                <Label className="text-xs text-muted-foreground">Day</Label>
                <Select value={dayFilter} onValueChange={setDayFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[160px]">
                <Label className="text-xs text-muted-foreground">Due date</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={dateFilter}
                  onChange={(event) => setDateFilter(event.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  className="h-9 text-xs text-slate-600"
                  onClick={() => {
                    setViewFilter("all")
                    setPriorityFilter("all")
                    setDayFilter("all")
                    setDateFilter("")
                  }}
                >
                  Clear filters
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
        {viewFilter !== "system" ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Tasks</CardTitle>
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">+ Add Task</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add GA Task</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input value={title} onChange={(event) => setTitle(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <BoldOnlyEditor value={description} onChange={setDescription} />
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={taskPriority} onValueChange={(value) => setTaskPriority(value as TaskPriority)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_OPTIONS.map((value) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Finish period</Label>
                        <Select
                          value={finishPeriod}
                          onValueChange={(value) =>
                            setFinishPeriod(value as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="All day" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={FINISH_PERIOD_NONE_VALUE}>All day</SelectItem>
                            <SelectItem value="AM">AM</SelectItem>
                            <SelectItem value="PM">PM</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Due date (optional)</Label>
                        <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setCreateOpen(false)}>
                        Cancel
                      </Button>
                      <Button disabled={creating || !title.trim()} onClick={() => void submitTask()}>
                        {creating ? "Saving..." : "Save task"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {loadingTasks ? (
                <div className="text-sm text-muted-foreground">Loading tasks...</div>
              ) : sortedTasks.length ? (
                <div className="space-y-2">
                  {sortedTasks.map((task) => {
                    const department = task.department_id ? departmentMap.get(task.department_id) : null
                    const assignee = task.assigned_to ? userMap.get(task.assigned_to) : null
                    const assigneeEmail = assignee && "email" in assignee ? assignee.email || "" : ""
                    const assigneeLabel = assignee?.full_name || assignee?.username || assigneeEmail || "-"
                    return (
                      <Link
                        key={task.id}
                        href={`/tasks/${task.id}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm hover:border-slate-300"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900">{task.title}</span>
                            {task.status ? (
                              <Badge variant="secondary" className="uppercase">
                                {task.status}
                              </Badge>
                            ) : null}
                            {task.priority ? (
                              <Badge variant="outline" className="border-slate-200 text-slate-700">
                                {task.priority}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Department: {department ? formatDepartmentName(department.name) : "-"} - Assignee: {assigneeLabel}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">Due: {formatDate(task.due_date)}</div>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No tasks found.</div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {viewFilter !== "tasks" ? (
        <SystemTasksView
          scopeFilter="GA"
          headingTitle="Admin System Tasks"
          headingDescription="System tasks scoped for Kosove and Gane admins."
          showSystemActions={false}
          showFilters={false}
          externalPriorityFilter={priorityFilter}
          externalDayFilter={dayFilter}
          externalDateFilter={dateFilter}
        />
      ) : null}
    </div>
  )
}
