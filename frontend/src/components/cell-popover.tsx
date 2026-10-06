"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

/**
 * A table cell that opens a panel below itself when clicked. The panel is
 * portalled so the scrolling table does not clip it.
 */
export function CellPopover({ label, triggerTitle, width = 460, panel, children }: {
  label: string
  triggerTitle: string
  width?: number
  panel: React.ReactNode
  children: React.ReactNode
}) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
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
    setAnchor({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    })
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
        className="fixed z-50 rounded-md border border-slate-300 bg-white p-2 shadow-xl"
        style={{ top: anchor.top, left: anchor.left, width }}
      >
        {panel}
      </div>,
      document.body,
    ) : null}
  </>
}
