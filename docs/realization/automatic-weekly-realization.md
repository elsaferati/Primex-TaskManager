# Automatic weekly Realization implementation

## Boundary

Realization is an additive read model over existing PrimeFlow evidence. The
implementation does not mutate tasks, daily progress, meetings, attendance, or
weekly planner snapshots. It writes only the five existing Realization tables
and workflow audit entries.

## Weekly baseline

- Normalize the requested date to Monday and use Friday as the weekly end.
- Select the earliest PLANNED snapshot for the department/week.
- Select the latest FINAL snapshot for the same department/week.
- Idempotently create the WEEKLY/ALL period and pin the applicable policy.
- Pin snapshot IDs only while the period is OPEN. Later workflow states retain
  their historical snapshot references.
- A missing FINAL keeps the period OPEN and disables calculation.

## Evidence and attribution

Snapshot `task_items` and their existing `match_key` are the comparison source.
The historical employee set is the union of users captured in the PLANNED and
FINAL snapshot payloads. Planned obligations remain attributed to PLANNED
assignees. Additional work is attributed to FINAL assignees. When the final
assignee differs, the planned owner keeps the obligation and a separate actual
work-credit fact is added only when completion or positive progress supports
it. Live task rows, task audit logs, daily progress, attendance, meeting-linked
tasks, and append-only Realization observations supplement (but never replace)
snapshot facts.

Deadline and postponement decisions are conservative. A due-date edit alone is
not approval; where the existing audit trail cannot prove approval or rejection,
the fact is marked `NEEDS_REVIEW`. Deadline priority is snapshot due date,
original due date, last planned occurrence plus the pinned policy AM/PM cutoff,
then the week-end PM cutoff. Audit/progress evidence is bounded by the FINAL
snapshot timestamp so later task edits cannot become retroactive evidence.
Meeting participant rows are invitation evidence only and do not prove
attendance.

Additional work is visible as soon as it appears in FINAL without PLANNED. It
cannot raise A/A+ unless a verified `COMPLETED_EXTRA_TASK` observation proves a
completed or explicitly high-impact task and explicitly records that the work
is neither a duplicate nor a replacement for an unfinished planned obligation.

## Deterministic calculation

The policy service validates versioned JSON and applies first-matching rules.
The calculator upserts one existing `RealizationPersonResult` per snapshot user
and one existing `RealizationDepartmentResult`. It preserves review/final fields
and refuses recalculation after CALCULATED has advanced to REVIEWED.

Normalized question answers, classification reasons, IDs, source status, and
evidence are stored in `facts_json`. The Albanian narrative is produced by a
deterministic formatter. Department task totals de-duplicate snapshot match keys
instead of summing multi-assignee person counters.

## API and MCP boundary

The PrimeFlow API is the only workflow authority:

- `GET /api/realization/weekly` ensures and reads the pinned weekly period.
- `POST /api/realization/weekly/calculate` collects evidence and applies policy.
- result review, observation create/verify/void, approval, and locking use
  dedicated Realization endpoints with backend role checks and transactional
  audit entries.

The MCP server exposes matching high-level tools for ChatGPT. MCP resolves names
and calls these API endpoints; it never reads the database to write results and
never calculates a grade in the model. PrimeFlow remains fully usable without
MCP through the `/realization` page, including missing snapshot guidance,
calculation, evidence inspection, structured observations, question
confirmation, manager review, approval, and locking.

The dedicated MCP tools are:

- `get_weekly_realization`
- `calculate_weekly_realization`
- `review_weekly_realization_person`
- `add_realization_observation`
- `verify_realization_observation`
- `void_realization_observation`
- `approve_weekly_realization`
- `lock_weekly_realization`

Calculation and every later state-changing tool require an explicit user request
and still use the connected PrimeFlow account's normal permissions.

## Review, approval, and locking

- MANAGER: review results and verify observations in their department.
- ADMIN: same access across departments, plus approve and lock.
- Override requires a reason.
- Every review, approval, lock, observation verification, and void writes an
  `AuditLog` entry in the same transaction.
- LOCKED periods reject all mutations.

The status flow is `OPEN -> CALCULATED -> REVIEWED -> APPROVED -> LOCKED`.

Migration `0105_merge_realization_batches` merges the Realization policy branch
with the concurrently added question-task-batch branch without rewriting either
already-created migration.

