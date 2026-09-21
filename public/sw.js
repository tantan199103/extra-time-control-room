const CACHE_NAME = 'extra-time-shell-v5'
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('extra-time-shell-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin') || url.pathname.startsWith('/account') || url.pathname === '/checkout' || url.pathname === '/track-order' || url.pathname.startsWith('/order/')) return
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')))
    return
  }
  if (!['script','style','font','image','manifest'].includes(event.request.destination)) return
  if (event.request.destination === 'script') {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {})
        }
        return response
      }).catch(() => caches.match(event.request))
    )
    return
  }
  event.respondWith(caches.match(event.request).then(cached => {
    const network = fetch(event.request).then(response => {
      if (response.ok && response.type === 'basic') caches.open(CACHE_NAME).then(cache => cache.put(event.request,response.clone())).catch(() => {})
      return response
    })
    return cached || network
  }))
})
