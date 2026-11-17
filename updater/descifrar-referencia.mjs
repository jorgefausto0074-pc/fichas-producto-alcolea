// Referencia de descifrado (WebCrypto). Funciona igual en navegador y en Node >= 18.
// Uso en navegador: const { doc, imagenes, blob, cambios } = await abrirPaquete(password, formatoJson, await (await fetch('datos.enc')).arrayBuffer());
const hex = (h) => Uint8Array.from(h.match(/../g), (b) => parseInt(b, 16));

export async function abrirPaquete(password, formato, encBuffer) {
  const subtle = globalThis.crypto.subtle;
  const base = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hex(formato.sal_hex), iterations: formato.iteraciones },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  // Lanza OperationError si la contraseña es incorrecta (falla la etiqueta GCM).
  const plano = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: hex(formato.iv_hex) }, key, encBuffer));
  if (new TextDecoder().decode(plano.subarray(0, 4)) !== 'RPTB' || plano[4] !== 1) throw new Error('Formato de paquete desconocido');
  const n = new DataView(plano.buffer, plano.byteOffset + 8, 4).getUint32(0, true);
  const gz = new Blob([plano.subarray(12, 12 + n)]).stream().pipeThrough(new DecompressionStream('gzip'));
  const indice = JSON.parse(await new Response(gz).text());
  const blob = plano.subarray(12 + n);
  // cambios: registro de la última actualización (altas/bajas/modificados) para la vista «Novedades»; null en paquetes antiguos.
  return { doc: indice.doc, imagenes: indice.imagenes, blob, cambios: indice.cambios ?? null };
}

// Imagen de un producto como Blob (para URL.createObjectURL). casilla: 'botella', 'etiqueta', 'tapon'...
export function imagenDe(paquete, producto, casilla) {
  const h = producto.imagenes_sha256?.[casilla];
  if (!h) return null;
  const m = paquete.imagenes[h];
  return new Blob([paquete.blob.subarray(m.offset, m.offset + m.longitud)], { type: m.mime });
}
