type CacheEntry<T> = {
  value: T
  expiresAt: number
}

const DEFAULT_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, CacheEntry<unknown>>()

export function getDepartmentBootstrapCache<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.value as T
}

export function setDepartmentBootstrapCache<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
}
