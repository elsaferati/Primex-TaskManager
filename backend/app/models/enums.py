from __future__ import annotations

import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    manager = "manager"
    staff = "staff"


class TaskType(str, enum.Enum):
    adhoc = "adhoc"
    system = "system"
    reminder = "reminder"


class TemplateRecurrence(str, enum.Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    yearly = "yearly"


class CommonCategory(str, enum.Enum):
    delays = "Delays"
    absences = "Absences"
    annual_leave = "Annual Leave"
    blocks = "Blocks"
    external_tasks = "External Tasks"
    complaints = "Complaints"
    requests = "Requests"
    proposals = "Proposals"


class CommonApprovalStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class NotificationType(str, enum.Enum):
    assignment = "assignment"
    status_change = "status_change"
    overdue = "overdue"
    mention = "mention"
    reminder = "reminder"

