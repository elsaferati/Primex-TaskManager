import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import vm from "node:vm"
import ts from "typescript"

const testDir = path.dirname(fileURLToPath(import.meta.url))

function load(file, dependencies, globals = {}) {
  const loadedModule = { exports: {} }
  const source = readFileSync(path.join(testDir, "..", file), "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  vm.runInNewContext(outputText, {
    module: loadedModule, exports: loadedModule.exports, require: (name) => dependencies[name],
    Request, Response, Headers, FormData, Blob, Buffer, AbortSignal, Error,
    ...globals,
  })
  return loadedModule.exports
}

function proxy(fetch) {
  return load("src/app/api/speech/transcribe/route.ts", {
    "@/lib/config": { API_HTTP_URL: "https://backend.example/api" },
  }, { fetch }).POST
}

function upload(headers = {}) {
  const body = new FormData()
  body.append("file", new Blob(["mp4-audio"], { type: "audio/mp4" }), "dictation.mp4")
  body.append("language", "sq")
  return new Request("https://app.example/api/speech/transcribe", {
    method: "POST", headers: { authorization: "Bearer test-token", ...headers }, body,
  })
}

test("speech proxy preserves the multipart audio, language and bearer authentication", async () => {
  const request = upload()
  const original = Buffer.from(await request.clone().arrayBuffer())
  const post = proxy(async (url, init) => {
    assert.equal(url, "https://backend.example/api/speech/transcribe")
    assert.equal(init.headers.authorization, "Bearer test-token")
    assert.equal(init.headers["content-type"], request.headers.get("content-type"))
    assert.deepEqual(init.body, original)
    assert.equal(init.redirect, "error")
    const forwarded = new Request(url, { method: "POST", headers: init.headers, body: init.body })
    const form = await forwarded.formData()
    assert.equal(form.get("file").name, "dictation.mp4")
    assert.equal(form.get("file").type, "audio/mp4")
    assert.equal(form.get("language"), "sq")
    return Response.json({ text: "Shënim nga telefoni" })
  })
  const response = await post(request)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { text: "Shënim nga telefoni" })
  assert.equal(response.headers.get("cache-control"), "no-store")
})

test("speech proxy preserves expired sessions and speech-service configuration errors", async () => {
  for (const status of [401, 503]) {
    const response = await proxy(async () => Response.json({ detail: "service error" }, { status }))(upload())
    assert.equal(response.status, status)
    assert.equal((await response.json()).detail, "service error")
  }
})

test("speech proxy returns readable errors for connection failures, timeouts and HTML gateway errors", async () => {
  const timeout = new Error("timed out")
  timeout.name = "TimeoutError"
  for (const [fetch, status] of [
    [async () => { throw new TypeError("fetch failed") }, 502],
    [async () => { throw timeout }, 504],
    [async () => new Response("<html>gateway error</html>", { status: 502 }), 502],
  ]) {
    const response = await proxy(fetch)(upload())
    assert.equal(response.status, status)
    assert.equal(typeof (await response.json()).detail, "string")
  }
})

test("speech proxy rejects unauthenticated, invalid and oversized requests without forwarding", async () => {
  const post = proxy(async () => { assert.fail("invalid upload forwarded") })
  const unauthenticated = upload()
  unauthenticated.headers.delete("authorization")
  assert.equal((await post(unauthenticated)).status, 401)
  assert.equal((await post(new Request("https://app.example", {
    method: "POST", headers: { authorization: "Bearer token" }, body: "invalid",
  }))).status, 400)
  assert.equal((await post(upload({ "content-length": String(22 * 1024 * 1024) }))).status, 413)
  // Also enforce the actual size when Content-Length is absent.
  assert.equal((await post(new Request("https://app.example", {
    method: "POST",
    headers: { authorization: "Bearer token", "content-type": "multipart/form-data; boundary=test" },
    body: new Uint8Array(21 * 1024 * 1024 + 1),
  }))).status, 413)
})

// Model the recorder and hook state to exercise mobile lifecycle failures
// without a microphone or paid transcription requests.
function dictation({ apiFetch, mimeType = "audio/mp4", chunkType = mimeType, empty = false } = {}) {
  const slots = []
  const cleanups = []
  const errors = []
  const texts = []
  let cursor = 0
  let firstRender = true
  let trackStopped = false
  const react = {
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = initial
      return [slots[i], (value) => { slots[i] = value }]
    },
    useRef(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = { current: initial }
      return slots[i]
    },
    useCallback(fn) { return fn },
    useEffect(fn) { if (firstRender) cleanups.push(fn()) },
  }
  class Recorder {
    static isTypeSupported() { return false } // Browser chooses MP4 itself.
    constructor() { Recorder.instance = this; this.mimeType = mimeType; this.state = "inactive" }
    start() { this.state = "recording" }
    stop() {
      this.state = "inactive"
      this.ondataavailable?.({ data: new Blob(empty ? [] : ["audio"], { type: chunkType }) })
      this.finished = this.onstop?.()
    }
  }
  const { useCloudDictation: runHook } = load("src/lib/useCloudDictation.ts", {
    react, sonner: { toast: { error: (message) => errors.push(message) } },
  }, {
    window: { location: { origin: "https://app.example" } },
    navigator: { mediaDevices: { getUserMedia: async () => ({
      getTracks: () => [{ stop: () => { trackStopped = true } }],
    }) } },
    MediaRecorder: Recorder,
  })
  const options = { apiFetch, lang: "sq", onFinalText: (text) => texts.push(text) }
  return {
    errors, texts,
    render() { cursor = 0; const hook = runHook(options); firstRender = false; return hook },
    finish() { return Recorder.instance.finished },
    unmount() { cleanups.forEach((fn) => fn?.()) },
    trackStopped() { return trackStopped },
  }
}

test("Safari default MP4 is uploaded with the correct filename via the app origin", async () => {
  for (const mimeType of ["audio/mp4;codecs=mp4a.40.2", ""]) {
    const h = dictation({ mimeType, chunkType: "audio/mp4", apiFetch: async (url, init) => {
      assert.equal(url, "https://app.example/api/speech/transcribe")
      assert.equal(init.body.get("file").name, "dictation.mp4")
      assert.match(init.body.get("file").type, /^audio\/mp4/)
      assert.equal(init.body.get("language"), "sq")
      return Response.json({ text: "Përshëndetje" })
    } })
    await h.render().start()
    h.render().stop()
    await h.finish()
    assert.deepEqual(h.texts, ["Përshëndetje"])
    assert.deepEqual(h.errors, [])
    assert.equal(h.render().isTranscribing, false)
    assert.equal(h.trackStopped(), true)
  }
})

test("a failed audio request resets Voice so the next recording can succeed", async () => {
  let calls = 0
  const h = dictation({ apiFetch: async () => {
    if (++calls === 1) throw new TypeError("network failure")
    return Response.json({ text: "retry succeeded" })
  } })
  await h.render().start()
  h.render().stop()
  await h.finish()
  assert.equal(h.render().isTranscribing, false)
  assert.equal(h.errors.length, 1)
  await h.render().start()
  h.render().stop()
  await h.finish()
  assert.deepEqual(h.texts, ["retry succeeded"])
})

test("network errors do not produce a duplicate transcription-failed toast", async () => {
  const h = dictation({ apiFetch: async () => new Response(null, { status: 503, statusText: "Network error" }) })
  await h.render().start()
  h.render().stop()
  await h.finish()
  assert.deepEqual(h.errors, [])
  assert.equal(h.render().isTranscribing, false)
})

test("empty recordings and closing Notes do not upload audio", async () => {
  const apiFetch = async () => { assert.fail("unexpected audio upload") }
  const empty = dictation({ empty: true, apiFetch })
  await empty.render().start()
  empty.render().stop()
  await empty.finish()
  assert.match(empty.errors[0], /No audio recorded/)
  const closed = dictation({ apiFetch })
  await closed.render().start()
  closed.unmount()
  await closed.finish()
  assert.equal(closed.trackStopped(), true)
})
