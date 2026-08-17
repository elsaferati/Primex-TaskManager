"use client"

import * as React from "react"
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Filter,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { RlzReportManagement } from "@/components/rlz-report-management"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

type Control = {
  day: string
  all_good: boolean
  summary: Record<string, number>
  people: Array<{
    user_id: string
    employee: string
    department: string
    rlz_close_state: { status: string }
    manager_approval: { status: string }
    blockers: Array<{
      task_id: string
      title: string
      status: string
      due_date?: string | null
      one_h_report_slot?: string | null
      reason_label?: string | null
      comment?: string | null
      issues: Array<{ code: string; message: string }>
    }>
  }>
}

type Person = Control["people"][number]
type Blocker = Person["blockers"][number]
type Row = { person: Person; blocker: Blocker | null }

const SUMMARY_CARDS = [
  { key: "employees_checked", label: "Punonjës", hint: "të kontrolluar", tone: "blue", icon: Users },
  { key: "employees_not_saved", label: "Pa mbyllur", hint: "ditën", tone: "rose", icon: AlertTriangle },
  { key: "employees_approval_pending", label: "Pa aprovim", hint: "nga menaxheri", tone: "amber", icon: ShieldCheck },
  { key: "employees_approval_stale", label: "Aprovim i vjetruar", hint: "duhet rishikuar", tone: "orange", icon: RefreshCw },
  { key: "tasks_missing_reason", label: "Pa arsye", hint: "detyra", tone: "rose", icon: AlertTriangle },
  { key: "tasks_deadline_not_moved", label: "Afat pa lëvizur", hint: "detyra", tone: "amber", icon: CalendarDays },
] as const

const TONE: Record<string, string> = {
  blue: "border-blue-200 bg-blue-50 text-blue-950",
  rose: "border-rose-200 bg-rose-50 text-rose-950",
  amber: "border-amber-200 bg-amber-50 text-amber-950",
  orange: "border-orange-200 bg-orange-50 text-orange-950",
}

function taskTitle(title?: string | null) {
  if (!title) return "—"
  return title.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || title
}

function statusBadge(status?: string | null) {
  const value = status || "—"
  const style = value === "APPROVED" || value === "SAVED" || value === "DONE"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : value === "IN_PROGRESS" || value === "STALE"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-rose-200 bg-rose-50 text-rose-800"
  return <Badge variant="outline" className={cn("font-semibold", style)}>{value}</Badge>
}

export default function RlzDailyControlPage() {
  const { apiFetch, user } = useAuth()
  const canManageReport = user?.role === "ADMIN" || user?.role === "MANAGER"
  const [day, setDay] = React.useState(new Date().toISOString().slice(0, 10))
  const [data, setData] = React.useState<Control | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [departmentFilter, setDepartmentFilter] = React.useState("")
  const [employeeFilter, setEmployeeFilter] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("")

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch(`/reports/daily-rlz-control?day=${day}`)
      if (!response.ok) throw new Error(await response.text())
      setData(await response.json())
    } catch (error) {
      toast.error("Kontrolli ditor RLZ nuk u ngarkua", { description: String(error) })
    } finally {
      setLoading(false)
    }
  }, [apiFetch, day])

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const visiblePeople = (data?.people || []).filter((person) =>
    person.department.toLowerCase().includes(departmentFilter.toLowerCase())
    && person.employee.toLowerCase().includes(employeeFilter.toLowerCase())
    && (!statusFilter
      || person.rlz_close_state.status.toLowerCase().includes(statusFilter.toLowerCase())
      || person.manager_approval.status.toLowerCase().includes(statusFilter.toLowerCase())
      || person.blockers.some((blocker) => blocker.issues.some((issue) =>
        issue.code.toLowerCase().includes(statusFilter.toLowerCase())
        || issue.message.toLowerCase().includes(statusFilter.toLowerCase())
      )))
  )

  const rows: Row[] = []
  for (const person of visiblePeople) {
    if (person.blockers.length) {
      for (const blocker of person.blockers) rows.push({ person, blocker })
    } else rows.push({ person, blocker: null })
  }

  const hasFilters = Boolean(departmentFilter || employeeFilter || statusFilter)

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 pb-10">
      <Card className="gap-0 overflow-hidden border-slate-200 py-0 shadow-sm">
        <CardHeader className="border-b border-slate-200 bg-slate-50/70 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-slate-900 p-2 text-white"><ShieldCheck className="h-5 w-5" /></div>
                <div>
                  <CardTitle className="text-xl">Kontrolli ditor RLZ</CardTitle>
                  <CardDescription className="mt-1">Kontrolli i mbylljes, arsyeve dhe aprovimit para raportit final.</CardDescription>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input aria-label="Data e raportit" type="date" value={day} onChange={(event) => setDay(event.target.value)} className="w-[180px] bg-white" />
              <Button onClick={() => void load()} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Rifresko
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 py-4 sm:px-6">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Filter className="h-4 w-4" /> Filtro rezultatet
          </div>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <Input placeholder="Departamenti" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} />
            <Input placeholder="Punonjësi" value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)} />
            <Input placeholder="Statusi ose problemi" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} />
            <Button
              variant="outline"
              disabled={!hasFilters}
              onClick={() => { setDepartmentFilter(""); setEmployeeFilter(""); setStatusFilter("") }}
            >
              Pastro filtrat
            </Button>
          </div>
        </CardContent>
      </Card>

      {data ? (
        <section aria-label="Përmbledhja e kontrollit" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {SUMMARY_CARDS.map(({ key, label, hint, tone, icon: Icon }) => (
            <div key={key} className={cn("rounded-xl border p-4", TONE[tone])}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-sm font-semibold">{label}</p><p className="text-xs opacity-70">{hint}</p></div>
                <Icon className="h-4 w-4 opacity-60" />
              </div>
              <p className="mt-4 text-3xl font-bold tabular-nums">{data.summary[key] || 0}</p>
            </div>
          ))}
        </section>
      ) : null}

      {data?.all_good ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-900">
          <CheckCircle2 className="h-5 w-5" /><span className="font-medium">Kontrolli ditor përfundoi pa probleme.</span>
        </div>
      ) : null}

      {canManageReport ? <RlzReportManagement /> : null}

      <Card className="gap-0 overflow-hidden border-slate-200 py-0 shadow-sm">
        <CardHeader className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Çështjet që kërkojnë veprim</CardTitle>
              <CardDescription className="mt-1">{rows.length} rreshta për {visiblePeople.length} punonjës sipas filtrave aktualë.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-800">Pa mbyllur: {data?.summary.employees_not_saved || 0}</Badge>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Pa aprovim: {data?.summary.employees_approval_pending || 0}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table containerClassName="max-h-[68vh]">
            <TableHeader className="sticky top-0 z-20 bg-slate-100 [&_th]:border-b [&_th]:border-slate-200 [&_th]:bg-slate-100 [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-slate-600">
              <TableRow>
                {[
                  "Departamenti", "Punonjësi", "Detyra", "Statusi", "Afati", "1H", "Arsyeja", "Komenti", "Mbyllja", "Aprovimi", "Problemi",
                ].map((label) => <TableHead key={label}>{label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ person, blocker }, index) => (
                <TableRow key={`${person.user_id}:${blocker?.task_id || index}`} className="align-top">
                  <TableCell className="font-medium text-slate-700">{person.department}</TableCell>
                  <TableCell className="font-semibold text-slate-900">{person.employee}</TableCell>
                  <TableCell className="min-w-[300px] max-w-[440px] whitespace-normal leading-5">{taskTitle(blocker?.title)}</TableCell>
                  <TableCell>{statusBadge(blocker?.status)}</TableCell>
                  <TableCell className="tabular-nums">{blocker?.due_date || "—"}</TableCell>
                  <TableCell>{blocker?.one_h_report_slot || "—"}</TableCell>
                  <TableCell className="min-w-[150px] whitespace-normal">{blocker?.reason_label || "—"}</TableCell>
                  <TableCell className="min-w-[220px] max-w-[320px] whitespace-normal text-slate-600">{blocker?.comment || "—"}</TableCell>
                  <TableCell>{statusBadge(person.rlz_close_state.status)}</TableCell>
                  <TableCell>{statusBadge(person.manager_approval.status)}</TableCell>
                  <TableCell className="min-w-[220px] whitespace-normal text-rose-700">
                    {blocker?.issues.map((issue) => issue.message).join(" · ") || person.manager_approval.status}
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow><TableCell colSpan={11} className="h-32 text-center text-slate-500">Nuk ka rezultate për filtrat e zgjedhur.</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
