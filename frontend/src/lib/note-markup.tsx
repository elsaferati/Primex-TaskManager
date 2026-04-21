import * as React from "react"

// Some older titles were saved with a missing leading "[" token, e.g. `[added]]...[/added]]`.
// Accept both forms when parsing so legacy task titles still render cleanly.
const NOTE_MARK_TOKEN_RE = /\[{1,2}(done|added)\]\]|\[{1,2}\/(done|added)\]\]/g

type TextMarkRange = { start: number; end: number }
const LEGACY_ADD_WORD_RE = /\bADD\b/g

function normalizeTextRanges(ranges: TextMarkRange[]) {
  const sorted = ranges
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const normalized: TextMarkRange[] = []

  for (const range of sorted) {
    const previous = normalized[normalized.length - 1]
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end)
    } else {
      normalized.push({ ...range })
    }
  }

  return normalized
}

function normalizeAddedRanges(text: string, ranges: TextMarkRange[]) {
  const normalized = normalizeTextRanges(ranges)
  const merged: TextMarkRange[] = []

  for (const range of normalized) {
    const previous = merged[merged.length - 1]
    const gap = previous ? text.slice(previous.end, range.start) : ""
    if (previous && /^[ \t]*$/.test(gap)) {
      previous.end = range.end
    } else {
      merged.push({ ...range })
    }
  }

  return merged
}

function getNoteMarkClass(isDone: boolean, isAdded: boolean) {
  if (isDone && isAdded) {
    return "rounded bg-blue-100 px-1 text-emerald-900 ring-1 ring-blue-300 line-through decoration-emerald-700 decoration-2"
  }
  if (isAdded) return "rounded bg-blue-200 px-1 text-blue-950 ring-1 ring-blue-300"
  if (isDone) {
    return "rounded bg-emerald-100 px-1 text-emerald-800 line-through decoration-emerald-700 decoration-2"
  }
  return ""
}

export function parseMarkedNoteContent(content?: string | null): {
  text: string
  doneRanges: TextMarkRange[]
  addedRanges: TextMarkRange[]
} {
  if (!content) return { text: "", doneRanges: [], addedRanges: [] }

  const doneRanges: TextMarkRange[] = []
  const addedRanges: TextMarkRange[] = []
  const openMarks: Record<"done" | "added", number[]> = { done: [], added: [] }
  let text = ""
  let lastIndex = 0
  let match: RegExpExecArray | null

  NOTE_MARK_TOKEN_RE.lastIndex = 0
  while ((match = NOTE_MARK_TOKEN_RE.exec(content)) !== null) {
    text += content.slice(lastIndex, match.index)

    const openingMark = match[1] as "done" | "added" | undefined
    const closingMark = match[2] as "done" | "added" | undefined
    if (openingMark) {
      openMarks[openingMark].push(text.length)
    } else if (closingMark) {
      const start = openMarks[closingMark].pop()
      if (start !== undefined && text.length > start) {
        const targetRanges = closingMark === "done" ? doneRanges : addedRanges
        targetRanges.push({ start, end: text.length })
      }
    }

    lastIndex = match.index + match[0].length
  }
  text += content.slice(lastIndex)

  const legacyAddedRanges: TextMarkRange[] = []
  let legacyMatch: RegExpExecArray | null
  LEGACY_ADD_WORD_RE.lastIndex = 0
  while ((legacyMatch = LEGACY_ADD_WORD_RE.exec(text)) !== null) {
    legacyAddedRanges.push({
      start: legacyMatch.index,
      end: legacyMatch.index + legacyMatch[0].length,
    })
  }

  return {
    text,
    doneRanges: normalizeTextRanges(doneRanges),
    addedRanges: normalizeAddedRanges(text, [...addedRanges, ...legacyAddedRanges]),
  }
}

export function getPlainMarkedText(content?: string | null) {
  return parseMarkedNoteContent(content).text
}

export function buildMarkedAppendOnlyText(previousContent?: string | null, nextPlainText?: string | null) {
  const previousMarked = previousContent || ""
  const previousPlain = getPlainMarkedText(previousContent).trim()
  const nextPlain = (nextPlainText || "").trim()

  if (!previousPlain || !nextPlain) return nextPlain
  if (nextPlain === previousPlain) return previousMarked
  if (!nextPlain.startsWith(previousPlain)) return nextPlain

  const suffix = nextPlain.slice(previousPlain.length)
  if (!suffix) return previousMarked

  return `${previousMarked}[[added]]${suffix}[[/added]]`
}

export function renderMarkedNoteContent(content?: string | null, emptyFallback: React.ReactNode = "-") {
  if (!content) return emptyFallback

  const parsed = parseMarkedNoteContent(content)
  const normalizedDoneRanges = normalizeTextRanges(parsed.doneRanges)
  const normalizedAddedRanges = normalizeAddedRanges(parsed.text, parsed.addedRanges)
  const boundaries = new Set([0, parsed.text.length])

  normalizedDoneRanges.forEach((range) => {
    boundaries.add(range.start)
    boundaries.add(range.end)
  })
  normalizedAddedRanges.forEach((range) => {
    boundaries.add(range.start)
    boundaries.add(range.end)
  })

  const orderedBoundaries = Array.from(boundaries)
    .filter((boundary) => boundary >= 0 && boundary <= parsed.text.length)
    .sort((a, b) => a - b)
  const parts: React.ReactNode[] = []

  for (let idx = 0; idx < orderedBoundaries.length - 1; idx += 1) {
    const start = orderedBoundaries[idx]
    const end = orderedBoundaries[idx + 1]
    const segment = parsed.text.slice(start, end)
    if (!segment) continue

    const isDone = normalizedDoneRanges.some((range) => range.start <= start && range.end >= end)
    const isAdded = normalizedAddedRanges.some((range) => range.start <= start && range.end >= end)
    const className = getNoteMarkClass(isDone, isAdded)

    parts.push(
      className ? (
        <span key={`note-mark-${idx}-${start}`} className={className}>
          {segment}
        </span>
      ) : (
        segment
      )
    )
  }

  return parts.length > 0 ? parts : parsed.text
}
