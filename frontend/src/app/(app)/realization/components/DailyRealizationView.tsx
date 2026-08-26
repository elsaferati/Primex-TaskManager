"use client"

import * as React from "react"
import { AlertTriangle, ArrowDownUp, CalendarDays, History, RefreshCw } from "lucide-react"
import { useAuth } from "@/lib/auth"
import type { DailyRealizationLive, DailyRealizationMetrics, DailyRealizationTask, Department } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

const DEFAULT_REALIZATION_TIMEZONE = "Europe/Tirane"
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_REALIZATION_TIMEZONE }).format(new Date())
const pct = (value: number | null) => value == null ? "N/A" : `${value}%`
const outcomeLabel: Record<string, string> = {
  REALIZED_AS_PLANNED: "Done sipas planit", IN_PROGRESS: "Në progres", NO_PROGRESS: "Pa progres",
  POSTPONED_APPROVED: "Shtyrë · aprovuar", POSTPONED_UNAPPROVED: "Shtyrë · pa aprovuar",
  WAITING_CONFIRMATION: "Në konfirmim", COMPLETED_LATE: "Kryer me vonesë",
  COMPLETED_EARLY: "Kryer më herët", ADDITIONAL_COMPLETED: "Extra done", ADDED_DURING_DAY: "Shtuar sot",
  REOPENED: "Rihapur", REASSIGNED_OUT: "Transferuar jashtë",
  REASSIGNED_IN: "Transferuar brenda",
}
const outcomeStyle: Record<string, string> = {
  REALIZED_AS_PLANNED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  IN_PROGRESS: "border-amber-200 bg-amber-50 text-amber-800",
  NO_PROGRESS: "border-rose-200 bg-rose-50 text-rose-800",
  POSTPONED_APPROVED: "border-violet-200 bg-violet-50 text-violet-800",
  POSTPONED_UNAPPROVED: "border-red-300 bg-red-50 text-red-800",
  ADDITIONAL_COMPLETED: "border-blue-200 bg-blue-50 text-blue-800",
}

function Kpis({ metrics }: { metrics: DailyRealizationMetrics }) {
  const cards: Array<[string, string | number, string]> = [
    ["PLANIFIKUAR", metrics.original_planned_count, "text-slate-900"],
    ["DONE SIPAS PLANIT", metrics.planned_completed_today_count, "text-emerald-700"],
    ["NË PROGRES", metrics.in_progress_count, "text-amber-700"],
    ["SHTYRË", metrics.postponed_count, "text-violet-700"],
    ["PA PROGRES", metrics.no_progress_count, "text-rose-700"],
    ["EXTRA DONE", metrics.additional_completed_count, "text-blue-700"],
    ["PLAN REALIZATION", pct(metrics.raw_plan_realization), "text-slate-950"],
    ["ADJUSTED REALIZATION", pct(metrics.adjusted_plan_realization), "text-indigo-700"],
  ]
  return <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">{cards.map(([label, value, color]) => (
    <Card key={label} className="rounded-xl shadow-sm"><CardContent className="p-3">
      <p className="text-[10px] font-semibold tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-black", color)}>{value}</p>
    </CardContent></Card>
  ))}</div>
}

function DeadlineKpis({ metrics }: { metrics: DailyRealizationMetrics }) {
  return <div className="space-y-2"><div className="flex items-center gap-2 text-sm font-semibold text-slate-600"><CalendarDays className="h-4 w-4" /> Kontrolli i deadline-ve</div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
    {([
      ["DEADLINE SOT", metrics.deadlines_today_count], ["KRYER", metrics.deadlines_completed_count],
      ["SHTYRË", metrics.deadlines_postponed_count], ["ENDE HAPUR", metrics.deadlines_open_count],
      ["DEADLINE COMPLIANCE", pct(metrics.deadline_compliance_percentage)],
    ] as Array<[string, string | number]>).map(([label, value]) => <Card key={label} className="rounded-xl border-slate-200 shadow-sm"><CardContent className="p-3"><p className="text-[10px] font-semibold tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-slate-800">{value}</p></CardContent></Card>)}
  </div></div>
}

function Timeline({ task, open, onOpenChange, timezone }: { task: DailyRealizationTask | null; open: boolean; onOpenChange: (value: boolean) => void; timezone: string }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
    <DialogHeader><DialogTitle>Timeline · {task?.title}</DialogTitle></DialogHeader>
    <div className="space-y-0">{task?.timeline.map((event, index) => (
      <div key={event.id} className="relative flex gap-3 pb-5">
        {index < task.timeline.length - 1 ? <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200" /> : null}
        <span className="mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-slate-500 bg-white" />
        <div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{event.type.replaceAll("_", " ")}</strong>
          <span className="text-xs text-slate-500">{event.timestamp ? new Intl.DateTimeFormat("sq-AL", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(event.timestamp)) : "Plan"}</span></div>
          {(event.old_value != null || event.new_value != null) ? <p className="mt-1 text-sm text-slate-700">{String(event.old_value ?? "—")} → {String(event.new_value ?? "—")}</p> : null}
          {event.actor_name || event.actor_user_id ? <p className="text-xs text-slate-500">Actor: {event.actor_name || event.actor_user_id}</p> : null}
          {event.metadata?.reason ? <p className="text-xs text-slate-500">Arsye: {event.metadata.reason}</p> : null}
        </div>
      </div>
    ))}</div>
  </DialogContent></Dialog>
}

export function DailyRealizationView() {
  const { apiFetch, user } = useAuth()
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [departmentId, setDepartmentId] = React.useState(user?.department_id || "")
  const [day, setDay] = React.useState(today)
  const [data, setData] = React.useState<DailyRealizationLive | null>(null)
  const [personId, setPersonId] = React.useState("")
  const [classification, setClassification] = React.useState("ALL")
  const [source, setSource] = React.useState("ALL")
  const [exceptionsOnly, setExceptionsOnly] = React.useState(false)
  const [sort, setSort] = React.useState("lowest")
  const [loading, setLoading] = React.useState(false)
  const [timelineTask, setTimelineTask] = React.useState<DailyRealizationTask | null>(null)
  const [adjustmentTask, setAdjustmentTask] = React.useState<DailyRealizationTask | null>(null)
  const [adjustmentDecision, setAdjustmentDecision] = React.useState<"APPROVED" | "REJECTED">("APPROVED")
  const [adjustmentReason, setAdjustmentReason] = React.useState("")
  const [savingAdjustment, setSavingAdjustment] = React.useState(false)
  const request = React.useRef(0)

  React.useEffect(() => { void apiFetch("/departments").then(async response => {
    if (!response.ok) return
    const rows = await response.json() as Department[]
    setDepartments(rows)
    setDepartmentId(current => current || rows[0]?.id || "")
  }) }, [apiFetch])

  const load = React.useCallback(async (silent = false) => {
    if (!departmentId) return
    const id = ++request.current
    if (!silent) setLoading(true)
    try {
      const params = new URLSearchParams({ department_id: departmentId, day })
      if (user?.role === "STAFF") params.set("user_id", user.id)
      const response = await apiFetch(`/realization/daily?${params}`)
      if (!response.ok) return
      const payload = await response.json() as { live?: DailyRealizationLive }
      if (id !== request.current || !payload.live) return
      setData(payload.live)
      setPersonId(current => payload.live!.people.some(person => person.user_id === current)
        ? current
        : user?.role === "STAFF" ? payload.live!.people[0]?.user_id || "" : "")
    } finally { if (!silent && id === request.current) setLoading(false) }
  }, [apiFetch, day, departmentId, user])

  React.useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])
  React.useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") void load(true) }
    const interval = window.setInterval(tick, 12000)
    document.addEventListener("visibilitychange", tick)
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", tick) }
  }, [load])

  const people = React.useMemo(() => [...(data?.people || [])].sort((a, b) => {
    if (sort === "postponed") return b.metrics.postponed_count - a.metrics.postponed_count
    if (sort === "no-progress") return b.metrics.no_progress_count - a.metrics.no_progress_count
    if (sort === "name") return a.user_name.localeCompare(b.user_name)
    return (a.metrics.raw_plan_realization ?? -1) - (b.metrics.raw_plan_realization ?? -1)
  }), [data, sort])
  const selected = people.find(person => person.user_id === personId)
  const tasks = (selected?.tasks || []).filter(task =>
    (classification === "ALL" || task.classification === classification) &&
    (source === "ALL" || task.source_type === source) &&
    (!exceptionsOnly || task.issues.length > 0 || ["NO_PROGRESS", "REOPENED", "REASSIGNED_OUT", "REASSIGNED_IN", "POSTPONED_UNAPPROVED", "POSTPONED_APPROVED"].includes(task.classification))
  )
  const classifications = Array.from(new Set((data?.people || []).flatMap(person => person.tasks.map(task => task.classification)))).sort()

  const decideAdjustment = async () => {
    if (!adjustmentTask || !selected || !adjustmentReason.trim()) return
    const dueEvent = [...adjustmentTask.timeline].reverse().find(event => event.type === "POSTPONED" || event.type === "POSTPONED_AGAIN")
    if (!dueEvent) return
    setSavingAdjustment(true)
    try {
      const response = await apiFetch(`/realization/daily/tasks/${adjustmentTask.task_id}/adjustment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audit_event_id: dueEvent.id,
          user_id: selected.user_id,
          status: adjustmentDecision,
          reason: adjustmentReason.trim(),
        }),
      })
      if (response.ok) {
        setAdjustmentTask(null)
        setAdjustmentReason("")
        await load(true)
      }
    } finally {
      setSavingAdjustment(false)
    }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4"><div>
      <div className="flex items-center gap-2"><h1 className="text-2xl font-semibold">REALIZIMI DITOR</h1>{data?.live ? <Badge className="bg-emerald-600">LIVE</Badge> : <Badge variant="secondary">HISTORIK</Badge>}</div>
      <p className="mt-1 text-sm text-slate-500">{new Intl.DateTimeFormat("sq-AL", { dateStyle: "full", timeZone: data?.timezone }).format(new Date(`${day}T12:00:00`))}</p>
      <p className="mt-1 text-xs text-slate-400">Përditësuar {data ? new Intl.DateTimeFormat("sq-AL", { timeZone: data.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(data.last_updated)) : "—"}</p>
    </div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Rifresko</Button></div>

    {!data?.baseline_available ? <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4" /> Nuk ekziston baseline historik; PrimeFlow nuk fabrikon plan nga gjendja aktuale.</div> : null}
    <Card><CardContent className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-6">
      <div><Label>Departamenti</Label><Select value={departmentId} onValueChange={setDepartmentId} disabled={user?.role === "STAFF"}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{departments.map(row => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Data</Label><Input type="date" value={day} onChange={event => setDay(event.target.value)} /></div>
      <div><Label>Personi</Label><Select value={personId || "ALL"} onValueChange={value => setPersonId(value === "ALL" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Të gjithë</SelectItem>{people.map(person => <SelectItem key={person.user_id} value={person.user_id}>{person.user_name}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Klasifikimi</Label><Select value={classification} onValueChange={setClassification}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Të gjitha</SelectItem>{classifications.map(value => <SelectItem key={value} value={value}>{outcomeLabel[value] || value}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Burimi</Label><Select value={source} onValueChange={setSource}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Të gjitha</SelectItem><SelectItem value="project">Projekt</SelectItem><SelectItem value="fast">Fast</SelectItem><SelectItem value="system">Sistem</SelectItem></SelectContent></Select></div>
      <label className="flex items-center gap-2 self-end pb-2 text-sm"><Checkbox checked={exceptionsOnly} onCheckedChange={value => setExceptionsOnly(Boolean(value))} /> Vetëm përjashtimet</label>
    </CardContent></Card>

    {data ? <><Kpis metrics={selected?.metrics || data.metrics} /><DeadlineKpis metrics={selected?.metrics || data.metrics} /><div className={cn("w-fit rounded-full px-3 py-1 text-xs font-semibold", (selected?.metrics || data.metrics).daily_control_state === "ACTION_REQUIRED" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")}>{(selected?.metrics || data.metrics).daily_control_state === "ACTION_REQUIRED" ? "ACTION REQUIRED" : "CLEAN DAY"}</div></> : null}

    {user?.role !== "STAFF" && !personId ? <Card><CardHeader className="flex-row items-center justify-between"><CardTitle>Stafi</CardTitle><Select value={sort} onValueChange={setSort}><SelectTrigger className="w-52"><ArrowDownUp className="h-4 w-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="lowest">Realizimi më i ulët</SelectItem><SelectItem value="postponed">Më shumë shtyrje</SelectItem><SelectItem value="no-progress">Më shumë pa progres</SelectItem><SelectItem value="name">Emri</SelectItem></SelectContent></Select></CardHeader><CardContent><Table><TableHeader><TableRow>{["Employee","Plan","Done","Progress","Postponed","No progress","Extra","Raw %","Adjusted %"].map(value => <TableHead key={value}>{value}</TableHead>)}</TableRow></TableHeader><TableBody>{people.map(person => <TableRow key={person.user_id} className="cursor-pointer" onClick={() => setPersonId(person.user_id)}><TableCell className="font-medium">{person.user_name}<Badge variant="outline" className="ml-2 text-[10px]">{person.close_state}</Badge></TableCell><TableCell>{person.metrics.original_planned_count}</TableCell><TableCell>{person.metrics.planned_completed_today_count}</TableCell><TableCell>{person.metrics.in_progress_count}</TableCell><TableCell>{person.metrics.postponed_count}</TableCell><TableCell>{person.metrics.no_progress_count}</TableCell><TableCell>{person.metrics.additional_completed_count}</TableCell><TableCell>{pct(person.metrics.raw_plan_realization)}</TableCell><TableCell>{pct(person.metrics.adjusted_plan_realization)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card> : null}

    {selected ? <Card><CardHeader><CardTitle className="flex flex-wrap items-center gap-3">{selected.user_name}<span className="text-sm font-normal text-slate-500">Plan {selected.metrics.original_planned_count} · Done {selected.metrics.planned_completed_today_count} · Progress {selected.metrics.in_progress_count} · Postponed {selected.metrics.postponed_count} · Extra {selected.metrics.additional_completed_count}</span><Badge variant="outline">Total completed {selected.metrics.total_completed_today_count}</Badge></CardTitle></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow>{["Task","Project/source","Original daily plan","Current due date","Current status","Daily outcome","Progress today","Reason","Last change","Timeline"].map(value => <TableHead key={value}>{value}</TableHead>)}</TableRow></TableHeader><TableBody>{tasks.map(task => <TableRow key={task.match_key}><TableCell className="min-w-56 font-medium">{task.title}{task.postponement_count > 1 ? <p className="text-xs text-violet-600">Shtyrë {task.postponement_count} herë</p> : null}{task.issues.map(issue => <Badge key={issue} variant="destructive" className="mr-1 mt-1 text-[10px]">{issue}</Badge>)}</TableCell><TableCell>{task.project_title || task.source_type}</TableCell><TableCell>{task.original_daily_plan || "Extra"}</TableCell><TableCell>{task.current_due_date || "—"}</TableCell><TableCell>{task.current_status}</TableCell><TableCell><Badge variant="outline" className={outcomeStyle[task.classification]}>{outcomeLabel[task.classification] || task.classification}</Badge>{task.adjustment_status === "PENDING" && user?.role !== "STAFF" ? <Button size="sm" variant="outline" className="mt-1" onClick={() => setAdjustmentTask(task)}>Vendos</Button> : null}</TableCell><TableCell>{task.progress_today ? `+${task.progress_today}%` : task.completed_delta ? `+${task.completed_delta}` : "—"}</TableCell><TableCell>{task.reason_code || "—"}{task.comment ? <p className="max-w-40 truncate text-xs text-slate-500">{task.comment}</p> : null}</TableCell><TableCell>{task.last_change ? new Intl.DateTimeFormat("sq-AL", { timeZone: data?.timezone || DEFAULT_REALIZATION_TIMEZONE, hour: "2-digit", minute: "2-digit" }).format(new Date(task.last_change)) : "—"}</TableCell><TableCell><Button size="sm" variant="ghost" onClick={() => setTimelineTask(task)}><History className="h-4 w-4" /> Hape</Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card> : null}
    {!selected && data ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500"><CalendarDays className="mx-auto mb-2 h-6 w-6" /> Nuk ka punë të planifikuar ose aktivitet për këtë ditë.</div> : null}
    <Timeline task={timelineTask} open={Boolean(timelineTask)} onOpenChange={open => { if (!open) setTimelineTask(null) }} timezone={data?.timezone || DEFAULT_REALIZATION_TIMEZONE} />
    <Dialog open={Boolean(adjustmentTask)} onOpenChange={open => { if (!open) setAdjustmentTask(null) }}><DialogContent>
      <DialogHeader><DialogTitle>Vendimi për ndryshimin e planit</DialogTitle></DialogHeader>
      <div className="space-y-3"><p className="text-sm text-slate-600">{adjustmentTask?.title}</p>
        <Select value={adjustmentDecision} onValueChange={value => setAdjustmentDecision(value as "APPROVED" | "REJECTED")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="APPROVED">Aprovo</SelectItem><SelectItem value="REJECTED">Refuzo</SelectItem></SelectContent></Select>
        <div><Label>Arsyeja</Label><Input value={adjustmentReason} onChange={event => setAdjustmentReason(event.target.value)} placeholder="Arsyeja e vendimit" /></div>
        <Button onClick={() => void decideAdjustment()} disabled={!adjustmentReason.trim() || savingAdjustment}>{savingAdjustment ? "Duke ruajtur…" : "Ruaj vendimin"}</Button>
      </div>
    </DialogContent></Dialog>
  </div>
}
