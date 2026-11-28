// Ajuste de una zona, resumen de medidas y quitar de la comparación.
// La ficha de ejemplo usa los medios publicados de 1,5 L estándar. No toca datos.enc.

import { readFileSync } from 'fs';
import { calcularAjustado, filasResumen, formatoGramos, formatoPct, prepararFicha, repartoMayorResto, textoVariacion } from '../js/calculo.js';
import { tramosEscala } from '../js/maqueta.js';

const fallos = [];
function ok(cond, msg) {
  if (!cond) fallos.push(msg);
}

function zona(orden, clave, nombre, min, max, medio) {
  return { orden, clave, nombre, min, max, medio };
}

const estandar = {
  zonas: [
    zona(1, 'hombro', 'Hombro', 11.2, 12.2, 11.7),
    zona(2, 'zona1', 'Zona 1', 12.9, 13.9, 13.4),
    zona(3, 'base', 'Base / Fondo', 7, 8, 7.5),
  ],
};
const prep = prepararFicha(estandar);
const N = 3265;

function esperadoPct(fijoPct) {
  const otros = prep.pct.filter((_, i) => i !== 0);
  const resto = repartoMayorResto(otros, 10000 - fijoPct);
  const pct = [fijoPct, resto[0], resto[1]];
  const medios = repartoMayorResto(pct, N);
  return { pct, medios };
}

function esperadoGramos(fijoG) {
  const otros = prep.pct.filter((_, i) => i !== 0);
  const resto = repartoMayorResto(otros, N - fijoG);
  const medios = [fijoG, resto[0], resto[1]];
  return { medios, pct: repartoMayorResto(medios, 10000) };
}

const al37 = calcularAjustado(prep, N, { indice: 0, modo: 'pct', valor: 3700 });
const quiere37 = esperadoPct(3700);
ok(al37.ok && al37.ajustado, '37 % es un reparto ajustado');
ok(al37.sumaC === N && al37.filas.reduce((s, f) => s + f.medioC, 0) === N, 'con 37 % la suma es exactamente 32,65 g');
ok(al37.pct.reduce((s, p) => s + p, 0) === 10000, 'con 37 % los porcentajes suman 100,00');
ok(al37.pct[0] === 3700, 'el hombro queda en 37,00 %');
ok(al37.pct.every((p, i) => p === quiere37.pct[i]), 'el resto de % conserva la proporción original');
ok(al37.filas.every((f, i) => f.medioC === quiere37.medios[i]), 'los gramos salen de esos porcentajes');
ok(al37.filas[0].minC === al37.filas[0].medioC - (1170 - 1120), 'el mínimo conserva el margen en gramos');
ok(al37.filas[0].maxC === al37.filas[0].medioC + (1220 - 1170), 'el máximo conserva el margen en gramos');
ok(al37.filas[0].minMinC === al37.filas[0].minC - 20 && al37.filas[0].maxMaxC === al37.filas[0].maxC + 20, 'los extremos siguen a ±0,20 g');
for (let i = 0; i < prep.zonas.length; i += 1) {
  const linea = textoVariacion(prep, al37, i);
  ok(linea.despues === al37.filas[i].medioC, `el texto de la zona ${i} usa el mismo gramaje que la tabla`);
  ok(linea.pctDespues === al37.pct[i], `el texto de la zona ${i} usa el mismo % que la tabla`);
  ok(linea.texto.includes(`${formatoGramos(al37.filas[i].medioC)} g`), `la línea incluye ${formatoGramos(al37.filas[i].medioC)}`);
  ok(linea.texto.includes(`${formatoPct(al37.pct[i])} %`), `la línea incluye ${formatoPct(al37.pct[i])}`);
}
ok(textoVariacion(prep, al37, 0).texto.includes('37,00 %'), 'con el hombro al 37 % el texto no se queda en el % del patrón');

const al12 = calcularAjustado(prep, N, { indice: 0, modo: 'gramos', valor: 1200 });
const quiere12 = esperadoGramos(1200);
ok(al12.ok && al12.filas[0].medioC === 1200, 'el hombro queda en 12,00 g');
ok(al12.sumaC === N, 'con 12 g la suma es exactamente 32,65 g');
ok(al12.pct.reduce((s, p) => s + p, 0) === 10000, 'con 12 g los porcentajes suman 100,00');
ok(al12.filas.every((f, i) => f.medioC === quiere12.medios[i]), 'lo que queda de N se reparte con los % originales');
const cruce = al12.filas[1].medioC * prep.pct[2] - al12.filas[2].medioC * prep.pct[1];
ok(Math.abs(cruce) <= Math.max(prep.pct[1], prep.pct[2]), 'la proporción del resto se conserva salvo el resto de una centésima');

ok(calcularAjustado(prep, N, { indice: 0, modo: 'pct', valor: 0 }).ok === false, '0 % no se aplica');
ok(calcularAjustado(prep, N, { indice: 0, modo: 'pct', valor: 10000 }).ok === false, '100 % no se aplica');
ok(calcularAjustado(prep, N, { indice: 0, modo: 'gramos', valor: N }).ok === false, 'gramos iguales a N no se aplican');
ok(calcularAjustado(prep, N, { indice: 0, modo: 'gramos', valor: 0 }).ok === false, '0 g no se aplica');

const doc = {
  botellas: [
    {
      id: 'b1', nombre: 'Con gas 3', gas: 'con_gas', capacidad_l: '1,5',
      fichas: [{
        id: 's1', ficha_codigo: 'CG-3', gas: 'con_gas', capacidad_l: '1,5', cortes_cm: [11, 28],
        zonas: estandar.zonas,
      }],
    },
    {
      id: 'b2', nombre: 'Sin gas 2', gas: 'sin_gas', capacidad_l: '1',
      fichas: [{
        id: 's2', ficha_codigo: 'SG-2', gas: 'sin_gas', capacidad_l: '1', cortes_cm: [21.5],
        zonas: [
          zona(1, 'cuerpo', 'Cuerpo (campo Hombro)', 10, 12, 11),
          zona(2, 'base', 'Base / Fondo', 8, 10, 9),
        ],
      }],
    },
  ],
};
const bloques = filasResumen(doc);
ok(bloques.map((b) => b.gas).join(',') === 'con_gas,sin_gas', 'el resumen separa con gas y sin gas');
for (const bloque of bloques) {
  ok(bloque.n === bloque.filas.length, 'la media dice de cuántas fichas sale');
  for (const fila of bloque.filas) {
    const suma = fila.pct.reduce((s, v) => s + (v || 0), 0);
    ok(suma === 10000, `${fila.codigo} suma 100,00`);
  }
}
const sin = bloques[1].filas[0];
ok(sin.pct[1] == null && sin.pct[2] == null, 'la ficha sin zona 2 ni zona 1 deja esas celdas vacías');
ok(sin.pct[0] != null && sin.pct[3] != null, 'el cuerpo entra en Hombro y el fondo en su columna');

globalThis.localStorage = {
  dato: null,
  getItem() { return this.dato; },
  setItem(_k, v) { this.dato = v; },
};
const memoriaMod = await import('../js/memoria.js');
const memoria = memoriaMod.leerMemoria();
memoria.comparar = ['s1', 's2'];
memoriaMod.quitarComparada(memoria, 's1');
ok(memoriaMod.leerMemoria().comparar.join(',') === 's2', 'Quitar saca una ficha y deja la otra');
memoria.comparar = memoriaMod.leerMemoria().comparar;
memoria.comparar = [...memoria.comparar, 's3'].slice(-2);
memoriaMod.guardarMemoria(memoria);
ok(memoriaMod.leerMemoria().comparar.join(',') === 's2,s3', 'después de quitar se puede añadir otra ficha');
memoriaMod.vaciarComparacion(memoria);
ok(memoriaMod.leerMemoria().comparar.length === 0, 'Vaciar comparación deja la lista vacía');

const plano = JSON.parse(readFileSync(new URL('../maquetacion.json', import.meta.url), 'utf8'));
const ids = Object.keys(plano.botellas);
ok(ids.length === 13, 'hay una ficha de maquetación por botella');
for (const id of ids) {
  const b = plano.botellas[id];
  ok(b.altura_total_cm == null, `${id} no lleva una altura total inventada`);
  const quieto = tramosEscala({
    cortes: [11, 28], nZonas: 3, alturaTotalCm: b.altura_total_cm, bocaPct: b.boca_pct, basePct: b.base_pct,
  });
  ok(quieto.aEscala === false, `${id} sigue sin escala`);
}
const demo = tramosEscala({ cortes: [11, 28], nZonas: 3, alturaTotalCm: 32, bocaPct: 10, basePct: 90 });
ok(demo.aEscala === true, 'con altura total el ejemplo sí va a escala');
ok(Math.abs(demo.marcas[0].top - 20) < 1e-9, 'el corte de 28 cm cae donde toca');
ok(Math.abs(demo.marcas[1].top - (90 - (11 / 32) * 80)) < 1e-9, 'el corte de 11 cm cae donde toca');
ok(demo.marcas[0].cm === 28 && demo.marcas[1].cm === 11, 'las marcas conservan los cm');

if (fallos.length) {
  console.error(fallos.join('\n'));
  process.exit(1);
}
console.log('ajuste y resumen: 0 errores');
