const SHELL = 'fichas-shell-v11';
const DATOS = 'fichas-datos-v1';
const BASE = new URL('./', self.location);

const SHELL_FILES = [
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/vistas.js',
  'js/descifrar.js',
  'js/sesion.js',
  'js/cargar.js',
  'js/buscar.js',
  'js/util.js',
  'js/ean.js',
  'js/analisis.js',
  'js/preferencias.js',
  'js/escaner.js',
  'js/acceso.js',
  'js/github.js',
  'js/actualizar.js',
  'js/materiales.js',
  'js/excel.js',
  'js/efectos.js',
  'js/vendor/zxing-ean.js',
  'js/vendor/exceljs.min.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'img/marca2026/foto-burbujas.webp',
  'img/marca2026/refresco-logo-naranja.png',
  'img/marca2026/circulos-azul.svg',
  'img/marca2026/stripe-r-naranja.svg',
  'img/marca2026/foto-linea-1.webp',
  'img/marca2026/foto-linea-2.webp',
  'img/marca2026/foto-linea-3.webp',
  'img/marca2026/foto-linea-4.webp',
  'img/marca2026/foto-linea-5.webp',
  'img/marca2026/foto-linea-6.webp',
  'img/marca2026/foto-linea-7.webp',
  'img/marca2026/refresco-r-naranja.png',
  'img/marca2026/stripe-r-azul.svg',
].map((ruta) => new URL(ruta, BASE).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // cache: 'reload' evita que una versión nueva se instale con archivos viejos de la caché HTTP.
    await cache.addAll(SHELL_FILES.map((url) => new Request(url, { cache: 'reload' })));
    const index = await cache.match(new URL('index.html', BASE).href);
    if (index) await cache.put(BASE.href, index.clone());
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter((k) => k.startsWith('fichas-shell-') && k !== SHELL).map((k) => caches.delete(k)));
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

  if (req.mode === 'navigate') {
    event.respondWith(navegacion(req));
    return;
  }
  if (url.pathname.endsWith('/acceso.enc') || url.pathname.endsWith('acceso.enc')) {
    event.respondWith(fetch(req));
    return;
  }
  if (url.pathname.endsWith('/formato.json') || url.pathname.endsWith('formato.json')) {
    event.respondWith(redPrimero(req, DATOS));
    return;
  }
  if (url.pathname.endsWith('/datos.enc') || url.pathname.endsWith('datos.enc')) {
    event.respondWith(cachePrimero(req, DATOS));
    return;
  }
  event.respondWith(cacheYRed(req, SHELL));
});

async function navegacion(req) {
  const cache = await caches.open(SHELL);
  try {
    const fresco = await fetch(req);
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
    const fresco = await fetch(req);
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
  const fresco = await fetch(req);
  if (fresco.ok) await cache.put(req, fresco.clone());
  return fresco;
}

async function cacheYRed(req, nombre) {
  const cache = await caches.open(nombre);
  const guardado = await cache.match(req);
  const red = fetch(req).then((fresco) => {
    if (fresco.ok) cache.put(req, fresco.clone());
    return fresco;
  }).catch(() => null);
  return guardado || (await red) || Response.error();
}
