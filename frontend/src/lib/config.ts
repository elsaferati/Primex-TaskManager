export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:8000"

export const API_HTTP_URL = `${API_BASE_URL}/api`
// A localhost fallback is useful only while developing locally. In production,
// localhost is the end user's computer and can never reach the deployed API.
export const API_HTTP_FALLBACK_URL =
  process.env.NODE_ENV === "development" ? "http://localhost:8080/api" : API_HTTP_URL

export const API_WS_URL = API_BASE_URL.startsWith("https://")
  ? API_BASE_URL.replace("https://", "wss://")
  : API_BASE_URL.replace("http://", "ws://")

export const COMMON_VIEW_AGGREGATE_ENABLED =
  process.env.NEXT_PUBLIC_COMMON_VIEW_AGGREGATE !== "false"



