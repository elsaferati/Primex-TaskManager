"use client"

import * as React from "react"
import { Eye, History, Pencil, RefreshCw, Save, Send, Settings } from "lucide-react"
import { toast } from "sonner"

import { ReportSectionFieldEditor, ReportSectionPreview, reportSectionEditorLines, reportSectionPreviewText } from "@/components/report-section-editor"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/lib/auth"

type Section = { section_key?: string; title: string; body: string }
type Recipients = { to: string[]; cc: string[]; bcc: string[] }
type Draft = { id: string; report_date: string; subject: string; recipients: Recipients; sections: Section[]; status: string; sent_at?: string | null; last_error?: string | null }
type ReportSettings = { is_active: boolean; send_time: string; timezone: string; weekdays: number[]; recipients: Recipients; last_run_date?: string | null }
type Editing = { index: number; title: string; lines: string[] }

const API = "/end-week-bz-report"
const LABEL = "PIKAT E BZ FIN JAV"
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const today = () => new Date().toISOString().slice(0, 10)
const recipientText = (values?: string[]) => (values || []).join(", ")
const parseRecipients = (value: string) => [...new Map(value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean).map((item) => [item.toLowerCase(), item])).values()]

async function errorText(response: Response) {
  const text = await response.text()
  try { return JSON.parse(text)?.detail || text || `HTTP ${response.status}` } catch { return text || `HTTP ${response.status}` }
}

export default function EndWeekBzReportPage() {
  const { apiFetch, user, loading: authLoading } = useAuth()
  const canManage = ["ADMIN", "MANAGER"].includes(String(user?.role || "").toUpperCase())
  const [reportDate, setReportDate] = React.useState(today())
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [settings, setSettings] = React.useState<ReportSettings | null>(null)
  const [history, setHistory] = React.useState<Draft[]>([])
  const [editing, setEditing] = React.useState<Editing | null>(null)
  const [preview, setPreview] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [recipientInputs, setRecipientInputs] = React.useState({ to: "", cc: "", bcc: "" })
  const [settingInputs, setSettingInputs] = React.useState({ to: "", cc: "", bcc: "" })

  const applyDraft = React.useCallback((value: Draft | null) => {
    setDraft(value)
    setRecipientInputs({ to: recipientText(value?.recipients.to), cc: recipientText(value?.recipients.cc), bcc: recipientText(value?.recipients.bcc) })
  }, [])

  const load = React.useCallback(async () => {
    if (!user) return
    setBusy(true)
    try {
      const response = await apiFetch(`${API}?report_date=${reportDate}`)
      if (response.status === 404) applyDraft(null)
      else if (!response.ok) throw new Error(await errorText(response))
      else applyDraft(await response.json())
      if (canManage) {
        const [settingsResponse, historyResponse] = await Promise.all([apiFetch(`${API}/settings`), apiFetch(`${API}/history`)])
        if (settingsResponse.ok) {
          const value = await settingsResponse.json() as ReportSettings
          setSettings(value)
          setSettingInputs({ to: recipientText(value.recipients.to), cc: recipientText(value.recipients.cc), bcc: recipientText(value.recipients.bcc) })
        }
        if (historyResponse.ok) setHistory(await historyResponse.json())
      }
    } catch (error) { toast.error("Report could not be loaded", { description: String(error) }) }
    finally { setBusy(false) }
  }, [apiFetch, applyDraft, canManage, reportDate, user])

  React.useEffect(() => { if (!authLoading) void load() }, [authLoading, load])

  const generate = async () => {
    setBusy(true)
    try {
      const response = await apiFetch(`${API}/generate?report_date=${reportDate}`, { method: "POST" })
      if (!response.ok) throw new Error(await errorText(response))
      applyDraft(await response.json()); toast.success(`${LABEL} generated`)
    } catch (error) { toast.error("Generate failed", { description: String(error) }) }
    finally { setBusy(false) }
  }

  const save = async (value = draft) => {
    if (!value) return null
    const response = await apiFetch(`${API}/${value.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: value.subject, recipients: value.recipients, sections: value.sections }) })
    if (!response.ok) { toast.error("Save failed", { description: await errorText(response) }); return null }
    const saved = await response.json() as Draft; applyDraft(saved); toast.success("Draft saved"); return saved
  }

  const showPreview = async () => {
    const saved = await save(); if (!saved) return
    const response = await apiFetch(`${API}/${saved.id}/preview`)
    if (!response.ok) return toast.error("Preview failed", { description: await errorText(response) })
    setPreview((await response.json()).html)
  }

  const send = async () => {
    const saved = await save(); if (!saved) return
    setBusy(true)
    try {
      const response = await apiFetch(`${API}/${saved.id}/send`, { method: "POST" })
      if (!response.ok) throw new Error(await errorText(response))
      applyDraft(await response.json()); toast.success(`${LABEL} sent`); void load()
    } catch (error) { toast.error("Send failed", { description: String(error) }) }
    finally { setBusy(false) }
  }

  const saveSettings = async () => {
    if (!settings) return
    const response = await apiFetch(`${API}/settings`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) })
    if (!response.ok) return toast.error("Settings save failed", { description: await errorText(response) })
    setSettings(await response.json()); toast.success("Settings saved")
  }

  const editRecipients = (target: "draft" | "settings", kind: keyof Recipients, value: string) => {
    if (target === "draft") {
      setRecipientInputs((old) => ({ ...old, [kind]: value }))
      setDraft((old) => old ? ({ ...old, recipients: { ...old.recipients, [kind]: parseRecipients(value) } }) : old)
    } else {
      setSettingInputs((old) => ({ ...old, [kind]: value }))
      setSettings((old) => old ? ({ ...old, recipients: { ...old.recipients, [kind]: parseRecipients(value) } }) : old)
    }
  }

  if (!authLoading && !canManage) return <div className="rounded-lg border p-8">Manager or administrator access is required.</div>

  return <div className="mx-auto max-w-[1400px] space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">{LABEL}</h1><p className="text-sm text-muted-foreground">Editable end-of-week task and meeting report.</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => void load()} disabled={busy}><RefreshCw className={busy ? "animate-spin" : ""}/> Refresh</Button><Button onClick={() => void generate()} disabled={busy}><RefreshCw/> Generate</Button></div>
    </div>
    <Tabs defaultValue="report">
      <TabsList><TabsTrigger value="report"><Pencil/> Report</TabsTrigger><TabsTrigger value="history"><History/> Send history</TabsTrigger></TabsList>
      <TabsContent value="report" className="space-y-5">
        <div className="grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-[220px_1fr_auto]">
          <div><Label>Date</Label><Input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)}/></div>
          <div><Label>Subject</Label><Input value={draft?.subject || ""} onChange={(event) => draft && setDraft({ ...draft, subject: event.target.value })} placeholder="Generate a draft first"/></div>
          <div className="flex items-end gap-2"><Button variant="outline" disabled={!draft} onClick={() => void save()}><Save/> Save</Button><Button variant="outline" disabled={!draft} onClick={() => void showPreview()}><Eye/> Preview</Button><Button disabled={!draft || busy} onClick={() => void send()}><Send/> Send</Button></div>
        </div>
        {draft ? <>
          <div className="grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-3">{(["to", "cc", "bcc"] as const).map((kind) => <div key={kind}><Label>{kind.toUpperCase()}</Label><Input value={recipientInputs[kind]} onChange={(event) => editRecipients("draft", kind, event.target.value)}/></div>)}</div>
          <div className="space-y-4">{draft.sections.map((section, index) => <div key={section.section_key || index} className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><div className="font-semibold">{index + 1}. {section.title}</div>{editing?.index !== index ? <Button variant="outline" size="sm" onClick={() => setEditing({ index, title: section.title, lines: reportSectionEditorLines(section.body) })}><Pencil/> Edit</Button> : null}</div>
            {editing?.index === index ? <ReportSectionFieldEditor lines={editing.lines} onCancel={() => setEditing(null)} onSave={(lines) => { const next = { ...draft, sections: draft.sections.map((item, position) => position === index ? { ...item, body: lines.join("\n") } : item) }; setDraft(next); setEditing(null); void save(next) }}/> : <ReportSectionPreview body={reportSectionPreviewText(section.body)}/>} 
          </div>)}</div>
        </> : <div className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">No draft for this date. Generate one to begin.</div>}
        {settings ? <div className="space-y-4 rounded-lg border bg-white p-4">
          <div className="flex justify-between"><div className="font-semibold"><Settings className="mr-2 inline h-4 w-4"/>Automatic send</div><Button variant={settings.is_active ? "default" : "outline"} onClick={() => setSettings({ ...settings, is_active: !settings.is_active })}>{settings.is_active ? "ON" : "OFF"}</Button></div>
          <div className="grid gap-3 md:grid-cols-2"><div><Label>Send time</Label><Input type="time" value={settings.send_time} onChange={(event) => setSettings({ ...settings, send_time: event.target.value })}/></div><div><Label>Timezone</Label><Input value={settings.timezone} onChange={(event) => setSettings({ ...settings, timezone: event.target.value })}/></div></div>
          <div><Label>Weekdays</Label><div className="mt-2 flex flex-wrap gap-2">{DAYS.map((day, index) => <Button key={day} type="button" size="sm" variant={settings.weekdays.includes(index) ? "default" : "outline"} onClick={() => setSettings({ ...settings, weekdays: settings.weekdays.includes(index) ? settings.weekdays.filter((item) => item !== index) : [...settings.weekdays, index].sort() })}>{day}</Button>)}</div></div>
          <div className="grid gap-3 md:grid-cols-3">{(["to", "cc", "bcc"] as const).map((kind) => <div key={kind}><Label>Default {kind.toUpperCase()}</Label><Input value={settingInputs[kind]} onChange={(event) => editRecipients("settings", kind, event.target.value)}/></div>)}</div>
          <div className="flex justify-end"><Button variant="outline" onClick={() => void saveSettings()}><Save/> Save settings</Button></div>
        </div> : null}
      </TabsContent>
      <TabsContent value="history"><div className="rounded-lg border bg-white"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Sent at</TableHead><TableHead>Subject</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{history.map((item) => <TableRow key={item.id}><TableCell>{item.report_date}</TableCell><TableCell>{item.sent_at ? new Date(item.sent_at).toLocaleString() : "-"}</TableCell><TableCell>{item.subject}</TableCell><TableCell>{item.last_error ? "ERROR" : item.status}</TableCell></TableRow>)}{!history.length ? <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No sent reports yet.</TableCell></TableRow> : null}</TableBody></Table></div></TabsContent>
    </Tabs>
    <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>Email preview</DialogTitle></DialogHeader>{preview ? <iframe title={`${LABEL} preview`} srcDoc={preview} className="h-[650px] w-full rounded border bg-white"/> : null}</DialogContent></Dialog>
  </div>
}
