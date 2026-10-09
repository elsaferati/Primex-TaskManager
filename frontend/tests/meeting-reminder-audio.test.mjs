import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

function harness({ supported = true, blocked = false } = {}) {
  const contexts = [], tones = [], intervals = new Map(), listeners = new Map()
  let nextTimer = 0
  class Context {
    state = "suspended"
    currentTime = 10
    destination = {}
    resumeCalls = 0
    constructor() { contexts.push(this) }
    async resume() { this.resumeCalls++; if (blocked) throw Error("Audio blocked"); this.state = "running" }
    createOscillator() {
      const tone = { starts: 0, stops: [], disconnected: false, frequency: { setValueAtTime() {} }, connect() {}, addEventListener() {}, start() { this.starts++ }, stop(at) { this.stops.push(at) }, disconnect() { this.disconnected = true } }
      tones.push(tone)
      return tone
    }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} } }
  }
  const window = {
    ...(supported ? { AudioContext: Context } : {}),
    setInterval(fn, delay) { const id = ++nextTimer; intervals.set(id, { fn, delay }); return id },
    clearInterval(id) { intervals.delete(id) },
    addEventListener(type, fn) { listeners.set(type, fn) },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type) },
  }
  const loadedModule = { exports: {} }
  const source = readFileSync(new URL("../src/lib/meeting-reminder-audio.ts", import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  vm.runInNewContext(outputText, { module: loadedModule, exports: loadedModule.exports, window })
  return { audio: loadedModule.exports, contexts, tones, intervals, listeners }
}

test("a suspended browser cannot silently pretend the alarm played", () => {
  const h = harness()
  assert.equal(h.audio.playMeetingReminderSound(), false)
  assert.equal(h.tones.length, 0)
})

test("a gesture unlocks one reusable context for later automatic reminders", async () => {
  const h = harness()
  assert.equal(await h.audio.unlockMeetingReminderAudio(), true)
  assert.equal(h.audio.playMeetingReminderSound(), true)
  assert.equal(h.audio.playMeetingReminderSound(), true)
  assert.equal(h.contexts.length, 1)
  assert.equal(h.tones.length, 2)
  assert.equal(h.contexts[0].resumeCalls, 1)
})

test("alarms repeat every two seconds and stop silences the current tone", async () => {
  const h = harness()
  await h.audio.unlockMeetingReminderAudio()
  h.audio.startMeetingReminderAlarm()
  const timer = [...h.intervals.values()][0]
  assert.equal(timer.delay, 2000)
  timer.fn()
  assert.equal(h.tones.length, 2)
  h.audio.stopMeetingReminderAlarm()
  assert.equal(h.intervals.size, 0)
  assert.ok(h.tones.every(t => t.stops.includes(undefined) && t.disconnected))
})

test("a reminder received before interaction starts sounding after the gesture", async () => {
  const h = harness()
  const cleanup = h.audio.listenForMeetingAudioUnlock()
  h.audio.startMeetingReminderAlarm()
  assert.equal(h.tones.length, 0)
  h.listeners.get("pointerdown")()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.tones.length, 1)
  cleanup()
  assert.equal(h.listeners.size, 0)
  h.audio.stopMeetingReminderAlarm()
})

test("ordinary keyboard interaction primes audio without making noise", async () => {
  const h = harness()
  const cleanup = h.audio.listenForMeetingAudioUnlock()
  h.listeners.get("keydown")()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.contexts[0].state, "running")
  assert.equal(h.tones.length, 0)
  cleanup()
})

test("stopping during audio resume does not restart the alarm", async () => {
  const h = harness()
  h.audio.listenForMeetingAudioUnlock()
  h.audio.startMeetingReminderAlarm()
  h.listeners.get("pointerdown")()
  h.audio.stopMeetingReminderAlarm()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.tones.length, 0)
  assert.equal(h.intervals.size, 0)
})

test("unsupported or rejected audio remains an explicit failure", async () => {
  for (const options of [{ supported: false }, { blocked: true }]) {
    const h = harness(options)
    assert.equal(await h.audio.unlockMeetingReminderAudio(), false)
    assert.equal(h.audio.playMeetingReminderSound(), false)
  }
})
