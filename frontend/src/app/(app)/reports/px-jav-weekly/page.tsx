"use client"

import * as React from "react"
import { FileDown, FileSpreadsheet, FileText, Mail, RefreshCw } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/lib/auth"

type ReportRow = {
  note_id: string
  number: number
  content: string
  comment: string
  note_status: string
  priority: string
  discussed: boolean
  created_at: string
  created_by: string
  department: string
  project: string
  result: "DETYRË" | "VETËM SHËNIM"
  next_week: boolean
  task_count: number
  assignees: string[]
  task_statuses: string[]
  task_due_dates: string[]
  year_end_comment: boolean
}

type Preview = {
  report_date: string
  generated_at: string
  period_start: string
  period_end: string
  timezone: string
  recipient: string
  summary: {
    period_notes: number
    commented_notes: number
    year_end_comments: number
    report_notes: number
    notes_without_task: number
    next_week_tasks: number
    note_only: number
    excluded_with_task: number
    next_week_without_task: number
  }
  rows: ReportRow[]
}

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("sq-AL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))

const dateOnly = (value: string) =>
  new Intl.DateTimeFormat("sq-AL", { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(`${value}T12:00:00`))

export default function PxJavWeeklyReportPage() {
  const { apiFetch, user } = useAuth()
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [sending, setSending] = React.useState(false)
  const canSend = user?.role === "ADMIN" || user?.role === "MANAGER"

  const loadPreview = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch("/reports/px-jav-weekly/preview")
      if (!response.ok) throw new Error("Raporti nuk mund të ngarkohej.")
      setPreview((await response.json()) as Preview)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Raporti nuk mund të ngarkohej.")
    } finally {
      setLoading(false)
    }
  }, [apiFetch])

  React.useEffect(() => {
    void loadPreview()
  }, [loadPreview])

  const download = async (format: "xlsx" | "docx" | "pdf") => {
    const response = await apiFetch(`/reports/px-jav-weekly/download?format=${format}`)
    if (!response.ok) {
      toast.error(`Shkarkimi ${format.toUpperCase()} dështoi.`)
      return
    }
    const blob = await response.blob()
    const disposition = response.headers.get("content-disposition") || ""
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `Raporti_PX_JAV.${format}`
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const sendNow = async () => {
    if (!window.confirm(`Ta dërgojmë raportin tani te ${preview?.recipient || "marrësi i konfiguruar"}?`)) return
    setSending(true)
    try {
      const response = await apiFetch("/reports/px-jav-weekly/send-now", { method: "POST" })
      const payload = (await response.json()) as { detail?: string; status?: string }
      if (!response.ok) throw new Error(payload.detail || "Dërgimi dështoi.")
      toast.success(`Raporti u dërgua: ${payload.status || "SENT"}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Dërgimi dështoi.")
    } finally {
      setSending(false)
    }
  }

  const metrics = preview ? [
    ["Në periudhë", preview.summary.period_notes],
    ["Me koment", preview.summary.commented_notes],
    ["Koment 31.12", preview.summary.year_end_comments],
    ["Pa task", preview.summary.notes_without_task],
    ["Task për J.T", preview.summary.next_week_tasks],
    ["Task normal – jashtë", preview.summary.excluded_with_task],
    ["J.T pa task", preview.summary.next_week_without_task],
  ] : []

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">PX JAV – Kontrolli i taskave</h1>
          <p className="mt-1 text-sm text-slate-600">
            Të gjitha shënimet pa task dhe shënimet me task të krijuar për J.T; komentet 31.12 dalin në fund.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadPreview()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Rifresko
          </Button>
          <Button variant="outline" onClick={() => void download("xlsx")}><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</Button>
          <Button variant="outline" onClick={() => void download("docx")}><FileText className="mr-2 h-4 w-4" />Word</Button>
          <Button variant="outline" onClick={() => void download("pdf")}><FileDown className="mr-2 h-4 w-4" />PDF</Button>
          {canSend ? (
            <Button onClick={() => void sendNow()} disabled={sending || !preview}>
              <Mail className="mr-2 h-4 w-4" />{sending ? "Duke dërguar…" : "Dërgo tani"}
            </Button>
          ) : null}
        </div>
      </div>

      {preview ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            {metrics.map(([label, value]) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <div className="text-2xl font-semibold text-slate-900">{value}</div>
                  <div className="text-xs text-slate-600">{label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Shënimet pa task dhe taskat e krijuara për J.T</CardTitle>
              <CardDescription>
                {dateTime(preview.period_start)} – {dateTime(preview.period_end)} · Marrësi: {preview.recipient}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-slate-100 text-left text-xs uppercase text-slate-600">
                    <tr>
                      <th className="p-3">Nr.</th><th className="p-3">Kontrolli</th><th className="p-3">Shënimi</th>
                      <th className="p-3">Data / Nga</th><th className="p-3">Dep. / Projekt</th><th className="p-3">Task / Për</th><th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.note_id} className="border-t align-top">
                        <td className="p-3">{row.number}</td>
                        <td className="p-3">
                          <Badge
                            variant={row.year_end_comment ? "outline" : "secondary"}
                            className={row.year_end_comment ? "border-amber-300 bg-amber-100 text-amber-900" : undefined}
                          >
                            {row.year_end_comment
                              ? row.task_count > 0 ? "31.12 / TASK" : "31.12 / PA TASK"
                              : row.result === "DETYRË"
                                ? row.next_week ? "TASK PËR J.T" : "TASK I KRIJUAR"
                                : "PA TASK"}
                          </Badge>
                        </td>
                        <td className="max-w-xl whitespace-pre-wrap p-3">
                          <div>{row.content}</div>
                          {row.comment ? <div className="mt-2 text-slate-500">Koment: {row.comment}</div> : null}
                        </td>
                        <td className="p-3">{dateTime(row.created_at)}<br />{row.created_by}</td>
                        <td className="p-3">{row.department}<br />{row.project}</td>
                        <td className="p-3">{row.assignees.join(", ") || "-"}<br />{row.task_due_dates.map(dateOnly).join(", ") || "-"}</td>
                        <td className="p-3">{row.note_status}<br />{row.task_statuses.join(", ")}</td>
                      </tr>
                    ))}
                    {preview.rows.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-slate-500">Nuk ka shënime për raport në këtë periudhë.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : loading ? <div className="text-sm text-slate-500">Duke ngarkuar raportin…</div> : null}
    </div>
  )
}
