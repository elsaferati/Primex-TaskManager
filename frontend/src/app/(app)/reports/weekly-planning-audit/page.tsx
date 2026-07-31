"use client"

import * as React from "react"
import { Download, FileSpreadsheet, Mail, RefreshCw, Search, Send, Settings2, Upload } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/lib/auth"

const SLOTS = ["09:00", "09:30", "10:00", "10:30", "11:00"]

type Settings = {
  id: string
  enabled: boolean
  timezone: string
  recipients_to: string[]
  recipients_cc: string[]
  recipients_bcc: string[]
  schedule_config: { weekday?: string; slots?: string[] }
  recipient_config_version: number
  abbreviation_version: string
  retention_days: number
  updated_at: string
}

type PersonAudit = {
  user_id: string
  employee: string
  department: string
  leave_status: string
  focus: string
  focus_source: string
  task_count: number
  error_count: number
  critical_count: number
  high_count: number
  assessment: string
  required_action: string
}

type AuditError = {
  employee: string
  department: string
  task_id: string | null
  task_date: string | null
  current_title: string
  problem: string
  proposed_title: string
  correction: string
  rule_code: string
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
  weekly_focus: string
  source: string
}

type Preview = {
  week_start: string
  week_end: string
  generated_at: string
  timezone: string
  slot: string
  people: PersonAudit[]
  errors: AuditError[]
  title_cleanup: unknown[]
  excluded_full_leave: string[]
  partial_leave_users: string[]
  abbreviation_version: string
}

type Run = {
  id: string
  week_start: string
  week_end: string
  slot: string
  generated_at: string | null
  trigger_type: string
  status: string
  included_user_count: number
  excluded_leave_count: number
  error_count: number
  critical_count: number
  high_count: number
  filename: string | null
  recipients_snapshot: Record<string, string[]>
  message_id: string | null
  attempt_count: number
  error_message: string | null
  created_at: string
  download_url: string | null
}

function nextMonday(): string {
  const value = new Date()
  const day = value.getDay()
  const offset = day === 1 ? 7 : (8 - day) % 7
  value.setDate(value.getDate() + offset)
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-")
}

function statusClass(value: string) {
  if (value === "SENT") return "bg-emerald-100 text-emerald-800"
  if (value === "FAILED") return "bg-red-100 text-red-800"
  if (value === "SENDING") return "bg-amber-100 text-amber-800"
  return "bg-slate-100 text-slate-700"
}

function severityClass(value: string) {
  if (value === "CRITICAL") return "bg-red-700 text-white"
  if (value === "HIGH") return "bg-orange-200 text-orange-900"
  if (value === "MEDIUM") return "bg-yellow-100 text-yellow-900"
  return "bg-blue-50 text-blue-800"
}

export default function WeeklyPlanningAuditPage() {
  const { apiFetch, user } = useAuth()
  const [settings, setSettings] = React.useState<Settings | null>(null)
  const [history, setHistory] = React.useState<Run[]>([])
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [weekStart, setWeekStart] = React.useState(nextMonday)
  const [slot, setSlot] = React.useState("09:00")
  const [loading, setLoading] = React.useState(false)
  const [recipientsTo, setRecipientsTo] = React.useState("")
  const [recipientsCc, setRecipientsCc] = React.useState("")
  const [recipientsBcc, setRecipientsBcc] = React.useState("")
  const [timezone, setTimezone] = React.useState("Europe/Tirane")
  const [retentionDays, setRetentionDays] = React.useState("90")
  const [enabled, setEnabled] = React.useState(true)
  const fileInput = React.useRef<HTMLInputElement>(null)

  const readError = async (response: Response) => {
    try {
      const payload = (await response.json()) as { detail?: string }
      return payload.detail || `HTTP ${response.status}`
    } catch {
      return `HTTP ${response.status}`
    }
  }

  const load = React.useCallback(async () => {
    const [settingsResponse, historyResponse] = await Promise.all([
      apiFetch("/reports/weekly-planning-audit/settings"),
      apiFetch("/reports/weekly-planning-audit/history?limit=100"),
    ])
    if (settingsResponse.ok) {
      const value = (await settingsResponse.json()) as Settings
      setSettings(value)
      setRecipientsTo(value.recipients_to.join(", "))
      setRecipientsCc(value.recipients_cc.join(", "))
      setRecipientsBcc(value.recipients_bcc.join(", "))
      setTimezone(value.timezone)
      setRetentionDays(String(value.retention_days))
      setEnabled(value.enabled)
    }
    if (historyResponse.ok) {
      const value = (await historyResponse.json()) as { items: Run[] }
      setHistory(value.items)
    }
  }, [apiFetch])

  React.useEffect(() => {
    if (user && (user.role === "ADMIN" || user.role === "MANAGER")) void load()
  }, [load, user])

  const previewReport = async () => {
    setLoading(true)
    try {
      const query = new URLSearchParams({ week_start: weekStart, slot })
      const response = await apiFetch(`/reports/weekly-planning-audit/preview?${query}`)
      if (!response.ok) throw new Error(await readError(response))
      setPreview((await response.json()) as Preview)
      toast.success("Preview generated from the current PrimeFlow state.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preview failed")
    } finally {
      setLoading(false)
    }
  }

  const runAction = async (mode: "generate" | "generate-and-send") => {
    if (mode === "generate-and-send" && !window.confirm(
      `Generate a fresh ${slot} report and email it to the configured recipients?`
    )) return
    setLoading(true)
    try {
      const response = await apiFetch(`/reports/weekly-planning-audit/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: weekStart, slot }),
      })
      if (!response.ok) throw new Error(await readError(response))
      const run = (await response.json()) as Run
      toast.success(mode === "generate" ? "Excel generated." : `Email status: ${run.status}`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Report action failed")
      await load()
    } finally {
      setLoading(false)
    }
  }

  const downloadRun = async (run: Run) => {
    const response = await apiFetch(`/reports/weekly-planning-audit/${run.id}/download`)
    if (!response.ok) {
      toast.error(await readError(response))
      return
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = run.filename || "Raporti_PF_PLNF_JAV.xlsx"
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const resend = async (run: Run) => {
    if (!window.confirm(`Resend ${run.filename || "this report"} to its saved recipients?`)) return
    setLoading(true)
    try {
      const response = await apiFetch(`/reports/weekly-planning-audit/${run.id}/resend`, { method: "POST" })
      if (!response.ok) throw new Error(await readError(response))
      toast.success("Explicit resend completed.")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Resend failed")
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    const split = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean)
    const response = await apiFetch("/reports/weekly-planning-audit/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled,
        timezone,
        recipients_to: split(recipientsTo),
        recipients_cc: split(recipientsCc),
        recipients_bcc: split(recipientsBcc),
        retention_days: Number(retentionDays),
      }),
    })
    if (!response.ok) {
      toast.error(await readError(response))
      return
    }
    toast.success("Report settings saved.")
    await load()
  }

  const importAbbreviations = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    const form = new FormData()
    form.append("file", file)
    const response = await apiFetch("/reports/weekly-planning-audit/abbreviations/import", {
      method: "POST",
      body: form,
    })
    if (!response.ok) {
      toast.error(await readError(response))
      return
    }
    const result = (await response.json()) as { version: string; entry_count: number }
    toast.success(`Imported ${result.entry_count} abbreviations as ${result.version}.`)
    await load()
  }

  if (!user || !["ADMIN", "MANAGER"].includes(user.role)) {
    return <div className="text-sm text-muted-foreground">Forbidden.</div>
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Kontrolli i Planifikimit Javor</h1>
        <p className="text-sm text-muted-foreground">
          Auditim read-only i planifikimit për javën e ardhshme të punës.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Settings2 className="h-4 w-4" /> Current configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div><div className="text-xs text-muted-foreground">Status</div><div className="font-medium">{settings?.enabled ? "Enabled" : "Disabled"}</div></div>
            <div><div className="text-xs text-muted-foreground">Timezone</div><div className="font-medium">{settings?.timezone || "Europe/Tirane"}</div></div>
            <div><div className="text-xs text-muted-foreground">Friday schedule</div><div className="font-medium">{settings?.schedule_config.slots?.join(", ") || SLOTS.join(", ")}</div></div>
            <div><div className="text-xs text-muted-foreground">PX dictionary</div><div className="font-medium">{settings?.abbreviation_version || "—"}</div></div>
          </div>
          <div className="text-xs text-muted-foreground">
            To: {settings?.recipients_to.join(", ") || "No recipients"}
          </div>
          {["ADMIN", "MANAGER"].includes(user.role) ? (
            <div className="space-y-3 rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={enabled} onCheckedChange={(value) => setEnabled(Boolean(value))} />
                Automatic delivery enabled
              </label>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1"><Label>To (comma-separated)</Label><Input value={recipientsTo} onChange={(event) => setRecipientsTo(event.target.value)} /></div>
                <div className="space-y-1"><Label>CC</Label><Input value={recipientsCc} onChange={(event) => setRecipientsCc(event.target.value)} /></div>
                <div className="space-y-1"><Label>BCC</Label><Input value={recipientsBcc} onChange={(event) => setRecipientsBcc(event.target.value)} /></div>
                <div className="space-y-1"><Label>Timezone</Label><Input value={timezone} onChange={(event) => setTimezone(event.target.value)} /></div>
                <div className="space-y-1"><Label>Retention days</Label><Input type="number" min={1} value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} /></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void saveSettings()} disabled={loading}>Save settings</Button>
                <input ref={fileInput} className="hidden" type="file" accept=".xlsx" onChange={(event) => void importAbbreviations(event)} />
                <Button variant="outline" onClick={() => fileInput.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" /> Import PX dictionary XLSX
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Manual control</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><Label>Monday of reporting week</Label><Input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} /></div>
            <div className="space-y-1">
              <Label>Control slot</Label>
              <Select value={slot} onValueChange={setSlot}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{SLOTS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => void previewReport()} disabled={loading}><Search className="mr-2 h-4 w-4" /> Preview</Button>
            <Button variant="outline" onClick={() => void runAction("generate")} disabled={loading}><FileSpreadsheet className="mr-2 h-4 w-4" /> Generate Excel</Button>
            <Button onClick={() => void runAction("generate-and-send")} disabled={loading}><Send className="mr-2 h-4 w-4" /> Generate and Send</Button>
          </div>
          <p className="text-xs text-muted-foreground">Every action reads the current PrimeFlow state; existing tasks are never changed.</p>
        </CardContent>
      </Card>

      {preview ? (
        <>
          <Card>
            <CardHeader><CardTitle className="text-sm">Preview summary: {preview.week_start} – {preview.week_end}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 text-sm md:grid-cols-4">
                <div>Included: <strong>{preview.people.length}</strong></div>
                <div>Full-week PV excluded: <strong>{preview.excluded_full_leave.length}</strong></div>
                <div>Partial PV: <strong>{preview.partial_leave_users.length}</strong></div>
                <div>Errors: <strong>{preview.errors.length}</strong></div>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Department</TableHead><TableHead>PV</TableHead><TableHead>Main focus</TableHead><TableHead>Tasks</TableHead><TableHead>Errors</TableHead></TableRow></TableHeader>
                <TableBody>{preview.people.map((person) => (
                  <TableRow key={person.user_id}>
                    <TableCell>{person.employee}</TableCell><TableCell>{person.department}</TableCell><TableCell>{person.leave_status}</TableCell>
                    <TableCell><div>{person.focus}</div><div className="text-xs text-muted-foreground">{person.focus_source}</div></TableCell>
                    <TableCell>{person.task_count}</TableCell><TableCell>{person.error_count}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Detected errors</CardTitle></CardHeader>
            <CardContent>
              <Table containerClassName="max-h-[520px] overflow-auto">
                <TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Date</TableHead><TableHead>Current title</TableHead><TableHead>Problem</TableHead><TableHead>Correction</TableHead><TableHead>Rule</TableHead><TableHead>Severity</TableHead></TableRow></TableHeader>
                <TableBody>{preview.errors.map((error, index) => (
                  <TableRow key={`${error.task_id || "user"}-${error.rule_code}-${index}`}>
                    <TableCell>{error.employee}</TableCell><TableCell>{error.task_date || "—"}</TableCell><TableCell className="max-w-xs">{error.current_title || "—"}</TableCell>
                    <TableCell className="max-w-sm">{error.problem}</TableCell><TableCell className="max-w-sm">{error.correction}</TableCell><TableCell>{error.rule_code}</TableCell>
                    <TableCell><span className={`rounded px-2 py-1 text-xs font-medium ${severityClass(error.severity)}`}>{error.severity}</span></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            Delivery history
            <Button size="sm" variant="ghost" onClick={() => void load()}><RefreshCw className="h-4 w-4" /></Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Generated</TableHead><TableHead>Week</TableHead><TableHead>Slot</TableHead><TableHead>Trigger</TableHead><TableHead>Status</TableHead><TableHead>Recipients</TableHead><TableHead>Errors</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>{history.map((run) => (
              <TableRow key={run.id}>
                <TableCell>{new Date(run.created_at).toLocaleString()}</TableCell><TableCell>{run.week_start} – {run.week_end}</TableCell><TableCell>{run.slot}</TableCell><TableCell>{run.trigger_type}</TableCell>
                <TableCell>
                  <span className={`rounded px-2 py-1 text-xs font-medium ${statusClass(run.status)}`}>{run.status}</span>
                  {run.error_message ? <div className="mt-1 max-w-xs text-xs text-red-700">{run.error_message}</div> : null}
                </TableCell>
                <TableCell className="max-w-xs text-xs">{Object.values(run.recipients_snapshot).flat().join(", ")}</TableCell><TableCell>{run.error_count}</TableCell>
                <TableCell><div className="flex gap-1">
                  {run.download_url ? <Button size="sm" variant="outline" onClick={() => void downloadRun(run)}><Download className="h-4 w-4" /></Button> : null}
                  {run.download_url ? <Button size="sm" variant="outline" onClick={() => void resend(run)} disabled={loading}><Mail className="h-4 w-4" /></Button> : null}
                </div></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
