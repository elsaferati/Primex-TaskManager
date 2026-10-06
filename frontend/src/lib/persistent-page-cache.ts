// Last loaded page data kept on the device (IndexedDB), so a page can paint at
// once on the next visit while fresh data is fetched behind it. Every helper
// fails soft: blocked or full storage simply means loading from the network.

const DB_NAME = "primeflow-page-cache"
const STORE = "entries"
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

type Entry = { value: unknown; savedAt: number }

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof window === "undefined" || !window.indexedDB) return resolve(null)
      const request = window.indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function readPersistentPageCache<T>(key: string): Promise<T | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key)
      request.onsuccess = () => {
        const entry = request.result as Entry | undefined
        resolve(entry && Date.now() - entry.savedAt < MAX_AGE_MS ? (entry.value as T) : null)
      }
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    } finally {
      db.close()
    }
  })
}

export async function writePersistentPageCache(key: string, value: unknown) {
  const db = await openDb()
  if (!db) return
  try {
    const store = db.transaction(STORE, "readwrite").objectStore(STORE)
    const now = Date.now()
    // Drop entries for days nobody reopened so storage cannot keep growing.
    const sweep = store.openCursor()
    sweep.onsuccess = () => {
      const cursor = sweep.result
      if (!cursor) return
      const entry = cursor.value as Entry | undefined
      if (!entry || now - entry.savedAt >= MAX_AGE_MS) cursor.delete()
      cursor.continue()
    }
    store.put({ value, savedAt: now } satisfies Entry, key)
  } catch {
    // Storage full or blocked.
  } finally {
    db.close()
  }
}

export async function clearPersistentPageCache() {
  const db = await openDb()
  if (!db) return
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).clear()
  } catch {
    // Storage blocked.
  } finally {
    db.close()
  }
}
