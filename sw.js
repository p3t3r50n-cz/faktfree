/* ---------------------------------------------------------------------------
 * FaktFree – service worker (offline režim, app shell + statické soubory).
 * Data jsou v IndexedDB, takže aplikace funguje i bez sítě.
 * ------------------------------------------------------------------------- */

// Technická verze cache – zvýšit při KAŽDÉ změně JS/CSS (i ikon, ty se předkešují).
// Držíme ji oddělenou od verze aplikace (ta je v `js/appinfo.js`, např. 0.3).
// U vydání se obě čísla sejdou (aplikace 0.3 = cache 0.3.1).
const CACHE_VERSION = '0.3.3';

// Cache je vázaná na cestu, ze které aplikace běží. Kdyby na stejném serveru
// (stejný původ) běžely dvě kopie aplikace, např. /fa/ a /faktfree/,
// nesmí si navzájem mazat cache – proto je v názvu i cesta (scope).
// Název proto vychází jako „faktfree_<cesta>-vNN“.
const SCOPE_KEY = new URL(self.registration.scope).pathname.replace(/[^a-z0-9]+/gi, '_').replace(/_+$/, '');
const PREFIX = 'faktfree' + SCOPE_KEY + '-';
const CACHE = PREFIX + CACHE_VERSION;

// Staré názvy cache (před rebrandem) – po aktualizaci je uklidíme.
const LEGACY = /^fakturace-v\d+$/;

// Cache, které patří naší aplikaci, poznáme podle názvu `faktfree<klíč cesty>-<verze>`.
// Uklízíme i cache z NADŘAZENÝCH cest: aplikace dřív běžela o úroveň výš (např.
// /faktfree/ místo /faktfree/pwa/) a její service worker si stihl nacachovat
// i soubory pod naší cestou. Taková cache se nikdy nesmaže (jiný prefix) a kvůli
// `caches.match()` by měla vždy přednost před tou novou. Cache ze sourozenecké
// cesty (např. /fa/) zůstávají – to je jiná kopie aplikace.
const FAMILY = ['faktfree-'];
for (let i = 1; i <= SCOPE_KEY.length; i++) {
    if (i === SCOPE_KEY.length || SCOPE_KEY[i] === '_') {
        FAMILY.push('faktfree' + SCOPE_KEY.slice(0, i) + '-');
    }
}
const isOurs = (name) => FAMILY.some((prefix) => name.startsWith(prefix));

const ASSETS = [
    './',
    'index.html',
    'manifest.webmanifest',
    'LICENSE',
    'css/app.css',
    'css/print.css',
    'js/app.js',
    'js/appinfo.js',
    'js/db.js',
    'js/store.js',
    'js/util.js',
    'js/backup.js',
    'js/icons.js',
    'js/import.js',
    'js/invoice.js',
    'js/qr.js',
    'js/ui.js',
    'js/abo.js',
    'js/ares.js',
    'js/print.js',
    'js/dialogs.js',
    'js/seed.js',
    'js/demo-abo.js',
    'js/views/sidebar.js',
    'js/views/overview.js',
    'js/views/invoice.js',
    'js/views/bank.js',
    'js/views/settings.js',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png',
    'icons/apple-touch-icon.png',
    'icons/favicon.svg',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) => {
            const failed = [];
            return Promise.all(ASSETS.map((asset) =>
                // `cache: 'reload'` = stáhni vždy ze sítě, ne z HTTP cache prohlížeče.
                // Bez toho se mohla do nové cache dostat stará verze souboru (prohlížeč
                // si ji drží podle Last-Modified) a po „Aktualizovat“ běžel pořád starý kód.
                fetch(new Request(asset, { cache: 'reload' }))
                    .then((response) => {
                        if (!response || !response.ok) { failed.push(asset); return; }
                        return cache.put(asset, response);
                    })
                    .catch(() => { failed.push(asset); })
            )).then(() => {
                // Chybějící soubor se doplní až za běhu ze sítě – ale znamená to,
                // že se nová verze nenasazela celá.
                if (failed.length) console.warn('Service worker: nenacacheováno:', failed);
                return self.skipWaiting();
            });
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys
                .filter((k) => (isOurs(k) || LEGACY.test(k)) && k !== CACHE)
                .map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (data.type === 'GET_VERSION' && event.source) {
        event.source.postMessage({ type: 'VERSION', version: CACHE });
    }
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    // cizí domény (ARES) necháváme na síti
    if (url.origin !== self.location.origin) return;

    // navigace: nejdřív síť, při výpadku z cache
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(() => caches.match('index.html', { cacheName: CACHE }))
        );
        return;
    }

    // ostatní: cache first, pak síť (a doplnit cache).
    // Hledáme VÝHRADNĚ v naší cache: `caches.match()` bez omezení prochází všechny
    // cache daného původu a vrátil by i soubor ze staré cache (např. z doby, kdy
    // aplikace běžela o úroveň výš) – i když nová cache už má správnou verzi.
    event.respondWith(
        caches.match(request, { cacheName: CACHE }).then((cached) => {
            if (cached) return cached;
            // `cache: 'reload'` i tady: kdyby soubor v cache chyběl, nesmíme si
            // z HTTP cache prohlížeče přitáhnout starou verzi (a tu si pak uložit).
            return fetch(request, { cache: 'reload' })
                .then((response) => {
                    if (response && response.status === 200 && response.type === 'basic') {
                        const copy = response.clone();
                        caches.open(CACHE).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => cached);
        })
    );
});
