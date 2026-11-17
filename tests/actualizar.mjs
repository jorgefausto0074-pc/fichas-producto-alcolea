// Pruebas del flujo de actualización. No imprime tokens ni contraseñas.
// Uso: node tests/actualizar.mjs

import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { abrirAcceso, crearSobreAcceso } from '../js/acceso.js';
import { cifrarEntrada, leerPdfs } from '../js/actualizar.js';
import { abrirPaquete } from '../js/descifrar.js';
import {
  crearCliente, mensajeFallo, reemplazarPendiente, sanear,
} from '../js/github.js';
import { htmlActualizar } from '../js/vistas.js';

const fallos = [];
function ok(cond, msg) {
  if (!cond) fallos.push(msg);
  else console.log('ok', msg);
}

const token = 'github_pat_test_dummy_not_a_real_token';
const claveAct = 'clave-actualizacion-prueba';
const claveApp = 'clave-de-prueba';
const repo = 'ejemplo/fichas';

const sobre = await crearSobreAcceso(claveAct, { token, repo });
const textoSobre = new TextDecoder().decode(sobre);
ok(!textoSobre.includes(token), 'el token no está en claro en acceso.enc');
ok(textoSobre.includes('"paquete_b64"'), 'acceso.enc lleva el paquete');
const abierto = await abrirAcceso(claveAct, sobre);
ok(abierto.token === token && abierto.repo === repo, 'la clave de actualización abre el acceso');
let mal = '';
try {
  await abrirAcceso('otra-clave', sobre);
  mal = 'aceptó una clave incorrecta';
} catch (err) {
  mal = err.code === 'clave' ? '' : `código ${err.code || err.name}`;
}
ok(!mal, 'clave de actualización incorrecta');
if (mal) fallos.push(mal);

const pdfA = new TextEncoder().encode('%PDF-1.4\n% prueba a\n');
const pdfB = new TextEncoder().encode('%PDF-1.4\n% prueba b\n');
const entrada = await cifrarEntrada(claveApp, [
  { nombre: 'asepticos.pdf', bytes: pdfA },
  { nombre: 'no-asepticos.pdf', bytes: pdfB },
]);
const plano = await abrirPaquete(claveApp, entrada.formato, entrada.enc);
ok(plano.indice.tipo === 'entrada', 'entrada.enc es de tipo entrada');
ok(plano.indice.archivos.length === 2, 'entrada.enc lleva dos PDF');
const blob = plano.blob;
for (const archivo of plano.indice.archivos) {
  const trozo = blob.subarray(archivo.offset, archivo.offset + archivo.longitud);
  ok(new TextDecoder().decode(trozo).startsWith('%PDF-'), `${archivo.nombre} se recupera`);
}
try {
  await abrirPaquete('no-es', entrada.formato, entrada.enc);
  fallos.push('entrada aceptó otra contraseña');
} catch (err) {
  ok(err.name === 'OperationError', 'entrada rechaza otra contraseña');
}

const dir = mkdtempSync(path.join(tmpdir(), 'fichas-entrada-'));
writeFileSync(path.join(dir, 'entrada.enc'), entrada.enc);
writeFileSync(path.join(dir, 'entrada.json'), JSON.stringify(entrada.formato));
const py = spawnSync('python3', ['-c', `
import gzip, hashlib, json, sys
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
password, carpeta = sys.argv[1], Path(sys.argv[2])
formato = json.loads((carpeta / "entrada.json").read_text())
enc = (carpeta / "entrada.enc").read_bytes()
assert hashlib.sha256(enc).hexdigest() == formato["sha256_datos_enc"]
k = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=bytes.fromhex(formato["sal_hex"]), iterations=formato["iteraciones"]).derive(password.encode())
plano = AESGCM(k).decrypt(bytes.fromhex(formato["iv_hex"]), enc, None)
assert plano[:4] == b"RPTB"
n = int.from_bytes(plano[8:12], "little")
indice = json.loads(gzip.decompress(plano[12:12+n]))
blob = plano[12+n:]
assert indice["tipo"] == "entrada"
for a in indice["archivos"]:
    b = blob[a["offset"]:a["offset"]+a["longitud"]]
    assert hashlib.sha256(b).hexdigest() == a["sha256"]
    assert b.startswith(b"%PDF-")
print("python_ok", len(indice["archivos"]))
`, claveApp, dir], { encoding: 'utf8' });
rmSync(dir, { recursive: true, force: true });
ok(py.status === 0 && py.stdout.includes('python_ok 2'), 'Python abre la entrada cifrada por el navegador');
if (py.status !== 0) fallos.push(`python ${py.stderr.split('\n').slice(-3).join(' ')}`);

const archivos = await leerPdfs([
  { name: 'uno.pdf', arrayBuffer: async () => pdfA.buffer.slice(pdfA.byteOffset, pdfA.byteOffset + pdfA.byteLength) },
]);
ok(archivos.length === 1 && archivos[0].nombre === 'uno.pdf', 'acepta un PDF');
let muchos = '';
try {
  await leerPdfs([1, 2, 3].map((n) => ({ name: `${n}.pdf`, arrayBuffer: async () => pdfA.buffer })));
  muchos = 'aceptó tres';
} catch (err) {
  muchos = err.message.includes('uno o dos') ? '' : err.message;
}
ok(!muchos, 'rechaza más de dos PDF');

ok(sanear(`fallo ${token} github_pat_abcdefghijklmnopqrstuvwxyz0123456789 ghp_abcdefghijklmnopqrstuvwxyz0123456789`, token) === 'fallo ••• ••• •••', 'el token se tapa en los errores');

const fases = ['clave', 'pdfs', 'subida', 'revisando', 'publicando', 'publicado', 'error', 'clave-app', 'informe'];
for (const fase of fases) {
  const html = htmlActualizar({
    fase,
    error: fase === 'error' ? 'La ejecución ha fallado.' : '',
    runUrl: 'https://github.com/ejemplo/fichas/actions/runs/1',
    texto: 'Revisando las fichas.',
    pideClaveApp: true,
    informe: {
      cambios: {
        fecha_anterior: '2026-11-01', fecha_actual: '2026-11-17',
        resumen: { altas: 1, bajas: 1, modificados: 1 },
        altas: [{ sap: '1000001', denominacion: 'Ejemplo de alta' }],
        bajas: [{ sap: '1000002', denominacion: 'Ejemplo de baja' }],
        modificados: [{ sap: '1000003', denominacion: 'Ejemplo', campos: [{ etiqueta: 'Brix', antes: '1', despues: '2' }] }],
      },
      doc: {
        revision: { avisos: ['Ejemplo de aviso.'] },
        incidencias_nuevas: [{ sap: '1000003', denominacion: 'Ejemplo', tipo: 'rango', campo: 'Brix', detalle: 'ejemplo' }],
        incidencias_resueltas: [],
      },
    },
  });
  ok(!html.includes(token), `la pantalla ${fase} no muestra el token`);
}
ok(htmlActualizar({ fase: 'informe', informe: { cambios: { resumen: {}, altas: [], bajas: [], modificados: [] }, doc: {} } }).includes('Aprobar y publicar'), 'el informe ofrece aprobar');
ok(htmlActualizar({ fase: 'informe', informe: { cambios: { resumen: {}, altas: [], bajas: [], modificados: [] }, doc: {} } }).includes('Descartar'), 'el informe ofrece descartar');
ok(htmlActualizar({ fase: 'error', error: 'La ejecución ha fallado.', runUrl: 'https://github.com/ejemplo/fichas/actions/runs/9' }).includes('actions/runs/9'), 'el fallo enlaza la ejecución');
ok(!htmlActualizar({ fase: 'error', error: 'x', runUrl: 'javascript:alert(1)' }).includes('javascript:'), 'no acepta un enlace que no sea de GitHub');
ok(mensajeFallo({ resultado: { codigo: 2 }, run: { html_url: 'https://github.com/ejemplo/fichas/actions/runs/2' } }).texto.includes('PDF'), 'el código 2 explica el PDF');
ok(mensajeFallo({ resultado: { codigo: 'base' }, run: {} }).texto.includes('cambiaron'), 'la base cambiada pide revisar otra vez');
ok(mensajeFallo({ resultado: { codigo: 1 }, run: { html_url: 'https://github.com/ejemplo/fichas/actions/runs/3' } }).texto.includes('fallado'), 'otro fallo es genérico');

const llamadas = [];
const fakeFetch = async (url, opciones = {}) => {
  llamadas.push({ url, method: opciones.method || 'GET', body: opciones.body, auth: opciones.headers?.Authorization || '' });
  const u = String(url);
  const json = (data, status = 200) => ({
    ok: status < 300, status,
    json: async () => data,
    arrayBuffer: async () => new ArrayBuffer(0),
  });
  if (u.includes('/releases?')) return json([]);
  if (u.includes('/git/ref/heads/actualizacion-pendiente')) return json({ message: 'Not Found' }, 404);
  if (u.includes('/git/refs/heads/actualizacion-pendiente') && opciones.method === 'DELETE') return json({ message: 'Reference does not exist' }, 422);
  if (u.endsWith('/git/blobs')) return json({ sha: `b${llamadas.length}` }, 201);
  if (u.endsWith('/git/trees')) return json({ sha: 't1' }, 201);
  if (u.endsWith('/git/commits')) return json({ sha: 'c1' }, 201);
  if (u.endsWith('/git/refs') && opciones.method === 'POST') return json({ ref: 'refs/heads/actualizacion-pendiente', object: { sha: 'c1' } }, 201);
  if (u.includes('/dispatches')) return json(null, 204);
  if (u.includes('/runs')) {
    return json({ workflow_runs: [{ id: 9, name: 'actualizar revisar aaaaaa', status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', created_at: new Date().toISOString(), html_url: 'https://github.com/ejemplo/fichas/actions/runs/9' }] });
  }
  return json({ message: 'no' }, 404);
};
const gh = crearCliente({ fetch: fakeFetch, token, repo });
const pendiente = await reemplazarPendiente(gh, [
  { nombre: 'entrada.enc', bytes: entrada.enc },
  { nombre: 'entrada.json', bytes: new TextEncoder().encode(JSON.stringify(entrada.formato)) },
]);
ok(pendiente.sha === 'c1', 'crea la rama actualizacion-pendiente');
ok(llamadas.every((c) => !String(c.url).includes('uploads.github.com')), 'no usa uploads.github.com (sin CORS)');
const commitBody = JSON.parse(llamadas.find((c) => String(c.url).endsWith('/git/commits')).body);
ok(Array.isArray(commitBody.parents) && commitBody.parents.length === 0, 'el commit pendiente no cuelga de main');
const refBody = JSON.parse(llamadas.find((c) => String(c.url).endsWith('/git/refs')).body);
ok(refBody.ref === 'refs/heads/actualizacion-pendiente', 'la rama es actualizacion-pendiente');
ok(llamadas.every((c) => !String(c.body || '').includes(token)), 'ningún cuerpo lleva el token');
ok(llamadas.every((c) => !c.auth || c.auth === `Bearer ${token}`), 'el token solo va en Authorization');
await gh.dispatch('revisar', 'aaaaaa');
ok(llamadas.some((c) => String(c.url).includes('/dispatches') && String(c.body).includes('"modo":"revisar"')), 'dispara revisar');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(path.join(root, '.github/workflows/actualizar-fichas.yml'), 'utf8');
ok(!workflow.includes('--conservar-trabajo'), 'el flujo no conserva el trabajo descifrado');
ok(!workflow.includes('echo "$PT_PASSWORD"') && !workflow.includes('echo ${PT_PASSWORD}'), 'el flujo no imprime la contraseña');
ok(workflow.includes('datos.enc formato.json') || workflow.includes('datos.enc') && workflow.includes('formato.json'), 'el flujo publica el paquete');
ok(workflow.includes('actualizacion-pendiente'), 'el flujo usa la rama pendiente');
ok(!workflow.includes('/releases'), 'el flujo ya no usa releases');

if (fallos.length) {
  console.error('FALLOS');
  for (const f of fallos) console.error(' -', f);
  process.exit(1);
}
console.log('pruebas de actualización completas');
