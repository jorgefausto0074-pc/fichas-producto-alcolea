// Descifrado del paquete RPTB (WebCrypto). La contraseña la escribe quien usa la app;
// no vive en este fichero. Una clave derivada se puede guardar, no exportable, en el dispositivo.

const hex = (h) => Uint8Array.from(String(h).match(/../g), (b) => parseInt(b, 16));

export async function derivarClave(password, formato) {
  const subtle = globalThis.crypto.subtle;
  const base = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: hex(formato.sal_hex),
      iterations: formato.iteraciones,
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}

export async function descifrarConClave(key, formato, encBuffer) {
  const plano = new Uint8Array(
    await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: hex(formato.iv_hex) },
      key,
      encBuffer,
    ),
  );
  return abrirPlano(plano);
}

export async function abrirPaquete(password, formato, encBuffer) {
  const key = await derivarClave(password, formato);
  const paquete = await descifrarConClave(key, formato, encBuffer);
  return { ...paquete, key };
}

export async function abrirPlano(plano) {
  if (new TextDecoder().decode(plano.subarray(0, 4)) !== 'RPTB' || plano[4] !== 1) {
    throw new Error('Formato de paquete desconocido');
  }
  const n = new DataView(plano.buffer, plano.byteOffset + 8, 4).getUint32(0, true);
  const gz = new Blob([plano.subarray(12, 12 + n)]).stream().pipeThrough(new DecompressionStream('gzip'));
  const indice = JSON.parse(await new Response(gz).text());
  const blob = plano.subarray(12 + n);
  return {
    doc: indice.doc ?? null,
    imagenes: indice.imagenes || {},
    blob,
    cambios: indice.cambios ?? null,
    indice,
  };
}

function concatBytes(partes) {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function hexTexto(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return hexTexto(new Uint8Array(digest));
}

async function gzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function empaquetarIndice(password, indice, blob = new Uint8Array()) {
  const json = new TextEncoder().encode(JSON.stringify(indice));
  const gz = await gzipBytes(json);
  const n = new Uint8Array(4);
  new DataView(n.buffer).setUint32(0, gz.length, true);
  const plano = concatBytes([
    new TextEncoder().encode('RPTB'),
    new Uint8Array([1, 0, 0, 0]),
    n,
    gz,
    blob,
  ]);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const base = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await globalThis.crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const enc = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plano));
  return {
    enc,
    formato: {
      formato: 'RPTB',
      version_contenedor: 1,
      iteraciones: 600000,
      sal_hex: hexTexto(salt),
      iv_hex: hexTexto(iv),
      tipo: indice.tipo || '',
      sha256_datos_enc: await sha256Hex(enc),
    },
  };
}

export function bytesABase64(bytes) {
  let bin = '';
  const paso = 0x8000;
  for (let i = 0; i < bytes.length; i += paso) {
    bin += String.fromCharCode(...bytes.subarray(i, i + paso));
  }
  return btoa(bin);
}

export function base64ABytes(texto) {
  const bin = atob(texto);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function imagenDe(paquete, producto, casilla) {
  const h = producto.imagenes_sha256?.[casilla];
  if (!h) return null;
  const m = paquete.imagenes[h];
  if (!m) return null;
  return new Blob([paquete.blob.subarray(m.offset, m.offset + m.longitud)], { type: m.mime });
}
