# Weekly Planning Audit Report

The Weekly Planning Audit is a read-only audit of PrimeFlow planning for the
next Monday–Friday working week. It uses the existing Weekly Planner query for
task occurrences and the Common View annual-leave parser. It never updates
tasks, projects, users, planners, meetings, leave entries, or system templates.

## Runtime configuration

```env
WEEKLY_PLANNING_AUDIT_ENABLED=true
WEEKLY_PLANNING_AUDIT_TIMEZONE=Europe/Tirane
WEEKLY_PLANNING_AUDIT_RECIPIENTS=130primex.eu@gmail.com,info@primexeu.com,ga@primexeu.com
REPORT_STORAGE_DIR=/var/lib/primeflow/reports
REPORT_RETENTION_DAYS=90
REDIS_ENABLED=true
REDIS_URL=redis://127.0.0.1:6379/0
```

SMTP uses the existing `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, and
`EMAIL_PASSWORD` variables.

## Deployment

```powershell
cd backend
python -m alembic upgrade head
pm2 restart primex-backend
pm2 restart celery_worker
pm2 restart celery_beat
pm2 save
```

Verify that Celery Beat lists the five Friday schedules at 09:00, 09:30,
10:00, 10:30, and 11:00 in `Europe/Tirane`. Report files are retained for the
configured number of days; delivery and run metadata remain in PostgreSQL.

Managers and admins use `/reports/weekly-planning-audit` for preview,
generation, sending, download, resend, and history. Managers and admins may
edit report settings or import a replacement PX abbreviation XLSX; every
configuration change is written to the existing audit log.
