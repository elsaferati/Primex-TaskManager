"use client"

import * as React from "react"
import { useVisibleRefresh } from "@/lib/use-visible-refresh"
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
type TaskMarker = "EXCLAMATION" | "QUESTION" | "KA" | "GENT" | "FLAG"
type TaskMarkerFilter = "all" | "with" | "none" | TaskMarker

const taskMarkerOptions: Array<{ value: TaskMarker; label: string }> = [
  { value: "EXCLAMATION", label: "!" },
  { value: "QUESTION", label: "?" },
  { value: "KA", label: "KA" },
  { value: "GENT", label: "GENT" },
  { value: "FLAG", label: "⚑" },
]

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
  const reportName = today ? "1H SHTYPI SOT (Shiko simbolet)" : "1H SHTYPI NESER (Shiko simbolet)"
  const { apiFetch, user, loading: authLoading } = useAuth()
  const [settings, setSettings] = React.useState<SettingsState | null>(null)
  const [recipientInputs, setRecipientInputs] = React.useState({ to: "", cc: "", bcc: "" })
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [markerFilter, setMarkerFilter] = React.useState<TaskMarkerFilter>("all")
  const [history, setHistory] = React.useState<Delivery[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [generatingAction, setGeneratingAction] = React.useState<"preview" | "generate" | null>(null)
  const previewRef = React.useRef<HTMLDivElement | null>(null)
  const previewFrameRef = React.useRef<HTMLIFrameElement | null>(null)
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
    if (!canManage) {
      setLoading(false)
      return
    }
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
    setGeneratingAction(forPreview ? "preview" : "generate")
    try {
      const response = await apiFetch(`${API}/preview?generated_at=${Date.now()}`, { cache: "no-store" })
      if (!response?.ok) throw new Error(await response?.text())
      setPreview(await response.json())
      toast.success(forPreview ? "Email preview ready" : `${reportName} generated`)
      window.setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0)
    } catch (error) {
      toast.error("Report could not be generated", { description: String(error) })
    } finally {
      setGeneratingAction(null)
    }
  }

  useVisibleRefresh(async () => {
    if (previewFrameRef.current?.contentDocument?.querySelector("select[data-task-marker-control]:disabled")) return
    const response = await apiFetch(`${API}/preview?generated_at=${Date.now()}`, { cache: "no-store" })
    if (response.ok) setPreview(await response.json())
  }, Boolean(preview) && !saving && !sending && !authLoading)

  const applyPreviewMarkerFilter = React.useCallback(() => {
    const document = previewFrameRef.current?.contentDocument
    if (!document) return
    document.querySelectorAll<HTMLTableRowElement>('tr[data-task-card-row="content"]').forEach((contentRow) => {
      const dateRow = contentRow.nextElementSibling
      const dateCells = dateRow?.matches('tr[data-task-card-row="dates"]')
        ? Array.from(dateRow.cells).filter((cell): cell is HTMLTableCellElement => cell.tagName === "TD")
        : []
      const taskCells = Array.from(contentRow.cells).filter(
        (cell): cell is HTMLTableCellElement => cell.tagName === "TD"
      )

      taskCells.forEach((cell, index) => {
        const marker = cell.dataset.taskMarker || ""
        const isTaskCard = Boolean(cell.dataset.taskId)
        const matches = markerFilter === "all" || (
          isTaskCard && (
            markerFilter === "with" ? Boolean(marker) :
            markerFilter === "none" ? !marker : marker === markerFilter
          )
        )
        cell.style.display = matches ? "" : "none"
        cell.dataset.taskMarkerFilterHidden = matches ? "false" : "true"
        if (dateCells[index]) dateCells[index].style.display = matches ? "" : "none"

        // Clear the old content-only filtering style from previews generated
        // before full-card filtering was introduced.
        const content = cell.querySelector<HTMLElement>("[data-task-marker-filter-content]")
        if (content) content.style.visibility = ""
      })
    })
  }, [markerFilter])

  const setupPreviewMarkerControls = React.useCallback(() => {
    const document = previewFrameRef.current?.contentDocument
    if (!document) return

    document.querySelectorAll<HTMLElement>("td[data-task-id]").forEach((cell) => {
      if (cell.querySelector("select[data-task-marker-control]")) return
      const taskId = cell.dataset.taskId
      if (!taskId) return

      const content = document.createElement("div")
      content.dataset.taskMarkerFilterContent = "true"
      content.style.display = "contents"
      while (cell.firstChild) content.appendChild(cell.firstChild)
      cell.appendChild(content)

      const existingBadge = cell.querySelector<HTMLElement>('[data-task-badge="one-h-marker"]')
      existingBadge?.remove()

      const select = document.createElement("select")
      select.dataset.taskMarkerControl = "true"
      select.setAttribute("aria-label", "Task marker")
      select.title = "Task marker"
      select.style.cssText = [
        "display:inline-block",
        "float:right",
        "height:22px",
        "min-width:58px",
        "max-width:64px",
        "margin:0 0 3px 4px",
        "padding:0 2px",
        "border:1px solid #93C5FD",
        "border-radius:999px",
        "background:#EFF6FF",
        "color:#0F2A5F",
        "font:900 16px/1 Arial,sans-serif",
        "cursor:pointer",
      ].join(";")

      const emptyOption = document.createElement("option")
      emptyOption.value = ""
      emptyOption.textContent = "—"
      emptyOption.style.cssText = "color:#0F2A5F;font-size:16px;font-weight:900"
      select.appendChild(emptyOption)
      taskMarkerOptions.forEach((option) => {
        const element = document.createElement("option")
        element.value = option.value
        element.textContent = option.label
        element.style.cssText = "color:#0F2A5F;font-size:16px;font-weight:900"
        select.appendChild(element)
      })
      select.value = cell.dataset.taskMarker || ""

      select.addEventListener("change", async () => {
        const previousValue = cell.dataset.taskMarker || ""
        const nextValue = select.value
        select.disabled = true
        try {
          const response = await apiFetch(`/tasks/${taskId}/one-h-marker`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ one_h_marker: nextValue || null }),
          })
          if (!response?.ok) {
            const detail = await response?.json().catch(() => null)
            throw new Error(typeof detail?.detail === "string" ? detail.detail : "Could not update task marker")
          }
          cell.dataset.taskMarker = nextValue
          applyPreviewMarkerFilter()
          toast.success("Task marker updated")
        } catch (error) {
          select.value = previousValue
          toast.error("Task marker update failed", { description: String(error) })
        } finally {
          select.disabled = false
        }
      })

      const periodBadge = cell.querySelector('[data-task-badge="finish-period"]')
      if (periodBadge) periodBadge.insertAdjacentElement("afterend", select)
      else content.prepend(select)
    })
    applyPreviewMarkerFilter()
  }, [apiFetch, applyPreviewMarkerFilter])

  React.useEffect(() => {
    applyPreviewMarkerFilter()
  }, [applyPreviewMarkerFilter, preview])

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

  if (!authLoading && !user) return <div className="rounded-lg border bg-white p-8">Sign in to access {reportName}.</div>

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{reportName}</h1>
          <p className="text-sm text-muted-foreground">{today ? "Today's Common View tasks and meetings, sent at 09:00 Monday-Friday." : "Next-working-day tasks and meetings, sent as an HTML email."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 text-sm font-medium text-[#0F2A5F]">
            Symbol
            <select
              className="h-8 bg-transparent text-sm font-black text-[#0F2A5F] outline-none"
              value={markerFilter}
              onChange={(event) => setMarkerFilter(event.target.value as TaskMarkerFilter)}
              aria-label="Filter tasks by symbol"
            >
              <option value="all">All</option>
              <option value="with">All with symbols</option>
              <option value="none">No symbol</option>
              {taskMarkerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <Button variant="outline" onClick={() => void generateReport(true)} disabled={!user || generatingAction !== null}>{generatingAction === "preview" ? <RefreshCw className="animate-spin" /> : <Eye />} {generatingAction === "preview" ? "Generating..." : "Preview email"}</Button>
          <Button variant="outline" onClick={() => void generateReport()} disabled={!user || generatingAction !== null}><RefreshCw className={generatingAction === "generate" ? "animate-spin" : ""} /> {generatingAction === "generate" ? "Generating..." : "Generate"}</Button>
          {canManage ? <Button onClick={() => void sendNow()} disabled={sending}><Send /> {sending ? "Sending..." : "Send now"}</Button> : null}
        </div>
      </div>

      {canManage && settings ? (
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
      ) : canManage ? <div className="rounded-lg border bg-white p-8 text-sm text-muted-foreground">{loading ? "Loading settings..." : "No settings available."}</div> : null}

      {preview ? (
        <div ref={previewRef} className="space-y-3 rounded-lg border bg-white p-4"><div><h2 className="font-semibold">Generated email</h2><p className="text-sm text-muted-foreground">{preview.subject}</p></div><iframe ref={previewFrameRef} onLoad={setupPreviewMarkerControls} title={`${reportName} generated email`} srcDoc={preview.html} className="h-[620px] w-full rounded border bg-white" /></div>
      ) : null}

      {canManage ? <div className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Delivery history</h2><p className="text-sm text-muted-foreground">Last 50 attempts</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b text-left text-muted-foreground"><tr><th className="p-2">Delivery</th><th className="p-2">Report for</th><th className="p-2">Status</th><th className="p-2">Sent</th><th className="p-2">To</th></tr></thead><tbody>{history.map((row) => <tr key={row.id} className="border-b"><td className="p-2">{row.delivery_date}</td><td className="p-2">{row.target_date}</td><td className="p-2">{row.status}</td><td className="p-2">{formatDateTime(row.sent_at)}</td><td className="p-2">{row.recipients.to.join(", ") || "-"}{row.last_error ? <div className="text-xs text-red-600">{row.last_error}</div> : null}</td></tr>)}{!history.length ? <tr><td className="p-4 text-muted-foreground" colSpan={5}>No deliveries yet.</td></tr> : null}</tbody></table></div>
      </div> : null}
    </div>
  )
}

export default function TomorrowPrintReportPage() {
  return <PrintReportPage />
}
