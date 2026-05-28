import * as React from "react"

type ChecklistInlineSegment = {
  text: string
  bold: boolean
  red: boolean
}

const CHECKLIST_STYLE_TOKEN_RE = /\[\[(\/?)(b|red)\]\]/g

export function parseChecklistInlineStyle(value?: string | null): ChecklistInlineSegment[] {
  if (!value) return []

  const segments: ChecklistInlineSegment[] = []
  const active = { bold: 0, red: 0 }
  let lastIndex = 0
  let match: RegExpExecArray | null

  CHECKLIST_STYLE_TOKEN_RE.lastIndex = 0
  while ((match = CHECKLIST_STYLE_TOKEN_RE.exec(value)) !== null) {
    const text = value.slice(lastIndex, match.index)
    if (text) {
      segments.push({ text, bold: active.bold > 0, red: active.red > 0 })
    }

    const isClosing = match[1] === "/"
    const token = match[2]
    if (token === "b") {
      active.bold = Math.max(0, active.bold + (isClosing ? -1 : 1))
    } else if (token === "red") {
      active.red = Math.max(0, active.red + (isClosing ? -1 : 1))
    }
    lastIndex = match.index + match[0].length
  }

  const rest = value.slice(lastIndex)
  if (rest) {
    segments.push({ text: rest, bold: active.bold > 0, red: active.red > 0 })
  }

  return segments
}

export function stripChecklistInlineStyleTokens(value?: string | null) {
  if (!value) return ""
  return value.replace(CHECKLIST_STYLE_TOKEN_RE, "")
}

export function renderChecklistInlineStyle(value?: string | null, emptyFallback: React.ReactNode = "-") {
  const segments = parseChecklistInlineStyle(value)
  if (!segments.length) return emptyFallback

  return segments.map((segment, index) => {
    const className = [
      segment.bold ? "font-bold" : "",
      segment.red ? "text-red-600" : "",
    ].filter(Boolean).join(" ")

    return className ? (
      <span key={`${index}-${segment.text}`} className={className}>
        {segment.text}
      </span>
    ) : (
      <React.Fragment key={`${index}-${segment.text}`}>{segment.text}</React.Fragment>
    )
  })
}
