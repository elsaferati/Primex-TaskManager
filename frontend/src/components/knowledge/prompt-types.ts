export type PromptStatus = "PENDING_TEST" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED"

export interface KnowledgeUserRef {
  id: string
  full_name?: string | null
}

export interface KnowledgePrompt {
  id: string
  title: string
  content: string
  keywords: string[]
  files_path?: string | null
  source_note_id?: string | null
  status: PromptStatus
  created_by?: KnowledgeUserRef | null
  tested_by?: KnowledgeUserRef | null
  tested_at?: string | null
  test_comment?: string | null
  approved_by?: KnowledgeUserRef | null
  approved_at?: string | null
  rejected_by?: KnowledgeUserRef | null
  rejected_at?: string | null
  rejection_reason?: string | null
  file_original_name?: string | null
  file_content_type?: string | null
  file_size?: number | null
  created_at: string
  updated_at: string
}

export interface PromptNoteTask {
  id: string
  title: string
  status: string
  assignee?: KnowledgeUserRef | null
  due_date?: string | null
  completed_at?: string | null
}

export interface PromptNote {
  id: string
  content: string
  status: "OPEN" | "CLOSED"
  priority?: "NORMAL" | "HIGH" | null
  department_id?: string | null
  is_converted_to_task: boolean
  created_by?: KnowledgeUserRef | null
  created_at: string
  updated_at: string
  completed_at?: string | null
  tasks: PromptNoteTask[]
  prompts: { id: string; title: string; status: PromptStatus }[]
}

export const PROMPT_STATUS_META: Record<PromptStatus, { label: string; className: string }> = {
  PENDING_TEST: { label: "Në testim", className: "border-amber-200 bg-amber-50 text-amber-800" },
  PENDING_APPROVAL: { label: "Në aprovim", className: "border-sky-200 bg-sky-50 text-sky-800" },
  APPROVED: { label: "Në librari", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  REJECTED: { label: "Kthyer mbrapa", className: "border-red-200 bg-red-50 text-red-700" },
}

export const TASK_STATUS_META: Record<string, { label: string; className: string }> = {
  TODO: { label: "Për t'u bërë", className: "border-slate-200 bg-slate-50 text-slate-700" },
  IN_PROGRESS: { label: "Në proces", className: "border-sky-200 bg-sky-50 text-sky-800" },
  WAITING_CLIENT: { label: "Pret klientin", className: "border-orange-200 bg-orange-50 text-orange-800" },
  WAITING_CONFIRMATION: { label: "Pret konfirmim", className: "border-violet-200 bg-violet-50 text-violet-800" },
  DONE: { label: "Kryer", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
}

export type PromptNoteStage = "NO_TASK" | "TASK_OPEN" | "READY" | "IN_REVIEW" | "DONE" | "CLOSED"

export function promptNoteStage(note: PromptNote): PromptNoteStage {
  if (note.prompts.some((p) => p.status === "APPROVED")) return "DONE"
  if (note.prompts.some((p) => p.status !== "APPROVED")) return "IN_REVIEW"
  if (note.status === "CLOSED") return "CLOSED"
  if (note.tasks.length === 0) return "NO_TASK"
  if (note.tasks.every((t) => t.status === "DONE")) return "READY"
  return "TASK_OPEN"
}

export const NOTE_STAGE_META: Record<PromptNoteStage, { label: string; className: string }> = {
  NO_TASK: { label: "Pa detyrë", className: "border-slate-200 bg-slate-50 text-slate-700" },
  TASK_OPEN: { label: "Pending · detyra në proces", className: "border-amber-200 bg-amber-50 text-amber-800" },
  READY: { label: "Detyra u krye · shto promptin", className: "border-violet-200 bg-violet-50 text-violet-800" },
  IN_REVIEW: { label: "Prompti në shqyrtim", className: "border-sky-200 bg-sky-50 text-sky-800" },
  DONE: { label: "Në Prompt Library", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  CLOSED: { label: "Mbyllur", className: "border-slate-200 bg-slate-100 text-slate-500" },
}

export function formatDate(value?: string | null) {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}
