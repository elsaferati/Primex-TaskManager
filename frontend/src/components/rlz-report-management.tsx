"use client"

import * as React from "react"
import { CalendarClock, Eye, History, Mail, RefreshCw, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/lib/auth"

const API = "/admin/primeflow-1h-reports"
const WEEKDAYS = ["Hën", "Mar", "Mër", "Enj", "Pre", "Sht", "Die"]

type Schedule = {
  id: string
  name: string
  report_type: string
  report_variant: "PRECHECK" | "FINAL" | "CORRECTION"
  report_slot: string | null
  execution_time: string
  timezone: string
  weekdays: number[]
  is_active: boolean
  backfill_enabled: boolean
  grace_period_minutes: number
  retry_count: number
  retry_delays_seconds: number[]
  sort_order: number
  version: number
  next_runs: string[]
}

type Recipient = {
  id: string
  email: string
  recipient_type: "TO" | "CC" | "BCC"
  is_active: boolean
  is_default?: boolean
}

type Run = {
  id: string
  report_date: string
  trigger_type: string
  status: string
  subject: string
  attempt_count: number
  error_message?: string | null
}

type Overview = { schedules: Schedule[]; recipients: Recipient[]; recent_runs: Run[] }

function schedulePayload(schedule: Schedule, changes: Partial<Schedule> = {}) {
  const next = { ...schedule, ...changes }
  return {
    name: next.name,
    report_type: next.report_type,
    report_variant: next.report_variant,
    report_slot: null,
    execution_time: next.execution_time,
    timezone: next.timezone,
    weekdays: next.weekdays,
    is_active: next.is_active,
    backfill_enabled: false,
    predecessor_schedule_id: null,
    grace_period_minutes: next.grace_period_minutes,
    retry_count: next.retry_count,
    retry_delays_seconds: next.retry_delays_seconds,
    sort_order: next.sort_order,
  }
}

export function RlzReportManagement() {
  const { apiFetch } = useAuth()
  const [overview, setOverview] = React.useState<Overview | null>(null)
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10))
  const [preview, setPreview] = React.useState<{ html: string; report: { summary: Record<string, number> } } | null>(null)
  const [reason, setReason] = React.useState("")
  const [variant, setVariant] = React.useState<"PRECHECK" | "FINAL" | "CORRECTION">("FINAL")
  const [email, setEmail] = React.useState("")
  const [recipientType, setRecipientType] = React.useState<"TO" | "CC" | "BCC">("TO")
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const response = await apiFetch(`${API}/rlz/overview`)
    if (response.ok) setOverview(await response.json())
    else toast.error("RLZ report management could not be loaded")
  }, [apiFetch])

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const previewNow = async () => {
    setBusy(true)
    try {
      const response = await apiFetch(`${API}/rlz/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_date: date, report_variant: variant, use_default_recipients: true, to: [], cc: [], bcc: [] }),
      })
      if (response.ok) setPreview(await response.json())
      else toast.error("Preview failed", { description: await response.text() })
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    setBusy(true)
    try {
      const response = await apiFetch(`${API}/rlz/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_date: date, report_variant: variant, use_default_recipients: true, to: [], cc: [], bcc: [], reason }),
      })
      if (response.ok) {
        const result = await response.json() as { status?: string }
        toast.success(
          result.status === "SKIPPED_NO_CHANGES"
            ? "Nuk ka ndryshime materiale; email-i nuk u dërgua"
            : "RLZ Daily Control sent",
        )
        setReason("")
        await load()
      } else toast.error("Send failed", { description: await response.text() })
    } finally {
      setBusy(false)
    }
  }

  const addRecipient = async () => {
    const response = await apiFetch(`${API}/recipients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        report_type: "RLZ_DAILY_CONTROL",
        recipient_type: recipientType,
        is_active: true,
        sort_order: (overview?.recipients.length || 0) * 10 + 10,
      }),
    })
    if (response.ok) {
      setEmail("")
      await load()
    } else toast.error("Recipient could not be added", { description: await response.text() })
  }

  const updateRecipient = async (recipient: Recipient, changes: Partial<Recipient>) => {
    const response = await apiFetch(`${API}/recipients/${recipient.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    })
    if (response.ok) await load()
    else toast.error("Recipient update failed", { description: await response.text() })
  }

  const removeRecipient = async (recipient: Recipient) => {
    if (!window.confirm(`Remove ${recipient.email}?`)) return
    const response = await apiFetch(`${API}/recipients/${recipient.id}`, { method: "DELETE" })
    if (response.ok) await load()
    else toast.error("Recipient removal failed", { description: await response.text() })
  }

  const updateSchedule = async (schedule: Schedule, changes: Partial<Schedule>) => {
    const response = await apiFetch(`${API}/schedules/${schedule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schedulePayload(schedule, changes)),
    })
    if (response.ok) {
      toast.success("Schedule saved; hot reload within 45 seconds")
      await load()
    } else toast.error("Schedule update failed", { description: await response.text() })
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-5 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Menaxhimi i raportit automatik</h2>
          <p className="mt-1 text-sm text-slate-500">
            Kontrollo preview-n, marrësit, oraret dhe historinë e dërgesave në një vend.
          </p>
        </div>
        <Button variant="outline" className="bg-white" onClick={() => void load()}><RefreshCw />Rifresko</Button>
      </div>

      <Tabs defaultValue="compose" className="gap-0">
        <div className="border-b border-slate-200 px-5 py-3 sm:px-6">
          <TabsList className="grid h-auto w-full grid-cols-3 sm:w-fit sm:min-w-[520px]">
            <TabsTrigger value="compose"><Eye /> Preview & marrësit</TabsTrigger>
            <TabsTrigger value="schedule"><CalendarClock /> Oraret</TabsTrigger>
            <TabsTrigger value="history"><History /> Historia</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="compose" className="m-0 p-5 sm:p-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
          <div className="flex items-center gap-2"><Eye className="h-4 w-4 text-slate-500" /><h3 className="font-semibold">Preview dhe dërgim manual</h3></div>
          <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto]">
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="bg-white" />
          <Select value={variant} onValueChange={(value) => setVariant(value as typeof variant)}>
            <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PRECHECK">16:10 · Kontrolli i mangësive</SelectItem>
              <SelectItem value="FINAL">16:30 · Raporti final</SelectItem>
              <SelectItem value="CORRECTION">17:05 · Korrigjimet</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="bg-white" onClick={() => void previewNow()} disabled={busy}><RefreshCw />Gjenero preview</Button>
          </div>
          {preview ? (
            <>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs sm:grid-cols-3">
                {Object.entries(preview.report.summary).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1"><span className="text-slate-500">{key.replaceAll("_", " ")}</span><b>{value}</b></div>
                ))}
              </div>
              <iframe title="RLZ email preview" srcDoc={preview.html} className="h-[620px] w-full rounded-lg border border-slate-200 bg-white shadow-inner" />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input className="bg-white" placeholder="Arsyeja për dërgimin manual" value={reason} onChange={(event) => setReason(event.target.value)} />
                <Button onClick={() => void send()} disabled={busy || reason.trim().length < 3}><Send />Konfirmo dhe dërgo</Button>
              </div>
            </>
          ) : null}
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 p-4">
          <div>
            <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-500" /><h3 className="font-semibold">Marrësit e raportit</h3></div>
            <p className="mt-1 text-xs text-muted-foreground">Menaxho adresat TO, CC dhe BCC për të tre raportet.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input className="min-w-[240px] flex-1" type="email" placeholder="email@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            <Select value={recipientType} onValueChange={(value) => setRecipientType(value as "TO" | "CC" | "BCC")}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>{["TO", "CC", "BCC"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={() => void addRecipient()} disabled={!email.trim()}>Shto</Button>
          </div>
          <div className="space-y-2">
            {overview?.recipients.map((recipient) => (
              <div key={recipient.id} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2 sm:grid-cols-[1fr_90px_auto_auto] sm:items-center">
                <Input
                  type="email"
                  defaultValue={recipient.email}
                  onBlur={(event) => {
                    const value = event.currentTarget.value.trim()
                    if (value && value !== recipient.email) void updateRecipient(recipient, { email: value })
                  }}
                />
                <Select value={recipient.recipient_type} onValueChange={(value) => void updateRecipient(recipient, { recipient_type: value as Recipient["recipient_type"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["TO", "CC", "BCC"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => void updateRecipient(recipient, { is_active: !recipient.is_active })}>
                  {recipient.is_active ? "Çaktivizo" : "Aktivizo"}
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Remove ${recipient.email}`} onClick={() => void removeRecipient(recipient)}><Trash2 /></Button>
              </div>
            ))}
            {!overview?.recipients.length ? <p className="text-sm text-amber-700">No recipient configured.</p> : null}
          </div>
        </div>
      </div>
        </TabsContent>

        <TabsContent value="schedule" className="m-0 p-5 sm:p-6">
      <div>
        <div className="mb-4">
          <h3 className="font-semibold text-slate-950">Oraret automatike</h3>
          <p className="mt-1 text-sm text-slate-500">Ndryshimet aktivizohen automatikisht brenda rreth 45 sekondave.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
        {overview?.schedules.map((schedule) => (
          <div key={schedule.id} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Badge variant="outline" className="mb-2 bg-white">{schedule.report_variant}</Badge>
                <div className="font-semibold text-slate-950">{schedule.name}</div>
                <p className="mt-1 text-xs text-slate-500">{schedule.timezone}</p>
              </div>
              <Button size="sm" variant={schedule.is_active ? "default" : "outline"} onClick={() => void updateSchedule(schedule, { is_active: !schedule.is_active })}>
                {schedule.is_active ? "Aktiv" : "Joaktiv"}
              </Button>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
              <CalendarClock className="h-5 w-5 text-slate-400" />
              <div className="flex-1"><p className="text-xs text-slate-500">Ora e dërgimit</p><p className="text-sm font-medium">Hënë–Premte</p></div>
              <Input
                aria-label="RLZ report time"
                type="time"
                defaultValue={schedule.execution_time}
                className="w-28"
                onBlur={(event) => {
                  if (event.currentTarget.value !== schedule.execution_time) {
                    void updateSchedule(schedule, { execution_time: event.currentTarget.value })
                  }
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((label, day) => {
                const selected = schedule.weekdays.includes(day)
                return (
                  <Button
                    key={label}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    className="h-8 min-w-9 px-2"
                    onClick={() => {
                      const weekdays = selected
                        ? schedule.weekdays.filter((value) => value !== day)
                        : [...schedule.weekdays, day].sort()
                      if (weekdays.length) void updateSchedule(schedule, { weekdays })
                      else toast.error("Select at least one day")
                    }}
                  >
                    {label}
                  </Button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Dërgimi i ardhshëm: <strong className="text-slate-700">{schedule.next_runs?.[0]?.replace("T", " ").slice(0, 16) || "—"}</strong>
            </p>
          </div>
        ))}
        </div>
      </div>
        </TabsContent>

        <TabsContent value="history" className="m-0 p-5 sm:p-6">
      <div className="mb-4">
        <h3 className="font-semibold text-slate-950">Historia e dërgesave</h3>
        <p className="mt-1 text-sm text-slate-500">Dërgesat automatike dhe manuale, së bashku me rezultatin e tyre.</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <Table containerClassName="max-h-[56vh]">
          <TableHeader className="sticky top-0 z-10 bg-slate-100 [&_th]:bg-slate-100"><TableRow>{["Data", "Nisja", "Statusi", "Subjekti", "Tentativa", "Gabimi"].map((label) => <TableHead key={label} className="text-xs font-bold uppercase tracking-wide text-slate-600">{label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {overview?.recent_runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell>{run.report_date}</TableCell><TableCell>{run.trigger_type}</TableCell>
                <TableCell><Badge variant="outline" className={run.status === "SENT" || run.status === "ALREADY_SENT" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : run.status === "FAILED_EMAIL" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-slate-50"}>{run.status}</Badge></TableCell><TableCell className="min-w-[360px] whitespace-normal">{run.subject}</TableCell>
                <TableCell>{run.attempt_count}</TableCell><TableCell>{run.error_message || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}
