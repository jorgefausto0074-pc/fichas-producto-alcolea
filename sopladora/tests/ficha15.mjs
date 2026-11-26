// Ficha 15 ficticia. No se publica y no entra en datos.enc.

import { auditarDocumento } from '../js/auditar.js';
import { calcularNuevo, prepararFicha } from '../js/calculo.js';

function zona(orden, clave, nombre, min, max, medio) {
  return { orden, clave, nombre, min, max, medio };
}

const zonas = [
  zona(1, 'zona1', 'Etiqueta', 10, 12, 11),
  zona(2, 'hombro', 'Hombro', 4, 6, 5),
];
const suma = zonas.reduce((s, z) => s + z.medio, 0);
for (const z of zonas) z.pct_sobre_suma_zonas = (z.medio / suma) * 100;

const doc = {
  botellas: [{
    id: 'b20',
    nombre: 'Botella de prueba 3 L',
    gas: 'con_gas',
    capacidad_l: '3',
    imagen: 'assets/slide20_prueba.png',
    fichas: [{
      id: 's20-01',
      ficha_codigo: '3 L PRUEBA-16',
      gas: 'con_gas',
      capacidad_l: '3',
      n_zonas: 2,
      suma_medios_zonas: suma,
      cortes_cm: [12],
      peso_total_g: { min: 15, max: 17, medio: 16, min_min: 14.8, max_max: 17.2 },
      zonas,
    }],
  }],
};

const r = auditarDocumento(doc);
const fallos = [];
function ok(cond, msg) {
  if (!cond) fallos.push(msg);
  else console.log('ok', msg);
}

ok(r.fallos === 0, `ficha 15 ficticia: ${r.total} comprobaciones, ${r.fallos} errores`);
if (r.fallos) console.error(r.lista_fallos.slice(0, 12).join('\n'));
ok(r.hallazgos.some((h) => h.includes('capacidad')), 'la capacidad nueva avisa y no bloquea');
ok(r.hallazgos.some((h) => h.includes('orden de zonas')), 'el orden nuevo avisa y no bloquea');

const preparada = prepararFicha(doc.botellas[0].fichas[0]);
const nuevo = calcularNuevo(preparada, 2000);
ok(nuevo.sumaC === 2000, 'con N = 20,00 g la suma de zonas es exacta');
ok(nuevo.pct.reduce((a, b) => a + b, 0) === 10000, 'los % cierran a 100,00');

const rota = structuredClone(doc);
rota.botellas[0].fichas[0].zonas[0].min = 12;
rota.botellas[0].fichas[0].zonas[0].max = 10;
const mal = auditarDocumento(rota);
ok(mal.fallos > 0, 'un mínimo mayor que el máximo no pasa');

if (fallos.length) {
  console.error(fallos.join('\n'));
  process.exit(1);
}
console.log('ficha 15 de prueba correcta');
