// Auditoría de la calculadora. Los datos en claro solo se leen si se pasan por el entorno;
// no forman parte del repositorio.
//   BOTELLAS_JSON=… PPTX=… node sopladora/tests/auditoria.mjs

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { auditarDocumento } from '../js/auditar.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..');
const fallos = [];
let total = 0;

function sumar(bloque, etiqueta) {
  total += bloque.total;
  if (bloque.fallos) {
    for (const f of bloque.lista_fallos || []) fallos.push(`${etiqueta}: ${f}`);
  }
  console.log(`${etiqueta}: ${bloque.total} comprobaciones, ${bloque.fallos} errores`);
  for (const h of bloque.hallazgos || []) console.log('aviso', h);
}

const jsonPath = process.env.BOTELLAS_JSON || '';
if (!jsonPath) {
  console.error('Falta BOTELLAS_JSON.');
  process.exit(1);
}
const doc = JSON.parse(readFileSync(jsonPath, 'utf8'));
sumar(auditarDocumento(doc), 'datos y calculadora');

const ppt = process.env.PPTX || '';
if (ppt) {
  const py = spawnSync('python3', [path.join(aqui, 'contra_ppt.py'), ppt, jsonPath], { encoding: 'utf8' });
  if (py.status !== 0 && !py.stdout.trim()) {
    fallos.push('PPT: ' + (py.stderr || 'sin salida'));
    console.log('PPT: error de ejecución');
  } else {
    const bloque = JSON.parse(py.stdout);
    sumar(bloque, 'PowerPoint');
    if (py.status !== 0 && bloque.fallos === 0) fallos.push('PPT: código de salida distinto de cero');
  }
} else {
  console.log('PowerPoint: no se ha pasado PPTX, se omite esa parte.');
}

const prohibido = /diferencia|#0f0\b|#00ff00|#008000|#28a745|#22c55e|\blime\b|\bgreen\b|rgb\(\s*0\s*,\s*(?:128|255)\s*,\s*0\s*\)/i;
const pesoEscrito = /21,65|40,40|FORM-40|9,75/;
function archivos(dir) {
  const out = [];
  for (const nombre of readdirSync(dir)) {
    const abs = path.join(dir, nombre);
    if (statSync(abs).isDirectory()) out.push(...archivos(abs));
    else out.push(abs);
  }
  return out;
}
let estaticas = 0;
for (const abs of archivos(raiz)) {
  const rel = path.relative(raiz, abs);
  if (rel.startsWith('tests') || rel.startsWith('tools') || rel.startsWith('android')) continue;
  if (!/\.(html|css|js|mjs|webmanifest)$/.test(rel)) continue;
  const texto = readFileSync(abs, 'utf8');
  estaticas += 1;
  if (prohibido.test(texto)) fallos.push(`texto no permitido en ${rel}`);
  if (rel.startsWith('js/') && pesoEscrito.test(texto)) fallos.push(`dato de ficha escrito en ${rel}`);
}
total += estaticas + 1;
if (fallos.some((f) => f.startsWith('texto') || f.startsWith('dato'))) {
  console.log(`código de la app: ${estaticas} archivos revisados, con errores`);
} else {
  console.log(`código de la app: ${estaticas} archivos sin la palabra prohibida, sin verde y sin pesos escritos`);
}
const ui = readFileSync(path.join(raiz, 'js/app.js'), 'utf8');
total += 1;
if (ui.includes('peso_total')) fallos.push('la pantalla referencia el total del PowerPoint');

console.log(`TOTAL ${total} comprobaciones, ${fallos.length} errores`);
if (fallos.length) {
  console.error(fallos.slice(0, 40).join('\n'));
  process.exit(1);
}
