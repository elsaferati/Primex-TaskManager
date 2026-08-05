"use client"

import * as React from "react"
import { Plus, Save, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type EditorTableBlock = { headerIndex: number; rowIndexes: number[]; endIndex: number }

const HEADER_LABELS = new Set([
  "NR",
  "WHO",
  "FROM",
  "PER",
  "TITLE",
  "NOTE",
  "DISK",
  "TIME",
  "ORA",
  "KOHA",
  "DATA",
  "DATE",
  "LATE",
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
  return trimmed.slice(1, -1).split("|").map((cell) => cell.trim())
}

function updateTableCell(line: string, cellIndex: number, value: string) {
  const cells = tableCells(line)
  if (!cells) return line
  cells[cellIndex] = value
  return `| ${cells.join(" | ")} |`
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
  if (value === "NR") return "44px"
  if (value === "WHO" || value === "FROM" || value === "PER") return "64px"
  if (value === "DISK") return "58px"
  if (value === "TIME") return "76px"
  if (value === "DATA" || value === "DATE") return "96px"
  if (value === "LATE") return "88px"
  if (value === "MBAJTUR?" || value === "MBAJTUR" || value === "ANULUAR" || value === "PA STATUS") return "78px"
  if (value === "TITLE" || value === "NOTE") return "minmax(280px, 1fr)"
  return "minmax(90px, auto)"
}

function tableGridTemplate(cells: string[]) {
  return cells.map(compactWidthForHeader).join(" ")
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

function rowTone(label: string, cells: string[], headers: string[]) {
  const normalizedLabel = label.toUpperCase()
  const diskIndex = headers.findIndex((header) => normalizeHeader(header) === "DISK")
  const diskValue = diskIndex >= 0 ? cells[diskIndex]?.trim().toUpperCase() : ""
  if (diskValue === "NO") return "bg-red-100 text-red-800"
  if (normalizedLabel.includes("DEADLINE")) return "bg-red-600 text-white"
  if (normalizedLabel.includes("LATE")) return "bg-red-100"
  if (normalizedLabel.includes("TODO") || normalizedLabel.includes("DETYRAT E REJA")) return "bg-pink-200"
  if (normalizedLabel.includes("IN PROGRESS")) return "bg-yellow-100"
  if (normalizedLabel.includes("DONE") || diskValue === "YES") return "bg-green-100"
  if (normalizedLabel.includes("NOTES")) return "bg-blue-100"
  return "bg-white"
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

  return (
    <div className="mt-3 overflow-x-auto rounded-md border bg-white">
      <div className="min-w-[560px] text-xs leading-5 text-slate-950">
        {lines.map((line, index) => {
          const trimmed = line.trim()
          if (!trimmed) return <div key={index} className="h-2" />
          if (isRuleLine(line)) return null

          const cells = tableCells(line)
          if (cells) {
            const isHeader = isHeaderCells(cells)
            const template = templates.get(index) || tableGridTemplate(cells)
            const context = lineContexts[index]
            const tone = isHeader ? "bg-slate-200 font-semibold" : rowTone(context.label, cells, context.headers)
            return (
              <div key={index} className={`grid border-b border-slate-200 last:border-b-0 ${tone}`} style={{ gridTemplateColumns: template }}>
                {cells.map((cell, cellIndex) => (
                  <div key={cellIndex} className="border-r border-slate-200 px-2 py-1.5 last:border-r-0">
                    <span className="whitespace-pre-wrap break-words">{cell || "-"}</span>
                  </div>
                ))}
              </div>
            )
          }

          if (isFixedEditorLabel(line)) {
            return (
              <div key={index} className="border-b border-slate-200 bg-slate-50 px-3 py-2 font-semibold uppercase tracking-normal">
                {trimmed}
              </div>
            )
          }

          return (
            <div key={index} className="px-3 py-2">
              <span className="whitespace-pre-wrap break-words">{line}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ReportSectionFieldEditor({
  lines,
  onChangeLines,
  onCancel,
  onSave,
}: {
  lines: string[]
  onChangeLines: (lines: string[]) => void
  onCancel: () => void
  onSave: () => void
}) {
  const tableBlocks = React.useMemo(() => editorTableBlocks(lines), [lines])
  const tableRowIndexes = React.useMemo(() => new Set(tableBlocks.flatMap((block) => [block.headerIndex, ...block.rowIndexes])), [tableBlocks])
  const addRowIndexes = React.useMemo(() => new Map(tableBlocks.map((block) => [block.endIndex, block.headerIndex])), [tableBlocks])
  const templates = React.useMemo(() => tableGridTemplates(lines), [lines])

  const updateLine = (lineIndex: number, value: string) => {
    onChangeLines(lines.map((line, index) => index === lineIndex ? value : line))
  }

  const updateCell = (lineIndex: number, cellIndex: number, value: string) => {
    updateLine(lineIndex, updateTableCell(lines[lineIndex], cellIndex, value))
  }

  const removeLine = (lineIndex: number) => {
    onChangeLines(lines.filter((_, index) => index !== lineIndex))
  }

  const addRow = (headerIndex: number) => {
    const headers = tableCells(lines[headerIndex]) || []
    const emptyCells = headers.map((header, index) => normalizeHeader(header) === "NR" ? String(index + 1) : "")
    const insertionIndex = tableBlocks.find((block) => block.headerIndex === headerIndex)?.endIndex ?? headerIndex + 1
    onChangeLines([
      ...lines.slice(0, insertionIndex),
      `| ${emptyCells.join(" | ")} |`,
      ...lines.slice(insertionIndex),
    ])
  }

  return (
    <div className="mt-3 space-y-3 rounded-md border bg-white p-3">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          <X className="h-4 w-4" /> Cancel
        </Button>
        <Button size="sm" onClick={onSave}>
          <Save className="h-4 w-4" /> Apply
        </Button>
      </div>

      <div className="max-h-[680px] space-y-2 overflow-auto pr-1">
        {lines.map((line, lineIndex) => {
          const trimmed = line.trim()
          if (!trimmed) return <div key={lineIndex} className="h-2" />
          if (isRuleLine(line)) {
            const headerIndex = addRowIndexes.get(lineIndex)
            return headerIndex === undefined ? null : (
              <Button key={lineIndex} type="button" variant="outline" size="sm" onClick={() => addRow(headerIndex)}>
                <Plus className="h-4 w-4" /> Add row
              </Button>
            )
          }

          const cells = tableCells(line)
          if (cells) {
            const isHeader = isHeaderCells(cells)
            const template = templates.get(lineIndex) || tableGridTemplate(cells)
            return (
              <div key={lineIndex} className="overflow-x-auto">
                <div className="grid min-w-[560px] items-center gap-2" style={{ gridTemplateColumns: `${template} 42px` }}>
                  {cells.map((cell, cellIndex) => (
                    isHeader ? (
                      <div key={cellIndex} className="rounded border bg-slate-100 px-2 py-2 text-xs font-semibold">
                        {normalizeHeader(cell)}
                      </div>
                    ) : (
                      <Input
                        key={cellIndex}
                        value={cell}
                        onChange={(event) => updateCell(lineIndex, cellIndex, event.target.value)}
                      />
                    )
                  ))}
                  {tableRowIndexes.has(lineIndex) && !isHeader ? (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(lineIndex)} aria-label="Remove row">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : <span />}
                </div>
              </div>
            )
          }

          if (isFixedEditorLabel(line)) {
            return (
              <div key={lineIndex} className="rounded border bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-700">
                {trimmed}
              </div>
            )
          }

          return (
            <Input
              key={lineIndex}
              value={line}
              onChange={(event) => updateLine(lineIndex, event.target.value)}
            />
          )
        })}
      </div>
    </div>
  )
}
