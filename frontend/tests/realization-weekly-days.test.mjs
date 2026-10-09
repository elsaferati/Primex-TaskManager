import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { test } from "node:test"
import vm from "node:vm"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

const require = createRequire(import.meta.url)
const source = readFileSync(new URL("../src/components/realization-weekly-days.tsx", import.meta.url), "utf8")
const markup = { exports: {} }
const markupSource = readFileSync(new URL("../src/lib/note-markup.tsx", import.meta.url), "utf8")
vm.runInNewContext(ts.transpileModule(markupSource, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module: markup, exports: markup.exports, require })
const loaded = { exports: {} }
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } })
vm.runInNewContext(outputText, { module: loaded, exports: loaded.exports, require: name => name === "@/lib/note-markup" ? markup.exports : name === "@/lib/realization-checklist" ? { weeklyChecklistLabels: { helped_colleague: "Ndihmoi koleg?" } } : require(name) })
const { RealizationWeeklyDays } = loaded.exports

test("weekly days show exact dated comments, authors and the daily percentage", () => {
  const result = { facts_json: { daily_timeline: [{ date: "2026-09-15", daily_progress_percent: 68.8, planned_count: 4, completed_count: 3, additional_count: 1,
    person_comment: { comment: "Gabimi u korrigjua", author: "Përgjegjësi" },
    manual_answers: { helped_colleague: { value: true, comment: "Ndihmoi me konfigurimin" } },
    tasks: [{ title: "Detyra X", daily_report_comment: "Përfunduar", classification: "COMPLETED" }],
  }] } }
  const html = renderToStaticMarkup(React.createElement(RealizationWeeklyDays, { result }))
  for (const text of ["15.09.2026", "68.8%", "Gabimi u korrigjua", "Përgjegjësi", "Ndihmoi me konfigurimin", "Detyra X"]) assert.ok(html.includes(text), text)
})

test("missing, leave and future days are distinct from a measured zero", () => {
  const result = { facts_json: { daily_timeline: [
    { date: "2026-09-14", daily_progress_percent: null },
    { date: "2026-09-15", on_leave: true, daily_progress_percent: null },
    { date: "2026-09-16", future: true, daily_progress_percent: null },
    { date: "2026-09-17", daily_progress_percent: 0 },
  ] } }
  const html = renderToStaticMarkup(React.createElement(RealizationWeeklyDays, { result, compact: true }))
  for (const label of ["Pa të dhëna", "Pushim", "Në vijim", "0%"]) assert.ok(html.includes(label), label)
  assert.ok(!html.includes("null%"))
})
