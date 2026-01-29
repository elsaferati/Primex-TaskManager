# Run Database Migration for Meeting Features

To add the new meeting fields (URL, recurrence, participants) to the database, you need to run the migration.

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
   You should see: `0043_add_meeting_url_recurrence_participants (head)`

4. **Restart your backend server** to ensure all changes are loaded.

## What the migration does:

- Adds `meeting_url` column (String, 500 chars, nullable)
- Adds `recurrence_type` column (String, 20 chars, nullable)
- Adds `recurrence_days_of_week` column (Array of integers, nullable)
- Adds `recurrence_days_of_month` column (Array of integers, nullable)
- Creates `meeting_participants` table for many-to-many relationship

After running the migration, all meeting data will be properly saved to the database!
