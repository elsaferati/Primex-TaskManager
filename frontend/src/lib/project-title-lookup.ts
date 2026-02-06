export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

export async function fetchProjectTitlesById(
  apiFetch: ApiFetch,
  ids: string[]
): Promise<Array<{ id: string; title: string }>> {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)))
  if (!uniqueIds.length) return []

  const out: Array<{ id: string; title: string }> = []

  for (const batch of chunk(uniqueIds, 50)) {
    const found = new Map<string, string>()

    const qs = new URLSearchParams()
    for (const id of batch) qs.append("ids", id)

    // Prefer the batched lookup endpoint, but still fall back for any missing IDs.
    const lookupRes = await apiFetch(`/projects/lookup?${qs.toString()}`)
    if (lookupRes.ok) {
      const data = (await lookupRes.json()) as Array<{ id: string; title: string }>
      for (const item of data) {
        if (item?.id && item?.title) found.set(item.id, item.title)
      }
    }

    const missing = batch.filter((id) => !found.has(id))
    if (missing.length) {
      const fallbackResults = await Promise.all(
        missing.map(async (id) => {
          const res = await apiFetch(`/projects/${encodeURIComponent(id)}`)
          if (!res.ok) return null
          const data = (await res.json()) as { id?: string; title?: string | null; name?: string | null }
          const title = data.title || data.name
          if (!data.id || !title) return null
          return { id: data.id, title }
        })
      )
      for (const item of fallbackResults) {
        if (item?.id && item?.title) found.set(item.id, item.title)
      }
    }

    for (const [id, title] of found.entries()) {
      out.push({ id, title })
    }
  }

  return out
}
