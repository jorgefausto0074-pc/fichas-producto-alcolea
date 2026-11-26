// Cifra el paquete de la Calculadora Sopladora.
// La contraseña SOLO llega por PT_PASSWORD. No se imprime ni se escribe en el repositorio.
//
//   PT_PASSWORD='…' node sopladora/tools/cifrar.mjs \
//     --datos /ruta/botellas.json --fotos /ruta/fotos --salida sopladora

import { createHash } from 'crypto';
import { readFile, readdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { empaquetarIndice, abrirPaquete } from '../js/descifrar.js';
import { completarFormato, montarIndice, numeroDiapositiva } from '../js/paquete.js';

const password = process.env.PT_PASSWORD || '';
if (!password) {
  console.error('Falta PT_PASSWORD en el entorno. No se cifra nada.');
  process.exit(1);
}

function arg(nombre) {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : '';
}

const datos = arg('--datos');
const fotosDir = arg('--fotos');
const salida = arg('--salida');
if (!datos || !fotosDir || !salida) {
  console.error('Uso: PT_PASSWORD=… node sopladora/tools/cifrar.mjs --datos botellas.json --fotos DIR --salida DIR');
  process.exit(1);
}

function mimeDe(nombre) {
  const ext = path.extname(nombre).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function medidas(buf, mime) {
  if (mime === 'image/png' && buf.length > 24) {
    return { ancho: buf.readUInt32BE(16), alto: buf.readUInt32BE(20) };
  }
  if (mime === 'image/jpeg') {
    let i = 2;
    while (i + 8 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0xd9) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { alto: buf.readUInt16BE(i + 5), ancho: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return { ancho: 0, alto: 0 };
}

const doc = JSON.parse(await readFile(datos, 'utf8'));
const fotos = new Map();
for (const nombre of await readdir(fotosDir)) {
  const slide = numeroDiapositiva(nombre);
  if (!slide || nombre.startsWith('slide-')) continue;
  const buf = await readFile(path.join(fotosDir, nombre));
  const mime = mimeDe(nombre);
  const med = medidas(buf, mime);
  fotos.set(slide, {
    bytes: buf,
    mime,
    ancho: med.ancho,
    alto: med.alto,
    sha256: createHash('sha256').update(buf).digest('hex'),
  });
}

const { indice, blob } = montarIndice(doc, fotos);
const { enc, formato } = await empaquetarIndice(password, indice, blob);
// edicion y fecha_portada salen de meta del JSON (o del valor ya publicado). No altera gramajes.
const completo = completarFormato(formato, indice.doc);
const encBuf = Buffer.from(enc);
await writeFile(path.join(salida, 'datos.enc'), encBuf);
await writeFile(path.join(salida, 'formato.json'), JSON.stringify(completo, null, 1));

const paquete = await abrirPaquete(password, completo, encBuf.buffer.slice(encBuf.byteOffset, encBuf.byteOffset + encBuf.byteLength));
const botellas = paquete.doc.botellas?.length || 0;
const n = (paquete.doc.botellas || []).reduce((s, b) => s + (b.fichas?.length || 0), 0);
const nFotos = Object.keys(paquete.imagenes || {}).length;
if (paquete.indice.tipo !== 'sopladora' || botellas < 1 || n < 1 || nFotos < 1) {
  console.error('El paquete cifrado no tiene la estructura de la calculadora.');
  process.exit(1);
}
try {
  await abrirPaquete(`${password}x`, completo, encBuf.buffer.slice(encBuf.byteOffset, encBuf.byteOffset + encBuf.byteLength));
  console.error('Una contraseña distinta también abre el paquete.');
  process.exit(1);
} catch (err) {
  if (err?.name !== 'OperationError') throw err;
}
console.log(`Paquete cifrado: ${n} fichas, ${botellas} botellas, ${nFotos} fotos. La contraseña no se muestra.`);

const aqui = path.dirname(fileURLToPath(import.meta.url));
void aqui;
