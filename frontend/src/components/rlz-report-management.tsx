"use client"

import * as React from "react"
import { RefreshCw, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/lib/auth"

const API = "/admin/primeflow-1h-reports"
const WEEKDAYS = ["Hën", "Mar", "Mër", "Enj", "Pre", "Sht", "Die"]

type Schedule = {
  id: string
  name: string
  report_type: string
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
        body: JSON.stringify({ report_date: date, use_default_recipients: true, to: [], cc: [], bcc: [] }),
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
        body: JSON.stringify({ report_date: date, use_default_recipients: true, to: [], cc: [], bcc: [], reason }),
      })
      if (response.ok) {
        toast.success("RLZ Daily Control sent")
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
    <div className="space-y-5 rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">RLZ Daily Control</h2>
          <p className="text-sm text-muted-foreground">
            Raporti dërgohet automatikisht në orën dhe ditët e zgjedhura. Parazgjedhja: 16:00, Hënë–Premte.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw />Refresh</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">Preview / manual send</h3>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <Button variant="outline" onClick={() => void previewNow()} disabled={busy}>Preview fresh</Button>
          {preview ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(preview.report.summary).map(([key, value]) => (
                  <div key={key}>{key.replaceAll("_", " ")}: <b>{value}</b></div>
                ))}
              </div>
              <iframe title="RLZ email preview" srcDoc={preview.html} className="h-[520px] w-full rounded border bg-white" />
              <Input placeholder="Reason for manual send" value={reason} onChange={(event) => setReason(event.target.value)} />
              <Button onClick={() => void send()} disabled={busy || reason.trim().length < 3}><Send />Confirm and send</Button>
            </>
          ) : null}
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <div>
            <h3 className="font-medium">Recipients</h3>
            <p className="text-xs text-muted-foreground">Default: info@primexeu.com dhe 313primex.eu@gmail.com</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input className="min-w-[240px] flex-1" type="email" placeholder="email@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            <Select value={recipientType} onValueChange={(value) => setRecipientType(value as "TO" | "CC" | "BCC")}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>{["TO", "CC", "BCC"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={() => void addRecipient()} disabled={!email.trim()}>Add</Button>
          </div>
          <div className="space-y-2">
            {overview?.recipients.map((recipient) => (
              <div key={recipient.id} className="grid gap-2 rounded border p-2 sm:grid-cols-[1fr_90px_auto_auto] sm:items-center">
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
                  {recipient.is_active ? "Disable" : "Enable"}
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Remove ${recipient.email}`} onClick={() => void removeRecipient(recipient)}><Trash2 /></Button>
              </div>
            ))}
            {!overview?.recipients.length ? <p className="text-sm text-amber-700">No recipient configured.</p> : null}
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <h3 className="font-medium">Schedule</h3>
        {overview?.schedules.map((schedule) => (
          <div key={schedule.id} className="space-y-3 rounded border p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[220px] flex-1 font-medium">{schedule.name}</div>
              <Input
                aria-label="RLZ report time"
                type="time"
                defaultValue={schedule.execution_time}
                className="w-32"
                onBlur={(event) => {
                  if (event.currentTarget.value !== schedule.execution_time) {
                    void updateSchedule(schedule, { execution_time: event.currentTarget.value })
                  }
                }}
              />
              <span className="text-sm text-muted-foreground">{schedule.timezone}</span>
              <Button size="sm" variant={schedule.is_active ? "default" : "outline"} onClick={() => void updateSchedule(schedule, { is_active: !schedule.is_active })}>
                {schedule.is_active ? "Active" : "Inactive"}
              </Button>
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
              Next run: {schedule.next_runs?.[0]?.replace("T", " ").slice(0, 16) || "—"} · Version v{schedule.version}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader><TableRow>{["Date", "Trigger", "Status", "Subject", "Attempts", "Error"].map((label) => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {overview?.recent_runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell>{run.report_date}</TableCell><TableCell>{run.trigger_type}</TableCell>
                <TableCell>{run.status}</TableCell><TableCell>{run.subject}</TableCell>
                <TableCell>{run.attempt_count}</TableCell><TableCell>{run.error_message || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
