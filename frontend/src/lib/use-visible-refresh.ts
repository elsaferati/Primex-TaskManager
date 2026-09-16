"use client"

import { useEffect, useRef } from "react"

// Refresh server-owned symbols when returning from another view/browser.
// Poll only visible pages; never overlap requests or replace an open editor.
export function useVisibleRefresh(refresh: () => void | Promise<void>, enabled = true, intervalMs = 30000) {
  const latest = useRef(refresh)
  useEffect(() => { latest.current = refresh }, [refresh])
  useEffect(() => {
    if (!enabled) return
    let running = false
    let lastRefresh = 0
    const run = async () => {
      if (document.visibilityState !== "visible" || running || Date.now() - lastRefresh < 1000) return
      running = true
      lastRefresh = Date.now()
      try { await latest.current() } catch { /* Keep the last successful data on network errors. */ }
      finally { running = false }
    }
    window.addEventListener("focus", run)
    document.addEventListener("visibilitychange", run)
    const timer = window.setInterval(run, intervalMs)
    let rolloverTimer: number
    const scheduleRollover = () => {
      const now = new Date()
      const rollover = new Date(now)
      rollover.setHours(16, 0, 0, 0)
      if (rollover.getTime() <= now.getTime()) rollover.setDate(rollover.getDate() + 1)
      rolloverTimer = window.setTimeout(async () => {
        await run()
        scheduleRollover()
      }, rollover.getTime() - now.getTime())
    }
    scheduleRollover()
    return () => {
      window.removeEventListener("focus", run)
      document.removeEventListener("visibilitychange", run)
      window.clearInterval(timer)
      window.clearTimeout(rolloverTimer)
    }
  }, [enabled, intervalMs])
}
