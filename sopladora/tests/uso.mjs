// CSV, aviso de peso, entrada de N y suma exacta. No usa el paquete publicado.

import { botellaVisible } from '../js/buscar.js';
import { calcularNuevo, clasificarMedida, juicioMedida, prepararFicha, textoACentesimas } from '../js/calculo.js';
import { csvFicha, csvTurno } from '../js/csv.js';

const fallos = [];
function ok(cond, msg) {
  if (!cond) fallos.push(msg);
}

const coma = textoACentesimas('40,');
const punto = textoACentesimas('40.');
ok(coma.ok && coma.parcial && coma.centesimas === 4000, '40, debe valer 40,00 g');
ok(punto.ok && punto.parcial && punto.centesimas === 4000, '40. debe valer 40,00 g');
ok(textoACentesimas('40,4').centesimas === 4040, '40,4');
ok(textoACentesimas('0.5').centesimas === 50, '0.5');
ok(textoACentesimas('21.65').centesimas === 2165, '21.65');

ok(juicioMedida(850, 800, 900) === 'dentro', 'dentro de mínimo y máximo');
ok(juicioMedida(790, 800, 900) === 'fuera', 'fuera de mínimo y máximo');
ok(juicioMedida(770, 800, 900) === 'extremo', 'por debajo del extremo');
ok(juicioMedida(930, 800, 900) === 'extremo', 'por encima del extremo');
ok(clasificarMedida('0', 800, 900) === 'extremo', '0 g es valor extremo');
ok(clasificarMedida('7,90', 800, 900) === 'fuera', '7,90 g queda fuera de mínimo y máximo');
ok(clasificarMedida('', 800, 900) === 'vacio', 'sin peso medido no avisa');

const ficha = {
  zonas: [
    { orden: 1, clave: 'hombro', nombre: 'Hombro', min: 8, max: 10, medio: 9 },
    { orden: 2, clave: 'zona1', nombre: 'Etiqueta', min: 12.2, max: 14.2, medio: 13.2 },
    { orden: 3, clave: 'base', nombre: 'Fondo', min: 6, max: 8, medio: 7 },
  ],
};
const preparada = prepararFicha(ficha);
for (const n of [2165, 4000, 4040, 1, 9999]) {
  const nuevo = calcularNuevo(preparada, n);
  ok(nuevo.sumaC === n, `la suma de medios debe ser exactamente ${n}`);
  ok(nuevo.pct.reduce((a, b) => a + b, 0) === 10000, `los % de ${n} suman 100,00`);
}

const csv = csvFicha({
  titulo: '1,5 L prueba',
  filas: preparada.zonas.map((z, i) => ({ ...z, pct: preparada.pct[i] })),
});
ok(csv.includes('Zona;Mín;Medio;Máx;%'), 'cabecera CSV con punto y coma');
ok(csv.includes('13,20'), 'coma decimal');
ok(!csv.includes('13.20'), 'sin punto decimal');
ok(csv.split('\r\n').every((linea) => !linea.includes(',"') ), 'separador de columnas es ;');

const turnoCsv = csvTurno([{
  fecha: '28/11/2026 08:15:00',
  codigo: '1,5 L ESTANDAR-32,65',
  zona: 'Hombro',
  peso: '12,30',
  juicio: 'OK',
}]);
ok(turnoCsv.startsWith('Fecha;Ficha;Zona;Peso (g);Juicio'), 'cabecera del registro de turno');
ok(turnoCsv.includes('1,5 L ESTANDAR-32,65;Hombro;12,30;OK'), 'el turno separa con punto y coma');
ok(turnoCsv.includes('12,30') && !turnoCsv.includes('12.30'), 'el turno usa coma decimal');

const botella = {
  id: 'b1',
  nombre: '1,5 L Estándar',
  gas: 'sin_gas',
  capacidad_l: '0,5',
  fichas: [{ id: 's1', ficha_codigo: '0,5 L ESTANDAR-21,65', titulo_diapositiva: '' }],
};
const filtro = { gas: 'todas', capacidad: 'todas', gramosDe: () => '21,65' };
ok(botellaVisible(botella, { ...filtro, q: '21.65' }), 'el buscador acepta 21.65');
ok(botellaVisible(botella, { ...filtro, q: '0.5' }), 'el buscador acepta 0.5');

globalThis.localStorage = {
  dato: null,
  getItem() { return this.dato; },
  setItem(_k, v) { this.dato = v; },
};
const memoriaMod = await import('../js/memoria.js');
const memoria = memoriaMod.leerMemoria();
memoriaMod.recordarGramaje(memoria, 's1', '40,');
ok(memoriaMod.leerMemoria().gramajes.s1 === '40,', 'recuerda el último gramaje');
memoriaMod.anotarCalculo(memoria, { fecha: '2026-11-26T10:00:00.000Z', fichaId: 's1', codigo: 'PRUEBA', n: '40,00' });
memoriaMod.borrarHistorial(memoria, 0);
ok(memoriaMod.leerMemoria().historial.length === 0, 'se puede borrar el historial');
const medicion = {
  fecha: '28/11/2026 08:15:00', fichaId: 's1', codigo: 'PRUEBA', zona: 'Hombro', zonaClave: 'hombro', peso: '12,30', juicio: 'OK',
};
ok(memoriaMod.anotarMedicion(memoria, medicion) === true, 'guarda la medición del turno');
ok(memoriaMod.leerMemoria().turno.length === 1, 'el turno queda en este dispositivo');
ok(memoriaMod.anotarMedicion(memoria, { ...medicion, fecha: '28/11/2026 08:16:00' }) === false, 'no duplica la misma medición seguida');
ok(memoriaMod.leerMemoria().turno.length === 1, 'sigue habiendo una sola medición');
memoriaMod.borrarTurno(memoria);
ok(memoriaMod.leerMemoria().turno.length === 0, 'borrar el turno deja el registro vacío');

if (fallos.length) {
  console.error(fallos.join('\n'));
  process.exit(1);
}
console.log('uso: 0 errores');
