import * as React from "react"

import type { KnowledgePrompt } from "./prompt-types"

/**
 * Prompt search: accent-insensitive (ë = e, ç = c), multi-word (every word must match
 * somewhere), weighted (keywords > title > path > prompt text), with a small typo
 * tolerance for longer words. `#word` restricts that word to keywords.
 */

const DIACRITICS = /[̀-ͯ]/g

export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(DIACRITICS, "").toLowerCase()
}

export function tokenizeQuery(query: string): string[] {
  return normalizeText(query)
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) {
    // one swap of neighbouring letters ("titel" -> "title")
    const diff: number[] = []
    for (let k = 0; k < a.length && diff.length <= 2; k++) if (a[k] !== b[k]) diff.push(k)
    if (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]) {
      return true
    }
  }
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else {
      i++
      j++
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

type Indexed = {
  prompt: KnowledgePrompt
  title: string
  titleWords: string[]
  keywords: string[]
  path: string
  content: string
}

export function indexPrompts(prompts: KnowledgePrompt[]): Indexed[] {
  return prompts.map((prompt) => {
    const title = normalizeText(prompt.title)
    return {
      prompt,
      title,
      titleWords: title.split(/[^a-z0-9]+/).filter(Boolean),
      keywords: (prompt.keywords || []).map(normalizeText),
      path: normalizeText(prompt.files_path || ""),
      content: normalizeText(prompt.content || ""),
    }
  })
}

function scoreToken(item: Indexed, rawToken: string): number {
  const keywordOnly = rawToken.startsWith("#")
  const token = keywordOnly ? rawToken.slice(1) : rawToken
  if (!token) return 1
  let score = 0
  for (const kw of item.keywords) {
    if (kw === token) score = Math.max(score, 10)
    else if (kw.startsWith(token)) score = Math.max(score, 7)
    else if (kw.includes(token)) score = Math.max(score, 4)
  }
  if (keywordOnly) return score
  if (item.titleWords.some((w) => w === token)) score = Math.max(score, 9)
  else if (item.titleWords.some((w) => w.startsWith(token))) score = Math.max(score, 7)
  else if (item.title.includes(token)) score = Math.max(score, 5)
  if (score < 3 && item.path.includes(token)) score = Math.max(score, 3)
  if (score < 1 && item.content.includes(token)) score = 1
  if (score === 0 && token.length >= 5) {
    const candidates = [...item.titleWords, ...item.keywords.flatMap((k) => k.split(/\s+/))]
    if (candidates.some((w) => withinOneEdit(w, token))) score = 2
  }
  return score
}

export function searchPrompts(
  index: Indexed[],
  query: string,
  requiredKeywords: string[] = []
): { prompt: KnowledgePrompt; score: number }[] {
  const tokens = tokenizeQuery(query)
  const required = requiredKeywords.map(normalizeText)
  const phrase = normalizeText(query.trim())
  const out: { prompt: KnowledgePrompt; score: number }[] = []
  for (const item of index) {
    if (required.length && !required.every((kw) => item.keywords.includes(kw))) continue
    let total = 0
    let matched = true
    for (const token of tokens) {
      const s = scoreToken(item, token)
      if (s === 0) {
        matched = false
        break
      }
      total += s
    }
    if (!matched) continue
    if (tokens.length > 1 && phrase && item.title.includes(phrase)) total += 8
    out.push({ prompt: item.prompt, score: total })
  }
  return out
}

/** Wrap every occurrence of the query words in <mark>, accent-insensitively. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const tokens = tokenizeQuery(query)
    .map((t) => (t.startsWith("#") ? t.slice(1) : t))
    .filter((t) => t.length > 0)
  if (!text || tokens.length === 0) return <>{text}</>

  // Build a normalized copy with a map back to original character positions.
  let normalized = ""
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const n = normalizeText(text[i])
    for (let k = 0; k < n.length; k++) {
      normalized += n[k]
      map.push(i)
    }
  }
  const marks = new Array<boolean>(text.length).fill(false)
  for (const token of tokens) {
    let from = 0
    while (from <= normalized.length - token.length) {
      const at = normalized.indexOf(token, from)
      if (at < 0) break
      for (let k = at; k < at + token.length; k++) marks[map[k]] = true
      from = at + token.length
    }
  }
  const parts: React.ReactNode[] = []
  let start = 0
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marks[i] !== marks[start]) {
      const chunk = text.slice(start, i)
      parts.push(
        marks[start] ? (
          <mark key={start} className="rounded-sm bg-yellow-200/80 px-0.5 text-inherit dark:bg-yellow-500/30">
            {chunk}
          </mark>
        ) : (
          <React.Fragment key={start}>{chunk}</React.Fragment>
        )
      )
      start = i
    }
  }
  return <>{parts}</>
}

/** A short excerpt of `text` centred on the first query match (or its beginning). */
export function excerpt(text: string, query: string, length = 240): string {
  const clean = (text || "").replace(/\s+/g, " ").trim()
  if (clean.length <= length) return clean
  const tokens = tokenizeQuery(query).map((t) => (t.startsWith("#") ? t.slice(1) : t))
  const normalized = normalizeText(clean)
  let first = -1
  for (const token of tokens) {
    const at = normalized.indexOf(token)
    if (at >= 0 && (first < 0 || at < first)) first = at
  }
  if (first < 60) return clean.slice(0, length).trimEnd() + "…"
  const start = Math.max(0, first - 60)
  return "…" + clean.slice(start, start + length).trim() + "…"
}
