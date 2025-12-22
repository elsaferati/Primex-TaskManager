export type UserRole = "ADMIN" | "MANAGER" | "STAFF"

export type TaskType = "adhoc" | "system" | "reminder"

export type TemplateRecurrence = "daily" | "weekly" | "monthly" | "yearly"

export type SystemTaskFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "3_MONTHS" | "6_MONTHS"

export interface SystemTaskTemplate {
  id: string
  title: string
  description?: string | null
  department_id?: string | null
  default_assignee_id?: string | null
  frequency: SystemTaskFrequency
  day_of_week?: number | null
  day_of_month?: number | null
  month_of_year?: number | null
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
  username: string
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
  board_id: string
  name: string
  description?: string | null
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
  department_id: string
  board_id: string
  project_id: string
  title: string
  description?: string | null
  task_type: TaskType
  status_id: string
  position: number
  assigned_to_user_id?: string | null
  planned_for?: string | null
  is_carried_over: boolean
  carried_over_from?: string | null
  is_milestone: boolean
  reminder_enabled: boolean
  next_reminder_at?: string | null
  created_at: string
  updated_at: string
  completed_at?: string | null
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


