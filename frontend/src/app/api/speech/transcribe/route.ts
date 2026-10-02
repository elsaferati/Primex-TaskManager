import { API_HTTP_URL } from "@/lib/config"

export const runtime = "nodejs"

const MAX_UPLOAD_BYTES = 21 * 1024 * 1024 // Audio limit plus multipart headers.

// Keep mobile audio uploads on the app's origin. Authentication is still
// checked by the backend; this route only forwards to the fixed speech URL.
export async function POST(request: Request): Promise<Response> {
  const authorization = request.headers.get("authorization")
  if (!authorization) {
    return Response.json({ detail: "Not authenticated" }, { status: 401 })
  }
  const contentType = request.headers.get("content-type") || ""
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    return Response.json({ detail: "Expected an audio upload" }, { status: 400 })
  }
  if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES) {
    return Response.json({ detail: "Audio too large. Max 20MB." }, { status: 413 })
  }

  try {
    const chunks: Uint8Array[] = []
    let size = 0
    const reader = request.body?.getReader()
    if (!reader) {
      return Response.json({ detail: "Empty audio upload" }, { status: 400 })
    }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_UPLOAD_BYTES) {
        await reader.cancel()
        return Response.json({ detail: "Audio too large. Max 20MB." }, { status: 413 })
      }
      chunks.push(value)
    }

    const upstream = await fetch(`${API_HTTP_URL}/speech/transcribe`, {
      method: "POST",
      headers: { authorization, "content-type": contentType },
      body: Buffer.concat(chunks),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(65_000)]),
    })
    // Proxy errors can be HTML. Return JSON so mobile users see an actionable
    // error rather than an unexplained "Transcription failed".
    const responseType = upstream.headers.get("content-type") || ""
    if (!responseType.includes("application/json")) {
      return Response.json(
        { detail: "The speech server did not respond correctly. Please try again." },
        { status: 502 },
      )
    }
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError"
    return Response.json(
      { detail: timedOut
        ? "Transcription took too long. Please try a shorter recording."
        : "Unable to reach the speech server. Please try again." },
      { status: timedOut ? 504 : 502 },
    )
  }
}
