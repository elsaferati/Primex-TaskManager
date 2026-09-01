"use client"

import * as React from "react"
import { Eye, RefreshCw, Save, Send, Settings } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth"

type Recipients = { to: string[]; cc: string[]; bcc: string[] }
type SettingsState = {
  is_active: boolean
  send_time: string
  timezone: string
  weekdays: number[]
  recipients: Recipients
  last_run_date?: string | null
}
type Delivery = {
  id: string
  delivery_date: string
  target_date: string
  subject: string
  recipients: Recipients
  status: string
  sent_at: string | null
  last_error?: string | null
}
type Preview = { subject: string; target_date: string; html: string }

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function secondSendTime(first: string) {
  const [hours, minutes] = first.split(":").map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "—"
  const total = (hours * 60 + minutes + 20) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

function toRecipientText(values?: string[]) {
  return (values || []).join(", ")
}

function parseRecipients(value: string) {
  const seen = new Set<string>()
  return value.split(/[,;\n]/).map((email) => email.trim()).filter((email) => {
    const key = email.toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function formatDateTime(value?: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-"
}

export function PrintReportPage({ today = false }: { today?: boolean }) {
  const API = today ? "/today-print-report" : "/tomorrow-print-report"
  const reportName = today ? "1H SHTYPI Today" : "1H SHTYPI Tomorrow"
  const { apiFetch, user } = useAuth()
  const [settings, setSettings] = React.useState<SettingsState | null>(null)
  const [recipientInputs, setRecipientInputs] = React.useState({ to: "", cc: "", bcc: "" })
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [history, setHistory] = React.useState<Delivery[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const previewRef = React.useRef<HTMLDivElement | null>(null)
  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER"

  const applySettings = React.useCallback((next: SettingsState) => {
    setSettings(next)
    setRecipientInputs({
      to: toRecipientText(next.recipients.to),
      cc: toRecipientText(next.recipients.cc),
      bcc: toRecipientText(next.recipients.bcc),
    })
  }, [])

  const load = React.useCallback(async () => {
    if (!canManage) return
    setLoading(true)
    try {
      const [settingsResponse, historyResponse] = await Promise.all([apiFetch(`${API}/settings`), apiFetch(`${API}/history`)])
      if (!settingsResponse?.ok || !historyResponse?.ok) throw new Error(`Could not load ${reportName} settings`)
      applySettings(await settingsResponse.json())
      setHistory(await historyResponse.json())
    } catch (error) {
      toast.error(`Could not load ${reportName}`, { description: String(error) })
    } finally {
      setLoading(false)
    }
  }, [API, apiFetch, applySettings, canManage, reportName])

  React.useEffect(() => { void load() }, [load])

  const updateRecipients = (kind: keyof Recipients, value: string) => {
    setRecipientInputs((current) => ({ ...current, [kind]: value }))
    setSettings((current) => current ? { ...current, recipients: { ...current.recipients, [kind]: parseRecipients(value) } } : current)
  }

  const toggleDay = (day: number) => {
    setSettings((current) => {
      if (!current) return current
      const weekdays = current.weekdays.includes(day)
        ? current.weekdays.filter((value) => value !== day)
        : [...current.weekdays, day].sort()
      return { ...current, weekdays }
    })
  }

  const saveSettings = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const response = await apiFetch(`${API}/settings`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
      })
      if (!response?.ok) throw new Error(await response?.text())
      applySettings(await response.json())
      toast.success(`${reportName} settings saved`)
    } catch (error) {
      toast.error("Settings save failed", { description: String(error) })
    } finally {
      setSaving(false)
    }
  }

  const generateReport = async (forPreview = false) => {
    try {
      const response = await apiFetch(`${API}/preview?generated_at=${Date.now()}`, { cache: "no-store" })
      if (!response?.ok) throw new Error(await response?.text())
      setPreview(await response.json())
      toast.success(forPreview ? "Email preview ready" : `${reportName} generated`)
      window.setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0)
    } catch (error) {
      toast.error("Report could not be generated", { description: String(error) })
    }
  }

  const sendNow = async () => {
    setSending(true)
    try {
      const response = await apiFetch(`${API}/send`, { method: "POST" })
      if (!response?.ok) throw new Error(await response?.text())
      toast.success(`${reportName} email sent`)
      await load()
    } catch (error) {
      toast.error("Email could not be sent", { description: String(error) })
    } finally {
      setSending(false)
    }
  }

  if (!canManage) return <div className="rounded-lg border bg-white p-8">Manager or administrator access is required for {reportName}.</div>

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{reportName}</h1>
          <p className="text-sm text-muted-foreground">{today ? "Today's Common View tasks and meetings, sent at 09:00 Monday-Friday." : "Next-working-day tasks and meetings, sent as an HTML email."}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void generateReport(true)}><Eye /> Preview email</Button>
          <Button variant="outline" onClick={() => void generateReport()}><RefreshCw /> Generate</Button>
          <Button onClick={() => void sendNow()} disabled={sending}><Send /> {sending ? "Sending..." : "Send now"}</Button>
        </div>
      </div>

      {settings ? (
        <div className="space-y-4 rounded-lg border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-semibold"><Settings size={16} /> Automatic email</div>
              <div className="text-sm text-muted-foreground">{today ? "Each delivery contains that day's task rows, TAK INT, and TAK EXT meetings." : "Friday’s delivery contains Monday’s report."}</div>
            </div>
            <button
              type="button"
              aria-pressed={settings.is_active}
              onClick={() => setSettings({ ...settings, is_active: !settings.is_active })}
              className={settings.is_active ? "relative h-8 w-14 rounded-full bg-emerald-500 p-1" : "relative h-8 w-14 rounded-full bg-red-500 p-1"}
            ><span className={settings.is_active ? "absolute right-1 top-1 size-6 rounded-full bg-white shadow" : "absolute left-1 top-1 size-6 rounded-full bg-white shadow"} /></button>
          </div>
          <div className="grid gap-3 md:grid-cols-[180px_220px_1fr]">
            <div><Label>Send times</Label><Input type="time" value={settings.send_time} onChange={(event) => setSettings({ ...settings, send_time: event.target.value })} /><p className="mt-1 text-xs text-muted-foreground">{settings.send_time} and {secondSendTime(settings.send_time)}</p></div>
            <div><Label>Timezone</Label><Input value={settings.timezone} onChange={(event) => setSettings({ ...settings, timezone: event.target.value })} /></div>
            <div><Label>Days</Label><div className="flex flex-wrap gap-2">{days.map((label, day) => <Button key={label} type="button" variant={settings.weekdays.includes(day) ? "default" : "outline"} onClick={() => toggleDay(day)}>{label}</Button>)}</div></div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div><Label>To</Label><Input value={recipientInputs.to} onChange={(event) => updateRecipients("to", event.target.value)} placeholder="email@example.com" /></div>
            <div><Label>Cc</Label><Input value={recipientInputs.cc} onChange={(event) => updateRecipients("cc", event.target.value)} placeholder="Optional" /></div>
            <div><Label>Bcc</Label><Input value={recipientInputs.bcc} onChange={(event) => updateRecipients("bcc", event.target.value)} placeholder="Optional" /></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-muted-foreground">Last run: {formatDateTime(settings.last_run_date)}</span><Button variant="outline" onClick={() => void saveSettings()} disabled={saving}><Save /> Save settings</Button></div>
        </div>
      ) : <div className="rounded-lg border bg-white p-8 text-sm text-muted-foreground">{loading ? "Loading settings..." : "No settings available."}</div>}

      {preview ? (
        <div ref={previewRef} className="space-y-3 rounded-lg border bg-white p-4"><div><h2 className="font-semibold">Generated email</h2><p className="text-sm text-muted-foreground">{preview.subject}</p></div><iframe title={`${reportName} generated email`} srcDoc={preview.html} className="h-[620px] w-full rounded border bg-white" /></div>
      ) : null}

      <div className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Delivery history</h2><p className="text-sm text-muted-foreground">Last 50 attempts</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="p-2">Delivery</th><th className="p-2">Report for</th><th className="p-2">Status</th><th className="p-2">Sent</th><th className="p-2">To</th></tr></thead><tbody>{history.map((row) => <tr key={row.id} className="border-b"><td className="p-2">{row.delivery_date}</td><td className="p-2">{row.target_date}</td><td className="p-2">{row.status}</td><td className="p-2">{formatDateTime(row.sent_at)}</td><td className="p-2">{row.recipients.to.join(", ") || "-"}{row.last_error ? <div className="text-xs text-red-600">{row.last_error}</div> : null}</td></tr>)}{!history.length ? <tr><td className="p-4 text-muted-foreground" colSpan={5}>No deliveries yet.</td></tr> : null}</tbody></table></div>
      </div>
    </div>
  )
}

export default function TomorrowPrintReportPage() {
  return <PrintReportPage />
}
