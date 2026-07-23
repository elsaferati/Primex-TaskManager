"use client"

import * as React from "react"
import {
  Check,
  ChevronDown,
  Circle,
  History,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { useConfirm } from "@/components/providers/confirm-dialog-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

type QuestionStatus = "DONE" | "X" | "O"

type QuestionStatusSummary = {
  user_id: string
  full_name: string
  status: QuestionStatus
  updated_at: string
}

type QuestionDefinition = {
  id: string
  category_id: string
  text: string
  guidance: string | null
  sort_order: number
  current_user_status: QuestionStatus | null
  statuses: QuestionStatusSummary[]
  created_at: string
  updated_at: string
}

type QuestionCategory = {
  id: string
  name: string
  sort_order: number
  questions: QuestionDefinition[]
  created_at: string
  updated_at: string
}

type QuestionStatusEvent = {
  id: string
  user_id: string | null
  full_name: string
  status: QuestionStatus | null
  created_at: string
}

type QuestionLibraryUser = {
  id: string
  full_name: string | null
}

const STATUS_OPTIONS: Array<{ value: QuestionStatus | null; label: string }> = [
  { value: "DONE", label: "Done" },
  { value: "X", label: "X" },
]

function initials(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "-"
}

function StatusIcon({ status, className }: { status: QuestionStatus | null; className?: string }) {
  if (status === "DONE") return <Check className={cn("text-emerald-700", className)} />
  if (status === "X") return <X className={cn("text-red-600", className)} />
  if (status === "O") return <Circle className={cn("text-amber-600", className)} />
  return <Minus className={cn("text-muted-foreground", className)} />
}

function StatusControls({
  value,
  disabled,
  onChange,
}: {
  value: QuestionStatus | null
  disabled: boolean
  onChange: (status: QuestionStatus | null) => void
}) {
  return (
    <div className="inline-grid grid-cols-2 overflow-hidden rounded-md border bg-background">
      {STATUS_OPTIONS.map((option) => (
        <button
          key={option.value ?? "clear"}
          type="button"
          title={option.label}
          aria-label={option.label}
          aria-pressed={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex size-9 items-center justify-center border-r transition-colors last:border-r-0 disabled:cursor-not-allowed disabled:opacity-50",
            value === option.value ? "bg-accent" : "hover:bg-muted"
          )}
        >
          <StatusIcon status={option.value} className="size-4" />
        </button>
      ))}
    </div>
  )
}

async function responseError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { detail?: string }
    return body.detail || fallback
  } catch {
    return fallback
  }
}

export function PrimeflowQuestionsPage() {
  const { apiFetch, user } = useAuth()
  const confirm = useConfirm()
  const canManage = Boolean(user)
  const canDelete = user?.role === "ADMIN"
  const canViewHistory = user?.role === "ADMIN" || user?.role === "MANAGER"
  const [categories, setCategories] = React.useState<QuestionCategory[]>([])
  const [activeCategoryId, setActiveCategoryId] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [newCategory, setNewCategory] = React.useState("")
  const [categorySearch, setCategorySearch] = React.useState("")
  const categorySearchRef = React.useRef<HTMLInputElement>(null)
  const [newQuestion, setNewQuestion] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [statusQuestionId, setStatusQuestionId] = React.useState<string | null>(null)
  const [editingQuestion, setEditingQuestion] = React.useState<QuestionDefinition | null>(null)
  const [editText, setEditText] = React.useState("")
  const [editGuidance, setEditGuidance] = React.useState("")
  const [editOrder, setEditOrder] = React.useState(1)
  const [categoryDialogOpen, setCategoryDialogOpen] = React.useState(false)
  const [categoryName, setCategoryName] = React.useState("")
  const [historyQuestion, setHistoryQuestion] = React.useState<QuestionDefinition | null>(null)
  const [history, setHistory] = React.useState<QuestionStatusEvent[]>([])
  const [historyLoading, setHistoryLoading] = React.useState(false)
  const [statusUsers, setStatusUsers] = React.useState<QuestionLibraryUser[]>([])
  const [statusUsersLoaded, setStatusUsersLoaded] = React.useState(false)

  const loadCategories = React.useCallback(async (preferredCategoryId?: string) => {
    try {
      const response = await apiFetch("/question-library")
      if (!response.ok) throw new Error(await responseError(response, "Failed to load questions"))
      const data = (await response.json()) as QuestionCategory[]
      setCategories(data)
      setActiveCategoryId((current) => {
        const preferred = preferredCategoryId || current
        return data.some((item) => item.id === preferred) ? preferred : (data[0]?.id || "")
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load questions")
    } finally {
      setLoading(false)
    }
  }, [apiFetch])

  React.useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  React.useEffect(() => {
    if (!canViewHistory) {
      setStatusUsers([])
      setStatusUsersLoaded(false)
      return
    }

    let cancelled = false
    const loadStatusUsers = async () => {
      try {
        const response = await apiFetch("/users/lookup")
        if (!response.ok) throw new Error(await responseError(response, "Failed to load users"))
        const data = (await response.json()) as QuestionLibraryUser[]
        if (!cancelled) setStatusUsers(data)
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Failed to load users")
      } finally {
        if (!cancelled) setStatusUsersLoaded(true)
      }
    }

    void loadStatusUsers()
    return () => {
      cancelled = true
    }
  }, [apiFetch, canViewHistory])

  const activeCategory = categories.find((item) => item.id === activeCategoryId) || null
  const filteredCategories = React.useMemo(() => {
    const query = categorySearch.trim().toLocaleLowerCase()
    if (!query) return categories
    return categories.filter((category) => category.name.toLocaleLowerCase().includes(query))
  }, [categories, categorySearch])

  const createCategory = async () => {
    const name = newCategory.trim()
    if (!name) return
    setSaving(true)
    try {
      const response = await apiFetch("/question-library/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!response.ok) throw new Error(await responseError(response, "Failed to add category"))
      const created = (await response.json()) as QuestionCategory
      setNewCategory("")
      await loadCategories(created.id)
      toast.success("Category added")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add category")
    } finally {
      setSaving(false)
    }
  }

  const createQuestion = async () => {
    const questionsToCreate = newQuestion
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    if (!activeCategory || questionsToCreate.length === 0) return
    setSaving(true)
    try {
      for (const text of questionsToCreate) {
        const response = await apiFetch(`/question-library/categories/${activeCategory.id}/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        })
        if (!response.ok) throw new Error(await responseError(response, "Failed to add question"))
      }
      setNewQuestion("")
      await loadCategories(activeCategory.id)
      toast.success(questionsToCreate.length === 1 ? "Question added" : `${questionsToCreate.length} questions added`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add question")
    } finally {
      setSaving(false)
    }
  }

  const openCategoryEditor = () => {
    if (!activeCategory) return
    setCategoryName(activeCategory.name)
    setCategoryDialogOpen(true)
  }

  const saveCategory = async () => {
    if (!activeCategory || !categoryName.trim()) return
    setSaving(true)
    try {
      const response = await apiFetch(`/question-library/categories/${activeCategory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: categoryName.trim() }),
      })
      if (!response.ok) throw new Error(await responseError(response, "Failed to update category"))
      setCategoryDialogOpen(false)
      await loadCategories(activeCategory.id)
      toast.success("Category updated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update category")
    } finally {
      setSaving(false)
    }
  }

  const deleteCategory = async () => {
    if (!activeCategory) return
    const approved = await confirm({
      title: "Delete category",
      description: `Delete “${activeCategory.name}” and all of its questions and status history permanently?`,
      confirmLabel: "Delete",
      variant: "destructive",
    })
    if (!approved) return
    try {
      const response = await apiFetch(`/question-library/categories/${activeCategory.id}`, { method: "DELETE" })
      if (!response.ok) throw new Error(await responseError(response, "Failed to delete category"))
      await loadCategories()
      toast.success("Category deleted")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete category")
    }
  }

  const startQuestionEdit = (question: QuestionDefinition) => {
    setEditingQuestion(question)
    setEditText(question.text)
    setEditGuidance(question.guidance || "")
    setEditOrder(question.sort_order + 1)
  }

  const saveQuestion = async () => {
    if (!editingQuestion || !activeCategory || !editText.trim()) return
    setSaving(true)
    try {
      const response = await apiFetch(`/question-library/questions/${editingQuestion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: editText.trim(),
          guidance: editGuidance.trim() || null,
          sort_order: Math.max(0, editOrder - 1),
        }),
      })
      if (!response.ok) throw new Error(await responseError(response, "Failed to update question"))
      setEditingQuestion(null)
      await loadCategories(activeCategory.id)
      toast.success("Question updated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update question")
    } finally {
      setSaving(false)
    }
  }

  const deleteQuestion = async (question: QuestionDefinition) => {
    if (!activeCategory) return
    const approved = await confirm({
      title: "Delete question",
      description: "Delete this question and all of its status history permanently?",
      confirmLabel: "Delete",
      variant: "destructive",
    })
    if (!approved) return
    try {
      const response = await apiFetch(`/question-library/questions/${question.id}`, { method: "DELETE" })
      if (!response.ok) throw new Error(await responseError(response, "Failed to delete question"))
      await loadCategories(activeCategory.id)
      toast.success("Question deleted")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete question")
    }
  }

  const updateStatus = async (question: QuestionDefinition, status: QuestionStatus | null) => {
    setStatusQuestionId(question.id)
    try {
      const response = await apiFetch(`/question-library/questions/${question.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) throw new Error(await responseError(response, "Failed to update status"))
      await loadCategories(question.category_id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update status")
    } finally {
      setStatusQuestionId(null)
    }
  }

  const openHistory = async (question: QuestionDefinition) => {
    if (!canViewHistory) return
    setHistoryQuestion(question)
    setHistory([])
    setHistoryLoading(true)
    try {
      const response = await apiFetch(`/question-library/questions/${question.id}/status-history`)
      if (!response.ok) throw new Error(await responseError(response, "Failed to load status history"))
      setHistory((await response.json()) as QuestionStatusEvent[])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load status history")
    } finally {
      setHistoryLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-w-0 bg-[#f5f7fb] p-4 sm:p-5">
      <header className="mb-4 flex min-h-16 items-center justify-between gap-4 border border-[#d7dee8] border-l-4 border-l-[#183b68] bg-white px-4 py-3 shadow-sm">
        <h1 className="text-xl font-bold text-[#071126]">PYETJE PËR BARAZIM</h1>
        <Badge
          className="min-w-20 justify-center border-[#183b68] bg-[#183b68] px-3 py-1 text-xs font-semibold text-white tabular-nums"
          aria-label={`${activeCategory?.questions.length ?? 0} pyetje`}
        >
          {activeCategory?.questions.length ?? 0} PYETJE
        </Badge>
      </header>

      <section className="border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-[280px] flex-1 gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
            Kategoria e pyetjeve
            <DropdownMenu
              onOpenChange={(open) => {
                if (!open) setCategorySearch("")
              }}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm font-normal normal-case text-foreground shadow-xs outline-none transition-[color,box-shadow] hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className="truncate">
                    {activeCategory?.name || "Zgjidh kategorinë"}
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={4}
                className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]"
                onOpenAutoFocus={(event) => {
                  event.preventDefault()
                  requestAnimationFrame(() => categorySearchRef.current?.focus())
                }}
              >
                <div
                  className="relative mb-1"
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={categorySearchRef}
                    value={categorySearch}
                    onChange={(event) => setCategorySearch(event.target.value)}
                    placeholder="Kërko kategori..."
                    className="h-8 pl-8 text-sm font-normal normal-case"
                  />
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {filteredCategories.map((category) => (
                    <DropdownMenuItem
                      key={category.id}
                      onSelect={() => setActiveCategoryId(category.id)}
                      className="font-normal normal-case"
                    >
                      <span className="truncate">{category.name}</span>
                      {category.id === activeCategoryId && <Check className="ml-auto size-4" />}
                    </DropdownMenuItem>
                  ))}
                  {filteredCategories.length === 0 && (
                    <div className="px-2 py-2 text-sm font-normal normal-case text-muted-foreground">
                      Nuk u gjet kategori
                    </div>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </label>
          {canManage && activeCategory && (
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={openCategoryEditor} title="Edit category" aria-label="Edit category">
                <Pencil />
              </Button>
              {canDelete && (
                <Button variant="outline" size="icon" onClick={() => void deleteCategory()} title="Delete category" aria-label="Delete category" className="text-destructive">
                  <Trash2 />
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void createCategory()
            }}
            placeholder="Shto kategori të re të pyetjes..."
            maxLength={200}
          />
          <Button onClick={() => void createCategory()} disabled={saving || !newCategory.trim()}>
            <Plus /> Add category
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto border border-[#183b68]">
          <table className={cn("w-full table-fixed border-collapse text-sm", canViewHistory ? "min-w-[1040px]" : "min-w-[820px]")}>
            <thead className="bg-[#e7edf5] text-xs uppercase text-[#071126]">
              <tr>
                <th className="w-14 border-r border-[#183b68] px-2 py-3 text-center">NR</th>
                <th className="border-r border-[#183b68] px-3 py-3 text-left">{activeCategory?.name || "Pyetje"}</th>
                <th className="w-56 border-r border-[#183b68] px-3 py-3 text-center">Users</th>
                {canViewHistory && <th className="w-56 border-r border-[#183b68] px-3 py-3 text-center">Pending</th>}
                <th className="w-44 border-r border-[#183b68] px-3 py-3 text-center">Status</th>
                {canManage && <th className="w-28 px-3 py-3 text-center">Edit / Fshi</th>}
              </tr>
            </thead>
            <tbody>
              {!activeCategory || activeCategory.questions.length === 0 ? (
                <tr><td colSpan={4 + Number(canViewHistory) + Number(canManage)} className="px-4 py-10 text-center text-muted-foreground">Nuk ka pyetje të definuara për këtë kategori.</td></tr>
              ) : activeCategory.questions.map((question, index) => {
                const isEditing = editingQuestion?.id === question.id
                const usersWithStatus = new Set(question.statuses.map((item) => item.user_id))
                const pendingUsers = statusUsers.filter(
                  (item) =>
                    !["GA", "KA"].includes(initials(item.full_name || "")) &&
                    !usersWithStatus.has(item.id)
                )
                return (
                  <tr key={question.id} className="border-t border-[#183b68] bg-[#f7fbff] align-middle">
                    <td className="border-r border-[#183b68] px-2 py-3 text-center">
                      {isEditing ? (
                        <Input
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={String(editOrder)}
                          onChange={(event) => {
                            const value = event.target.value.replace(/\D/g, "")
                            setEditOrder(value ? Number(value) : 1)
                          }}
                          onFocus={(event) => event.currentTarget.select()}
                          className="mx-auto h-7 w-10 border-0 bg-transparent px-0 text-center text-sm font-medium shadow-none outline-none focus-visible:ring-0"
                        />
                      ) : index + 1}
                    </td>
                    <td className="border-r border-[#183b68] px-3 py-3 font-medium text-[#071126]">
                      {isEditing ? (
                        <div className="grid gap-2">
                          <Textarea
                            value={editText}
                            onChange={(event) => setEditText(event.target.value)}
                            maxLength={2000}
                            autoResize
                            rows={1}
                            className="min-h-9 resize-none whitespace-pre-wrap py-1.5"
                          />
                          <Textarea
                            value={editGuidance}
                            onChange={(event) => setEditGuidance(event.target.value)}
                            placeholder="Udhëzimi / shpjegimi"
                            maxLength={2000}
                            autoResize
                            rows={1}
                            className="min-h-9 resize-none whitespace-pre-wrap py-1.5"
                          />
                        </div>
                      ) : (
                        <div className="grid gap-1">
                          <span className="whitespace-pre-wrap">{question.text}</span>
                          {question.guidance && <span className="whitespace-pre-wrap text-xs font-normal text-muted-foreground">{question.guidance}</span>}
                        </div>
                      )}
                    </td>
                    <td className="border-r border-[#183b68] px-3 py-3 text-center">
                      <button
                        type="button"
                        disabled={!canViewHistory}
                        onClick={() => void openHistory(question)}
                        className={cn("inline-flex min-h-8 max-w-full flex-wrap items-center justify-center gap-1.5 rounded-md px-1", canViewHistory && "hover:bg-muted")}
                        title={canViewHistory ? "View status history" : undefined}
                      >
                        {question.statuses.length ? question.statuses.map((item) => (
                          <Badge
                            key={item.user_id}
                            variant="outline"
                            className={cn(
                              "bg-white",
                              canViewHistory && "border-emerald-300 bg-emerald-50 text-emerald-800"
                            )}
                            title={`${item.full_name}: ${item.status}`}
                          >
                            {initials(item.full_name)} <StatusIcon status={item.status} className="size-3" />
                          </Badge>
                        )) : <span className="text-muted-foreground">-</span>}
                        {canViewHistory && <History className="size-3.5 text-muted-foreground" />}
                      </button>
                    </td>
                    {canViewHistory && (
                      <td className="border-r border-[#183b68] px-3 py-3 text-center">
                        {!statusUsersLoaded ? (
                          <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                        ) : pendingUsers.length ? (
                          <div className="flex flex-wrap justify-center gap-1">
                            {pendingUsers.map((item) => (
                              <Badge
                                key={item.id}
                                variant="outline"
                                className="border-red-300 bg-red-50 font-normal text-red-700"
                                title={item.full_name || "Pa emër"}
                              >
                                {initials(item.full_name || "")}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    )}
                    <td className="border-r border-[#183b68] px-3 py-3 text-center">
                      <StatusControls value={question.current_user_status} disabled={statusQuestionId === question.id} onChange={(value) => void updateStatus(question, value)} />
                    </td>
                    {canManage && (
                      <td className="px-3 py-3 text-center">
                        {isEditing ? (
                          <div className="flex justify-center gap-1">
                            <Button size="icon-sm" onClick={() => void saveQuestion()} disabled={saving || !editText.trim()} title="Save" aria-label="Save"><Save /></Button>
                            <Button size="icon-sm" variant="outline" onClick={() => setEditingQuestion(null)} title="Cancel" aria-label="Cancel"><X /></Button>
                          </div>
                        ) : (
                          <div className="flex justify-center gap-1">
                            <Button size="icon-sm" variant="outline" onClick={() => startQuestionEdit(question)} title="Edit" aria-label="Edit"><Pencil /></Button>
                            {canDelete && (
                              <Button size="icon-sm" variant="outline" onClick={() => void deleteQuestion(question)} title="Fshi" aria-label="Fshi" className="text-destructive"><Trash2 /></Button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {activeCategory && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
            <Textarea
              value={newQuestion}
              onChange={(event) => setNewQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void createQuestion()
              }}
              placeholder="Shto pyetje të re në këtë kategori..."
              maxLength={2000}
              autoResize
              rows={1}
              className="min-h-9 resize-none py-1.5"
            />
            <Button onClick={() => void createQuestion()} disabled={saving || !newQuestion.trim()}>
              <Plus /> Add
            </Button>
          </div>
        )}
      </section>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
            <DialogDescription>Update the category name.</DialogDescription>
          </DialogHeader>
          <Input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} maxLength={200} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveCategory()} disabled={saving || !categoryName.trim()}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(historyQuestion)} onOpenChange={(open) => { if (!open) setHistoryQuestion(null) }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Status history</DialogTitle>
            <DialogDescription className="line-clamp-2">{historyQuestion?.text}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto border">
            {historyLoading ? (
              <div className="flex min-h-32 items-center justify-center"><Loader2 className="size-5 animate-spin" /></div>
            ) : history.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No status history yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs uppercase">
                  <tr><th className="px-3 py-2">User</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Time</th></tr>
                </thead>
                <tbody>
                  {history.map((event) => (
                    <tr key={event.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{event.full_name}</td>
                      <td className="px-3 py-2"><span className="inline-flex items-center gap-2"><StatusIcon status={event.status} className="size-4" />{event.status || "Cleared"}</span></td>
                      <td className="px-3 py-2 text-muted-foreground">{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
