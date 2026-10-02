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
const auth = { user: { role: "STAFF", full_name: "Test User" }, loading: false, apiFetch: () => {} }

function load(name) {
  if (name === "@/lib/auth") return { useAuth: () => auth }
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
const Page = load("@/app/(app)/m3-reporting-points/page").default
const row = { task_id: "task", title: "Detyra", assignees: "EF", department: "DEV", project: "P", status: "TODO", progress: 65, am_pm: "PM", task_type: "1H" }
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
  assert.match(html, /brenda intervalit Start–Due/)
})

test("GA filter shows only its two points and retains the manual answer", () => {
  const html = renderToStaticMarkup(React.createElement(M3ReportingPointsView, { report, answers: { underload: "Hidden answer", ga_reorganization: "GA saved answer" }, onAnswerChange: () => {}, gaOnly: true }))
  assert.equal((html.match(/<textarea/g) || []).length, 1)
  assert.match(html, /GA saved answer/)
  assert.match(html, /2\. A KA DET QË SHTYHET/)
  assert.doesNotMatch(html, /Hidden answer|NËNNGARKESË|PSE PA PREK|REALIZIMI — A MBËRRIHET/)
})

test("untouched splits SYS tasks and priority styling overrides status colors", () => {
  const html = renderToStaticMarkup(React.createElement(ReportingTaskTable, { kind: "untouched", rows: [
    { ...row, task_id: "regular", title: "Deadline task", deadline_important: true },
    { ...row, task_id: "system", title: "08:00 System task", task_type: "SYS", is_system_task: true, marker: "👁" },
  ] }))
  assert.equal((html.match(/<table /g) || []).length, 2)
  assert.match(html, /DET FT DHE PRJK PA PROGRES:/)
  assert.match(html, /DETYRAT E SISTEMIT PA PROGRES:/)
  assert.match(html, /background-color:#dc2626;color:#ffffff/)
  assert.match(html, /border-top:3px solid #dc2626/)
  assert.match(html, /border-right:3px solid #dc2626/)
  assert.equal((html.match(/Deadline task/g) || []).length, 1)
  assert.equal((html.match(/08:00 System task/g) || []).length, 1)
  assert.match(html, /data-task-symbol="true">👁<\/strong>/)
})

test("realization includes saved department percentages and missing data", () => {
  const html = render({ realization: { percent: 62, comment: "Staff summary", employees: 8, departments: [
    { department_id: "dev", code: "DEV", percent: 75, comment: "Above 50" },
    { department_id: "gd", code: "GD", percent: 25, comment: "Below 50" },
    { department_id: "pcm", code: "PCM", percent: null, comment: "Missing baseline" },
  ] } })
  assert.match(html, /62%/)
  assert.match(html, /75%/)
  assert.match(html, /25%/)
  assert.match(html, /Pa të dhëna/)
  assert.match(html, /DEPARTAMENTI/)
})

test("postponement cells carry risk colors and My View comments while status stays implicit", () => {
  const rows = [{ ...row, task_id: "safe", risk: "OK", comment: "Klienti kërkoi ndryshim" },
                { ...row, task_id: "risky", risk: "RREZIK", comment: "Për të premten" }]
  const html = renderToStaticMarkup(React.createElement(ReportingTaskTable, { rows, kind: "postponed" }))
  assert.match(html, /<td[^>]*bg-green-100[^>]*>OK<\/td>/)
  assert.match(html, /<td[^>]*bg-red-100[^>]*>RREZIK<\/td>/)
  assert.match(html, /Klienti kërkoi ndryshim/)
  assert.match(html, />KOMENTI<\/th>/)
  assert.doesNotMatch(html, /STATUSI/)
  assert.match(html, />AM\/PM<\/th>/)
  assert.match(html, />LLOJI<\/th>/)
  assert.match(html, />EF<\/td>/)
  assert.match(html, />DEV<\/td>/)
  assert.match(html, />1H<\/td>/)
})

test("task tables show status colors and uppercase headers without progress columns", () => {
  const html = render({ data: { untouched: [row], postponed: [{ ...row, task_id: "done", status: "DONE", progress: 100 }] } })
  assert.match(html, /TODO/)
  assert.doesNotMatch(html, /65%/)
  assert.doesNotMatch(html, />DONE<\/td>/)
  assert.doesNotMatch(html, /100%/)
  assert.match(html, /background-color:#FFC4ED/)
  assert.match(html, /background-color:#C4FDC4/)
  assert.match(html, />TITULLI<\/th>/)
  assert.match(html, />KUSH<\/th>/)
  assert.doesNotMatch(html, />STATUSI<\/th>/)
  assert.doesNotMatch(html, /<th[^>]*>[^<]*[Pp][Rr][Oo][Gg][Rr][Ee][Ss][Ii]/)
})

test("postponements use separate tables and stacked NGA NE dates with wrapped title width", () => {
  const both = { ...row, task_id: "both", title: "Të dyja datat", old_start_date: "2026-10-05", start_date: "2026-10-07", old_due_date: "2026-10-05", due_date: "2026-10-08", postponement_kind: "start_due" }
  const due = { ...row, task_id: "due", title: "Vetëm Due", old_start_date: "2026-10-05", start_date: "2026-10-05", old_due_date: "2026-10-05", due_date: "2026-10-09", postponement_kind: "due" }
  const html = renderToStaticMarkup(React.createElement(ReportingTaskTable, { rows: [due, both], kind: "postponed" }))
  assert.equal((html.match(/<table /g) || []).length, 2)
  assert.match(html, /SHTYER START DHE DUE DATE:/)
  assert.match(html, /SHTYER DUE DATE:/)
  assert.match(html, />NGA<\/th>/)
  assert.match(html, />NE<\/th>/)
  assert.match(html, /START: 05.10.2026<\/span>/)
  assert.match(html, /border-b-\[3px\] border-black/)
  assert.match(html, /DUE: 08.10.2026<\/span>/)
  assert.equal((html.match(/Të dyja datat<\/div>/g) || []).length, 1)
  assert.equal((html.match(/Vetëm Due<\/div>/g) || []).length, 1)
  assert.match(html, /table-fixed/)
  assert.match(html, /width:28px/)
  assert.match(html, /width:42px/)
  assert.match(html, /width:44px/)
  assert.match(html, /width:88px/)
  assert.match(html, /<col\/><col style="width:124px"/)
  assert.match(html, /w-full whitespace-normal break-words/)
})

test("TODO and same-day hide dates and same-day excludes Done tasks", () => {
  const untouched = renderToStaticMarkup(React.createElement(ReportingTaskTable, { rows: [row], kind: "untouched" }))
  assert.doesNotMatch(untouched, />START<\/th>|>DUE<\/th>/)
  const rows = [{ ...row, task_id: "done", title: "Done title", status: "DONE" },
                { ...row, task_id: "active", title: "Active title", status: "IN_PROGRESS" },
                { ...row, task_id: "todo", title: "Todo title" }]
  const html = renderToStaticMarkup(React.createElement(ReportingTaskTable, { rows, kind: "same_day" }))
  assert.doesNotMatch(html, />CREATION \/ START \/ DUE<\/th>|CREATION:|START:|DUE:/)
  assert.match(html, />ARSYEJA<\/th>/)
  assert.match(html, />KOMENTI<\/th>/)
  assert.ok(html.indexOf("Active title</div>") < html.indexOf("Todo title</div>"))
  assert.doesNotMatch(html, /Done title/)
  const empty = renderToStaticMarkup(React.createElement(ReportingTaskTable, { rows: [rows[0]], kind: "same_day" }))
  assert.match(empty, /Asnjë detyrë për këtë pikë/)
  assert.doesNotMatch(empty, /<table/)
})

test("manual questions are stacked and the header matches the M3 workspace structure", () => {
  const html = render()
  assert.doesNotMatch(html, /md:grid-cols-2/)
  auth.user = { role: "MANAGER", full_name: "Test Manager" }
  const page = renderToStaticMarkup(React.createElement(Page))
  assert.match(page, /Rifresko/)
  assert.match(page, /Gjenero raportin/)
  assert.match(page, /Titulli i email-it/)
  assert.match(page, /role="tab"/)
  assert.match(page, /Raporti/)
  assert.match(page, /Historiku/)
  assert.match(page, /aria-pressed="false"[^>]*>GA<\/button>/)
  assert.match(page, /bg-violet-100 text-violet-900/)
})

test("manual draft survives a reload, stays scoped to user and day, and protects newer edits", () => {
  const { readManualDraft, writeManualDraft, clearSavedManualDraft } = load("@/lib/m3-reporting-points-draft")
  const values = new Map()
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
  writeManualDraft(storage, "user", "2026-10-05", { underload: "Përgjigje me\nrreshta" })
  assert.equal(readManualDraft(storage, "user", "2026-10-05").underload, "Përgjigje me\nrreshta")
  assert.equal(readManualDraft(storage, "other-user", "2026-10-05"), null)
  assert.equal(readManualDraft(storage, "user", "2026-10-06"), null)
  writeManualDraft(storage, "user", "2026-10-05", { underload: "Teksti më i ri" })
  clearSavedManualDraft(storage, "user", "2026-10-05", { underload: "Përgjigje me\nrreshta" })
  assert.equal(readManualDraft(storage, "user", "2026-10-05").underload, "Teksti më i ri")
  clearSavedManualDraft(storage, "user", "2026-10-05", { underload: "Teksti më i ri" })
  assert.equal(readManualDraft(storage, "user", "2026-10-05"), null)
  assert.equal(readManualDraft(null, "user", "2026-10-05"), null)
})

test("only the task title is rendered even for an older multiline saved report", () => {
  const html = render({ data: { untouched: [{ ...row, title: "[[added]]DT: Titulli due 16:00[[/added]]\n1. Pershkrimi i plote\n2. Hapi tjeter" }] } })
  assert.match(html, /DT: Titulli/)
  assert.doesNotMatch(html, /Pershkrimi i plote|Hapi tjeter|\[\[added\]\]|due 16:00/)
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

test("staff can open the report and generate it while management actions remain restricted", () => {
  auth.user = { role: "STAFF", full_name: "Test User" }
  const html = renderToStaticMarkup(React.createElement(Page))
  assert.match(html, /Gjenero raportin/)
  assert.match(html, /Historiku/)
  assert.doesNotMatch(html, /Hyr në platformë|Ruaj përgjigjet/)
  assert.doesNotMatch(html, /<button[^>]*>[^<]*Dërgo<\/button>/)
})

test("report managers retain manual answers and send controls", () => {
  auth.user = { role: "MANAGER", full_name: "Test Manager" }
  const html = renderToStaticMarkup(React.createElement(Page))
  assert.match(html, /Gjenero raportin/)
  assert.match(html, /Ruaj përgjigjet/)
  assert.match(html, /Dërgo<\/button>/)
})

// Exercise the page's save effects and user events without browser dependencies.
function mountPage(storage, apiFetch) {
  const state = [], callbacks = [], effects = [], pending = [], timers = new Map()
  let cursor = 0, effectCursor = 0, callbackCursor = 0, timerId = 0, changed = true, tree
  const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  const hooks = { ...React,
    useState(initial) {
      const index = cursor++
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial
      return [state[index], (value) => {
        const next = typeof value === "function" ? value(state[index]) : value
        if (!Object.is(next, state[index])) { state[index] = next; changed = true }
      }]
    },
    useCallback(callback, deps) {
      const index = callbackCursor++
      if (!same(callbacks[index]?.deps, deps)) callbacks[index] = { callback, deps }
      return callbacks[index].callback
    },
    useEffect(effect, deps) {
      const index = effectCursor++
      if (!same(effects[index]?.deps, deps)) {
        effects[index]?.cleanup?.()
        effects[index] = { deps }
        pending.push(() => { effects[index].cleanup = effect() })
      }
    },
  }
  const source = readFileSync(path.join(src, "app", "(app)", "m3-reporting-points", "page.tsx"), "utf8")
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const pageModule = { exports: {} }
  vm.runInNewContext(compiled, {
    module: pageModule, exports: pageModule.exports,
    require: (name) => name === "react" ? hooks : name === "@/lib/auth" ? { useAuth: () => ({ user: { id: "manager", role: "MANAGER" }, loading: false, apiFetch }) } : load(name),
    window: { localStorage: storage,
      setTimeout: (callback) => { const id = ++timerId; timers.set(id, callback); return id },
      clearTimeout: (id) => timers.delete(id), setInterval: () => -1, clearInterval: () => {},
    },
  })
  const findView = (node) => {
    if (!node || typeof node !== "object") return null
    if (node.type === M3ReportingPointsView) return node
    for (const child of React.Children.toArray(node.props?.children)) {
      const found = findView(child)
      if (found) return found
    }
    return null
  }
  return {
    async flush() {
      for (let round = 0; round < 20; round++) {
        if (changed) { changed = false; cursor = 0; effectCursor = 0; callbackCursor = 0; tree = pageModule.exports.default() }
        while (pending.length) pending.shift()()
        await Promise.resolve()
      }
    },
    edit(key, value) { findView(tree).props.onAnswerChange(key, value) },
    answers() { return findView(tree).props.answers },
    fireSave() {
      assert.equal(timers.size, 1)
      const [id, callback] = timers.entries().next().value
      timers.delete(id)
      return callback()
    },
    unmount() { for (const effect of effects) effect?.cleanup?.() },
  }
}

test("answers survive immediate reload and automatically persist without pressing Save", async () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tirane", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
  let server = { ...report, report_date: day, subject: "Report", generated_at: new Date().toISOString() }
  const api = async (url, options) => {
    if (options?.method === "PUT") server = { ...server, manual_answers: JSON.parse(options.body).manual_answers }
    return { ok: true, status: 200, json: async () => url.endsWith("/recipients") ? { recipients: { to: [], cc: [], bcc: [] } } : { ...server } }
  }
  const first = mountPage(storage, api)
  await first.flush()
  first.edit("underload", "Përgjigje që duhet të mbetet")
  await first.flush()
  first.unmount() // Refresh before the debounce fires.
  const reloaded = mountPage(storage, api)
  await reloaded.flush()
  assert.equal(reloaded.answers().underload, "Përgjigje që duhet të mbetet")
  await reloaded.fireSave()
  await reloaded.flush()
  assert.equal(server.manual_answers.underload, "Përgjigje që duhet të mbetet")
  assert.equal(values.size, 0)
  reloaded.unmount()
})

test("typing during a slow automatic save is kept and saved after the first request", async () => {
  const storageValues = new Map()
  const storage = { getItem: (key) => storageValues.get(key), setItem: (key, value) => storageValues.set(key, value), removeItem: (key) => storageValues.delete(key) }
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tirane", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
  let server = { ...report, report_date: day }, resolveFirst
  const saved = []
  const api = async (url, options) => {
    if (options?.method === "PUT") {
      const answers = JSON.parse(options.body).manual_answers
      saved.push(answers.underload)
      if (saved.length === 1) await new Promise((resolve) => { resolveFirst = resolve })
      server = { ...server, manual_answers: answers }
    }
    return { ok: true, status: 200, json: async () => url.endsWith("/recipients") ? { recipients: { to: [], cc: [], bcc: [] } } : { ...server } }
  }
  const page = mountPage(storage, api)
  await page.flush()
  page.edit("underload", "Teksti fillestar")
  await page.flush()
  const firstSave = page.fireSave()
  await page.flush()
  page.edit("underload", "Teksti më i ri")
  await page.flush()
  resolveFirst()
  await firstSave
  await page.flush()
  assert.equal(page.answers().underload, "Teksti më i ri")
  await page.fireSave()
  await page.flush()
  assert.deepEqual(saved, ["Teksti fillestar", "Teksti më i ri"])
  assert.equal(server.manual_answers.underload, "Teksti më i ri")
  page.unmount()
})

test("a failed automatic save preserves the entered answers and the reload draft", async () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tirane", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
  const api = async (url, options) => options?.method === "PUT"
    ? { ok: false, status: 503, json: async () => ({ detail: "Ruajtja dështoi" }) }
    : { ok: true, status: 200, json: async () => url.endsWith("/recipients") ? { recipients: { to: [], cc: [], bcc: [] } } : { ...report, report_date: day } }
  const page = mountPage(storage, api)
  await page.flush()
  page.edit("underload", "Mos e humb përgjigjen")
  await page.flush()
  await page.fireSave()
  await page.flush()
  assert.equal(page.answers().underload, "Mos e humb përgjigjen")
  page.unmount()
  const reloaded = mountPage(storage, api)
  await reloaded.flush()
  assert.equal(reloaded.answers().underload, "Mos e humb përgjigjen")
  reloaded.unmount()
})
