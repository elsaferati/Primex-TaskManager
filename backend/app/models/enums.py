from __future__ import annotations

import enum


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    STAFF = "STAFF"


class TaskPriority(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    URGENT = "URGENT"


class TaskStatus(str, enum.Enum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    REVIEW = "REVIEW"
    DONE = "DONE"
    CANCELLED = "CANCELLED"


class TaskType(str, enum.Enum):
    adhoc = "adhoc"
    system = "system"
    reminder = "reminder"


class FrequencyType(str, enum.Enum):
    DAILY = "DAILY"
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"
    YEARLY = "YEARLY"
    THREE_MONTHS = "3_MONTHS"
    SIX_MONTHS = "6_MONTHS"


class TemplateRecurrence(str, enum.Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    yearly = "yearly"


class AttendanceType(str, enum.Enum):
    VONESE = "VONESE"
    MUNGESE = "MUNGESE"
    PUSHIM_VJETOR = "PUSHIM_VJETOR"


class FeedbackType(str, enum.Enum):
    ANKESA = "ANKESA"
    KERKESA = "KERKESA"
    PROPOZIM = "PROPOZIM"


class PromptType(str, enum.Enum):
    GA_PROMPT = "GA_PROMPT"
    ZHVILLIM_PROMPT = "ZHVILLIM_PROMPT"


class HolidayType(str, enum.Enum):
    PX_INTERNAL = "PX_INTERNAL"
    CLIENT = "CLIENT"


class ProjectPhaseStatus(str, enum.Enum):
    PLANIFIKIMI = "PLANIFIKIMI"
    ZHVILLIMI = "ZHVILLIMI"
    TESTIMI = "TESTIMI"
    DOKUMENTIMI = "DOKUMENTIMI"
    MBYLLUR = "MBYLLUR"


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

