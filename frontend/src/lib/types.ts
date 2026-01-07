export type UserRole = "ADMIN" | "MANAGER" | "STAFF"

export type TaskType = "adhoc" | "system" | "reminder"

export type TaskPriority = "NORMAL" | "HIGH"

export type TaskFinishPeriod = "AM" | "PM"

export type TemplateRecurrence = "daily" | "weekly" | "monthly" | "yearly"

export type SystemTaskFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "3_MONTHS" | "6_MONTHS"
export type SystemTaskScope = "ALL" | "DEPARTMENT" | "GA"

export interface TaskAssignee {
  id: string
  email?: string | null
  username?: string | null
  full_name?: string | null
  department_id?: string | null
}

export interface SystemTaskTemplate {
  id: string
  template_id?: string | null
  title: string
  description?: string | null
  internal_notes?: string | null
  department_id?: string | null
  default_assignee_id?: string | null
  assignees?: TaskAssignee[] | null
  scope: SystemTaskScope
  frequency: SystemTaskFrequency
  day_of_week?: number | null
  days_of_week?: number[] | null
  day_of_month?: number | null
  month_of_year?: number | null
  priority?: TaskPriority | null
  finish_period?: TaskFinishPeriod | null
  is_active: boolean
  created_at: string
}

export type CommonCategory =
  | "Delays"
  | "Absences"
  | "Annual Leave"
  | "Blocks"
  | "External Tasks"
  | "Complaints"
  | "Requests"
  | "Proposals"

export type CommonApprovalStatus = "pending" | "approved" | "rejected"

export type NotificationType =
  | "assignment"
  | "status_change"
  | "overdue"
  | "mention"
  | "reminder"

export interface User {
  id: string
  email: string
  username?: string | null
  full_name?: string | null
  role: UserRole
  department_id?: string | null
  is_active: boolean
}

export interface UserLookup {
  id: string
  username?: string | null
  full_name?: string | null
  role: UserRole
  department_id?: string | null
  is_active: boolean
}

export interface Department {
  id: string
  code: string
  name: string
}

export interface Board {
  id: string
  department_id: string
  name: string
  description?: string | null
}

export interface Project {
  id: string
  title?: string
  name?: string
  description?: string | null
  department_id?: string | null
  manager_id?: string | null
  current_phase?: string
  status?: string
  progress_percentage?: number
  start_date?: string | null
  due_date?: string | null
  completed_at?: string | null
  created_at?: string
  updated_at?: string
  board_id?: string
}

export interface TaskStatus {
  id: string
  department_id: string
  name: string
  position: number
  is_done: boolean
}

export interface Task {
  id: string
  department_id?: string
  board_id?: string
  project_id?: string | null
  dependency_task_id?: string | null
  title: string
  description?: string | null
  internal_notes?: string | null
  task_type?: TaskType
  status_id?: string
  position?: number
  assigned_to_user_id?: string | null
  planned_for?: string | null
  is_carried_over?: boolean
  carried_over_from?: string | null
  reminder_enabled?: boolean
  next_reminder_at?: string | null
  assigned_to?: string | null
  assignees?: TaskAssignee[] | null
  created_by?: string | null
  ga_note_origin_id?: string | null
  system_template_origin_id?: string | null
  status?: string
  priority?: string
  finish_period?: TaskFinishPeriod | null
  phase?: string
  progress_percentage?: number
  start_date?: string | null
  due_date?: string | null
  completed_at?: string | null
  is_bllok?: boolean
  is_1h_report?: boolean
  is_r1?: boolean
  created_at: string
  updated_at: string
}

export interface ChecklistItem {
  id: string
  checklist_id?: string | null
  content: string
  is_checked: boolean
  position: number
}

export interface GaNote {
  id: string
  content: string
  created_by?: string | null
  note_type?: "GA" | "KA"
  status?: "OPEN" | "CLOSED"
  priority?: "NORMAL" | "HIGH" | null
  start_date: string
  due_date?: string | null
  completed_at?: string | null
  is_converted_to_task: boolean
  project_id?: string | null
  department_id?: string | null
  created_at: string
  updated_at: string
}

export interface ProjectPrompt {
  id: string
  project_id: string
  type: "GA_PROMPT" | "ZHVILLIM_PROMPT"
  content: string
  created_at: string
}

export interface TaskTemplate {
  id: string
  department_id: string
  board_id: string
  project_id?: string | null
  title: string
  description?: string | null
  recurrence: TemplateRecurrence
  default_status_id: string
  assigned_to_user_id?: string | null
  created_by_user_id?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CommonEntry {
  id: string
  category: CommonCategory
  title: string
  description?: string | null
  created_by_user_id: string
  assigned_to_user_id?: string | null
  approval_status: CommonApprovalStatus
  approved_by_user_id?: string | null
  approved_at?: string | null
  rejected_by_user_id?: string | null
  rejected_at?: string | null
  rejection_reason?: string | null
  generated_task_id?: string | null
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body?: string | null
  data?: Record<string, unknown> | null
  created_at: string
  read_at?: string | null
}

export interface Meeting {
  id: string
  title: string
  platform?: string | null
  starts_at?: string | null
  department_id: string
  project_id?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
}


