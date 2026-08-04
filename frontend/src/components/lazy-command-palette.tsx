"use client"

import * as React from "react"

const loadCommandPalette = () =>
  import("@/components/command-palette").then((module) => ({ default: module.CommandPalette }))
const CommandPalette = React.lazy(loadCommandPalette)

export function LazyCommandPalette() {
  const [openSignal, setOpenSignal] = React.useState(0)

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpenSignal((value) => value + 1)
      }
    }
    window.addEventListener("keydown", onKeyDown)

    const preload = () => void loadCommandPalette()
    const idleId = window.requestIdleCallback?.(preload, { timeout: 2500 })
    const timeoutId = idleId == null ? window.setTimeout(preload, 1000) : null

    return () => {
      window.removeEventListener("keydown", onKeyDown)
      if (idleId != null) window.cancelIdleCallback?.(idleId)
      if (timeoutId != null) window.clearTimeout(timeoutId)
    }
  }, [])

  if (openSignal === 0) return null
  return (
    <React.Suspense fallback={null}>
      <CommandPalette openSignal={openSignal} />
    </React.Suspense>
  )
}
