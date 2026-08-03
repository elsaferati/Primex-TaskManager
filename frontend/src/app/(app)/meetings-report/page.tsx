"use client"

import * as React from "react"
import { Eye, RefreshCw, Save, Send, Settings } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"

type Section = { title: string; body: string }
type Recipients = { to: string[]; cc: string[]; bcc: string[] }
type RecipientInputs = { to: string; cc: string; bcc: string }
type ReportSettings = {
  is_active: boolean
  send_time: string
  timezone: string
  weekdays: number[]
  recipients: Recipients
  last_run_date?: string | null
}
type Draft = {
  id: string
  report_date: string
  tomorrow_date: string
  subject: string
  recipients: Recipients
  sections: Section[]
  status: string
  sent_at?: string | null
  gmail_message_id?: string | null
  last_error?: string | null
  updated_at?: string | null
}

const API = "/meetings-report"

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function recipientsText(values?: string[]) {
  return (values || []).join(", ")
}

function parseRecipients(value: string) {
  const seen = new Set<string>()
  const rows: string[] = []
  for (const part of value.split(/[,\n;]/)) {
    const email = part.trim()
    const normalized = email.toLowerCase()
    if (!email || seen.has(normalized)) continue
    seen.add(normalized)
    rows.push(email)
  }
  return rows
}

async function responseError(res: Response) {
  const text = await res.text()
  if (!text) return `HTTP ${res.status}`
  try {
    const data = JSON.parse(text)
    return typeof data?.detail === "string" ? data.detail : text
  } catch {
    return text
  }
}

export default function MeetingsReportPage() {
  const { apiFetch, loading: authLoading, user } = useAuth()
  const canAccess = !authLoading && Boolean(user)
  const canEdit = user?.role === "ADMIN" || user?.role === "MANAGER"
  const [reportDate, setReportDate] = React.useState(todayIso())
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [preview, setPreview] = React.useState<{ html: string; plain_text: string } | null>(null)
  const [recipientInputs, setRecipientInputs] = React.useState<RecipientInputs>({ to: "", cc: "", bcc: "" })
  const [settings, setSettings] = React.useState<ReportSettings | null>(null)
  const [settingsInputs, setSettingsInputs] = React.useState<RecipientInputs>({ to: "", cc: "", bcc: "" })
  const [savingSettings, setSavingSettings] = React.useState(false)

  const applyDraft = React.useCallback((nextDraft: Draft | null) => {
    setDraft(nextDraft)
    setRecipientInputs({
      to: recipientsText(nextDraft?.recipients?.to),
      cc: recipientsText(nextDraft?.recipients?.cc),
      bcc: recipientsText(nextDraft?.recipients?.bcc),
    })
  }, [])

  const applySettings = React.useCallback((nextSettings: ReportSettings) => {
    setSettings(nextSettings)
    setSettingsInputs({
      to: recipientsText(nextSettings.recipients?.to),
      cc: recipientsText(nextSettings.recipients?.cc),
      bcc: recipientsText(nextSettings.recipients?.bcc),
    })
  }, [])

  const loadDraft = React.useCallback(async () => {
    if (!canAccess) return
    setLoading(true)
    try {
      const res = await apiFetch(`${API}?report_date=${reportDate}`)
      if (res.status === 404) {
        applyDraft(null)
        return
      }
      if (!res.ok) throw new Error(await responseError(res))
      applyDraft(await res.json())
    } catch (error) {
      if (canAccess) toast.error("Unable to load Meetings Report", { description: String(error) })
    } finally {
      setLoading(false)
    }
  }, [apiFetch, applyDraft, canAccess, reportDate])

  const loadSettings = React.useCallback(async () => {
    if (!canAccess) return
    try {
      const res = await apiFetch(`${API}/settings`)
      if (!res.ok) throw new Error(await responseError(res))
      applySettings(await res.json())
    } catch (error) {
      if (canAccess) toast.error("Unable to load Meetings Report settings", { description: String(error) })
    }
  }, [apiFetch, applySettings, canAccess])

  React.useEffect(() => {
    if (canAccess) {
      void loadDraft()
      void loadSettings()
    }
  }, [canAccess, loadDraft, loadSettings])

  const generate = async () => {
    if (!canAccess) return
    setLoading(true)
    try {
      const res = await apiFetch(`${API}/generate?report_date=${reportDate}`, { method: "POST" })
      if (!res.ok) throw new Error(await responseError(res))
      applyDraft(await res.json())
      toast.success("Meetings Report generated")
    } catch (error) {
      toast.error("Generate failed", { description: String(error) })
    } finally {
      setLoading(false)
    }
  }

  const save = async (): Promise<Draft | null> => {
    if (!draft || !canEdit) return draft
    setSaving(true)
    try {
      const res = await apiFetch(`${API}/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: draft.subject, recipients: draft.recipients, sections: draft.sections }),
      })
      if (!res.ok) throw new Error(await responseError(res))
      const data = await res.json()
      applyDraft(data)
      toast.success("Draft saved")
      return data
    } catch (error) {
      toast.error("Save failed", { description: String(error) })
      return null
    } finally {
      setSaving(false)
    }
  }

  const previewDraft = async () => {
    if (!draft) return
    if (canEdit) await save()
    try {
      const res = await apiFetch(`${API}/${draft.id}/preview`)
      if (!res.ok) throw new Error(await responseError(res))
      setPreview(await res.json())
    } catch (error) {
      toast.error("Preview failed", { description: String(error) })
    }
  }

  const sendDraft = async () => {
    if (!draft || !canEdit) return
    setSending(true)
    try {
      const savedDraft = await save()
      if (!savedDraft) return
      const res = await apiFetch(`${API}/${savedDraft.id}/send`, { method: "POST" })
      if (!res.ok) throw new Error(await responseError(res))
      const data = await res.json()
      applyDraft(data)
      toast.success("Meetings Report sent", { description: data.gmail_message_id || undefined })
    } catch (error) {
      toast.error("Send failed", { description: String(error) })
    } finally {
      setSending(false)
    }
  }

  const updateSection = (index: number, body: string) => {
    setDraft((current) => {
      if (!current) return current
      const sections = current.sections.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, body } : section
      )
      return { ...current, sections }
    })
  }

  const updateRecipients = (kind: keyof Recipients, value: string) => {
    setRecipientInputs((current) => ({ ...current, [kind]: value }))
    setDraft((current) => current ? { ...current, recipients: { ...current.recipients, [kind]: parseRecipients(value) } } : current)
  }

  const updateSettingsRecipients = (kind: keyof Recipients, value: string) => {
    setSettingsInputs((current) => ({ ...current, [kind]: value }))
    setSettings((current) => current ? { ...current, recipients: { ...current.recipients, [kind]: parseRecipients(value) } } : current)
  }

  const toggleWeekday = (day: number) => {
    setSettings((current) => {
      if (!current) return current
      const exists = current.weekdays.includes(day)
      const weekdays = exists ? current.weekdays.filter((value) => value !== day) : [...current.weekdays, day].sort()
      return { ...current, weekdays }
    })
  }

  const saveSettings = async () => {
    if (!settings || !canEdit) return
    setSavingSettings(true)
    try {
      const res = await apiFetch(`${API}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error(await responseError(res))
      applySettings(await res.json())
      toast.success("Meetings Report settings saved")
    } catch (error) {
      toast.error("Settings save failed", { description: String(error) })
    } finally {
      setSavingSettings(false)
    }
  }

  if (!canAccess) return <div className="rounded-lg border p-8">Meetings Report access required.</div>

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Meetings Report</h1>
          <p className="text-sm text-muted-foreground">Editable end-of-day report for boss meeting follow-up.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadDraft()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
          <Button onClick={() => void generate()} disabled={loading}>
            <RefreshCw /> Generate
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-[220px_1fr_auto]">
        <div>
          <Label>Date</Label>
          <Input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
        </div>
        <div>
          <Label>Subject</Label>
          <Input
            value={draft?.subject || ""}
            onChange={(event) => draft && setDraft({ ...draft, subject: event.target.value })}
            placeholder="Generate a draft first"
            readOnly={!canEdit}
          />
        </div>
        <div className="flex items-end gap-2">
          {canEdit ? (
            <Button variant="outline" onClick={() => void save()} disabled={!draft || saving}>
              <Save /> Save
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => void previewDraft()} disabled={!draft || saving}>
            <Eye /> Preview
          </Button>
          {canEdit ? (
            <Button onClick={() => void sendDraft()} disabled={!draft || sending}>
              <Send /> Send
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-3">
        <div>
          <Label>To</Label>
            <Input
            value={recipientInputs.to}
            onChange={(event) => draft && updateRecipients("to", event.target.value)}
            placeholder="email@example.com"
            readOnly={!canEdit}
          />
        </div>
        <div>
          <Label>Cc</Label>
          <Input
            value={recipientInputs.cc}
            onChange={(event) => draft && updateRecipients("cc", event.target.value)}
            placeholder="Optional"
            readOnly={!canEdit}
          />
        </div>
        <div>
          <Label>Bcc</Label>
          <Input
            value={recipientInputs.bcc}
            onChange={(event) => draft && updateRecipients("bcc", event.target.value)}
            placeholder="Optional"
            readOnly={!canEdit}
          />
        </div>
      </div>

      {settings ? (
        <div className="space-y-3 rounded-lg border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-semibold"><Settings size={16} /> Automatic Send</div>
              <div className="text-sm text-muted-foreground">Saved default recipients and schedule for this report.</div>
            </div>
            <Button variant={settings.is_active ? "default" : "outline"} onClick={() => canEdit && setSettings({ ...settings, is_active: !settings.is_active })} disabled={!canEdit}>
              {settings.is_active ? "Enabled" : "Disabled"}
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-[180px_220px_1fr]">
            <div>
              <Label>Send time</Label>
              <Input type="time" value={settings.send_time} onChange={(event) => setSettings({ ...settings, send_time: event.target.value })} readOnly={!canEdit} />
            </div>
            <div>
              <Label>Timezone</Label>
              <Input value={settings.timezone} onChange={(event) => setSettings({ ...settings, timezone: event.target.value })} readOnly={!canEdit} />
            </div>
            <div>
              <Label>Days</Label>
              <div className="flex flex-wrap gap-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, day) => (
                  <Button
                    key={label}
                    type="button"
                    variant={settings.weekdays.includes(day) ? "default" : "outline"}
                    onClick={() => toggleWeekday(day)}
                    disabled={!canEdit}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Default To</Label>
              <Input value={settingsInputs.to} onChange={(event) => updateSettingsRecipients("to", event.target.value)} readOnly={!canEdit} />
            </div>
            <div>
              <Label>Default Cc</Label>
              <Input value={settingsInputs.cc} onChange={(event) => updateSettingsRecipients("cc", event.target.value)} readOnly={!canEdit} />
            </div>
            <div>
              <Label>Default Bcc</Label>
              <Input value={settingsInputs.bcc} onChange={(event) => updateSettingsRecipients("bcc", event.target.value)} readOnly={!canEdit} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">Last automatic run: {settings.last_run_date || "-"}</div>
            {canEdit ? (
              <Button variant="outline" onClick={() => void saveSettings()} disabled={savingSettings}>
                <Save /> Save settings
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {draft ? (
        <>
          <div className="grid gap-3 text-sm md:grid-cols-4">
            <div className="rounded-lg border bg-white p-3">
              <div className="text-muted-foreground">Report date</div>
              <div className="font-medium">{draft.report_date}</div>
            </div>
            <div className="rounded-lg border bg-white p-3">
              <div className="text-muted-foreground">Tomorrow</div>
              <div className="font-medium">{draft.tomorrow_date}</div>
            </div>
            <div className="rounded-lg border bg-white p-3">
              <div className="text-muted-foreground">Status</div>
              <div className="font-medium">{draft.status}</div>
            </div>
            <div className="rounded-lg border bg-white p-3">
              <div className="text-muted-foreground">Gmail</div>
              <div className="truncate font-medium">{draft.gmail_message_id || "-"}</div>
            </div>
          </div>

          <div className="space-y-4">
            {draft.sections.map((section, index) => (
              <div key={`${section.title}-${index}`} className="rounded-lg border bg-white p-4">
                <Label className="text-sm font-semibold">{index + 1}. {section.title}</Label>
                <Textarea
                  className="mt-3 min-h-[150px] font-mono text-sm"
                  value={section.body}
                  onChange={(event) => updateSection(index, event.target.value)}
                  readOnly={!canEdit}
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">
          No draft for this date. Generate one to start editing.
        </div>
      )}

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Email preview</DialogTitle>
          </DialogHeader>
          {preview ? <iframe title="Meetings Report preview" srcDoc={preview.html} className="h-[650px] w-full rounded border bg-white" /> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
