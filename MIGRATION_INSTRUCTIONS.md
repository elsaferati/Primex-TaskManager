# Run Database Migrations

## Steps:

1. **Activate your virtual environment:**
   ```bash
   cd backend
   .venv\Scripts\activate  # Windows
   # OR
   source .venv/bin/activate  # Linux/Mac
   ```

2. **Run the migration:**
   ```bash
   alembic upgrade head
   ```

3. **Verify the migration:**
   ```bash
   alembic current
   ```
   You should see the latest revision id marked as `(head)`.

4. **Restart your backend server** to ensure all changes are loaded.

## Notes

- A data backfill exists for PCM TT/MST CONTROL tasks to sync `ko_user_id` (stored in `tasks.internal_notes`) into `task_assignees` so KO behaves like an assignee across the app.
