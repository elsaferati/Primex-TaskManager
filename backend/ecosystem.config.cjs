const path = require("path");

const cwd = __dirname;
const python =
  process.env.PM2_PYTHON_PATH ||
  "C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python313\\python.exe";
const redisEnabled = (process.env.REDIS_ENABLED ?? "false").toLowerCase() === "true";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379/0";
const appTimezone = process.env.APP_TIMEZONE ?? "Europe/Budapest";

module.exports = {
  apps: [
    {
      name: "backend",
      cwd,
      script: python,
      args: "-m uvicorn app.main:app --host 0.0.0.0 --port 8000",
      autorestart: true,
      max_restarts: 10,
      env: {
        REDIS_ENABLED: String(redisEnabled),
        REDIS_URL: redisUrl,
        APP_TIMEZONE: appTimezone,
      },
    },
    {
      name: "celery_worker",
      cwd,
      script: python,
      args: "-m celery -A app.celery_app.celery_app worker -l info --pool=solo",
      autorestart: true,
      max_restarts: 10,
      env: {
        REDIS_ENABLED: String(redisEnabled),
        REDIS_URL: redisUrl,
        APP_TIMEZONE: appTimezone,
      },
    },
    {
      name: "celery_beat",
      cwd,
      script: python,
      args: "-m celery -A app.celery_app.celery_app beat -l info",
      autorestart: true,
      max_restarts: 10,
      env: {
        REDIS_ENABLED: String(redisEnabled),
        REDIS_URL: redisUrl,
        APP_TIMEZONE: appTimezone,
      },
    },
  ],
};
