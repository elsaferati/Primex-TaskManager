"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { getPlainMarkedText } from "@/lib/note-markup"
import type { RealizationDeadlineState, RealizationDeadlineTask } from "@/lib/types"
import { cn } from "@/lib/utils"

export const deadlineStateLabels: Record<RealizationDeadlineState, string> = {
  COMPLETED: "Kryer",
  IN_PROGRESS: "Në progres",
  POSTPONED: "Shtyrë",
  NO_PROGRESS: "Pa progres",
}

const stateLabels = deadlineStateLabels

const stateOrder: RealizationDeadlineState[] = ["NO_PROGRESS", "POSTPONED", "IN_PROGRESS", "COMPLETED"]

export type DeadlineStateCounts = { completed: number; progress: number; postponed: number; noProgress: number }

/** How many of each state are deadlines the plan marked as important. */
export function criticalDeadlineCounts(tasks: RealizationDeadlineTask[]): DeadlineStateCounts {
  const counts: DeadlineStateCounts = { completed: 0, progress: 0, postponed: 0, noProgress: 0 }
  for (const task of tasks) {
    if (!task.critical) continue
    if (task.state === "COMPLETED") counts.completed += 1
    else if (task.state === "IN_PROGRESS") counts.progress += 1
    else if (task.state === "POSTPONED") counts.postponed += 1
    else counts.noProgress += 1
  }
  return counts
}

/**
 * An important deadline that was not met is the state the manager must react
 * to: the work was declared critical and still slipped.
 */
export function isDeadlineAlarm(task: RealizationDeadlineTask) {
  return task.critical && task.state !== "COMPLETED"
}

export function deadlineAlarmCount(tasks: RealizationDeadlineTask[]) {
  return tasks.filter(isDeadlineAlarm).length
}

/** Spells out what happened to the important deadlines, for the badge tooltip. */
export function criticalDeadlineSummary(tasks: RealizationDeadlineTask[]) {
  const critical = tasks.filter((task) => task.critical)
  if (!critical.length) return "Nuk ka deadline important"
  const completed = critical.filter((task) => task.state === "COMPLETED").length
  const breakdown = stateOrder
    .filter((state) => state !== "COMPLETED")
    .map((state) => ({ state, count: critical.filter((task) => task.state === state).length }))
    .filter((item) => item.count > 0)
    .map((item) => `${item.count} ${stateLabels[item.state].toLowerCase()}`)
  const head = `Deadline important: ${completed} nga ${critical.length} kryer`
  if (!breakdown.length) return head
  return `ALARM — ${head} · ${breakdown.join(" · ")}. Detyra ishte me deadline important dhe nuk u mbyll.`
}

export function sortDeadlineTasks(tasks: RealizationDeadlineTask[]) {
  return [...tasks].sort((a, b) =>
    stateOrder.indexOf(a.state) - stateOrder.indexOf(b.state)
    || Number(b.critical) - Number(a.critical)
    || (a.day ?? "").localeCompare(b.day ?? ""))
}

const stateClasses: Record<RealizationDeadlineState, string> = {
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  IN_PROGRESS: "border-amber-200 bg-amber-50 text-amber-800",
  POSTPONED: "border-violet-200 bg-violet-50 text-violet-800",
  NO_PROGRESS: "border-pink-300 bg-pink-100 text-pink-900",
}

const weekdays = ["E diel", "E hënë", "E martë", "E mërkurë", "E enjte", "E premte", "E shtunë"]

const PANEL_WIDTH = 460

function deadlineTitle(title: string) {
  const [firstLine] = getPlainMarkedText(title).split("\n")
  return firstLine?.trim() || "Pa titull"
}

function dayLabel(day: string | null) {
  if (!day) return null
  const parsed = new Date(`${day}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return day
  const dd = String(parsed.getDate()).padStart(2, "0")
  const mm = String(parsed.getMonth() + 1).padStart(2, "0")
  return `${weekdays[parsed.getDay()]} ${dd}/${mm}`
}

/**
 * The numbers alone never say *which* deadline slipped. Clicking the cell
 * names every task, its day and what happened to it, unfinished ones first.
 */
export function RealizationDeadlineTasksPopover({ tasks, title, children }: {
  tasks: RealizationDeadlineTask[]
  title: string
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
      left: Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8)),
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
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
    }
  }, [open])

  if (!tasks.length) return <>{children}</>

  const unfinished = tasks.filter((task) => task.state !== "COMPLETED")
  const alarms = tasks.filter(isDeadlineAlarm)

  return <>
    <button
      ref={triggerRef}
      type="button"
      aria-expanded={open}
      onClick={toggle}
      className="block w-full text-left"
      title="Kliko për të parë cilat detyra kishin afat"
    >
      {children}
    </button>
    {anchor ? createPortal(
      <div
        ref={panelRef}
        role="dialog"
        aria-label={title}
        className="fixed z-50 rounded-md border border-slate-300 bg-white p-2 shadow-xl"
        style={{ top: anchor.top, left: anchor.left, width: PANEL_WIDTH }}
      >
        <p className="mb-1 flex items-baseline justify-between gap-2 border-b pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          <span className="truncate">{title}</span>
          <span className={cn("shrink-0 font-bold normal-case", unfinished.length ? "text-rose-700" : "text-emerald-700")}>
            {unfinished.length ? `${unfinished.length} pa kryer` : "Të gjitha u kryen"}
          </span>
        </p>
        {alarms.length ? <p className="mb-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] leading-4 text-red-900">
          <b>{alarms.length} alarm{alarms.length === 1 ? "" : "e"}:</b> detyra me deadline important që nuk u mbyllën brenda afatit.
        </p> : null}
        <ul className="max-h-80 space-y-0.5 overflow-y-auto">
          {tasks.map((task, index) => <li
            key={`${task.task_id ?? "anonymous"}:${task.day ?? index}`}
            className={cn(
              "flex items-start gap-2 rounded px-1 py-1",
              isDeadlineAlarm(task) ? "border border-red-300 bg-red-50" : "hover:bg-slate-50",
            )}
          >
            <span className={cn("shrink-0 rounded border px-1 py-px text-[10px] font-bold uppercase", stateClasses[task.state])}>
              {stateLabels[task.state]}
            </span>
            {task.critical ? <span
              className={cn(
                "shrink-0 rounded border px-1 py-px text-[10px] font-bold uppercase",
                isDeadlineAlarm(task) ? "border-red-600 bg-red-600 text-white" : "border-red-300 bg-red-50 text-red-800",
              )}
              title={isDeadlineAlarm(task)
                ? `Alarm: deadline important, ${stateLabels[task.state].toLowerCase()}`
                : "Deadline important, i kryer"}
            >
              {isDeadlineAlarm(task) ? "Alarm" : "Important"}
            </span> : null}
            <span className="min-w-0 flex-1 text-xs leading-4 text-slate-800">
              {task.person ? <b className="mr-1 text-slate-900">{task.person}:</b> : null}
              {deadlineTitle(task.title)}
            </span>
            {task.day ? <span className="shrink-0 whitespace-nowrap text-[10px] tabular-nums text-slate-500">{dayLabel(task.day)}</span> : null}
          </li>)}
        </ul>
      </div>,
      document.body,
    ) : null}
  </>
}
