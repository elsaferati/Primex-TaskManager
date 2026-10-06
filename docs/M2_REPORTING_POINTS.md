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
and report date. Refreshing automatic data retains those answers. Sent reports
are immutable. Historical dates use stored reports rather than current task data.
Authenticated users can view/generate reports, preview them and download exports.
The same managers as M3 can edit answers and send reports.

Sending is manual only, uses current M2 Post-Break Summary recipient settings,
refreshes today's automatic data and retains the answers. No email is sent by
generating, saving, previewing or downloading a report. Repeat sends are deduplicated.
Email includes HTML, Word and PNG attachments. Authenticated download actions also
offer Word, PNG and plain text, including all rows and per-task answers.

Deployment requires Alembic migration `0143_m2_reporting_points`, after
`0142_m3_reporting_points`. It adds a separate table and does not alter M3 reports.
The implementation does not run this migration or send reports on the server.
