const CACHE_NAME = 'greenplanet-v3';
const PRECACHE_URLS = [
  '/',
  '/plant-ai/',
  '/favicon.svg',
  '/manifest.json',
];

// Install: precache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for everything, cache as offline fallback only
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip API calls, Netlify functions, and video files entirely
  if (url.pathname.startsWith('/.netlify/') || url.pathname.startsWith('/api/') ||
      request.destination === 'video' || url.pathname.endsWith('.mp4')) {
    return;
  }

  // Network-first: always get fresh content, only use cache when offline
  event.respondWith(
    fetch(request).then((res) => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      return res;
    }).catch(() => caches.match(request))
  );
});
