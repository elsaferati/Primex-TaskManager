"use client"

import * as React from "react"
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleOff,
  Clock3,
  Download,
  FileText,
  FileSpreadsheet,
  Loader2,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Search,
  TicketCheck,
  Wrench,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from "@/components/providers/confirm-dialog-provider"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

type ExternalTicket = {
  id: string
  external_id: string
  issue_number?: number | null
  order_ticket_number?: string | null
  title?: string | null
  description?: string | null
  affected_fields: string[]
  category?: string | null
  priority?: string | null
  status?: string | null
  dashboard_area?: string | null
  reporter_username?: string | null
  reporter_email?: string | null
  comment_count: number
  file_count: number
  reported_at?: string | null
  source_updated_at?: string | null
  closed_at?: string | null
  synced_at: string
  review_status: "PENDING" | "NO_ACTION" | "TASK_CREATED" | string
  review_note?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  ga_note_id?: string | null
  task_id?: string | null
  source: "STD External"
}

type ExternalTicketDetail = ExternalTicket & {
  creator_id?: string | null
  assigned_admin?: string | null
  closed_by?: string | null
  related_order_id?: string | null
  order_snapshot_json: Record<string, unknown>
  comments: Array<Record<string, unknown>>
  files: Array<Record<string, unknown>>
}

type ListResponse = {
  items: ExternalTicket[]
  total: number
  page: number
  page_size: number
  pages: number
  categories: string[]
  priorities: string[]
  statuses: string[]
  last_synchronized_at?: string | null
  last_sync_error?: string | null
}

type TaskOptions = {
  projects: Array<{ id: string; title: string; department_id?: string | null }>
  users: Array<{ id: string; label: string; department_id?: string | null }>
}

const TASK_TYPE_OPTIONS = [
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "1H", label: "1H" },
  { value: "R1", label: "R1" },
  { value: "PERSONAL", label: "P: (Personal)" },
  { value: "BLLOK", label: "BLLOK" },
] as const

const EMPTY_RESPONSE: ListResponse = {
  items: [],
  total: 0,
  page: 1,
  page_size: 25,
  pages: 1,
  categories: [],
  priorities: [],
  statuses: [],
}

function readError(response: Response, fallback: string) {
  return response
    .json()
    .then((payload: { detail?: string }) => payload.detail || fallback)
    .catch(() => fallback)
}

function formatDate(value?: string | null, includeTime = true) {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat("sq-AL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(parsed)
}

function valueLabel(value?: string | null) {
  if (!value) return "—"
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function statusTone(status?: string | null) {
  switch ((status || "").toLowerCase()) {
    case "open":
      return "border-sky-200 bg-sky-50 text-sky-700"
    case "in_progress":
      return "border-violet-200 bg-violet-50 text-violet-700"
    case "waiting_for_user":
      return "border-amber-200 bg-amber-50 text-amber-700"
    case "done":
      return "border-emerald-200 bg-emerald-50 text-emerald-700"
    case "closed":
      return "border-slate-200 bg-slate-100 text-slate-700"
    default:
      return "border-slate-200 bg-white text-slate-600"
  }
}

function ReviewBadge({ value }: { value: string }) {
  if (value === "TASK_CREATED") {
    return <Badge className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"><Check className="h-3 w-3" /> Detyrë e krijuar</Badge>
  }
  if (value === "NO_ACTION") {
    return <Badge className="gap-1 border-slate-200 bg-slate-100 text-slate-600"><CircleOff className="h-3 w-3" /> S’ka nevojë</Badge>
  }
  return <Badge className="gap-1 border-amber-200 bg-amber-50 text-amber-700"><Clock3 className="h-3 w-3" /> Pa shqyrtuar</Badge>
}

function metadataText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
}

function commentBody(comment: Record<string, unknown>) {
  return String(comment.body || comment.comment || comment.content || "")
}

function commentAuthor(comment: Record<string, unknown>) {
  const author = comment.author || comment.creator || comment.user
  if (author && typeof author === "object") {
    const value = author as Record<string, unknown>
    return String(value.full_name || value.username || value.email || "STD user")
  }
  return String(author || "STD user")
}

function fileName(file: Record<string, unknown>) {
  return String(file.original_filename || file.filename || file.name || file.id || "Attachment")
}

function userInitials(label: string) {
  return label
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "U"
}

export default function ExternalTicketsPage() {
  const { apiFetch, user } = useAuth()
  const confirm = useConfirm()
  const [data, setData] = React.useState<ListResponse>(EMPTY_RESPONSE)
  const [page, setPage] = React.useState(1)
  const [searchInput, setSearchInput] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("open")
  const [categoryFilter, setCategoryFilter] = React.useState("ALL")
  const [priorityFilter, setPriorityFilter] = React.useState("ALL")
  const [reviewFilter, setReviewFilter] = React.useState("ALL")
  const [dateFrom, setDateFrom] = React.useState("")
  const [dateTo, setDateTo] = React.useState("")
  const [sort, setSort] = React.useState("updated_at:desc")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [syncing, setSyncing] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])

  const [detailOpen, setDetailOpen] = React.useState(false)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [markingDetailNoAction, setMarkingDetailNoAction] = React.useState(false)
  const [detail, setDetail] = React.useState<ExternalTicketDetail | null>(null)

  const [taskDialogOpen, setTaskDialogOpen] = React.useState(false)
  const [taskOptions, setTaskOptions] = React.useState<TaskOptions>({ projects: [], users: [] })
  const [optionsLoading, setOptionsLoading] = React.useState(false)
  const [creatingTask, setCreatingTask] = React.useState(false)
  const [projectId, setProjectId] = React.useState("")
  const [assigneeIds, setAssigneeIds] = React.useState<string[]>([])
  const [taskTitle, setTaskTitle] = React.useState("")
  const [taskDescription, setTaskDescription] = React.useState("")
  const [reviewNote, setReviewNote] = React.useState("")
  const [taskPriority, setTaskPriority] = React.useState("1H")
  const [startDate, setStartDate] = React.useState("")
  const [dueDate, setDueDate] = React.useState("")

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const loadTickets = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    const [sortBy, sortDir] = sort.split(":")
    const params = new URLSearchParams({
      page: String(page),
      page_size: "25",
      sort_by: sortBy,
      sort_dir: sortDir,
    })
    if (search) params.set("search", search)
    if (statusFilter !== "ALL") params.set("status", statusFilter)
    if (categoryFilter !== "ALL") params.set("category", categoryFilter)
    if (priorityFilter !== "ALL") params.set("priority", priorityFilter)
    if (reviewFilter !== "ALL") params.set("review_status", reviewFilter)
    if (dateFrom) params.set("date_from", dateFrom)
    if (dateTo) params.set("date_to", dateTo)
    try {
      const response = await apiFetch(`/external-tickets?${params}`)
      if (!response.ok) throw new Error(await readError(response, "Ticket-at nuk mund të ngarkoheshin."))
      const payload = (await response.json()) as ListResponse
      setData(payload)
      setSelectedIds((current) => current.filter((id) => payload.items.some((item) => item.id === id)))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ticket-at nuk mund të ngarkoheshin.")
    } finally {
      setLoading(false)
    }
  }, [apiFetch, categoryFilter, dateFrom, dateTo, page, priorityFilter, reviewFilter, search, sort, statusFilter])

  React.useEffect(() => {
    const timer = window.setTimeout(() => void loadTickets(), 0)
    return () => window.clearTimeout(timer)
  }, [loadTickets])

  const selectableItems = data.items.filter((item) => item.review_status !== "TASK_CREATED")
  const allPageSelected = selectableItems.length > 0 && selectableItems.every((item) => selectedIds.includes(item.id))
  const selectedTickets = data.items.filter((item) => selectedIds.includes(item.id))
  const selectedAssignees = taskOptions.users.filter((item) => assigneeIds.includes(item.id))
  const pendingOnPage = data.items.filter((item) => item.review_status === "PENDING").length
  const taskCreatedOnPage = data.items.filter((item) => item.review_status === "TASK_CREATED").length
  const noActionOnPage = data.items.filter((item) => item.review_status === "NO_ACTION").length

  const toggleTicket = (ticketId: string, checked: boolean) => {
    setSelectedIds((current) => checked ? [...new Set([...current, ticketId])] : current.filter((id) => id !== ticketId))
  }

  const toggleAll = (checked: boolean) => {
    const pageIds = selectableItems.map((item) => item.id)
    setSelectedIds((current) => checked ? [...new Set([...current, ...pageIds])] : current.filter((id) => !pageIds.includes(id)))
  }

  const openDetail = async (ticket: ExternalTicket) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetail(null)
    const response = await apiFetch(`/external-tickets/${ticket.id}`)
    if (!response.ok) {
      toast.error(await readError(response, "Detajet nuk mund të ngarkoheshin."))
      setDetailLoading(false)
      return
    }
    setDetail((await response.json()) as ExternalTicketDetail)
    setDetailLoading(false)
  }

  const syncNow = async () => {
    setSyncing(true)
    const response = await apiFetch("/external-tickets/sync", { method: "POST" })
    if (!response.ok) {
      toast.error(await readError(response, "Sinkronizimi dështoi."))
      setSyncing(false)
      return
    }
    const result = (await response.json()) as { ok: boolean; synced: number; reason?: string }
    if (result.ok) toast.success(`Sinkronizimi përfundoi: ${result.synced} ticket-a u përpunuan.`)
    else toast.error(result.reason === "missing_token" ? "Token-i i STD nuk është konfiguruar në server." : "Sinkronizimi dështoi; të dhënat ekzistuese mbeten të disponueshme.")
    await loadTickets()
    setSyncing(false)
  }

  const exportExcel = async () => {
    if (exporting) return
    setExporting(true)
    const [sortBy, sortDir] = sort.split(":")
    const params = new URLSearchParams({ sort_by: sortBy, sort_dir: sortDir })
    if (search) params.set("search", search)
    if (statusFilter !== "ALL") params.set("status", statusFilter)
    if (categoryFilter !== "ALL") params.set("category", categoryFilter)
    if (priorityFilter !== "ALL") params.set("priority", priorityFilter)
    if (reviewFilter !== "ALL") params.set("review_status", reviewFilter)
    if (dateFrom) params.set("date_from", dateFrom)
    if (dateTo) params.set("date_to", dateTo)
    try {
      const response = await apiFetch(`/external-tickets/export.xlsx?${params}`)
      if (!response.ok) throw new Error(await readError(response, "Excel-i nuk mund të krijohej."))
      const blob = await response.blob()
      if (!blob.size) throw new Error("Excel-i i krijuar është bosh.")
      const disposition = response.headers.get("content-disposition")
      const filename = disposition?.match(/filename="?([^";]+)"?/i)?.[1] || "STD_Tickets_EXT.xlsx"
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success("Excel-i u eksportua me sukses.")
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Excel-i nuk mund të krijohej.")
    } finally {
      setExporting(false)
    }
  }

  const markNoAction = async () => {
    if (!selectedIds.length) return
    const confirmed = await confirm({
      title: "S’ka nevojë për rregullim",
      description: `Të shënohen ${selectedIds.length} ticket-a si pa nevojë për rregullim?`,
      confirmLabel: "Po, konfirmo",
      cancelLabel: "Anulo",
    })
    if (!confirmed) return
    const response = await apiFetch("/external-tickets/reviews/no-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_ids: selectedIds }),
    })
    if (!response.ok) {
      toast.error(await readError(response, "Vendimi nuk mund të ruhej."))
      return
    }
    toast.success(`${selectedIds.length} ticket-a u shënuan si pa veprim.`)
    setSelectedIds([])
    await loadTickets()
  }

  const markDetailNoAction = async () => {
    if (!detail || detail.review_status !== "PENDING") return
    const confirmed = await confirm({
      title: "S’ka nevojë për rregullim",
      description: `Konfirmo që ticket ${detail.order_ticket_number || detail.issue_number || ""} nuk ka nevojë për rregullim.`,
      confirmLabel: "Po, konfirmo",
      cancelLabel: "Anulo",
    })
    if (!confirmed) return
    setMarkingDetailNoAction(true)
    const response = await apiFetch("/external-tickets/reviews/no-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_ids: [detail.id] }),
    })
    if (!response.ok) {
      toast.error(await readError(response, "Vendimi nuk mund të ruhej."))
      setMarkingDetailNoAction(false)
      return
    }
    setDetail((current) => current ? { ...current, review_status: "NO_ACTION" } : current)
    setSelectedIds((current) => current.filter((id) => id !== detail.id))
    toast.success("Ticket-i u shënua si pa nevojë për rregullim.")
    await loadTickets()
    setMarkingDetailNoAction(false)
  }

  const openTaskDialog = async () => {
    if (!selectedIds.length) return
    setTaskTitle(`STD - ${selectedIds.length} TIK EXT PËR RREGULLIM`)
    setTaskDescription("")
    setReviewNote("")
    setTaskPriority("1H")
    setStartDate("")
    setDueDate("")
    setAssigneeIds([])
    setTaskDialogOpen(true)
    setOptionsLoading(true)
    const response = await apiFetch("/external-tickets/task-options")
    if (!response.ok) {
      toast.error(await readError(response, "Projektet dhe personat nuk mund të ngarkoheshin."))
      setOptionsLoading(false)
      return
    }
    const options = (await response.json()) as TaskOptions
    setTaskOptions(options)
    setProjectId(options.projects[0]?.id || "")
    setOptionsLoading(false)
  }

  const createTask = async () => {
    if (!projectId) {
      toast.error("Zgjidh projektin STD.")
      return
    }
    if (!assigneeIds.length) {
      toast.error("Zgjidh të paktën një person.")
      return
    }
    setCreatingTask(true)
    const dateIso = (value: string, endOfDay = false) => value
      ? new Date(`${value}T${endOfDay ? "17:00:00" : "08:00:00"}`).toISOString()
      : null
    const response = await apiFetch("/external-tickets/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticket_ids: selectedIds,
        project_id: projectId,
        assignee_ids: assigneeIds,
        title: taskTitle.trim() || null,
        description: taskDescription.trim() || null,
        review_note: reviewNote.trim() || null,
        priority: taskPriority,
        start_date: dateIso(startDate),
        due_date: dateIso(dueDate, true),
      }),
    })
    if (!response.ok) {
      toast.error(await readError(response, "Detyra nuk mund të krijohej."))
      setCreatingTask(false)
      return
    }
    const result = (await response.json()) as { task_ids: string[]; created: boolean }
    toast.success(result.created
      ? `U krijua GA Note dhe ${result.task_ids.length} detyrë/a në projektin STD.`
      : "Këta ticket-a ishin tashmë të lidhur me detyrën ekzistuese.")
    setCreatingTask(false)
    setTaskDialogOpen(false)
    setSelectedIds([])
    await loadTickets()
  }

  const downloadFile = async (file: Record<string, unknown>) => {
    if (!detail) return
    const fileId = String(file.id || "")
    if (!fileId) return
    const response = await apiFetch(`/external-tickets/${detail.id}/files/${encodeURIComponent(fileId)}`)
    if (!response.ok) {
      toast.error(await readError(response, "Attachment-i nuk mund të shkarkohej."))
      return
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = fileName(file)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
              <TicketCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">External Tickets</h1>
              <p className="text-sm text-muted-foreground">Shqyrto ticket-at externe të STD dhe ktheji direkt në detyra PrimeFlow.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Sinkronizimi i fundit: {formatDate(data.last_synchronized_at)}</span>
            {data.last_sync_error && user?.role === "ADMIN" ? (
              <span className="inline-flex items-center gap-1 text-red-600"><AlertCircle className="h-3.5 w-3.5" /> {data.last_sync_error}</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void exportExcel()} disabled={exporting || loading}>
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            {exporting ? "Duke eksportuar…" : "Export Excel"}
          </Button>
          {user?.role === "ADMIN" ? (
            <Button variant="outline" onClick={() => void syncNow()} disabled={syncing}>
              {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Sync now
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Gjithsej", value: data.total, detail: "ticket-a externe", icon: TicketCheck, tone: "bg-slate-950 text-white" },
          { label: "Pa shqyrtuar", value: pendingOnPage, detail: "në këtë faqe", icon: Clock3, tone: "bg-amber-50 text-amber-700" },
          { label: "Detyrë e krijuar", value: taskCreatedOnPage, detail: "në këtë faqe", icon: Wrench, tone: "bg-emerald-50 text-emerald-700" },
          { label: "Pa veprim", value: noActionOnPage, detail: "në këtë faqe", icon: CircleOff, tone: "bg-slate-100 text-slate-600" },
        ].map((card) => (
          <Card key={card.label} className="border-slate-200 shadow-none">
            <CardContent className="flex items-center justify-between p-4">
              <div><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</div><div className="mt-1 text-2xl font-semibold">{card.value}</div><div className="text-xs text-muted-foreground">{card.detail}</div></div>
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", card.tone)}><card.icon className="h-5 w-5" /></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200 shadow-none">
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.5fr)_repeat(4,minmax(145px,0.7fr))]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Kërko issue, order ticket, titull ose reporter…" className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1) }}><SelectTrigger className="w-full"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="open">Open tickets</SelectItem><SelectItem value="ALL">Të gjitha statuset</SelectItem>{data.statuses.filter((value) => value.toLowerCase() !== "open").map((value) => <SelectItem key={value} value={value}>{valueLabel(value)}</SelectItem>)}</SelectContent></Select>
            <Select value={categoryFilter} onValueChange={(value) => { setCategoryFilter(value); setPage(1) }}><SelectTrigger className="w-full"><SelectValue placeholder="Kategori" /></SelectTrigger><SelectContent><SelectItem value="ALL">Të gjitha kategoritë</SelectItem>{data.categories.map((value) => <SelectItem key={value} value={value}>{valueLabel(value)}</SelectItem>)}</SelectContent></Select>
            <Select value={priorityFilter} onValueChange={(value) => { setPriorityFilter(value); setPage(1) }}><SelectTrigger className="w-full"><SelectValue placeholder="Prioritet" /></SelectTrigger><SelectContent><SelectItem value="ALL">Të gjitha prioritetet</SelectItem>{data.priorities.map((value) => <SelectItem key={value} value={value}>{valueLabel(value)}</SelectItem>)}</SelectContent></Select>
            <Select value={reviewFilter} onValueChange={(value) => { setReviewFilter(value); setPage(1) }}><SelectTrigger className="w-full"><SelectValue placeholder="Review" /></SelectTrigger><SelectContent><SelectItem value="ALL">Të gjitha vendimet</SelectItem><SelectItem value="PENDING">Pa shqyrtuar</SelectItem><SelectItem value="TASK_CREATED">Detyrë e krijuar</SelectItem><SelectItem value="NO_ACTION">S’ka nevojë</SelectItem></SelectContent></Select>
          </div>
          <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" aria-label="Nga data" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1) }} className="w-auto" />
              <span className="text-xs text-muted-foreground">deri</span>
              <Input type="date" aria-label="Deri në datë" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1) }} className="w-auto" />
            </div>
            <Select value={sort} onValueChange={(value) => { setSort(value); setPage(1) }}><SelectTrigger className="w-full sm:w-[210px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="updated_at:desc">Më të fundit</SelectItem><SelectItem value="created_at:desc">Të raportuar së fundi</SelectItem><SelectItem value="issue_number:desc">Issue # zbritës</SelectItem><SelectItem value="issue_number:asc">Issue # ngritës</SelectItem></SelectContent></Select>
          </div>
        </CardContent>
      </Card>

      {selectedIds.length ? (
        <div className="sticky top-2 z-30 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm"><TicketCheck className="h-4 w-4" /><strong>{selectedIds.length}</strong> ticket-a të zgjedhur</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="border-slate-600 bg-transparent text-white hover:bg-slate-800 hover:text-white" onClick={() => void markNoAction()}><CircleOff className="mr-2 h-4 w-4" /> S’ka nevojë</Button>
            <Button size="sm" className="bg-white text-slate-950 hover:bg-slate-100" onClick={() => void openTaskDialog()}><Wrench className="mr-2 h-4 w-4" /> Krijo detyrë STD</Button>
          </div>
        </div>
      ) : null}

      <Card className="overflow-hidden border-slate-200 shadow-none">
        {error ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center"><div className="rounded-full bg-red-50 p-3 text-red-600"><AlertCircle className="h-6 w-6" /></div><div><div className="font-medium">Ngarkimi dështoi</div><div className="mt-1 text-sm text-muted-foreground">{error}</div></div><Button variant="outline" onClick={() => void loadTickets()}><RefreshCw className="mr-2 h-4 w-4" /> Provo përsëri</Button></div>
        ) : (
          <Table className="min-w-[850px] table-fixed" containerClassName="max-h-[660px] overflow-auto">
            <TableHeader className="sticky top-0 z-20 bg-slate-50">
              <TableRow>
                <TableHead className="w-11"><Checkbox checked={allPageSelected} onCheckedChange={(value) => toggleAll(Boolean(value))} aria-label="Zgjidh ticket-at në faqe" /></TableHead>
                <TableHead className="w-24 whitespace-nowrap">Issue #</TableHead><TableHead className="w-32 whitespace-nowrap">Order Ticket #</TableHead><TableHead className="w-72">Problem</TableHead><TableHead className="w-28">Status</TableHead><TableHead className="w-20 text-center">Files</TableHead><TableHead className="w-32">Source</TableHead><TableHead className="w-40">Vendimi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 7 }, (_, index) => <TableRow key={index}>{Array.from({ length: 8 }, (__, cell) => <TableCell key={cell}><div className="h-4 animate-pulse rounded bg-slate-100" /></TableCell>)}</TableRow>) : null}
              {!loading && !data.items.length ? (
                <TableRow><TableCell colSpan={8}><div className="flex min-h-72 flex-col items-center justify-center text-center"><div className="mb-3 rounded-full bg-slate-100 p-4 text-slate-500"><TicketCheck className="h-7 w-7" /></div><div className="font-medium">Nuk u gjet asnjë ticket extern</div><div className="mt-1 max-w-md text-sm text-muted-foreground">Ndrysho filtrat ose kërkoji administratorit të ekzekutojë sinkronizimin me STD.</div></div></TableCell></TableRow>
              ) : null}
              {!loading ? data.items.map((ticket) => {
                const disabled = ticket.review_status === "TASK_CREATED"
                return (
                  <TableRow key={ticket.id} className="cursor-pointer align-top hover:bg-slate-50/80" onClick={() => void openDetail(ticket)}>
                    <TableCell onClick={(event) => event.stopPropagation()}><Checkbox checked={selectedIds.includes(ticket.id)} disabled={disabled} onCheckedChange={(value) => toggleTicket(ticket.id, Boolean(value))} aria-label={`Zgjidh ticket ${ticket.issue_number || ticket.external_id}`} /></TableCell>
                    <TableCell className="font-semibold text-slate-950">{ticket.issue_number ? `#${ticket.issue_number}` : "—"}</TableCell>
                    <TableCell>{ticket.order_ticket_number || "—"}</TableCell>
                    <TableCell className="max-w-72"><div className="line-clamp-2 break-words text-sm text-slate-600">{ticket.description || "—"}</div></TableCell>
                    <TableCell>{ticket.status ? <Badge className={statusTone(ticket.status)}>{valueLabel(ticket.status)}</Badge> : "—"}</TableCell>
                    <TableCell className="text-center"><span className="inline-flex items-center gap-1 text-sm"><Paperclip className="h-3.5 w-3.5 text-muted-foreground" />{ticket.file_count}</span></TableCell>
                    <TableCell><Badge className="whitespace-nowrap border-blue-200 bg-blue-50 text-blue-700">STD External</Badge></TableCell>
                    <TableCell><ReviewBadge value={ticket.review_status} /></TableCell>
                  </TableRow>
                )
              }) : null}
            </TableBody>
          </Table>
        )}
        <div className="flex flex-col gap-3 border-t bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">{data.total ? `${(data.page - 1) * data.page_size + 1}–${Math.min(data.page * data.page_size, data.total)} nga ${data.total}` : "0 rezultate"}</div>
          <div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" /></Button><span className="min-w-24 text-center text-sm">Faqja {data.page} / {data.pages}</span><Button size="sm" variant="outline" disabled={page >= data.pages || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button></div>
        </div>
      </Card>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl lg:max-w-4xl">
          <SheetHeader className="border-b pr-12">
            <div className="flex flex-wrap items-center gap-2"><Badge className="border-blue-200 bg-blue-50 text-blue-700">STD External</Badge>{detail ? <ReviewBadge value={detail.review_status} /> : null}</div>
            <SheetTitle>{detail ? `${detail.issue_number ? `#${detail.issue_number} · ` : ""}${detail.title || "External ticket"}` : "External ticket"}</SheetTitle>
            <SheetDescription>{detail?.order_ticket_number ? `Order ticket: ${detail.order_ticket_number}` : "Detajet e sinkronizuara nga STD"}</SheetDescription>
          </SheetHeader>
          {!detailLoading && detail?.review_status === "PENDING" ? (
            <div className="px-4">
              <Button variant="outline" className="w-full border-slate-300 sm:w-auto" onClick={() => void markDetailNoAction()} disabled={markingDetailNoAction}>
                {markingDetailNoAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CircleOff className="mr-2 h-4 w-4" />}
                S’ka nevojë për rregullim
              </Button>
            </div>
          ) : null}
          {detailLoading ? <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : null}
          {!detailLoading && detail ? (
            <div className="space-y-6 px-4 pb-8">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[{ label: "Status", value: valueLabel(detail.status) }, { label: "Priority", value: valueLabel(detail.priority) }, { label: "Category", value: valueLabel(detail.category) }, { label: "Dashboard area", value: detail.dashboard_area || "—" }, { label: "Reporter", value: detail.reporter_username || "—" }, { label: "Reporter email", value: detail.reporter_email || "—" }, { label: "Created", value: formatDate(detail.reported_at) }, { label: "Updated", value: formatDate(detail.source_updated_at) }].map((item) => <div key={item.label} className="rounded-lg border bg-slate-50/60 p-3"><div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{item.label}</div><div className="mt-1 break-words text-sm font-medium">{item.value}</div></div>)}
              </div>
              <section><h3 className="mb-2 text-sm font-semibold">Problem / Description</h3><div className="whitespace-pre-wrap rounded-xl border bg-white p-4 text-sm leading-6 text-slate-700">{detail.description || "Pa përshkrim."}</div></section>
              {detail.affected_fields.length ? <section><h3 className="mb-2 text-sm font-semibold">Fushat e prekura</h3><div className="flex flex-wrap gap-2">{detail.affected_fields.map((field) => <Badge key={field} variant="outline">{field}</Badge>)}</div></section> : null}
              <section><h3 className="mb-2 text-sm font-semibold">Order information</h3>{Object.keys(detail.order_snapshot_json).length ? <div className="grid gap-px overflow-hidden rounded-xl border bg-slate-200 sm:grid-cols-2">{Object.entries(detail.order_snapshot_json).map(([key, value]) => <div key={key} className="bg-white p-3"><div className="text-xs text-muted-foreground">{valueLabel(key)}</div><div className="mt-1 break-words text-sm">{metadataText(value)}</div></div>)}</div> : <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nuk ka order snapshot.</div>}</section>
              <section><div className="mb-3 flex items-center gap-2"><MessageSquare className="h-4 w-4" /><h3 className="text-sm font-semibold">Comments ({detail.comments.length})</h3></div>{detail.comments.length ? <div className="space-y-3">{detail.comments.map((comment, index) => <div key={String(comment.id || index)} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><div className="text-sm font-medium">{commentAuthor(comment)}</div><div className="text-xs text-muted-foreground">{formatDate(String(comment.created_at || comment.updated_at || ""))}</div></div><div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{commentBody(comment) || "—"}</div></div>)}</div> : <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nuk ka komente.</div>}</section>
              <section><div className="mb-3 flex items-center gap-2"><Paperclip className="h-4 w-4" /><h3 className="text-sm font-semibold">Attachments ({detail.files.length})</h3></div>{detail.files.length ? <div className="space-y-2">{detail.files.map((file, index) => <div key={String(file.id || index)} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div className="flex min-w-0 items-center gap-3"><div className="rounded-lg bg-slate-100 p-2"><FileText className="h-4 w-4" /></div><div className="min-w-0"><div className="truncate text-sm font-medium">{fileName(file)}</div><div className="text-xs text-muted-foreground">{metadataText(file.size_bytes || file.size || file.content_type)}</div></div></div><Button size="sm" variant="outline" onClick={() => void downloadFile(file)}><Download className="mr-2 h-4 w-4" /> Shkarko</Button></div>)}</div> : <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nuk ka attachments.</div>}</section>
              {detail.review_note ? <section><h3 className="mb-2 text-sm font-semibold">Shënimi i review-t</h3><div className="rounded-xl border bg-slate-50 p-4 text-sm">{detail.review_note}</div></section> : null}
              {detail.task_id ? <Button asChild><a href={`/tasks/${detail.task_id}`}><Wrench className="mr-2 h-4 w-4" /> Hap detyrën e krijuar</a></Button> : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Krijo detyrë nga ticket-at STD</DialogTitle><DialogDescription>{selectedIds.length} ticket-a do të bëhen një shënim i ri te GA Notes dhe nga një detyrë për çdo person të zgjedhur.</DialogDescription></DialogHeader>
          {optionsLoading ? <div className="flex min-h-52 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
            <div className="space-y-5">
              {!taskOptions.projects.length ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Nuk u gjet projekt me fjalën kyçe “STD”. Kontrollo emrin e projektit ose STD_FEEDBACK_PROJECT_KEYWORDS në server.</div> : null}
              <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Projekti STD</Label><Select value={projectId} onValueChange={setProjectId}><SelectTrigger className="w-full"><SelectValue placeholder="Zgjidh projektin" /></SelectTrigger><SelectContent>{taskOptions.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.title}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Prioriteti / lloji</Label><Select value={taskPriority} onValueChange={setTaskPriority}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{TASK_TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div></div>
              <div className="space-y-2"><Label>Titulli bazë i detyrës</Label><Input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} /><p className="text-xs text-muted-foreground">{selectedAssignees.length ? <>Titulli final: {selectedAssignees.slice(0, 3).map((item) => `${userInitials(item.label)}: ${taskTitle || `STD - ${selectedIds.length} TIK EXT PËR RREGULLIM`}`).join(" · ")}{selectedAssignees.length > 3 ? " …" : ""}</> : "Inicialet shtohen automatikisht pasi të zgjidhet personi."}</p></div>
              <div className="space-y-2"><Label>Përshkrim shtesë <span className="font-normal text-muted-foreground">(opsional; lista e ticket-ave ruhet vetëm te shënimi)</span></Label><Textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} rows={3} placeholder="Udhëzime shtesë për personat që do ta rregullojnë…" /></div>
              <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Fillimi</Label><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div><div className="space-y-2"><Label>Afati</Label><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div></div>
              <div className="space-y-2"><Label>Personat e caktuar</Label><div className="grid max-h-56 gap-2 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2">{taskOptions.users.map((option) => <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-2 text-sm hover:bg-slate-50"><Checkbox checked={assigneeIds.includes(option.id)} onCheckedChange={(value) => setAssigneeIds((current) => Boolean(value) ? [...new Set([...current, option.id])] : current.filter((id) => id !== option.id))} /><span>{option.label}</span></label>)}</div></div>
              <div className="space-y-2"><Label>Shënim i review-t <span className="font-normal text-muted-foreground">(opsional)</span></Label><Textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={2} placeholder="Pse u zgjodhën këta ticket-a…" /></div>
              <div className="rounded-xl bg-slate-50 p-3"><div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Ticket-at në këtë detyrë</div><ol className="space-y-1 pl-5 text-sm">{selectedTickets.map((ticket) => <li key={ticket.id} className="list-decimal">{ticket.order_ticket_number || ticket.issue_number || ticket.external_id.slice(0, 8)}</li>)}</ol></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setTaskDialogOpen(false)} disabled={creatingTask}>Anulo</Button><Button onClick={() => void createTask()} disabled={creatingTask || optionsLoading || !projectId || !assigneeIds.length}>{creatingTask ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />} Krijo GA Note + detyrë</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
