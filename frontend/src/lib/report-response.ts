/** Report endpoints may return empty bodies when a proxy or backend fails. */
export async function reportResponseJson<T>(response: Response): Promise<T> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    if (response.ok) {
      throw new Error("Serveri ktheu një përgjigje të pavlefshme. Provo përsëri.")
    }
  }
  if (!response.ok) {
    const detail = body && typeof body === "object" && "detail" in body ? body.detail : null
    if (typeof detail === "string") throw new Error(detail)
    if (response.status === 401) throw new Error("Sesioni ka skaduar. Hyr përsëri.")
    if (response.status === 403) throw new Error("Nuk ke leje për këtë veprim.")
    throw new Error(`Serveri nuk mund ta përpunojë raportin (HTTP ${response.status}). Provo përsëri.`)
  }
  if (body === null || body === undefined) {
    throw new Error("Serveri ktheu një përgjigje të pavlefshme. Provo përsëri.")
  }
  return body as T
}
