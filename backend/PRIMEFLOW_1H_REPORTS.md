# PrimeFlow 1H report automation

## Decision and root cause

The missed reports were caused by an intermittent connector/tool-discovery path before the PrimeFlow API was called. Scheduled delivery now runs in the dedicated `primeflow-report-scheduler` PM2 process and calls the authenticated FastAPI Common View endpoint directly. MCP remains available for interactive work.

One weekly job runs every Friday at `09:00` in `Europe/Tirane` and sends the
`10:00` full-day report. Backfill is disabled, so the Friday job sends only that
report. PostgreSQL uniqueness and row locking prevent concurrent application
sends. Common View truncation prevents delivery.

## Configuration

Set all variables documented in `.env.example`. Delivery authenticates directly
to `smtp.gmail.com:587` with STARTTLS. `EMAIL_USER` is used as both the SMTP
login and the message/envelope sender; `EMAIL_PASSWORD` must be a Google app
password. Secrets must remain in GitHub/PM2 configuration.

## Migration and deployment

GitHub Actions applies the current migration chain automatically on every backend
deployment before PM2 restarts the services. For local or manual deployments, run:

`alembic upgrade head`

`0073` seeds the original report configuration. `0106_primeflow_report_friday_0900`
converts it to the single Friday schedule and disables every other report schedule.
Stop `primeflow-report-scheduler` before downgrading; preserve/export snapshots and
audit history first.

Deploy the branch through review. Confirm the MCP functional check completes, PM2 reports `primeflow-report-scheduler` online, and its log contains `scheduler_ready jobs=1 timezone=Europe/Tirane`. Deployment health checks never send email.

## Operations

Dry run (fresh data, no email):

`python -m app.commands.primeflow_report --date 2026-07-28 --slot 10:00`

Explicit send/backfill:

`python -m app.commands.primeflow_report --date 2026-07-28 --slot 10:00 --send`

Inspect authenticated history:

`GET /api/admin/report-delivery-runs?date=2026-07-28&slot=10:00&status=SENT`

Management Center:

`/admin/1h-reports`

It is ADMIN-only and provides fresh HTML/text preview, DOCX/PNG downloads, confirmed manual send, database recipients, schedule editing/hot reload, exact snapshots, and configuration audit. Automatic delivery uses active database recipients; environment recipients are only a migration/bootstrap fallback.

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
3. Check MCP initialization/tools/list/health and the Friday 09:00 scheduler job.
4. After the first scheduled run, verify exact Gmail subject/recipients and stored message/thread IDs.
5. Roll back by stopping only `primeflow-report-scheduler`, reverting the application commit, and downgrading the migration only after preserving delivery history. MCP and API ports are unchanged; Redis/Celery remain disabled.
