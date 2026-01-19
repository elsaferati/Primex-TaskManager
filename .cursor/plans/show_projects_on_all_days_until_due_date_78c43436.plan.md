# Show Projects from Start Date Until Due Date

## Current Behavior
- Projects show when they have open tasks (existing behavior) ✓
- Projects with due dates are added to the planner, but only if they don't already have tasks in the map
- Projects currently show from Monday until due date, but should show from start_date (or created_at) until due_date

## Required Behavior
- Projects with due dates should appear on **ALL days** from their **start_date** (or `created_at` if no `start_date`) until the **due_date**
- Projects should still show their tasks when they exist
- If a project has a task on Tuesday but due date is Friday, it should show from start_date until Friday
- If a project is overdue (due_date < current week's Monday), show on Monday only as "LATE"

## Implementation Plan

### 1. Update Date Range Logic in `backend/app/api/routers/planners.py`

**Location**: Around lines 815-840

**Current Logic**: 
- Shows projects from Monday until due date
- Overdue projects show on Monday only

**New Logic**:
- Determine project start date: use `start_date` if available, otherwise use `created_at.date()`
- Show project from `project_start_date` until `project_due_date` (within the current week's range)
- If project is overdue (due_date < current week's Monday), show on Monday only as "LATE"
- If project start_date is in the future, don't show it yet
- If project start_date is before the current week, show from Monday of current week until due_date

**Changes needed**:
```python
# Current (lines 815-840):
project_due_date = project.due_date.date()
monday_of_week = working_days[0]

if project_due_date < monday_of_week:
    # Project is overdue - show on Monday only as late project
    if day_date == monday_of_week:
        should_show = True
        is_late = True
elif project_due_date >= monday_of_week:
    # Show from Monday until due date
    if day_date >= monday_of_week and day_date <= project_due_date:
        should_show = True

# New approach:
project_due_date = project.due_date.date()
project_start_date = project.start_date.date() if project.start_date else project.created_at.date()
monday_of_week = working_days[0]
week_end = working_days[-1]

if project_due_date < monday_of_week:
    # Project is overdue - show on Monday only as late project
    if day_date == monday_of_week:
        should_show = True
        is_late = True
elif project_due_date >= monday_of_week:
    # Determine the effective start date for this week
    # If start_date is before this week, start from Monday
    # If start_date is within this week, start from start_date
    # If start_date is after this week, don't show yet
    effective_start = max(project_start_date, monday_of_week)
    
    # Show from effective start until due date (within current week)
    if day_date >= effective_start and day_date <= project_due_date and day_date <= week_end:
        should_show = True
```

### 2. Fix Project Display Logic

**Location**: Lines 914-920

**Current Issue**: Projects with due dates are only added if they're NOT already in the maps. This means if a project has a task on one day, it won't be added on other days via the due date logic.

**Solution**: 
- Always ensure projects with due dates are in the map for the current day
- If the project already exists in the map (from tasks), keep it and merge tasks
- If the project doesn't exist, add it with an empty task list

**Changes needed**:
```python
# Current (lines 914-920):
for project_id in user_projects_with_due:
    if project_id not in am_projects_map and project_id not in pm_projects_map:
        am_projects_map[project_id] = []

# New approach:
for project_id in user_projects_with_due:
    # Always ensure project is in map for this day
    # If it's already there from tasks, keep it (tasks already added)
    # If not, add it to AM (default)
    if project_id not in am_projects_map and project_id not in pm_projects_map:
        am_projects_map[project_id] = []
    # Note: If project already has tasks in map, we keep those tasks
    # The project will show with its tasks on days with tasks,
    # and without tasks (but still visible) on other days until due date
```

### 3. Test Cases to Verify

1. **Project created today, due Friday**: Should show from today until Friday
2. **Project created last week, due next week**: Should show from Monday of current week until due date
3. **Project with start_date in future**: Should not show until start_date
4. **Project with task on Tuesday, due Friday, created Monday**: Should show Mon-Fri
5. **Project overdue (due last week)**: Should show on Monday only as "LATE"
6. **Project with no tasks, created Wednesday, due Friday**: Should show Wed-Fri

## Files to Modify

1. `backend/app/api/routers/planners.py` 
   - Update date range logic (lines 815-840)
   - Fix project display logic (lines 914-920)

## Notes

- Use `start_date` if available, fallback to `created_at.date()` if `start_date` is None
- Projects should show continuously from start date until due date within the visible week
- Overdue projects still show on Monday as "LATE" regardless of start date
- If start_date is after the current week, project won't show yet
