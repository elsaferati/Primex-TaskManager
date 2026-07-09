const path = require("path");
const fs = require("fs");

const cwd = __dirname;
const pythonCandidate =
  process.env.PM2_PYTHON_PATH ||
  "C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python313\\python.exe";
const python = fs.existsSync(pythonCandidate)
  ? pythonCandidate
  : "C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python311\\python.exe";
const redisEnabled = (process.env.REDIS_ENABLED ?? "false").toLowerCase() === "true";
const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379/0";
const appTimezone = process.env.APP_TIMEZONE ?? "Europe/Budapest";

const sharedEnv = {
  REDIS_ENABLED: String(redisEnabled),
  REDIS_URL: redisUrl,
  APP_TIMEZONE: appTimezone,
  APP_BUILD_SHA: process.env.APP_BUILD_SHA ?? "unknown",
};

const apiProcess = {
  cwd,
  script: python,
  autorestart: true,
  max_restarts: 10,
  min_uptime: "5s",
  listen_timeout: 10000,
  instances: 1,
  exec_mode: "fork",
};

module.exports = {
  apps: [
    {
      ...apiProcess,
      name: "primex-backend",
      args: "-m uvicorn app.main:app --host 0.0.0.0 --port 8000",
      env: {
        ...sharedEnv,
      },
    },
    {
      ...apiProcess,
      name: "primex-public-api",
      args: "-m uvicorn app.main:app --host 0.0.0.0 --port 8080",
      env: {
        ...sharedEnv,
        // Only one API instance should run the weekly system-task scheduler.
        SYSTEM_TASK_SCHEDULER_ENABLED: "false",
      },
    },
    {
      ...apiProcess,
      name: "primeflow-mcp",
      args: "mcp_server.py",
      env: {
        ...sharedEnv,
        PRIMEFLOW_API_BASE_URL: process.env.PRIMEFLOW_API_BASE_URL ?? "https://api-flow.primexeu.com",
        PRIMEFLOW_WEB_BASE_URL: process.env.PRIMEFLOW_WEB_BASE_URL ?? "https://primeflow.primexeu.com",
        PRIMEFLOW_MCP_TRANSPORT: process.env.PRIMEFLOW_MCP_TRANSPORT ?? "sse",
        PRIMEFLOW_MCP_HOST: process.env.PRIMEFLOW_MCP_HOST ?? "0.0.0.0",
        PRIMEFLOW_MCP_PORT: process.env.PRIMEFLOW_MCP_PORT ?? "8010",
        PRIMEFLOW_ACCESS_TOKEN: process.env.PRIMEFLOW_ACCESS_TOKEN ?? "",
        PRIMEFLOW_EMAIL: process.env.PRIMEFLOW_EMAIL ?? "",
        PRIMEFLOW_PASSWORD: process.env.PRIMEFLOW_PASSWORD ?? "",
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
