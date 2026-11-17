// Cifra los PDF, los sube a un borrador y espera el informe. No registra el token ni los PDF.

import { abrirPaquete, empaquetarIndice, sha256Hex } from './descifrar.js';
import {
  esperarRun, mensajeFallo, nuevaSolicitud, reemplazarRelease, sanear,
} from './github.js';

export { mensajeFallo, nuevaSolicitud, sanear };

export async function leerPdfs(files) {
  const lista = [...files];
  if (lista.length < 1 || lista.length > 2) {
    throw new Error('Elige uno o dos PDF: asépticos, no asépticos, o los dos.');
  }
  const salida = [];
  for (const file of lista) {
    const nombre = String(file.name || 'informe.pdf').split(/[/\\]/).pop();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const cabecera = new TextDecoder().decode(bytes.subarray(0, 5));
    if (cabecera !== '%PDF-') throw new Error(`«${nombre}» no es un PDF.`);
    salida.push({ nombre, bytes });
  }
  return salida;
}

export async function cifrarEntrada(password, archivos) {
  const meta = [];
  const partes = [];
  let offset = 0;
  for (const archivo of archivos) {
    const sha256 = await sha256Hex(archivo.bytes);
    meta.push({ nombre: archivo.nombre, offset, longitud: archivo.bytes.length, sha256 });
    partes.push(archivo.bytes);
    offset += archivo.bytes.length;
  }
  const blob = new Uint8Array(offset);
  let o = 0;
  for (const parte of partes) {
    blob.set(parte, o);
    o += parte.length;
  }
  return empaquetarIndice(password, { tipo: 'entrada', archivos: meta }, blob);
}

export async function subirRevision(gh, { password, archivos, solicitud }) {
  const { enc, formato } = await cifrarEntrada(password, archivos);
  const release = await reemplazarRelease(gh);
  await gh.subir(release.id, 'entrada.enc', enc, 'application/octet-stream');
  const json = new TextEncoder().encode(JSON.stringify(formato));
  await gh.subir(release.id, 'entrada.json', json, 'application/json');
  await gh.dispatch('revisar', solicitud);
  return release;
}

export async function informeDeRelease(gh, password) {
  const release = await gh.releasePendiente();
  if (!release) throw new Error('No está la actualización pendiente.');
  let resultado = null;
  try {
    resultado = JSON.parse(new TextDecoder().decode(await gh.bajar(release, 'resultado.json')));
  } catch (err) {
    if (err?.code !== 'sin-asset') throw err;
  }
  const enc = await gh.bajar(release, 'informe.enc');
  const formato = JSON.parse(new TextDecoder().decode(await gh.bajar(release, 'informe.json')));
  const paquete = await abrirPaquete(password, formato, enc);
  if (paquete.doc?.tipo !== 'pendiente' && paquete.indice?.tipo !== 'pendiente') {
    throw new Error('El informe no es válido.');
  }
  return {
    cambios: paquete.cambios,
    doc: paquete.doc,
    resultado,
    release,
  };
}

export async function seguir(gh, { solicitud, desde, esperar, intervalo, limite }) {
  return esperarRun(gh, { solicitud, desde, esperar, intervalo, limite });
}

export async function leerResultado(gh) {
  const release = await gh.releasePendiente();
  if (!release) return null;
  try {
    return JSON.parse(new TextDecoder().decode(await gh.bajar(release, 'resultado.json')));
  } catch (err) {
    if (err?.code === 'sin-asset') return null;
    throw err;
  }
}

export async function descartar(gh) {
  const release = await gh.releasePendiente();
  if (release) await gh.borrarRelease(release.id);
}

export async function aprobar(gh, solicitud) {
  await gh.dispatch('aplicar', solicitud);
}
