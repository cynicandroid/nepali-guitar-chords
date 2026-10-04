const CACHE_NAME = 'nepali-guitar-chords-v1';
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './src/app.js',
    './src/styles.css',
    './songs.json',
    './assets/icons/icon-192.svg',
    './assets/icons/icon-512.svg',
    './assets/webaudiofont/WebAudioFontPlayer.js',
    './assets/webaudiofont/0250_SoundBlasterOld_sf2.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const networkResponse = fetch(event.request).then(response => {
                if (response.ok && new URL(event.request.url).origin === self.location.origin) {
                    const responseCopy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseCopy));
                }
                return response;
            }).catch(() => cachedResponse);

            return cachedResponse || networkResponse;
        })
    );
});
