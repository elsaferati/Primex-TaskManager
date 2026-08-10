# Weekly Planning Audit

`Reports & Control → Weekly Planning Check` is a read-only audit of the next
Monday–Friday working week in `Europe/Tirane`. If no week is supplied, the
service selects the next Monday even when invoked on a Monday. Manual requests
must supply a Monday; other dates are rejected.

Every Preview, Generate Excel, and Generate and Send action queries the current
Weekly Planner state. The report enriches those occurrences from current Task,
Project, User, Department, approved Common View annual-leave, KO, 1H, and
system-task metadata. It never updates tasks, projects, users, planner rows,
leave, meetings, Common View rows, or templates. A generated run stores the
exact report payload, XLSX checksum, recipients snapshot, counts, and version
for later audit/history.

## People and annual leave

- Include active employees.
- Exclude inactive users, all `ADMIN` role accounts, known Admin identifiers,
  and exact identifiers listed in `WEEKLY_PLANNING_AUDIT_EXCLUDED_ACCOUNTS`.
- Read only approved Common View annual leave.
- Exclude a person only when approved full-day leave covers all five reporting
  days. Record that person in `excluded_full_leave`.
- Keep partial-week leave users in the report, display the exact dates, and emit
  `TASK_ON_ANNUAL_LEAVE` once for each task occurrence on each full leave day.
- Partial-day leave is not treated as a full leave day.

## Deterministic validation

An error is emitted only when an authoritative field violates an applicable
rule. The report does not infer missing work from aggregate counts.

- AM/PM (`finish_period`) is informational and is **not audited** on Friday.
  Missing AM/PM never emits `FINISH_PERIOD_MISSING` and never changes counts.
- Status and priority use the current Task model values. Priority is required
  only for real, non-system Task rows.
- `due_date` is nullable and is not required globally. A real
  `start_date > due_date` still emits `DATE_RANGE_INCONSISTENT`.
- KO ownership uses `ko_rule_applies_for_task` and `parse_ko_user_id`; title text
  does not create a KO rule.
- Total/Mesatare is checked only for tasks where the authoritative KO rule
  applies.
- 1H is checked only when `is_1h_report` is true.
- R1, personal (`P:`), and BLL are checked only through their structured flags.
- WFC and BKP formatting is checked only when the current title identifies an
  actual WFC/BKP task. Their absence is never an error.
- A zero R1/BLL/WFC/BKP/1H count is never an error.
- Missing substantive focus does not create `NO_MEANINGFUL_WEEKLY_PLAN`.

Intrinsic errors are deduplicated by user + task + rule. Occurrence errors such
as annual leave and out-of-week dates additionally include the occurrence date.
Summary, CRITICAL, and HIGH counts are always recalculated from detail rows and
validated before workbook creation.

## Titles, PX abbreviations, and focus

The report removes only `[[added]]`, `[[/added]]`, `[[done]]`, and `[[/done]]`
markers and preserves their contents. The exact cleaned current title remains
evidence. Suggested titles are concise; steps, long explanations, URLs, paths,
and checklists are suggested for Description/Notes. Suggestions never update the
real Task.

The imported PX XLSX dictionary is authoritative. `SHKURTESAT PX` contains only
that dictionary. A generated/AI title may introduce an uppercase abbreviation
only when it is official or already exists unchanged in the source as a client
or project identifier. `RREG` is not official and is expanded to `Rregullim`.

Weekly focus is selected deterministically; AI never selects it. Eligible
substantive project/work is ranked by project work, explicit project priority
when present, distinct business days, occurrence count, HIGH/deadline
tie-breakers, and a stable identifier. System/template work, GDPR routine,
PLNF JAV, 1H, BLL, R1, P:, WFC, BKP, routine reports, standard meetings,
ordinary checks, routine emails, payment reminders, and administrative
housekeeping are excluded. The exact fallback is:

`Nuk është përcaktuar fokus jo-sistem`

## AI boundary

OpenAI is optional and uses strict JSON only for semantic title problems that
structured fields cannot determine. The server rejects empty findings, unknown
task IDs, invalid severity, missing correction/problem/title, and proposed
titles with invented abbreviations. AI cannot create tasks, metadata, business
rules, abbreviations, focus, or deterministic errors. Missing key, disabled AI,
timeout, invalid output, or API failure leaves the deterministic report valid.
Statuses are `used`, `disabled`, `missing_api_key`, `fallback`, and `not_needed`.

## Excel and delivery

The workbook contains exactly, in order:

1. `RAPORTI FINAL`
2. `DETAJET E GABIMEVE`
3. `TITUJT - SHKURTESAT PX`
4. `SHKURTESAT PX`
5. `DËRGIMI AUTOMATIK`

It has frozen headers, filters, wrapped text, date/severity formatting, PX and AI
metadata, run/version data, and a deterministic report-payload checksum. Before
delivery it is reopened and checked for exact sheets, headers, row counts,
technical markup leakage, and summary/detail integrity.

Required To recipients are always preserved:

- `130primex.eu@gmail.com`
- `info@primexeu.com`
- `ga@primexeu.com`

CC/BCC remain configurable. Runs transition through `GENERATING`, `GENERATED`,
`SENDING`, `SENT`, or `FAILED`. `SENT` is set only after SMTP acceptance. SMTP
does not provide a Gmail provider ID, so no provider ID is invented. Resend reads
the stored historical XLSX, verifies its checksum, and sends those exact bytes;
it never regenerates current data. Files are removed after the configured
retention period while run/delivery metadata remains in PostgreSQL.

## Configuration and deployment

```env
WEEKLY_PLANNING_AUDIT_ENABLED=true
WEEKLY_PLANNING_AUDIT_TIMEZONE=Europe/Tirane
WEEKLY_PLANNING_AUDIT_RECIPIENTS=130primex.eu@gmail.com,info@primexeu.com,ga@primexeu.com
WEEKLY_PLANNING_AUDIT_EXCLUDED_ACCOUNTS=
WEEKLY_PLANNING_AUDIT_AI_ENABLED=true
WEEKLY_PLANNING_AUDIT_AI_MODEL=gpt-5.2
WEEKLY_PLANNING_AUDIT_AI_TIMEOUT_SECONDS=90
OPENAI_API_KEY=<GitHub Actions secret>
REPORT_STORAGE_DIR=<persistent report directory>
REPORT_RETENTION_DAYS=90
```

The production schedule is Friday at 10:30 in `Europe/Tirane`. Task AM/PM slots
are unrelated to this generation time. Deployment must apply Alembic migrations,
restart the API, scheduler/worker processes, and verify `/health` serves the
deployed commit. The GitHub workflow creates `backend/.env` from secrets, so
`OPENAI_API_KEY` must exist as a repository Actions secret; it must never be
committed.
