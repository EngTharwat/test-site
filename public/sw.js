// PMBoards service worker — minimal, safe (network-first, offline fallback).
// Bump CACHE to invalidate old caches on deploy.
const CACHE = 'pmboards-v2'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  // Page navigations: network-first, fall back to the last-cached page or '/'.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        const cache = await caches.open(CACHE)
        cache.put(req, res.clone())
        return res
      } catch {
        return (await caches.match(req)) || (await caches.match('/')) ||
          new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
      }
    })())
  }
})
