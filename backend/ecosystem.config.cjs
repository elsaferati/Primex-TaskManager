const path = require("path");

const cwd = __dirname;
const python =
  process.env.PM2_PYTHON_PATH ||
  "C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python313\\python.exe";
const redisEnabled = (process.env.REDIS_ENABLED ?? "false").toLowerCase() === "true";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379/0";
const appTimezone = process.env.APP_TIMEZONE ?? "Europe/Budapest";

const sharedEnv = {
  REDIS_ENABLED: String(redisEnabled),
  REDIS_URL: redisUrl,
  APP_TIMEZONE: appTimezone,
};

const apiProcess = {
  cwd,
  script: python,
  autorestart: true,
  max_restarts: 10,
  min_uptime: "5s",
  listen_timeout: 10000,
};

module.exports = {
  apps: [
    {
      ...apiProcess,
      name: "backend",
      args: "-m uvicorn app.main:app --host 0.0.0.0 --port 8000",
      env: {
        ...sharedEnv,
      },
    },
    {
      ...apiProcess,
      name: "backend-api-flow",
      args: "-m uvicorn app.main:app --host 0.0.0.0 --port 8080",
      env: {
        ...sharedEnv,
        // Only one API instance should run the weekly system-task scheduler.
        SYSTEM_TASK_SCHEDULER_ENABLED: "false",
      },
    },
    {
      name: "celery_worker",
      cwd,
      script: python,
      args: "-m celery -A app.celery_app.celery_app worker -l info --pool=solo",
      autorestart: true,
      max_restarts: 10,
      env: sharedEnv,
    },
    {
      name: "celery_beat",
      cwd,
      script: python,
      args: "-m celery -A app.celery_app.celery_app beat -l info",
      autorestart: true,
      max_restarts: 10,
      env: sharedEnv,
    },
  ],
};
