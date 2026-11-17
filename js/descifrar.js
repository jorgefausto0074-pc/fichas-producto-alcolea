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
  return { doc: indice.doc, imagenes: indice.imagenes, blob };
}

export function imagenDe(paquete, producto, casilla) {
  const h = producto.imagenes_sha256?.[casilla];
  if (!h) return null;
  const m = paquete.imagenes[h];
  if (!m) return null;
  return new Blob([paquete.blob.subarray(m.offset, m.offset + m.longitud)], { type: m.mime });
}
