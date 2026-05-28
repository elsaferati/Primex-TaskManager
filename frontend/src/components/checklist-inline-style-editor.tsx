"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

type ChecklistInlineStyleEditorProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

function wrapSelection(value: string, start: number, end: number, token: "b" | "red") {
  const open = `[[${token}]]`
  const close = `[[/${token}]]`
  const selected = value.slice(start, end)

  if (selected.startsWith(open) && selected.endsWith(close)) {
    return {
      value: `${value.slice(0, start)}${selected.slice(open.length, selected.length - close.length)}${value.slice(end)}`,
      start,
      end: end - open.length - close.length,
    }
  }

  return {
    value: `${value.slice(0, start)}${open}${selected}${close}${value.slice(end)}`,
    start: start + open.length,
    end: start + open.length + selected.length,
  }
}

export function ChecklistInlineStyleEditor({
  value,
  onChange,
  placeholder,
  className,
}: ChecklistInlineStyleEditorProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

  const applyStyle = React.useCallback((token: "b" | "red") => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart ?? 0
    const end = textarea.selectionEnd ?? start
    const next = wrapSelection(value, start, end, token)
    onChange(next.value)

    window.requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(next.start, next.end)
    })
  }, [onChange, value])

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-6 w-6 text-xs font-bold"
          title="Bold selected text"
          aria-label="Bold selected text"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyStyle("b")}
        >
          B
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-6 w-6"
          title="Make selected text red"
          aria-label="Make selected text red"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyStyle("red")}
        >
          <span className="h-3 w-3 rounded-sm bg-red-600" />
        </Button>
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={[
          "min-h-8 px-2 py-1 text-xs leading-4",
          className || "",
        ].join(" ")}
        rows={1}
      />
    </div>
  )
}
