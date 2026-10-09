import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const source = readFileSync(new URL("../src/app/(app)/next-week-plan/page.tsx", import.meta.url), "utf8")
const tree = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = new Set(["pad2", "toISODate", "getMonday", "addDays", "dateRangeKey", "ONE_H_REPORT_SLOT_OPTIONS", "ONE_H_REPORT_SLOTS_BY_PERIOD", "taskSelectedDateRange", "taskSelectedWeekStartISOs", "taskPvByAssigneeId"])
const snippets = []
function collect(node) {
  if (ts.isVariableDeclaration(node) && names.has(node.name.getText(tree))) {
    const initializer = node.initializer
    const value = ts.isCallExpression(initializer) && initializer.expression.getText(tree) === "React.useMemo"
      ? "(" + initializer.arguments[0].getText(tree) + ")()" : initializer.getText(tree)
    snippets.push("const " + node.name.getText(tree) + " = " + value)
  }
  ts.forEachChild(node, collect)
}
collect(tree)
function evaluate({ start = "", due = "", leave = [], users = [{ id: "a" }, { id: "b" }] } = {}) {
  const code = snippets.join(";\n") + "; result = { range: taskSelectedDateRange, weeks: taskSelectedWeekStartISOs, pv: taskPvByAssigneeId, slots: ONE_H_REPORT_SLOTS_BY_PERIOD }"
  const context = { taskStartDate: start, taskDueDate: due, taskDateLeaveItems: leave, taskAssigneeOptions: users }
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return context.result
}

test("PV covers every week between start and deadline, even when dates are reversed", () => {
  const result = evaluate({ start: "2026-10-16", due: "2026-10-09", leave: [{ fullDay: true, userId: "a", startDate: "2026-10-12", endDate: "2026-10-13" }] })
  assert.deepEqual(Array.from(result.weeks), ["2026-10-05", "2026-10-12"])
  assert.equal(result.pv.get("a").endDate, "2026-10-13")
  assert.equal(result.pv.has("b"), false)
})

test("PV includes boundary days and excludes partial-day or nonoverlapping leave", () => {
  const result = evaluate({ due: "2026-10-09", leave: [
    { fullDay: true, userId: "a", startDate: "2026-10-01", endDate: "2026-10-09" },
    { fullDay: false, userId: "b", startDate: "2026-10-09", endDate: "2026-10-10" },
    { fullDay: true, userId: "b", startDate: "2026-10-10", endDate: "2026-10-12" },
  ] })
  assert.deepEqual(Array.from(result.pv.keys()), ["a"])
})

test("all-user PV applies to every assignee and retains the latest leave end", () => {
  const result = evaluate({ start: "2026-10-09", leave: [
    { fullDay: true, isAllUsers: true, startDate: "2026-10-09", endDate: "2026-10-10" },
    { fullDay: true, userId: "a", startDate: "2026-10-09", endDate: "2026-10-16" },
  ] })
  assert.equal(result.pv.get("a").endDate, "2026-10-16")
  assert.equal(result.pv.get("b").endDate, "2026-10-10")
})

test("no dates produce no PV query and 1H slots stay grouped by AM and PM", () => {
  const result = evaluate()
  assert.equal(result.weeks, null)
  assert.equal(result.pv.size, 0)
  assert.deepEqual(Array.from(result.slots.AM), ["10:00", "11:00", "11:50"])
  assert.deepEqual(Array.from(result.slots.PM), ["14:20", "16:00"])
})
