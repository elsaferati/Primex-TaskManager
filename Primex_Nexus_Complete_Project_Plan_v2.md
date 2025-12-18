# Primex Nexus — Complete Project Plan (v2, Python Backend)

> **Primex Nexus** is a production-ready, internal, web-based task & project management platform (Trello-like),
> designed for structured team management, automation, planning, and future AI integration.
>
> This version explicitly defines a **Python backend** to support AI features and scalability.

---

## 1. Purpose & Vision

### Purpose
To centralize task, project, and staff management into one platform that enables:
- Clear ownership of work
- Weekly and monthly planning
- Automatic carry-over of unfinished tasks
- Transparent reporting and exports
- Automation and AI-ready architecture

### Vision
Primex Nexus becomes the **operational brain** of the company:
- Managers plan, assign, and monitor
- Staff focus and execute
- The system enforces structure and accountability

---

## 2. Core Departments

The platform includes **three departments**:
1. Development
2. Project Content Manager (PCM)
3. Graphic Design

Plus one shared **Common View**.

---

## 3. Application Structure & Navigation

### Sidebar
- Dashboard
- Common View
- Development
- Project Content Manager
- Graphic Design
- Weekly Planner
- Monthly Planner
- Reports & Exports
- Users
- Settings (Admin / Manager only)

---

## 4. Common View (Cross‑Department)

### Categories
- Delays
- Absences
- Annual Leave
- Blocks
- External Tasks
- Complaints
- Requests
- Proposals

### Rules
- Each entry may generate a task
- Can be assigned and tracked
- Manager approval workflow
- Full audit history

---

## 5. Department Views (Kanban)

Each department has Trello‑style boards:
- Boards → Projects → Tasks
- Drag & drop statuses
- System tasks
- Manual tasks
- 1‑hour reminder tasks

### Status Examples
- To Do
- In Progress
- Review
- Blocked
- Done
- 1h Reminder (flagged task)

---

## 6. Users, Roles & Permissions (RBAC)

### Roles
- **Admin** – Full access
- **Manager** – Department & planning control
- **Staff** – Task execution

### Rules
- Staff cannot close others’ tasks
- Managers can assign, reassign, close, export
- All permissions enforced server‑side

---

## 7. Task Types

### Ad‑hoc Tasks
Manual, one‑off tasks.

### System Tasks (Recurring)
- Daily
- Weekly
- Monthly
- Yearly
Generated automatically from templates.

### 1‑Hour Reminder Tasks
- In‑app reminder every 60 minutes
- Active until completed
- No email in v1

---

## 8. Weekly & Monthly Planning

### Weekly Planner
- Auto‑generated per user & department
- Includes open, overdue, and system tasks
- Managers can rebalance workload

### Monthly Planner
- Calendar + list view
- Milestones and recurring tasks
- Historical comparison

### Automatic Carry‑Over
- Unfinished tasks automatically move forward
- Marked as *carried over*
- Logged in audit logs

---

## 9. Exports & Reporting

### Export Options
- By user
- By department
- By project
- By date range
- By status

### Formats
- CSV
- XLSX
- PDF (summary)

---

## 10. Notifications

### Types
- Assignment
- Status change
- Overdue
- Mentions
- 1‑hour reminder

### Scheduler Logic
- `next_reminder_at` stored in DB
- Worker checks periodically
- Notification sent while task is open

---

## 11. UX / UI Principles

- Modern, clean, fast
- Sidebar‑first layout
- Kanban UX
- Global search (Ctrl+K)
- Filters everywhere
- User avatars with initials

---

## 12. Technical Architecture (No Docker)

### Frontend
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui

### Backend (MANDATORY)
- **Python**
- **FastAPI**
- Async architecture
- REST + WebSockets

### Database
- PostgreSQL
- SQLAlchemy or SQLModel
- Alembic migrations

### Background Jobs
- Celery + Redis **or**
- pg‑boss equivalent in Python
- Scheduler for system tasks & reminders

### Auth
- JWT (access + refresh)
- Role‑based guards

---

## 13. Database Design (High Level)

Core tables:
- users
- departments
- boards
- projects
- tasks
- task_statuses
- task_templates
- task_template_runs
- common_entries
- notifications
- audit_logs

Designed for:
- Normalization
- Auditability
- AI feature expansion

---

## 14. AI‑Ready Architecture (Future‑Proof)

The backend must be structured to allow:
- Task summarization
- Smart prioritization
- Weekly plan suggestions
- Workload prediction
- Natural language task creation

(Actual AI features are **out of scope for v1**, but architecture must support them.)

---

## 15. Milestones

### Phase 1 — Core System
Auth, roles, tasks, boards, UI shell

### Phase 2 — Planning & Automation
Weekly/monthly planners, carry‑over, system tasks

### Phase 3 — Reports & Notifications
Exports, reminders, audit UI

### Phase 4 — Production
Security, performance, deployment

---

## 16. Definition of Done

- Python backend implemented with FastAPI
- Weekly & monthly planning functional
- Carry‑over logic works automatically
- Exports accurate
- RBAC enforced server‑side
- Deployable without Docker

---

## 17. Codex Prompt (Minimal & Final)

```
Read the file `Primex_Nexus_Complete_Project_Plan_v2.md` and implement the entire system exactly as specified.

Use Python (FastAPI) for the backend.
Use Next.js + TypeScript for the frontend.
Do not add or remove features.
The markdown file is the single source of truth.
The result must be production‑ready and deployable without Docker.
```

---

**Primex Nexus — structured work, intelligent planning, future AI.**
