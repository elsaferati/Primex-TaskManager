"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

const GAP = 4
const MARGIN = 8
/** Below this much free space under the cell the panel opens above it instead. */
const MIN_SPACE_BELOW = 360

type Anchor = { top?: number; bottom?: number; left: number; maxHeight: number }

/**
 * A table cell that opens a panel below itself when clicked, or above it near
 * the bottom of the screen. The panel is portalled so the scrolling table does
 * not clip it, and scrolls itself when it is taller than the space it has.
 */
export function CellPopover({ label, triggerTitle, width = 460, panel, children }: {
  label: string
  triggerTitle: string
  width?: number
  panel: React.ReactNode
  children: React.ReactNode
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const open = anchor !== null

  const toggle = () => {
    if (open) {
      setAnchor(null)
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN))
    const spaceBelow = window.innerHeight - rect.bottom - GAP - MARGIN
    const spaceAbove = rect.top - GAP - MARGIN
    setAnchor(spaceBelow < MIN_SPACE_BELOW && spaceAbove > spaceBelow
      ? { bottom: window.innerHeight - rect.top + GAP, left, maxHeight: spaceAbove }
      : { top: rect.bottom + GAP, left, maxHeight: spaceBelow })
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setAnchor(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAnchor(null)
    }
    // The tables scroll inside their card, so a portalled panel would drift
    // away from its cell. Closing keeps it anchored to what it describes.
    const close = () => setAnchor(null)
    const onScroll = (event: Event) => {
      // Capturing also receives scrolls from the panel's own list.
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return
      close()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", close)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", close)
    }
  }, [open])

  return <>
    <button
      ref={triggerRef}
      type="button"
      aria-expanded={open}
      onClick={toggle}
      className="block w-full text-left"
      title={triggerTitle}
    >
      {children}
    </button>
    {anchor ? createPortal(
      <div
        ref={panelRef}
        role="dialog"
        aria-label={label}
        className="fixed z-50 overflow-y-auto overscroll-contain rounded-md border border-slate-300 bg-white p-2 shadow-xl"
        style={{ top: anchor.top, bottom: anchor.bottom, left: anchor.left, maxHeight: anchor.maxHeight, width }}
      >
        {panel}
      </div>,
      document.body,
    ) : null}
  </>
}
