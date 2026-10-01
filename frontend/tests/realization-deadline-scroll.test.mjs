import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import vm from "node:vm"
import { test } from "node:test"
import ts from "typescript"

const require = createRequire(import.meta.url)
const source = readFileSync(new URL("../src/components/realization-deadline-tasks.tsx", import.meta.url), "utf8")
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  },
})

// Exercise the component's actual capture listeners with an open panel.
function openPopover() {
  class Node {
    constructor(parent = null) { this.parent = parent }
    contains(target) {
      for (let node = target; node; node = node.parent) if (node === this) return true
      return false
    }
  }
  const panel = new Node(), list = new Node(panel), page = new Node()
  const changes = [], effects = [], listeners = new Map()
  const eventTarget = (name) => ({
    addEventListener(type, callback, capture = false) {
      listeners.set(`${name}:${type}`, { callback, capture })
    },
    removeEventListener(type, callback, capture = false) {
      const key = `${name}:${type}`, registered = listeners.get(key)
      assert.equal(registered.callback, callback)
      assert.equal(registered.capture, capture)
      listeners.delete(key)
    },
  })
  const refs = [{ current: new Node() }, { current: panel }]
  const loadedModule = { exports: {} }
  vm.runInNewContext(outputText, {
    module: loadedModule, exports: loadedModule.exports, Node,
    window: eventTarget("window"), document: eventTarget("document"),
    require(name) {
      if (name === "react") return {
        useState: () => [{ top: 0, left: 0 }, (value) => changes.push(value)],
        useRef: () => refs.shift(), useEffect: (effect) => effects.push(effect),
      }
      if (name === "react-dom") return { createPortal: (element) => element }
      if (name === "@/lib/note-markup") return { getPlainMarkedText: (title) => title }
      if (name === "@/lib/utils") return { cn: (...values) => values.filter(Boolean).join(" ") }
      return require(name)
    },
  })
  loadedModule.exports.RealizationDeadlineTasksPopover({
    tasks: [{ task_id: "task", title: "Deadline", state: "NO_PROGRESS", critical: false }],
    title: "Afatet", children: "1/2",
  })
  const cleanup = effects[0]()
  const scroll = (target) => listeners.get("window:scroll").callback({ target })
  return { panel, list, page, changes, listeners, scroll, cleanup }
}

test("scrolling the deadline list or panel keeps the popover open", () => {
  const popover = openPopover()
  assert.equal(popover.listeners.get("window:scroll").capture, true)
  popover.scroll(popover.list)
  popover.scroll(popover.panel)
  assert.deepEqual(popover.changes, [])
  popover.cleanup()
})

test("scrolling the page or table still closes the popover", () => {
  const popover = openPopover()
  popover.scroll(popover.page)
  assert.deepEqual(popover.changes, [null])
  popover.cleanup()
  assert.equal(popover.listeners.size, 0)
})

test("window scroll and resize close the popover", () => {
  const popover = openPopover()
  popover.scroll({})
  popover.listeners.get("window:resize").callback()
  assert.deepEqual(popover.changes, [null, null])
  popover.cleanup()
})
