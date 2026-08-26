"use client"

import * as React from "react"
import { useAuth } from "@/lib/auth"
import type { Department } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type MonthlyPerson = { user_id: string; user_name: string; aggregation: Record<string, unknown> }
const monthStart = () => `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tirane" }).format(new Date()).slice(0, 7)}-01`

export function MonthlyRealizationView() {
  const { apiFetch, user } = useAuth()
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [departmentId, setDepartmentId] = React.useState(user?.department_id || "")
  const [month, setMonth] = React.useState(monthStart)
  const [people, setPeople] = React.useState<MonthlyPerson[]>([])

  React.useEffect(() => { void apiFetch("/departments").then(async response => {
    if (!response.ok) return
    const rows = await response.json() as Department[]
    setDepartments(rows)
    setDepartmentId(current => current || rows[0]?.id || "")
  }) }, [apiFetch])
  React.useEffect(() => { if (!departmentId) return; void apiFetch(`/realization/monthly?${new URLSearchParams({ department_id: departmentId, month_start: month })}`).then(async response => {
    if (response.ok) setPeople(((await response.json()) as { people: MonthlyPerson[] }).people)
  }) }, [apiFetch, departmentId, month])

  return <div className="space-y-4"><div><h1 className="text-2xl font-semibold">REALIZIMI MUJOR</h1><p className="mt-1 text-sm text-slate-500">Agregimi ekzistues i pulseve ditore dhe rezultateve të muajit.</p></div>
    <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2"><div><Label>Departamenti</Label><Select value={departmentId} onValueChange={setDepartmentId} disabled={user?.role === "STAFF"}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{departments.map(row => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Muaji</Label><Input type="month" value={month.slice(0, 7)} onChange={event => setMonth(`${event.target.value}-01`)} /></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Përmbledhja mujore</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Pulse aktual</TableHead><TableHead>Ditë me të dhëna</TableHead><TableHead>Detaje</TableHead></TableRow></TableHeader><TableBody>{people.map(person => <TableRow key={person.user_id}><TableCell className="font-medium">{person.user_name}</TableCell><TableCell>{String(person.aggregation.current_pulse ?? "N/A")}</TableCell><TableCell>{String(person.aggregation.days_with_data ?? person.aggregation.days_count ?? "—")}</TableCell><TableCell className="max-w-xl truncate text-xs text-slate-500">{JSON.stringify(person.aggregation)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
  </div>
}
