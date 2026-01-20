"use client"

import * as React from "react"

const BOLD_TAG_PATTERN = /<(strong|b|br|div|p)(\s|>|\/)/i

function normalizeBoldValue(value: string) {
  if (!value) return ""
  if (typeof document === "undefined") return value
  if (BOLD_TAG_PATTERN.test(value)) return sanitizeBoldOnlyHtml(value)
  const container = document.createElement("div")
  const lines = value.split(/\r?\n/)
  lines.forEach((line, index) => {
    container.appendChild(document.createTextNode(line))
    if (index < lines.length - 1) container.appendChild(document.createElement("br"))
  })
  return container.innerHTML
}

function sanitizeBoldOnlyHtml(raw: string) {
  if (typeof document === "undefined") return raw
  const container = document.createElement("div")
  container.innerHTML = raw

  // First pass: unwrap all divs and p tags by replacing them with their content
  const unwrapBlockElements = (el: Element) => {
    const blocks = el.querySelectorAll("div, p")
    // Process in reverse to avoid issues with nested elements
    Array.from(blocks).reverse().forEach((block) => {
      const parent = block.parentNode
      if (!parent) return
      // Move all children before the block element
      while (block.firstChild) {
        parent.insertBefore(block.firstChild, block)
      }
      // Remove the empty block
      parent.removeChild(block)
    })
  }
  unwrapBlockElements(container)

  // Second pass: normalize b to strong, remove unwanted tags
  const clean = document.createElement("div")

  const sanitizeNode = (node: Node): Node[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ""
      return text.length > 0 ? [document.createTextNode(text)] : []
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return []
    const el = node as HTMLElement
    const tag = el.tagName
    if (tag === "BR") return [document.createElement("br")]
    const children = Array.from(el.childNodes).flatMap(sanitizeNode)
    if (tag === "B" || tag === "STRONG") {
      const strong = document.createElement("strong")
      children.forEach((child) => strong.appendChild(child))
      return [strong]
    }
    if (tag === "SPAN") {
      const weight = el.style.fontWeight || el.getAttribute("data-weight") || ""
      const numericWeight = Number.parseInt(weight, 10)
      const isBold =
        weight.toLowerCase() === "bold" || (!Number.isNaN(numericWeight) && numericWeight >= 600)
      if (isBold) {
        const strong = document.createElement("strong")
        children.forEach((child) => strong.appendChild(child))
        return [strong]
      }
      return children
    }
    // For any other tags, just return their children (unwrap)
    return children
  }

  Array.from(container.childNodes).forEach((node) => {
    sanitizeNode(node).forEach((child) => clean.appendChild(child))
  })

  // Normalize: merge adjacent text nodes
  clean.normalize()

  const text = clean.textContent?.replace(/\s+/g, "") ?? ""
  if (!text) return ""
  return clean.innerHTML
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

type BoldOnlyEditorProps = {
  value: string
  onChange: (value: string) => void
}

export function BoldOnlyEditor({ value, onChange }: BoldOnlyEditorProps) {
  const editorRef = React.useRef<HTMLDivElement | null>(null)
  const lastValue = React.useRef("")

  React.useEffect(() => {
    if (!editorRef.current) return
    const normalized = normalizeBoldValue(value)
    if (editorRef.current.innerHTML !== normalized) {
      editorRef.current.innerHTML = normalized
      lastValue.current = normalized
    }
  }, [value])

  const commitChange = React.useCallback(() => {
    if (!editorRef.current) return
    const sanitized = sanitizeBoldOnlyHtml(editorRef.current.innerHTML)
    if (sanitized !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = sanitized
    }
    lastValue.current = sanitized
    onChange(sanitized)
  }, [onChange])

  const handleInput = React.useCallback(() => {
    if (!editorRef.current) return
    const raw = editorRef.current.innerHTML
    lastValue.current = raw
    onChange(raw)
  }, [onChange])

  const [isBold, setIsBold] = React.useState(false)

  const checkBoldState = React.useCallback(() => {
    if (typeof document !== "undefined") {
      setIsBold(document.queryCommandState("bold"))
    }
  }, [])

  const applyBold = React.useCallback(() => {
    if (!editorRef.current) return
    editorRef.current.focus()
    // Use native execCommand for bold - it toggles bold on/off
    document.execCommand("bold", false)
    checkBoldState()
    commitChange()
  }, [commitChange, checkBoldState])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm font-semibold shadow-sm transition ${isBold
              ? "border-blue-500 bg-blue-100 text-blue-700"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={applyBold}
          aria-label="Bold"
          aria-pressed={isBold}
        >
          B
        </button>
        <span className="text-xs text-muted-foreground">Bold only</span>
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        className="border-input focus-visible:border-ring focus-visible:ring-ring/50 min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px] md:text-sm whitespace-pre-wrap"
        onInput={handleInput}
        onBlur={commitChange}
        onSelect={checkBoldState}
        onKeyUp={checkBoldState}
        onMouseUp={checkBoldState}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            document.execCommand("insertLineBreak")
            handleInput()
            return
          }
          if (event.ctrlKey || event.metaKey) {
            const key = event.key.toLowerCase()
            if (key === "b") {
              event.preventDefault()
              applyBold()
              return
            }
            if (["i", "u"].includes(key)) {
              event.preventDefault()
            }
          }
        }}
        onPaste={(event) => {
          event.preventDefault()
          const text = event.clipboardData.getData("text/plain")
          if (!text) return
          const html = escapeHtml(text)
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .replace(/\n/g, "<br>")
          document.execCommand("insertHTML", false, html)
          commitChange()
        }}
        suppressContentEditableWarning
      />
    </div>
  )
}
