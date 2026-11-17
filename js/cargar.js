// formato.json se revalida siempre. datos.enc se pide con ?v=<sha256> para que
// un paquete nuevo no se quede en la caché del service worker.

export const CACHE_DATOS = 'fichas-datos-v1';

async function cacheDatos() {
  if (!('caches' in globalThis)) return null;
  return caches.open(CACHE_DATOS);
}

export async function obtenerFormato() {
  const req = 'formato.json';
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (!res.ok) throw new Error('formato');
    const cache = await cacheDatos();
    if (cache) await cache.put(req, res.clone());
    return await res.json();
  } catch (err) {
    const cache = await cacheDatos();
    const hit = cache && await cache.match(req);
    if (!hit) throw err;
    return hit.json();
  }
}

export async function obtenerCifrado(sha) {
  const req = `datos.enc?v=${encodeURIComponent(sha)}`;
  try {
    const res = await fetch(req);
    if (!res.ok) throw new Error('datos');
    const cache = await cacheDatos();
    if (cache) {
      await cache.put(req, res.clone());
      const keys = await cache.keys();
      await Promise.all(keys.map(async (k) => {
        const u = new URL(k.url);
        const esDato = u.pathname.endsWith('/datos.enc') || u.pathname.endsWith('datos.enc');
        if (esDato && u.searchParams.get('v') !== sha) await cache.delete(k);
      }));
    }
    return await res.arrayBuffer();
  } catch (err) {
    const cache = await cacheDatos();
    const hit = cache && await cache.match(req);
    if (!hit) throw err;
    return hit.arrayBuffer();
  }
}

export function indexar(doc) {
  const porSap = new Map();
  const porMezcla = new Map();
  for (const p of doc.productos) {
    porSap.set(p.codigo_sap, p);
    const g = p.sap_mezcla || '';
    if (!porMezcla.has(g)) porMezcla.set(g, []);
    porMezcla.get(g).push(p);
  }
  for (const arr of porMezcla.values()) {
    arr.sort((a, b) => a.codigo_sap.localeCompare(b.codigo_sap, 'es'));
  }
  return { porSap, porMezcla };
}
