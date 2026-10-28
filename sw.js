// 오프라인에서도 열리도록 앱 파일을 캐시한다.
// 캐시된 파일을 먼저 보여주고, 온라인이면 뒤에서 새 버전을 받아 다음 실행 때 반영한다.
const CACHE = 'gratitude-journal-v2';
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'sync.js',
  'config.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 앱 파일만 캐시한다. 동기화 API 같은 다른 요청은 항상 네트워크로 보낸다.
const SCOPE = new URL('./', self.location).href;
const ASSET_URLS = new Set(ASSETS.map((a) => new URL(a, SCOPE).href));

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  const url = new URL(req.url);
  url.search = '';
  if (req.method !== 'GET' || !(req.mode === 'navigate' || ASSET_URLS.has(url.href))) return;
  ev.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req)
      .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => cached);
    return cached || network;
  }));
});
