import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import vm from "node:vm"
import ts from "typescript"

const source = readFileSync(new URL("../src/lib/weekly-realization-percent.ts", import.meta.url), "utf8")
const loaded = { exports: {} }
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
vm.runInNewContext(outputText, { module: loaded, exports: loaded.exports })
const { weeklyRealizationPercent } = loaded.exports

test("weekly completion credit is capped before the postponed-plan penalty", () => {
  for (const [plan, completed, extra, postponed, expected] of [
    [5, 5, 2, 2, 90], [5, 5, 1, 1, 95], [5, 7, 2, 0, 100],
    [10, 8, 2, 2, 75], [10, 13, 5, 2, 95], [100, 23, 0, 0, 23],
    [5, 0, 0, 5, 0], [3, 2, 0, 1, 58.3],
    [0, 1, 4, 0, 25], [0, 4, 4, 0, 100], [0, 0, 0, 0, 0],
  ]) assert.equal(weeklyRealizationPercent(plan, completed, extra, postponed * 25), expected)
})
