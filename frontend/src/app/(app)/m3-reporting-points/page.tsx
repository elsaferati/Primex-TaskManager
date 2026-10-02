"use client"

import * as React from "react"
import { Eye, History, RefreshCw, Save, Send } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { M3ReportingPointsView, MANUAL_POINTS, reportDate, reportTime, type ManualAnswers, type ManualKey, type ReportingPointsReport } from "@/components/m3-reporting-points-view"

const API = "/m3-reporting-points"
type Recipients = { to: string[]; cc: string[]; bcc: string[] }
type HistoryRow = Pick<ReportingPointsReport, "id" | "report_date" | "status" | "sent_at" | "realization_captured_at">

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tirane", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json()
  if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Veprimi dështoi. Provo përsëri.")
  return body as T
}

export default function M3ReportingPointsPage() {
  const { user, loading: authLoading, apiFetch } = useAuth()
  const [day, setDay] = React.useState(today)
  const [report, setReport] = React.useState<ReportingPointsReport | null>(null)
  const [answers, setAnswers] = React.useState<ManualAnswers>({})
  const [recipients, setRecipients] = React.useState<Recipients | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = React.useState<string | null>(null)
  const [history, setHistory] = React.useState<HistoryRow[] | null>(null)
  const [sendOpen, setSendOpen] = React.useState(false)
  const canAccess = !!user && (["ADMIN", "MANAGER"].includes(user.role) || (user.full_name || "").trim().toLowerCase() === "laurent hoxha")
  const dirty = !!report && (Object.keys(MANUAL_POINTS) as ManualKey[]).some((key) => (answers[key] || "") !== (report.manual_answers[key] || ""))
  const sent = report?.status === "SENT"

  const acceptReport = React.useCallback((value: ReportingPointsReport) => {
    setReport(value)
    setAnswers(value.manual_answers || {})
    setError(null)
  }, [])

  React.useEffect(() => {
    if (!canAccess) return
    let active = true
    setLoading(true)
    setReport(null)
    setAnswers({})
    setError(null)
    apiFetch(`${API}?report_date=${day}`).then(async (response) => {
      if (response.status === 404) return
      const value = await responseJson<ReportingPointsReport>(response)
      if (active) acceptReport(value)
    }).catch((error: Error) => { if (active) setError(error.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [apiFetch, day, canAccess, acceptReport])

  React.useEffect(() => {
    if (!canAccess) return
    let active = true
    apiFetch(`${API}/recipients`).then(responseJson<{ recipients: Recipients }>).then((value) => {
      if (active) setRecipients(value.recipients)
    }).catch((error: Error) => { if (active) setError(error.message) })
    return () => { active = false }
  }, [apiFetch, canAccess])

  // Pick up the automatic 16:15 capture without replacing unsaved answers.
  React.useEffect(() => {
    if (!canAccess || day !== today() || dirty || busy || sent) return
    const timer = window.setInterval(() => {
      apiFetch(`${API}?report_date=${day}`, { cache: "no-store" }).then(async (response) => {
        if (response.ok) acceptReport(await responseJson<ReportingPointsReport>(response))
      }).catch(() => {})
    }, 30000)
    return () => window.clearInterval(timer)
  }, [apiFetch, day, canAccess, dirty, busy, sent, acceptReport])

  const action = async (name: string, work: () => Promise<void>) => {
    setBusy(name)
    try { await work() }
    catch (error) { toast.error(error instanceof Error ? error.message : "Veprimi dështoi.") }
    finally { setBusy(null) }
  }

  const generate = () => action("generate", async () => {
    const value = await responseJson<ReportingPointsReport>(await apiFetch(`${API}/generate?report_date=${day}`, { method: "POST" }))
    acceptReport(value)
    toast.success("Pikat automatike u përditësuan.")
  })

  const save = () => action("save", async () => {
    if (!report) return
    const value = await responseJson<ReportingPointsReport>(await apiFetch(`${API}/${report.id}/answers`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manual_answers: answers }),
    }))
    acceptReport(value)
    toast.success("Përgjigjet u ruajtën.")
  })

  const preview = () => action("preview", async () => {
    if (!report) return
    const value = await responseJson<{ html: string }>(await apiFetch(`${API}/${report.id}/preview`))
    setPreviewHtml(value.html)
  })

  const loadHistory = () => action("history", async () => {
    setHistory(await responseJson<HistoryRow[]>(await apiFetch(`${API}/history`)))
  })

  const send = () => action("send", async () => {
    if (!report) return
    const value = await responseJson<ReportingPointsReport>(await apiFetch(`${API}/${report.id}/send`, { method: "POST" }))
    acceptReport(value)
    setSendOpen(false)
    toast.success("Raporti u dërgua te marrësit aktualë të M3.")
  })

  if (authLoading) return <p className="p-8 text-sm text-muted-foreground">Duke ngarkuar…</p>
  if (!canAccess) return <p className="rounded-xl border p-8">Ky raport është i disponueshëm për drejtuesit e raporteve.</p>

  return <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold">Pikat për raportim M3 / GA</h1><p className="mt-1 text-sm text-muted-foreground">Pikat ditore të raportimit. Dërgimi bëhet vetëm me butonin Dërgo.</p></div>
      <Button variant="outline" onClick={loadHistory} disabled={!!busy}><History className="mr-2 h-4 w-4" />Historiku</Button>
    </header>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
      <div className="space-y-2"><Label htmlFor="report-day">Data e raportit</Label><Input id="report-day" type="date" value={day} max={today()} disabled={!!busy}
        onChange={(event) => { if (dirty) toast.error("Ruaj përgjigjet përpara ndryshimit të datës."); else if (event.target.value) setDay(event.target.value) }} /></div>
      <Button variant="outline" onClick={generate} disabled={!!busy || loading || dirty || sent || day !== today()}><RefreshCw className={`mr-2 h-4 w-4 ${busy === "generate" ? "animate-spin" : ""}`} />{report ? "Përditëso pikat" : "Gjenero raportin"}</Button>
      <Button onClick={save} disabled={!report || !!busy || !dirty || sent}><Save className="mr-2 h-4 w-4" />Ruaj përgjigjet</Button>
      <Button variant="outline" onClick={preview} disabled={!report || !!busy || dirty}><Eye className="mr-2 h-4 w-4" />Pamja e email-it</Button>
      <Button onClick={() => setSendOpen(true)} disabled={!report || !report.generated_at || !report.realization_captured_at || !!busy || dirty || sent || !recipients?.to.length}><Send className="mr-2 h-4 w-4" />{sent ? "I dërguar" : "Dërgo"}</Button>
      {report ? <Badge variant={sent ? "default" : "secondary"}>{report.status}</Badge> : null}
    </div>
    {dirty ? <p role="status" className="text-sm text-amber-700">Ke përgjigje të paruajtura. Ruaji përpara përditësimit ose dërgimit.</p> : null}
    {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
    {report?.last_error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Dërgimi i fundit dështoi. Kontrollo konfigurimin e email-it dhe provo përsëri.</p> : null}
    {loading ? <p className="py-10 text-center text-muted-foreground">Duke ngarkuar raportin…</p> : report ? <>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span>Pikat u përditësuan në {reportTime(report.generated_at)}</span><span>Realizimi: {report.realization_captured_at ? `i ruajtur në ${reportTime(report.realization_captured_at)}` : "pret marrjen në 16:15"}</span>{report.sent_at ? <span>Dërguar në {reportTime(report.sent_at)}</span> : null}</div>
      <M3ReportingPointsView report={report} answers={answers} disabled={!!busy || sent} onAnswerChange={(key, value) => setAnswers((previous) => ({ ...previous, [key]: value }))} />
      {!report.realization_captured_at ? <p className="text-sm text-muted-foreground">Dërgimi aktivizohet pasi të ruhet realizimi i orës 16:15.</p> : null}
    </> : <div className="rounded-xl border border-dashed p-12 text-center"><h2 className="font-semibold">Nuk ka raport të ruajtur për {reportDate(day)}.</h2><p className="mt-2 text-sm text-muted-foreground">{day === today() ? "Gjenero raportin për të plotësuar përgjigjet dhe për të parë pikat automatike." : "Zgjidh një datë nga historiku për të parë të dhënat e ruajtura."}</p></div>}

    <Dialog open={previewHtml !== null} onOpenChange={(open) => { if (!open) setPreviewHtml(null) }}><DialogContent className="max-w-[95vw] sm:max-w-[95vw]"><DialogHeader><DialogTitle>Pamja e raportit në email</DialogTitle></DialogHeader><iframe title="Pikat për raportim M3 / GA" sandbox="" srcDoc={previewHtml || ""} className="h-[75vh] w-full rounded border bg-white" /></DialogContent></Dialog>
    <Dialog open={history !== null} onOpenChange={(open) => { if (!open) setHistory(null) }}><DialogContent><DialogHeader><DialogTitle>Historiku i raporteve</DialogTitle></DialogHeader><div className="max-h-[60vh] space-y-2 overflow-y-auto">{history?.length ? history.map((row) => <button key={row.id} type="button" className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:bg-muted" onClick={() => {
      if (dirty) { toast.error("Ruaj përgjigjet përpara hapjes së një date tjetër."); return }
      setDay(row.report_date); setHistory(null)
    }}><span>{reportDate(row.report_date)}<span className="ml-3 text-xs text-muted-foreground">{row.sent_at ? reportTime(row.sent_at) : "Pa dërguar"}</span></span><Badge variant="secondary">{row.status}</Badge></button>) : <p className="py-6 text-sm text-muted-foreground">Nuk ka ende raporte në historik.</p>}</div></DialogContent></Dialog>
    <Dialog open={sendOpen} onOpenChange={(open) => { if (!busy) setSendOpen(open) }}><DialogContent><DialogHeader><DialogTitle>Dërgo raportin M3 / GA</DialogTitle></DialogHeader><p className="text-sm">Raporti i datës {reportDate(day)} dërgohet te marrësit aktualë të M3. Pikat automatike përditësohen në momentin e dërgimit; përgjigjet dhe realizimi i 16:15 ruhen.</p><div className="space-y-2 rounded-lg bg-muted p-3 text-sm">{recipients ? (Object.entries(recipients) as [string, string[]][]).filter(([, values]) => values.length).map(([key, values]) => <p key={key}><strong>{key.toUpperCase()}:</strong> {values.join(", ")}</p>) : null}</div><Button onClick={send} disabled={!!busy}><Send className="mr-2 h-4 w-4" />{busy === "send" ? "Duke dërguar…" : "Dërgo raportin"}</Button></DialogContent></Dialog>
  </div>
}
