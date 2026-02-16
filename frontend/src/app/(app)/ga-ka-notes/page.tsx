"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Clock, Image as ImageIcon, Printer, Mic, Square } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BoldOnlyEditor } from "@/components/bold-only-editor"
import { useAuth } from "@/lib/auth"
import { formatDepartmentName } from "@/lib/department-name"
import { useCloudDictation } from "@/lib/useCloudDictation"
import { useSpeechDictation } from "@/lib/useSpeechDictation"
import type { Department, GaNote, GaNoteAttachment, Project, Task, TaskAssignee, TaskFinishPeriod, TaskPriority, UserLookup } from "@/lib/types"

type NoteType = "GA" | "KA"
type NotePriority = "NORMAL" | "HIGH" | "NONE"

const TYPE_BADGE: Record<NoteType, string> = {
  GA: "bg-amber-100 text-amber-800 border-amber-200",
  KA: "bg-cyan-100 text-cyan-800 border-cyan-200",
}

const PRIORITY_BADGE: Record<Exclude<NotePriority, "NONE">, string> = {
  NORMAL: "bg-emerald-100 text-emerald-800 border-emerald-200",
  HIGH: "bg-rose-100 text-rose-800 border-rose-200",
}

const NOTE_TO_TASK_PRIORITY: Record<NotePriority, TaskPriority> = {
  NONE: "NORMAL",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
}

const PRIORITY_OPTIONS: TaskPriority[] = ["NORMAL", "HIGH"]
const TASK_TYPE_OPTIONS_NO_PROJECT = ["NORMAL", "R1", "1H", "PERSONAL", "BLLOK"] as const
const TASK_TYPE_OPTIONS_WITH_PROJECT: TaskPriority[] = ["NORMAL", "HIGH"]
type TaskTypeOption = typeof TASK_TYPE_OPTIONS_NO_PROJECT[number] | TaskPriority
const FINISH_PERIOD_OPTIONS: TaskFinishPeriod[] = ["AM", "PM"]
const FINISH_PERIOD_NONE_VALUE = "__none__"
const TASK_PRIORITY_STYLES: Record<string, string> = {
  HIGH: "bg-rose-50 text-rose-700",
  NORMAL: "bg-blue-50 text-blue-700",
}
const TASK_STATUS_STYLES: Record<string, { label: string; dot: string; pill: string }> = {
  TODO: { label: "TODO", dot: "bg-slate-500", pill: "bg-slate-100 text-slate-700" },
  IN_PROGRESS: { label: "In progress", dot: "bg-amber-500", pill: "bg-amber-50 text-amber-700" },
  DONE: { label: "Done", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700" },
}
const MAX_ATTACHMENT_FILES = 20
const MAX_ATTACHMENT_MB = 25
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024

type NormalizedTaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "UNKNOWN"
type TaskStatusFilter = "all" | "notes" | "tasks" | "open" | "closed" | NormalizedTaskStatus

function normalizeTaskStatus(value?: string | null): NormalizedTaskStatus {
  if (!value) return "UNKNOWN"
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_")
  if (["todo", "to_do", "to-do", "to do"].includes(normalized)) return "TODO"
  if (["in_progress", "in-progress", "in progress"].includes(normalized)) return "IN_PROGRESS"
  if (["done"].includes(normalized)) return "DONE"
  return "UNKNOWN"
}

function aggregateTaskStatus(statuses: Array<string | null | undefined>): NormalizedTaskStatus {
  const normalized = statuses.map((status) => {
    const value = normalizeTaskStatus(status)
    return value === "UNKNOWN" ? "TODO" : value
  })
  if (normalized.length === 0) return "UNKNOWN"
  const allDone = normalized.every((status) => status === "DONE")
  if (allDone) return "DONE"
  const anyInProgress = normalized.some((status) => status === "IN_PROGRESS")
  if (anyInProgress) return "IN_PROGRESS"
  const anyDone = normalized.some((status) => status === "DONE")
  if (anyDone) return "IN_PROGRESS"
  return "TODO"
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  const date = new Date(value)
  const day = date.getDate().toString().padStart(2, "0")
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  let hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, "0")
  const ampm = hours >= 12 ? "PM" : "AM"
  hours = hours % 12
  hours = hours ? hours : 12 // the hour '0' should be '12'
  const hoursStr = hours.toString().padStart(2, "0")
  return `${day}.${month}, ${hoursStr}:${minutes} ${ampm}`
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes)) return "-"
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
}

function getInitials(label: string) {
  const trimmed = label.trim()
  if (!trimmed) return "?"
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function getDueTone(value?: string | null) {
  if (!value) return "text-slate-500"
  const due = new Date(value)
  const now = new Date()
  if (Number.isNaN(due.getTime())) return "text-slate-500"
  if (due.getTime() < now.getTime()) return "text-rose-600"
  const hoursLeft = (due.getTime() - now.getTime()) / 3_600_000
  return hoursLeft <= 24 ? "text-amber-600" : "text-slate-600"
}

function abbreviateDepartmentName(name: string): string {
  const lowerName = name.toLowerCase()
  if (lowerName.includes("development")) return "DEV"
  if (lowerName.includes("graphic") && lowerName.includes("design")) return "GDS"
  if (lowerName.includes("product") && lowerName.includes("content")) return "PCM"
  if (lowerName.includes("project content")) return "PCM"
  // Return first 3 letters as fallback
  return name.slice(0, 3).toUpperCase()
}

export default function GaKaNotesPage() {
  const { user, apiFetch } = useAuth()
  const searchParams = useSearchParams()
  const [notes, setNotes] = React.useState<GaNote[]>([])
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [projects, setProjects] = React.useState<Project[]>([])
  const [users, setUsers] = React.useState<UserLookup[]>([])

  // Initialize from URL parameters if present
  const urlDepartmentId = searchParams.get("department_id")
  const urlProjectId = searchParams.get("project_id")
  const [departmentId, setDepartmentId] = React.useState(urlDepartmentId || "ALL")
  const [projectId, setProjectId] = React.useState(urlProjectId || "NONE")
  const [content, setContent] = React.useState("")
  const [noteType] = React.useState<NoteType>("GA")
  const [priority] = React.useState<NotePriority>("NONE")
  const [loading, setLoading] = React.useState(false)
  const [posting, setPosting] = React.useState(false)
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([])
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [taskDialogNoteId, setTaskDialogNoteId] = React.useState<string | null>(null)
  const [creatingTask, setCreatingTask] = React.useState(false)
  const [rangeFilter, setRangeFilter] = React.useState<"week" | "all">("week")
  const [noteTypeFilter, setNoteTypeFilter] = React.useState<"all" | "GA" | "KA">("all")
  const [taskStatusFilter, setTaskStatusFilter] = React.useState<TaskStatusFilter>("all")
  const [exportingDailyReport, setExportingDailyReport] = React.useState(false)
  const [taskTitle, setTaskTitle] = React.useState("")
  const [taskDescription, setTaskDescription] = React.useState("")
  const [taskPriority, setTaskPriority] = React.useState<TaskTypeOption>("NORMAL")
  const [taskFinishPeriod, setTaskFinishPeriod] = React.useState<TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE>(
    FINISH_PERIOD_NONE_VALUE
  )
  const [taskDueDate, setTaskDueDate] = React.useState("")
  const [taskStartDate, setTaskStartDate] = React.useState("")
  const [taskAssigneeIds, setTaskAssigneeIds] = React.useState<string[]>([])
  const [taskDepartmentIds, setTaskDepartmentIds] = React.useState<string[]>([])
  const [taskProjectId, setTaskProjectId] = React.useState("NONE")
  const [noteTaskInfo, setNoteTaskInfo] = React.useState<
    Map<string, {
      assignees: TaskAssignee[]
      description: string | null
      taskId: string | null
      taskDepartmentId: string | null
      taskProjectId: string | null
      taskStatus: string | null
      taskStatuses: string[]
    }>
  >(new Map())
  const [editNoteId, setEditNoteId] = React.useState<string | null>(null)
  const [editContent, setEditContent] = React.useState("")
  const [editDescription, setEditDescription] = React.useState("")
  const [savingEdit, setSavingEdit] = React.useState(false)
  const [attachmentsDialogOpen, setAttachmentsDialogOpen] = React.useState(false)
  const [attachmentsDialogNoteId, setAttachmentsDialogNoteId] = React.useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = React.useState<string | null>(null)
  const [voiceLanguage, setVoiceLanguage] = React.useState<"en" | "sq">("en")
  const speechLang = voiceLanguage === "sq" ? "sq-AL" : "en-US"
  const cloudLang = voiceLanguage === "sq" ? "sq" : "en"

  const {
    isSupported: isVoiceSupported,
    isListening: isVoiceListening,
    interimText: voiceInterimText,
    stop: stopVoice,
    toggle: toggleVoice,
  } = useSpeechDictation({
    lang: speechLang,
    onFinalText: (text) => {
      const finalText = text.trim()
      if (!finalText) return
      setContent((prev) => {
        const base = prev ?? ""
        const needsSeparator = base.length > 0 && !/\s$/.test(base)
        const separator = needsSeparator ? "\n" : ""
        return `${base}${separator}${finalText}`
      })
    },
  })

  const {
    isSupported: isCloudSupported,
    isRecording: isCloudRecording,
    isTranscribing: isCloudTranscribing,
    stop: stopCloud,
    toggle: toggleCloud,
  } = useCloudDictation({
    apiFetch,
    lang: cloudLang,
    onFinalText: (text) => {
      const finalText = text.trim()
      if (!finalText) return
      setContent((prev) => {
        const base = prev ?? ""
        const needsSeparator = base.length > 0 && !/\s$/.test(base)
        const separator = needsSeparator ? "\n" : ""
        return `${base}${separator}${finalText}`
      })
    },
  })

  const voiceMode = isVoiceSupported ? "browser" : isCloudSupported ? "cloud" : "none"

  React.useEffect(() => {
    if (posting && isVoiceListening) stopVoice()
    if (posting && isCloudRecording) stopCloud()
  }, [isCloudRecording, isVoiceListening, posting, stopCloud, stopVoice])

  React.useEffect(() => {
    if (voiceMode === "browser" && isCloudRecording) stopCloud()
    if (voiceMode === "cloud" && isVoiceListening) stopVoice()
  }, [isCloudRecording, isVoiceListening, stopCloud, stopVoice, voiceMode])

  const handleVoiceToggle = () => {
    if (voiceMode === "browser") {
      toggleVoice()
      return
    }
    if (voiceMode === "cloud") {
      toggleCloud()
      return
    }
    toast.error("Voice dictation not supported in this browser")
  }


  const loadDepartments = React.useCallback(async () => {
    const res = await apiFetch("/departments")
    if (res?.ok) {
      setDepartments((await res.json()) as Department[])
    }
  }, [apiFetch])

  const loadUsers = React.useCallback(async () => {
    const res = await apiFetch(user?.role === "STAFF" ? "/users/lookup" : "/users")
    if (res?.ok) {
      setUsers((await res.json()) as UserLookup[])
    }
  }, [apiFetch, user?.role])

  const loadProjects = React.useCallback(
    async (deptId?: string) => {
      const query = deptId ? `?department_id=${deptId}` : ""
      const res = await apiFetch(`/projects${query}`)
      if (res?.ok) {
        setProjects((await res.json()) as Project[])
      }
    },
    [apiFetch]
  )



  const fetchNotes = React.useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      let url = "/ga-notes"
      const params = new URLSearchParams()
      if (projectId !== "NONE") {
        params.set("project_id", projectId)
      } else if (departmentId !== "ALL") {
        params.set("department_id", departmentId)
      }
      url += params.toString() ? `?${params}` : ""
      const res = await apiFetch(url)
      if (res?.ok) {
        setNotes((await res.json()) as GaNote[])
      } else {
        toast.error("Could not load GA/KA notes")
      }
    } finally {
      setLoading(false)
    }
  }, [apiFetch, departmentId, projectId, user])

  // Sync state with URL parameters when they change
  React.useEffect(() => {
    const urlDeptId = searchParams.get("department_id")
    const urlProjId = searchParams.get("project_id")
    if (urlDeptId) {
      setDepartmentId(urlDeptId)
    }
    if (urlProjId) {
      setProjectId(urlProjId)
    }
  }, [searchParams])

  React.useEffect(() => {
    void loadDepartments()
  }, [loadDepartments])

  React.useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  React.useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  React.useEffect(() => {
    void fetchNotes()
  }, [fetchNotes])

  // Load tasks linked to notes to show assignees/descriptions
  React.useEffect(() => {
    const loadNoteTasks = async () => {
      if (!notes.length) {
        setNoteTaskInfo(new Map())
        return
      }
      // Wait for users to be loaded before processing
      if (users.length === 0) {
        return
      }
      const res = await apiFetch("/tasks?include_done=true&include_all_departments=true")
      if (!res?.ok) return
      const data = (await res.json()) as Task[]
      const userMapById = new Map(users.map((u) => [u.id, u]))

      const map = new Map<string, {
        assignees: TaskAssignee[]
        description: string | null
        taskId: string | null
        taskDepartmentId: string | null
        taskProjectId: string | null
        taskStatus: string | null
        taskStatuses: string[]
      }>()
      const mergeAssignees = (base: TaskAssignee[], incoming: TaskAssignee[]) => {
        const result: TaskAssignee[] = []
        const seen = new Set<string>()
        const add = (assignee: TaskAssignee) => {
          const key =
            assignee.id ||
            assignee.username ||
            assignee.full_name ||
            assignee.email ||
            Math.random().toString()
          if (seen.has(key)) return
          seen.add(key)
          result.push(assignee)
        }
        base.forEach(add)
        incoming.forEach(add)
        return result
      }
      for (const t of data) {
        if (!t.ga_note_origin_id) continue
        let assignees: TaskAssignee[] = []
        if (t.assignees && t.assignees.length > 0) {
          // Use TaskAssignee directly from API - it has all the info we need for display
          assignees = t.assignees
        }
        if (assignees.length === 0 && t.assigned_to) {
          // Fallback to assigned_to if no assignees in TaskAssignee table
          const fallback = userMapById.get(t.assigned_to)
          if (fallback) {
            // Convert UserLookup to TaskAssignee format for consistency
            assignees = [{
              id: fallback.id,
              email: null,
              username: fallback.username || null,
              full_name: fallback.full_name || null,
              department_id: fallback.department_id || null,
            }]
          }
        }
        const existing = map.get(t.ga_note_origin_id)
        map.set(t.ga_note_origin_id, {
          assignees: mergeAssignees(existing?.assignees ?? [], assignees),
          description: existing?.description ?? t.description ?? null,
          taskId: existing?.taskId ?? t.id,
          taskDepartmentId: existing?.taskDepartmentId ?? t.department_id ?? null,
          taskProjectId: existing?.taskProjectId ?? t.project_id ?? null,
          taskStatus: existing?.taskStatus ?? t.status ?? null,
          taskStatuses: [...(existing?.taskStatuses ?? []), t.status ?? ""],
        })
      }
      setNoteTaskInfo(map)
    }
    void loadNoteTasks()
  }, [apiFetch, notes, users])



  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files || [])
    if (incoming.length === 0) return

    const combined = [...selectedFiles, ...incoming]
    if (combined.length > MAX_ATTACHMENT_FILES) {
      toast.error(`You can upload up to ${MAX_ATTACHMENT_FILES} files.`)
    }

    const limited = combined.slice(0, MAX_ATTACHMENT_FILES)
    const filtered = limited.filter((file) => {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`"${file.name}" exceeds ${MAX_ATTACHMENT_MB}MB.`)
        return false
      }
      return true
    })

    setSelectedFiles(filtered)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index))
  }

  const uploadNoteAttachments = async (noteId: string, files: File[]) => {
    const buildFormData = (includeNoteId: boolean) => {
      const formData = new FormData()
      if (includeNoteId) {
        formData.append("note_id", noteId)
      }
      files.forEach((file) => formData.append("files", file))
      return formData
    }

    const encodedNoteId = encodeURIComponent(noteId)
    let res = await apiFetch(`/ga-notes/${encodedNoteId}/attachments`, {
      method: "POST",
      body: buildFormData(false),
    })

    if (res?.status === 404) {
      res = await apiFetch("/ga-notes/attachments", {
        method: "POST",
        body: buildFormData(true),
      })
    }

    if (!res?.ok) {
      const errorText = await res.text()
      throw new Error(errorText || "upload_failed")
    }
    return (await res.json()) as GaNoteAttachment[]
  }

  const downloadAttachment = async (attachment: GaNoteAttachment) => {
    try {
      const res = await apiFetch(`/ga-notes/attachments/${attachment.id}`)
      if (!res?.ok) {
        toast.error("Failed to download file")
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = attachment.original_filename || "download"
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error("Failed to download file")
    }
  }

  const openAttachmentPreview = async (attachment: GaNoteAttachment) => {
    try {
      const res = await apiFetch(`/ga-notes/attachments/${attachment.id}`)
      if (!res?.ok) {
        toast.error("Failed to open file")
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      setPreviewTitle(attachment.original_filename || "Attachment preview")
      setPreviewUrl((prev) => {
        if (prev) window.URL.revokeObjectURL(prev)
        return url
      })
    } catch {
      toast.error("Failed to open file")
    }
  }

  const handleVoiceLanguageChange = (value: string) => {
    if (value !== "en" && value !== "sq") return
    if (value === voiceLanguage) return
    if (isVoiceListening) stopVoice()
    if (isCloudRecording) stopCloud()
    setVoiceLanguage(value)
  }

  React.useEffect(() => {
    return () => {
      if (previewUrl) {
        window.URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const createNote = async () => {
    if (!content.trim()) {
      toast.error("Content is required")
      return
    }
    // Use URL parameters if present, otherwise determine based on user role
    const departmentForNote = searchParams.get("department_id") || null
    const projectForNote = searchParams.get("project_id") || null
    
    // Determine department_id to send to backend
    let finalDepartmentId = departmentForNote
    const finalProjectId = projectForNote
    
    // If no URL params, send user's department_id for STAFF users (for backend validation)
    // but we'll hide it in the display if it matches the user's auto-assigned department
    if (!departmentForNote && !projectForNote) {
      const isAdminOrManager = user?.role === "ADMIN" || user?.role === "MANAGER"
      if (!isAdminOrManager && user?.department_id) {
        finalDepartmentId = user.department_id
      }
    }
    
    setPosting(true)
    try {
      const res = await apiFetch("/ga-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          note_type: noteType,
          priority: priority === "NONE" ? null : priority,
          department_id: finalDepartmentId,
          project_id: finalProjectId,
        }),
      })
      if (!res?.ok) {
        let errorMessage = "Failed to create note"
        try {
          const errorData = (await res.json()) as { detail?: string }
          if (errorData?.detail) {
            errorMessage = errorData.detail
          }
        } catch {
          // ignore
        }
        toast.error(errorMessage)
        return
      }
      const created = (await res.json()) as GaNote
      setNotes((prev) => [created, ...prev])
      setContent("")
      if (selectedFiles.length > 0) {
        try {
          const attachments = await uploadNoteAttachments(created.id, selectedFiles)
          setNotes((prev) =>
            prev.map((note) => (note.id === created.id ? { ...note, attachments } : note))
          )
          setSelectedFiles([])
        } catch (error) {
          console.error("Attachment upload failed:", error)
          toast.error("Note saved, attachments failed")
        }
      }
    } finally {
      setPosting(false)
    }
  }

  const openEditNote = (note: GaNote) => {
    setEditNoteId(note.id)
    setEditContent(note.content || "")
    const taskInfo = noteTaskInfo.get(note.id)
    setEditDescription(taskInfo?.description || "")
  }

  const saveEditNote = async () => {
    if (!editNoteId) return
    const trimmed = editContent.trim()
    if (!trimmed) {
      toast.error("Note text cannot be empty")
      return
    }
    setSavingEdit(true)
    try {
      // Update the note
      const res = await apiFetch(`/ga-notes/${editNoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      })
      if (res?.ok) {
        const updated = (await res.json()) as GaNote
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
        
        // Update the task description if a task exists
        const taskInfo = noteTaskInfo.get(editNoteId)
        if (taskInfo?.taskId) {
          const taskRes = await apiFetch(`/tasks/${taskInfo.taskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: editDescription.trim() || null }),
          })
          if (taskRes?.ok) {
            // Reload note task info to reflect the updated description
            const notesRes = await apiFetch("/tasks?include_done=true&include_all_departments=true")
            if (notesRes?.ok) {
              const tasksData = (await notesRes.json()) as Task[]
              const userMapById = new Map(users.map((u) => [u.id, u]))
              const map = new Map<string, {
                assignees: TaskAssignee[]
                description: string | null
                taskId: string | null
                taskDepartmentId: string | null
                taskProjectId: string | null
                taskStatus: string | null
                taskStatuses: string[]
              }>()
              const mergeAssignees = (base: TaskAssignee[], incoming: TaskAssignee[]) => {
                const result: TaskAssignee[] = []
                const seen = new Set<string>()
                const add = (assignee: TaskAssignee) => {
                  const key =
                    assignee.id ||
                    assignee.username ||
                    assignee.full_name ||
                    assignee.email ||
                    Math.random().toString()
                  if (seen.has(key)) return
                  seen.add(key)
                  result.push(assignee)
                }
                base.forEach(add)
                incoming.forEach(add)
                return result
              }
              for (const t of tasksData) {
                if (!t.ga_note_origin_id) continue
                let assignees: TaskAssignee[] = t.assignees ?? []
                if (assignees.length === 0 && t.assigned_to) {
                  const fallback = userMapById.get(t.assigned_to)
                  if (fallback) {
                    assignees = [{
                      id: fallback.id,
                      email: fallback.email ?? null,
                      username: fallback.username || null,
                      full_name: fallback.full_name || null,
                      department_id: fallback.department_id || null,
                    }]
                  }
                }
                const existing = map.get(t.ga_note_origin_id)
                map.set(t.ga_note_origin_id, {
                  assignees: mergeAssignees(existing?.assignees ?? [], assignees),
                  description: existing?.description ?? t.description ?? null,
                  taskId: existing?.taskId ?? t.id,
                  taskDepartmentId: existing?.taskDepartmentId ?? t.department_id ?? null,
                  taskProjectId: existing?.taskProjectId ?? t.project_id ?? null,
                  taskStatus: existing?.taskStatus ?? t.status ?? null,
                  taskStatuses: [...(existing?.taskStatuses ?? []), t.status ?? ""],
                })
              }
              setNoteTaskInfo(map)
            }
          }
        }
        
        toast.success("Note updated")
        setEditNoteId(null)
      } else {
        toast.error("Failed to update note")
      }
    } finally {
      setSavingEdit(false)
    }
  }

  const openTaskDialog = (note: GaNote) => {
    if (note.project_id) {
      toast.error("Tasks for project-linked notes must be created manually")
      return
    }
    const trimmed = note.content.trim()
    const defaultTitle = trimmed ? trimmed : "GA/KA note task"
    setTaskDialogNoteId(note.id)
    setTaskTitle(defaultTitle)
    setTaskDescription("") // start empty so creator can add detailed description
    setTaskPriority(note.priority === "HIGH" ? "HIGH" : "NORMAL")
    setTaskFinishPeriod(FINISH_PERIOD_NONE_VALUE)
    setTaskDueDate("")
    setTaskStartDate("")
    setTaskAssigneeIds([])
    setTaskDepartmentIds([])
    setTaskProjectId(note.project_id ?? "NONE")
  }

  // Get available priority/type options based on whether a project is selected
  const availablePriorityOptions = React.useMemo<readonly TaskTypeOption[]>(() => {
    if (taskProjectId !== "NONE") {
      return TASK_TYPE_OPTIONS_WITH_PROJECT
    }
    return TASK_TYPE_OPTIONS_NO_PROJECT
  }, [taskProjectId])

  const createTaskFromNote = async (note: GaNote) => {
    if (note.is_converted_to_task) return
    if (note.project_id) {
      toast.error("Tasks for project-linked notes must be created manually")
      return
    }
    if (!taskTitle.trim()) {
      toast.error("Task title is required")
      return
    }
    const effectiveDepartments =
      taskDepartmentIds.length > 0
        ? taskDepartmentIds
        : note.department_id
          ? [note.department_id]
          : []
    if (effectiveDepartments.length === 0) {
      toast.error("Select at least one department before creating a task")
      return
    }
    if (!taskDueDate) {
      toast.error("Due date is required")
      return
    }
    const primaryDepartmentId = effectiveDepartments[0]
    setCreatingTask(true)
    try {
      const dueDateValue = taskDueDate ? new Date(taskDueDate).toISOString() : null
      const startDateValue = taskStartDate ? new Date(taskStartDate).toISOString() : null
      
      // Map task type/priority to actual priority and boolean flags
      const isProjectTask = taskProjectId !== "NONE"
      let actualPriority: TaskPriority = "NORMAL"
      let isBllok = false
      let is1hReport = false
      let isR1 = false
      let isPersonal = false

      if (isProjectTask) {
        // For project tasks: only HIGH or NORMAL
        actualPriority = taskPriority === "HIGH" ? "HIGH" : "NORMAL"
      } else {
        // For non-project tasks: map to priority or boolean flags
        if (taskPriority === "BLLOK") {
          isBllok = true
          actualPriority = "NORMAL"
        } else if (taskPriority === "1H") {
          is1hReport = true
          actualPriority = "NORMAL"
        } else if (taskPriority === "R1") {
          isR1 = true
          actualPriority = "NORMAL"
        } else if (taskPriority === "PERSONAL") {
          isPersonal = true
          actualPriority = "NORMAL"
        } else {
          actualPriority = taskPriority === "HIGH" ? "HIGH" : "NORMAL"
        }
      }

      const taskRes = await apiFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskTitle.trim(),
          description: taskDescription.trim() || null,
          status: "TODO",
          priority: actualPriority,
          finish_period: taskFinishPeriod === FINISH_PERIOD_NONE_VALUE ? null : taskFinishPeriod,
          due_date: dueDateValue,
          start_date: startDateValue,
          assigned_to: taskAssigneeIds[0] ?? null,
          assignees: taskAssigneeIds,
          ga_note_origin_id: note.id,
          department_id: primaryDepartmentId,
          project_id: taskProjectId !== "NONE" ? taskProjectId : null,
          is_bllok: isBllok,
          is_1h_report: is1hReport,
          is_r1: isR1,
          is_personal: isPersonal,
        }),
      })
      if (!taskRes.ok) {
        toast.error("Failed to create task")
        return
      }
      const createdTask = (await taskRes.json()) as Task
      const patchRes = await apiFetch(`/ga-notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_converted_to_task: true }),
      })
      if (patchRes.ok) {
        const updated = (await patchRes.json()) as GaNote
        setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)))
      } else {
        setNotes((prev) =>
          prev.map((n) => (n.id === note.id ? { ...n, is_converted_to_task: true } : n))
        )
      }
      setNoteTaskInfo((prev) => {
        const next = new Map(prev)
        const userMapById = new Map(users.map((u) => [u.id, u]))
        let assignees: TaskAssignee[] = []
        if (taskAssigneeIds.length > 0) {
          assignees = taskAssigneeIds.map((id) => {
            const user = userMapById.get(id)
            return {
              id,
              email: user?.email ?? null,
              username: user?.username || null,
              full_name: user?.full_name || null,
              department_id: user?.department_id || null,
            }
          })
        } else if (createdTask.assignees && createdTask.assignees.length > 0) {
          assignees = createdTask.assignees
        } else if (createdTask.assigned_to) {
          const fallback = userMapById.get(createdTask.assigned_to)
          if (fallback) {
            assignees = [{
              id: fallback.id,
              email: fallback.email ?? null,
              username: fallback.username || null,
              full_name: fallback.full_name || null,
              department_id: fallback.department_id || null,
            }]
          }
        }
        const cleanedDescription = taskDescription.trim()
        next.set(note.id, {
          assignees,
          description: (cleanedDescription || createdTask.description) ?? null,
          taskId: createdTask.id,
          taskDepartmentId: createdTask.department_id ?? null,
          taskProjectId: createdTask.project_id ?? null,
        })
        return next
      })
      setTaskDialogNoteId(null)
      toast.success("Task created from note")
    } finally {
      setCreatingTask(false)
    }
  }

  const closeNote = async (id: string) => {
    const res = await apiFetch(`/ga-notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CLOSED" }),
    })
    if (res?.ok) {
      const updated = (await res.json()) as GaNote
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)))
    } else {
      toast.error("Failed to update note")
    }
  }

  const exportDailyReport = async () => {
    if (!user?.id) return
    setExportingDailyReport(true)
    try {
      const qs = new URLSearchParams()
      if (departmentId !== "ALL") {
        qs.set("department_id", departmentId)
      }
      if (projectId !== "NONE") {
        qs.set("project_id", projectId)
      }
      // Note: You'll need to create a backend endpoint /exports/ga-notes.xlsx
      // For now, using a placeholder - adjust the endpoint as needed
      const res = await apiFetch(`/exports/ga-notes.xlsx?${qs.toString()}`)
      if (!res.ok) {
        toast.error("Failed to export report")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      const disposition = res.headers.get("Content-Disposition")
      const match = disposition?.match(/filename=\"?([^\";]+)\"?/i)
      if (match?.[1]) {
        link.download = match[1]
      } else {
        const today = new Date().toISOString().split('T')[0]
        link.download = `ga_notes_export_${today}.xlsx`
      }
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Failed to export report", error)
      toast.error("Failed to export report")
    } finally {
      setExportingDailyReport(false)
    }
  }

  // Project list is used only in the task creation dialog (filtered separately).
  const taskDialogNote = taskDialogNoteId ? notes.find((n) => n.id === taskDialogNoteId) || null : null
  const taskDepartmentLocked = false
  const effectiveTaskDepartmentIds = React.useMemo(() => {
    if (taskDepartmentIds.length > 0) return taskDepartmentIds
    if (taskDialogNote?.department_id) return [taskDialogNote.department_id]
    return []
  }, [taskDepartmentIds, taskDialogNote?.department_id])
  const taskAssigneeOptions = users

  // Projects filtered by the department chosen in the task dialog
  const primaryDepartmentId = effectiveTaskDepartmentIds[0] || null
  const taskProjectOptions = React.useMemo(() => {
    if (primaryDepartmentId) {
      return projects.filter((p) => p.department_id === primaryDepartmentId)
    }
    return projects
  }, [primaryDepartmentId, projects])

  // Keep projects in sync when opening dialog or changing department
  React.useEffect(() => {
    if (!taskDialogNoteId) return
    const dep =
      effectiveTaskDepartmentIds.length === 1 ? effectiveTaskDepartmentIds[0] : undefined
    void loadProjects(dep)
  }, [effectiveTaskDepartmentIds, loadProjects, taskDialogNoteId])

  // Reset priority when switching between project/non-project modes
  React.useEffect(() => {
    if (!taskDialogNoteId) return
    const currentIsValid = availablePriorityOptions.includes(taskPriority)
     
    if (!currentIsValid) {
      setTaskPriority("NORMAL")
    }
  }, [availablePriorityOptions, taskDialogNoteId, taskPriority])
  const visibleNotes = React.useMemo(() => {
    const now = Date.now()
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000
    const closedCutoff = now - 30 * 24 * 60 * 60 * 1000

    const withinRange = (note: GaNote) => {
      const isClosed = note.status === "CLOSED"
      if (isClosed) {
        if (!note.completed_at) return true
        const completed = new Date(note.completed_at).getTime()
        if (Number.isNaN(completed)) return true
        return completed >= closedCutoff
      }
      if (rangeFilter === "all") return true
      const created = note.created_at ? new Date(note.created_at).getTime() : 0
      return created >= weekAgo
    }
    const matchesNoteType = (note: GaNote) => {
      if (noteTypeFilter === "all") return true
      return note.note_type === noteTypeFilter
    }
    const matchesTaskStatusFilter = (note: GaNote) => {
      if (taskStatusFilter === "all") return true
      if (taskStatusFilter === "open") return note.status !== "CLOSED"
      if (taskStatusFilter === "closed") return note.status === "CLOSED"
      const hasTask = note.is_converted_to_task === true || noteTaskInfo.has(note.id)
      if (taskStatusFilter === "notes") return !hasTask && note.status !== "CLOSED"
      if (taskStatusFilter === "tasks") return hasTask
      const taskInfo = noteTaskInfo.get(note.id)
      if (!taskInfo) return false
      const aggregatedStatus =
        taskInfo && (taskInfo.taskStatuses?.length ?? 0) > 1
          ? aggregateTaskStatus(taskInfo.taskStatuses)
          : normalizeTaskStatus(taskInfo?.taskStatus)
      if (aggregatedStatus === "UNKNOWN") return false
      return aggregatedStatus === taskStatusFilter
    }
    const taskDoneBucket = (note: GaNote) => {
      const taskInfo = noteTaskInfo.get(note.id)
      if (!taskInfo) return 0
      const aggregatedStatus =
        taskInfo && (taskInfo.taskStatuses?.length ?? 0) > 1
          ? aggregateTaskStatus(taskInfo.taskStatuses)
          : normalizeTaskStatus(taskInfo?.taskStatus)
      return aggregatedStatus === "DONE" ? 1 : 0
    }
    const sorted = [...notes]
      .filter(withinRange)
      .filter(matchesNoteType)
      .filter(matchesTaskStatusFilter)
      .sort((a, b) => {
        // First, sort by status: open notes first, closed notes last
        const aIsClosed = a.status === "CLOSED"
        const bIsClosed = b.status === "CLOSED"
        if (aIsClosed !== bIsClosed) {
          return aIsClosed ? 1 : -1 // Closed notes go to the end
        }
        // Then, move DONE tasks after non-done tasks
        const aBucket = taskDoneBucket(a)
        const bBucket = taskDoneBucket(b)
        if (aBucket !== bBucket) {
          return aBucket - bBucket
        }
        // Then sort by creation date (newest first) within each group
        const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0
        const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0
        return bCreated - aCreated
      })
    return sorted
  }, [notes, rangeFilter, noteTypeFilter, taskStatusFilter, noteTaskInfo])

  const attachmentDialogItems = React.useMemo(() => {
    if (!attachmentsDialogNoteId) return []
    const note = visibleNotes.find((item) => item.id === attachmentsDialogNoteId)
    if (!note) return []
    return (note.attachments ?? []).map((attachment) => ({
      noteId: note.id,
      noteContent: note.content,
      noteCreatedAt: note.created_at,
      attachment,
    }))
  }, [attachmentsDialogNoteId, visibleNotes])

  const openAttachmentsForNote = (noteId: string) => {
    setAttachmentsDialogNoteId(noteId)
    setAttachmentsDialogOpen(true)
  }

  const departmentMap = React.useMemo(() => new Map(departments.map((dept) => [dept.id, dept])), [departments])
  const projectMap = React.useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
  const userMap = React.useMemo(() => new Map(users.map((person) => [person.id, person])), [users])

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-gradient-to-r from-amber-50 via-indigo-50 to-cyan-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-primary/80 uppercase">Notes for all</div>
            <div className="text-2xl font-semibold leading-tight mt-1 text-slate-900">GA/KA Notes</div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary" className="px-3 py-1 rounded-full shadow-sm bg-emerald-100 text-emerald-800">
              Open {notes.filter((n) => n.status !== "CLOSED").length}
            </Badge>
            <Badge variant="outline" className="px-3 py-1 rounded-full border-indigo-200 text-indigo-800">
              Total: {notes.length}
            </Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">New Note</CardTitle>
          <CardAction>
            <div className="flex items-center gap-2">
              <Select value={voiceLanguage} onValueChange={handleVoiceLanguageChange}>
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="sq">Albanian</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-2"
                onClick={handleVoiceToggle}
                disabled={voiceMode === "none" || (voiceMode === "cloud" && isCloudTranscribing)}
                title={
                  voiceMode === "browser"
                    ? isVoiceListening
                      ? "Stop voice dictation"
                      : "Start voice dictation"
                    : voiceMode === "cloud"
                      ? isCloudRecording
                        ? "Stop cloud dictation"
                        : "Start cloud dictation"
                      : "Voice dictation not supported"
                }
              >
                {voiceMode === "cloud" ? (
                  isCloudRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />
                ) : isVoiceListening ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
                {voiceMode === "cloud"
                  ? isCloudRecording
                    ? "Stop"
                    : isCloudTranscribing
                      ? "Transcribing"
                      : "Voice"
                  : isVoiceListening
                    ? "Stop"
                    : "Voice"}
              </Button>
              {voiceMode === "cloud" ? (
                <span className="text-[11px] text-slate-500">Cloud fallback</span>
              ) : null}
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className="min-h-[220px] resize-none text-base md:text-lg bg-primary/5 border-primary/40 shadow-[0_0_0_1px_rgba(0,0,0,0.04)] focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:border-primary"
              autoFocus
            />
            {isVoiceListening ? (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-slate-700">Listening...</span>
                {voiceInterimText ? <span className="ml-2">{voiceInterimText}</span> : null}
              </div>
            ) : null}
            {isCloudRecording ? (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-slate-700">Recording...</span>
              </div>
            ) : null}
            {isCloudTranscribing ? (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-slate-700">Transcribing...</span>
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Attachments</Label>
            <Input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelection}
            />
            {selectedFiles.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                No files selected. Max {MAX_ATTACHMENT_FILES} files, {MAX_ATTACHMENT_MB}MB each.
              </div>
            ) : (
              <div className="rounded-md border bg-slate-50 p-2 space-y-2">
                {selectedFiles.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-700">{file.name}</span>
                      <span className="text-slate-500">{formatFileSize(file.size)}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeSelectedFile(idx)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void createNote()} disabled={posting}>
              {posting ? "Saving..." : "Save note"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">Notes</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1">
              <Select value={rangeFilter} onValueChange={(v) => setRangeFilter(v as "week" | "all")}>
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">This week (default)</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Select value={noteTypeFilter} onValueChange={(v) => setNoteTypeFilter(v as "all" | "GA" | "KA")}>
                <SelectTrigger className="h-9 w-[120px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">GA/KA</SelectItem>
                  <SelectItem value="GA">GA</SelectItem>
                  <SelectItem value="KA">KA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Select
                value={taskStatusFilter}
                onValueChange={(v) => setTaskStatusFilter(v as TaskStatusFilter)}
              >
                <SelectTrigger className="h-9 w-[180px]">
                  <SelectValue placeholder="Tasks/Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tasks/Notes</SelectItem>
                  <SelectItem value="tasks">Tasks</SelectItem>
                  <SelectItem
                    value="notes"
                    className="bg-sky-100 text-sky-900 focus:bg-sky-200 focus:text-sky-900"
                  >
                    Notes
                  </SelectItem>
                  <SelectItem
                    value="closed"
                    className="bg-slate-200 text-slate-800 focus:bg-slate-300 focus:text-slate-900"
                  >
                    Closed
                  </SelectItem>
                  <SelectItem
                    value="TODO"
                    className="bg-pink-100 text-pink-900 focus:bg-pink-200 focus:text-pink-900"
                  >
                    To do
                  </SelectItem>
                  <SelectItem
                    value="IN_PROGRESS"
                    className="bg-amber-100 text-amber-900 focus:bg-amber-200 focus:text-amber-900"
                  >
                    In progress
                  </SelectItem>
                  <SelectItem
                    value="DONE"
                    className="bg-emerald-100 text-emerald-900 focus:bg-emerald-200 focus:text-emerald-900"
                  >
                    Done
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-8 rounded-lg border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm hover:bg-slate-50"
              onClick={() => {
                const printWindow = window.open('', '_blank')
                if (!printWindow) return
                
                const tableContainer = document.querySelector('.notes-table-container')
                if (!tableContainer) return
                
                const table = tableContainer.querySelector('table')
                if (!table) return
                
                // Get user initials
                const userInitials = user ? getInitials(user.full_name || user.username || "") : "USER"
                
                // Get current date and time
                const now = new Date()
                const day = now.getDate().toString().padStart(2, "0")
                const month = (now.getMonth() + 1).toString().padStart(2, "0")
                const year = now.getFullYear()
                let hours = now.getHours()
                const minutes = now.getMinutes().toString().padStart(2, "0")
                const ampm = hours >= 12 ? "PM" : "AM"
                hours = hours % 12
                hours = hours ? hours : 12
                const hoursStr = hours.toString().padStart(2, "0")
                const dateTimeStr = `${day}.${month}.${year}, ${hoursStr}:${minutes} ${ampm}`
                
                // Clone the table and clean up React-specific attributes
                const clonedTable = table.cloneNode(true) as HTMLElement
                const allElements = clonedTable.querySelectorAll('*')
                allElements.forEach((el) => {
                  // Remove React event handlers and other attributes
                  Array.from(el.attributes).forEach((attr) => {
                    if (attr.name.startsWith('data-') || attr.name.startsWith('on') || attr.name === 'class') {
                      // Keep class for styling
                      return
                    }
                    if (['style', 'colspan', 'rowspan'].includes(attr.name)) {
                      return
                    }
                    el.removeAttribute(attr.name)
                  })
                })
                
                // Extract text content from badges and buttons, replace with plain text
                clonedTable.querySelectorAll('[class*="Badge"], button').forEach((el) => {
                  const text = el.textContent?.trim() || ''
                  const span = document.createElement('span')
                  span.textContent = text
                  el.parentNode?.replaceChild(span, el)
                })
                
                // Make all header text uppercase
                clonedTable.querySelectorAll('thead th').forEach((th) => {
                  th.textContent = th.textContent?.toUpperCase() || ''
                })
                
                // Ensure NR column is bold and wraps
                clonedTable.querySelectorAll('tbody td:first-child').forEach((td) => {
                  td.style.fontWeight = 'bold'
                  td.style.whiteSpace = 'normal'
                })
                
                // Remove fixed widths from table and cells to allow auto-sizing, except SHENIMI column
                clonedTable.style.width = 'auto'
                clonedTable.style.minWidth = 'auto'
                clonedTable.querySelectorAll('th, td').forEach((cell, index) => {
                  // Keep SHENIMI column (2nd column) with fixed width
                  const isShenimiColumn = cell.cellIndex === 1 // 0-indexed, so 1 is 2nd column
                  if (!isShenimiColumn) {
                    cell.style.width = 'auto'
                    cell.style.minWidth = 'auto'
                  } else {
                    cell.style.width = '600px'
                    cell.style.maxWidth = '600px'
                    cell.style.whiteSpace = 'normal'
                    cell.style.wordWrap = 'break-word'
                  }
                })
                clonedTable.querySelectorAll('colgroup').forEach((col) => col.remove())
                
                printWindow.document.write(`
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <title>GA/KA Notes</title>
                      <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        @page {
                          margin-top: 0.36in;
                          margin-bottom: 0.51in;
                          margin-left: 0.1in;
                          margin-right: 0.1in;
                          size: landscape;
                        }
                        body { 
                          margin: 0; 
                          padding: 0;
                          font-family: Arial, sans-serif; 
                          font-size: 12px;
                        }
                        .title {
                          font-size: 16px;
                          font-weight: bold;
                          margin-top: 0.3in;
                          margin-bottom: 0.2in;
                          text-align: center;
                        }
                        table { 
                          border-collapse: collapse; 
                          width: auto;
                          margin: 0 auto;
                          margin-top: 0.1in;
                        }
                        thead {
                          display: table-header-group;
                        }
                        tbody {
                          display: table-row-group;
                        }
                        th, td { 
                          border: 1px solid #475569; 
                          padding: 6px 8px; 
                          text-align: left; 
                          vertical-align: bottom;
                          white-space: nowrap;
                        }
                        /* SHENIMI column (2nd column) - set width and wrap */
                        th:nth-child(2), td:nth-child(2) {
                          width: 350px;
                          max-width: 350px;
                          white-space: normal;
                          word-wrap: break-word;
                        }
                        th { 
                          background-color: #D9D9D9; 
                          font-weight: bold; 
                          text-transform: uppercase;
                          /* Thick outside borders for header */
                          border-top: 2px solid #1e293b;
                          border-bottom: 2px solid #1e293b;
                        }
                        thead tr:first-child th:first-child {
                          border-left: 2px solid #1e293b;
                        }
                        thead tr:first-child th:last-child {
                          border-right: 2px solid #1e293b;
                        }
                        td:first-child { 
                          border-left: 2px solid #1e293b; 
                          font-weight: bold;
                          white-space: normal;
                        }
                        td:last-child { 
                          border-right: 2px solid #1e293b; 
                        }
                        /* Thick outside border for table - bottom */
                        tbody tr:last-child td { 
                          border-bottom: 2px solid #1e293b; 
                        }
                        .footer {
                          position: fixed;
                          bottom: 0;
                          width: 100%;
                          display: flex;
                          justify-content: space-between;
                          padding-bottom: 0.2in;
                          font-size: 10px;
                        }
                        .page-number {
                          position: absolute;
                          left: 50%;
                          transform: translateX(-50%);
                        }
                        .user-initials {
                          position: absolute;
                          right: 0.1in;
                        }
                          @media print {
                          .footer {
                            position: running(footer);
                          }
                          @page {
                            @top-right {
                              content: "${dateTimeStr}";
                              font-size: 10px;
                            }
                            @bottom-center {
                              content: "Page " counter(page) " / " counter(pages);
                              font-size: 10px;
                            }
                            @bottom-right {
                              content: "${userInitials}";
                              font-size: 10px;
                            }
                          }
                          body { 
                            margin: 0; 
                            padding: 0;
                          }
                          table { 
                            font-size: 10px;
                            width: auto;
                          }
                          th, td { 
                            padding: 4px 6px;
                          }
                        }
                      </style>
                    </head>
                    <body>
                      <div class="title">GA/KA NOTES</div>
                      ${clonedTable.outerHTML}
                      <div class="footer">
                        <div class="page-number"></div>
                      </div>
                    </body>
                  </html>
                `)
                printWindow.document.close()
                setTimeout(() => {
                  printWindow.print()
                  setTimeout(() => printWindow.close(), 100)
                }, 250)
              }}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button
              variant="outline"
              className="h-8 rounded-lg border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm hover:bg-slate-50"
              disabled={exportingDailyReport}
              onClick={() => void exportDailyReport()}
            >
              {exportingDailyReport ? "Exporting..." : "Export Excel"}
            </Button>
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading notes...</div>
          ) : notes.length === 0 ? (
            <div className="text-sm text-muted-foreground">No notes yet.</div>
          ) : (
            <div className="notes-table-container rounded-md border-2 border-slate-700 max-h-[75vh] overflow-x-auto overflow-y-auto relative bg-white w-full">
              <div className="w-full min-w-[1350px]">
                <table className="w-full caption-bottom text-sm min-w-[1350px]">
                  <thead className="sticky top-0 z-50 bg-white shadow-md" style={{ position: 'sticky', top: 0, zIndex: 50 }}>
                    <tr className="bg-white" style={{ borderBottom: '1px solid rgb(51 65 85)' }}>
                      <th className="w-[40px] border border-slate-600 border-l-2 border-l-slate-800 bg-white text-foreground h-10 px-2 text-left align-middle font-medium" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)', whiteSpace: 'normal' }}>NR</th>
                      <th className="w-[320px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>SHENIMI</th>
                      <th className="min-w-[320px] w-[320px] max-w-[320px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>PERSHKRIMI</th>
                      <th className="w-[140px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>DATA,ORA</th>
                      <th className="w-[60px] border border-slate-600 bg-white text-foreground h-10 px-1.5 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>NGA</th>
                      <th className="min-w-[70px] w-[70px] max-w-[70px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>PER</th>
                      <th className="w-[60px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>DEP</th>
                      <th className="w-[120px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>PRJK</th>
                      <th className="w-[90px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>KRIJO DETYRE</th>
                      <th className="min-w-[70px] w-[70px] max-w-[70px] border border-slate-600 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>MBYLL</th>
                      <th className="min-w-[70px] w-[70px] max-w-[70px] border border-slate-600 border-r-2 border-r-slate-800 bg-white text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap" style={{ verticalAlign: 'bottom', borderBottom: '1px solid rgb(51 65 85)' }}>EDIT</th>
                    </tr>
                  </thead>
                  <tbody>
                  {visibleNotes.map((note, idx) => {
                    const creator = note.created_by ? userMap.get(note.created_by) : null
                    const creatorLabel =
                      creator?.full_name || creator?.username || "Unknown user"
                    const creatorInitials = getInitials(creatorLabel)
                    const creatorBadgeClasses =
                      creatorInitials === "GA"
                        ? "bg-rose-100 text-rose-800 border border-rose-200"
                        : creatorInitials === "KA"
                          ? "bg-blue-100 text-blue-800 border border-blue-200"
                          : "bg-slate-200 text-slate-700"
                    const noteDepartment = note.department_id ? departmentMap.get(note.department_id) : null
                    const noteProject = note.project_id ? projectMap.get(note.project_id) : null
                    const taskInfo = noteTaskInfo.get(note.id)
                    const taskDepartment = taskInfo?.taskDepartmentId
                      ? departmentMap.get(taskInfo.taskDepartmentId)
                      : null
                    const taskProject = taskInfo?.taskProjectId
                      ? projectMap.get(taskInfo.taskProjectId)
                      : null
                    const displayDepartment = noteDepartment || taskDepartment
                    const displayProject = noteProject || taskProject
                    const projectId = note.project_id || taskInfo?.taskProjectId || null
                    const project = projectId ? projectMap.get(projectId) : null
                    const projectDepartment = project?.department_id
                      ? departmentMap.get(project.department_id)
                      : null
                    const projectDepartmentName = (projectDepartment?.name || "").trim().toUpperCase()
                    const projectDepartmentCode = (projectDepartment?.code || "").trim().toUpperCase()
                    const isDevProject =
                      projectDepartmentName === "DEVELOPMENT" || projectDepartmentCode === "DEV"
                    const hasProject = Boolean(projectId)
                    const assignees = taskInfo?.assignees ?? []
                    const attachments = note.attachments ?? []
                    const isClosed =
                      note.status === "CLOSED" ||
                      (note as { isClosed?: boolean }).isClosed === true ||
                      (note as { closed?: boolean }).closed === true
                    const aggregatedStatus =
                      taskInfo && (taskInfo.taskStatuses?.length ?? 0) > 1
                        ? aggregateTaskStatus(taskInfo.taskStatuses)
                        : normalizeTaskStatus(taskInfo?.taskStatus)
                    const hasTask = Boolean(note.is_converted_to_task || taskInfo?.taskId)
                    const canCreateTask = !isClosed && (!hasProject || isDevProject)
                    const showManualOnly = hasProject && !isDevProject
                    const shenimiCellClass = isClosed
                      ? "bg-slate-200 opacity-70"
                      : hasTask
                        ? aggregatedStatus === "TODO"
                          ? "bg-pink-200"
                          : aggregatedStatus === "IN_PROGRESS"
                            ? "bg-amber-200"
                            : aggregatedStatus === "DONE"
                              ? "bg-emerald-200"
                              : "bg-amber-50"
                        : "bg-sky-200"

                    // Only show department if:
                    // 1. Note has a project (always show projects)
                    // 2. We're currently filtering by department/project (on a specific page)
                    // 3. Note's department_id is different from user's department (explicitly set, not auto-assigned)
                    const isFilteredView = departmentId !== "ALL" || projectId !== "NONE"
                    const isExplicitDepartment = note.department_id && note.department_id !== user?.department_id
                    const shouldShowDepartment = displayDepartment && (displayProject || isFilteredView || isExplicitDepartment)

                    return (
                      <tr key={note.id} className="hover:bg-muted/50 border-b transition-colors">
                        <td className="font-bold text-muted-foreground border border-slate-600 border-l-2 border-l-slate-800 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>{idx + 1}</td>
                        <td className={`whitespace-pre-wrap break-words w-[320px] border border-slate-600 p-2 align-middle ${shenimiCellClass}`} style={{ verticalAlign: 'bottom' }}>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm">{note.content}</span>
                              {attachments.length > 0 ? (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7 shrink-0 sm:hidden"
                                  title="Attachments"
                                  aria-label="Attachments"
                                  onClick={() => openAttachmentsForNote(note.id)}
                                >
                                  <ImageIcon className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2">
                              {note.priority ? (
                                <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_BADGE[note.priority as Exclude<NotePriority, "NONE">]}`}>
                                  {note.priority}
                                </Badge>
                              ) : null}
                              {isClosed ? (
                                <Badge className="text-[10px] px-1.5 py-0 bg-slate-300 text-slate-700 border border-slate-400">
                                  Closed
                                </Badge>
                              ) : null}


                            </div>
                          </div>
                        </td>
                        <td className="border border-slate-600 p-2 align-middle whitespace-pre-wrap text-xs text-slate-700 min-w-[320px] w-[320px] max-w-[320px]" style={{ verticalAlign: 'bottom' }}>
                          {taskInfo?.description || attachments.length > 0 ? (
                            <div className="space-y-2">
                              {taskInfo?.description ? (
                                <div>{taskInfo.description}</div>
                              ) : null}
                              {attachments.length > 0 ? (
                                <div className="space-y-1">
                                  {attachments.map((attachment) => (
                                    <div key={attachment.id} className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1">
                                      <div className="flex flex-col">
                                        <span className="text-xs font-medium text-slate-700">
                                          {attachment.original_filename}
                                        </span>
                                        <span className="text-[10px] text-slate-500">
                                          {formatFileSize(attachment.size_bytes)}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {(attachment.content_type || "").startsWith("image/") ? (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-6 text-[10px]"
                                            onClick={() => void openAttachmentPreview(attachment)}
                                          >
                                            View
                                          </Button>
                                        ) : null}
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-6 text-[10px]"
                                          onClick={() => void downloadAttachment(attachment)}
                                        >
                                          Download
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="border border-slate-600 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>{formatDate(note.created_at)}</td>
                        <td className="w-[60px] border border-slate-600 p-1.5 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>
                          <div className="flex items-center gap-2 text-xs">
                            <div
                              className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${creatorBadgeClasses}`}
                              title={creatorLabel}
                            >
                              {creatorInitials}
                            </div>
                          </div>
                        </td>
                        <td className="border border-slate-600 p-2 align-middle whitespace-nowrap min-w-[70px] w-[70px] max-w-[70px]" style={{ verticalAlign: 'bottom' }}>
                          {!note.is_converted_to_task ? (
                            <span className="text-xs text-slate-500">-</span>
                          ) : assignees.length === 0 ? (
                            <span className="text-xs text-slate-500">-</span>
                          ) : (
                            <div className="flex items-center gap-1 flex-wrap">
                              {assignees.map((assignee, assigneeIdx) => {
                                const assigneeLabel = assignee.full_name || assignee.username || "Unknown"
                                const assigneeInitials = getInitials(assigneeLabel)
                                const assigneeBadgeClasses =
                                  assigneeInitials === "GA"
                                    ? "bg-rose-100 text-rose-800 border border-rose-200"
                                    : assigneeInitials === "KA"
                                      ? "bg-blue-100 text-blue-800 border border-blue-200"
                                      : "bg-slate-200 text-slate-700"
                                return (
                                  <div
                                    key={assigneeIdx}
                                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${assigneeBadgeClasses}`}
                                    title={assigneeLabel}
                                  >
                                    {assigneeInitials}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </td>
                        <td className="border border-slate-600 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>
                          {shouldShowDepartment && displayDepartment ? (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 whitespace-normal text-left">
                              {abbreviateDepartmentName(displayDepartment.name)}
                            </Badge>
                          ) : null}
                        </td>
                        <td className="border border-slate-600 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>
                          {displayProject ? (
                            <Badge variant="outline" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-200 whitespace-normal text-left">
                              {displayProject.title || displayProject.name || "Project"}
                            </Badge>
                          ) : null}
                        </td>
                        <td className="border border-slate-600 p-2 align-middle whitespace-nowrap min-w-[70px] w-[70px] max-w-[70px]" style={{ verticalAlign: 'bottom' }}>
                          <div className="flex justify-center">
                            {note.is_converted_to_task ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700 border-purple-200 h-7 flex items-center">
                                Task Created
                              </Badge>
                            ) : canCreateTask ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                onClick={() => openTaskDialog(note)}
                              >
                                Create Task
                              </Button>
                            ) : showManualOnly ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 text-slate-600 border-slate-200 h-7 flex items-center">
                                Manual only
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-slate-50 text-slate-600 border-slate-200 h-7 flex items-center">
                                Closed
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="border border-slate-600 p-2 align-middle whitespace-nowrap min-w-[70px] w-[70px] max-w-[70px]" style={{ verticalAlign: 'bottom' }}>
                          <div className="flex justify-center">
                            {note.status !== "CLOSED" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={hasTask}
                                aria-disabled={hasTask}
                                title={hasTask ? "Close disabled when task exists" : "Close"}
                                className={`h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 ${hasTask ? "opacity-50 cursor-not-allowed" : ""}`}
                                onClick={() => void closeNote(note.id)}
                              >
                                Close
                              </Button>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200 h-7 flex items-center">
                                Closed
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="border border-slate-600 border-r-2 border-r-slate-800 p-2 align-middle whitespace-nowrap" style={{ verticalAlign: 'bottom' }}>
                          <div className="flex justify-center">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={hasTask}
                              aria-disabled={hasTask}
                              title={hasTask ? "Edit disabled when task exists" : "Edit"}
                              className={`h-7 text-xs border-slate-200 text-slate-700 hover:bg-slate-50 ${hasTask ? "opacity-50 cursor-not-allowed" : ""}`}
                              onClick={() => openEditNote(note)}
                            >
                              Edit
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={attachmentsDialogOpen} onOpenChange={setAttachmentsDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Attachments</DialogTitle>
          </DialogHeader>
          {attachmentDialogItems.length === 0 ? (
            <div className="text-sm text-slate-500">No attachments in the current view.</div>
          ) : (
            <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              {attachmentDialogItems.map((item) => {
                const isImage = (item.attachment.content_type || "").startsWith("image/")
                return (
                  <div key={item.attachment.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">
                          {item.attachment.original_filename}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatFileSize(item.attachment.size_bytes)} • {formatDate(item.noteCreatedAt)}
                        </div>
                        <div className="mt-2 text-xs text-slate-600 truncate">
                          {item.noteContent}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isImage ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => void openAttachmentPreview(item.attachment)}
                          >
                            View
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => void downloadAttachment(item.attachment)}
                        >
                          Download
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(previewUrl)}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewUrl((prev) => {
              if (prev) window.URL.revokeObjectURL(prev)
              return null
            })
            setPreviewTitle(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{previewTitle || "Attachment preview"}</DialogTitle>
          </DialogHeader>
          {previewUrl ? (
            <div className="flex max-h-[70vh] items-center justify-center overflow-hidden rounded border border-slate-200 bg-white p-2">
              <img src={previewUrl} alt={previewTitle || "Attachment preview"} className="max-h-[66vh] w-auto object-contain" />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(taskDialogNoteId)} onOpenChange={(open) => (!open ? setTaskDialogNoteId(null) : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Task from Note</DialogTitle>
          </DialogHeader>
          {taskDialogNote ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Textarea
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="min-h-[72px]"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <BoldOnlyEditor value={taskDescription} onChange={setTaskDescription} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select 
                    value={taskPriority} 
                    onValueChange={(v) => {
                      // Reset to NORMAL if switching between project/non-project modes and current value is invalid
                      const nextValue = v as TaskTypeOption
                      const isValid = availablePriorityOptions.includes(nextValue)
                      setTaskPriority(isValid ? nextValue : "NORMAL")
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePriorityOptions.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Finish by (optional)</Label>
                  <Select
                    value={taskFinishPeriod}
                    onValueChange={(value) =>
                      setTaskFinishPeriod(value as TaskFinishPeriod | typeof FINISH_PERIOD_NONE_VALUE)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None (all day)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FINISH_PERIOD_NONE_VALUE}>None (all day)</SelectItem>
                      {FINISH_PERIOD_OPTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Start date (optional)</Label>
                  <Input type="date" value={taskStartDate} onChange={(e) => setTaskStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Due date</Label>
                  <Input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
                </div>
               
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Departments</Label>
                  <div className="rounded-md border bg-white p-2">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {taskDepartmentIds.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No departments selected.</span>
                      ) : (
                        taskDepartmentIds.map((id) => {
                          const dept = departments.find((d) => d.id === id)
                          const label = dept?.name || id
                          return (
                            <button
                              key={id}
                              type="button"
                              className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs"
                              onClick={() =>
                                setTaskDepartmentIds((prev) => prev.filter((item) => item !== id))
                              }
                            >
                              {label}
                              <span className="text-slate-500">×</span>
                            </button>
                          )
                        })
                      )}
                    </div>
                    <Select
                      value="__dept_picker__"
                      onValueChange={(value) => {
                        if (value === "__dept_picker__") return
                        setTaskProjectId("NONE")
                        setTaskDepartmentIds((prev) => (prev.includes(value) ? prev : [...prev, value]))
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Add department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__dept_picker__" disabled>
                          Add department
                        </SelectItem>
                        {departments
                          .filter((dept) => !taskDepartmentIds.includes(dept.id))
                          .map((dept) => (
                            <SelectItem key={dept.id} value={dept.id}>
                              {dept.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Project (optional)</Label>
                <Select
                  value={taskProjectId}
                  onValueChange={(value) => setTaskProjectId(value)}
                  disabled={effectiveTaskDepartmentIds.length === 0 && taskProjectOptions.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No project</SelectItem>
                    {taskProjectOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title || p.name || "Untitled project"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {effectiveTaskDepartmentIds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Choose a department to filter its projects.</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Assign to</Label>
                <div className="rounded-md border bg-white p-2">
                  <div className="flex flex-wrap gap-2 mb-2">
                    {taskAssigneeIds.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No assignees selected.</span>
                    ) : (
                      taskAssigneeIds.map((id) => {
                        const person = taskAssigneeOptions.find((p) => p.id === id)
                        const label = person?.full_name || person?.username || id
                        return (
                          <button
                            key={id}
                            type="button"
                            className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs"
                            onClick={() =>
                              setTaskAssigneeIds((prev) => prev.filter((item) => item !== id))
                            }
                          >
                            {label}
                            <span className="text-slate-500">×</span>
                          </button>
                        )
                      })
                    )}
                  </div>
                  <Select
                    value="__picker__"
                    onValueChange={(value) => {
                      if (value === "__picker__") return
                      setTaskAssigneeIds((prev) => (prev.includes(value) ? prev : [...prev, value]))
                      const person = users.find((u) => u.id === value)
                      if (person?.department_id) {
                        setTaskDepartmentIds((prev) =>
                          prev.includes(person.department_id as string)
                            ? prev
                            : [...prev, person.department_id as string]
                        )
                      }
                    }}
                    disabled={taskAssigneeOptions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Add assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__picker__" disabled>
                        Add assignee
                      </SelectItem>
                      {taskAssigneeOptions
                        .filter((person) => person.id && !taskAssigneeIds.includes(person.id))
                        .map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {person.full_name || person.username || person.id}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                {taskDepartmentIds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Select one or more departments to guide projects (optional).</p>
                ) : null}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTaskDialogNoteId(null)}>
                  Cancel
                </Button>
                <Button disabled={creatingTask} onClick={() => void createTaskFromNote(taskDialogNote)}>
                  {creatingTask ? "Creating..." : "Create task"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editNoteId)} onOpenChange={(open) => {
        if (!open) {
          setEditNoteId(null)
          setEditDescription("")
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Note text</Label>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-[140px]"
              />
            </div>
            {editNoteId && noteTaskInfo.get(editNoteId)?.taskId ? (
              <div className="space-y-2">
                <Label>Description</Label>
                <BoldOnlyEditor value={editDescription} onChange={setEditDescription} />
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setEditNoteId(null)
                setEditDescription("")
              }}>
                Cancel
              </Button>
              <Button onClick={() => void saveEditNote()} disabled={savingEdit}>
                {savingEdit ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
