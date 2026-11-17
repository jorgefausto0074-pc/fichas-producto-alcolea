// Verificación independiente (Node + WebCrypto) de un paquete datos.enc + formato.json con el descifrador de referencia.
// Uso: PT_PASSWORD=... node build/verifica_paquete.mjs <carpeta con datos.enc y formato.json> [ruta descifrar-referencia.mjs]
// Imprime un JSON con recuentos y comprobaciones; código de salida 1 si algo no cuadra. Nunca imprime la contraseña.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = resolve(process.argv[2] || '.');
const ref = resolve(process.argv[3] || resolve(dirname(fileURLToPath(import.meta.url)), 'descifrar-referencia.mjs'));
const { abrirPaquete } = await import(pathToFileURL(ref).href);
const password = process.env.PT_PASSWORD;
if (!password) { console.error('Falta PT_PASSWORD'); process.exit(2); }
const formato = JSON.parse(readFileSync(resolve(dir, 'formato.json'), 'utf8'));
const enc = readFileSync(resolve(dir, 'datos.enc'));
const errores = [];
const sha = createHash('sha256').update(enc).digest('hex');
if (sha !== formato.sha256_datos_enc) errores.push('sha256 de datos.enc no coincide con formato.json');
const t0 = Date.now();
const p = await abrirPaquete(password, formato, enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength));
const ms = Date.now() - t0;
const ps = p.doc.productos;
const porGrupo = {};
let refs = 0;
for (const x of ps) {
  porGrupo[x.grupo_pdf] = (porGrupo[x.grupo_pdf] || 0) + 1;
  for (const [casilla, h] of Object.entries(x.imagenes_sha256 || {})) {
    refs++;
    const m = p.imagenes[h];
    if (!m) { errores.push(`imagen sin entrada ${x.codigo_sap}/${casilla}`); continue; }
    const b = p.blob.subarray(m.offset, m.offset + m.longitud);
    if (createHash('sha256').update(b).digest('hex') !== h) errores.push(`imagen corrupta ${x.codigo_sap}/${casilla}`);
  }
}
const r = formato.recuentos;
if (ps.length !== r.productos) errores.push(`productos ${ps.length} ≠ ${r.productos}`);
if (refs !== r.referencias_imagen) errores.push(`referencias de imagen ${refs} ≠ ${r.referencias_imagen}`);
if (Object.keys(p.imagenes).length !== r.imagenes_unicas) errores.push('imágenes únicas no cuadran');
for (const [g, n] of Object.entries(r.por_grupo)) if (porGrupo[g] !== n) errores.push(`grupo ${g}: ${porGrupo[g]} ≠ ${n}`);
const c = p.cambios;
if (!c) errores.push("falta la clave 'cambios'");
else {
  const k = Object.keys(c).sort().join(',');
  if (k !== 'altas,bajas,fecha_actual,fecha_anterior,modificados,resumen') errores.push(`claves de cambios: ${k}`);
  for (const t of ['altas', 'bajas', 'modificados']) if (c.resumen[t] !== c[t].length) errores.push(`resumen.${t} no cuadra`);
}
let malaRechazada = false;
try { await abrirPaquete(password + 'x', formato, enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength)); } catch { malaRechazada = true; }
if (!malaRechazada) errores.push('contraseña incorrecta aceptada');
const out = {
  ok: errores.length === 0, sha256_datos_enc: sha, ms_descifrado: ms, productos: ps.length, por_grupo: porGrupo,
  referencias_imagen: refs, imagenes_unicas: Object.keys(p.imagenes).length, generado: p.doc.generado,
  fuentes: p.doc.fuentes.map((f) => f.pdf),
  cambios: c && { fecha_anterior: c.fecha_anterior, fecha_actual: c.fecha_actual, resumen: c.resumen,
    altas: c.altas.map((a) => a.sap), bajas: c.bajas.map((a) => a.sap),
    modificados: c.modificados.map((m) => ({ sap: m.sap, campos: m.campos.map((f) => `${f.ruta}: ${JSON.stringify(f.antes)} → ${JSON.stringify(f.despues)}`) })) },
  contrasena_incorrecta_rechazada: malaRechazada, errores,
};
console.log(JSON.stringify(out, null, 1));
process.exit(out.ok ? 0 : 1);
