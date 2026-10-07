# M2 reporting points

`/m2-reporting-points` is listed as **PIKAT PER RAP M2** under Reports > Meetings
and in the GA report shortcuts. It has its own daily report and history.

1. **RIORGANIZIM?** has a manually entered answer.
2. **A KA DET QE SHTYHEN (SOT/SOT) OSE DEADLINE?** uses date-change audit events
   made during the report day. It includes Deadline Important tasks and tasks whose
   creation, original start and original due date all matched that day. Start-only,
   due-only and combined moves have separate tables. A task is included once.
   Moves that were reversed and automatic due-date normalization on completion
   are excluded, following the existing M3 / GA selection rules.
3. **A JANE DORZUAR TE GJITHA CKA ESHTE DASHUR M2?** lists tasks with saved symbols
   M2 and M2/3. Both planning dates must exist and satisfy
   `start_date <= report_date <= due_date`, regardless of completion status.
   Overdue, future and undated tasks are excluded. The last column is a manually
   editable answer per task.

Answers automatically save and have a local recovery draft scoped to the user
and report date. Refreshing automatic data retains those answers. Today's reports
can be edited, regenerated and sent again. Historical dates use stored reports rather than current task data.
Authenticated users can view/generate reports, preview them and download exports.
The same managers as M3 can edit answers and send reports.

M2 defaults to automatic delivery at **12:15 Monday–Friday** in the report timezone
(`PRIMEFLOW_REPORT_TIMEZONE`, default Europe/Tirane), to **ga@primexeu.com** and
**info@primexeu.com**. The scheduler generates today's report even if its page
has not been opened, refreshes automatic data and retains saved manual answers.
Unanswered questions keep their existing missing-answer text.
An `auto_sent_at` marker records the automatic delivery independently of manual
sends. The daily database lock serializes generation, edits and delivery across
API processes; successful delivery and its marker commit together. Failed sends
remain due for retry. A restart catches up today's due send, never historical days.
The API starts this loop only when `REPORT_SCHEDULERS_ENABLED` is true.
The report toolbar, metadata and email settings are inside a **+ / −** management
panel, collapsed by default. Report managers can edit automatic enablement, send
time, weekdays and To/Cc/Bcc recipients, plus the manual To/Cc/Bcc recipients.
`GET/PUT /m2-reporting-points/settings` reads and saves a dedicated M2 row in
`reporting_points_settings`; the scheduler reads it on every tick. Configurations
are independent of M3 and of the original M2 Post-Break Summary report.

Manual sending remains available, including after an automatic send, and uses
the manual recipients shown in this panel. Until the first configuration save,
these retain the previous M2 Post-Break Summary recipients. Every manual click sends
again without clearing the automatic marker. Generating, saving, previewing or
downloading a report does not itself send email.
Email includes HTML, Word, PNG and Excel (.xlsx) attachments. The Excel copy
preserves the report view's section order, grouped tables, all task rows, manual
answers and comments, delivery choices and TOTALI/DËRGUAR, status/risk colors,
08:00 outlines and stacked START/DUE dates. It uses the same saved payload as
the email and the existing openpyxl dependency. An Excel export failure prevents
the email from being sent with incomplete attachments. Authenticated download actions also
offer Word, PNG and plain text, including all rows and per-task answers.

Deployment requires Alembic migration `0145_reporting_points_settings`, after
`0144_reporting_points_auto_send`. It seeds the existing automatic times and
recipients in a dedicated settings table and preserves manual recipient behavior
until explicitly changed. Apply the migration before restarting the API; normal
deployment already runs Alembic upgrades.
