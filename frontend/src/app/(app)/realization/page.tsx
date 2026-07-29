"use client"

import * as React from "react"
import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Clock3,
  ExternalLink,
  FileClock,
  Layers3,
  RefreshCw,
  Sparkles,
  Target,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import type {
  WeeklyPlanPerformanceAssigneeGroup,
  WeeklyPlanPerformanceResponse,
  WeeklyPlanPerformanceTask,
} from "@/components/weekly-plan-performance-view"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/lib/auth"
import type { Department } from "@/lib/types"
import { cn } from "@/lib/utils"


type EvidenceBucket = {
  key: keyof Pick<
    WeeklyPlanPerformanceAssigneeGroup,
    "completed" | "in_progress" | "pending" | "late" | "additional" | "removed_or_canceled"
  >
  label: string
  emptyLabel: string
  dotClass: string
}

const EVIDENCE_BUCKETS: EvidenceBucket[] = [
  {
    key: "completed",
    label: "Completed",
    emptyLabel: "No completed tasks",
    dotClass: "bg-emerald-500",
  },
  {
    key: "in_progress",
    label: "In progress",
    emptyLabel: "No tasks in progress",
    dotClass: "bg-amber-400",
  },
  {
    key: "pending",
    label: "Pending",
    emptyLabel: "No pending tasks",
    dotClass: "bg-slate-400",
  },
  {
    key: "late",
    label: "Late / overdue",
    emptyLabel: "No late tasks",
    dotClass: "bg-rose-500",
  },
  {
    key: "additional",
    label: "Additional",
    emptyLabel: "No additional tasks",
    dotClass: "bg-cyan-500",
  },
  {
    key: "removed_or_canceled",
    label: "Removed / canceled",
    emptyLabel: "No removed tasks",
    dotClass: "bg-violet-400",
  },
]

function localDateValue(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function currentWeekStart() {
  const today = new Date()
  const day = today.getDay()
  const distanceFromMonday = day === 0 ? 6 : day - 1
  today.setDate(today.getDate() - distanceFromMonday)
  return localDateValue(today)
}

function formatWeekRange(start: string, end?: string | null) {
  const format = (value: string) =>
    new Intl.DateTimeFormat("sq-AL", { day: "2-digit", month: "short", year: "numeric" }).format(
      new Date(`${value}T12:00:00`)
    )
  return end ? `${format(start)} – ${format(end)}` : format(start)
}

function percentage(value: number, total: number) {
  if (total <= 0) return 0
  return Math.min(100, Math.round((value / total) * 100))
}

function taskCount(group: WeeklyPlanPerformanceAssigneeGroup) {
  return (
    (group.completed?.length || 0) +
    (group.in_progress?.length || 0) +
    (group.pending?.length || 0) +
    (group.late?.length || 0) +
    (group.removed_or_canceled?.length || 0)
  )
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  detail: string
  icon: React.ComponentType<{ className?: string }>
  tone: "emerald" | "amber" | "rose" | "cyan" | "slate"
}) {
  const toneClasses = {
    emerald: "border-emerald-200 bg-emerald-50/70 text-emerald-700",
    amber: "border-amber-200 bg-amber-50/70 text-amber-700",
    rose: "border-rose-200 bg-rose-50/70 text-rose-700",
    cyan: "border-cyan-200 bg-cyan-50/70 text-cyan-700",
    slate: "border-slate-200 bg-slate-50/70 text-slate-700",
  }
  return (
    <Card className="overflow-hidden shadow-none">
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className={cn("rounded-2xl border p-3", toneClasses[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function EvidenceTask({ task }: { task: WeeklyPlanPerformanceTask }) {
  const content = (
    <>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{task.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {task.project_title || task.source_type || "Task"}
        </p>
      </div>
      {task.task_id ? <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
    </>
  )

  if (!task.task_id) {
    return <div className="flex items-start justify-between gap-3 rounded-lg border bg-background p-3">{content}</div>
  }
  return (
    <Link
      href={`/tasks/${task.task_id}`}
      className="flex items-start justify-between gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-muted/60"
    >
      {content}
    </Link>
  )
}

function EvidencePanel({
  group,
  onClose,
}: {
  group: WeeklyPlanPerformanceAssigneeGroup
  onClose: () => void
}) {
  return (
    <Card className="border-slate-300 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b bg-slate-50/70">
        <div>
          <CardTitle className="text-base">Evidence · {group.assignee_name}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Çdo numër në rresht lidhet me task-et burimore të snapshot-it.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Mbyll
        </Button>
      </CardHeader>
      <CardContent className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-3">
        {EVIDENCE_BUCKETS.map((bucket) => {
          const tasks = group[bucket.key] || []
          return (
            <section key={bucket.key}>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", bucket.dotClass)} />
                  <h3 className="text-sm font-semibold">{bucket.label}</h3>
                </div>
                <Badge variant="secondary">{tasks.length}</Badge>
              </div>
              <div className="space-y-2">
                {tasks.length ? (
                  tasks.map((task) => <EvidenceTask key={task.match_key} task={task} />)
                ) : (
                  <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    {bucket.emptyLabel}
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </CardContent>
    </Card>
  )
}

export default function RealizationPage() {
  const { apiFetch, user } = useAuth()
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [departmentId, setDepartmentId] = React.useState("")
  const [weekStart, setWeekStart] = React.useState(currentWeekStart)
  const [data, setData] = React.useState<WeeklyPlanPerformanceResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [selectedAssigneeId, setSelectedAssigneeId] = React.useState<string | null>(null)

  const visibleDepartments = React.useMemo(() => {
    if (user?.role === "ADMIN" || !user?.department_id) return departments
    return departments.filter((department) => department.id === user.department_id)
  }, [departments, user?.department_id, user?.role])

  React.useEffect(() => {
    let cancelled = false
    const loadDepartments = async () => {
      const response = await apiFetch("/departments")
      if (!response.ok || cancelled) return
      const payload = (await response.json()) as Department[]
      if (cancelled) return
      setDepartments(payload)
      const accessible =
        user?.role === "ADMIN" || !user?.department_id
          ? payload
          : payload.filter((department) => department.id === user.department_id)
      setDepartmentId((current) => current || accessible[0]?.id || "")
    }
    void loadDepartments()
    return () => {
      cancelled = true
    }
  }, [apiFetch, user?.department_id, user?.role])

  const loadRealization = React.useCallback(async () => {
    if (!departmentId || !weekStart) return
    setLoading(true)
    setSelectedAssigneeId(null)
    try {
      const query = new URLSearchParams({
        department_id: departmentId,
        week_start: weekStart,
      })
      const response = await apiFetch(
        `/planners/weekly-snapshots/plan-vs-final?${query.toString()}`
      )
      if (!response.ok) {
        let detail = "Realizimi javor nuk mund të ngarkohej."
        try {
          const payload = (await response.json()) as { detail?: string }
          if (payload.detail) detail = payload.detail
        } catch {
          // Keep the user-facing fallback.
        }
        throw new Error(detail)
      }
      setData((await response.json()) as WeeklyPlanPerformanceResponse)
    } catch (error) {
      setData(null)
      toast.error(error instanceof Error ? error.message : "Realizimi javor nuk mund të ngarkohej.")
    } finally {
      setLoading(false)
    }
  }, [apiFetch, departmentId, weekStart])

  React.useEffect(() => {
    void loadRealization()
  }, [loadRealization])

  const summary = data?.summary
  const planned = summary?.total_planned || 0
  const completed = summary?.completed || 0
  const open =
    (summary?.in_progress || 0) + (summary?.pending || 0) + (summary?.late || 0)
  const completionRate = percentage(completed, planned)
  const groups = React.useMemo(
    () =>
      [...(data?.by_assignee || [])]
        .filter((group) => group.assignee_name?.trim())
        .sort((left, right) => left.assignee_name.localeCompare(right.assignee_name)),
    [data?.by_assignee]
  )
  const selectedGroup =
    groups.find(
      (group) =>
        (group.assignee_id || `name:${group.assignee_name}`) === selectedAssigneeId
    ) || null
  const departmentName =
    visibleDepartments.find((department) => department.id === departmentId)?.name ||
    data?.department_name ||
    "Departamenti"

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-2 md:p-4">
      <section className="relative overflow-hidden rounded-2xl border bg-slate-950 px-5 py-6 text-white md:px-7">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-24 w-72 bg-emerald-400/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
              <Activity className="h-4 w-4" />
              PrimeFlow performance
            </div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Realizimi</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Plan vs Final, evidence dhe rezultatet javore në një pamje të vetme.
              Snapshot-et mbeten burimi zyrtar i fakteve.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border border-white/15 bg-white/10 px-3 py-1.5 text-white hover:bg-white/10">
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
              {data ? formatWeekRange(data.week_start, data.week_end) : "Java aktuale"}
            </Badge>
            <Badge className="border border-emerald-300/30 bg-emerald-400/15 px-3 py-1.5 text-emerald-100 hover:bg-emerald-400/15">
              {data?.final_snapshot_id ? "FINAL snapshot" : "Në pritje të FINAL"}
            </Badge>
          </div>
        </div>
      </section>

      <Card className="shadow-none">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-end">
          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="realization-week">Java</Label>
              <Input
                id="realization-week"
                type="date"
                value={weekStart}
                onChange={(event) => setWeekStart(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Zgjidh të hënën e javës që dëshiron të analizosh.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="realization-department">Departamenti</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger id="realization-department">
                  <SelectValue placeholder="Zgjidh departamentin" />
                </SelectTrigger>
                <SelectContent>
                  {visibleDepartments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Shfaqen vetëm departamentet brenda scope-it tënd.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/weekly-planner">
                Weekly Planner
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button onClick={() => void loadRealization()} disabled={loading || !departmentId}>
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
              Rifresko
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Plan"
          value={planned}
          detail={`${departmentName} · task-e të planifikuara`}
          icon={Target}
          tone="slate"
        />
        <MetricCard
          label="Completed"
          value={completed}
          detail={`${completionRate}% e planit`}
          icon={CheckCircle2}
          tone="emerald"
        />
        <MetricCard
          label="Open"
          value={open}
          detail="In progress, pending ose late"
          icon={Clock3}
          tone="amber"
        />
        <MetricCard
          label="Late"
          value={summary?.late || 0}
          detail="Task-e të vonuara në FINAL"
          icon={AlertTriangle}
          tone="rose"
        />
        <MetricCard
          label="Additional"
          value={summary?.additional || 0}
          detail="Të shtuara pas planit"
          icon={Sparkles}
          tone="cyan"
        />
      </div>

      <Card className="overflow-hidden shadow-none">
        <CardContent className="p-0">
          <div className="grid gap-5 border-b bg-slate-50/70 p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-slate-600" />
                <h2 className="font-semibold">Mbulimi i planit</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {completed} nga {planned} task-e të planifikuara janë completed në snapshot-in final.
              </p>
            </div>
            <div className="text-left md:text-right">
              <div className="text-2xl font-bold tabular-nums">{completionRate}%</div>
              <div className="text-xs text-muted-foreground">Plan completion</div>
            </div>
          </div>
          <div className="h-2 bg-slate-100">
            <div
              className="h-full bg-emerald-500 transition-[width] duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden shadow-none">
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              Rezultati sipas personit
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Kliko një rresht për të parë task evidence. Suggested dhe Final mbeten të ndara.
            </p>
          </div>
          {data?.snapshot_id && data.final_snapshot_id ? (
            <Badge variant="outline" className="hidden md:inline-flex">
              PLANNED + FINAL
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Po ngarkohet realizimi…
              </div>
            </div>
          ) : !data?.snapshot_id ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <div className="rounded-full bg-amber-50 p-4 text-amber-600">
                <FileClock className="h-7 w-7" />
              </div>
              <h3 className="mt-4 font-semibold">Nuk ka PLANNED snapshot për këtë javë</h3>
              <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                Ruaje planin zyrtar në Weekly Planner. Pas krijimit të FINAL snapshot,
                faktet do të shfaqen automatikisht këtu.
              </p>
              <Button className="mt-5" variant="outline" asChild>
                <Link href="/weekly-planner">Hap Weekly Planner</Link>
              </Button>
            </div>
          ) : !data.final_snapshot_id ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <div className="rounded-full bg-cyan-50 p-4 text-cyan-700">
                <FileClock className="h-7 w-7" />
              </div>
              <h3 className="mt-4 font-semibold">Plani ekziston; FINAL snapshot mungon</h3>
              <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                Realizimi sipas personit do të kalkulohet sapo të ruhet snapshot-i
                “This Week (Final)” në Weekly Planner.
              </p>
              <Button className="mt-5" variant="outline" asChild>
                <Link href="/weekly-planner">Krijo FINAL snapshot</Link>
              </Button>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
              <CircleDashed className="h-8 w-8 text-muted-foreground" />
              <h3 className="mt-3 font-semibold">Nuk ka persona në këtë snapshot</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Kontrollo departamentin ose javën e zgjedhur.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                    <TableHead className="min-w-52">Personi</TableHead>
                    <TableHead className="text-center">Plan</TableHead>
                    <TableHead className="text-center">Completed</TableHead>
                    <TableHead className="text-center">Open</TableHead>
                    <TableHead className="text-center">Late</TableHead>
                    <TableHead className="text-center">Additional</TableHead>
                    <TableHead className="min-w-32">Suggested</TableHead>
                    <TableHead className="min-w-32">Final</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((group) => {
                    const rowId = group.assignee_id || `name:${group.assignee_name}`
                    const isSelected = selectedAssigneeId === rowId
                    const groupPlan = taskCount(group)
                    const groupCompleted = group.completed?.length || 0
                    const groupOpen =
                      (group.in_progress?.length || 0) +
                      (group.pending?.length || 0) +
                      (group.late?.length || 0)
                    return (
                      <TableRow
                        key={rowId}
                        className={cn(
                          "cursor-pointer",
                          isSelected && "bg-cyan-50/60 hover:bg-cyan-50/60"
                        )}
                        onClick={() => setSelectedAssigneeId(isSelected ? null : rowId)}
                      >
                        <TableCell>
                          <div className="font-semibold">{group.assignee_name}</div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{percentage(groupCompleted, groupPlan)}% completed</span>
                            <span>·</span>
                            <span>{groupPlan} evidence items</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-medium tabular-nums">
                          {groupPlan}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                            {groupCompleted}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{groupOpen}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={cn(
                              (group.late?.length || 0) > 0 &&
                                "border-rose-200 bg-rose-50 text-rose-700"
                            )}
                          >
                            {group.late?.length || 0}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className="border-cyan-200 bg-cyan-50 text-cyan-700"
                          >
                            {group.additional?.length || 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CircleDashed className="h-3.5 w-3.5" />
                            Pa kalkuluar
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CircleDashed className="h-3.5 w-3.5" />
                            Pa aprovuar
                          </span>
                        </TableCell>
                        <TableCell>
                          {isSelected ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedGroup ? (
        <EvidencePanel group={selectedGroup} onClose={() => setSelectedAssigneeId(null)} />
      ) : null}

      {data?.message ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Snapshot status</p>
            <p className="mt-0.5 text-amber-800">{data.message}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col justify-between gap-3 rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground md:flex-row md:items-center">
        <p>
          Nivelet A+–E/M dhe bonuset do të aktivizohen vetëm nga scoring engine dhe approval workflow.
        </p>
        <Link href="/reviews" className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
          Hap Reviews
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
