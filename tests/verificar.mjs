// Comprueba el paquete cifrado sin imprimir fichas ni la contraseña.
// Uso: PT_PASSWORD='…' node tests/verificar.mjs [--esquema ruta/ESQUEMA.md]

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { abrirPaquete } from '../js/descifrar.js';
import { filtrar } from '../js/buscar.js';
import { agruparMarcas, esCodigoG } from '../js/util.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const password = process.env.PT_PASSWORD || '';
const fallos = [];

function ok(cond, msg) {
  if (!cond) fallos.push(msg);
  else console.log('ok', msg);
}

if (!password) {
  console.error('Falta PT_PASSWORD en el entorno.');
  process.exit(1);
}

const fuentes = [
  'index.html', 'css/app.css', 'sw.js', 'manifest.webmanifest', 'README.md', 'formato.json',
  ...fs.readdirSync(path.join(root, 'js')).map((f) => path.join('js', f)),
];
for (const rel of fuentes) {
  const texto = fs.readFileSync(path.join(root, rel), 'utf8');
  ok(!texto.includes(password), `la contraseña no está en ${rel}`);
}

const formato = JSON.parse(fs.readFileSync(path.join(root, 'formato.json'), 'utf8'));
const enc = fs.readFileSync(path.join(root, 'datos.enc'));
ok(createHash('sha256').update(enc).digest('hex') === formato.sha256_datos_enc, 'sha256 de datos.enc');

const t0 = Date.now();
let paquete;
try {
  paquete = await abrirPaquete(password, formato, enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength));
} catch (err) {
  console.error('no abre el paquete', err.name);
  process.exit(1);
}
console.log('descifrado_ms', Date.now() - t0);

try {
  await crypto.subtle.exportKey('raw', paquete.key);
  fallos.push('la clave derivada no debería poder exportarse');
} catch (err) {
  ok(err.name === 'InvalidAccessError' || err.name === 'InvalidAccessException', 'clave no exportable');
}

const productos = paquete.doc.productos;
ok(productos.length === 322, '322 productos');
ok(Object.keys(paquete.imagenes).length === 713, '713 imágenes');
ok(productos.filter((p) => p.grupo_pdf === 'Asépticos').length === 245, '245 asépticos');
ok(productos.filter((p) => p.grupo_pdf === 'No asépticos').length === 77, '77 carbonatados');
ok(productos.filter((p) => p.con_gas_derivado).length === 77, '77 con gas');

let nInc = 0;
const porG = new Map();
for (const p of productos) {
  nInc += p.incidencias?.length || 0;
  const g = p.sap_mezcla || '';
  porG.set(g, (porG.get(g) || 0) + 1);
}
ok(nInc === 47, '47 incidencias');
ok(porG.size === 89, '89 códigos de mezcla');
ok([...porG.values()].filter((n) => n > 1).length === 56, '56 códigos compartidos');
const puros = [...porG.keys()].filter((g) => esCodigoG(g));
const raros = [...porG.keys()].filter((g) => g && !esCodigoG(g)).sort();
ok(puros.length === 86, '86 códigos G con forma G y dígitos');
ok(raros.length === 3 && raros.includes('6000179') && raros.includes('6000702') && raros.includes('G001467/G001471'), 'tres mezclas que no son un código G');
const marcas = agruparMarcas(productos);
const pingo = marcas.find((m) => m.clave === 'pingo doce');
const look = marcas.find((m) => m.clave === 'look');
ok(pingo && pingo.total === 30 && pingo.etiqueta === 'Pingo Doce', 'Pingo Doce agrupa las dos grafías');
ok(look && look.total === 23 && look.etiqueta === 'Look', 'Look agrupa LOOK y Look');
ok(filtrar(productos, { marca: 'Pingo Doce' }).length === 30, 'el filtro de marca incluye las dos grafías');
ok(filtrar(productos, { marca: 'PINGO DOCE' }).every((p) => p.marca === 'PINGO DOCE' || p.marca === 'Pingo Doce'), 'el filtro no reescribe la marca');
const ejemploMarca = productos.find((p) => p.codigo_sap === '1005610');
ok(ejemploMarca.marca === 'HACENDADO', 'la ficha conserva la marca original');

function primero(q, extra = {}) {
  return filtrar(productos, { q, ...extra })[0]?.codigo_sap;
}
ok(primero('1005653') === '1005653', 'busca SAP 1005653');
ok(primero('1005482') === '1005482', 'busca SAP 1005482');
ok(primero('1005678') === '1005678', 'busca SAP 1005678');
const g590 = filtrar(productos, { q: 'G001590' });
ok(g590.length > 1 && g590.some((p) => p.codigo_sap === '1005653'), 'G001590 compartido incluye 1005653');
ok(filtrar(productos, { q: 'limon' }).some((p) => /lim[oó]n/i.test(p.producto)), 'búsqueda sin tilde');
ok(filtrar(productos, { grupo: 'carbonatados' }).every((p) => p.grupo_pdf === 'No asépticos'), 'filtro carbonatados');

let hashesMal = 0;
for (const [hash, meta] of Object.entries(paquete.imagenes)) {
  const trozo = paquete.blob.subarray(meta.offset, meta.offset + meta.longitud);
  const dig = createHash('sha256').update(trozo).digest('hex');
  if (dig !== hash) hashesMal += 1;
}
ok(hashesMal === 0, 'cada imagen coincide con su sha256');

const malo = await abrirPaquete('no-es-la-clave', formato, enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength)).then(
  () => 'aceptó una contraseña incorrecta',
  (err) => (err.name === 'OperationError' ? '' : `error inesperado ${err.name}`),
);
ok(!malo, 'contraseña incorrecta rechazada');
if (malo) fallos.push(malo);

const arg = process.argv.indexOf('--esquema');
if (arg !== -1) {
  const md = fs.readFileSync(process.argv[arg + 1], 'utf8');
  const bloques = [];
  for (const m of md.matchAll(/```json\n([\s\S]*?)```/g)) {
    try {
      const obj = JSON.parse(m[1]);
      if (obj && obj.codigo_sap) bloques.push(obj);
    } catch { /* el esquema incluye un fragmento ilustrativo, no solo los dos registros */ }
  }
  ok(bloques.length === 2, 'dos ejemplos en el esquema');
  for (const ejemplo of bloques) {
    const real = productos.find((p) => p.codigo_sap === ejemplo.codigo_sap);
    const diffs = [];
    comparar(ejemplo, real, ejemplo.codigo_sap, diffs);
    ok(diffs.length === 0, `ejemplo ${ejemplo.codigo_sap} idéntico`);
    if (diffs.length) fallos.push(...diffs.slice(0, 12).map((d) => `${ejemplo.codigo_sap} ${d}`));
  }
}

if (fallos.length) {
  console.error('FALLOS');
  for (const f of fallos) console.error(' -', f);
  process.exit(1);
}
console.log('verificación completa');

function comparar(a, b, ruta, out) {
  if (Object.is(a, b)) return;
  if (a && b && typeof a === 'object') {
    const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of claves) comparar(a[k], b[k], `${ruta}.${k}`, out);
    return;
  }
  out.push(`${ruta}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}
