// La contraseña de prueba no es la de la aplicación. No usa datos de botellas.

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { abrirPaquete, empaquetarIndice } from '../js/descifrar.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const password = 'prueba-local-sopladora';
const fallos = [];
function ok(cond, msg) {
  if (!cond) fallos.push(msg);
  else console.log('ok', msg);
}

const fuentes = ['index.html', 'preparar.html', 'css/app.css', 'js/app.js', 'js/calculo.js', 'js/sesion.js', 'js/descifrar.js', 'sw.js'];
for (const rel of fuentes) {
  const texto = readFileSync(path.join(raiz, rel), 'utf8');
  ok(!texto.includes(password), `la contraseña de prueba no está en ${rel}`);
}
const sesion = readFileSync(path.join(raiz, 'js/sesion.js'), 'utf8');
ok(sesion.includes('calculadora-sopladora'), 'IndexedDB propio');
ok(!sesion.includes('fichas-pt-alcolea'), 'no reutiliza la base de Fichas');
const sw = readFileSync(path.join(raiz, 'sw.js'), 'utf8');
ok(sw.includes('sopladora-shell-v') && sw.includes('sopladora-datos-v'), 'cachés propias');
ok(!sw.includes('fichas-shell'), 'no toca la caché de Fichas');

const indice = { tipo: 'sopladora', doc: { botellas: [], meta: { edicion: '15' } }, imagenes: {} };
const { enc, formato } = await empaquetarIndice(password, indice, new Uint8Array());
const buf = enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength);
const abierto = await abrirPaquete(password, formato, buf);
ok(abierto.indice.tipo === 'sopladora', 'abre con la contraseña de prueba');
try {
  await crypto.subtle.exportKey('raw', abierto.key);
  fallos.push('la clave derivada no debería exportarse');
} catch {
  ok(true, 'clave no exportable');
}
let rechazo = false;
try {
  await abrirPaquete('contraseña-incorrecta', formato, buf);
} catch (err) {
  rechazo = err?.name === 'OperationError';
}
ok(rechazo, 'la contraseña incorrecta no abre el paquete');

if (fallos.length) {
  console.error(fallos.join('\n'));
  process.exit(1);
}
console.log('cifrado de prueba correcto');
