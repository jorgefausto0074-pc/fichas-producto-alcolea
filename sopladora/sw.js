const SHELL = 'sopladora-shell-v6';
const DATOS = 'sopladora-datos-v1';
const BASE = new URL('./', self.location);

const SHELL_FILES = [
  'index.html',
  'preparar.html',
  'css/app.css',
  'js/app.js',
  'js/calculo.js',
  'js/foto.js',
  'js/buscar.js',
  'js/memoria.js',
  'js/csv.js',
  'js/animar.js',
  'js/descifrar.js',
  'js/sesion.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  '../img/marca2026/foto-burbujas.webp',
  '../img/marca2026/refresco-logo-naranja.png',
  '../img/marca2026/refresco-r-naranja.png',
  '../img/marca2026/circulos-azul.svg',
  '../img/marca2026/stripe-r-naranja.svg',
  '../img/marca2026/stripe-r-azul.svg',
  '../img/marca2026/foto-linea-1.webp',
  '../img/marca2026/foto-linea-2.webp',
  '../img/marca2026/foto-linea-3.webp',
].map((ruta) => new URL(ruta, BASE).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(SHELL_FILES.map((url) => new Request(url, { cache: 'reload' })));
    const index = await cache.match(new URL('index.html', BASE).href);
    if (index) await cache.put(BASE.href, index.clone());
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves
      .filter((k) => (k.startsWith('sopladora-shell-') && k !== SHELL) || (k.startsWith('sopladora-datos-') && k !== DATOS))
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.tipo === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.includes('/sopladora/') && !SHELL_FILES.includes(url.href.split('?')[0])) return;

  if (req.mode === 'navigate') {
    event.respondWith(navegacion(req));
    return;
  }
  if (url.pathname.endsWith('/formato.json')) {
    event.respondWith(redPrimero(req, DATOS));
    return;
  }
  if (url.pathname.endsWith('/datos.enc')) {
    event.respondWith(cachePrimero(req, DATOS));
    return;
  }
  event.respondWith(cacheYRed(req, SHELL));
});

function peticionRed(req) {
  // Una URL nueva: reenviar el mismo Request desde el service worker puede quedarse colgado.
  return fetch(req.url, { cache: 'no-store', credentials: req.credentials, redirect: 'follow' });
}

async function navegacion(req) {
  const cache = await caches.open(SHELL);
  try {
    const fresco = await peticionRed(req);
    if (fresco.ok) await cache.put(req, fresco.clone());
    return fresco;
  } catch {
    return (await cache.match(req))
      || (await cache.match(BASE.href))
      || (await cache.match(new URL('index.html', BASE).href))
      || Response.error();
  }
}

async function redPrimero(req, nombre) {
  const cache = await caches.open(nombre);
  try {
    const fresco = await peticionRed(req);
    if (fresco.ok) await cache.put(req, fresco.clone());
    return fresco;
  } catch {
    const guardado = await cache.match(req);
    if (guardado) return guardado;
    throw new Error('offline');
  }
}

async function cachePrimero(req, nombre) {
  const cache = await caches.open(nombre);
  const guardado = await cache.match(req);
  if (guardado) return guardado;
  const fresco = await peticionRed(req);
  if (fresco.ok) cache.put(req, fresco.clone());
  return fresco;
}

async function cacheYRed(req, nombre) {
  const cache = await caches.open(nombre);
  const guardado = await cache.match(req);
  const red = peticionRed(req).then((fresco) => {
    if (fresco.ok) cache.put(req, fresco.clone());
    return fresco;
  }).catch(() => null);
  return guardado || (await red) || Response.error();
}
