"use client"

import * as React from "react"
import {
  Check,
  Circle,
  History,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Save,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

const STATUS_OPTIONS: Array<{ value: QuestionStatus | null; label: string }> = [
  { value: null, label: "Clear status" },
  { value: "DONE", label: "Done" },
  { value: "X", label: "X" },
  { value: "O", label: "O" },
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
    <div className="inline-grid grid-cols-4 overflow-hidden rounded-md border bg-background">
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

  const activeCategory = categories.find((item) => item.id === activeCategoryId) || null

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
    const text = newQuestion.trim()
    if (!activeCategory || !text) return
    setSaving(true)
    try {
      const response = await apiFetch(`/question-library/categories/${activeCategory.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      if (!response.ok) throw new Error(await responseError(response, "Failed to add question"))
      setNewQuestion("")
      await loadCategories(activeCategory.id)
      toast.success("Question added")
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
      <header className="mb-4 flex min-h-16 items-center justify-between gap-4 border border-[#b8dded] bg-[#e9f8fd] px-4 py-3">
        <h1 className="text-xl font-bold text-[#071126]">PYETJE PËR BARAZIM</h1>
        <Badge variant="outline" className="bg-white">{activeCategory?.questions.length || 0} pyetje</Badge>
      </header>

      <section className="border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-[280px] flex-1 gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
            Kategoria e pyetjeve
            <Select value={activeCategoryId} onValueChange={setActiveCategoryId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Zgjidh kategorinë" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <table className="w-full min-w-[820px] table-fixed border-collapse text-sm">
            <thead className="bg-[#e7edf5] text-xs uppercase text-[#071126]">
              <tr>
                <th className="w-14 border-r border-[#183b68] px-2 py-3 text-center">NR</th>
                <th className="border-r border-[#183b68] px-3 py-3 text-left">{activeCategory?.name || "Pyetje"}</th>
                <th className="w-56 border-r border-[#183b68] px-3 py-3 text-center">Users</th>
                <th className="w-44 border-r border-[#183b68] px-3 py-3 text-center">Status</th>
                {canManage && <th className="w-28 px-3 py-3 text-center">Edit / Fshi</th>}
              </tr>
            </thead>
            <tbody>
              {!activeCategory || activeCategory.questions.length === 0 ? (
                <tr><td colSpan={canManage ? 5 : 4} className="px-4 py-10 text-center text-muted-foreground">Nuk ka pyetje të definuara për këtë kategori.</td></tr>
              ) : activeCategory.questions.map((question, index) => {
                const isEditing = editingQuestion?.id === question.id
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
                          <Input value={editText} onChange={(event) => setEditText(event.target.value)} maxLength={2000} />
                          <Input value={editGuidance} onChange={(event) => setEditGuidance(event.target.value)} placeholder="Udhëzimi / shpjegimi" maxLength={2000} />
                        </div>
                      ) : (
                        <div className="grid gap-1">
                          <span>{question.text}</span>
                          {question.guidance && <span className="text-xs font-normal text-muted-foreground">{question.guidance}</span>}
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
                          <Badge key={item.user_id} variant="outline" className="bg-white" title={`${item.full_name}: ${item.status}`}>
                            {initials(item.full_name)} <StatusIcon status={item.status} className="size-3" />
                          </Badge>
                        )) : <span className="text-muted-foreground">-</span>}
                        {canViewHistory && <History className="size-3.5 text-muted-foreground" />}
                      </button>
                    </td>
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
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              value={newQuestion}
              onChange={(event) => setNewQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void createQuestion()
              }}
              placeholder="Shto pyetje të re në këtë kategori..."
              maxLength={2000}
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
