/* global self, caches, fetch, Response, URL */

const CACHE_NAME = 'indkobsvogn-cache-v4'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.svg', '/icons/icon-512.svg']

function isNetworkFirstRequest(request, url) {
  return request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname === '/manifest.webmanifest'
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (isNetworkFirstRequest(request, url)) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const cloned = networkResponse.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned))
          }

          return networkResponse
        })
        .catch(() =>
          caches.match(request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse

            return caches.match('/index.html')
          }),
        ),
    )

    return
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse

      return fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const cloned = networkResponse.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned))
          }

          return networkResponse
        })
        .catch(() => {
          if (request.mode === 'navigate') {
            return caches.match('/index.html')
          }

          return new Response('Offline', { status: 503, statusText: 'Offline' })
        })
    }),
  )
})
