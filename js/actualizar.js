// Cifra los PDF, los sube a la rama actualizacion-pendiente y espera el informe. No registra el token ni los PDF.

import { abrirPaquete, empaquetarIndice, sha256Hex } from './descifrar.js';
import {
  esperarRun, mensajeFallo, nuevaSolicitud, reemplazarPendiente, sanear,
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
  const json = new TextEncoder().encode(JSON.stringify(formato));
  const pendiente = await reemplazarPendiente(gh, [
    { nombre: 'entrada.enc', bytes: enc },
    { nombre: 'entrada.json', bytes: json },
  ]);
  await gh.dispatch('revisar', solicitud);
  return pendiente;
}

export async function informeDeRelease(gh, password) {
  const pendiente = await gh.pendiente();
  if (!pendiente) throw new Error('No está la actualización pendiente.');
  let resultado = null;
  try {
    resultado = JSON.parse(new TextDecoder().decode(await gh.bajar(pendiente, 'resultado.json')));
  } catch (err) {
    if (err?.code !== 'sin-asset') throw err;
  }
  const enc = await gh.bajar(pendiente, 'informe.enc');
  const formato = JSON.parse(new TextDecoder().decode(await gh.bajar(pendiente, 'informe.json')));
  const paquete = await abrirPaquete(password, formato, enc);
  if (paquete.doc?.tipo !== 'pendiente' && paquete.indice?.tipo !== 'pendiente') {
    throw new Error('El informe no es válido.');
  }
  return {
    cambios: paquete.cambios,
    doc: paquete.doc,
    resultado,
    pendiente,
  };
}

export async function seguir(gh, { solicitud, desde, esperar, intervalo, limite }) {
  return esperarRun(gh, { solicitud, desde, esperar, intervalo, limite });
}

export async function leerResultado(gh) {
  const pendiente = await gh.pendiente();
  if (!pendiente) return null;
  try {
    return JSON.parse(new TextDecoder().decode(await gh.bajar(pendiente, 'resultado.json')));
  } catch (err) {
    if (err?.code === 'sin-asset') return null;
    throw err;
  }
}

export async function descartar(gh) {
  await gh.borrarPendiente();
}

export async function aprobar(gh, solicitud) {
  await gh.dispatch('aplicar', solicitud);
}
