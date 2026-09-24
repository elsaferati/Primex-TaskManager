"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, ArrowUpRight, CircleAlert, MoreHorizontal, Plus, Radio, Rss, Search, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useConfirm } from "@/components/providers/confirm-dialog-provider"
import { useAuth } from "@/lib/auth"
import type { User } from "@/lib/types"
import { SourceForm, toSourceInput } from "./source-form"
import type { NewsSource, NewsSourceInput } from "../types"

const typeLabels: Record<NewsSource["type"], string> = {
  WEBSITE: "Website", RSS: "RSS", LINKEDIN: "LinkedIn", FACEBOOK: "Facebook", API: "API", OTHER: "Other",
}

function collectionLabel(source: NewsSource, configured: boolean) {
  if (source.status === "PAUSED") return "Paused"
  if (source.type !== "LINKEDIN") return "No connector"
  if (!configured) return "Setup needed"
  if (source.pending_snapshot_id) return "Checking"
  if (source.last_error) return "Check failed"
  return source.last_checked_at ? "Monitoring" : "Ready"
}

export function SourcesAdminPage() {
  const { user, apiFetch } = useAuth()
  const confirm = useConfirm()
  return <SourcesAdminWorkspace user={user} apiFetch={apiFetch} confirm={confirm} />
}

export function SourcesAdminWorkspace({ user, apiFetch, confirm }: {
  user: Pick<User, "role"> | null
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
  confirm: ReturnType<typeof useConfirm>
}) {
  const [sources, setSources] = React.useState<NewsSource[]>([])
  const [configured, setConfigured] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<NewsSource | null>(null)
  const [checkingId, setCheckingId] = React.useState<string | null>(null)

  const load = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError("")
    try {
      const [sourcesResponse, statusResponse] = await Promise.all([
        apiFetch("/intelligence/sources"), apiFetch("/intelligence/status"),
      ])
      if (!sourcesResponse.ok || !statusResponse.ok) throw new Error("Could not load sources.")
      const [sourceData, statusData] = await Promise.all([sourcesResponse.json(), statusResponse.json()])
      setSources(sourceData)
      setConfigured(Boolean(statusData.linkedinConfigured))
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load sources.") }
    finally { if (!quiet) setLoading(false) }
  }, [apiFetch])

  React.useEffect(() => { if (user?.role === "ADMIN") void load() }, [load, user?.role])
  React.useEffect(() => {
    if (!configured || !sources.some((source) => source.pending_snapshot_id)) return
    const timer = window.setInterval(() => void load(true), 30_000)
    return () => window.clearInterval(timer)
  }, [configured, sources, load])

  const check = async (sourceId: string) => {
    setCheckingId(sourceId)
    try {
      const response = await apiFetch(`/intelligence/sources/${sourceId}/check`, { method: "POST" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(typeof payload?.detail === "string" ? payload.detail : "Could not check this source.")
      await load(true)
      if (payload.state === "error") toast.error("Post check failed. See the source status for details.")
      else toast.success(payload.state === "started" ? "Post check started. New posts will appear when it finishes." : payload.state === "completed" ? "Post check finished. Refresh the feed to see new posts." : "Post check is still running.")
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Could not check this source.") }
    finally { setCheckingId(null) }
  }

  const save = async (input: NewsSourceInput) => {
    const response = await apiFetch(editing ? `/intelligence/sources/${editing.id}` : "/intelligence/sources", {
      method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      throw new Error(typeof payload?.detail === "string" ? payload.detail : "Check the source URL and required fields.")
    }
    const saved = await response.json() as NewsSource
    await load()
    toast.success(editing ? "Source updated" : "Source added")
    if (!editing && input.type === "LINKEDIN" && configured && input.status === "ACTIVE") void check(saved.id)
  }

  const pause = async (source: NewsSource) => {
    const response = await apiFetch(`/intelligence/sources/${source.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...toSourceInput(source), status: source.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }),
    })
    if (!response.ok) { toast.error("Could not update source"); return }
    await load()
    toast.success(source.status === "ACTIVE" ? "Source paused" : "Source activated")
  }

  const remove = async (source: NewsSource) => {
    const accepted = await confirm({
      title: `Delete ${source.name}?`, description: "This will permanently remove the source and any collected posts it owns.",
      confirmLabel: "Delete source", variant: "destructive",
    })
    if (!accepted) return
    const response = await apiFetch(`/intelligence/sources/${source.id}`, { method: "DELETE" })
    if (!response.ok) { toast.error("Could not delete source"); return }
    await load()
    toast.success("Source deleted")
  }

  const visible = sources.filter((source) =>
    [source.name, source.url, source.type, ...source.categories].some((value) => value.toLowerCase().includes(search.toLowerCase())),
  )
  if (user?.role !== "ADMIN") return <div className="mx-auto max-w-2xl p-8"><h1 className="text-xl font-semibold">Sources are available to admins.</h1><Button asChild variant="link" className="mt-3 px-0"><Link href="/intelligence">Return to Intelligence</Link></Button></div>

  return <div className="-m-4 min-h-[calc(100vh-5rem)] bg-[#fafbf9] px-4 pb-16 pt-6 text-[#1d2b23] sm:px-7 lg:px-10 lg:pt-9"><div className="mx-auto max-w-[1180px]">
    <Link href="/intelligence" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#7b8b80] hover:text-[#314e3a]"><ArrowLeft className="size-3.5" /> Intelligence</Link>
    <div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#83958a]"><Radio className="size-3.5" /> Source management</div><h1 className="mt-2 text-[32px] font-semibold tracking-[-0.045em] sm:text-[38px]">News Sources</h1><p className="mt-1 text-sm text-[#758179]">Track public posts from selected LinkedIn profiles and company pages.</p></div><Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="size-4" /> Add Source</Button></div>
    {!loading && !configured ? <div role="status" className="mt-6 flex items-start gap-3 rounded-xl border border-[#e5e9df] bg-[#f5f7f1] px-4 py-3 text-sm text-[#586b58]"><CircleAlert className="mt-0.5 size-4 shrink-0" /><div><strong className="font-semibold">LinkedIn collection needs a provider connection.</strong><p className="mt-0.5 text-xs leading-5">You can save sources now. Checks will start after a Bright Data API token is configured on the server.</p></div></div> : null}
    <div className="mt-8 rounded-xl border border-[#e5eae4] bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0ec] p-4 sm:px-5"><div className="flex items-center gap-3"><h2 className="text-sm font-semibold">Sources</h2><span className="rounded-full bg-[#eff4ee] px-2 py-0.5 text-xs font-medium text-[#5f8068]">{sources.length}</span></div><div className="relative w-full sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#a2aea4]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sources" aria-label="Search sources" className="pl-9" /></div></div>
      {loading ? <div role="status" className="p-5">{[0, 1, 2].map((index) => <div key={index} className="flex animate-pulse gap-5 border-b border-[#f0f2ef] py-5"><span className="size-9 rounded-lg bg-[#edf1ec]" /><div className="flex-1"><div className="h-4 w-40 rounded bg-[#edf1ec]" /><div className="mt-2 h-3 w-2/3 rounded bg-[#f3f5f2]" /></div></div>)}</div> : error ? <div role="alert" className="px-5 py-12 text-center"><CircleAlert className="mx-auto size-6 text-[#a08a7a]" /><p className="mt-3 text-sm text-[#667267]">{error}</p><Button variant="outline" size="sm" className="mt-4" onClick={() => void load()}>Try again</Button></div> : visible.length ? <div className="divide-y divide-[#edf0ec]">{visible.map((source) => <div key={source.id} className="flex flex-wrap items-start gap-4 px-4 py-4 transition-colors hover:bg-[#fbfcfa] sm:px-5"><div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#eff4ee] text-[#5f8068]"><Rss className="size-[18px]" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-[#26382b]">{source.name}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${collectionLabel(source, configured) === "Monitoring" ? "bg-[#ebf4e9] text-[#4e7856]" : "bg-[#f0f1ef] text-[#788579]"}`}>{collectionLabel(source, configured)}</span></div><div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[#8b968d]"><span>{typeLabels[source.type]}</span><span>·</span><a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-[360px] items-center gap-1 truncate hover:text-[#4c7155] hover:underline">{source.url}<ArrowUpRight className="size-3 shrink-0" /></a></div><div className="mt-2 flex flex-wrap gap-1.5">{source.categories.map((category) => <span key={category} className="rounded bg-[#f4f6f3] px-2 py-0.5 text-[11px] text-[#738176]">{category}</span>)}</div>{source.last_error ? <p className="mt-2 text-xs text-[#9a6e61]">{source.last_error}</p> : null}</div><div className="hidden min-w-28 pt-1 text-xs text-[#8b978d] md:block">{source.last_checked_at ? `Checked ${new Date(source.last_checked_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : "Not checked yet"}</div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${source.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => { setEditing(source); setFormOpen(true) }}>Edit source</DropdownMenuItem>{source.type === "LINKEDIN" ? <DropdownMenuItem disabled={!configured || source.status !== "ACTIVE" || checkingId === source.id} onClick={() => void check(source.id)}>{source.pending_snapshot_id ? "Update check" : "Check now"}</DropdownMenuItem> : null}<DropdownMenuItem onClick={() => void pause(source)}>{source.status === "ACTIVE" ? "Pause" : "Activate"}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => void remove(source)}>Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>)}</div> : <div className="px-5 py-14 text-center"><Rss className="mx-auto size-7 text-[#a4b5a7]" /><h3 className="mt-3 text-sm font-semibold">{search ? "No sources found." : "No sources added yet."}</h3><p className="mt-1 text-sm text-[#87958a]">{search ? "Try another search term." : "Add a profile or company page to start monitoring."}</p>{!search ? <Button variant="outline" size="sm" className="mt-4" onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="size-3.5" /> Add source</Button> : null}</div>}</div>
    <div className="mt-5 flex items-center gap-2 text-xs text-[#819083]"><ShieldCheck className="size-4" /><span>Connected LinkedIn sources are checked at their selected interval. Public post availability depends on the provider.</span></div>
    <SourceForm open={formOpen} source={editing} onOpenChange={setFormOpen} onSave={save} />
  </div></div>
}
