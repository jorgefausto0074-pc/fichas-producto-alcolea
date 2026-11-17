// acceso.enc es un sobre JSON con los parámetros públicos y el paquete RPTB cifrado.
// El índice descifrado es { tipo: "acceso", token, repo }. El token no se imprime.

import { abrirPaquete, base64ABytes, bytesABase64, empaquetarIndice } from './descifrar.js';
import { borrarAccesoEnvuelto, guardarAccesoEnvuelto, leerAccesoEnvuelto } from './sesion.js';

export async function crearSobreAcceso(clave, { token, repo }) {
  const { enc, formato } = await empaquetarIndice(clave, { tipo: 'acceso', token, repo });
  const sobre = {
    formato: 'RPTB',
    version_contenedor: 1,
    iteraciones: formato.iteraciones,
    sal_hex: formato.sal_hex,
    iv_hex: formato.iv_hex,
    paquete_b64: bytesABase64(enc),
  };
  return new TextEncoder().encode(JSON.stringify(sobre));
}

export async function abrirAcceso(clave, bytes) {
  let sobre;
  try {
    sobre = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw Object.assign(new Error('El archivo de acceso no es válido.'), { code: 'acceso-formato' });
  }
  if (!sobre?.paquete_b64 || !sobre.sal_hex || !sobre.iv_hex) {
    throw Object.assign(new Error('El archivo de acceso no es válido.'), { code: 'acceso-formato' });
  }
  let paquete;
  try {
    paquete = await abrirPaquete(clave, sobre, base64ABytes(sobre.paquete_b64));
  } catch (err) {
    if (err?.name === 'OperationError') {
      throw Object.assign(new Error('Clave de actualización incorrecta.'), { code: 'clave' });
    }
    throw Object.assign(new Error('El archivo de acceso no es válido.'), { code: 'acceso-formato' });
  }
  const indice = paquete.indice;
  if (indice?.tipo !== 'acceso' || typeof indice.token !== 'string' || typeof indice.repo !== 'string' || !indice.token || !indice.repo) {
    throw Object.assign(new Error('El archivo de acceso no es válido.'), { code: 'acceso-formato' });
  }
  return { token: indice.token, repo: indice.repo };
}

export async function descargarAcceso(clave, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl('acceso.enc', { cache: 'no-store' });
  if (res.status === 404) {
    throw Object.assign(new Error('Todavía no está configurado el acceso. Falta acceso.enc.'), { code: 'sin-acceso' });
  }
  if (!res.ok) throw new Error('No se ha podido descargar el acceso.');
  return abrirAcceso(clave, new Uint8Array(await res.arrayBuffer()));
}

export async function envolverToken(token, repo) {
  const key = await globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const cifrado = new Uint8Array(await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(token),
  ));
  await guardarAccesoEnvuelto({ key, iv, cifrado, repo });
}

export async function desenvolverToken() {
  const reg = await leerAccesoEnvuelto().catch(() => null);
  if (!reg?.key || !reg.iv || !reg.cifrado) return null;
  try {
    const plano = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: reg.iv },
      reg.key,
      reg.cifrado,
    );
    const token = new TextDecoder().decode(plano);
    if (!token || !reg.repo) return null;
    return { token, repo: reg.repo };
  } catch {
    await borrarAccesoEnvuelto().catch(() => {});
    return null;
  }
}

export { borrarAccesoEnvuelto };
