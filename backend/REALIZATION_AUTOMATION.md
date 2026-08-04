# PrimeFlow Realization Automation

## What is automatic

- A department snapshot is stored every working day at `16:20` in `Europe/Tirane`.
- The snapshot measures tasks planned for that date, system tasks, tasks added after the official weekly plan, fast tasks, attendance, and cumulative weekly completion.
- Daily and weekly figures are stored separately: daily completion uses only tasks scheduled for that date, while weekly completion uses the cumulative official `PLANNED` set. A zero-task denominator is displayed as `0%`, never as artificial `100%`.
- Additional and fast tasks are accumulated from the `PLANNED` timestamp through the latest daily snapshot and remain separate from planned-task completion.
- Only active department users are eligible. A full-day `PV/FEST` entry in Common View excludes that person from the matching daily snapshot; leave covering every working day excludes the person from the weekly evaluation and Excel export.
- If the official `PLANNED` baseline is missing, the first daily run freezes the active weekly plan automatically.
- On Friday at `17:25`, the official `FINAL` state is captured and the weekly result is calculated automatically.
- Automatic snapshots store scheduler provenance, type, creator, and timestamp in their auditable payload; manual versions remain available for comparison.
- Adding, verifying, or voiding manager evidence recalculates every unreviewed weekly result immediately.
- MST and TT project progress is averaged from the latest recorded quantities; other projects remain task-level evidence.

## Workflow

`OPEN -> CALCULATED -> REVIEWED -> APPROVED -> LOCKED`

- Managers can view and review only their department.
- Admins can view every department, approve, lock, and export the all-department workbook.
- Staff cannot open the Realization module or its API data.
- Locked periods are immutable.

## Evidence rules

- Automatic values always include evidence IDs and a source status.
- Missing attendance/meeting distinctions are marked `AUTO_NEEDS_CONFIRMATION`; the system does not invent an answer.
- Annual leave is separate from approved personal absence. A person on annual leave for every working day is excluded from the weekly realization; approved personal absence may result in `M` when obligations are accounted for.
- Positive extras affect `A/A+` only after manager verification.
- No monetary values are exposed or exported.

## Live versus final report

- During the week, the screen and Excel export are marked `AKTUAL (SNAPSHOT DITOR)` and are populated from the latest stored daily result for each eligible active person.
- Live rows show weekly-plan tasks, tasks closed through the latest snapshot, tasks scheduled today, and cumulative additional tasks. They do not claim that a task is on time or late.
- After the Friday `FINAL` snapshot and weekly calculation, the report switches to the final classification, deterministic letter suggestion, manager review, approval, and lock workflow.

## Optional AI

AI is advisory only. It receives an anonymous result ID, counters, task states, and evidence metadata—never the employee name. Requests use the Responses API, strict structured JSON, and `store: false`. AI output is stored with model, timestamp, and actor for audit, but never overwrites the deterministic or final grade.

Configure in `backend/.env`:

```dotenv
OPENAI_API_KEY=...
REALIZATION_AI_ENABLED=true
REALIZATION_AI_MODEL=gpt-5.2
```

Restart the API and workers after changing configuration. Never commit the real key.

## Deployment

1. Apply Alembic migration `20260804_realization_automation`.
2. Restart the FastAPI service, Celery worker, and Celery Beat.
3. Confirm every department has an active manager or that at least one active admin exists.
4. Save the weekly planner `PLANNED` snapshot at planning lock and the `FINAL` snapshot before Friday finalization.
