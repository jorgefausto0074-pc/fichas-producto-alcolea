// Comprueba el índice de materiales auxiliares sobre el paquete descifrado, sin imprimir datos ni la contraseña.
// Uso: PT_PASSWORD='…' node tests/materiales.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { abrirPaquete } from '../js/descifrar.js';
import {
  indexarMateriales, materialExacto, sugerirMateriales, materialesCompartidos, CAMPOS_MATERIAL, valorMaterial,
  filasMaterial, etiquetasMarca, porMarca, nombreSeguro,
} from '../js/materiales.js';
import { compactar } from '../js/util.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const password = process.env.PT_PASSWORD || '';
if (!password) { console.error('Falta PT_PASSWORD'); process.exit(1); }
const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); else console.log('ok', m); };

const formato = JSON.parse(fs.readFileSync(path.join(root, 'formato.json'), 'utf8'));
const enc = fs.readFileSync(path.join(root, 'datos.enc'));
const { doc } = await abrirPaquete(password, formato, enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength));
const ps = doc.productos;
const ix = indexarMateriales(ps);
const et = etiquetasMarca(ps);

// 1. Cada valor de casilla útil está en el índice, en su tipo y con su producto.
let refs = 0;
let todos = true;
for (const p of ps) {
  for (const [campo, tipo] of CAMPOS_MATERIAL) {
    const v = valorMaterial(p.diseno?.[campo]);
    if (!v) continue;
    refs += 1;
    if (!ix.porCodigo.get(v)?.tipos.get(tipo)?.has(p.codigo_sap)) todos = false;
  }
}
ok(todos && refs > 0, `las ${refs} casillas con código están en el índice`);
// 2. Sin guiones ni vacíos como código.
ok(![...ix.porCodigo.keys()].some((c) => !c || /^-+$/.test(c)), 'no hay códigos vacíos ni de guiones');
// 3. n = productos distintos; dentro de un tipo no se repite un producto.
ok(ix.lista.every((m) => m.n === new Set([...m.tipos.values()].flatMap((t) => [...t.keys()])).size), 'n = productos distintos por código');
// 4. Ningún código de material coincide con un SAP de producto (la búsqueda por SAP sigue igual).
const saps = new Set(ps.map((p) => p.codigo_sap));
ok(ix.lista.every((m) => !saps.has(m.codigo)), 'ningún código de material es un SAP de producto');
// 5. Búsqueda exacta y sugerencias.
ok(ix.lista.every((m) => materialExacto(ix, m.codigo, { minimo: 1 }) === m), 'cada código se encuentra a sí mismo (enlace ?mat=)');
ok(ix.lista.every((m) => sugerirMateriales(ix, m.codigo.slice(0, 3)).total >= 1 || compactar(m.codigo).length < 3), 'las sugerencias desde 3 dígitos encuentran cada código');
ok(sugerirMateriales(ix, '12').items.length === 0, 'menos de 3 caracteres no sugiere');
// 6. Compartidos: 2+ productos en el mismo tipo; filas del Excel = productos.
const comp = materialesCompartidos(ix);
ok(comp.length > 0 && comp.every((x) => x.n >= 2 && x.m.tipos.get(x.tipo).size === x.n), `compartidos (${comp.length}) con 2 o más productos`);
ok(comp.every((x, i) => i === 0 || comp[i - 1].n >= x.n), 'compartidos ordenados por número de productos');
ok(ix.lista.every((m) => filasMaterial(m, et).length === [...m.tipos.values()].reduce((s, t) => s + t.size, 0)), 'una fila de Excel por producto y tipo');
ok(ix.lista.every((m) => [...m.tipos.values()].every((t) => porMarca(t, et).reduce((s, g) => s + g.items.length, 0) === t.size)), 'la agrupación por marca no pierde productos');
ok(/^MATERIAL_[A-Za-z0-9-]+\.xlsx$/.test(nombreSeguro('MATERIAL', '4005529/30')) && nombreSeguro('X', 'Tapón') === 'X_Tapon.xlsx', 'nombres de archivo seguros');

if (fallos.length) { console.error('FALLOS:\n' + fallos.join('\n')); process.exit(1); }
console.log(`materiales OK · ${ix.lista.length} códigos · ${comp.length} compartidos`);
