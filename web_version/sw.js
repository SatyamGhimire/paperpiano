const CACHE_NAME = 'paperpiano-v2';

const ASSETS_TO_CACHE = new Set([
    '/pianolayout.pdf',
  '/model.onnx','/demo.mp4',
  './dummylayout.json',
  'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js',
  'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js',
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  'https://docs.opencv.org/4.x/opencv.js',
  'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js',
  'sounds/C3.mp3', 'sounds/Db3.mp3', 'sounds/D3.mp3', 'sounds/Eb3.mp3', 'sounds/E3.mp3',
  'sounds/F3.mp3', 'sounds/Gb3.mp3', 'sounds/G3.mp3', 'sounds/Ab3.mp3', 'sounds/A3.mp3',
  'sounds/Bb3.mp3', 'sounds/B3.mp3', 'sounds/C4.mp3', 'sounds/Db4.mp3', 'sounds/D4.mp3',
  'sounds/Eb4.mp3', 'sounds/E4.mp3', 'sounds/F4.mp3', 'sounds/Gb4.mp3', 'sounds/G4.mp3',
  'sounds/Ab4.mp3', 'sounds/A4.mp3', 'sounds/Bb4.mp3', 'sounds/B4.mp3',
  'sounds/C5.mp3', 'sounds/Db5.mp3', 'sounds/D5.mp3', 'sounds/Eb5.mp3', 'sounds/E5.mp3'
]);

self.addEventListener('install', event => {
  console.log('[SW] Installed – lazy caching enabled');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW] Activated');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = event.request.url;

  const isCacheTarget = [...ASSETS_TO_CACHE].some(asset => url.includes(asset));
  if (!isCacheTarget) return; // skip non-cacheable requests

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        console.log('[SW] Cache hit:', url);
        return cached;
      }

      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) {
          console.warn('[SW] Not caching (non-200):', url);
          return response;
        }

        const responseClone = response.clone(); // avoid "already used" error
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
          console.log('[SW] Cached:', url);
        });

        return response;
      }).catch(err => {
        console.error('[SW] Fetch failed:', url, err);
        throw err;
      });
    })
  );
});
