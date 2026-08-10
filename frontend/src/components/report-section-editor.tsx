"use client"

import * as React from "react"
import { Plus, Save, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type EditorTableBlock = { headerIndex: number; rowIndexes: number[]; endIndex: number }

const HEADER_LABELS = new Set([
  "NR",
  "WHO",
  "DEP",
  "FROM",
  "TO",
  "PER",
  "TITLE",
  "NOTE",
  "PYETJA",
  "TIPI",
  "TYPE",
  "AM/PM",
  "ADDED",
  "KATEGORIA",
  "LISTA",
  "COUNT",
  "DISK",
  "TIME",
  "ORA",
  "KOHA",
  "DATA",
  "DATE",
  "LATE",
  "STATUS",
  "MBAJTUR",
  "MBAJTUR?",
  "ANULUAR",
  "PA STATUS",
])

export function reportSectionPreviewText(value: string) {
  return value.trim() || "No content"
}

export function reportSectionEditorLines(value: string) {
  return value.split(/\r?\n/)
}

function isRuleLine(value: string) {
  const trimmed = value.trim()
  return Boolean(trimmed) && /^[+\-\s]+$/.test(trimmed)
}

function tableCells(value: string) {
  const trimmed = value.trim()
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null
  // Strip only the single padding space from `| cell |` formatting so trailing
  // spaces the user types are preserved while editing.
  return trimmed.slice(1, -1).split("|").map((cell) => cell.replace(/^ /, "").replace(/ $/, ""))
}

function formatTableRow(cells: string[]) {
  return `| ${cells.join(" | ")} |`
}

function updateTableCell(line: string, cellIndex: number, value: string) {
  const cells = tableCells(line)
  if (!cells) return line
  cells[cellIndex] = value.replace(/\|/g, "")
  return formatTableRow(cells)
}

function normalizeHeader(value: string) {
  const upper = value.trim().toUpperCase()
  if (upper === "ORA" || upper === "KOHA") return "TIME"
  return upper
}

function isHeaderCells(cells: string[]) {
  return cells.some((cell) => HEADER_LABELS.has(normalizeHeader(cell)))
}

function compactWidthForHeader(header: string) {
  const value = normalizeHeader(header)
  if (value === "NR") return "48px"
  if (value === "WHO" || value === "DEP" || value === "FROM" || value === "TO" || value === "PER") return "64px"
  if (value === "DISK") return "40px"
  if (value === "TIME") return "76px"
  if (value === "DATA" || value === "DATE") return "96px"
  if (value === "LATE") return "88px"
  if (value === "COUNT") return "72px"
  if (value === "TYPE" || value === "TIPI") return "max-content"
  if (value === "AM/PM") return "max-content"
  if (value === "ADDED") return "max-content"
  if (value === "KATEGORIA" || value === "LISTA") return "max-content"
  if (value === "MBAJTUR?" || value === "MBAJTUR" || value === "ANULUAR" || value === "PA STATUS") return "44px"
  if (value === "TITLE" || value === "NOTE" || value === "PYETJA") return "minmax(280px, 1fr)"
  return "minmax(90px, auto)"
}

function tableGridTemplate(cells: string[]) {
  return cells.map(compactWidthForHeader).join(" ")
}

function isCompactMetricTable(headers: string[]) {
  const normalized = headers.map(normalizeHeader)
  return normalized.includes("TIPI") && normalized.includes("COUNT") && !normalized.includes("TITLE")
}

function isNarrowTableHeader(header: string) {
  return (
    header === "NR" ||
    header === "WHO" ||
    header === "DEP" ||
    header === "FROM" ||
    header === "TO" ||
    header === "PER" ||
    header === "TYPE" ||
    header === "AM/PM" ||
    header === "ADDED" ||
    header === "TIPI" ||
    header === "DISK" ||
    header === "MBAJTUR?" ||
    header === "MBAJTUR" ||
    header === "ANULUAR" ||
    header === "PA STATUS" ||
    header === "KATEGORIA" ||
    header === "LISTA" ||
    header === "COUNT" ||
    header === "LATE" ||
    header === "DATA" ||
    header === "DATE" ||
    header === "TIME"
  )
}

function trimTableCell(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function tableGridTemplates(lines: string[]) {
  const templates = new Map<number, string>()
  let currentTemplate = ""
  for (let index = 0; index < lines.length; index += 1) {
    const cells = tableCells(lines[index])
    if (!cells) continue
    if (isHeaderCells(cells)) currentTemplate = tableGridTemplate(cells)
    templates.set(index, currentTemplate || tableGridTemplate(cells))
  }
  return templates
}

function editorTableBlocks(lines: string[]) {
  const blocks: EditorTableBlock[] = []
  let index = 0
  while (index < lines.length) {
    const cells = tableCells(lines[index])
    if (!cells || !isHeaderCells(cells)) {
      index += 1
      continue
    }

    const rowIndexes: number[] = []
    let endIndex = index
    let cursor = index + 1
    while (cursor < lines.length) {
      if (isRuleLine(lines[cursor])) {
        endIndex = cursor
        const nextTableCells = tableCells(lines[cursor + 1] || "")
        if (!nextTableCells) break
        cursor += 1
        continue
      }
      const rowCells = tableCells(lines[cursor])
      if (!rowCells) break
      if (!isHeaderCells(rowCells)) rowIndexes.push(cursor)
      cursor += 1
    }
    blocks.push({ headerIndex: index, rowIndexes, endIndex })
    index = Math.max(cursor, index + 1)
  }
  return blocks
}

function isFixedEditorLabel(value: string) {
  const trimmed = value.trim()
  return Boolean(trimmed) && (trimmed.endsWith(":") || (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)))
}

/** Split "NDRYSHON PLANI: (Ploteso manualisht)" so the uppercase key stays bold even when the value has lowercase. */
function splitKeyedLabel(value: string): { label: string; rest: string } | null {
  const match = value.trim().match(/^([A-Z][A-Z0-9 /&()?.+-]*:)\s*(.*)$/)
  if (!match) return null
  const labelText = match[1].slice(0, -1)
  if (!labelText || labelText !== labelText.toUpperCase()) return null
  return { label: match[1], rest: match[2] }
}

function isGuidanceLine(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/^\d+\.\s/.test(trimmed)) return false
  // Indented lines under numbered questions are descriptions (even ALL-CAPS).
  // Check indent before isFixedEditorLabel — otherwise ALL-CAPS guidance becomes a bold header.
  return /^\s{2,}\S/.test(value)
}

function isNumberedQuestionLine(value: string) {
  return /^\d+\.\s+\S/.test(value.trim())
}

function renderKeyedLine(text: string, className = "px-3 py-2") {
  const keyed = splitKeyedLabel(text)
  if (!keyed) {
    if (isGuidanceLine(text)) {
      return (
        <div className={`${className} pt-0 text-xs italic leading-snug text-slate-500`}>
          <span className="whitespace-pre-wrap break-words">{text.trim()}</span>
        </div>
      )
    }
    return (
      <div className={className}>
        <span className="whitespace-pre-wrap break-words">{text}</span>
      </div>
    )
  }
  return (
    <div className={className}>
      <span className="font-semibold">{keyed.label}</span>
      {keyed.rest ? <span className="whitespace-pre-wrap break-words">{` ${keyed.rest}`}</span> : null}
    </div>
  )
}

function rowTone(label: string, cells: string[], headers: string[]) {
  const normalizedLabel = label.toUpperCase()
  const statusIndex = headers.findIndex((header) => normalizeHeader(header) === "STATUS")
  const statusValue = statusIndex >= 0 ? cells[statusIndex]?.trim().toUpperCase().replace(/_/g, " ") : ""
  const titleIndex = headers.findIndex((header) => normalizeHeader(header) === "TITLE")
  const titleStatus = titleIndex >= 0 ? splitStatusMarker(cells[titleIndex] || "").status : ""
  const resolvedStatus = (titleStatus || statusValue).toUpperCase().replace(/_/g, " ")
  if (resolvedStatus.includes("WAITING")) return "bg-orange-100 text-orange-900"
  if (resolvedStatus.includes("IN PROGRESS")) return "bg-yellow-100"
  if (resolvedStatus === "TODO") return "bg-pink-200"
  if (resolvedStatus === "DONE") return "bg-green-100"
  if (normalizedLabel.includes("DEADLINE")) return "bg-red-600 text-white"
  if (normalizedLabel.includes("LATE")) return "bg-red-100"
  if (normalizedLabel.includes("TODO") || normalizedLabel.includes("DETYRAT E REJA") || normalizedLabel.includes("DET TE REJA")) return "bg-pink-200"
  if (normalizedLabel.includes("IN PROGRESS")) return "bg-yellow-100"
  if (normalizedLabel.includes("WAITING")) return "bg-orange-100 text-orange-900"
  if (normalizedLabel.includes("DONE")) return "bg-green-100"
  // NOTES stay blue; DISK yes/no colors only the DISK cell (see diskCellTone).
  if (normalizedLabel.includes("NOTES") || headers.some((header) => normalizeHeader(header) === "NOTE")) {
    return "bg-blue-100"
  }
  return "bg-white"
}

function diskCellTone(headers: string[], cells: string[], cellIndex: number) {
  if (normalizeHeader(headers[cellIndex] || "") !== "DISK") return ""
  const value = cells[cellIndex]?.trim().toUpperCase()
  if (value === "YES") return "bg-green-100 text-green-800 font-semibold text-center"
  if (value === "NO") return "bg-red-100 text-red-800 font-semibold text-center"
  return "text-center"
}

function meetingStatusCellTone(headers: string[], cells: string[], cellIndex: number) {
  const header = normalizeHeader(headers[cellIndex] || "")
  if (header !== "MBAJTUR?" && header !== "MBAJTUR") return ""
  const value = cells[cellIndex]?.trim()
  if (value === "✓") return "bg-green-100 text-green-800 font-semibold text-center"
  if (value === "✕") return "bg-red-100 text-red-800 font-semibold text-center"
  return "text-center"
}

function splitStatusMarker(value: string) {
  const matches = [...value.matchAll(/\s*\[\[\s*st\s*:?\s*([A-Z_]+)\s*\]\]/gi)]
  if (!matches.length) return { text: value, status: "" }
  const status = matches[matches.length - 1][1].toUpperCase()
  const text = value.replace(/\s*\[\[\s*st\s*:?\s*[A-Z_]+\s*\]\]/gi, "").replace(/\s+/g, " ").trim()
  return { text, status }
}

function withoutStatusColumn(headers: string[], cells: string[]) {
  const statusIndex = headers.findIndex((header) => normalizeHeader(header) === "STATUS")
  const titleIndex = headers.findIndex((header) => normalizeHeader(header) === "TITLE")
  const nextHeaders = statusIndex >= 0 ? headers.filter((_, index) => index !== statusIndex) : headers
  const nextCells = cells.map((cell, index) => {
    if (statusIndex >= 0 && index === statusIndex) return null
    if (titleIndex >= 0 && index === titleIndex) return splitStatusMarker(cell).text
    return cell
  }).filter((cell): cell is string => cell !== null)
  return { headers: nextHeaders, cells: nextCells }
}

function primaryTextColumnIndex(headers: string[]) {
  const normalized = headers.map(normalizeHeader)
  for (const name of ["NOTE", "TITLE", "SHENIMI", "PERSHKRIMI", "DESCRIPTION"]) {
    const index = normalized.indexOf(name)
    if (index >= 0) return index
  }
  return Math.min(2, Math.max(headers.length - 1, 0))
}

function mergeContinuationTableRows(header: string[], rows: string[][]) {
  if (!header.length || !rows.length) return rows
  const width = header.length
  const textIndex = primaryTextColumnIndex(header)
  const nrIndex = header.findIndex((cell) => normalizeHeader(cell) === "NR")
  const resolvedNrIndex = nrIndex >= 0 ? nrIndex : 0
  const merged: string[][] = []

  for (const row of rows) {
    const normalized = [...row, ...Array(Math.max(0, width - row.length)).fill("")].slice(0, width)
    const hasTextContinuation = Boolean(normalized[textIndex]?.trim())
    const otherCellsEmpty = normalized.every((cell, index) => index === textIndex || !cell.trim())
    const isWrappedRow =
      merged.length > 0 &&
      !normalized[resolvedNrIndex]?.trim() &&
      normalized.some((cell) => cell.trim())

    if (isWrappedRow) {
      const previous = merged[merged.length - 1]
      normalized.forEach((value, index) => {
        const stripped = value.trim()
        if (!stripped) return
        previous[index] = previous[index]?.trim() ? `${previous[index]}\n${stripped}` : stripped
      })
      continue
    }

    if (merged.length > 0 && hasTextContinuation && otherCellsEmpty) {
      const previous = merged[merged.length - 1]
      const stripped = normalized[textIndex].trim()
      previous[textIndex] = previous[textIndex]?.trim() ? `${previous[textIndex]}\n${stripped}` : stripped
      continue
    }

    merged.push(normalized)
  }

  return merged
}

export function ReportSectionPreview({ body }: { body: string }) {
  const lines = reportSectionEditorLines(body)
  const templates = tableGridTemplates(lines)
  const lineContexts = lines.reduce<{ contexts: Array<{ label: string; headers: string[] }>; label: string; headers: string[] }>(
    (state, line) => {
      const cells = tableCells(line)

      if (cells && isHeaderCells(cells)) {
        const headers = cells.map(normalizeHeader)
        return {
          contexts: [...state.contexts, { label: state.label, headers }],
          label: state.label,
          headers,
        }
      }

      if (!cells && isGuidanceLine(line)) {
        return {
          ...state,
          contexts: [...state.contexts, { label: state.label, headers: state.headers }],
        }
      }

      if (!cells && isFixedEditorLabel(line)) {
        const label = line.trim()
        return {
          contexts: [...state.contexts, { label, headers: state.headers }],
          label,
          headers: state.headers,
        }
      }

      return {
        ...state,
        contexts: [...state.contexts, { label: state.label, headers: state.headers }],
      }
    },
    { contexts: [], label: "", headers: [] },
  ).contexts

  type PreviewItem =
    | { kind: "blank"; key: string }
    | { kind: "label"; key: string; text: string }
    | { kind: "text"; key: string; text: string; guidance?: string }
    | { kind: "table"; key: string; isHeader: boolean; cells: string[]; template: string; label: string; headers: string[] }

  const previewItems: PreviewItem[] = []
  let pendingHeader: string[] | null = null
  let pendingRows: string[][] = []
  let pendingMeta: { label: string; headers: string[]; template: string; startIndex: number } | null = null

  const flushTable = () => {
    if (!pendingHeader || !pendingMeta) return
    previewItems.push({
      kind: "table",
      key: `header-${pendingMeta.startIndex}`,
      isHeader: true,
      cells: pendingHeader,
      template: pendingMeta.template,
      label: pendingMeta.label,
      headers: pendingMeta.headers,
    })
    mergeContinuationTableRows(pendingHeader, pendingRows).forEach((cells, rowIndex) => {
      previewItems.push({
        kind: "table",
        key: `row-${pendingMeta!.startIndex}-${rowIndex}`,
        isHeader: false,
        cells,
        template: pendingMeta!.template,
        label: pendingMeta!.label,
        headers: pendingMeta!.headers,
      })
    })
    pendingHeader = null
    pendingRows = []
    pendingMeta = null
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) {
      flushTable()
      previewItems.push({ kind: "blank", key: `blank-${index}` })
      return
    }
    if (isRuleLine(line)) return

    const cells = tableCells(line)
    if (cells) {
      const isHeader = isHeaderCells(cells)
      const context = lineContexts[index]
      const template = templates.get(index) || tableGridTemplate(cells)
      if (isHeader) {
        flushTable()
        pendingHeader = cells
        pendingRows = []
        pendingMeta = {
          label: context.label,
          headers: cells.map(normalizeHeader),
          template,
          startIndex: index,
        }
        return
      }
      if (pendingHeader) {
        pendingRows.push(cells)
        return
      }
      previewItems.push({
        kind: "table",
        key: `loose-${index}`,
        isHeader: false,
        cells,
        template,
        label: context.label,
        headers: context.headers,
      })
      return
    }

    flushTable()
    // Attach indented guidance to the previous numbered question (don't treat ALL-CAPS as a label).
    if (isGuidanceLine(line)) {
      const previous = previewItems[previewItems.length - 1]
      if (previous?.kind === "text" && isNumberedQuestionLine(previous.text)) {
        previous.guidance = previous.guidance
          ? `${previous.guidance}\n${trimmed}`
          : trimmed
        return
      }
      previewItems.push({ kind: "text", key: `text-${index}`, text: line, guidance: trimmed })
      return
    }
    // Legacy drafts: ALL-CAPS description under a numbered question, without indent.
    const previous = previewItems[previewItems.length - 1]
    if (
      previous?.kind === "text" &&
      isNumberedQuestionLine(previous.text) &&
      trimmed === trimmed.toUpperCase() &&
      /[A-Z]/.test(trimmed) &&
      trimmed.length > 12 &&
      !trimmed.endsWith(":")
    ) {
      previous.guidance = previous.guidance ? `${previous.guidance}\n${trimmed}` : trimmed
      return
    }
    if (isFixedEditorLabel(line)) {
      previewItems.push({ kind: "label", key: `label-${index}`, text: trimmed })
      return
    }
    previewItems.push({ kind: "text", key: `text-${index}`, text: line })
  })
  flushTable()

  type TablePreviewItem = Extract<PreviewItem, { kind: "table" }>

  const renderDataTable = (rows: TablePreviewItem[], key: string) => {
    const headers = withoutStatusColumn(rows[0].headers, rows[0].cells).headers
    const hasWideColumn = headers.some((header) => {
      const name = normalizeHeader(header)
      return name === "TITLE" || name === "NOTE" || name === "PYETJA"
    })
    return (
      <div
        key={key}
        className={`${hasWideColumn ? "w-full" : "w-max max-w-full"} border-b border-slate-200 last:border-b-0`}
      >
        <table
          className={`${hasWideColumn ? "w-full" : ""} border-collapse text-xs leading-5 text-slate-950`}
        >
          <thead>
            {rows
              .filter((row) => row.isHeader)
              .map((row) => {
                const visible = withoutStatusColumn(row.headers, row.cells)
                return (
                  <tr key={row.key} className="bg-slate-200 font-semibold">
                    {visible.cells.map((cell, cellIndex) => {
                      const header = normalizeHeader(visible.headers[cellIndex] || headers[cellIndex] || "")
                      const narrow = isNarrowTableHeader(header)
                      return (
                        <th
                          key={cellIndex}
                          className={`border-b border-r border-slate-300 py-1.5 align-top last:border-r-0 ${
                            header === "DISK" || header === "MBAJTUR?" || header === "MBAJTUR"
                              ? "px-1 text-center"
                              : "px-2 text-left"
                          } ${narrow ? "w-[1%] whitespace-nowrap" : ""} ${
                            header === "NR" ? "w-8" : ""
                          } ${header === "WHO" || header === "DEP" ? "w-10" : ""}`}
                        >
                          {trimTableCell(cell) || "-"}
                        </th>
                      )
                    })}
                  </tr>
                )
              })}
          </thead>
          <tbody>
            {rows
              .filter((row) => !row.isHeader)
              .map((row) => {
                const visible = withoutStatusColumn(row.headers, row.cells)
                const tone = rowTone(row.label, row.cells, row.headers)
                return (
                  <tr key={row.key} className={tone}>
                    {visible.cells.map((cell, cellIndex) => {
                      const header = normalizeHeader(visible.headers[cellIndex] || headers[cellIndex] || "")
                      const narrow = isNarrowTableHeader(header)
                      return (
                        <td
                          key={cellIndex}
                          className={`border-b border-r border-slate-200 py-1.5 align-top last:border-r-0 ${
                            header === "DISK" || header === "MBAJTUR?" || header === "MBAJTUR"
                              ? "px-1 text-center"
                              : "px-2"
                          } ${diskCellTone(visible.headers, visible.cells, cellIndex)} ${meetingStatusCellTone(visible.headers, visible.cells, cellIndex)} ${
                            narrow ? "w-[1%] whitespace-nowrap" : "whitespace-pre-wrap break-words"
                          } ${header === "NR" ? "w-8" : ""} ${header === "WHO" || header === "DEP" ? "w-10" : ""}`}
                        >
                          {trimTableCell(cell) || "-"}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    )
  }

  const renderCompactMetricTable = (rows: TablePreviewItem[], key: string) => {
    const headers = withoutStatusColumn(rows[0].headers, rows[0].cells).headers
    return (
      <div key={key} className="w-max max-w-full border-b border-slate-200 last:border-b-0">
        <table className="border-collapse text-xs leading-5 text-slate-950">
          <thead>
            {rows
              .filter((row) => row.isHeader)
              .map((row) => {
                const visible = withoutStatusColumn(row.headers, row.cells)
                return (
                  <tr key={row.key} className="bg-slate-200 font-semibold">
                    {visible.cells.map((cell, cellIndex) => {
                      const header = normalizeHeader(visible.headers[cellIndex] || headers[cellIndex] || "")
                      return (
                        <th
                          key={cellIndex}
                          className={`border-b border-r border-slate-300 px-2.5 py-1.5 text-left whitespace-nowrap ${
                            header === "COUNT" ? "text-right" : ""
                          } ${header === "NR" ? "w-10" : ""} ${header === "COUNT" ? "w-16" : ""}`}
                        >
                          {trimTableCell(cell) || "-"}
                        </th>
                      )
                    })}
                  </tr>
                )
              })}
          </thead>
          <tbody>
            {rows
              .filter((row) => !row.isHeader)
              .map((row) => {
                const visible = withoutStatusColumn(row.headers, row.cells)
                const tone = rowTone(row.label, row.cells, row.headers)
                return (
                  <tr key={row.key} className={tone}>
                    {visible.cells.map((cell, cellIndex) => {
                      const header = normalizeHeader(visible.headers[cellIndex] || headers[cellIndex] || "")
                      return (
                        <td
                          key={cellIndex}
                          className={`border-b border-r border-slate-200 px-2.5 py-1.5 ${
                            header === "COUNT" ? "text-right tabular-nums whitespace-nowrap" : "whitespace-nowrap"
                          }`}
                        >
                          {trimTableCell(cell) || "-"}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    )
  }

  const hasWideTable = previewItems.some(
    (item) => item.kind === "table" && !isCompactMetricTable(item.headers),
  )

  const renderedItems: React.ReactNode[] = []
  for (let index = 0; index < previewItems.length; index += 1) {
    const item = previewItems[index]
    if (item.kind === "blank") {
      renderedItems.push(<div key={item.key} className="h-2" />)
      continue
    }
    if (item.kind === "label") {
      const keyed = splitKeyedLabel(item.text)
      if (keyed) {
        renderedItems.push(
          <div key={item.key} className="border-b border-slate-200 bg-slate-50 px-3 py-2 uppercase tracking-normal">
            <span className="font-semibold">{keyed.label}</span>
            {keyed.rest ? <span>{` ${keyed.rest}`}</span> : null}
          </div>,
        )
      } else {
        renderedItems.push(
          <div key={item.key} className="border-b border-slate-200 bg-slate-50 px-3 py-2 font-semibold uppercase tracking-normal">
            {item.text}
          </div>,
        )
      }
      continue
    }
    if (item.kind === "text") {
      const keyed = splitKeyedLabel(item.text)
      if (keyed) {
        renderedItems.push(
          <div key={item.key} className="border-b border-slate-200 bg-white px-3 py-2.5">
            <span className="font-semibold">{keyed.label}</span>
            {keyed.rest ? <span className="whitespace-pre-wrap break-words">{` ${keyed.rest}`}</span> : null}
          </div>,
        )
        continue
      }
      if (item.guidance || isGuidanceLine(item.text)) {
        const question = isGuidanceLine(item.text) ? null : item.text
        const guidance = item.guidance || item.text.trim()
        renderedItems.push(
          <div key={item.key} className="border-b border-slate-200 bg-white px-3 py-2">
            {question ? <div className="whitespace-pre-wrap break-words">{question}</div> : null}
            <div
              className={`pl-4 text-[11px] italic leading-snug text-slate-500 ${
                question ? "mt-0.5" : ""
              }`}
            >
              <span className="whitespace-pre-wrap break-words">{guidance}</span>
            </div>
          </div>,
        )
        continue
      }
      renderedItems.push(<React.Fragment key={item.key}>{renderKeyedLine(item.text)}</React.Fragment>)
      continue
    }

    if (isCompactMetricTable(item.headers)) {
      const group: TablePreviewItem[] = [item]
      while (
        index + 1 < previewItems.length &&
        previewItems[index + 1].kind === "table" &&
        isCompactMetricTable((previewItems[index + 1] as TablePreviewItem).headers)
      ) {
        index += 1
        group.push(previewItems[index] as TablePreviewItem)
      }
      renderedItems.push(renderCompactMetricTable(group, group[0].key))
      continue
    }

    const group: TablePreviewItem[] = [item]
    while (
      index + 1 < previewItems.length &&
      previewItems[index + 1].kind === "table" &&
      !isCompactMetricTable((previewItems[index + 1] as TablePreviewItem).headers) &&
      !(previewItems[index + 1] as TablePreviewItem).isHeader
    ) {
      index += 1
      group.push(previewItems[index] as TablePreviewItem)
    }
    renderedItems.push(renderDataTable(group, group[0].key))
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-md border bg-white">
      <div className={`${hasWideTable ? "min-w-[560px]" : "w-max max-w-full"} text-xs leading-5 text-slate-950`}>
        {renderedItems}
      </div>
    </div>
  )
}

export function ReportSectionFieldEditor({
  lines,
  onCancel,
  onSave,
}: {
  lines: string[]
  onCancel: () => void
  onSave: (lines: string[]) => void
}) {
  // Edit in local state only. Syncing every keystroke to the parent remounted
  // fields when label heuristics flipped, and made typing feel like it "stopped".
  const [draftLines, setDraftLines] = React.useState(() => (lines.length ? [...lines] : [""]))
  const draftLinesRef = React.useRef(draftLines)
  draftLinesRef.current = draftLines

  const tableBlocks = React.useMemo(() => editorTableBlocks(draftLines), [draftLines])
  const tableRowIndexes = React.useMemo(
    () => new Set(tableBlocks.flatMap((block) => [block.headerIndex, ...block.rowIndexes])),
    [tableBlocks],
  )
  const addRowIndexes = React.useMemo(
    () => new Map(tableBlocks.map((block) => [block.endIndex, block.headerIndex])),
    [tableBlocks],
  )
  const templates = React.useMemo(() => tableGridTemplates(draftLines), [draftLines])

  const commitLines = React.useCallback((next: string[]) => {
    const normalized = next.length ? next : [""]
    draftLinesRef.current = normalized
    setDraftLines(normalized)
  }, [])

  const updateLine = (lineIndex: number, value: string) => {
    commitLines(draftLinesRef.current.map((line, index) => (index === lineIndex ? value : line)))
  }

  const updateCell = (lineIndex: number, cellIndex: number, value: string) => {
    const current = draftLinesRef.current
    commitLines(
      current.map((line, index) => (index === lineIndex ? updateTableCell(line, cellIndex, value) : line)),
    )
  }

  const removeLine = (lineIndex: number) => {
    commitLines(draftLinesRef.current.filter((_, index) => index !== lineIndex))
  }

  const addRow = (headerIndex: number) => {
    const current = draftLinesRef.current
    const headers = tableCells(current[headerIndex]) || []
    const emptyCells = headers.map((header, index) =>
      normalizeHeader(header) === "NR" ? String(index + 1) : "",
    )
    const insertionIndex =
      tableBlocks.find((block) => block.headerIndex === headerIndex)?.endIndex ?? headerIndex + 1
    commitLines([
      ...current.slice(0, insertionIndex),
      formatTableRow(emptyCells),
      ...current.slice(insertionIndex),
    ])
  }

  return (
    <div className="mt-3 space-y-3 rounded-md border bg-white p-3">
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          <X className="h-4 w-4" /> Cancel
        </Button>
        <Button type="button" size="sm" onClick={() => onSave(draftLinesRef.current)}>
          <Save className="h-4 w-4" /> Apply
        </Button>
      </div>

      <div className="max-h-[680px] space-y-2 overflow-auto pr-1">
        {draftLines.map((line, lineIndex) => {
          const trimmed = line.trim()
          if (!trimmed) {
            // Keep blank lines editable. Clearing "(Ploteso manualisht)" used to
            // replace the textarea with a non-editable spacer.
            return (
              <Textarea
                key={`text-${lineIndex}`}
                value={line}
                rows={3}
                className="min-h-16 resize-y"
                placeholder="Shkruaj pergjigjen..."
                autoFocus={draftLines.length === 1}
                onChange={(event) => updateLine(lineIndex, event.target.value)}
              />
            )
          }
          if (isRuleLine(line)) {
            const headerIndex = addRowIndexes.get(lineIndex)
            return headerIndex === undefined ? null : (
              <Button
                key={`add-${lineIndex}`}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addRow(headerIndex)}
              >
                <Plus className="h-4 w-4" /> Add row
              </Button>
            )
          }

          const cells = tableCells(line)
          if (cells) {
            const isHeader = isHeaderCells(cells)
            const template = templates.get(lineIndex) || tableGridTemplate(cells)
            const block = tableBlocks.find(
              (entry) => entry.headerIndex === lineIndex || entry.rowIndexes.includes(lineIndex),
            )
            const headerCells = block ? tableCells(draftLines[block.headerIndex]) : cells
            const headers = (headerCells || cells).map(normalizeHeader)
            const compact = isCompactMetricTable(headers)
            return (
              <div key={`table-${lineIndex}`} className="overflow-x-auto">
                <div
                  className={`grid items-center gap-2 ${compact ? "w-max" : "min-w-[560px]"}`}
                  style={{ gridTemplateColumns: `${template} 42px` }}
                >
                  {cells.map((cell, cellIndex) =>
                    isHeader ? (
                      <div
                        key={cellIndex}
                        className="rounded border bg-slate-100 px-2 py-2 text-xs font-semibold"
                      >
                        {normalizeHeader(cell)}
                      </div>
                    ) : (
                      <Input
                        key={cellIndex}
                        value={cell}
                        onChange={(event) => updateCell(lineIndex, cellIndex, event.target.value)}
                      />
                    ),
                  )}
                  {tableRowIndexes.has(lineIndex) && !isHeader ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(lineIndex)}
                      aria-label="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <span />
                  )}
                </div>
              </div>
            )
          }

          // Always keep freeform lines editable. Treating ALL-CAPS / trailing ":" as
          // read-only labels mid-keystroke unmounted the input and cut typing short.
          return (
            <Textarea
              key={`text-${lineIndex}`}
              value={line}
              rows={Math.min(6, Math.max(2, Math.ceil(line.length / 80) || 2))}
              className="min-h-16 resize-y"
              onChange={(event) => updateLine(lineIndex, event.target.value)}
            />
          )
        })}
      </div>
    </div>
  )
}
