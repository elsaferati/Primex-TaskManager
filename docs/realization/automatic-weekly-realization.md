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
Planned obligations remain attributed to PLANNED assignees. Additional work is
attributed to FINAL assignees. Live task rows, task audit logs, daily progress,
attendance, and append-only Realization observations supplement (but never
replace) snapshot facts.

Deadline and postponement decisions are conservative. A due-date edit alone is
not approval; where the existing audit trail cannot prove approval or rejection,
the fact is marked `NEEDS_REVIEW`. Meeting participant rows are invitation
evidence only and do not prove attendance.

## Deterministic calculation

The policy service validates versioned JSON and applies first-matching rules.
The calculator upserts one existing `RealizationPersonResult` per snapshot user
and one existing `RealizationDepartmentResult`. It preserves review/final fields
and refuses recalculation after CALCULATED has advanced to REVIEWED.

Normalized question answers, classification reasons, IDs, source status, and
evidence are stored in `facts_json`. The Albanian narrative is produced by a
deterministic formatter. Department task totals de-duplicate snapshot match keys
instead of summing multi-assignee person counters.

## Review, approval, and locking

- MANAGER: review results and verify observations in their department.
- ADMIN: same access across departments, plus approve and lock.
- Override requires a reason.
- Every review, approval, lock, observation verification, and void writes an
  `AuditLog` entry in the same transaction.
- LOCKED periods reject all mutations.

The status flow is `OPEN -> CALCULATED -> REVIEWED -> APPROVED -> LOCKED`.

