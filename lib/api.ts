async function getToken(): Promise<string | null> {
  const { auth } = await import('./firebase')
  const user = auth.currentUser
  if (!user) return null
  return user.getIdToken()
}

async function request(path: string, options: RequestInit = {}) {
  const token = await getToken()
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed: ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

// ── GET cache ──────────────────────────────────────────────────────────────────
// Firestore is billed per document read, and each page re-reads whole
// collections (segments, BOQ, invoices…). To stay within the free quota we
// cache GET responses per tab (sessionStorage) for a short TTL, so navigating
// between pages and reloading reuse data instead of hitting Firestore again.
// Any write (POST/PATCH/DELETE) flushes the cache so reads stay correct.
const CACHE_TTL    = 120_000          // 2 minutes
const CACHE_PREFIX = 'pmb:cache:'

function readCache(path: string): unknown | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + path)
    if (!raw) return undefined
    const { t, data } = JSON.parse(raw)
    if (Date.now() - t > CACHE_TTL) { sessionStorage.removeItem(CACHE_PREFIX + path); return undefined }
    return data
  } catch { return undefined }
}

function writeCache(path: string, data: unknown) {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(CACHE_PREFIX + path, JSON.stringify({ t: Date.now(), data })) }
  catch { /* quota/full — ignore, just skip caching */ }
}

function clearCache() {
  if (typeof window === 'undefined') return
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(k)
    }
  } catch { /* ignore */ }
}

export const api = {
  // Cached GET. Pass { fresh: true } to bypass the cache for one call.
  get: async (path: string, opts?: { fresh?: boolean }) => {
    if (!opts?.fresh) {
      const cached = readCache(path)
      if (cached !== undefined) return cached
    }
    const data = await request(path)
    writeCache(path, data)
    return data
  },
  post: async (path: string, body: unknown) => {
    const r = await request(path, { method: 'POST', body: JSON.stringify(body) })
    clearCache()
    return r
  },
  patch: async (path: string, body: unknown) => {
    const r = await request(path, { method: 'PATCH', body: JSON.stringify(body) })
    clearCache()
    return r
  },
  delete: async (path: string) => {
    const r = await request(path, { method: 'DELETE' })
    clearCache()
    return r
  },
  /** Return cached data for a path without making a network call (undefined if
   *  not cached or expired). Lets a page reuse data another page already read. */
  peekCache: (path: string) => readCache(path),
  /** Manually flush the cache (e.g. a pull-to-refresh). */
  clearCache,
}
