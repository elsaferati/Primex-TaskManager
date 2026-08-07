"use client"

import * as React from "react"
import { CalendarDays, CheckCircle2, Clock3, Eye, History, Mail, Pencil, RefreshCw, Save, Send, Settings, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ReportSectionFieldEditor,
  ReportSectionPreview,
  reportSectionEditorLines,
  reportSectionPreviewText,
} from "@/components/report-section-editor"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/lib/auth"

type Section = { title: string; body: string }
type Recipients = { to: string[]; cc: string[]; bcc: string[] }
type RecipientInputs = { to: string; cc: string; bcc: string }
type EditingSection = { index: number; title: string; lines: string[] }
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

function compactSectionTitle(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "")
}

function canonicalMeetingsSectionTitle(title: string) {
  const key = compactSectionTitle(title)
  if (key.includes("TIKETATESTD") && key.includes("RAPORTOHENNEM3")) {
    return "(GA) TIKETAT E STD? RAPORTOHEN NE M3"
  }
  if (key.includes("M3DETGAMBYLLJAMEHV")) {
    return "(GA) M3 DET GA MBYLLJA ME HV?"
  }
  return title
}

function collapseMeetingsSections(sections: Section[]): Section[] {
  const displayOrder = [
    "A JEMI BRENDA MESATARES ME PROJEKTE/",
    "(GA) TIKETAT E STD? RAPORTOHEN NE M3",
    "(GA) M3 DET GA MBYLLJA ME HV?",
    "DET NE PROCES SISTEMIT - SYSTEM TASKS REPORT - LATE?",
    "DET. PA PROGRES (PINK)?",
    "TAKIMET PA KRY (KONTROLLO PLATFORMEN)?",
    "N- (GA) PV/FESTE?",
    "N- (GA) SHIKOHET COMMON VIEW NESER, VETEM DETYRAT E REJA ME TE KALTER, 08:00 DHE ME DEADLINE?",
    "N- (GA) TAKIMET EXTERNE/ TAKIMET INTERNE/ BZ ME GA/BLLOK?",
    "N- A KA DETYRA 1H PA SLOT?",
    "N- (GA/KA) KUSH KA DET PERSONALISHT?",
  ]
  const manuals = new Set(["A JEMI BRENDA MESATARES ME PROJEKTE/"])
  const placeholder = "(Ploteso manualisht)"
  const byTitle = new Map<string, string>()
  const extras: Section[] = []
  const seenExtra = new Set<string>()

  const preferBody = (current: string, incoming: string) => {
    const cur = current.trim()
    const inc = incoming.trim()
    if (!cur || cur === placeholder) return incoming || current
    if (!inc || inc === placeholder) return current
    return current
  }

  for (const section of sections) {
    const title = canonicalMeetingsSectionTitle(section.title.trim())
    if (!title) continue
    if (displayOrder.includes(title)) {
      const existing = byTitle.get(title)
      byTitle.set(title, existing == null ? section.body : preferBody(existing, section.body))
      continue
    }
    const key = compactSectionTitle(title)
    if (!key || seenExtra.has(key)) continue
    seenExtra.add(key)
    extras.push({ title, body: section.body })
  }

  const ordered: Section[] = []
  for (const title of displayOrder) {
    if (byTitle.has(title)) ordered.push({ title, body: byTitle.get(title) || "" })
    else if (manuals.has(title)) ordered.push({ title, body: placeholder })
  }
  let insertAt = 0
  for (let index = 0; index < ordered.length; index += 1) {
    if (manuals.has(ordered[index].title)) insertAt = index + 1
  }
  return [...ordered.slice(0, insertAt), ...extras, ...ordered.slice(insertAt)]
}

function sectionGroupLabel(title: string, _index?: number) {
  const key = compactSectionTitle(title)
  if (key.includes("TIKETATESTD") && key.includes("RAPORTOHENNEM3")) {
    return "Auto-filled from PrimeFlow"
  }
  if (key.includes("M3DETGAMBYLLJAMEHV")) {
    return "Auto-filled from PrimeFlow"
  }
  const knownAuto = [
    "(GA) M3 DET GA MBYLLJA ME HV?",
    "(GA) TIKETAT E STD? RAPORTOHEN NE M3",
    "DET NE PROCES SISTEMIT - SYSTEM TASKS REPORT - LATE?",
    "DET. PA PROGRES (PINK)?",
    "N- (GA) PV/FESTE?",
    "N- (GA) TAKIMET EXTERNE/ TAKIMET INTERNE/ BZ ME GA/BLLOK?",
    "N- (GA) SHIKOHET COMMON VIEW NESER, VETEM DETYRAT E REJA ME TE KALTER, 08:00 DHE ME DEADLINE?",
    "TAKIMET PA KRY (KONTROLLO PLATFORMEN)?",
    "N- A KA DETYRA 1H PA SLOT?",
    "N- (GA/KA) KUSH KA DET PERSONALISHT?",
  ]
  if (knownAuto.some((auto) => compactSectionTitle(auto) === key)) return "Auto-filled from PrimeFlow"
  return "Manual questions"
}

function shouldShowSectionGroup(sections: Section[], index: number) {
  if (index === 0) return true
  return sectionGroupLabel(sections[index].title, index) !== sectionGroupLabel(sections[index - 1].title, index - 1)
}
type DeliveryHistory = {
  id: string
  report_date: string
  subject: string
  recipients: Recipients
  status: string
  sent_at: string | null
  gmail_message_id?: string | null
  last_error?: string | null
}

const API = "/meetings-report"
const REPORT_LABEL = "Mbyllja e dites M3"

function sectionPreviewText(value: string) {
  return reportSectionPreviewText(value)
}

function recipientsSummary(recipients: Recipients) {
  const groups = [
    recipients.to.length ? `To: ${recipients.to.join(", ")}` : "",
    recipients.cc.length ? `Cc: ${recipients.cc.join(", ")}` : "",
    recipients.bcc.length ? `Bcc: ${recipients.bcc.join(", ")}` : "",
  ].filter(Boolean)
  return groups.join(" | ") || "-"
}

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

function formatDateTimeInTimezone(value: string | null | undefined, timezone: string) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone || "Europe/Tirane",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date)
  }
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
  const isAdmin = user?.role === "ADMIN"
  const canManageDelivery = isAdmin || user?.role === "MANAGER"
  const [reportDate, setReportDate] = React.useState(todayIso())
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [preview, setPreview] = React.useState<{ html: string; plain_text: string } | null>(null)
  const [settings, setSettings] = React.useState<ReportSettings | null>(null)
  const [settingsInputs, setSettingsInputs] = React.useState<RecipientInputs>({ to: "", cc: "", bcc: "" })
  const [savingSettings, setSavingSettings] = React.useState(false)
  const [editingSection, setEditingSection] = React.useState<EditingSection | null>(null)
  const [history, setHistory] = React.useState<DeliveryHistory[]>([])
  const [loadingHistory, setLoadingHistory] = React.useState(false)

  const applyDraft = React.useCallback((nextDraft: Draft | null) => {
    if (!nextDraft) {
      setDraft(null)
      return
    }
    setDraft({
      ...nextDraft,
      sections: collapseMeetingsSections(nextDraft.sections || []),
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
      if (canAccess) toast.error(`Unable to load ${REPORT_LABEL}`, { description: String(error) })
    } finally {
      setLoading(false)
    }
  }, [apiFetch, applyDraft, canAccess, reportDate])

  const loadSettings = React.useCallback(async () => {
    if (!canAccess || !isAdmin) return
    try {
      const res = await apiFetch(`${API}/settings`)
      if (!res.ok) throw new Error(await responseError(res))
      applySettings(await res.json())
    } catch (error) {
      if (canAccess) toast.error(`Unable to load ${REPORT_LABEL} settings`, { description: String(error) })
    }
  }, [apiFetch, applySettings, canAccess, isAdmin])

  const loadHistory = React.useCallback(async () => {
    if (!canAccess) return
    setLoadingHistory(true)
    try {
      const res = await apiFetch(`${API}/history?limit=50`)
      if (!res.ok) throw new Error(await responseError(res))
      setHistory(await res.json())
    } catch (error) {
      toast.error("Unable to load delivery history", { description: String(error) })
    } finally {
      setLoadingHistory(false)
    }
  }, [apiFetch, canAccess])

  React.useEffect(() => {
    if (canAccess) {
      void loadDraft()
      void loadHistory()
      if (isAdmin) void loadSettings()
    }
  }, [canAccess, isAdmin, loadDraft, loadHistory, loadSettings])

  const generate = async () => {
    if (!canAccess) return
    if (draft && !window.confirm("Refresh auto-filled sections for this date? Manual answers will be kept.")) return
    setLoading(true)
    try {
      if (draft) await save(draft)
      const res = await apiFetch(`${API}/generate?report_date=${reportDate}`, { method: "POST" })
      if (!res.ok) throw new Error(await responseError(res))
      applyDraft(await res.json())
      setEditingSection(null)
      toast.success(`${REPORT_LABEL} generated`)
    } catch (error) {
      toast.error("Generate failed", { description: String(error) })
    } finally {
      setLoading(false)
    }
  }

  const save = async (draftToSave: Draft | null = draft): Promise<Draft | null> => {
    if (!draftToSave) return draftToSave
    setSaving(true)
    try {
      const res = await apiFetch(`${API}/${draftToSave.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: draftToSave.subject, sections: draftToSave.sections }),
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
    await save()
    try {
      const res = await apiFetch(`${API}/${draft.id}/preview`)
      if (!res.ok) throw new Error(await responseError(res))
      setPreview(await res.json())
    } catch (error) {
      toast.error("Preview failed", { description: String(error) })
    }
  }

  const sendDraft = async () => {
    if (!draft || !canManageDelivery) return
    setSending(true)
    try {
      const savedDraft = await save()
      if (!savedDraft) return
      const res = await apiFetch(`${API}/${savedDraft.id}/send`, { method: "POST" })
      if (!res.ok) throw new Error(await responseError(res))
      const data = await res.json()
      applyDraft(data)
      void loadHistory()
      toast.success(`${REPORT_LABEL} sent`, { description: data.gmail_message_id || undefined })
    } catch (error) {
      toast.error("Send failed", { description: String(error) })
    } finally {
      setSending(false)
    }
  }

  const openSectionEditor = (index: number) => {
    if (!draft) return
    setEditingSection({
      index,
      title: draft.sections[index]?.title || "",
      lines: reportSectionEditorLines(draft.sections[index]?.body || ""),
    })
  }

  const applySectionEditor = (lines: string[]) => {
    if (!editingSection || !draft) return
    const sections = draft.sections.map((section, index) =>
      index === editingSection.index
        ? {
            ...section,
            title: editingSection.title.trim() || section.title,
            body: lines.join("\n"),
          }
        : section
    )
    const nextDraft = { ...draft, sections }
    setDraft(nextDraft)
    setEditingSection(null)
    void save(nextDraft)
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
    if (!settings || !isAdmin) return
    setSavingSettings(true)
    try {
      const res = await apiFetch(`${API}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error(await responseError(res))
      applySettings(await res.json())
      toast.success(`${REPORT_LABEL} settings saved`)
    } catch (error) {
      toast.error("Settings save failed", { description: String(error) })
    } finally {
      setSavingSettings(false)
    }
  }

  if (!canAccess) return <div className="rounded-md border p-8">{REPORT_LABEL} access required.</div>

  return (
    <div className="mx-auto max-w-[1480px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-md bg-slate-900 text-white"><Mail className="size-5" /></div>
          <div>
            <h1 className="text-2xl font-semibold">{REPORT_LABEL}</h1>
            <p className="text-sm text-muted-foreground">Daily report workspace</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void Promise.all([loadDraft(), loadHistory()])} disabled={loading || loadingHistory}>
            <RefreshCw className={loading || loadingHistory ? "animate-spin" : ""} /> Refresh
          </Button>
          <Button onClick={() => void generate()} disabled={loading}>
            <RefreshCw /> Generate report
          </Button>
        </div>
      </div>

      <Tabs defaultValue="report" className="gap-5">
        <TabsList className="h-10 rounded-md">
          <TabsTrigger value="report"><Pencil /> Report</TabsTrigger>
          <TabsTrigger value="history"><History /> Send history</TabsTrigger>
          {isAdmin ? <TabsTrigger value="settings"><Settings /> Settings</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="report" className="space-y-5">
          <div className="grid gap-4 border-y bg-slate-50/70 px-4 py-4 lg:grid-cols-[190px_minmax(320px,1fr)_auto]">
            <div>
              <Label>Report date</Label>
              <Input className="mt-1 bg-white" type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
            </div>
            <div>
              <Label>Email subject</Label>
              <Input
                className="mt-1 bg-white"
                value={draft?.subject || ""}
                onChange={(event) => draft && setDraft({ ...draft, subject: event.target.value })}
                placeholder="Generate a draft first"
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Button variant="outline" onClick={() => void save()} disabled={!draft || saving}><Save /> Save</Button>
              <Button variant="outline" onClick={() => void previewDraft()} disabled={!draft || saving}><Eye /> Email preview</Button>
              {canManageDelivery ? <Button onClick={() => void sendDraft()} disabled={!draft || sending}><Send /> Send now</Button> : null}
            </div>
          </div>

          {draft ? (
            <>
              <div className="grid border md:grid-cols-4">
                {[
                  [CalendarDays, "Report date", draft.report_date],
                  [CalendarDays, "Tomorrow", draft.tomorrow_date],
                  [CheckCircle2, "Status", draft.status],
                  [Clock3, "Last update", formatDateTimeInTimezone(draft.updated_at, "Europe/Tirane")],
                ].map(([Icon, label, value], index) => {
                  const MetaIcon = Icon as typeof CalendarDays
                  return (
                    <div key={String(label)} className={index < 3 ? "border-b p-4 md:border-b-0 md:border-r" : "p-4"}>
                      <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground"><MetaIcon className="size-4" />{String(label)}</div>
                      <div className="mt-1.5 text-sm font-semibold">{String(value || "-")}</div>
                    </div>
                  )
                })}
              </div>

              <div className="space-y-4">
                {draft.sections.map((section, index) => {
                  const isEditing = editingSection?.index === index
                  return (
                    <React.Fragment key={`${section.title}-${index}`}>
                      {shouldShowSectionGroup(draft.sections, index) ? (
                        <div className="rounded-md border bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700">
                          {sectionGroupLabel(section.title, index)}
                        </div>
                      ) : null}
                      <section className="rounded-md border bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-sm font-semibold text-slate-700">{index + 1}</div>
                            <div className="min-w-0 flex-1">
                              {isEditing ? (
                                <Input
                                  value={editingSection.title}
                                  onChange={(event) =>
                                    setEditingSection((current) =>
                                      current ? { ...current, title: event.target.value } : current
                                    )
                                  }
                                  className="font-semibold"
                                  placeholder="Shkruaj pyetjen..."
                                />
                              ) : (
                                <h2 className="text-sm font-semibold leading-5">{section.title}</h2>
                              )}
                            </div>
                          </div>
                          {!isEditing ? (
                            <Button variant="outline" size="sm" onClick={() => openSectionEditor(index)}><Pencil /> Edit</Button>
                          ) : null}
                        </div>

                        {isEditing ? (
                          <ReportSectionFieldEditor
                            key={`edit-${index}`}
                            lines={editingSection.lines}
                            onCancel={() => setEditingSection(null)}
                            onSave={applySectionEditor}
                          />
                        ) : (
                          <ReportSectionPreview body={sectionPreviewText(section.body)} />
                        )}
                      </section>
                    </React.Fragment>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="border-y py-16 text-center text-sm text-muted-foreground">No draft for this date.</div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          <div className="flex items-center justify-between">
            <div><h2 className="font-semibold">Report delivery history</h2><p className="text-sm text-muted-foreground">Last 50 sent reports</p></div>
            <Button variant="outline" size="sm" onClick={() => void loadHistory()} disabled={loadingHistory}><RefreshCw className={loadingHistory ? "animate-spin" : ""} /> Refresh</Button>
          </div>
          <div className="rounded-md border bg-white">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Sent at</TableHead><TableHead>Recipients</TableHead><TableHead>Subject</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {history.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.report_date}</TableCell>
                    <TableCell>{formatDateTimeInTimezone(item.sent_at, "Europe/Tirane")}</TableCell>
                    <TableCell className="max-w-[420px] whitespace-normal">{recipientsSummary(item.recipients)}</TableCell>
                    <TableCell className="max-w-[420px] truncate">{item.subject}</TableCell>
                    <TableCell><Badge variant={item.last_error ? "destructive" : "secondary"}>{item.last_error ? "ERROR" : item.status}</Badge></TableCell>
                  </TableRow>
                ))}
                {!loadingHistory && history.length === 0 ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No sent reports yet.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {isAdmin ? (
          <TabsContent value="settings">
            {settings ? (
              <div className="space-y-5 rounded-md border bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
                  <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-md bg-slate-100"><ShieldCheck className="size-5" /></div><div><h2 className="font-semibold">Automatic delivery</h2><p className="text-sm text-muted-foreground">Administrator access</p></div></div>
                  <button
                    type="button"
                    aria-pressed={settings.is_active}
                    aria-label={settings.is_active ? "Turn automatic send off" : "Turn automatic send on"}
                    onClick={() => setSettings({ ...settings, is_active: !settings.is_active })}
                    className={settings.is_active ? "relative h-8 w-14 rounded-full bg-emerald-500 p-1" : "relative h-8 w-14 rounded-full bg-slate-300 p-1"}
                  ><span className={settings.is_active ? "absolute right-1 top-1 size-6 rounded-full bg-white shadow" : "absolute left-1 top-1 size-6 rounded-full bg-white shadow"} /></button>
                </div>
                <div className="grid gap-4 lg:grid-cols-[180px_240px_1fr]">
                  <div><Label>Send time</Label><Input className="mt-1" type="time" value={settings.send_time} onChange={(event) => setSettings({ ...settings, send_time: event.target.value })} /></div>
                  <div><Label>Timezone</Label><Input className="mt-1" value={settings.timezone} onChange={(event) => setSettings({ ...settings, timezone: event.target.value })} /></div>
                  <div><Label>Delivery days</Label><div className="mt-1 flex flex-wrap gap-2">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, day) => <Button key={label} type="button" size="sm" variant={settings.weekdays.includes(day) ? "default" : "outline"} onClick={() => toggleWeekday(day)}>{label}</Button>)}</div></div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div><Label>To</Label><Input className="mt-1" value={settingsInputs.to} onChange={(event) => updateSettingsRecipients("to", event.target.value)} /></div>
                  <div><Label>Cc</Label><Input className="mt-1" value={settingsInputs.cc} onChange={(event) => updateSettingsRecipients("cc", event.target.value)} /></div>
                  <div><Label>Bcc</Label><Input className="mt-1" value={settingsInputs.bcc} onChange={(event) => updateSettingsRecipients("bcc", event.target.value)} /></div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <div className="text-sm text-muted-foreground">Last automatic run: {formatDateTimeInTimezone(settings.last_run_date, settings.timezone)}</div>
                  <Button onClick={() => void saveSettings()} disabled={savingSettings}><Save /> Save settings</Button>
                </div>
              </div>
            ) : <div className="border-y py-12 text-center text-sm text-muted-foreground">Loading settings...</div>}
          </TabsContent>
        ) : null}
      </Tabs>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Email preview</DialogTitle>
          </DialogHeader>
          {preview ? <iframe title={`${REPORT_LABEL} preview`} srcDoc={preview.html} className="h-[650px] w-full rounded border bg-white" /> : null}
        </DialogContent>
      </Dialog>

    </div>
  )
}
