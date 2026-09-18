# Automatic weekly Realization implementation

## M3 manager review

Weekly M3 includes an optional, qualitative responsible-manager review for the
person's **Planning** and **Realization** dimensions. Each dimension is stored as
auditable `RealizationObservation` evidence for that weekly `period_id`; it is
separate from every Daily review and the two dimensions never overwrite each other.

The responsible manager can choose **Mirë**, **Shumë mirë**, **Kërkon veprim**,
or **Keq**, and each requires a non-empty comment. The rating is stored as
`review_rating` in observation evidence; the first two map to `POSITIVE`, and the
last two map to `NEGATIVE`. Existing marker-only reviews remain readable.
No row means **Pa vërejtje**;
the system does not create a neutral/default observation. Edits supersede/void the
previous active observation so manager, timestamp, comment, and history remain
explainable.

This management judgment is excluded from automatic evidence calculations. It does
not change weekly progress, Plan Realization, Deadline Compliance, task
classification, outcome, grade, or symbol. Department managers are restricted to
their own department, STAFF cannot write reviews, and ADMIN retains broad access.

## Daily and weekly evaluation checklist

The reference evaluation checklist is represented as 17 explicit questions in
both Daily and Weekly Realization. Eight answers come from system evidence:

- completion of the plan;
- tasks with no progress;
- tasks still in progress;
- newly added tasks;
- approved or unresolved postponements;
- closed tasks;
- attendance tardiness;
- unexpected absences.

The remaining nine are manager inputs because they require human judgment:
respecting meeting times,
requested extra tasks, helped a colleague, extra engagement, gave a proposal,
the week's/day's positive contribution, problems caused, impact on another
person's plan, and repetition after clarification. Boolean inputs accept Yes,
No, or Not applicable. Daily dropdown choices use question-specific wording,
including respected/not respected meeting times. The two contribution/problem
questions have dropdown categories and a free-text explanation; the manager can
edit the final weekly narratives. Every saved answer
is append-only and belongs to that person's `result_id` and its DAILY or WEEKLY
`period_id`, so a daily answer never overwrites a weekly answer or another date.

Daily Realization shows the checklist after selecting a person. Automatic facts
include the selected day's task counts and attendance evidence. Managers can fill
the nine inputs there; staff can read the resulting checklist. Weekly
Realization aggregates the latest daily answer per question, person, and date.
A single negative meeting answer makes the weekly meeting answer negative;
the other boolean questions use any positive occurrence. N/A is excluded from
boolean voting and remains explicit in the dated history. Narrative choices
and comments are retained by date. Missing working-day answers are shown as
partial, never assumed to be "No" or "OK"; full-day Common View leave is excluded.
Future days are not expected until their date. A complete daily rollup satisfies
weekly completeness without re-entering answers. An explicit weekly manager
answer overrides the rollup while preserving the daily history. Weekly approval
stores the rollup, and locked weekly reports retain that stored evidence. Daily
edits mark the related unlocked weekly AI analysis as stale. The rollup is also
included in the AI input with its manual provenance and missing dates; it does
not itself change task percentages, payroll, or deterministic policy grades.
Ambiguous postponements or absences are marked as automatic facts that still need
manager confirmation rather than being silently treated as resolved.

The weekly page displays a compact table with filtered totals followed by a row
per employee. Managers and administrators can filter all departments or one
department, and all employees or one employee. The realization percentage counts
all completed work, including extras, against the baseline planned count, capped at
100%. With no planned work, extras form the denominator. Extras that remain
open do not add completion credit. Snapshot task facts and daily timeline entries
are deduplicated by task identity. Totals sum employee obligations, so shared
assignments contribute once per employee; they are not unique department tasks.
Automatic A+–E grading and verification requirements remain separate.

## Extra task counts and estimated progress

Daily and weekly tables distinguish **Ekstra gjithsej** (all report obligations
outside the initial plan, at any outcome) from **Ekstra të kryera** (the completed
subset). Daily extras can include newly added, reassigned, or carried-over tasks
absent from the day's baseline. Extra completions include early and late work
outside that baseline. Weekly extras are deduplicated across the week.
**Kryer gjithsej** already includes completed extras; do not add them again.
**Plan** displays the baseline count plus all extras, for example `5+2` when two
extra obligations exist, even if only one is completed. The realization denominator
remains the initial planned count.

The **Ekstra** column group has four subcolumns in order: **Të kryera**,
**Në progres**, **Pa progres**, **Gjithsej**. These three states partition the total.
Completed daily extras take precedence over progress; progress includes status,
classification, or positive progress recorded that day. The remaining unfinished
extras go under **Pa progres**, including waiting or postponed work without
recorded progress. Weekly extras use deduplicated task facts and their latest
state, preserving completed work across repeated daily entries.

Click any daily extra count to open that employee's tasks filtered to that state
or all extras. Extra tasks also show a badge identifying them as outside the
initial plan.

The daily staff table places the person and department filters in a header row
above **Emri mbiemri** and **DEP**. Person filtering keeps the staff table visible
and updates the summary; clicking a name or extra count separately opens task
details. Changing department resets the person filter and closes task details.
Staff rows are grouped in **DEV → GD → PCM** order, then other departments.
The chosen daily sort applies within each department, with name as the tie-breaker.

The daily staff table shows **Afat sot**, **Kryer**, and **Pa kryer** for every
task whose due date was the report date. A thick red border around **Afat sot**
indicates that the person has at least one task marked as deadline important on
that date. Immutable daily deadline evidence keeps a task in the report-date
population when its due date is moved later. **Pa kryer** is
`gjithsej - kryer` and includes postponed deadlines. Clicking a number opens
the person's task list with the matching deadline filter. Each task badge
explicitly says `Deadline` or `Deadline Important`, followed by `kryer`,
`pa kryer`, or `shtyrë`.

The daily staff table also shows **Sasi · produkte / pika**, with **Planifikuar**,
**Kryer**, and **+ / −**. These are unit quantities, separate from task counts
and the status-based realization percentages. Clicking a person's name shows
the quantities and their source for each task.

- A title such as `EF: FRG: 2/17 SHTO 2 KZH TE REJA` plans **2** units. The
  smaller number is always the daily target: `40/4` plans **4**, `17/4` plans
  **4**, and both `117/20` and `20/117` plan **20**. The current title supplies
  the target, so title corrections immediately update the quantity. Formatting markers
  are removed before reading the fraction. A deleted task falls back to its
  captured title.
  Completed units are distinct struck checklist points for the selected local
  day. Mirrored title/description points count once. Strike timestamps/history
  exclude previous-day work; reopened points do not count. Undated legacy
  strikes fall back only to the task's due/completion day. Striking the whole
  single-line quantity heading marks all its planned units complete. An explicit
  `DONE` recorded on the report day always marks all planned units complete,
  even when checklist strikes are partial or absent; older completions do not.
- Project tasks in the `PRODUCT` phase use the M3 product-count parser:
  `daily_products` is planned and `completed_products=N` is completed. A daily
  product progress record overrides current live values for its report day.
  Current notes do not credit completed products to a different day. Copied
  totals on `CONTROL` or nonproject tasks do not count as product production.
- Difference is completed minus planned: plan 2/done 1 displays **−1**;
  plan 2/done 2 displays **0 ✓**; plan 2/done 3 displays **+1**. Rows without
  quantitative targets display **—**. Transferred-out obligations are excluded
  from the previous owner's quantity totals.
Weekly rows follow the same department order and sort by name within each group.

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

- The **Vlerësimi** table cell opens one combined person modal. It contains the
  qualitative rating (including **Shumë mirë**), the manager summary, automatic
  facts as read-only context, and the manual checklist answers.
- Categorical checklist answers support multi-select. Boolean questions keep a
  single `Po / Jo / Nuk aplikohet` choice. Daily rollups and dated history are
  visible in the modal before a weekly override is saved.
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

