import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import vm from "node:vm"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"

const require = createRequire(import.meta.url)
const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src")
const cache = new Map()

function load(name) {
  if (!name.startsWith("@/")) return require(name)
  if (cache.has(name)) return cache.get(name)
  const base = path.join(src, name.slice(2))
  let source
  try { source = readFileSync(`${base}.tsx`, "utf8") }
  catch { source = readFileSync(`${base}.ts`, "utf8") }
  const loadedModule = { exports: {} }
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } })
  vm.runInNewContext(outputText, { module: loadedModule, exports: loadedModule.exports, require: load })
  cache.set(name, loadedModule.exports)
  return loadedModule.exports
}

const { M3ReportingPointsView, ReportingTaskTable } = load("@/components/m3-reporting-points-view")
const row = { task_id: "task", title: "Detyra", assignees: "User", department: "DEV", project: "P", status: "TODO", progress: 65 }
const report = {
  id: "report", report_date: "2026-10-05", manual_answers: {}, data: {}, realization: null,
  realization_captured_at: null, status: "DRAFT",
}

function render(overrides = {}, answers = {}, disabled = false) {
  return renderToStaticMarkup(React.createElement(M3ReportingPointsView, {
    report: { ...report, ...overrides }, answers, disabled, onAnswerChange: () => {},
  }))
}

test("both report blocks contain four separate editable manual answers", () => {
  const html = render({}, { underload: "Përgjigje e ruajtur", ga_reorganization: "Riorganizo ekipin" })
  assert.match(html, /PIKAT PËR RAPORTIM M3/)
  assert.match(html, /PIKAT PËR RAPORTIM PËR GA/)
  assert.equal((html.match(/<textarea/g) || []).length, 4)
  assert.match(html, /Përgjigje e ruajtur/)
  assert.match(html, /Riorganizo ekipin/)
  assert.match(html, /Të gjitha detyrat TODO llogariten të paprekura/)
})

test("postponement cells carry the actual risk colors and user comments", () => {
  const rows = [{ ...row, task_id: "safe", risk: "OK", comment: "Klienti kërkoi ndryshim" },
                { ...row, task_id: "risky", risk: "RREZIK", comment: "Për të premten" }]
  const html = renderToStaticMarkup(React.createElement(ReportingTaskTable, { rows, kind: "postponed" }))
  assert.match(html, /<td[^>]*bg-green-100[^>]*>OK<\/td>/)
  assert.match(html, /<td[^>]*bg-red-100[^>]*>RREZIK<\/td>/)
  assert.match(html, /Klienti kërkoi ndryshim/)
})

test("TODO remains visible with earlier progress and same-day statuses remain distinct", () => {
  const html = render({ data: { untouched: [row], same_day: [{ ...row, task_id: "done", status: "DONE", progress: 100 }] } })
  assert.match(html, /TODO/)
  assert.match(html, /65%/)
  assert.match(html, /DONE/)
  assert.match(html, /100%/)
})

test("the stored realization is displayed and missing data never becomes zero", () => {
  const html = render({ realization: { percent: 62, employees: 10, comment: "Jemi mbi 50%", people: [] }, realization_captured_at: "2026-10-05T16:15:00+02:00" })
  assert.match(html, /62%/)
  assert.match(html, /16:15/)
  assert.match(html, /10 persona/)
  assert.doesNotMatch(render(), />0%/)
  assert.match(render(), /Nuk ka ende një vlerë të ruajtur/)
})

test("sent report answers are read-only", () => {
  const html = render({ status: "SENT" }, {}, true)
  assert.equal((html.match(/<textarea[^>]*disabled=""/g) || []).length, 4)
})
