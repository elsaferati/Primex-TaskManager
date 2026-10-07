# M3 / GA reporting points

The separate report at `/m3-reporting-points` has two blocks: `PIKAT PER RAPORTIM M3`
and `PIKAT PER RAPORTIM PER GA`. Every authenticated active user can view,
generate, preview and browse history. ADMIN, MANAGER and the existing designated
report manager can also edit the four manual answers and send it.
The sidebar lists it under Reports > Meetings and in GA's report shortcuts.

M3 is sent automatically at **16:20 Monday–Friday** in the report timezone
(`PRIMEFLOW_REPORT_TIMEZONE`, default Europe/Tirane), to **ga@primexeu.com** and
**info@primexeu.com**. The shared reporting-points delivery loop starts only when
`REPORT_SCHEDULERS_ENABLED` is true. It generates today's report even if nobody
opened the page, refreshes its task tables and post-16:15 realization, and retains
saved manual answers. Unanswered questions keep their existing missing-answer text.
The capture-only 16:15 loop remains separate and still sends no email.

The daily database lock covers refresh and delivery across API processes.
Successful automatic delivery commits `auto_sent_at` with the send result;
failed sends remain due for retry. Later ticks and restarts skip that completed
automatic send, even if a user subsequently edits or regenerates the report.
After downtime, the loop catches up only today's due report, never historical days.

Manual sending remains available after the day's realization capture exists,
including after the automatic send, and reads current M3 recipient settings.
Each manual click sends again, refreshes today's data and retains the automatic
marker. Manual sends before 16:20 do not cancel the scheduled automatic delivery.
Emails include the complete HTML report as an attachment, preserving all TODO
rows even when an email client clips a long inline body.
The same send also attaches a complete PNG, an editable Word (.docx) report and
an Excel (.xlsx) copy of the full M3 and GA view. Excel uses the existing
openpyxl dependency and the same export blocks as the other attachments,
preserving all sections, task groups, manual answers, reasons/comments,
realization and department breakdowns, status/risk colors and 08:00 outlines.
Each table keeps its column proportions; combined START/DUE changes have
separate stacked cells with a black divider. All content stays in one continuous
worksheet with landscape printing, wrapping and sufficient height for long text.
The Word and PNG exports continue
using python-docx and Pillow as M2/M3 do. Both exports include M3 and GA, all
manual answers, all task rows, My View reasons/comments and the stored realization.
They reuse the email's table columns, grouping and values, including non-DONE
same-day tasks, exact status/risk colors, black gridlines and thick START/DUE dividers.
PNG height grows with the complete content, including wrapped titles and long
comments. Word uses A3 landscape pages with repeating table headers; content
flows onto further pages rather than being cut off. Rendering runs in a worker
thread for manual and automatic sends. Export failure fails the send rather than
emailing incomplete attachments. No new dependency is introduced.

## Selection rules

- Active TODO tasks are untouched when the report date lies within their current
  start–due interval, inclusively, regardless of earlier progress. Future,
  overdue, undated and archived tasks are excluded.
- Same-day progress requires creation, start and current due dates to all match
  the report's date in the operational timezone. Every status is shown.
- Postponements are actual start/due moves to a later day, audited on the report
  date. Moves that were reversed are excluded. The M3 table includes tasks whose
  original start–due interval overlaps the report's week, moved within or out of
  that week. Due-date normalization
  caused by completing a late task is excluded.
- Friday destinations or destinations in a later week are red `RREZIK`. Other
  destinations within the report's week are light green `OK`.
- GA includes postponed tasks with `is_deadline_important=true` or tasks whose
  creation, original start and original due were all the report date. A due date
  alone does not make a task Deadline Important. Each task appears once.
- Reasons and comments come from My View's `TaskDailyRlzState`, matched by task
  and report day. Multiple people's evidence is identified by initials. Missing
  daily evidence displays `-`; a date-change audit reason is not substituted for
  the user's daily reason or comment.
- Tables use uppercase headers, numbered rows, KUSH / DEP / PRJK / AM/PM / LLOJI
  columns and the existing report status colors. People use initials, departments
  use short codes, and LLOJI uses the existing M3 SYS / PRJK / BLL / R1 / 1H / P /
  FT rules. The shared Weekly Planner pipeline supplies DEV, GD, PCM department
  order, saved person order and the responsible person's department.
- Postponements are split into Start + Due and Due-only tables. NGA / NE cells
  show stacked START / DUE dates for combined moves and one date for Due-only
  moves. Start-only moves, if any, have their own table so they are not mislabeled
  or lost. Each task appears in exactly one movement group.
- Compact fixed-width identifier/date columns leave remaining table width to
  the wrapped title. TODO tables omit Start and Due. Same-day tables omit
  the Creation / Start / Due column and exclude DONE tasks,
  retaining the shared person order. The same filter applies to older saved
  reports, email, PNG and Word; the stored Realization capture is unaffected.
- Titles use the existing Meetings title cleaner. Full descriptions, status
  columns and task progress columns are omitted in the platform, email preview
  and email attachment. Reason/comment columns appear in each table. Status
  still determines row color; the staff Realization percentage remains.
- Untouched tasks are split into regular and SYS tables using the task's system
  origin/slot and existing SYS label. The GA button toggles a display filter to
  show only the two GA points without losing manual answers or changing the
  complete email. It is purple in both states.
- Deadline Important tasks have red backgrounds with white text, overriding
  status colors. Tasks identified as 08:00 by the shared M3 title/time rules have
  a thick red row outline. Risk cells retain their green/red OK/RREZIK meaning.
  These rules also apply to email, PNG and Word. Saved task symbols (including
  the monitor eye and GA parentheses) appear prominently before task titles.

## Workspace and manual answers

The header follows M3's Refresh / Generate actions, Report / History tabs,
date/subject/action toolbar and four metadata cards. The subject is the existing
computed report subject. Manual questions are stacked vertically. Manager edits
save automatically after 700ms of inactivity; requests are serialized so newer
typing cannot be overwritten by an older response. A user/day-scoped browser
draft survives refresh before the save finishes. Successfully saved answers
remain in the database through regeneration, refresh and later history access.
A new report day starts with its own answers and does not copy yesterday's draft.
Manual Save remains available for retry; send/preview/generation wait for saving.

## Realization capture

The API owns a separate capture loop controlled by `REPORT_SCHEDULERS_ENABLED`.
It captures at 16:15 Monday–Friday in Europe/Tirane, with a database transaction
lock preventing duplicate capture across API processes. It aggregates the
existing Daily Realization PLAN RLZ metric across the complete live population,
including managers and historical assignees retained by that engine. It uses
the same weighted credit and penalties rather than averaging percentages.
Missing baselines remain flagged in metadata but do not hide the live percentage,
matching the Realization dashboard. No plan or extra-task denominator produces
an explicit unavailable result, never a fabricated 0%.

Generating or sending today's report also recomputes the realization. Before
16:15 the value is a live preview: it is shown as LIVE, is not stored as the
capture, and the report cannot be sent yet. From 16:15 on, every generation or
send stores the latest realization as the day's capture, replacing the earlier
one, so a report generated after 16:15 always carries the current percentage.
If the service was down at 16:15, generating the report afterwards captures it.
Historical reports read their saved data; they cannot be rebuilt using today's
TODO statuses.
Each capture now also stores a separate weighted percentage and +/-50% comment
for every department, ordered DEV, GD, PCM then other departments, including
departments without active staff or daily tasks. Departments without a metric
denominator remain unavailable; they are never shown as zero. Older
captures without department breakdowns are not retroactively recomputed.

Apply migration `0144_reporting_points_auto_send` through normal deployment before
restarting the backend. It adds nullable automatic-send timestamps to M2 and M3
without changing existing reports or answers. Existing SMTP credentials are reused;
automatic recipients are fixed separately from the manual recipient settings.

Validation:

```text
backend/.venv/Scripts/python -m unittest tests.test_m3_reporting_points tests.test_migration_graph tests.test_api_report_schedulers
node --test frontend/tests/m3-reporting-points.test.mjs
cd frontend
node_modules/.bin/tsc --project tsconfig.m3-reporting-points.check.json --noEmit
```
