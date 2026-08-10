# PrimeFlow Realization Automation

## Operational RLZ Pulse

RLZ Pulse is the Monday-to-Friday steering signal. It is deliberately separate
from `RealizationSymbol` and from the official A+/A/B/C/M/D/E evaluation:

- `+` — cumulative expected plan is achieved and there is no unresolved negative evidence.
- `++` — measurable cumulative output is above the expected target. Merely adding tasks is not enough.
- `DIAMOND` (`♦`) — planned obligations are completed/accounted for and a genuine extra contribution has verified DIAMOND evidence.
- `?` — the person is below plan, has Pink/no-progress work, a missing required result comment, or unresolved negative evidence.
- `OK` — raw output is below plan but the exact shortfall is covered by approved postponement, absence, priority change, external blocker, or manager-confirmed evidence. Counters are never inflated.

Zero planned obligations produce `OK` with `Pa obligime të planifikuara` and
`0%`; the system never creates an artificial 100% denominator.

## M3 relationship

M3 remains the operational report and RLZ remains the evidence/evaluation
domain. RLZ never parses generated M3 email or document text. Both features use
the same normalized source records: tasks, daily progress, official planner
snapshots, personal task comments, attendance/Common View leave, meetings,
system tasks, and Realization observations. Pink work, late/open obligations,
missed meetings and approved blockers therefore flow into Pulse without making
the M3 document itself a source of truth. Operational M3 questions that are not
performance evidence do not affect Pulse.

## Personal daily close (`RLZ im`)

STAFF can read only their own Realization result and non-private evidence.
Before `Mbylle ditën`, the API recalculates the current daily facts so closure
does not rely on a stale 16:20 snapshot. A short daily comment is mandatory.
The close stores the suggested Pulse, confirmed Pulse, operating mode, counters,
recovery facts and task IDs in an append-only `realization_daily_close_events`
row plus `AuditLog`.

Reopen and correction create later events linked with `supersedes_event_id`;
they do not edit or delete the original close. Reopen requires a manager/admin
reason. Managers can see close state for each employee in their department.

## Task result comments

An assigned employee explicitly changing an RLZ-relevant task to `DONE` must
first store their own non-empty `TaskUserComment`. A comment from another
assignee does not satisfy this rule. The API enforces it for explicit task
completion; the UI opens a result-comment flow and shows the Albanian guidance.
Manager/admin exceptional completion requires a reason and writes an audit
event. Quantity/scheduler-driven automatic completion is not blocked; missing
personal confirmation remains visible to RLZ instead of being invented.

## SAVE THE DAY recovery

Each daily result stores deterministic recovery metrics: expected and actual
cumulative output, delta, weekly obligations remaining, working days remaining,
Pink count, justified shortfall, unverified/verified extras, and the exact count
needed to return to `+`. These values power `Çfarë duhet për ta shpëtuar javën?`.

## Live weekly and monthly Pulse

Every daily result keeps that day's Pulse. The weekly API returns the
Monday-Friday history, snapshot state, personal-close state, and current
projected weekly Pulse. It is explicitly operational and may change each day.
Friday FINAL continues to use the existing immutable workflow and letter policy.

Monthly RLZ aggregates official weekly results rather than re-reading M3. It
returns weekly drill-down IDs/dates, Pulse counts, Pink days, positive extras,
negative evidence, trend and current monthly status.

## Operating modes

`departments.realization_mode` configures the pilot without hardcoded people or
department names:

- `AUTO`: system Pulse is confirmed automatically; manager/admin override needs a reason.
- `SEMI_MANUAL`: system suggestion remains stored separately; employee or manager confirms it and any change needs a reason.
- `MANUAL`: counters/evidence remain automatic, but an authorized user selects Pulse and must always give a reason.

No mode can create DIAMOND without verified DIAMOND evidence, turn `?` into
`OK` without justification, modify PLANNED snapshots, or mutate a locked period.

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
