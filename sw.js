const CACHE_NAME = 'nepali-guitar-chords-v6';
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './src/app.js',
    './src/audio/audio-context.js',
    './src/audio/drum-config.js',
    './src/audio/drum-machine.js',
    './src/audio/strumming-config.js',
    './src/audio/strumming-player.js',
    './src/audio/tabla-config.js',
    './src/audio/tabla-machine.js',
    './src/state/favorites.js',
    './src/state/history.js',
    './src/state/storage.js',
    './src/views/directory.js',
    './src/views/help.js',
    './src/styles.css',
    './songs.json',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
    './assets/webaudiofont/WebAudioFontPlayer.js',
    './assets/webaudiofont/0250_SoundBlasterOld_sf2.js',
    './assets/tabla/ghe.wav',
    './assets/tabla/na.wav',
    './assets/tabla/na-open.wav',
    './assets/tabla/na-sharp.wav',
    './assets/tabla/tun.wav',
    './assets/tabla/te.wav',
    './assets/tabla/te-middlefinger.wav',
    './assets/tabla/te-ne.wav',
    './assets/tabla/re.wav',
    './assets/tabla/ke.wav',
    './assets/tabla/tas.wav'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
    );
});

self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
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

    // Keep the song directory current when new songs are added, while still
    // falling back to the cached copy when the app is offline.
    if (new URL(event.request.url).pathname.endsWith('/songs.json')) {
        event.respondWith(
            fetch(event.request).then(response => {
                if (response.ok) {
                    const responseCopy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseCopy));
                }
                return response;
            }).catch(() => caches.match(event.request))
        );
        return;
    }

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
