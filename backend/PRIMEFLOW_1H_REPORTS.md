# PrimeFlow 1H report automation

## RLZ Daily Control extension

The same `primeflow-report-scheduler` PM2 process also owns the database schedule
with `report_type=RLZ_DAILY_CONTROL`. It creates an APScheduler `CronTrigger`
from the stored execution time, weekdays and timezone, hot-reloads changes every
45 seconds, and dispatches three RLZ variants Monday-Friday in Europe/Tirane:

- `PRECHECK` at 16:10: missing save, reason, required comment, moved deadline, or 1H slot.
- `FINAL` at 16:30: per-person comparison of the saved weekly plan and the day's actual work.
- `CORRECTION` at 17:05: only material changes made after FINAL; no email is sent when nothing changed.

The separate official Daily Realization snapshot remains the existing Celery job
at 16:20. User reason/comment inputs stay editable until 17:00. RLZ email delivery
itself does not use Celery.

Schedules and recipients are report-type aware. RLZ recipients have no guessed
or environment fallback address: a valid `RLZ_DAILY_CONTROL` recipient must be
configured in Report Management. Delivery runs and immutable snapshots reuse
`primeflow_report_delivery_runs` and `primeflow_report_snapshots`.

Daily Report close validation, Reports & Control, fresh/manual previews, and the
scheduled email all call the shared Daily RLZ compliance service.

FINAL contains completed, unfinished, in-progress, extra, next-day carryover and
postponed tasks, including reason, comment and deadline changes. System Tasks are
included only when their template has `show_in_weekly_planner=true`.

Before FINAL, every employee closes their own day and the department MANAGER
approves that person's reasons, comments and postponements from Realization.
ADMIN may approve any department; MANAGER may approve only users whose
`department_id` matches their own. Approvals are append-only audit events tied to
the exact personal close event. Any later task/reason/comment/deadline change
makes the approval `STALE` until the employee closes again and the manager
re-approves. PRECHECK reports pending/stale approvals and FINAL records the
approval status for every person.

The recipient group is shared by all three variants and supports TO/CC/BCC.
ADMIN and MANAGER users can edit the active recipient and schedule settings in
Report Management.

## Decision and root cause

The missed reports were caused by an intermittent connector/tool-discovery path before the PrimeFlow API was called. Scheduled delivery now runs in the dedicated `primeflow-report-scheduler` PM2 process and calls the authenticated FastAPI Common View endpoint directly. MCP remains available for interactive work.

Five weekday jobs run in `Europe/Tirane`: 09:00→10:00, 10:50→11:00,
11:40→11:50, 14:10→14:20, and 15:50→16:00. Every job first processes its
predecessor. PostgreSQL uniqueness and row locking prevent duplicate sends.
Common View truncation prevents delivery.

## Configuration

Set all variables documented in `.env.example`. Delivery authenticates directly
to `smtp.gmail.com:587` with STARTTLS. `EMAIL_USER` is used as both the SMTP
login and the message/envelope sender; `EMAIL_PASSWORD` must be a Google app
password. Secrets must remain in GitHub/PM2 configuration.

AI narrative generation is optional. Deterministic application code always owns
task selection, counts and classifications. Enable it with
`REALIZATION_DAILY_REPORT_AI_ENABLED=true`, configure `OPENAI_API_KEY`, and
optionally override `REALIZATION_DAILY_REPORT_AI_MODEL` (default
`gpt-5.4-mini`). The integration uses the Responses API with strict structured
output and `store=false`; failures fall back to the deterministic report.

## Migration and deployment

GitHub Actions applies the current migration chain automatically on every backend
deployment before PM2 restarts the services. For local or manual deployments, run:

`alembic upgrade head`

`0073` seeds the original report configuration. The historical `0106` migration
temporarily reduced it to one Friday schedule. `0108_restore_primeflow_1h_schedules`
restores all five weekday schedules while keeping the Weekly Planning Audit in its
separate Celery Beat configuration. Stop `primeflow-report-scheduler` before
downgrading; preserve/export snapshots and audit history first.

Deploy the branch through review. Confirm the MCP functional check completes, PM2 reports `primeflow-report-scheduler` online, and its log contains `scheduler_ready jobs=5 timezone=Europe/Tirane`. Deployment health checks never send email.

## Operations

Dry run (fresh data, no email):

`python -m app.commands.primeflow_report --date 2026-07-28 --slot 10:00`

Explicit send/backfill:

`python -m app.commands.primeflow_report --date 2026-07-28 --slot 10:00 --send`

Inspect authenticated history:

`GET /api/admin/report-delivery-runs?date=2026-07-28&slot=10:00&status=SENT`

Management Center:

`/admin/1h-reports`

It provides fresh HTML/text preview, confirmed manual send, database recipients,
variant schedule editing/hot reload, exact snapshots, and configuration audit.
Automatic delivery uses active database recipients; environment recipients are
only a migration/bootstrap fallback.

Example body structure:

```text
SLOTI 27.07.2026 16:00
1. Employee Name
1.1 🟡 IN PROGRESS Exact task title
Përshkrimi:
Exact original description

SLOTI 28.07.2026 10:00
...
```

## Production verification and rollback

1. Apply migration manually and set secrets.
2. Run the dry-run command; verify current `generated_at`, no truncation, exact titles/descriptions, section order, and no email.
3. Check MCP initialization/tools/list/health and all five weekday scheduler jobs.
4. After the first scheduled run, verify exact Gmail subject/recipients and stored message/thread IDs.
5. Roll back by stopping only `primeflow-report-scheduler`, reverting the application commit, and downgrading the migration only after preserving delivery history. MCP and API ports are unchanged; Weekly Planning Audit Celery jobs are separate.
