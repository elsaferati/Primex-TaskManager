export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:8000"

export const API_HTTP_URL = `${API_BASE_URL}/api`
export const API_HTTP_FALLBACK_URL = "http://localhost:8080/api"

export const API_WS_URL = API_BASE_URL.startsWith("https://")
  ? API_BASE_URL.replace("https://", "wss://")
  : API_BASE_URL.replace("http://", "ws://")

export const COMMON_VIEW_AGGREGATE_ENABLED =
  process.env.NEXT_PUBLIC_COMMON_VIEW_AGGREGATE !== "false"



