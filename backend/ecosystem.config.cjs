const path = require("path");

const cwd = __dirname;
const python = path.join(cwd, ".venv", "Scripts", "python.exe");

module.exports = {
  apps: [
    {
      name: "backend-api",
      cwd,
      script: python,
      args: "-m uvicorn app.main:app --host 0.0.0.0 --port 8000",
      autorestart: true,
      max_restarts: 10,
      env: {
        REDIS_ENABLED: process.env.REDIS_ENABLED || "true",
        REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379/0",
        APP_TIMEZONE: process.env.APP_TIMEZONE || "Europe/Budapest",
      },
    },
    {
      name: "backend-celery-worker",
      cwd,
      script: python,
      args: "-m celery -A app.celery_app.celery_app worker -l info --pool=solo",
      autorestart: true,
      max_restarts: 10,
      env: {
        REDIS_ENABLED: process.env.REDIS_ENABLED || "true",
        REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379/0",
        APP_TIMEZONE: process.env.APP_TIMEZONE || "Europe/Budapest",
      },
    },
    {
      name: "backend-celery-beat",
      cwd,
      script: python,
      args: "-m celery -A app.celery_app.celery_app beat -l info",
      autorestart: true,
      max_restarts: 10,
      env: {
        REDIS_ENABLED: process.env.REDIS_ENABLED || "true",
        REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379/0",
        APP_TIMEZONE: process.env.APP_TIMEZONE || "Europe/Budapest",
      },
    },
  ],
};
