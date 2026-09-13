/**
 * service-worker.js
 *
 * Tiny cache-first service worker so the game can be re-launched offline once
 * the player has loaded it at least once. We intentionally keep the cache list
 * short and explicit — it covers the static assets the browser needs to render
 * a frame. localStorage (used by `src/storage.js`) already handles save data.
 *
 * No build step, no Workbox, no dependencies.
 */
/* eslint-env serviceworker */
/* global self, caches, fetch */

const CACHE = 'survivor-v2.27.0-equip';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './manifest.json',
    './src/main.js',
    './src/config.js',
    './src/data.js',
    './src/entities.js',
    './src/weapons.js',
    './src/systems.js',
    './src/effects.js',
    './src/audio.js',
    './src/input.js',
    './src/ui.js',
    './src/i18n.js',
    './src/storage.js',
    './src/achievements.js',
    './src/leaderboard.js',
    './docs/hero.svg',
    './docs/og-card.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    // Network-first for same-origin GETs so new deploys show up right away;
    // fall back to the cache only when offline. Bypass everything else.
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    event.respondWith(
        fetch(req)
            .then((res) => {
                if (res && res.status === 200) {
                    const copy = res.clone();
                    caches.open(CACHE).then((c) => c.put(req, copy));
                }
                return res;
            })
            .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
});
