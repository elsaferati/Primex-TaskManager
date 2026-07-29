# ADR: PrimeFlow Realization domain

- Status: Accepted for PR-01
- Date: 2026-07-29
- Scope: Domain contract and persistence only

## Context

PrimeFlow already owns task creation and lifecycle, daily progress, weekly planner
snapshots, task reviews, attendance, meetings, audit logs, exports, and report
delivery. Realization needs to evaluate immutable period evidence without becoming
a second task system or changing those workflows.

The current Alembic graph has two heads (`0102_merge_question_tasks` and
`0073_add_primeflow_report_management`). The PR-01 migration intentionally
depends on both heads so the new domain has one well-defined database baseline.

## Decision

Realization is an additive domain with five new tables:

1. `realization_policy_versions` versions the decision-tree criteria, bonus
   guide, and AM/PM cutoffs.
2. `realization_periods` identifies daily, weekly, and monthly calculation
   windows and pins explicit policy and weekly snapshot references.
3. `realization_observations` is an append-only evidence log. Corrections void
   an event; they never overwrite its meaning or delete source data.
4. `realization_person_results` keeps facts and suggested values separate from
   manager-approved final values.
5. `realization_department_results` stores period aggregates without exposing
   private person comments.

All references to tasks, projects, departments, users, planner snapshots, and
audit logs are read/evidence references. The Realization domain never updates
those source records.

Python enums define the domain vocabulary. Database check constraints protect
the same vocabulary and critical invariants, including:

- `NEUTRAL` is an observation marker; `MIXED` is the weekly `+/-` symbol.
- `DIAMOND` is evidence and has no automatic grade mapping.
- daily periods use AM/PM slots; weekly/monthly periods use ALL.
- calculated/reviewed/approved/locked weekly periods require explicit PLANNED
  and FINAL snapshot IDs.
- observations with negative, diamond, time-saved, or repeated-problem evidence
  require the supporting fields defined by the contract.
- final result fields are all-null or complete; a final value different from
  the suggestion requires an override reason.
- locked periods are immutable by application policy. A correction will create
  a later version in PR-09.

The initial `PrimeFlow Realization` policy (version 1) is seeded by the migration.
Its JSON records the ordered A+/A/B/C/M/D/E decision tree and suggested EUR
bonuses. Historical results reference the policy row rather than live settings.

## Authorization contract

PR-01 adds pure authorization helpers, not endpoints:

- STAFF can see their own detailed result and observations visible to them.
- MANAGER can review and see details only in their own department.
- ADMIN can see all departments and is the only current role allowed to approve
  or lock a period.
- `PRIVATE_MANAGER` observations are hidden from STAFF, including their subject.
- team aggregate access never implies access to private comments.

Every future override, review, approval, lock, void, and correction must create
an `AuditLog` event in the same transaction. PR-01 enforces override reason at
the schema/database boundary; the transactional audit write belongs with the
workflow endpoints in PR-05.

## Integration-only touches

- `backend/app/models/enums.py`: adds Realization vocabulary; no existing enum
  or task behavior is changed.
- `backend/app/models/__init__.py`: imports the five new models so metadata and
  Alembic can discover their tables.
- `backend/app/schemas/__init__.py`: remains compatible while exposing the new
  schema module.

No task, planner, review, daily-progress, report, router, service, or frontend
workflow is modified in PR-01.

## Consequences

- Calculations can become deterministic because periods pin policy and snapshot
  identities.
- Suggested and final outcomes can be audited independently.
- Observation history remains explainable after a void.
- PR-02 can collect evidence without schema churn.
- PR-05 must implement transactional audit writes and reject any mutation of a
  locked period.

