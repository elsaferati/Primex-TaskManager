# REALIZIMI DITOR — Test Cases

Raw effect uses numerator/denominator notation. “None” means the task does not affect that metric.

| ID | Scenario | Initial state | Action | Expected daily classification | Expected raw metric effect | Expected adjusted metric effect | Expected timeline event | Expected audit entry |
|---:|---|---|---|---|---|---|---|---|
| 1 | Planned today, DONE today | In baseline/TODO | Complete | REALIZED_AS_PLANNED | +1 num, +1 den | same | COMPLETED | task.status_changed |
| 2 | Planned today, TODO | In baseline/TODO | None | NO_PROGRESS | +1 den | same | PLANNED_FOR_DAY | baseline only |
| 3 | Planned today, IN_PROGRESS | In baseline/TODO | Start | IN_PROGRESS | +1 den | same | STARTED | task.status_changed |
| 4 | Waiting confirmation | In baseline/TODO | Request confirmation | WAITING_CONFIRMATION | +1 den | same | STATUS_CHANGED | task.status_changed |
| 5 | Move to tomorrow | In baseline/due today | Due +1 day | POSTPONED_UNAPPROVED | +1 den | +1 den pending | POSTPONED | task.due_date_changed |
| 6 | Move several times | Due 26 | 26→27→29→30 | POSTPONED_UNAPPROVED | +1 den | +1 den pending | POSTPONED + POSTPONED_AGAIN ×2 | 3 due_date events |
| 7 | Move away then back | Due 26 | 26→27→26 | status/progress outcome | +1 den | same | POSTPONED, MOVED_BACK_TO_TODAY | 2 due_date events |
| 8 | Late completion | Due 25, not baseline | Complete 26 | COMPLETED_LATE | None | None | COMPLETED | task.status_changed |
| 9 | Early completion | Due 27, not baseline | Complete 26 | COMPLETED_EARLY | None | None | COMPLETED | task.status_changed |
| 10 | Created and completed today | Not in baseline | Create + complete | ADDITIONAL_COMPLETED | None | None | ADDED_TO_DAY, COMPLETED | created + status_changed |
| 11 | Created today unfinished | Not in baseline | Create | ADDED_DURING_DAY | None | None | ADDED_TO_DAY | created |
| 12 | Completed then reopened | Baseline/TODO | DONE→TODO | REOPENED | +1 den | same | COMPLETED, REOPENED | status_changed + reopened |
| 13 | Reassigned A→B | A baseline | Change owner | A REASSIGNED_OUT; B REASSIGNED_IN | A +1 den; B none | approval-dependent A | ASSIGNEE_CHANGED | task.assignee_changed |
| 14 | Reassigned multiple times | A baseline | A→B→C | A OUT; B/C day history, C IN | only A den | approval-dependent A | every ASSIGNEE_CHANGED | every assignee event |
| 15 | Planner exclusion | Baseline occurrence | Add exclusion | remaining live facts (no removal outcome) | +1 den | unchanged | REMOVED_FROM_DAY technical event only | task.removed_from_day |
| 16 | Deactivated | Baseline active | Deactivate | remaining live facts (no removal outcome) | +1 den | unchanged | DEACTIVATED technical event only | task.deactivated |
| 17 | Reactivated | Previously inactive/day history | Reactivate | current facts + history | baseline unchanged | baseline unchanged | REACTIVATED | task.reactivated |
| 18 | Progress only | Baseline 40% | Set 75% | IN_PROGRESS | +1 den | same | PROGRESS_CHANGED 40→75 | task.progress_changed |
| 19 | Multiple progress updates | Baseline 0% | 0→30→65 | IN_PROGRESS | +1 den | same | two PROGRESS_CHANGED | two progress events |
| 20 | Multi-assignee | Same occurrence A+B | Progress/complete | Per-person outcome | each baseline den +1 | per person | per-person PLAN + events | shared task events |
| 21 | Fast-task group | Planner fast copies | Mutate one copy/group | copy-owner outcome | per copy owner | per owner | semantic events by task identity | task.* |
| 22 | System task | Opted-in generated occurrence | Execute | normal planned outcome | included if baseline | same | PLAN + status | task.status_changed |
| 23 | Meeting system task | meeting_occurrence_date=26 | Execute | normal planned outcome | included | same | PLAN + status | task.status_changed |
| 24 | Hidden system task | show_in_weekly_planner=false | Execute | excluded from baseline | None | None | activity only if separately eligible | task.status_changed |
| 25 | Approved postponement | Baseline/due today | Move + approve | POSTPONED_APPROVED | +1 den | −1 adjusted den | POSTPONED | due change + adjustment approve |
| 26 | Unapproved postponement | Baseline/due today | Move, pending/reject | POSTPONED_UNAPPROVED | +1 den | remains in adjusted den | POSTPONED | due change + pending/reject |
| 27 | Annual leave | Approved common leave | Open daily view | employee excluded/absence fact | no misleading denominator | policy unchanged | absence evidence | existing attendance/evidence audit |
| 28 | Edit after close | Closed immutable facts | Relevant edit | live outcome changes; close STALE | live recomputed | live recomputed | new semantic event | task.* after close |
| 29 | Concurrent capture | No baseline | Two ensure calls | one baseline | None | None | one PLAN baseline | unique conflict ignored |
| 30 | Existing baseline | Baseline exists | Ensure/refresh | original reused | unchanged | unchanged | no replacement | no duplicate |
| 31 | Local midnight | 22:30 UTC / 00:30 Tirana | Mutate | attributed to local next day | next-day metrics | next-day metrics | local-day event | aware UTC audit |
| 32 | Weekend/workday | Saturday | Scheduler runs | skipped | None | None | none | scheduler result skipped |
| 33 | Historical view | Past captured day | GET | baseline + day events | historic formula | historic formula | historic timeline | read-only |
| 34 | Close correction/reopen | Closed | Manager reopen, correct, close | corrected live then immutable correction | current correction | current correction | REOPEN/CORRECT history | close audit events |
| 35 | Weekly regression | Weekly PLANNED exists | Use Daily feature | weekly result unchanged | independent | independent | daily events additive | no weekly rewrite |
| 36 | No original_due_date | Baseline occurrence exists | Complete/move | baseline rules; event chain used | baseline denominator | approval rules | semantic due/status | task.* |
| 37 | Deleted/deactivated live task | Baseline row exists | Delete/deactivate | remaining live facts / no removal outcome | +1 den | unchanged | DEACTIVATED/DELETED | semantic + generic delete |
| 38 | Department changed later | Historical baseline owner/dept | User moves dept | old baseline remains | old dept/day stable | stable | existing history | user change does not rewrite baseline |
| 39 | Exclusion after baseline | Planned occurrence | Add exclusion | remaining live facts (no removal outcome) | +1 den | unchanged | REMOVED_FROM_DAY technical event only | task.removed_from_day |
| 40 | Manager acts for employee | Employee task planned | Manager changes due/status | corresponding outcome | employee metric | approval rules | event with manager actor | semantic task event |

## Definition-of-done scenario

Eight baseline rows, five `REALIZED_AS_PLANNED`, one `IN_PROGRESS` at +70%, one `POSTPONED_UNAPPROVED`, one `NO_PROGRESS`, and two `ADDITIONAL_COMPLETED` produce: plan 8, planned done 5, in progress 1, postponed 1, no progress 1, extra done 2, raw 62.5%, total completed 7. The extra rows do not enter either raw numerator or denominator.
