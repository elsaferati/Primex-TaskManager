"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCopy,
  FileText,
  FolderOpen,
  ListPlus,
  Loader2,
  Lock,
  NotebookPen,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  CreateTaskDialog,
  PromptDetailDialog,
  PromptFormDialog,
  PromptStatusBadge,
  TaskStatusBadge,
  copyText,
} from "@/components/knowledge/prompt-dialogs"
import { Highlight, excerpt, indexPrompts, normalizeText, searchPrompts } from "@/components/knowledge/prompt-search"
import {
  NOTE_STAGE_META,
  formatDate,
  promptNoteStage,
  type KnowledgePrompt,
  type PromptNote,
  type PromptNoteStage,
  type PromptStatus,
} from "@/components/knowledge/prompt-types"
import { useAuth } from "@/lib/auth"
import type { Department, UserLookup } from "@/lib/types"
import { fetchUsersLookupCached } from "@/lib/users-cache"
import { cn } from "@/lib/utils"

type LibraryFilter = "APPROVED" | "PENDING_TEST" | "PENDING_APPROVAL" | "REJECTED" | "ALL"
type SortMode = "relevance" | "recent" | "az"

const LIBRARY_FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: "APPROVED", label: "Libraria" },
  { id: "PENDING_TEST", label: "Në testim" },
  { id: "PENDING_APPROVAL", label: "Në aprovim" },
  { id: "REJECTED", label: "Kthyer mbrapa" },
  { id: "ALL", label: "Të gjitha" },
]

/* ========================================================================== */
/* Prompt Library                                                             */
/* ========================================================================== */

function PromptCard({
  prompt,
  query,
  activeKeywords,
  onOpen,
  onKeyword,
}: {
  prompt: KnowledgePrompt
  query: string
  activeKeywords: string[]
  onOpen: () => void
  onKeyword: (kw: string) => void
}) {
  const preview = excerpt(prompt.content, query, 260)
  return (
    <Card className="group flex flex-col gap-0 py-0 shadow-none transition-colors hover:border-primary/40">
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col gap-2 p-4 text-left">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug">
            <Highlight text={prompt.title} query={query} />
          </h3>
          {prompt.status !== "APPROVED" ? <PromptStatusBadge status={prompt.status} /> : null}
        </div>
        {preview ? (
          <p className="line-clamp-4 whitespace-pre-line font-mono text-[12px] leading-relaxed text-muted-foreground">
            <Highlight text={preview} query={query} />
          </p>
        ) : prompt.file_original_name ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            {prompt.file_original_name}
          </p>
        ) : null}
      </button>
      <div className="space-y-2 border-t px-4 py-3">
        {prompt.keywords.length ? (
          <div className="flex flex-wrap gap-1">
            {prompt.keywords.map((kw) => {
              const active = activeKeywords.some((a) => normalizeText(a) === normalizeText(kw))
              return (
                <button
                  type="button"
                  key={kw}
                  onClick={() => onKeyword(kw)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                    active ? "border-primary bg-primary text-primary-foreground" : "bg-secondary/60 hover:bg-secondary"
                  )}
                >
                  #<Highlight text={kw} query={query} />
                </button>
              )
            })}
          </div>
        ) : null}
        {prompt.files_path ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
            <code className="min-w-0 flex-1 truncate" title={prompt.files_path}>
              <Highlight text={prompt.files_path} query={query} />
            </code>
            <button
              type="button"
              aria-label="Kopjo path"
              className="rounded p-0.5 hover:bg-muted hover:text-foreground"
              onClick={() => void copyText(prompt.files_path!, "Path u kopjua")}
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">
            {prompt.created_by?.full_name || "—"} · {formatDate(prompt.approved_at || prompt.updated_at)}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={!prompt.content}
            onClick={() => void copyText(prompt.content, "Prompti u kopjua")}
          >
            <ClipboardCopy className="h-3.5 w-3.5" />
            Kopjo
          </Button>
        </div>
      </div>
    </Card>
  )
}

function PromptLibrary({
  prompts,
  loading,
  onOpen,
  onAdd,
}: {
  prompts: KnowledgePrompt[]
  loading: boolean
  onOpen: (p: KnowledgePrompt) => void
  onAdd: () => void
}) {
  const { user } = useAuth()
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<LibraryFilter>("APPROVED")
  const [keywords, setKeywords] = React.useState<string[]>([])
  const [sort, setSort] = React.useState<SortMode>("relevance")
  const searchRef = React.useRef<HTMLInputElement | null>(null)
  const deferredQuery = React.useDeferredValue(query)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      if (e.key === "/" && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER"
  const counts = React.useMemo(() => {
    const c: Record<LibraryFilter, number> = { APPROVED: 0, PENDING_TEST: 0, PENDING_APPROVAL: 0, REJECTED: 0, ALL: prompts.length }
    for (const p of prompts) c[p.status as PromptStatus] += 1
    return c
  }, [prompts])
  const actionable = React.useCallback(
    (p: KnowledgePrompt) =>
      (p.status === "PENDING_TEST" && p.created_by?.id !== user?.id) ||
      (p.status === "PENDING_APPROVAL" && isManager && p.created_by?.id !== user?.id && p.tested_by?.id !== user?.id),
    [isManager, user?.id]
  )

  const scoped = React.useMemo(
    () => (filter === "ALL" ? prompts : prompts.filter((p) => p.status === filter)),
    [prompts, filter]
  )
  const index = React.useMemo(() => indexPrompts(scoped), [scoped])
  const results = React.useMemo(() => {
    const hits = searchPrompts(index, deferredQuery, keywords)
    const hasQuery = deferredQuery.trim().length > 0
    const effectiveSort: SortMode = sort === "relevance" && !hasQuery ? "recent" : sort
    hits.sort((a, b) => {
      if (effectiveSort === "relevance" && b.score !== a.score) return b.score - a.score
      if (effectiveSort === "az") return a.prompt.title.localeCompare(b.prompt.title)
      return (b.prompt.approved_at || b.prompt.updated_at).localeCompare(a.prompt.approved_at || a.prompt.updated_at)
    })
    return hits.map((h) => h.prompt)
  }, [index, deferredQuery, keywords, sort])

  const topKeywords = React.useMemo(() => {
    const freq = new Map<string, { label: string; n: number }>()
    for (const p of scoped) {
      for (const kw of p.keywords) {
        const key = normalizeText(kw)
        const cur = freq.get(key)
        if (cur) cur.n += 1
        else freq.set(key, { label: kw, n: 1 })
      }
    }
    return [...freq.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).slice(0, 18)
  }, [scoped])

  const toggleKeyword = (kw: string) =>
    setKeywords((prev) =>
      prev.some((k) => normalizeText(k) === normalizeText(kw))
        ? prev.filter((k) => normalizeText(k) !== normalizeText(kw))
        : [...prev, kw]
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setQuery("") }}
            placeholder="Kërko prompt sipas titullit, keywords, tekstit ose path…  (#amazon = vetëm keyword)"
            className="h-11 pl-10 pr-16 text-base"
            aria-label="Kërko promptet"
          />
          {query ? (
            <button type="button" aria-label="Pastro kërkimin" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 text-xs text-muted-foreground">/</kbd>
          )}
        </div>
        <div className="flex gap-2">
          <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
            <SelectTrigger className="h-11 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Më relevantet</SelectItem>
              <SelectItem value="recent">Më të rejat</SelectItem>
              <SelectItem value="az">A – Z</SelectItem>
            </SelectContent>
          </Select>
          <Button className="h-11" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            Shto prompt
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {LIBRARY_FILTERS.map((f) => {
          const pendingForMe = f.id !== "ALL" && f.id !== "APPROVED" ? prompts.filter((p) => p.status === f.id && actionable(p)).length : 0
          return (
            <button
              type="button"
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                filter === f.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              {f.label}
              <span className={cn("tabular-nums", filter === f.id ? "opacity-80" : "text-muted-foreground")}>{counts[f.id]}</span>
              {pendingForMe ? (
                <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white" title="Presin veprimin tuaj">{pendingForMe}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      {topKeywords.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Keywords:</span>
          {topKeywords.map(({ label, n }) => {
            const active = keywords.some((k) => normalizeText(k) === normalizeText(label))
            return (
              <button
                type="button"
                key={label}
                onClick={() => toggleKeyword(label)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                #{label} <span className="opacity-60">{n}</span>
              </button>
            )
          })}
          {keywords.length ? (
            <button type="button" onClick={() => setKeywords([])} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
              pastro
            </button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Promptet po ngarkohen…
        </div>
      ) : results.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="py-14 text-center">
            {scoped.length === 0 ? (
              <>
                <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-medium">
                  {filter === "APPROVED" ? "Libraria është ende bosh." : "Asnjë prompt në këtë status."}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Promptet shfaqen këtu pasi testohen dhe aprovohen nga menaxheri.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">Asnjë prompt për “{query || keywords.map((k) => `#${k}`).join(" ")}”.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Provo më pak fjalë, një keyword tjetër, ose kërko te{" "}
                  <button type="button" className="underline" onClick={() => setFilter("ALL")}>të gjitha statuset</button>.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {results.length} {results.length === 1 ? "prompt" : "prompte"}
          </p>
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {results.map((p) => (
              <PromptCard
                key={p.id}
                prompt={p}
                query={deferredQuery}
                activeKeywords={keywords}
                onOpen={() => onOpen(p)}
                onKeyword={toggleKeyword}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ========================================================================== */
/* Prompt Notes                                                               */
/* ========================================================================== */

const STAGE_FILTERS: { id: PromptNoteStage | "ALL" | "ACTIVE"; label: string }[] = [
  { id: "ACTIVE", label: "Aktive" },
  { id: "NO_TASK", label: "Pa detyrë" },
  { id: "TASK_OPEN", label: "Pending" },
  { id: "READY", label: "Gati për prompt" },
  { id: "IN_REVIEW", label: "Në shqyrtim" },
  { id: "DONE", label: "Në librari" },
  { id: "ALL", label: "Të gjitha" },
]

const STEP_ORDER: PromptNoteStage[] = ["NO_TASK", "TASK_OPEN", "READY", "IN_REVIEW", "DONE"]

function StageProgress({ stage }: { stage: PromptNoteStage }) {
  const labels = ["Shënim", "Detyrë", "Prompt", "Test & aprovim", "Librari"]
  const reached = stage === "CLOSED" ? 0 : STEP_ORDER.indexOf(stage)
  return (
    <div className="flex items-center gap-1" aria-label={`Faza: ${NOTE_STAGE_META[stage].label}`}>
      {labels.map((label, i) => (
        <div key={label} className="flex items-center gap-1">
          <span
            title={label}
            className={cn(
              "h-1.5 w-8 rounded-full",
              i <= reached ? (stage === "DONE" ? "bg-emerald-500" : "bg-primary") : "bg-muted"
            )}
          />
        </div>
      ))}
    </div>
  )
}

function PromptNotes({
  notes,
  loading,
  users,
  departments,
  prompts,
  reload,
  onAddPrompt,
  onOpenPrompt,
}: {
  notes: PromptNote[]
  loading: boolean
  users: UserLookup[]
  departments: Department[]
  prompts: KnowledgePrompt[]
  reload: () => Promise<void>
  onAddPrompt: (note: PromptNote) => void
  onOpenPrompt: (p: KnowledgePrompt) => void
}) {
  const { apiFetch, user } = useAuth()
  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER"
  const [content, setContent] = React.useState("")
  const [priority, setPriority] = React.useState<"NORMAL" | "HIGH">("NORMAL")
  const [departmentId, setDepartmentId] = React.useState<string>("")
  const [posting, setPosting] = React.useState(false)
  const [filter, setFilter] = React.useState<(typeof STAGE_FILTERS)[number]["id"]>("ACTIVE")
  const [query, setQuery] = React.useState("")
  const [taskNote, setTaskNote] = React.useState<PromptNote | null>(null)

  React.useEffect(() => {
    if (!departmentId && user?.department_id) setDepartmentId(user.department_id)
  }, [departmentId, user?.department_id])

  const save = async () => {
    if (content.trim().length < 2) return toast.error("Shkruaj kërkesën për prompt")
    setPosting(true)
    try {
      const res = await apiFetch("/knowledge/prompt-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), priority, department_id: departmentId || null }),
      })
      if (!res.ok) {
        let msg = "Shënimi nuk u ruajt"
        try {
          const d = (await res.json()) as { detail?: string }
          if (typeof d.detail === "string") msg = d.detail
        } catch {
          // ignore
        }
        toast.error(msg)
        return
      }
      setContent("")
      setPriority("NORMAL")
      toast.success("Shënimi u ruajt · shfaqet edhe te PX Notes")
      await reload()
    } finally {
      setPosting(false)
    }
  }

  const setNoteStatus = async (note: PromptNote, status: "OPEN" | "CLOSED") => {
    const res = await apiFetch(`/knowledge/prompt-notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) return toast.error("Statusi nuk u ndryshua")
    await reload()
  }

  const staged = React.useMemo(() => notes.map((n) => ({ note: n, stage: promptNoteStage(n) })), [notes])
  const counts = React.useMemo(() => {
    const c = new Map<string, number>()
    for (const { stage } of staged) c.set(stage, (c.get(stage) || 0) + 1)
    c.set("ALL", staged.length)
    c.set("ACTIVE", staged.filter((s) => s.stage !== "DONE" && s.stage !== "CLOSED").length)
    return c
  }, [staged])
  const visible = React.useMemo(() => {
    const q = normalizeText(query.trim())
    return staged.filter(({ note, stage }) => {
      if (filter === "ACTIVE" && (stage === "DONE" || stage === "CLOSED")) return false
      if (filter !== "ACTIVE" && filter !== "ALL" && stage !== filter) return false
      if (!q) return true
      const hay = normalizeText(
        [note.content, note.created_by?.full_name, ...note.tasks.map((t) => `${t.title} ${t.assignee?.full_name || ""}`), ...note.prompts.map((p) => p.title)].join(" ")
      )
      return q.split(/\s+/).every((t) => hay.includes(t))
    })
  }, [staged, filter, query])

  return (
    <div className="space-y-4">
      <Card className="gap-0 py-0 shadow-none">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold">Kërkesë e re për prompt</p>
          </div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save() }}
            placeholder="Çfarë prompti na duhet? p.sh. Prompt për krijimin e Amazon bullet points për programet e MST…"
            className="max-h-60 min-h-20"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={priority} onValueChange={(v) => setPriority(v as "NORMAL" | "HIGH")}>
              <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NORMAL">Normal</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
              </SelectContent>
            </Select>
            {isManager || !user?.department_id ? (
              <Select value={departmentId || undefined} onValueChange={setDepartmentId}>
                <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Departamenti" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : null}
            <span className="flex-1 text-xs text-muted-foreground">Ruhet te Prompt Notes dhe shfaqet automatikisht edhe te PX Notes.</span>
            <Button onClick={() => void save()} disabled={posting || content.trim().length < 2}>
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Ruaj shënimin
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {STAGE_FILTERS.map((f) => (
            <button
              type="button"
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                filter === f.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              {f.label}
              <span className={cn("tabular-nums", filter === f.id ? "opacity-80" : "text-muted-foreground")}>{counts.get(f.id) || 0}</span>
            </button>
          ))}
        </div>
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kërko te shënimet…" className="pl-8" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Shënimet po ngarkohen…
        </div>
      ) : visible.length === 0 ? (
        <Card className="border-dashed shadow-none">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {notes.length === 0 ? "Ende nuk ka kërkesa për prompte. Shkruaj të parën më lart." : "Asnjë shënim për këtë filtër."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map(({ note, stage }) => {
            const meta = NOTE_STAGE_META[stage]
            const canAddPrompt = note.tasks.length > 0 && (stage === "READY" || stage === "TASK_OPEN")
            const canManage = isManager || note.created_by?.id === user?.id
            return (
              <Card key={note.id} className={cn("gap-0 py-0 shadow-none", stage === "READY" && "border-violet-300")}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={cn("font-medium", meta.className)}>{meta.label}</Badge>
                      {note.priority === "HIGH" ? <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">High</Badge> : null}
                      <StageProgress stage={stage} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {note.created_by?.full_name || "—"} · {formatDate(note.created_at)}
                    </span>
                  </div>

                  <p className="whitespace-pre-wrap text-sm">{note.content}</p>

                  {note.tasks.length ? (
                    <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2.5">
                      {note.tasks.map((t) => (
                        <div key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                          <TaskStatusBadge status={t.status} />
                          <span className="min-w-0 flex-1 truncate">{t.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {t.assignee?.full_name || "—"}
                            {t.due_date ? ` · afati ${formatDate(t.due_date)}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {note.prompts.length ? (
                    <div className="flex flex-wrap gap-2">
                      {note.prompts.map((p) => {
                        const full = prompts.find((x) => x.id === p.id)
                        return (
                          <button
                            type="button"
                            key={p.id}
                            onClick={() => full && onOpenPrompt(full)}
                            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted/50"
                          >
                            <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                            <span className="font-medium">{p.title}</span>
                            <PromptStatusBadge status={p.status} />
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )
                      })}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {canManage && note.status === "OPEN" && stage !== "DONE" ? (
                      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void setNoteStatus(note, "CLOSED")}>
                        <Lock className="h-3.5 w-3.5" /> Mbyll
                      </Button>
                    ) : null}
                    {canManage && stage === "CLOSED" ? (
                      <Button variant="ghost" size="sm" onClick={() => void setNoteStatus(note, "OPEN")}>Rihap</Button>
                    ) : null}
                    {stage === "NO_TASK" ? (
                      <Button size="sm" onClick={() => setTaskNote(note)}>
                        <ListPlus className="h-4 w-4" /> Krijo detyrë
                      </Button>
                    ) : null}
                    {canAddPrompt ? (
                      <Button
                        size="sm"
                        variant={stage === "READY" ? "default" : "outline"}
                        className={cn(stage === "READY" && "bg-violet-600 hover:bg-violet-700")}
                        onClick={() => onAddPrompt(note)}
                      >
                        <Sparkles className="h-4 w-4" /> Shto promptin
                      </Button>
                    ) : null}
                    {stage === "DONE" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Kërkesa u plotësua
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <CreateTaskDialog
        note={taskNote}
        users={users}
        departments={departments}
        onClose={() => setTaskNote(null)}
        onCreated={() => void reload()}
      />
    </div>
  )
}

/* ========================================================================== */
/* Page                                                                       */
/* ========================================================================== */

function PromptsPageInner() {
  const { apiFetch } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const view = searchParams.get("view") === "notes" ? "notes" : "library"

  const [prompts, setPrompts] = React.useState<KnowledgePrompt[]>([])
  const [notes, setNotes] = React.useState<PromptNote[]>([])
  const [users, setUsers] = React.useState<UserLookup[]>([])
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [loadingPrompts, setLoadingPrompts] = React.useState(true)
  const [loadingNotes, setLoadingNotes] = React.useState(true)

  const [detail, setDetail] = React.useState<KnowledgePrompt | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<KnowledgePrompt | null>(null)
  const [sourceNote, setSourceNote] = React.useState<PromptNote | null>(null)

  const loadPrompts = React.useCallback(async () => {
    const res = await apiFetch("/knowledge/prompts")
    if (res.ok) setPrompts((await res.json()) as KnowledgePrompt[])
    else toast.error("Promptet nuk u ngarkuan")
    setLoadingPrompts(false)
  }, [apiFetch])
  const loadNotes = React.useCallback(async () => {
    const res = await apiFetch("/knowledge/prompt-notes")
    if (res.ok) setNotes((await res.json()) as PromptNote[])
    else toast.error("Shënimet nuk u ngarkuan")
    setLoadingNotes(false)
  }, [apiFetch])
  const reloadAll = React.useCallback(async () => {
    await Promise.all([loadPrompts(), loadNotes()])
  }, [loadPrompts, loadNotes])

  React.useEffect(() => {
    void reloadAll()
    void fetchUsersLookupCached(apiFetch).then((data) => { if (data) setUsers(data as UserLookup[]) })
    void apiFetch("/departments").then(async (res) => { if (res.ok) setDepartments((await res.json()) as Department[]) })
  }, [apiFetch, reloadAll])

  const setView = (next: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === "notes") params.set("view", "notes")
    else params.delete("view")
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const onSaved = (saved: KnowledgePrompt) => {
    setPrompts((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)])
    if (detail?.id === saved.id) setDetail(saved)
    void loadNotes()
  }

  const readyCount = notes.filter((n) => promptNoteStage(n) === "READY").length
  const approvedCount = prompts.filter((p) => p.status === "APPROVED").length

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Link href="/knowledge/prompts" className="hover:text-foreground">Knowledge PX</Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Prompts</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Libraria e prompteve të testuara dhe aprovuara të PrimEx. Kërkesat e reja nisin te Notes, bëhen detyrë,
          dhe pasi prompti testohet nga një koleg dhe aprovohet nga menaxheri, ruhet këtu.
        </p>
      </div>

      <Tabs value={view} onValueChange={setView}>
        <TabsList>
          <TabsTrigger value="library">
            Prompt Library <span className="ml-1 tabular-nums text-muted-foreground">{approvedCount}</span>
          </TabsTrigger>
          <TabsTrigger value="notes">
            Notes
            {readyCount ? (
              <span className="ml-1 rounded-full bg-violet-600 px-1.5 text-[10px] font-bold text-white">{readyCount}</span>
            ) : null}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="library" className="mt-5">
          <PromptLibrary
            prompts={prompts}
            loading={loadingPrompts}
            onOpen={setDetail}
            onAdd={() => { setEditing(null); setSourceNote(null); setFormOpen(true) }}
          />
        </TabsContent>
        <TabsContent value="notes" className="mt-5">
          <PromptNotes
            notes={notes}
            loading={loadingNotes}
            users={users}
            departments={departments}
            prompts={prompts}
            reload={reloadAll}
            onAddPrompt={(note) => { setEditing(null); setSourceNote(note); setFormOpen(true) }}
            onOpenPrompt={setDetail}
          />
        </TabsContent>
      </Tabs>

      <PromptFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        prompt={editing}
        sourceNote={sourceNote}
        onSaved={onSaved}
      />
      <PromptDetailDialog
        prompt={detail}
        onClose={() => setDetail(null)}
        onChanged={(p) => { onSaved(p); setDetail(p) }}
        onDeleted={(id) => { setPrompts((prev) => prev.filter((p) => p.id !== id)); setDetail(null); void loadNotes() }}
        onEdit={(p) => { setDetail(null); setEditing(p); setSourceNote(null); setFormOpen(true) }}
      />
    </div>
  )
}

export default function KnowledgePromptsPage() {
  return (
    <React.Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">Duke ngarkuar…</div>}>
      <PromptsPageInner />
    </React.Suspense>
  )
}
