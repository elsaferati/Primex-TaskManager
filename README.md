# Primex Nexus

Production-ready internal task & project management platform (Trello-like) with:
- Department Kanban boards (Boards → Projects → Tasks)
- Common View entries with manager approval + optional task generation
- RBAC (Admin / Manager / Staff) enforced server-side
- Weekly + monthly planners, automatic carry-over, system task templates
- Notifications (REST + WebSockets) including 1h in-app reminders
- Exports (CSV / XLSX / PDF summary)

## Requirements (No Docker)

- Python 3.11+ (recommended)
- Node.js 20+
- PostgreSQL 14+
- Redis 6+

## Setup

### 1) Backend

```powershell
cd backend
copy .env.example .env
```

Edit `backend/.env`:
- `DATABASE_URL` must be `postgresql+asyncpg://...`
- Set `JWT_SECRET`
- Set `APP_TIMEZONE` (default `Europe/Budapest`)
- Optional for cloud dictation: `OPENAI_API_KEY`, `SPEECH_MAX_FILE_MB` (default 20)

Install deps:
```powershell
python -m pip install -r requirements.txt
```

Run migrations:
```powershell
alembic -c alembic.ini upgrade head
```

Seed default departments/boards/statuses (and optionally an initial admin):
```powershell
$env:ADMIN_EMAIL="admin@example.com"
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="change-me-now"
python -m app.seed
```

Start API:
```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Start background jobs (system tasks, reminders, overdue, carry-over):
```powershell
celery -A app.celery_app.celery_app worker -l info
celery -A app.celery_app.celery_app beat -l info
```

System task scheduling notes:
- `generate-system-tasks`: weekly on Friday at `06:00` local (`APP_TIMEZONE`)
- By default, generation creates scheduled system task instances through the next `7` days

### 2) Frontend

```powershell
cd frontend
copy .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production notes

- Frontend: `cd frontend; npm run build; npm start`
- Backend: run all backend processes with PM2 from `backend/ecosystem.config.cjs`.
- Keep `REDIS_ENABLED=true` in environments where Celery background generation is expected.
- WebSocket notifications: frontend connects to `ws(s)://<API_HOST>/ws/notifications?token=<access_token>`.
- Ensure `REDIS_URL` points to a reachable Redis instance and `APP_TIMEZONE=Europe/Budapest` (or your business timezone).

PM2 commands:
```powershell
cd backend
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs backend-celery-beat --lines 200
pm2 save
```

Useful ops checks:
```powershell
celery -A app.celery_app.celery_app inspect ping
celery -A app.celery_app.celery_app inspect stats
```

